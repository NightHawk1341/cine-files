/**
 * Notification System Abstraction
 *
 * Provides unified notification interface that routes to Telegram or Email
 * based on deployment mode configuration.
 *
 * Telegram: Casual, emoji-rich, HTML formatted
 * Email: Professional, clean HTML, formal tone
 */

const axios = require('axios');
const config = require('./config');
const { trackEmailSent, trackEmailFailed } = require('./emailStats');
const postbox = require('./postbox');
const { getSessionStore } = require('./session-store');
const { applyCustomEmoji, escapeHtml } = require('./tg-emoji');

/**
 * Notification types for typed notifications
 */
const NotificationType = {
  ORDER_CREATED: 'order_created',
  ORDER_CREATED_CERT_ONLY: 'order_created_cert_only',
  ORDER_CREATED_CERT_MIXED: 'order_created_cert_mixed',
  ORDER_CONFIRMED: 'order_confirmed',
  DELIVERY_COST_ADDED: 'delivery_cost_added',
  PAYMENT_RECEIVED: 'payment_received',
  ORDER_SHIPPED: 'order_shipped',
  ORDER_CANCELLED: 'order_cancelled',
  PRODUCT_AVAILABLE: 'product_available',
  CONTACT_REQUEST: 'contact_request',
  REFUND_PROCESSED: 'refund_processed',
  ADMIN_RESPONSE: 'admin_response',
  PARCEL_AT_PICKUP_POINT: 'parcel_at_pickup_point',
  STORAGE_PICKUP_REMINDER: 'storage_pickup_reminder',
  PARCEL_RETURNED_TO_SENDER: 'parcel_returned_to_sender',
  CERTIFICATE_DELIVERED: 'certificate_delivered'
};

/**
 * Generate Telegram message content (casual, emoji-rich)
 * Uses DB overrides when available, falls back to registry defaults.
 *
 * @param {string} type - NotificationType value
 * @param {Object} data - Template data
 * @param {Object} [overrides] - Pre-loaded DB overrides (optional, for async callers)
 */
function getTelegramContent(type, data, overrides) {
  const { orderId, totalPrice, deliveryCost, trackingNumber, productTitle, customMessage, refundAmount } = data;

  // Prepare common variable data for template substitution
  // Unsafe string fields are HTML-escaped since messages use parse_mode: 'HTML'
  const vars = {
    orderId,
    totalPrice,
    deliveryCost,
    refundAmount,
    trackingNumber: escapeHtml(trackingNumber),
    productTitle:   escapeHtml(productTitle),
    customMessage:  escapeHtml(customMessage),
  };

  // If we have overrides and this type has a telegram override, use template system
  if (overrides && overrides[type]?.telegram) {
    const title = getFieldValue(overrides, type, 'telegram', 'title');
    let message = getFieldValue(overrides, type, 'telegram', 'message');

    // Special handling for types with complex logic
    if (type === NotificationType.CONTACT_REQUEST && customMessage) {
      return { title: applyTemplateVariables(title, vars), message: escapeHtml(customMessage) };
    }
    if (type === NotificationType.ORDER_SHIPPED && trackingNumber) {
      message = message.replace(/$/,`\n\nТрек-номер: ${escapeHtml(trackingNumber)}`);
    }
    if (type === NotificationType.ADMIN_RESPONSE) {
      const { responseText, reviewType } = data;
      const typeLabel = reviewType === 'review' ? 'рецензию' : reviewType === 'comment' ? 'комментарий' : 'предложение';
      const productSuffix = productTitle ? ` к &quot;${escapeHtml(productTitle)}&quot;` : '';
      vars.typeLabel = typeLabel;
      vars.productSuffix = productSuffix;
      vars.responseText = escapeHtml(responseText);
    }
    // For order-created types with two delivery-calculation variants, pick the matching field
    if ((type === NotificationType.ORDER_CREATED || type === NotificationType.ORDER_CREATED_CERT_MIXED) && data.isAutoCalculated) {
      message = getFieldValue(overrides, type, 'telegram', 'messageAuto') || message;
    }

    return {
      title: applyTemplateVariables(title, vars),
      message: applyTemplateVariables(message, vars)
    };
  }

  // Hardcoded defaults (original behavior)
  switch (type) {
    case NotificationType.ORDER_CREATED:
      return {
        title: 'Заказ принят!',
        message: data.isAutoCalculated
          ? `Заказ #${orderId} успешно создан!\n\nСтоимость доставки уже рассчитана. Вы можете оплатить заказ прямо сейчас.`
          : `Заказ #${orderId} успешно создан!\n\nМы проверим заказ и рассчитаем стоимость доставки. Вы получите уведомление с итоговой суммой.`
      };

    case NotificationType.ORDER_CREATED_CERT_ONLY:
      return {
        title: 'Заказ принят!',
        message: `Заказ #${orderId} успешно создан!\n\nПосле оплаты вы получите код сертификата.`
      };

    case NotificationType.ORDER_CREATED_CERT_MIXED:
      return {
        title: 'Заказ принят!',
        message: data.isAutoCalculated
          ? `Заказ #${orderId} успешно создан!\n\nСтоимость доставки рассчитана. После оплаты вы получите сертификаты.`
          : `Заказ #${orderId} успешно создан!\n\nМы рассчитаем стоимость доставки в ближайшее время. Сертификаты будут отправлены после оплаты.`
      };

    case NotificationType.ORDER_CONFIRMED:
      return {
        title: 'Заказ подтверждён',
        message: `Заказ #${orderId} подтверждён и ожидает оплаты.\n\nИтого к оплате: ${totalPrice} руб.\n\nПожалуйста, оплатите заказ в ближайшее время.`
      };

    case NotificationType.DELIVERY_COST_ADDED:
      return {
        title: 'Доставка рассчитана',
        message: `Заказ #${orderId}\n\nСтоимость доставки: ${deliveryCost} руб.\nИтого к оплате: ${totalPrice} руб.\n\nПерейдите к оплате заказа.`
      };

    case NotificationType.PAYMENT_RECEIVED: {
      const { certificates, isCertOnly } = data;
      const hasCerts = certificates && certificates.length > 0;

      if (!hasCerts) {
        return {
          title: 'Оплата получена!',
          message: `Заказ #${orderId} успешно оплачен!\n\nМы начали подготовку вашего заказа. Уведомим вас об отправке.`
        };
      }

      const allHaveImages = certificates.every(c => c.certImageUrl);

      let certBlock = '';
      for (const cert of certificates) {
        certBlock += `\n\nСертификат`;
        if (certificates.length > 1) certBlock += ` (${Number(cert.amount)} ₽)`;
        if (cert.recipientName) certBlock += `\nПолучатель: ${escapeHtml(cert.recipientName)}`;
        certBlock += `\n<b>Код:</b> <code>${escapeHtml(cert.certificateCode)}</code>`;
      }

      const imageNote = allHaveImages ? '' : '\n\nИзображение сертификата будет готово в ближайшее время — мы пришлём его отдельным сообщением.';

      if (isCertOnly) {
        if (allHaveImages) {
          return {
            title: 'Оплата получена!',
            message: `Заказ #${orderId} оплачен — ваш сертификат готов!${certBlock}\n\nПередайте код получателю или используйте при оформлении следующего заказа.`
          };
        }
        return {
          title: 'Оплата получена!',
          message: `Заказ #${orderId} оплачен!${certBlock}\n\nПередайте код получателю или используйте при оформлении следующего заказа.${imageNote}`
        };
      }

      return {
        title: 'Оплата получена!',
        message: `Заказ #${orderId} успешно оплачен!${certBlock}${imageNote}\n\nМы начали подготовку вашего заказа. Уведомим вас об отправке.`
      };
    }

    case NotificationType.ORDER_SHIPPED:
      return {
        title: 'Заказ отправлен!',
        message: `Заказ #${orderId} в пути!${trackingNumber ? `\n\nТрек-номер: ${escapeHtml(trackingNumber)}` : ''}\n\nОтслеживайте доставку на сайте транспортной компании.`
      };

    case NotificationType.ORDER_CANCELLED:
      return {
        title: 'Заказ отменён',
        message: `Заказ #${orderId} был отменён.\n\nЕсли у вас есть вопросы, свяжитесь с нами через FAQ.`
      };

    case NotificationType.PRODUCT_AVAILABLE:
      return {
        title: 'Товар в продаже!',
        message: `${escapeHtml(productTitle)}\n\nТовар, на который вы подписались, теперь доступен для покупки!`
      };

    case NotificationType.CONTACT_REQUEST:
      return {
        title: 'Свяжитесь с нами',
        message: customMessage ? escapeHtml(customMessage) : `По вашему заказу #${orderId} требуется связь с поддержкой.`
      };

    case NotificationType.REFUND_PROCESSED:
      return {
        title: 'Возврат оформлен',
        message: `Возврат по заказу #${orderId} на сумму ${refundAmount} руб. успешно оформлен.\n\nСредства поступят на ваш счёт в течение нескольких дней.`
      };

    case NotificationType.ADMIN_RESPONSE: {
      const { responseText, reviewType } = data;
      const typeLabel = reviewType === 'review' ? 'рецензию' : reviewType === 'comment' ? 'комментарий' : 'предложение';
      return {
        title: 'Ответ магазина',
        message: `Ответ на вашу ${typeLabel}${productTitle ? ` к &quot;${escapeHtml(productTitle)}&quot;` : ''}:\n\n${escapeHtml(responseText)}`
      };
    }

    case NotificationType.PARCEL_AT_PICKUP_POINT: {
      const { storageDays, providerName } = data;
      return {
        title: 'Посылка ждёт вас!',
        message: `Заказ #${orderId} прибыл в пункт выдачи ${providerName ? `(${escapeHtml(providerName)})` : ''}.\n\nСрок хранения: ${storageDays} дней.\n\nЗаберите посылку вовремя, чтобы избежать возврата.\n\nБудем рады вашему отзыву — он поможет другим покупателям!`
      };
    }

    case NotificationType.STORAGE_PICKUP_REMINDER: {
      const { daysLeft, providerName } = data;
      return {
        title: 'Напоминание о посылке',
        message: `Заказ #${orderId} всё ещё ждёт вас в пункте выдачи ${providerName ? `(${escapeHtml(providerName)})` : ''}.\n\nОсталось дней хранения: ${daysLeft}.\n\nПожалуйста, заберите посылку как можно скорее.`
      };
    }

    case NotificationType.PARCEL_RETURNED_TO_SENDER: {
      const { deliveryCost } = data;
      const retryCost = deliveryCost ? `${deliveryCost * 2} руб. (двойная стоимость доставки)` : 'двойная стоимость доставки';
      return {
        title: 'Посылка возвращена',
        message: `Заказ #${orderId} был возвращён отправителю, так как не был получен вовремя.\n\nУ вас два варианта:\n1. Повторная доставка — ${retryCost}\n2. Отмена заказа — возврат стоимости товаров (без доставки)\n\nПожалуйста, перейдите в заказ и выберите вариант.`
      };
    }

    case NotificationType.CERTIFICATE_DELIVERED: {
      const { certificateCode, recipientName, isCertOnly } = data;
      if (isCertOnly) {
        return {
          title: 'Изображение сертификата готово!',
          message: `Изображение сертификата по заказу #${orderId} готово.${recipientName ? `\nПолучатель: ${escapeHtml(recipientName)}` : ''}\n\n<b>Код:</b> <code>${escapeHtml(certificateCode)}</code>\n\nВаш заказ выполнен!`
        };
      }
      return {
        title: 'Изображение сертификата готово!',
        message: `Изображение сертификата по заказу #${orderId} готово.${recipientName ? `\nПолучатель: ${escapeHtml(recipientName)}` : ''}\n\n<b>Код:</b> <code>${escapeHtml(certificateCode)}</code>`
      };
    }

    default:
      return null;
  }
}

