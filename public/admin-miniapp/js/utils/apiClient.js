/**
 * API Client for CineFiles Admin Mini-App
 * Browser-only — uses credentials: 'include' for cookie auth
 */

import { API_BASE } from '../config.js';

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 2000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function apiFetch(url, options = {}) {
  const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;

  const headers = { ...options.headers };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

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

      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }

      lastResponse = response;

      if (noRetry || attempt === MAX_RETRIES) {
        return response;
      }

      const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
      await sleep(delay);

    } catch (error) {
      lastError = error;

      if (noRetry || attempt === MAX_RETRIES) {
        throw error;
      }

      const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
      await sleep(delay);
    }
  }

  if (lastResponse) return lastResponse;
  if (lastError) throw lastError;
  throw new Error('Unknown API error');
}

export async function apiGet(url, options = {}) {
  return apiFetch(url, { ...options, method: 'GET' });
}

export async function apiPost(url, data, options = {}) {
  return apiFetch(url, { ...options, method: 'POST', body: JSON.stringify(data) });
}

export async function apiPut(url, data, options = {}) {
  return apiFetch(url, { ...options, method: 'PUT', body: JSON.stringify(data) });
}

export async function apiPatch(url, data, options = {}) {
  return apiFetch(url, { ...options, method: 'PATCH', body: JSON.stringify(data) });
}

export async function apiDelete(url, options = {}) {
  return apiFetch(url, { ...options, method: 'DELETE' });
}

export default { fetch: apiFetch, get: apiGet, post: apiPost, put: apiPut, patch: apiPatch, delete: apiDelete };
