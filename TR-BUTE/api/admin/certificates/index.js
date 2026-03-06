/**
 * Certificates Management API (Admin)
 * List all certificates, manage templates
 * GET /api/admin/certificates
 * GET/POST/PUT/DELETE /api/admin/certificates/templates
 */

const { getPool } = require('../../../lib/db');
const { success, error, badRequest, methodNotAllowed } = require('../../../server/utils/response-helpers');
const { generateTemplatePreview, generateAndUploadCertificateImage } = require('../../../lib/certificate-image');
const { sendNotification, sendAdminNotification, NotificationType } = require('../../../lib/notifications');
const axios = require('axios');
const config = require('../../../lib/config');

const pool = getPool();

/**
 * GET /api/admin/certificates - List all certificates
 */
async function listCertificates(req, res) {
  try {
    const { status, search } = req.query;

    let query = `
      SELECT
        c.id,
        c.certificate_code,
        c.recipient_name,
        c.amount,
        c.min_cart_amount,
        c.status,
        c.delivery_type,
        c.cert_image_url,
        c.created_at,
        c.paid_at,
        c.redeemed_at,
        c.purchase_order_id,
        c.redeemed_in_order_id,
        c.template_id,
        ct.title as template_title,
        ct.image_url as template_image,
        u_purchaser.first_name as purchaser_name,
        u_redeemed.first_name as redeemed_by_name
      FROM certificates c
      LEFT JOIN certificate_templates ct ON c.template_id = ct.id
      LEFT JOIN users u_purchaser ON c.purchaser_user_id = u_purchaser.id
      LEFT JOIN users u_redeemed ON c.redeemed_by_user_id = u_redeemed.id
    `;
    const conditions = [];
    const params = [];
    let paramCount = 1;

    if (status) {
      conditions.push(`c.status = $${paramCount++}`);
      params.push(status);
    }

    if (search) {
      conditions.push(`(c.certificate_code ILIKE $${paramCount} OR c.recipient_name ILIKE $${paramCount})`);
      params.push(`%${search}%`);
      paramCount++;
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY c.created_at DESC';

    const result = await pool.query(query, params);

    return success(res, { certificates: result.rows });
  } catch (err) {
    console.error('Error fetching certificates:', err);
    return error(res, 'Failed to fetch certificates', 500);
  }
}

/**
 * Certificate templates CRUD handler
 */
async function templatesHandler(req, res) {
  switch (req.method) {
    case 'GET':
      return handleGetTemplates(req, res);
    case 'POST':
      return handleCreateTemplate(req, res);
    case 'PUT':
      return handleUpdateTemplate(req, res);
    case 'DELETE':
      return handleDeleteTemplate(req, res);
    default:
      return methodNotAllowed(res, ['GET', 'POST', 'PUT', 'DELETE']);
  }
}

async function handleGetTemplates(req, res) {
  try {
    const result = await pool.query(`
      SELECT ct.*,
             (SELECT COUNT(*) FROM certificates WHERE template_id = ct.id) as certificate_count
      FROM certificate_templates ct
      ORDER BY ct.sort_order ASC
    `);

    return success(res, { templates: result.rows });
  } catch (err) {
    console.error('Error fetching certificate templates:', err);
    return error(res, 'Failed to fetch templates', 500);
  }
}

async function handleCreateTemplate(req, res) {
  try {
    const { title, image_url, sort_order, is_active } = req.body;

    if (!title) {
      return badRequest(res, 'Название обязательно');
    }

    const result = await pool.query(`
      INSERT INTO certificate_templates (title, image_url, sort_order, is_active)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [title, image_url || null, sort_order || 0, is_active !== false]);

    const template = result.rows[0];
    console.log(`[CERT] Created template: ${title} (id=${template.id})`);

    // Auto-generate preview image with placeholder values (async, don't block response)
    generateTemplatePreview(template.id, pool).catch(err => {
      console.error(`[CERT] Preview generation failed for template #${template.id}:`, err.message);
    });

    return success(res, { template }, 201);
  } catch (err) {
    console.error('Error creating certificate template:', err);
    return error(res, 'Failed to create template', 500);
  }
}