/**
 * Generate Email content (professional, styled for dark theme)
 * Uses DB overrides when available, falls back to registry defaults.
 *
 * @param {string} type - NotificationType value
 * @param {Object} data - Template data
 * @param {Object} [overrides] - Pre-loaded DB overrides (optional, for async callers)
 */
function getEmailContent(type, data, overrides) {
  const { orderId, totalPrice, deliveryCost, trackingNumber, productTitle, customMessage, refundAmount } = data;

  // Styled info box for order details
  const infoBox = (rows) => `
    <table style="margin: 24px 0; border-collapse: collapse; background: #1e1e1e; border-radius: 8px; width: 100%;">
      ${rows.map(([label, value, highlight]) => `
        <tr>
          <td style="padding: 12px 16px; color: #a3a3a3; border-bottom: 1px solid #2b2b2b;">${label}</td>
          <td style="padding: 12px 16px; color: ${highlight ? '#ff9500' : '#E0E0E0'}; font-weight: ${highlight ? '600' : '400'}; text-align: right; border-bottom: 1px solid #2b2b2b;">${value}</td>
        </tr>
      `).join('')}
    </table>
  `;

  const vars = { orderId, totalPrice, deliveryCost, trackingNumber, productTitle, customMessage, refundAmount };

  // If we have overrides for this type's email, use template system
  if (overrides && overrides[type]?.email) {
    const subject = applyTemplateVariables(getFieldValue(overrides, type, 'email', 'subject'), vars);
    const heading = getFieldValue(overrides, type, 'email', 'heading');
    const body = getFieldValue(overrides, type, 'email', 'body');
    const footer = getFieldValue(overrides, type, 'email', 'footer');

    // Build HTML from editable parts + structural elements
    let htmlParts = [];
    if (heading) htmlParts.push(`<p style="margin-bottom: 16px;">${applyTemplateVariables(heading, vars)}</p>`);

    // Type-specific structural elements (info boxes, blockquotes — not editable)
    if (type === NotificationType.ORDER_CONFIRMED) {
      htmlParts.push(infoBox([['Сумма к оплате', `${totalPrice} ₽`, true]]));
    } else if (type === NotificationType.DELIVERY_COST_ADDED) {
      htmlParts.push(infoBox([['Доставка', `${deliveryCost} ₽`, false], ['Итого к оплате', `${totalPrice} ₽`, true]]));
    } else if (type === NotificationType.ORDER_SHIPPED && trackingNumber) {
      htmlParts.push(infoBox([['Трек-номер', trackingNumber, true]]));
    } else if (type === NotificationType.REFUND_PROCESSED) {
      htmlParts.push(infoBox([['Сумма возврата', `${refundAmount} ₽`, true]]));
    } else if (type === NotificationType.PRODUCT_AVAILABLE) {
      htmlParts.push(`<p style="font-size: 20px; font-weight: 600; color: #ff9500; margin: 24px 0; padding: 20px; background: #1e1e1e; border-radius: 8px; text-align: center;">${productTitle}</p>`);
    } else if (type === NotificationType.ADMIN_RESPONSE) {
      const { responseText, reviewType } = data;
      vars.responseText = responseText;
      vars.typeLabel = reviewType === 'review' ? 'рецензию' : reviewType === 'comment' ? 'комментарий' : 'предложение';
      vars.productSuffix = productTitle ? ` к товару "<strong style="color: #ff9500;">${productTitle}</strong>"` : '';
      htmlParts = [`<p style="margin-bottom: 16px;">${applyTemplateVariables(heading, vars)}</p>`];
      htmlParts.push(`<blockquote style="margin: 24px 0; padding: 20px; background: #1e1e1e; border-left: 4px solid #ff9500; border-radius: 0 8px 8px 0; font-style: italic; color: #E0E0E0;">${responseText}</blockquote>`);
    } else if (type === NotificationType.CONTACT_REQUEST && customMessage) {
      htmlParts = [`<p style="margin-bottom: 16px;">${customMessage}</p>`];
    }

    // Body text: pick variant based on type-specific logic
    if (type === NotificationType.ORDER_SHIPPED) {
      const bodyText = trackingNumber
        ? applyTemplateVariables(getFieldValue(overrides, type, 'email', 'bodyWithTracking'), vars)
        : applyTemplateVariables(body, vars);
      htmlParts.push(`<p style="color: #a3a3a3;">${bodyText}</p>`);
    } else if (type === NotificationType.ORDER_CREATED || type === NotificationType.ORDER_CREATED_CERT_MIXED) {
      // Pick manual or auto-calculated delivery variant
      const bodyField = data.isAutoCalculated ? 'bodyAuto' : 'body';
      const bodyText = getFieldValue(overrides, type, 'email', bodyField);
      if (bodyText) htmlParts.push(`<p style="color: #a3a3a3;">${applyTemplateVariables(bodyText, vars)}</p>`);
    } else if (body && type !== NotificationType.ADMIN_RESPONSE) {
      htmlParts.push(`<p style="color: #a3a3a3;">${applyTemplateVariables(body, vars)}</p>`);
    }

    if (footer) {
      htmlParts.push(`<p style="color: #ff9500; margin-top: 16px;">${applyTemplateVariables(footer, vars)}</p>`);
    }

    // Plain text fallback
    const textParts = [heading, body].filter(Boolean).map(t => applyTemplateVariables(t, vars).replace(/<[^>]+>/g, ''));

    return { subject, html: htmlParts.join('\n'), text: textParts.join('\n\n') };
  }

  // Hardcoded defaults (original behavior)
  switch (type) {
    case NotificationType.ORDER_CREATED: {
      const isAuto = data.isAutoCalculated;
      return {
        subject: `Заказ #${orderId} принят`,
        html: `
          <p style="margin-bottom: 16px;">Ваш заказ <strong style="color: #ff9500;">#${orderId}</strong> успешно создан и принят в обработку.</p>
          <p style="color: #a3a3a3;">${isAuto
            ? 'Стоимость доставки уже рассчитана. Вы можете оплатить заказ прямо сейчас на странице заказа.'
            : 'В ближайшее время мы проверим заказ и рассчитаем стоимость доставки. После этого вы получите уведомление с итоговой суммой и ссылкой на оплату.'
          }</p>
          <p style="color: #a3a3a3; margin-top: 16px;">Вы можете отслеживать статус заказа в личном кабинете.</p>
        `,
        text: `Ваш заказ #${orderId} успешно создан и принят в обработку.\n\n${isAuto
          ? 'Стоимость доставки уже рассчитана. Вы можете оплатить заказ прямо сейчас.'
          : 'В ближайшее время мы проверим заказ и рассчитаем стоимость доставки.'}`
      };
    }

    case NotificationType.ORDER_CREATED_CERT_ONLY:
      return {
        subject: `Заказ #${orderId} принят`,
        html: `
          <p style="margin-bottom: 16px;">Ваш заказ <strong style="color: #ff9500;">#${orderId}</strong> с сертификатом успешно создан.</p>
          <p style="color: #a3a3a3;">После оплаты вы получите код сертификата. Код будет доставлен на ваш контактный адрес.</p>
          <p style="color: #a3a3a3; margin-top: 16px;">Вы можете отслеживать статус заказа в личном кабинете.</p>
        `,
        text: `Ваш заказ #${orderId} с сертификатом успешно создан.\n\nПосле оплаты вы получите код сертификата.`
      };

    case NotificationType.ORDER_CREATED_CERT_MIXED: {
      const isAuto = data.isAutoCalculated;
      return {
        subject: `Заказ #${orderId} принят`,
        html: `
          <p style="margin-bottom: 16px;">Ваш заказ <strong style="color: #ff9500;">#${orderId}</strong> успешно создан и принят в обработку.</p>
          <p style="color: #a3a3a3;">${isAuto
            ? 'Стоимость доставки уже рассчитана. Вы можете оплатить заказ прямо сейчас. Сертификаты будут отправлены после оплаты.'
            : 'Мы рассчитаем стоимость доставки в ближайшее время. Сертификаты из заказа будут отправлены после оплаты.'
          }</p>
          <p style="color: #a3a3a3; margin-top: 16px;">Вы можете отслеживать статус заказа в личном кабинете.</p>
        `,
        text: `Ваш заказ #${orderId} успешно создан и принят в обработку.\n\n${isAuto
          ? 'Стоимость доставки рассчитана. Сертификаты будут отправлены после оплаты.'
          : 'Мы рассчитаем стоимость доставки. Сертификаты будут отправлены после оплаты.'}`
      };
    }

    case NotificationType.ORDER_CONFIRMED:
      return {
        subject: `Заказ #${orderId} подтверждён — ожидает оплаты`,
        html: `
          <p style="margin-bottom: 16px;">Ваш заказ <strong style="color: #ff9500;">#${orderId}</strong> подтверждён и ожидает оплаты.</p>
          ${infoBox([['Сумма к оплате', `${totalPrice} ₽`, true]])}
          <p style="color: #a3a3a3;">Пожалуйста, оплатите заказ в ближайшее время. Ссылка на оплату доступна на странице заказа.</p>
        `,
        text: `Ваш заказ #${orderId} подтверждён и ожидает оплаты.\n\nСумма к оплате: ${totalPrice} руб.`
      };

    case NotificationType.DELIVERY_COST_ADDED:
      return {
        subject: `Заказ #${orderId} — стоимость доставки рассчитана`,
        html: `
          <p style="margin-bottom: 16px;">Стоимость доставки для заказа <strong style="color: #ff9500;">#${orderId}</strong> рассчитана.</p>
          ${infoBox([
            ['Доставка', `${deliveryCost} ₽`, false],
            ['Итого к оплате', `${totalPrice} ₽`, true]
          ])}
          <p style="color: #a3a3a3;">Для оплаты заказа перейдите на страницу заказа в личном кабинете.</p>
        `,
        text: `Стоимость доставки для заказа #${orderId} рассчитана.\n\nДоставка: ${deliveryCost} руб.\nИтого к оплате: ${totalPrice} руб.`
      };

    case NotificationType.PAYMENT_RECEIVED: {
      const { certificates: certs, isCertOnly: certOnly } = data;
      const hasCerts = certs && certs.length > 0;

      if (!hasCerts) {
        return {
          subject: `Заказ #${orderId} — оплата получена`,
          html: `
            <p style="margin-bottom: 16px;">Оплата заказа <strong style="color: #ff9500;">#${orderId}</strong> успешно получена.</p>
            <p style="color: #a3a3a3;">Мы приступили к подготовке вашего заказа. Как только заказ будет отправлен, вы получите уведомление с информацией для отслеживания.</p>
            <p style="color: #ff9500; margin-top: 16px;">Благодарим за покупку!</p>
          `,
          text: `Оплата заказа #${orderId} успешно получена.\n\nМы приступили к подготовке вашего заказа.`
        };
      }

      const allHaveImages = certs.every(c => c.certImageUrl);
      let certHtml = '';
      let certText = '';
      for (const cert of certs) {
        certHtml += `
          <div style="margin: 24px 0; padding: 24px; background: #1e1e1e; border-radius: 8px; border: 1px solid #2b2b2b;">
            ${cert.recipientName ? `<p style="margin: 0 0 8px 0; color: #a3a3a3;">Получатель: <strong style="color: #E0E0E0;">${escapeHtml(cert.recipientName)}</strong></p>` : ''}
            <p style="margin: 0 0 8px 0; color: #a3a3a3; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Код сертификата</p>
            <p style="margin: 0; font-size: 28px; font-weight: 700; color: #ff9500; letter-spacing: 4px; font-family: monospace;">${escapeHtml(cert.certificateCode)}</p>
          </div>
          ${cert.certImageUrl ? `<div style="margin: 0 0 24px 0;"><img src="${cert.certImageUrl}" alt="Сертификат" style="width: 100%; max-width: 560px; border-radius: 8px; border: 1px solid #2b2b2b;"></div>` : ''}`;
        certText += `\n\nСертификат: ${cert.certificateCode}${cert.recipientName ? ` (${cert.recipientName})` : ''}`;
      }

      const pendingNote = allHaveImages ? '' : '<p style="color: #a3a3a3; font-style: italic;">Изображение сертификата будет готово в ближайшее время — мы пришлём его отдельным сообщением.</p>';
      const pendingNoteText = allHaveImages ? '' : '\n\nИзображение сертификата будет готово в ближайшее время.';

      if (certOnly) {
        return {
          subject: `Заказ #${orderId} — оплата получена`,
          html: `
            <p style="margin-bottom: 16px;">Оплата заказа <strong style="color: #ff9500;">#${orderId}</strong> получена${allHaveImages ? ' — ваш сертификат готов!' : '.'}</p>
            ${certHtml}
            ${pendingNote}
            <p style="color: #a3a3a3;">Передайте код получателю или используйте при оформлении следующего заказа.</p>
          `,
          text: `Оплата заказа #${orderId} получена.${certText}${pendingNoteText}\n\nПередайте код получателю или используйте при оформлении следующего заказа.`
        };
      }

      return {
        subject: `Заказ #${orderId} — оплата получена`,
        html: `
          <p style="margin-bottom: 16px;">Оплата заказа <strong style="color: #ff9500;">#${orderId}</strong> успешно получена.</p>
          ${certHtml}
          ${pendingNote}
          <p style="color: #a3a3a3;">Мы приступили к подготовке вашего заказа. Как только заказ будет отправлен, вы получите уведомление с информацией для отслеживания.</p>
          <p style="color: #ff9500; margin-top: 16px;">Благодарим за покупку!</p>
        `,
        text: `Оплата заказа #${orderId} успешно получена.${certText}${pendingNoteText}\n\nМы приступили к подготовке вашего заказа.`
      };
    }

    case NotificationType.ORDER_SHIPPED:
      return {
        subject: `Заказ #${orderId} отправлен`,
        html: `
          <p style="margin-bottom: 16px;">Ваш заказ <strong style="color: #ff9500;">#${orderId}</strong> отправлен и находится в пути.</p>
          ${trackingNumber ? `
            ${infoBox([['Трек-номер', trackingNumber, true]])}
            <p style="color: #a3a3a3;">Вы можете отслеживать статус доставки на сайте транспортной компании.</p>
          ` : '<p style="color: #a3a3a3;">Информация для отслеживания будет предоставлена дополнительно.</p>'}
        `,
        text: `Ваш заказ #${orderId} отправлен.${trackingNumber ? `\n\nТрек-номер: ${trackingNumber}` : ''}`
      };

    case NotificationType.ORDER_CANCELLED:
      return {
        subject: `Заказ #${orderId} отменён`,
        html: `
          <p style="margin-bottom: 16px;">Заказ <strong style="color: #ff9500;">#${orderId}</strong> был отменён.</p>
          <p style="color: #a3a3a3;">Если у вас есть вопросы по данному заказу, пожалуйста, свяжитесь с нашей службой поддержки.</p>
        `,
        text: `Заказ #${orderId} был отменён.\n\nЕсли у вас есть вопросы, свяжитесь с нашей службой поддержки.`
      };

    case NotificationType.PRODUCT_AVAILABLE:
      return {
        subject: `${productTitle} — теперь в продаже`,
        html: `
          <p style="margin-bottom: 16px;">Товар, на который вы подписались, теперь доступен для покупки:</p>
          <p style="font-size: 20px; font-weight: 600; color: #ff9500; margin: 24px 0; padding: 20px; background: #1e1e1e; border-radius: 8px; text-align: center;">${productTitle}</p>
          <p style="color: #a3a3a3;">Перейдите на страницу товара, чтобы оформить заказ.</p>
        `,
        text: `Товар "${productTitle}", на который вы подписались, теперь доступен для покупки.`
      };

    case NotificationType.CONTACT_REQUEST:
      return {
        subject: `Заказ #${orderId} — требуется связь`,
        html: `
          <p style="margin-bottom: 16px;">${customMessage || `По вашему заказу <strong style="color: #ff9500;">#${orderId}</strong> требуется связь с нашей службой поддержки.`}</p>
          <p style="color: #a3a3a3;">Пожалуйста, свяжитесь с нами удобным для вас способом.</p>
        `,
        text: customMessage || `По вашему заказу #${orderId} требуется связь с нашей службой поддержки.`
      };

    case NotificationType.REFUND_PROCESSED:
      return {
        subject: `Заказ #${orderId} — возврат оформлен`,
        html: `
          <p style="margin-bottom: 16px;">Возврат средств по заказу <strong style="color: #ff9500;">#${orderId}</strong> успешно оформлен.</p>
          ${infoBox([['Сумма возврата', `${refundAmount} ₽`, true]])}
          <p style="color: #a3a3a3;">Средства поступят на ваш счёт в течение нескольких рабочих дней в зависимости от вашего банка.</p>
        `,
        text: `Возврат по заказу #${orderId} на сумму ${refundAmount} руб. успешно оформлен.`
      };

    case NotificationType.ADMIN_RESPONSE:
      const { responseText, reviewType } = data;
      const typeLabel = reviewType === 'review' ? 'рецензию' : reviewType === 'comment' ? 'комментарий' : 'предложение';
      return {
        subject: `Ответ на вашу ${typeLabel}${productTitle ? ` — ${productTitle}` : ''}`,
        html: `
          <p style="margin-bottom: 16px;">Вы получили ответ на вашу ${typeLabel}${productTitle ? ` к товару "<strong style="color: #ff9500;">${productTitle}</strong>"` : ''}:</p>
          <blockquote style="margin: 24px 0; padding: 20px; background: #1e1e1e; border-left: 4px solid #ff9500; border-radius: 0 8px 8px 0; font-style: italic; color: #E0E0E0;">
            ${responseText}
          </blockquote>
          <p style="color: #a3a3a3;">Благодарим за обратную связь!</p>
        `,
        text: `Ответ на вашу ${typeLabel}${productTitle ? ` к "${productTitle}"` : ''}:\n\n${responseText}`
      };

    case NotificationType.PARCEL_AT_PICKUP_POINT: {
      const { storageDays, providerName } = data;
      return {
        subject: `Заказ #${orderId} — посылка прибыла`,
        html: `
          <p style="margin-bottom: 16px;">Ваш заказ <strong style="color: #ff9500;">#${orderId}</strong> прибыл в пункт выдачи${providerName ? ` (${providerName})` : ''}.</p>
          ${infoBox([['Срок хранения', `${storageDays} дней`, true]])}
          <p style="color: #a3a3a3;">Пожалуйста, заберите посылку вовремя. Если посылку не получат, она будет возвращена отправителю.</p>
          <p style="color: #ff9500; margin-top: 16px;">Поторопитесь!</p>
          <p style="color: #a3a3a3; margin-top: 16px;">Будем рады вашему отзыву — он поможет другим покупателям!</p>
        `,
        text: `Ваш заказ #${orderId} прибыл в пункт выдачи${providerName ? ` (${providerName})` : ''}.\n\nСрок хранения: ${storageDays} дней.\n\nПожалуйста, заберите посылку вовремя.\n\nБудем рады вашему отзыву — он поможет другим покупателям!`
      };
    }

    case NotificationType.STORAGE_PICKUP_REMINDER: {
      const { daysLeft, providerName } = data;
      return {
        subject: `Заказ #${orderId} — напоминание о посылке`,
        html: `
          <p style="margin-bottom: 16px;">Ваш заказ <strong style="color: #ff9500;">#${orderId}</strong> всё ещё ожидает получения в пункте выдачи${providerName ? ` (${providerName})` : ''}.</p>
          ${infoBox([['Осталось дней хранения', `${daysLeft}`, true]])}
          <p style="color: #a3a3a3;">Если посылку не получат до истечения срока хранения, она будет возвращена отправителю.</p>
        `,
        text: `Ваш заказ #${orderId} всё ещё ожидает получения в пункте выдачи.\n\nОсталось дней хранения: ${daysLeft}.`
      };
    }

    case NotificationType.PARCEL_RETURNED_TO_SENDER: {
      const { deliveryCost } = data;
      const retryCost = deliveryCost ? `${deliveryCost * 2} ₽` : 'двойная стоимость доставки';
      return {
        subject: `Заказ #${orderId} — посылка возвращена`,
        html: `
          <p style="margin-bottom: 16px;">Ваш заказ <strong style="color: #ff9500;">#${orderId}</strong> был возвращён отправителю, так как не был получен вовремя.</p>
          <p style="color: #E0E0E0; margin-bottom: 16px;">У вас есть два варианта:</p>
          ${infoBox([
            ['Повторная доставка', retryCost, true],
            ['Отмена заказа', 'Возврат стоимости товаров (без доставки)', false]
          ])}
          <p style="color: #a3a3a3;">Пожалуйста, перейдите в заказ и выберите подходящий вариант. Решение должно быть согласовано с нами.</p>
        `,
        text: `Ваш заказ #${orderId} был возвращён отправителю.\n\nВарианты:\n1. Повторная доставка — ${retryCost}\n2. Отмена заказа — возврат стоимости товаров (без доставки)\n\nПерейдите в заказ и выберите вариант.`
      };
    }

    case NotificationType.CERTIFICATE_DELIVERED: {
      const { certificateCode, recipientName, certImageUrl, isCertOnly: certOnlyOrder } = data;
      return {
        subject: `Изображение сертификата по заказу #${orderId} готово`,
        html: `
          <p style="margin-bottom: 16px;">Изображение сертификата по заказу <strong style="color: #ff9500;">#${orderId}</strong> готово.</p>
          ${recipientName ? `<p style="color: #a3a3a3; margin-bottom: 16px;">Получатель: <strong style="color: #E0E0E0;">${escapeHtml(recipientName)}</strong></p>` : ''}
          <div style="margin: 24px 0; padding: 24px; background: #1e1e1e; border-radius: 8px; text-align: center; border: 1px solid #2b2b2b;">
            <p style="margin: 0 0 8px 0; color: #a3a3a3; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Код сертификата</p>
            <p style="margin: 0; font-size: 28px; font-weight: 700; color: #ff9500; letter-spacing: 4px; font-family: monospace;">${escapeHtml(certificateCode)}</p>
          </div>
          ${certImageUrl ? `<div style="margin: 24px 0;"><img src="${certImageUrl}" alt="Сертификат" style="width: 100%; max-width: 560px; border-radius: 8px; border: 1px solid #2b2b2b;"></div>` : ''}
          ${certOnlyOrder ? '<p style="color: #a3a3a3;">Ваш заказ выполнен!</p>' : ''}
        `,
        text: `Изображение сертификата по заказу #${orderId} готово.\n\nКод: ${certificateCode}${recipientName ? `\nПолучатель: ${recipientName}` : ''}${certOnlyOrder ? '\n\nВаш заказ выполнен!' : ''}`
      };
    }

    default:
      return null;
  }
}

