/**
 * Certificates API
 * Handles certificate templates, creation, and redemption
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, notFound } = require('../../server/utils/response-helpers');
const pool = getPool();

/**
 * GET /api/certificates/templates
 * Get all active certificate templates
 */
async function getTemplates(req, res) {
  try {
    const result = await pool.query(`
      SELECT id, image_url, title, sort_order
      FROM certificate_templates
      WHERE is_active = TRUE
      ORDER BY sort_order ASC
    `);

    return success(res, { templates: result.rows });
  } catch (err) {
    console.error('Error fetching certificate templates:', err);
    return error(res, 'Ошибка при загрузке шаблонов сертификатов', 500);
  }
}

/**
 * POST /api/certificates/create
 * Create a new certificate (returns certificate data for cart)
 * Code is NOT generated here — it's generated after payment in the webhook.
 * A temporary placeholder code is used until payment confirms.
 * Body: { template_id, recipient_name, amount, user_id }
 */
async function createCertificate(req, res) {
  try {
    const { template_id, recipient_name, amount, user_id } = req.body;

    // Validation
    if (!template_id || !recipient_name || !amount) {
      console.warn('[certificates/create] Missing fields:', { template_id, recipient_name: !!recipient_name, amount });
      return badRequest(res, 'Все поля обязательны для заполнения');
    }

    if (amount < 10) {
      console.warn('[certificates/create] Amount too low:', amount);
      return badRequest(res, 'Минимальная сумма сертификата 10₽');
    }

    if (amount > 50000) {
      console.warn('[certificates/create] Amount too high:', amount);
      return badRequest(res, 'Максимальная сумма сертификата 50000₽');
    }

    if (recipient_name.length > 25) {
      console.warn('[certificates/create] Name too long:', recipient_name.length);
      return badRequest(res, 'Имя получателя не должно превышать 25 символов');
    }

    // Verify template exists
    const templateCheck = await pool.query(
      'SELECT id FROM certificate_templates WHERE id = $1 AND is_active = TRUE',
      [template_id]
    );

    if (templateCheck.rows.length === 0) {
      return notFound(res, 'Шаблон сертификата не найден');
    }

    // Use a temporary placeholder code — real code generated after payment
    const tempCode = `PENDING-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    // Create certificate (status pending until order is paid)
    const result = await pool.query(`
      INSERT INTO certificates (
        certificate_code,
        template_id,
        recipient_name,
        amount,
        purchaser_user_id,
        status
      ) VALUES ($1, $2, $3, $4, $5, 'pending')
      RETURNING id, template_id, recipient_name, amount
    `, [tempCode, template_id, recipient_name, amount, user_id || null]);

    const certificate = result.rows[0];

    // Get template details
    const templateResult = await pool.query(
      'SELECT image_url, title FROM certificate_templates WHERE id = $1',
      [template_id]
    );
    const template = templateResult.rows[0];

    return success(res, {
      certificate: {
        ...certificate,
        template_image: template.image_url,
        template_title: template.title
      }
    }, 201);
  } catch (err) {
    console.error('Error creating certificate:', err);
    return error(res, 'Ошибка при создании сертификата', 500);
  }
}

/**
 * GET /api/certificates/verify/:code
 * Verify a certificate code and get details (for redemption)
 */
async function verifyCertificate(req, res) {
  try {
    const { code } = req.params;

    // Strip dashes from input so users can enter with or without them
    const cleanCode = code.toUpperCase().replace(/-/g, '');

    const result = await pool.query(`
      SELECT
        c.id,
        c.certificate_code,
        c.recipient_name,
        c.amount,
        c.min_cart_amount,
        c.status,
        c.cert_image_url,
        c.redeemed_at,
        ct.title as template_title,
        ct.image_url as template_image
      FROM certificates c
      JOIN certificate_templates ct ON c.template_id = ct.id
      WHERE REPLACE(c.certificate_code, '-', '') = $1
    `, [cleanCode]);

    if (result.rows.length === 0) {
      return notFound(res, 'Сертификат с таким кодом не найден');
    }

    const certificate = result.rows[0];

    // Check if already redeemed
    if (certificate.status === 'redeemed') {
      return badRequest(res, 'Этот сертификат уже был использован', {
        redeemed_at: certificate.redeemed_at
      });
    }

    // Check if paid
    if (certificate.status !== 'paid' && certificate.status !== 'delivered') {
      return badRequest(res, 'Этот сертификат еще не оплачен');
    }

    return success(res, {
      certificate: {
        id: certificate.id,
        code: certificate.certificate_code,
        recipient_name: certificate.recipient_name,
        amount: certificate.amount,
        min_cart_amount: parseFloat(certificate.min_cart_amount) || 0,
        cert_image_url: certificate.cert_image_url,
        template_title: certificate.template_title,
        template_image: certificate.template_image
      }
    });
  } catch (err) {
    console.error('Error verifying certificate:', err);
    return error(res, 'Ошибка при проверке сертификата', 500);
  }
}

/**
 * GET /api/certificates/:id
 * Get certificate details by ID (admin only)
 */
async function getCertificate(req, res) {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT
        c.*,
        ct.title as template_title,
        ct.image_url as template_image,
        u_purchaser.first_name as purchaser_name,
        u_redeemed.first_name as redeemed_by_name,
        o_purchase.id as purchase_order_number,
        o_redeemed.id as redeemed_order_number
      FROM certificates c
      JOIN certificate_templates ct ON c.template_id = ct.id
      LEFT JOIN users u_purchaser ON c.purchaser_user_id = u_purchaser.id
      LEFT JOIN users u_redeemed ON c.redeemed_by_user_id = u_redeemed.id
      LEFT JOIN orders o_purchase ON c.purchase_order_id = o_purchase.id
      LEFT JOIN orders o_redeemed ON c.redeemed_in_order_id = o_redeemed.id
      WHERE c.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return notFound(res, 'Сертификат не найден');
    }

    return success(res, { certificate: result.rows[0] });
  } catch (err) {
    console.error('Error fetching certificate:', err);
    return error(res, 'Ошибка при загрузке сертификата', 500);
  }
}

/**
 * PUT /api/certificates/:id/image
 * Update image URL for a certificate (admin only)
 * Body: { cert_image_url }
 */
async function updateCertImageUrl(req, res) {
  try {
    const { id } = req.params;
    const { cert_image_url } = req.body;

    if (!cert_image_url) {
      return badRequest(res, 'Изображение обязательно');
    }

    const result = await pool.query(`
      UPDATE certificates
      SET cert_image_url = $1
      WHERE id = $2 AND delivery_type = 'pdf'
      RETURNING id, certificate_code, cert_image_url
    `, [cert_image_url, id]);

    if (result.rows.length === 0) {
      return notFound(res, 'Сертификат не найден или тип доставки не изображение');
    }

    return success(res, { certificate: result.rows[0] });
  } catch (err) {
    console.error('Error updating image URL:', err);
    return error(res, 'Ошибка при обновлении изображения', 500);
  }
}

/**
 * GET /api/certificates/user/:userId
 * Get all certificates for a specific user (both purchased and available to redeem)
 */
async function getUserCertificates(req, res) {
  try {
    const { userId } = req.params;

    const result = await pool.query(`
      SELECT
        c.id,
        c.certificate_code,
        c.recipient_name,
        c.amount,
        c.status,
        c.delivery_type,
        c.cert_image_url,
        c.created_at,
        c.paid_at,
        c.redeemed_at,
        ct.title as template_title,
        ct.image_url as template_image,
        CASE
          WHEN c.redeemed_by_user_id = $1 THEN 'redeemed'
          WHEN c.purchaser_user_id = $1 THEN 'purchased'
          ELSE 'unknown'
        END as relationship
      FROM certificates c
      JOIN certificate_templates ct ON c.template_id = ct.id
      WHERE c.purchaser_user_id = $1 OR c.redeemed_by_user_id = $1
      ORDER BY c.created_at DESC
    `, [userId]);

    return success(res, { certificates: result.rows });
  } catch (err) {
    console.error('Error fetching user certificates:', err);
    return error(res, 'Ошибка при загрузке сертификатов', 500);
  }
}

module.exports = {
  getTemplates,
  createCertificate,
  verifyCertificate,
  getCertificate,
  updateCertImageUrl,
  getUserCertificates
};
