/**
 * API Client for Admin Mini-App
 *
 * Provides authenticated fetch wrapper that automatically includes
 * Telegram initData header for API authentication, with retry logic
 * for network failures.
 */

import { tg, isBrowserMode, API_BASE } from '../config.js';

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 2000;

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get authentication headers for API requests
 * Includes Telegram initData for mini-app authentication
 */
function getAuthHeaders() {
  const headers = {
    'Content-Type': 'application/json'
  };

  // Add Telegram initData header if available (for Telegram Mini App)
  if (!isBrowserMode() && tg?.initData) {
    headers['X-Telegram-Init-Data'] = tg.initData;
  }

  return headers;
}

/**
 * Make authenticated API request with automatic retry on failure
 *
 * @param {string} url - API endpoint (relative or absolute)
 * @param {Object} options - Fetch options
 * @param {boolean} options.noRetry - Disable retry for this request
 * @returns {Promise<Response>}
 */
export async function apiFetch(url, options = {}) {
  // Ensure URL starts with API_BASE if it's a relative path
  const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;

  // Merge auth headers with any provided headers
  const headers = {
    ...getAuthHeaders(),
    ...options.headers
  };

  // Include credentials for cookie-based auth in browser
  const { noRetry, ...restOptions } = options;
  const fetchOptions = {
    ...restOptions,
    headers,
    credentials: 'include'
  };

  let lastError = null;
  let lastResponse = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(fullUrl, fetchOptions);

      // Success or client error (4xx) - don't retry
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }

      // Server error (5xx) - might retry
      lastResponse = response;

      if (noRetry || attempt === MAX_RETRIES) {
        return response;
      }

      // Wait before retry with exponential backoff
      const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
      console.warn(`API request failed (${response.status}), retrying in ${delay}ms... (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await sleep(delay);

    } catch (error) {
      lastError = error;

      if (noRetry || attempt === MAX_RETRIES) {
        throw error;
      }

      // Wait before retry with exponential backoff
      const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
      console.warn(`API request failed (network error), retrying in ${delay}ms... (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await sleep(delay);
    }
  }

  // Should not reach here, but return last response or throw last error
  if (lastResponse) return lastResponse;
  if (lastError) throw lastError;
  throw new Error('Unknown API error');
}

/**
 * Make authenticated GET request
 *
 * @param {string} url - API endpoint
 * @param {Object} options - Additional fetch options
 * @returns {Promise<Response>}
 */
export async function apiGet(url, options = {}) {
  return apiFetch(url, {
    ...options,
    method: 'GET'
  });
}

/**
 * Make authenticated POST request
 *
 * @param {string} url - API endpoint
 * @param {Object} data - Request body data
 * @param {Object} options - Additional fetch options
 * @returns {Promise<Response>}
 */
export async function apiPost(url, data, options = {}) {
  return apiFetch(url, {
    ...options,
    method: 'POST',
    body: JSON.stringify(data)
  });
}

/**
 * Make authenticated PUT request
 *
 * @param {string} url - API endpoint
 * @param {Object} data - Request body data
 * @param {Object} options - Additional fetch options
 * @returns {Promise<Response>}
 */
export async function apiPut(url, data, options = {}) {
  return apiFetch(url, {
    ...options,
    method: 'PUT',
    body: JSON.stringify(data)
  });
}

/**
 * Make authenticated PATCH request
 *
 * @param {string} url - API endpoint
 * @param {Object} data - Request body data
 * @param {Object} options - Additional fetch options
 * @returns {Promise<Response>}
 */
export async function apiPatch(url, data, options = {}) {
  return apiFetch(url, {
    ...options,
    method: 'PATCH',
    body: JSON.stringify(data)
  });
}

/**
 * Make authenticated DELETE request
 *
 * @param {string} url - API endpoint
 * @param {Object} options - Additional fetch options
 * @returns {Promise<Response>}
 */
export async function apiDelete(url, options = {}) {
  return apiFetch(url, {
    ...options,
    method: 'DELETE'
  });
}

// Default export for convenience
export default {
  fetch: apiFetch,
  get: apiGet,
  post: apiPost,
  put: apiPut,
  patch: apiPatch,
  delete: apiDelete
};