/**
 * Build complete HTML email with wrapper and styling
 * Matches TR/BUTE website dark theme with orange/gold accents
 */
function buildEmailHtml(content, link, linkText) {
  let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0a; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #121212; border-radius: 12px; overflow: hidden; border: 1px solid #2b2b2b;">
          <!-- Header with brand -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e1e1e 0%, #121212 100%); padding: 32px 40px; border-bottom: 1px solid #2b2b2b;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="color: #ff9500; font-size: 24px; font-weight: 700; letter-spacing: 2px;">TR/BUTE</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px; color: #E0E0E0; font-size: 15px; line-height: 1.7;">
              ${content}
              ${link ? `
              <div style="margin-top: 32px;">
                <a href="${link}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #ff9500 0%, #f5d963 100%); color: #121212; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">${linkText}</a>
              </div>
              ` : ''}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #1e1e1e; border-top: 1px solid #2b2b2b;">
              <p style="margin: 0; color: #818181; font-size: 12px; line-height: 1.5;">
                Это автоматическое уведомление от TR/BUTE.<br>
                Пожалуйста, не отвечайте на это письмо.
              </p>
            </td>
          </tr>
        </table>
        <!-- Sub-footer with branding -->
        <table width="600" cellpadding="0" cellspacing="0" style="margin-top: 24px;">
          <tr>
            <td align="center">
              <p style="margin: 0; color: #3a3a3a; font-size: 11px;">
                © ${new Date().getFullYear()} TR/BUTE. Все права защищены.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  return html;
}

