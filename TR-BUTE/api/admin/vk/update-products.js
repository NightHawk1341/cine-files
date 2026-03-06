/**
 * POST /api/admin/vk/update-products
 *
 * Mass-updates the description of all products in a VK community market.
 *
 * Body: { community: 1|2, description: string }
 *
 * Env vars used:
 *   community=1  →  VK_COMMUNITY_ID  + VK_COMMUNITY_TOKEN
 *   community=2  →  VK_COMMUNITY_ID_2 + VK_COMMUNITY_TOKEN_2
 *
 * Token: community API token with market permission enabled (from community settings → API).
 *
 * VK rate limit: ~3 req/s for market.edit — we use a 350ms delay between calls.
 */

const axios = require('axios');

const VK_API = 'https://api.vk.com/method';
const VK_API_VERSION = '5.199';
const EDIT_DELAY_MS = 350;
const MAX_PER_PAGE = 200;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAllProducts(ownerId, token) {
  const items = [];
  let offset = 0;

  for (;;) {
    const resp = await axios.get(`${VK_API}/market.get`, {
      params: {
        owner_id: ownerId,
        count: MAX_PER_PAGE,
        offset,
        extended: 0,
        access_token: token,
        v: VK_API_VERSION
      }
    });

    // VK returns { error: {...} } on auth/permission failures
    if (resp.data?.error) {
      const e = resp.data.error;
      const err = new Error(`VK API error ${e.error_code}: ${e.error_msg}`);
      err.vkError = e;
      throw err;
    }

    const data = resp.data?.response;
    if (!data || !Array.isArray(data.items)) break;

    items.push(...data.items);

    if (items.length >= data.count || data.items.length < MAX_PER_PAGE) break;
    offset += MAX_PER_PAGE;
  }

  return items;
}

async function editProduct(ownerId, itemId, name, description, token) {
  const body = new URLSearchParams({
    owner_id: ownerId,
    item_id: itemId,
    name,
    description,
    access_token: token,
    v: VK_API_VERSION
  });
  const resp = await axios.post(`${VK_API}/market.edit`, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  return resp.data;
}

module.exports = async function handler(req, res) {
  const { community, description } = req.body || {};

  if (!community || typeof description !== 'string') {
    return res.status(400).json({ error: 'community and description are required' });
  }
  if (community !== 1 && community !== 2) {
    return res.status(400).json({ error: 'community must be 1 or 2' });
  }
  if (description.length > 4096) {
    return res.status(400).json({ error: 'description too long (max 4096 chars)' });
  }

  const suffix = community === 2 ? '_2' : '';
  const communityId = process.env[`VK_COMMUNITY_ID${suffix}`];
  const communityToken = process.env[`VK_COMMUNITY_TOKEN${suffix}`];

  if (!communityId) {
    return res.status(503).json({ error: `VK_COMMUNITY_ID${suffix} not configured` });
  }
  if (!communityToken) {
    return res.status(503).json({ error: `VK_COMMUNITY_TOKEN${suffix} not configured` });
  }

  const ownerId = `-${communityId}`;

  let products;
  try {
    products = await fetchAllProducts(ownerId, communityToken);
  } catch (err) {
    const vkError = err.response?.data?.error;
    console.error('VK market.get error:', vkError || err.message);
    return res.status(502).json({
      error: 'Failed to fetch VK products',
      vk_error: vkError ? `${vkError.error_code}: ${vkError.error_msg}` : err.message
    });
  }

  if (products.length === 0) {
    return res.status(200).json({ updated: 0, errors: 0, total: 0, message: 'No products found in this community' });
  }

  let updated = 0;
  let errors = 0;
  const errorDetails = [];

  for (const product of products) {
    try {
      await sleep(EDIT_DELAY_MS);
      const result = await editProduct(ownerId, product.id, product.title, description, communityToken);

      if (result?.error) {
        errors++;
        errorDetails.push({ id: product.id, title: product.title, error: `${result.error.error_code}: ${result.error.error_msg}` });
      } else {
        updated++;
      }
    } catch (err) {
      errors++;
      const vkError = err.response?.data?.error;
      errorDetails.push({
        id: product.id,
        title: product.title,
        error: vkError ? `${vkError.error_code}: ${vkError.error_msg}` : err.message
      });
    }
  }

  return res.status(200).json({
    updated,
    errors,
    total: products.length,
    ...(errorDetails.length > 0 ? { error_details: errorDetails } : {})
  });
};