async function handleUpdateTemplate(req, res) {
  try {
    const { id, title, image_url, sort_order, is_active } = req.body;

    if (!id) {
      return badRequest(res, 'id is required');
    }

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramCount++}`);
      values.push(title);
    }

    if (image_url !== undefined) {
      updates.push(`image_url = $${paramCount++}`);
      values.push(image_url);
    }

    if (sort_order !== undefined) {
      updates.push(`sort_order = $${paramCount++}`);
      values.push(sort_order);
    }

    if (is_active !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(is_active);
    }

    if (updates.length === 0) {
      return badRequest(res, 'No fields to update');
    }

    values.push(id);

    const result = await pool.query(`
      UPDATE certificate_templates
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return badRequest(res, 'Template not found');
    }

    const template = result.rows[0];
    console.log(`[CERT] Updated template #${id}`);

    // If image_url was explicitly cleared or set to regenerate, auto-generate preview
    if (req.body.regenerate_preview) {
      generateTemplatePreview(template.id, pool).catch(err => {
        console.error(`[CERT] Preview regeneration failed for template #${template.id}:`, err.message);
      });
    }

    return success(res, { template });
  } catch (err) {
    console.error('Error updating certificate template:', err);
    return error(res, 'Failed to update template', 500);
  }
}

async function handleDeleteTemplate(req, res) {
  try {
    const { id } = req.query;

    if (!id) {
      return badRequest(res, 'id is required');
    }

    // Check if template has certificates
    const certResult = await pool.query('SELECT COUNT(*) FROM certificates WHERE template_id = $1', [id]);
    const certCount = parseInt(certResult.rows[0].count);
    if (certCount > 0) {
      return badRequest(res, `Нельзя удалить шаблон с ${certCount} сертификатами`);
    }

    const result = await pool.query('DELETE FROM certificate_templates WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return badRequest(res, 'Template not found');
    }

    console.log(`[CERT] Deleted template #${id}`);

    return success(res, { deleted: true, id: parseInt(id) });
  } catch (err) {
    console.error('Error deleting certificate template:', err);
    return error(res, 'Failed to delete template', 500);
  }
}

/**
 * POST /api/admin/certificates - Create a certificate manually (for promo campaigns)
 */
async function createCertificate(req, res) {
  try {
    const { recipient_name, amount, template_id, delivery_type, status, min_cart_amount } = req.body;

    if (!amount) {
      return badRequest(res, 'Сумма обязательна');
    }

    if (amount < 10 || amount > 50000) {
      return badRequest(res, 'Сумма должна быть от 10 до 50 000₽');
    }

    const minCartAmountValue = parseFloat(min_cart_amount) || 0;
    if (minCartAmountValue < 0) {
      return badRequest(res, 'Минимальная сумма корзины не может быть отрицательной');
    }

    // Recipient name is optional for admin-created certificates (e.g., giveaway codes)
    const recipientNameValue = recipient_name?.trim() || 'Сертификат';

    // Generate unique certificate code
    const code = generateCertificateCode();

    const result = await pool.query(`
      INSERT INTO certificates (certificate_code, recipient_name, amount, template_id, delivery_type, status, min_cart_amount, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *
    `, [
      code,
      recipientNameValue,
      amount,
      template_id || null,
      delivery_type || 'code',
      status || 'paid',
      minCartAmountValue
    ]);

    const logRecipient = recipient_name?.trim() ? recipient_name : '(без имени)';
    console.log(`[CERT] Admin manually created certificate: ${code} for ${logRecipient}, ${amount}₽`);

    return success(res, { certificate: result.rows[0] }, 201);
  } catch (err) {
    console.error('Error creating certificate:', err);
    return error(res, 'Failed to create certificate', 500);
  }
}

/**
 * PUT /api/admin/certificates/image - Set image URL for a certificate
 *
 * When the image URL is set on a cert that belongs to a cert-only order in on_hold,
 * automatically marks the order as delivered once ALL certs in that order have images.
 * Also sends the cert image to the user via their notification channel.
 */
async function updateCertificateImage(req, res) {
  try {
    const { id, cert_image_url } = req.body;

    if (!id || !cert_image_url) {
      return badRequest(res, 'id и cert_image_url обязательны');
    }

    const result = await pool.query(
      'UPDATE certificates SET cert_image_url = $1 WHERE id = $2 RETURNING id, certificate_code, cert_image_url, amount, recipient_name, purchase_order_id',
      [cert_image_url, id]
    );

    if (result.rows.length === 0) {
      return badRequest(res, 'Certificate not found');
    }

    const cert = result.rows[0];
    console.log(`[CERT] Updated image for certificate #${id}: ${cert_image_url}`);

    // Auto-deliver and notify user (async, don't block response)
    handleCertImageSet(cert).catch(err => {
      console.error(`[CERT] Post-image-set handling failed for cert #${id}:`, err.message);
    });

    return success(res, { certificate: { id: cert.id, certificate_code: cert.certificate_code, cert_image_url: cert.cert_image_url } });
  } catch (err) {
    console.error('Error updating certificate image:', err);
    return error(res, 'Failed to update certificate image', 500);
  }
}