/**
 * Send notification via Telegram bot
 */
// Strip inline keyboards from any active bot session messages for this user.
// Called before sending a notification so the old interactive card doesn't
// leave stale buttons floating above the new notification.
async function clearUserBotKeyboards(chatId) {
  try {
    const sessionStore = getSessionStore('user');
    const session = await sessionStore.get(String(chatId));
    if (!session) return;

    const token = config.auth.telegram.userBotToken;
    if (!token) return;

    const stripTasks = [];
    if (session.pickerMessageId) {
      stripTasks.push(
        axios.post(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
          chat_id: chatId,
          message_id: session.pickerMessageId,
          reply_markup: { inline_keyboard: [] }
        }).catch(() => {})
      );
    }
    if (session.activeKeyboardMessageId) {
      stripTasks.push(
        axios.post(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
          chat_id: chatId,
          message_id: session.activeKeyboardMessageId,
          reply_markup: { inline_keyboard: [] }
        }).catch(() => {})
      );
    }
    if (stripTasks.length > 0) {
      await Promise.all(stripTasks);
      await sessionStore.delete(String(chatId));
    }
  } catch {
    // Non-critical — never block a notification
  }
}

async function sendTelegramNotification({ chatId, title, message, link, linkText = 'Открыть', useAdminBot = false }) {
  try {
    const botToken = useAdminBot
      ? config.auth.telegram.adminBotToken
      : config.auth.telegram.userBotToken;

    if (!botToken) {
      const botType = useAdminBot ? 'Admin' : 'User';
      console.error(`${botType} Telegram bot token not configured`);
      return false;
    }

    // Strip any stale interactive keyboards from the user's chat before the notification arrives
    if (!useAdminBot) await clearUserBotKeyboards(chatId);

    const text = applyCustomEmoji(`<b>${title}</b>\n\n${message}`);

    const payload = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML'
    };

    if (link) {
      payload.reply_markup = {
        inline_keyboard: [[{ text: linkText, web_app: { url: link } }]]
      };
    }

    const response = await axios.post(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      payload
    );

    if (response.data.ok) {
      console.log(`Telegram notification sent to chat ${chatId}`);
      return true;
    } else {
      console.error('Telegram API error:', response.data);
      return false;
    }
  } catch (error) {
    console.error('Failed to send Telegram notification:', error.message);
    return false;
  }
}

/**
 * Email categories for Gmail/email client sorting
 * Gmail uses these headers to categorize into tabs:
 * - Transactional (orders, receipts) -> Updates/Primary
 * - Notifications (status updates) -> Updates
 * - Promotional -> Promotions
 */
const EmailCategory = {
  TRANSACTIONAL: 'transactional',  // Orders, payments, receipts
  NOTIFICATION: 'notification',     // Status updates, alerts
  PROMOTIONAL: 'promotional'        // Marketing, product releases
};

/**
 * Get email headers based on category for proper inbox sorting
 */
function getEmailHeaders(category) {
  const baseHeaders = {
    'X-Mailer': 'TR-BUTE Notification System',
    'X-Auto-Response-Suppress': 'All'  // Prevent auto-replies
  };

  switch (category) {
    case EmailCategory.TRANSACTIONAL:
      return {
        ...baseHeaders,
        'X-Priority': '1',  // High priority
        'X-PM-Message-Stream': 'outbound',  // Transactional stream
        'X-Entity-Ref-ID': `order-${Date.now()}`  // Unique reference
      };

    case EmailCategory.NOTIFICATION:
      return {
        ...baseHeaders,
        'X-Priority': '3',  // Normal priority
        'X-PM-Message-Stream': 'outbound'
      };

    case EmailCategory.PROMOTIONAL:
      return {
        ...baseHeaders,
        'X-Priority': '5',  // Low priority
        'Precedence': 'bulk',  // Signals promotional content
        'X-PM-Message-Stream': 'broadcast'
      };

    default:
      return baseHeaders;
  }
}

/**
 * Get category for notification type
 */
function getCategoryForType(type) {
  switch (type) {
    // Transactional - order and payment related
    case NotificationType.ORDER_CREATED:
    case NotificationType.ORDER_CREATED_CERT_ONLY:
    case NotificationType.ORDER_CREATED_CERT_MIXED:
    case NotificationType.ORDER_CONFIRMED:
    case NotificationType.DELIVERY_COST_ADDED:
    case NotificationType.PAYMENT_RECEIVED:
    case NotificationType.ORDER_SHIPPED:
    case NotificationType.ORDER_CANCELLED:
    case NotificationType.REFUND_PROCESSED:
    case NotificationType.PARCEL_AT_PICKUP_POINT:
    case NotificationType.STORAGE_PICKUP_REMINDER:
    case NotificationType.PARCEL_RETURNED_TO_SENDER:
      return EmailCategory.TRANSACTIONAL;

    // Notifications - updates and alerts
    case NotificationType.CONTACT_REQUEST:
    case NotificationType.ADMIN_RESPONSE:
      return EmailCategory.NOTIFICATION;

    // Promotional - product releases
    case NotificationType.PRODUCT_AVAILABLE:
      return EmailCategory.PROMOTIONAL;

    default:
      return EmailCategory.NOTIFICATION;
  }
}

/**
 * Send notification via email.
 * Uses Yandex Cloud Postbox as primary provider, falls back to Yandex SMTP.
 */
async function sendEmailNotification({ email, subject, html, text, link, linkText = 'Перейти', category = EmailCategory.NOTIFICATION }) {
  if (!config.postbox.enabled && !config.email.enabled) {
    console.error('Email not configured (need POSTBOX_API_KEY_ID+SECRET or YANDEX_EMAIL+PASSWORD)');
    return false;
  }

  const htmlBody = buildEmailHtml(html, link, linkText);
  const textBody = text + (link ? `\n\n${linkText}: ${link}` : '');
  const headers = getEmailHeaders(category);

  const fromAddress = config.postbox.enabled
    ? config.postbox.fromAddress
    : config.email.user;

  try {
    const result = await postbox.sendEmail({
      from: `"TR/BUTE" <${fromAddress}>`,
      to: email,
      subject,
      text: textBody,
      html: htmlBody,
      headers
    });

    trackEmailSent();
    console.log(`Email sent to ${email} via ${result.provider}: ${result.messageId}`);
    return true;
  } catch (error) {
    trackEmailFailed();
    console.error('Failed to send email:', error.message);
    return false;
  }
}

/**
 * Send typed notification with appropriate content for each channel
 *
 * @param {Object} options - Notification options
 * @param {string} options.type - Notification type (use NotificationType constants)
 * @param {Object} options.data - Data for the notification template
 * @param {string} [options.link] - Optional link URL
 * @param {string} [options.linkText] - Optional link button text
 * @param {string} [options.userTelegramId] - User's Telegram chat ID
 * @param {string} [options.userEmail] - User's email address
 * @returns {Promise<boolean>} Success status
 */
