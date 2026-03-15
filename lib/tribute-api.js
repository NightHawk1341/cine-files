const { config } = require('./config');

const MOCK_PRODUCTS = [
  {
    id: 1,
    name: 'Фигурка — Тестовый продукт',
    price: 2999,
    imageUrl: '/icons/placeholder.svg',
    url: 'https://buy-tribute.com/products/1',
  },
];

/**
 * Fetch products from TR-BUTE by IDs.
 * @param {number[]} ids
 * @returns {Promise<Array>}
 */
async function fetchTributeProducts(ids) {
  if (config.isDev) {
    return MOCK_PRODUCTS.filter((p) => ids.includes(p.id));
  }

  try {
    const response = await fetch(
      `${config.tribute.apiUrl}/products/by-ids?ids=${ids.join(',')}`
    );
    if (!response.ok) return [];
    return response.json();
  } catch {
    return [];
  }
}

/**
 * Check if a user exists in TR-BUTE by OAuth provider.
 * @param {string} provider
 * @param {string} providerId
 * @returns {Promise<number|null>}
 */
async function checkTributeUser(provider, providerId) {
  if (config.isDev) return null;

  try {
    const response = await fetch(
      `${config.tribute.apiUrl}/users/by-provider?provider=${provider}&id=${providerId}`
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data.id ?? null;
  } catch {
    return null;
  }
}

module.exports = { fetchTributeProducts, checkTributeUser };