/**
 * After a cert image is set (manual upload or regeneration):
 * 1. If cert belongs to a cert-only on_hold order and ALL certs now have images → mark delivered
 * 2. Send CERTIFICATE_DELIVERED notification (cert image ready)
 * 3. Send the cert image directly via Telegram/MAX bot
 */
async function handleCertImageSet(cert) {
  if (!cert.purchase_order_id) return;

  const APP_URL = process.env.APP_URL || 'https://buy-tribute.com';

  // Get order + user info
  const orderResult = await pool.query(`
    SELECT o.id, o.status, o.user_id,
           u.telegram_id, u.vk_id, u.max_id, u.email, u.login_method
    FROM orders o
    LEFT JOIN users u ON o.user_id = u.id
    WHERE o.id = $1
  `, [cert.purchase_order_id]);

  if (orderResult.rows.length === 0) return;
  const order = orderResult.rows[0];

  // Determine if cert-only order
  const nonCertResult = await pool.query(
    `SELECT COUNT(*) FROM order_items WHERE order_id = $1 AND certificate_id IS NULL AND deleted_by_admin IS NOT TRUE`,
    [order.id]
  );
  const isCertOnly = parseInt(nonCertResult.rows[0].count) === 0;

  // Check if cert-only order should be auto-delivered
  if (order.status === 'on_hold' && isCertOnly) {
    const missingImages = await pool.query(
      `SELECT COUNT(*) FROM certificates WHERE purchase_order_id = $1 AND status IN ('paid', 'delivered') AND cert_image_url IS NULL`,
      [order.id]
    );
    if (parseInt(missingImages.rows[0].count) === 0) {
      await pool.query(
        `UPDATE orders SET status = 'delivered', updated_at = NOW() WHERE id = $1`,
        [order.id]
      );
      console.log(`[CERT] Cert-only order ${order.id} auto-delivered after all images uploaded`);
    }
  }

  // Send CERTIFICATE_DELIVERED notification (cert image ready)
  try {
    await sendNotification({
      type: NotificationType.CERTIFICATE_DELIVERED,
      data: {
        orderId: order.id,
        certificateCode: cert.certificate_code,
        recipientName: cert.recipient_name,
        certImageUrl: cert.cert_image_url,
        isCertOnly
      },
      link: `${APP_URL}/order/${order.id}`,
      linkText: 'Открыть заказ',
      userTelegramId: order.telegram_id,
      userVkId: order.vk_id,
      userMaxId: order.max_id,
      userEmail: order.email
    });
    console.log(`[CERT] Certificate ready notification sent for cert #${cert.id}`);
  } catch (err) {
    console.error(`[CERT] Failed to send cert ready notification:`, err.message);
  }

  // Send cert image directly via bot (in addition to the notification)
  if (cert.cert_image_url) {
    if (order.telegram_id) {
      try {
        const botToken = config.auth.telegram.userBotToken;
        if (botToken) {
          await axios.post(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
            chat_id: order.telegram_id,
            photo: cert.cert_image_url,
            caption: `Сертификат на ${cert.amount} ₽ — код: ${cert.certificate_code}`
          });
          console.log(`[CERT] Cert image sent to Telegram ${order.telegram_id}`);
        }
      } catch (err) {
        console.error(`[CERT] Failed to send cert image to Telegram:`, err.message);
      }
    } else if (order.max_id) {
      try {
        const botToken = config.maxBotToken;
        if (botToken) {
          await axios.post(`https://platform-api.max.ru/messages?chat_id=${order.max_id}`, {
            attachments: [{ type: 'image', payload: { url: cert.cert_image_url } }]
          }, { headers: { Authorization: botToken, 'Content-Type': 'application/json' } });
          console.log(`[CERT] Cert image sent to MAX ${order.max_id}`);
        }
      } catch (err) {
        console.error(`[CERT] Failed to send cert image to MAX:`, err.message);
      }
    }
    // Email users: image is already embedded in the CERTIFICATE_DELIVERED notification email
  }
}

/**
 * PUT /api/admin/certificates/:id - Update a certificate's editable fields
 */