async function sendNotification({
  type,
  data,
  link,
  linkText = 'Открыть',
  userTelegramId,
  userEmail,
  userVkId,
  userMaxId,
  // Legacy support for direct title/message
  title,
  message,
  userId
}) {
  console.log(`Sending notification (type: ${type || 'legacy'})`);

  // Check if user has notifications enabled
  if (userId) {
    try {
      const { getPool } = require('./db');
      const pool = getPool();
      const check = await pool.query('SELECT notifications_enabled FROM users WHERE id = $1', [userId]);
      if (check.rows.length > 0 && check.rows[0].notifications_enabled === false) {
        console.log(`Notifications disabled for user ${userId}, skipping`);
        return false;
      }
    } catch (err) {
      // Proceed if check fails — don't silently drop notifications on DB errors
    }
  }

  const hasTelegram = !!userTelegramId;
  const hasEmail = !!userEmail;
  const hasVK = !!userVkId;
  const hasMAX = !!userMaxId;

  if (!hasTelegram && !hasEmail && !hasVK && !hasMAX) {
    console.error('Cannot send notification: no contact method available');
    return false;
  }

  // Load DB template overrides
  let overrides = {};
  if (type && data) {
    try {
      overrides = await loadTemplateOverrides();
    } catch (err) {
      // Proceed with defaults if DB fails
    }
  }

  // Get content based on type or use legacy title/message
  let telegramContent, emailContent, vkContent, maxContent;

  if (type && data) {
    telegramContent = getTelegramContent(type, data, overrides);
    emailContent = getEmailContent(type, data, overrides);
    vkContent = getVKContent(type, data, overrides);
    maxContent = getMAXContent(type, data, overrides);
  }

  if (!telegramContent) {
    telegramContent = { title: title || 'Уведомление', message: message || '' };
  }
  if (!emailContent) {
    emailContent = {
      subject: title || 'Уведомление от TR/BUTE',
      html: `<p>${(message || '').replace(/\n/g, '<br>')}</p>`,
      text: message || ''
    };
  }
  if (!vkContent) {
    vkContent = { message: `${title || 'Уведомление'}\n\n${message || ''}` };
  }
  if (!maxContent) {
    maxContent = { message: `${title || 'Уведомление'}\n\n${message || ''}` };
  }

  // Single-channel routing: send via the user's login platform.
  // Priority: Telegram > MAX > VK > Email.
  // Telegram wins when the user has a telegram_id (even if they also have MAX/VK).
  // Each user is notified on exactly one channel.
  if (hasTelegram) {
    if (type && overrides?.[type]?._disabled?.telegram === true) {
      console.log(`Telegram notification disabled for type ${type}, skipping`);
      return false;
    }
    console.log('Using Telegram');
    return sendTelegramNotification({
      chatId: userTelegramId,
      title: telegramContent.title,
      message: telegramContent.message,
      link,
      linkText
    });
  }

  if (hasMAX) {
    if (type && overrides?.[type]?._disabled?.max === true) {
      console.log(`MAX notification disabled for type ${type}, skipping`);
      return false;
    }
    console.log('Using MAX Bot notification');
    return sendMAXNotification({ maxId: userMaxId, message: maxContent.message, link, linkText });
  }

  if (hasVK) {
    if (type && overrides?.[type]?._disabled?.vk === true) {
      console.log(`VK notification disabled for type ${type}, skipping`);
      return false;
    }
    console.log('Using VK Mini App notification');
    return sendVKNotification({ vkUserId: userVkId, message: vkContent.message });
  }

  if (type && overrides?.[type]?._disabled?.email === true) {
    console.log(`Email notification disabled for type ${type}, skipping`);
    return false;
  }
  console.log('Using Email');
  const category = type ? getCategoryForType(type) : EmailCategory.NOTIFICATION;
  return sendEmailNotification({
    email: userEmail,
    subject: emailContent.subject,
    html: emailContent.html,
    text: emailContent.text,
    link,
    linkText,
    category
  });
}

/**
 * Send notification to admin
 * IMPORTANT: Admin notifications should always use the admin bot when configured,
 * regardless of deployment mode. Email is only a fallback when bot is not configured.
 */
async function sendAdminNotification({ title, message, link, linkText = 'Открыть' }) {
  console.log(`Sending admin notification`);

  const hasAdminBot = config.auth.telegram.adminChatId && config.auth.telegram.adminBotToken;

  if (!hasAdminBot) {
    console.warn('Admin bot not configured (missing ADMIN_BOT_TOKEN or ADMIN_CHAT_ID)');
  }

  // Primary method: Telegram admin bot (should work in both deployments)
  if (hasAdminBot) {
    console.log('Sending admin notification via Telegram bot');
    try {
      const result = await sendTelegramNotification({
        chatId: config.auth.telegram.adminChatId,
        title,
        message,
        useAdminBot: true
      });
      if (result) {
        console.log('Admin notification sent via Telegram bot');
        return true;
      }
    } catch (error) {
      console.error('Telegram admin notification failed:', error.message);
    }
  }

  // Fallback: Email (only if Telegram bot not available or failed)
  const adminEmail = process.env.ADMIN_EMAIL || config.email.user;
  if (config.email.enabled && adminEmail) {
    console.log('Falling back to email for admin notification');
    try {
      const result = await sendEmailNotification({
        email: adminEmail,
        subject: title,
        html: `<p>${message.replace(/\n/g, '<br>')}</p>`,
        text: message,
        link,
        linkText
      });
      if (result) {
        console.log('Admin notification sent via email');
        return true;
      }
    } catch (error) {
      console.error('Email admin notification failed:', error.message);
    }
  }

  console.error('All admin notification methods failed');
  return false;
}

/**
 * Generate VK notification message content (plain text, same casual tone as Telegram)
 */
function getVKContent(type, data, overrides) {
  const { orderId, totalPrice, deliveryCost, trackingNumber, productTitle, customMessage, refundAmount } = data;
  const vars = { orderId, totalPrice, deliveryCost, trackingNumber, productTitle, customMessage, refundAmount };

  if (overrides && overrides[type]?.vk) {
    let message;
    if ((type === NotificationType.ORDER_CREATED || type === NotificationType.ORDER_CREATED_CERT_MIXED) && data.isAutoCalculated) {
      message = getFieldValue(overrides, type, 'vk', 'messageAuto') || getFieldValue(overrides, type, 'vk', 'message');
    } else {
      message = getFieldValue(overrides, type, 'vk', 'message');
    }
    if (type === NotificationType.ADMIN_RESPONSE) {
      const { responseText, reviewType } = data;
      const typeLabel = reviewType === 'review' ? 'рецензию' : reviewType === 'comment' ? 'комментарий' : 'предложение';
      const productSuffix = productTitle ? ` к "${productTitle}"` : '';
      vars.typeLabel = typeLabel;
      vars.productSuffix = productSuffix;
      vars.responseText = responseText;
    }
    return { message: applyTemplateVariables(message, vars) };
  }

  // Fall back to Telegram defaults (same text, drop the title emoji prefix)
  const tg = getTelegramContent(type, data, overrides);
  if (!tg) return null;
  return { message: `${tg.title}\n\n${tg.message}` };
}

/**
 * Generate MAX notification message content (plain text, same format as VK)
 */
function getMAXContent(type, data, overrides) {
  const { orderId, totalPrice, deliveryCost, trackingNumber, productTitle, customMessage, refundAmount } = data;
  const vars = { orderId, totalPrice, deliveryCost, trackingNumber, productTitle, customMessage, refundAmount };

  if (overrides && overrides[type]?.max) {
    let message;
    if ((type === NotificationType.ORDER_CREATED || type === NotificationType.ORDER_CREATED_CERT_MIXED) && data.isAutoCalculated) {
      message = getFieldValue(overrides, type, 'max', 'messageAuto') || getFieldValue(overrides, type, 'max', 'message');
    } else {
      message = getFieldValue(overrides, type, 'max', 'message');
    }
    if (type === NotificationType.ADMIN_RESPONSE) {
      const { responseText, reviewType } = data;
      vars.typeLabel = reviewType === 'review' ? 'рецензию' : reviewType === 'comment' ? 'комментарий' : 'предложение';
      vars.productSuffix = productTitle ? ` к "${productTitle}"` : '';
      vars.responseText = responseText;
    }
    return { message: applyTemplateVariables(message, vars) };
  }

  // Fall back to VK defaults (same plain-text format)
  return getVKContent(type, data, overrides);
}

/**
 * Send notification via MAX Bot API.
 * MAX Bot sends the message to the user's chat with the bot.
 *
 * @param {Object} options
 * @param {string} options.maxId    - User's MAX ID (stored in users.max_id)
 * @param {string} options.message  - Notification text
 * @param {string} [options.link]   - Optional URL to include as a button
 * @param {string} [options.linkText] - Label for the link button
 */
