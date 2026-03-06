/**
 * API: Get Available Shipping Services
 *
 * GET /api/shipping/services
 *
 * Returns list of available shipping services from database configuration.
 */

const { getPool } = require('../../lib/db');
const shippingService = require('../../server/services/shipping');

const pool = getPool();

module.exports = async function handler(req, res) {
  // CORS handled by global middleware in server.js

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { visibleOnly = 'true' } = req.query;

    // Get services from database
    const services = await shippingService.getAvailableServices(
      pool,
      visibleOnly === 'true'
    );

    // Check delivery method toggles from app settings
    const settingsResult = await pool.query(
      "SELECT value FROM app_settings WHERE key = 'delivery_methods'"
    );

    const deliverySettings = settingsResult.rows[0]?.value || {};

    // Filter out disabled services
    // Settings format: { pochta: { enabled: true }, cdek: { enabled: true }, ... }
    const filteredServices = services.filter(service => {
      const providerCode = service.provider_code;

      // Check if provider is explicitly disabled in settings
      if (deliverySettings[providerCode] && deliverySettings[providerCode].enabled === false) {
        return false;
      }

      // Legacy format check: pochta_disabled, cdek_disabled
      if (deliverySettings[`${providerCode}_disabled`]) {
        return false;
      }
      if (deliverySettings[`${service.code}_disabled`]) {
        return false;
      }

      // Check for courier_ems and international
      if (providerCode === 'ems' && deliverySettings.courier_ems?.enabled === false) {
        return false;
      }
      if (providerCode === 'international' && deliverySettings.international?.enabled === false) {
        return false;
      }

      // Check individual service code (e.g. cdek_pvz, pochta_standard, etc.)
      if (deliverySettings[service.code]?.enabled === false) {
        return false;
      }

      return true;
    });

    // Group by provider
    const groupedServices = filteredServices.reduce((acc, service) => {
      const providerCode = service.provider_code;
      if (!acc[providerCode]) {
        acc[providerCode] = {
          code: providerCode,
          name: service.provider_name,
          services: []
        };
      }
      acc[providerCode].services.push({
        id: service.id,
        code: service.code,
        internalCode: service.internal_code,
        name: service.display_name,
        description: service.description,
        priority: service.priority
      });
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      data: {
        providers: Object.values(groupedServices),
        totalServices: filteredServices.length
      }
    });

  } catch (error) {
    console.error('Get shipping services error:', error);

    // Return default services if database fails
    res.status(200).json({
      success: true,
      data: {
        providers: [
          {
            code: 'pochta',
            name: 'Почта России',
            services: [
              { code: 'pochta_standard', name: 'До отделения Почты', description: 'Доставка до почтового отделения' },
              { code: 'pochta_courier', name: 'Курьером Почты', description: 'Доставка курьером до двери' },
              { code: 'pochta_first_class', name: 'До отделения Почты - 1 класс', description: 'Ускоренная доставка' }
            ]
          },
          {
            code: 'cdek',
            name: 'СДЭК',
            services: [
              { code: 'cdek_pvz', name: 'До ПВЗ CDEK', description: 'Доставка до пункта выдачи' },
              { code: 'cdek_courier', name: 'Курьером CDEK', description: 'Доставка курьером до двери' }
            ]
          }
        ],
        totalServices: 5,
        fallback: true
      }
    });
  }
};