async function updateCertificate(req, res) {
  try {
    const { id } = req.params;
    const { status, recipient_name, amount, min_cart_amount, delivery_type } = req.body;

    if (!id) return badRequest(res, 'id is required');

    const VALID_STATUSES = ['pending', 'paid', 'delivered', 'redeemed'];
    if (status && !VALID_STATUSES.includes(status)) {
      return badRequest(res, `Invalid status. Valid: ${VALID_STATUSES.join(', ')}`);
    }

    if (amount !== undefined && (amount < 10 || amount > 50000)) {
      return badRequest(res, 'Amount must be between 10 and 50000');
    }

    const setClauses = [];
    const params = [];
    let paramIdx = 1;

    if (status !== undefined) { setClauses.push(`status = $${paramIdx++}`); params.push(status); }
    if (recipient_name !== undefined) { setClauses.push(`recipient_name = $${paramIdx++}`); params.push(recipient_name); }
    if (amount !== undefined) { setClauses.push(`amount = $${paramIdx++}`); params.push(amount); }
    if (min_cart_amount !== undefined) { setClauses.push(`min_cart_amount = $${paramIdx++}`); params.push(min_cart_amount); }
    if (delivery_type !== undefined) { setClauses.push(`delivery_type = $${paramIdx++}`); params.push(delivery_type); }

    if (setClauses.length === 0) return badRequest(res, 'No fields to update');

    params.push(id);
    const result = await pool.query(
      `UPDATE certificates SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING id, certificate_code, status, recipient_name, amount, min_cart_amount, delivery_type`,
      params
    );

    if (result.rows.length === 0) return badRequest(res, 'Certificate not found');

    return success(res, { certificate: result.rows[0] });
  } catch (err) {
    console.error('Error updating certificate:', err);
    return error(res, 'Failed to update certificate', 500);
  }
}

/**
 * DELETE /api/admin/certificates/:id - Delete a certificate
 * Only allowed for pending certificates or with force flag
 */
async function deleteCertificate(req, res) {
  try {
    const { id } = req.params;
    if (!id) return badRequest(res, 'id is required');

    const certResult = await pool.query('SELECT id, status, certificate_code FROM certificates WHERE id = $1', [id]);
    if (certResult.rows.length === 0) return badRequest(res, 'Certificate not found');

    const cert = certResult.rows[0];
    if (cert.status === 'redeemed') {
      return badRequest(res, 'Cannot delete a redeemed certificate');
    }

    await pool.query('DELETE FROM certificates WHERE id = $1', [id]);

    console.log(`[CERT] Admin deleted certificate #${id} (${cert.certificate_code})`);
    return success(res, { deleted: true, id: parseInt(id) });
  } catch (err) {
    console.error('Error deleting certificate:', err);
    return error(res, 'Failed to delete certificate', 500);
  }
}

/**
 * POST /api/admin/certificates/:id/regenerate-image
 * Re-generates and re-uploads the certificate image for a paid certificate.
 * Useful for fixing certificates that were paid but ended up with cert_image_url = null.
 */
async function regenerateImage(req, res) {
  try {
    const { id } = req.params;
    if (!id) return badRequest(res, 'id is required');

    const certResult = await pool.query(
      `SELECT id, template_id, recipient_name, amount, certificate_code, status, purchase_order_id
       FROM certificates WHERE id = $1`,
      [id]
    );

    if (certResult.rows.length === 0) return badRequest(res, 'Certificate not found');

    const cert = certResult.rows[0];

    if (!cert.certificate_code) {
      return badRequest(res, 'Certificate has no code (not yet paid)');
    }

    console.log(`[CERT] Admin triggered image regeneration for cert #${id} (status=${cert.status})`);

    const url = await generateAndUploadCertificateImage(cert, pool);

    if (!url) {
      return error(res, `No background image found for template ${cert.template_id}`, 422);
    }

    // Auto-deliver and notify user if needed (async, don't block response)
    handleCertImageSet({ ...cert, cert_image_url: url, purchase_order_id: cert.purchase_order_id }).catch(err => {
      console.error(`[CERT] Post-regeneration handling failed for cert #${id}:`, err.message);
    });

    return success(res, { cert_image_url: url, id: parseInt(id) });
  } catch (err) {
    console.error('Error regenerating certificate image:', err);
    return error(res, `Image regeneration failed: ${err.message}`, 500);
  }
}

/**
 * Generate a short, user-friendly certificate code: XXXX-XXXX
 * Uses characters that avoid confusion (no 0/O, 1/I/L)
 */
function generateCertificateCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let part1 = '';
  let part2 = '';
  for (let i = 0; i < 4; i++) {
    part1 += chars.charAt(Math.floor(Math.random() * chars.length));
    part2 += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${part1}-${part2}`;
}

module.exports = {
  listCertificates,
  templatesHandler,
  createCertificate,
  updateCertificateImage,
  updateCertificate,
  deleteCertificate,
  regenerateImage
};