async function sendMAXNotification({ maxId, message, link, linkText = 'Открыть' }) {
  const botToken = config.maxBotToken;
  if (!botToken) {
    console.error('MAX_BOT_TOKEN not configured');
    return false;
  }

  try {
    const body = { text: message };

    if (link) {
      body.attachments = [{
        type: 'inline_keyboard',
        payload: {
          buttons: [[{ type: 'link', text: linkText, url: link }]]
        }
      }];
    }

    const response = await axios.post(
      `https://platform-api.max.ru/messages?chat_id=${maxId}`,
      body,
      {
        headers: {
          'Authorization': botToken,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data?.message?.id) {
      console.log(`MAX notification sent to user ${maxId}`);
      return true;
    }

    console.error('MAX notification response unexpected:', response.data);
    return false;
  } catch (error) {
    console.error('Failed to send MAX notification:', error.response?.data || error.message);
    return false;
  }
}

/**
 * Send notification via VK Mini App notifications.send API
 */
async function sendVKNotification({ vkUserId, message }) {
  const serviceToken = config.vkAppServiceToken;
  if (!serviceToken) {
    console.error('VK_APP_SERVICE_TOKEN not configured');
    return false;
  }

  try {
    const params = new URLSearchParams({
      user_ids: String(vkUserId),
      message,
      access_token: serviceToken,
      v: '5.199'
    });

    const response = await axios.post(
      'https://api.vk.com/method/notifications.send',
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    if (response.data?.error) {
      console.error('VK notifications.send error:', response.data.error);
      return false;
    }

    console.log(`VK notification sent to user ${vkUserId}`);
    return true;
  } catch (error) {
    console.error('Failed to send VK notification:', error.message);
    return false;
  }
}

/**
 * Get sharing configuration for the current deployment mode
 */
function getSharingConfig() {
  return {
    mode: config.deploymentMode,
    isTelegram: config.isTelegramMode,
    isYandex: config.isYandexMode,
    appUrl: config.appUrl,
    supportsNativeShare: !config.isTelegramMode
  };
}

/**
 * Notification Template Registry
 *
 * Defines all notification types with their editable fields, available
 * variables, descriptions, and grouping. This registry is the single
 * source of truth — the admin UI reads it to know what exists.
 *
 * Groups correspond to trigger circumstances so that Telegram and Email
 * templates for the same event are displayed together.
 */
const NotificationTemplateRegistry = {
  // ── Order lifecycle ────────────────────────────────
  order_created: {
    group: 'orders',
    groupLabel: 'Заказы',
    label: 'Заказ создан (без сертификатов)',
    description: 'Отправляется покупателю сразу после оформления заказа без сертификатов. Используется отдельный текст для заказов с ручным и автоматическим расчётом доставки.',
    variables: ['orderId'],
    variableLabels: { orderId: 'Номер заказа' },
    telegram: {
      fields: {
        title: { label: 'Заголовок', default: 'Заказ принят!' },
        message: { label: 'Текст (ручной расчёт доставки)', default: 'Заказ #{orderId} успешно создан!\n\nМы проверим заказ и рассчитаем стоимость доставки. Вы получите уведомление с итоговой суммой.' },
        messageAuto: { label: 'Текст (доставка уже рассчитана)', default: 'Заказ #{orderId} успешно создан!\n\nСтоимость доставки уже рассчитана. Вы можете оплатить заказ прямо сейчас.' }
      }
    },
    vk: {
      fields: {
        message: { label: 'Текст (ручной расчёт доставки)', default: 'Заказ принят!\n\nЗаказ #{orderId} успешно создан! Мы проверим заказ и рассчитаем стоимость доставки.' },
        messageAuto: { label: 'Текст (доставка уже рассчитана)', default: 'Заказ принят!\n\nЗаказ #{orderId} создан! Стоимость доставки рассчитана — откройте приложение для оплаты.' }
      }
    },
    max: {
      fields: {
        message: { label: 'Текст (ручной расчёт доставки)', default: 'Заказ принят!\n\nЗаказ #{orderId} успешно создан! Мы проверим заказ и рассчитаем стоимость доставки.' },
        messageAuto: { label: 'Текст (доставка уже рассчитана)', default: 'Заказ принят!\n\nЗаказ #{orderId} создан! Стоимость доставки рассчитана — откройте приложение для оплаты.' }
      }
    },
    email: {
      fields: {
        subject: { label: 'Тема письма', default: 'Заказ #{orderId} принят' },
        heading: { label: 'Заголовок', default: 'Ваш заказ <strong style="color: #ff9500;">#{orderId}</strong> успешно создан и принят в обработку.' },
        body: { label: 'Основной текст (ручной расчёт доставки)', default: 'В ближайшее время мы проверим заказ и рассчитаем стоимость доставки. После этого вы получите уведомление с итоговой суммой и ссылкой на оплату.' },
        bodyAuto: { label: 'Основной текст (доставка уже рассчитана)', default: 'Стоимость доставки уже рассчитана. Вы можете оплатить заказ прямо сейчас на странице заказа.' },
        footer: { label: 'Дополнительный текст', default: 'Вы можете отслеживать статус заказа в личном кабинете.' }
      }
    }
  },

  order_created_cert_only: {
    group: 'orders',
    groupLabel: 'Заказы',
    label: 'Заказ создан (только сертификаты)',
    description: 'Отправляется покупателю после оформления заказа, состоящего исключительно из сертификатов. Доставка рассчитывается автоматически.',
    variables: ['orderId'],
    variableLabels: { orderId: 'Номер заказа' },
    telegram: {
      fields: {
        title: { label: 'Заголовок', default: 'Заказ принят!' },
        message: { label: 'Текст', default: 'Заказ #{orderId} успешно создан!\n\nПосле оплаты вы получите код сертификата.' }
      }
    },
    vk: {
      fields: {
        message: { label: 'Текст уведомления', default: 'Заказ принят!\n\nЗаказ #{orderId} создан. После оплаты вы получите код сертификата.' }
      }
    },
    max: {
      fields: {
        message: { label: 'Текст уведомления', default: 'Заказ принят!\n\nЗаказ #{orderId} создан. После оплаты вы получите код сертификата.' }
      }
    },
    email: {
      fields: {
        subject: { label: 'Тема письма', default: 'Заказ #{orderId} принят' },
        heading: { label: 'Заголовок', default: 'Ваш заказ <strong style="color: #ff9500;">#{orderId}</strong> с сертификатом успешно создан.' },
        body: { label: 'Основной текст', default: 'После оплаты вы получите код сертификата. Код будет доставлен на ваш контактный адрес.' },
        footer: { label: 'Дополнительный текст', default: 'Вы можете отслеживать статус заказа в личном кабинете.' }
      }
    }
  },

  order_created_cert_mixed: {
    group: 'orders',
    groupLabel: 'Заказы',
    label: 'Заказ создан (товары + сертификаты)',
    description: 'Отправляется покупателю после оформления заказа, содержащего сертификаты вместе с обычными товарами. Используется отдельный текст для ручного и автоматического расчёта доставки.',
    variables: ['orderId'],
    variableLabels: { orderId: 'Номер заказа' },
    telegram: {
      fields: {
        title: { label: 'Заголовок', default: 'Заказ принят!' },
        message: { label: 'Текст (ручной расчёт доставки)', default: 'Заказ #{orderId} успешно создан!\n\nМы рассчитаем стоимость доставки в ближайшее время. Сертификаты будут отправлены после оплаты.' },
        messageAuto: { label: 'Текст (доставка уже рассчитана)', default: 'Заказ #{orderId} успешно создан!\n\nСтоимость доставки рассчитана. После оплаты вы получите сертификаты.' }
      }
    },
    vk: {
      fields: {
        message: { label: 'Текст (ручной расчёт доставки)', default: 'Заказ принят!\n\nЗаказ #{orderId} создан. Мы рассчитаем доставку — сертификаты отправим после оплаты.' },
        messageAuto: { label: 'Текст (доставка уже рассчитана)', default: 'Заказ принят!\n\nЗаказ #{orderId} создан. Доставка рассчитана — сертификаты отправим после оплаты.' }
      }
    },
    max: {
      fields: {
        message: { label: 'Текст (ручной расчёт доставки)', default: 'Заказ принят!\n\nЗаказ #{orderId} создан. Мы рассчитаем доставку — сертификаты отправим после оплаты.' },
        messageAuto: { label: 'Текст (доставка уже рассчитана)', default: 'Заказ принят!\n\nЗаказ #{orderId} создан. Доставка рассчитана — сертификаты отправим после оплаты.' }
      }
    },
    email: {
      fields: {
        subject: { label: 'Тема письма', default: 'Заказ #{orderId} принят' },
        heading: { label: 'Заголовок', default: 'Ваш заказ <strong style="color: #ff9500;">#{orderId}</strong> успешно создан и принят в обработку.' },
        body: { label: 'Основной текст (ручной расчёт доставки)', default: 'Мы рассчитаем стоимость доставки в ближайшее время. Сертификаты из заказа будут отправлены после оплаты.' },
        bodyAuto: { label: 'Основной текст (доставка уже рассчитана)', default: 'Стоимость доставки уже рассчитана. Вы можете оплатить заказ прямо сейчас. Сертификаты будут отправлены после оплаты.' },
        footer: { label: 'Дополнительный текст', default: 'Вы можете отслеживать статус заказа в личном кабинете.' }
      }
    }
  },

  order_confirmed: {
    group: 'orders',
    groupLabel: 'Заказы',
    label: 'Заказ подтверждён',
    description: 'Отправляется когда заказ подтверждён и ожидает оплаты',
    variables: ['orderId', 'totalPrice'],
    variableLabels: { orderId: 'Номер заказа', totalPrice: 'Сумма к оплате' },
    telegram: {
      fields: {
        title: { label: 'Заголовок', default: 'Заказ подтверждён' },
        message: { label: 'Текст', default: 'Заказ #{orderId} подтверждён и ожидает оплаты.\n\nИтого к оплате: {totalPrice} руб.\n\nПожалуйста, оплатите заказ в ближайшее время.' }
      }
    },
    vk: {
      fields: {
        message: { label: 'Текст уведомления', default: 'Заказ #{orderId} подтверждён!\n\nИтого к оплате: {totalPrice} руб. Перейдите в приложение для оплаты.' }
      }
    },
    max: {
      fields: {
        message: { label: 'Текст уведомления', default: 'Заказ #{orderId} подтверждён!\n\nИтого к оплате: {totalPrice} руб. Перейдите в приложение для оплаты.' }
      }
    },
    email: {
      fields: {
        subject: { label: 'Тема письма', default: 'Заказ #{orderId} подтверждён — ожидает оплаты' },
        heading: { label: 'Заголовок', default: 'Ваш заказ <strong style="color: #ff9500;">#{orderId}</strong> подтверждён и ожидает оплаты.' },
        body: { label: 'Основной текст', default: 'Пожалуйста, оплатите заказ в ближайшее время. Ссылка на оплату доступна на странице заказа.' }
      }
    }
  },

  delivery_cost_added: {
    group: 'orders',
    groupLabel: 'Заказы',
    label: 'Доставка рассчитана',
    description: 'Отправляется когда стоимость доставки рассчитана для заказа',
    variables: ['orderId', 'deliveryCost', 'totalPrice'],
    variableLabels: { orderId: 'Номер заказа', deliveryCost: 'Стоимость доставки', totalPrice: 'Итого к оплате' },
    telegram: {
      fields: {
        title: { label: 'Заголовок', default: 'Доставка рассчитана' },
        message: { label: 'Текст', default: 'Заказ #{orderId}\n\nСтоимость доставки: {deliveryCost} руб.\nИтого к оплате: {totalPrice} руб.\n\nПерейдите к оплате заказа.' }
      }
    },
    vk: {
      fields: {
        message: { label: 'Текст уведомления', default: 'Доставка рассчитана!\n\nЗаказ #{orderId}: доставка {deliveryCost} руб., итого {totalPrice} руб. Откройте приложение для оплаты.' }
      }
    },
    max: {
      fields: {
        message: { label: 'Текст уведомления', default: 'Доставка рассчитана!\n\nЗаказ #{orderId}: доставка {deliveryCost} руб., итого {totalPrice} руб. Откройте приложение для оплаты.' }
      }
    },
    email: {
      fields: {
        subject: { label: 'Тема письма', default: 'Заказ #{orderId} — стоимость доставки рассчитана' },
        heading: { label: 'Заголовок', default: 'Стоимость доставки для заказа <strong style="color: #ff9500;">#{orderId}</strong> рассчитана.' },
        body: { label: 'Основной текст', default: 'Для оплаты заказа перейдите на страницу заказа в личном кабинете.' }
      }
    }
  },

  // ── Payment ────────────────────────────────────────
  payment_received: {
    group: 'payment',
    groupLabel: 'Оплата',
    label: 'Оплата получена',
    description: 'Отправляется после успешной оплаты заказа (если в заказе есть сертификаты, включает коды)',
    variables: ['orderId', 'certificateCode', 'recipientName'],
    variableLabels: { orderId: 'Номер заказа', certificateCode: 'Код сертификата (если есть)', recipientName: 'Получатель сертификата (если есть)' },
    telegram: {
      fields: {
        title: { label: 'Заголовок', default: 'Оплата получена!' },
        message: { label: 'Текст', default: 'Заказ #{orderId} успешно оплачен!\n\nМы начали подготовку вашего заказа. Уведомим вас об отправке.' }
      }
    },
    vk: {
      fields: {
        message: { label: 'Текст уведомления', default: 'Оплата получена!\n\nЗаказ #{orderId} оплачен. Начинаем подготовку — уведомим об отправке.' }
      }
    },
    max: {
      fields: {
        message: { label: 'Текст уведомления', default: 'Оплата получена!\n\nЗаказ #{orderId} оплачен. Начинаем подготовку — уведомим об отправке.' }
      }
    },
    email: {
      fields: {
        subject: { label: 'Тема письма', default: 'Заказ #{orderId} — оплата получена' },
        heading: { label: 'Заголовок', default: 'Оплата заказа <strong style="color: #ff9500;">#{orderId}</strong> успешно получена.' },
        body: { label: 'Основной текст', default: 'Мы приступили к подготовке вашего заказа. Как только заказ будет отправлен, вы получите уведомление с информацией для отслеживания.' },
        footer: { label: 'Дополнительный текст', default: 'Благодарим за покупку!' }
      }
    }
  },

  // ── Shipping ───────────────────────────────────────
  order_shipped: {
    group: 'shipping',
    groupLabel: 'Доставка',
    label: 'Заказ отправлен',
    description: 'Отправляется когда заказ передан в службу доставки',
    variables: ['orderId', 'trackingNumber'],
    variableLabels: { orderId: 'Номер заказа', trackingNumber: 'Трек-номер (может отсутствовать)' },
    telegram: {
      fields: {
        title: { label: 'Заголовок', default: 'Заказ отправлен!' },
        message: { label: 'Текст', default: 'Заказ #{orderId} в пути!\n\nОтслеживайте доставку на сайте транспортной компании.' }
      }
    },
    vk: {
      fields: {
        message: { label: 'Текст уведомления', default: 'Заказ #{orderId} отправлен!\n\nОтслеживайте посылку на сайте транспортной компании.' }
      }
    },
    max: {
      fields: {
        message: { label: 'Текст уведомления', default: 'Заказ #{orderId} отправлен!\n\nОтслеживайте посылку на сайте транспортной компании.' }
      }
    },
    email: {
      fields: {
        subject: { label: 'Тема письма', default: 'Заказ #{orderId} отправлен' },
        heading: { label: 'Заголовок', default: 'Ваш заказ <strong style="color: #ff9500;">#{orderId}</strong> отправлен и находится в пути.' },
        body: { label: 'Основной текст (без трек-номера)', default: 'Информация для отслеживания будет предоставлена дополнительно.' },
        bodyWithTracking: { label: 'Основной текст (с трек-номером)', default: 'Вы можете отслеживать статус доставки на сайте транспортной компании.' }
      }
    }
  },

  // ── Cancellation & refund ──────────────────────────
  order_cancelled: {
    group: 'cancellation',
    groupLabel: 'Отмена и возврат',
    label: 'Заказ отменён',
    description: 'Отправляется при отмене заказа',
    variables: ['orderId'],
    variableLabels: { orderId: 'Номер заказа' },
    telegram: {
      fields: {
        title: { label: 'Заголовок', default: 'Заказ отменён' },
        message: { label: 'Текст', default: 'Заказ #{orderId} был отменён.\n\nЕсли у вас есть вопросы, свяжитесь с нами через FAQ.' }
      }
    },
    vk: {
      fields: {
        message: { label: 'Текст уведомления', default: 'Заказ #{orderId} отменён. По вопросам обращайтесь через раздел поддержки в приложении.' }
      }
    },
    max: {
      fields: {
        message: { label: 'Текст уведомления', default: 'Заказ #{orderId} отменён. По вопросам обращайтесь через раздел поддержки в приложении.' }
      }
    },
    email: {
      fields: {
        subject: { label: 'Тема письма', default: 'Заказ #{orderId} отменён' },
        heading: { label: 'Заголовок', default: 'Заказ <strong style="color: #ff9500;">#{orderId}</strong> был отменён.' },
        body: { label: 'Основной текст', default: 'Если у вас есть вопросы по данному заказу, пожалуйста, свяжитесь с нашей службой поддержки.' }
      }
    }
  },

  refund_processed: {
    group: 'cancellation',
    groupLabel: 'Отмена и возврат',
    label: 'Возврат оформлен',
    description: 'Отправляется после успешного оформления возврата средств',
    variables: ['orderId', 'refundAmount'],
    variableLabels: { orderId: 'Номер заказа', refundAmount: 'Сумма возврата' },
    telegram: {
      fields: {
        title: { label: 'Заголовок', default: 'Возврат оформлен' },
        message: { label: 'Текст', default: 'Возврат по заказу #{orderId} на сумму {refundAmount} руб. успешно оформлен.\n\nСредства поступят на ваш счёт в течение нескольких дней.' }
      }
    },
    vk: {
      fields: {
        message: { label: 'Текст уведомления', default: 'Возврат по заказу #{orderId} на {refundAmount} руб. оформлен. Средства поступят на счёт в течение нескольких дней.' }
      }
    },
    max: {
      fields: {
        message: { label: 'Текст уведомления', default: 'Возврат по заказу #{orderId} на {refundAmount} руб. оформлен. Средства поступят на счёт в течение нескольких дней.' }
      }
    },
    email: {
      fields: {
        subject: { label: 'Тема письма', default: 'Заказ #{orderId} — возврат оформлен' },
        heading: { label: 'Заголовок', default: 'Возврат средств по заказу <strong style="color: #ff9500;">#{orderId}</strong> успешно оформлен.' },
        body: { label: 'Основной текст', default: 'Средства поступят на ваш счёт в течение нескольких рабочих дней в зависимости от вашего банка.' }
      }
    }
  },

  // ── Product notifications ──────────────────────────
  product_available: {
    group: 'products',
    groupLabel: 'Товары',
    label: 'Товар в продаже',
    description: 'Отправляется подписавшимся пользователям, когда товар становится доступен',
    variables: ['productTitle'],
    variableLabels: { productTitle: 'Название товара' },
    telegram: {
      fields: {
        title: { label: 'Заголовок', default: 'Товар в продаже!' },
        message: { label: 'Текст', default: '{productTitle}\n\nТовар, на который вы подписались, теперь доступен для покупки!' }
      }
    },
    vk: {
      fields: {
        message: { label: 'Текст уведомления', default: '{productTitle} теперь в продаже! Откройте приложение, чтобы оформить заказ.' }
      }
    },
    max: {
      fields: {
        message: { label: 'Текст уведомления', default: '{productTitle} теперь в продаже! Откройте приложение, чтобы оформить заказ.' }
      }
    },
    email: {
      fields: {
        subject: { label: 'Тема письма', default: '{productTitle} — теперь в продаже' },
        heading: { label: 'Заголовок', default: 'Товар, на который вы подписались, теперь доступен для покупки:' },
        body: { label: 'Основной текст', default: 'Перейдите на страницу товара, чтобы оформить заказ.' }
      }
    }
  },

  // ── Support & feedback ─────────────────────────────
  contact_request: {
    group: 'support',
    groupLabel: 'Поддержка',
    label: 'Запрос связи',
    description: 'Отправляется админом пользователю, когда нужно связаться по заказу (статус on_hold)',
    variables: ['orderId', 'customMessage'],
    variableLabels: { orderId: 'Номер заказа', customMessage: 'Сообщение от админа (заменяет текст целиком)' },
    telegram: {
      fields: {
        title: { label: 'Заголовок', default: 'Свяжитесь с нами' },
        message: { label: 'Текст по умолчанию', default: 'По вашему заказу #{orderId} требуется связь с поддержкой.' }
      }
    },
    vk: {
      fields: {
        message: { label: 'Текст уведомления', default: 'По заказу #{orderId} требуется связь с поддержкой. Пожалуйста, откройте приложение.' }
      }
    },
    max: {
      fields: {
        message: { label: 'Текст уведомления', default: 'По заказу #{orderId} требуется связь с поддержкой. Пожалуйста, откройте приложение.' }
      }
    },
    email: {
      fields: {
        subject: { label: 'Тема письма', default: 'Заказ #{orderId} — требуется связь' },
        heading: { label: 'Заголовок по умолчанию', default: 'По вашему заказу <strong style="color: #ff9500;">#{orderId}</strong> требуется связь с нашей службой поддержки.' },
        body: { label: 'Основной текст', default: 'Пожалуйста, свяжитесь с нами удобным для вас способом.' }
      }
    }
  },

  admin_response: {
    group: 'support',
    groupLabel: 'Поддержка',
    label: 'Ответ на отзыв',
    description: 'Отправляется пользователю, когда админ отвечает на рецензию, комментарий или предложение',
    variables: ['productTitle', 'responseText', 'reviewType'],
    variableLabels: { productTitle: 'Название товара', responseText: 'Текст ответа админа', reviewType: 'Тип (review/comment/suggestion)' },
    telegram: {
      fields: {
        title: { label: 'Заголовок', default: 'Ответ магазина' },
        message: { label: 'Текст', default: 'Ответ на вашу {typeLabel}{productSuffix}:\n\n{responseText}' }
      }
    },
    vk: {
      fields: {
        message: { label: 'Текст уведомления', default: 'Ответ магазина на вашу {typeLabel}{productSuffix}:\n\n{responseText}' }
      }
    },
    max: {
      fields: {
        message: { label: 'Текст уведомления', default: 'Ответ магазина на вашу {typeLabel}{productSuffix}:\n\n{responseText}' }
      }
    },
    email: {
      fields: {
        subject: { label: 'Тема письма', default: 'Ответ на вашу {typeLabel}{productSuffix}' },
        heading: { label: 'Заголовок', default: 'Вы получили ответ на вашу {typeLabel}{productSuffix}:' },
        footer: { label: 'Дополнительный текст', default: 'Благодарим за обратную связь!' }
      }
    }
  },

  // ── Parcel storage & returns ───────────────────────
  parcel_at_pickup_point: {
    group: 'shipping',
    groupLabel: 'Доставка',
    label: 'Посылка в пункте выдачи',
    description: 'Отправляется, когда посылка прибывает в пункт выдачи — начинается отсчёт срока хранения',
    variables: ['orderId', 'storageDays', 'providerName'],
    variableLabels: { orderId: 'Номер заказа', storageDays: 'Дней хранения', providerName: 'Название службы доставки' },
    telegram: {
      fields: {
        title: { label: 'Заголовок', default: 'Посылка ждёт вас!' },
        message: { label: 'Текст', default: 'Заказ #{orderId} прибыл в пункт выдачи ({providerName}).\n\nСрок хранения: {storageDays} дней.\n\nЗаберите посылку вовремя!\n\nБудем рады вашему отзыву — он поможет другим покупателям!' }
      }
    },
    vk: {
      fields: {
        message: { label: 'Текст уведомления', default: 'Заказ #{orderId} прибыл в пункт выдачи ({providerName}). Срок хранения: {storageDays} дней.\n\nБудем рады вашему отзыву!' }
      }
    },
    max: {
      fields: {
        message: { label: 'Текст уведомления', default: 'Заказ #{orderId} прибыл в пункт выдачи ({providerName}). Срок хранения: {storageDays} дней.\n\nБудем рады вашему отзыву!' }
      }
    },
    email: {
      fields: {
        subject: { label: 'Тема письма', default: 'Заказ #{orderId} — посылка прибыла' },
        heading: { label: 'Заголовок', default: 'Ваш заказ <strong style="color: #ff9500;">#{orderId}</strong> прибыл в пункт выдачи ({providerName}).' },
        body: { label: 'Основной текст', default: 'Пожалуйста, заберите посылку вовремя. Если посылку не получат, она будет возвращена отправителю.' },
        footer: { label: 'Дополнительный текст', default: 'Поторопитесь!' }
      }
    }
  },

  storage_pickup_reminder: {
    group: 'shipping',
    groupLabel: 'Доставка',
    label: 'Напоминание о получении',
    description: 'Отправляется каждые 5 дней, пока посылка не получена',
    variables: ['orderId', 'daysLeft', 'providerName'],
    variableLabels: { orderId: 'Номер заказа', daysLeft: 'Дней до истечения хранения', providerName: 'Название службы доставки' },
    telegram: {
      fields: {
        title: { label: 'Заголовок', default: 'Напоминание о посылке' },
        message: { label: 'Текст', default: 'Заказ #{orderId} всё ещё ждёт вас в пункте выдачи ({providerName}).\n\nОсталось дней хранения: {daysLeft}.\n\nПожалуйста, заберите посылку как можно скорее.' }
      }
    },
    vk: {
      fields: {
        message: { label: 'Текст уведомления', default: 'Заказ #{orderId} ждёт в пункте выдачи ({providerName}). Осталось дней: {daysLeft}.' }
      }
    },
    max: {
      fields: {
        message: { label: 'Текст уведомления', default: 'Заказ #{orderId} ждёт в пункте выдачи ({providerName}). Осталось дней: {daysLeft}.' }
      }
    },
    email: {
      fields: {
        subject: { label: 'Тема письма', default: 'Заказ #{orderId} — напоминание о посылке' },
        heading: { label: 'Заголовок', default: 'Ваш заказ <strong style="color: #ff9500;">#{orderId}</strong> всё ещё ожидает получения в пункте выдачи ({providerName}).' },
        body: { label: 'Основной текст', default: 'Если посылку не получат до истечения срока хранения, она будет возвращена отправителю.' }
      }
    }
  },

  parcel_returned_to_sender: {
    group: 'shipping',
    groupLabel: 'Доставка',
    label: 'Посылка возвращена',
    description: 'Отправляется, когда посылка возвращена отправителю — пользователь выбирает дальнейшее действие',
    variables: ['orderId', 'deliveryCost'],
    variableLabels: { orderId: 'Номер заказа', deliveryCost: 'Стоимость доставки (руб.)' },
    telegram: {
      fields: {
        title: { label: 'Заголовок', default: 'Посылка возвращена' },
        message: { label: 'Текст', default: 'Заказ #{orderId} был возвращён отправителю.\n\nВарианты:\n1. Повторная доставка — двойная стоимость доставки\n2. Отмена — возврат стоимости товаров (без доставки)\n\nПерейдите в заказ и выберите вариант.' }
      }
    },
    vk: {
      fields: {
        message: { label: 'Текст уведомления', default: 'Заказ #{orderId} возвращён отправителю. Выберите вариант в приложении: повторная доставка или возврат за товары.' }
      }
    },
    max: {
      fields: {
        message: { label: 'Текст уведомления', default: 'Заказ #{orderId} возвращён отправителю. Выберите вариант в приложении: повторная доставка или возврат за товары.' }
      }
    },
    email: {
      fields: {
        subject: { label: 'Тема письма', default: 'Заказ #{orderId} — посылка возвращена' },
        heading: { label: 'Заголовок', default: 'Ваш заказ <strong style="color: #ff9500;">#{orderId}</strong> был возвращён отправителю.' },
        body: { label: 'Основной текст', default: 'Пожалуйста, перейдите в заказ и выберите подходящий вариант: повторная доставка (двойная стоимость) или отмена с возвратом стоимости товаров.' }
      }
    }
  },

  // ── Certificates ───────────────────────────────────
  certificate_delivered: {
    group: 'orders',
    groupLabel: 'Заказы',
    label: 'Изображение сертификата готово',
    description: 'Отправляется когда изображение сертификата загружено после оплаты (если генерация не успела при оплате)',
    variables: ['orderId', 'certificateCode', 'recipientName'],
    variableLabels: { orderId: 'Номер заказа', certificateCode: 'Код сертификата', recipientName: 'Имя получателя (если указано)' },
    telegram: {
      fields: {
        title: { label: 'Заголовок', default: 'Изображение сертификата готово!' },
        message: { label: 'Текст', default: 'Изображение сертификата по заказу #{orderId} готово.\n\n<b>Код:</b> <code>{certificateCode}</code>' }
      }
    },
    vk: {
      fields: {
        message: { label: 'Текст уведомления', default: 'Изображение сертификата по заказу #{orderId} готово! Код: {certificateCode}.' }
      }
    },
    max: {
      fields: {
        message: { label: 'Текст уведомления', default: 'Изображение сертификата по заказу #{orderId} готово! Код: {certificateCode}.' }
      }
    },
    email: {
      fields: {
        subject: { label: 'Тема письма', default: 'Изображение сертификата по заказу #{orderId} готово' },
        heading: { label: 'Заголовок', default: 'Изображение сертификата по заказу <strong style="color: #ff9500;">#{orderId}</strong> готово.' },
        body: { label: 'Основной текст', default: '' }
      }
    }
  }
};

/**
 * Get the ordered list of groups for UI rendering
 */
function getTemplateGroups() {
  const groupOrder = ['orders', 'payment', 'shipping', 'cancellation', 'products', 'support'];
  const groups = {};

  for (const [type, reg] of Object.entries(NotificationTemplateRegistry)) {
    if (!groups[reg.group]) {
      groups[reg.group] = { label: reg.groupLabel, types: [] };
    }
    groups[reg.group].types.push({ type, ...reg });
  }

  return groupOrder.filter(g => groups[g]).map(g => ({ key: g, ...groups[g] }));
}

/**
 * Replace {variable} placeholders in a template string with actual values
 */
function applyTemplateVariables(template, data) {
  if (!template) return '';
  return template
    .replace(/\{orderId\}/g, data.orderId || '')
    .replace(/#\{orderId\}/g, `#${data.orderId || ''}`)
    .replace(/\{totalPrice\}/g, data.totalPrice || '')
    .replace(/\{deliveryCost\}/g, data.deliveryCost || '')
    .replace(/\{trackingNumber\}/g, data.trackingNumber || '')
    .replace(/\{productTitle\}/g, data.productTitle || '')
    .replace(/\{customMessage\}/g, data.customMessage || '')
    .replace(/\{refundAmount\}/g, data.refundAmount || '')
    .replace(/\{responseText\}/g, data.responseText || '')
    .replace(/\{typeLabel\}/g, data.typeLabel || '')
    .replace(/\{productSuffix\}/g, data.productSuffix || '')
    .replace(/\{storageDays\}/g, data.storageDays || '')
    .replace(/\{providerName\}/g, data.providerName || '')
    .replace(/\{daysLeft\}/g, data.daysLeft || '')
    .replace(/\{certificateCode\}/g, data.certificateCode || '')
    .replace(/\{recipientName\}/g, data.recipientName || '');
}

// In-memory cache for DB template overrides (refreshed on save)
let _templateOverridesCache = null;
let _templateOverridesCacheTime = 0;
const TEMPLATE_CACHE_TTL = 60000; // 1 minute

/**
 * Load template overrides from DB
 */
async function loadTemplateOverrides() {
  const now = Date.now();
  if (_templateOverridesCache && (now - _templateOverridesCacheTime) < TEMPLATE_CACHE_TTL) {
    return _templateOverridesCache;
  }

  try {
    const { getPool } = require('./db');
    const pool = getPool();
    const result = await pool.query(
      "SELECT value FROM app_settings WHERE key = 'notification_templates'"
    );
    if (result.rows.length > 0) {
      _templateOverridesCache = result.rows[0].value;
    } else {
      _templateOverridesCache = {};
    }
    _templateOverridesCacheTime = now;
    return _templateOverridesCache;
  } catch (err) {
    console.error('Failed to load notification template overrides:', err.message);
    return {};
  }
}

/**
 * Invalidate template cache (called when admin saves changes)
 */
function invalidateTemplateCache() {
  _templateOverridesCache = null;
  _templateOverridesCacheTime = 0;
}

/**
 * Get a template field value: DB override if set, otherwise registry default
 */
function getFieldValue(overrides, type, channel, field) {
  const override = overrides?.[type]?.[channel]?.[field];
  if (override !== undefined && override !== null && override !== '') {
    return override;
  }
  return NotificationTemplateRegistry[type]?.[channel]?.fields?.[field]?.default || '';
}

module.exports = {
  NotificationType,
  EmailCategory,
  sendNotification,
  sendAdminNotification,
  sendTelegramNotification,
  sendEmailNotification,
  sendVKNotification,
  sendMAXNotification,
  getSharingConfig,
  // Export for testing/direct use
  getTelegramContent,
  getEmailContent,
  getVKContent,
  getMAXContent,
  getCategoryForType,
  // Template registry
  NotificationTemplateRegistry,
  getTemplateGroups,
  applyTemplateVariables,
  loadTemplateOverrides,
  invalidateTemplateCache,
  getFieldValue
};
