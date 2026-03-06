// CDEK PVZ autocomplete and postal index field management
//
// Dep injected via initPvzDeps():
//   triggerShippingCalculation - trigger debounced shipping calculation

import { getState } from './state.js';
import { hidePvzSuggestions, updatePvzSummary } from './ui.js';
import { escapeHtml } from './utils.js';

const shippingState = getState();

let _triggerShippingCalculation;

export function initPvzDeps({ triggerShippingCalculation }) {
  _triggerShippingCalculation = triggerShippingCalculation;
}

let pvzDebounceTimer = null;

/**
 * Initialize CDEK PVZ autocomplete on the postal index field
 * When CDEK + PVZ is selected, the field becomes a PVZ search input
 */
export function initPvzAutocomplete() {
  const postalInput = document.getElementById('order-postal-index');
  if (!postalInput) return;

  // Create suggestions container for PVZ
  let pvzSuggestionsContainer = document.getElementById('pvz-suggestions');
  if (!pvzSuggestionsContainer) {
    pvzSuggestionsContainer = document.createElement('div');
    pvzSuggestionsContainer.id = 'pvz-suggestions';
    pvzSuggestionsContainer.className = 'address-suggestions pvz-suggestions';
    pvzSuggestionsContainer.style.display = 'none';
    const wrapper = postalInput.closest('.postal-input-wrapper');
    if (wrapper) {
      wrapper.style.position = 'relative';
      wrapper.appendChild(pvzSuggestionsContainer);
    }
  }

  // Input handler for PVZ search
  postalInput.addEventListener('input', () => {
    // Only enable PVZ autocomplete for CDEK + PVZ delivery
    if (shippingState.provider !== 'cdek' || shippingState.deliveryType !== 'pvz') {
      hidePvzSuggestions();
      return;
    }

    const query = postalInput.value.trim();

    if (pvzDebounceTimer) {
      clearTimeout(pvzDebounceTimer);
    }

    // Don't search for very short queries
    if (query.length < 2) {
      hidePvzSuggestions();
      return;
    }

    pvzDebounceTimer = setTimeout(() => {
      fetchPvzSuggestions(query);
    }, 300);
  });

  // Close suggestions on blur
  postalInput.addEventListener('blur', () => {
    setTimeout(() => {
      hidePvzSuggestions();
    }, 200);
  });

  // Close on escape
  postalInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hidePvzSuggestions();
    }
  });
}

/**
 * Fetch PVZ suggestions from CDEK API
 */
async function fetchPvzSuggestions(query) {
  const pvzSuggestionsContainer = document.getElementById('pvz-suggestions');
  if (!pvzSuggestionsContainer) return;

  // Get city from selected address for better results
  const city = shippingState.selectedAddress?.city ||
               shippingState.selectedAddress?.data?.city ||
               shippingState.selectedAddress?.data?.settlement || '';

  try {
    // Search by city if available, otherwise use query as city
    const searchCity = city || query;
    const response = await fetch(`/api/shipping/points?provider=cdek&city=${encodeURIComponent(searchCity)}&limit=10`);
    const result = await response.json();

    if (!response.ok || !result.success || !result.data?.points?.length) {
      hidePvzSuggestions();
      return;
    }

    // Filter points by query (code or address match)
    let points = result.data.points;
    if (query && city) {
      const lowerQuery = query.toLowerCase();
      points = points.filter(p =>
        p.code?.toLowerCase().includes(lowerQuery) ||
        p.address?.toLowerCase().includes(lowerQuery) ||
        p.name?.toLowerCase().includes(lowerQuery)
      );
    }

    if (points.length === 0) {
      hidePvzSuggestions();
      return;
    }

    renderPvzSuggestions(points.slice(0, 7));

  } catch (error) {
    console.error('[Shipping] PVZ suggestion error:', error);
    hidePvzSuggestions();
  }
}

/**
 * Render PVZ suggestions dropdown
 */
function renderPvzSuggestions(points) {
  const pvzSuggestionsContainer = document.getElementById('pvz-suggestions');
  if (!pvzSuggestionsContainer) return;

  pvzSuggestionsContainer.innerHTML = '';

  points.forEach(point => {
    const item = document.createElement('div');
    item.className = 'address-suggestion-item pvz-suggestion-item';

    item.innerHTML = `
      <div class="pvz-suggestion-main">
        <span class="pvz-code">${escapeHtml(point.code)}</span>
        <span class="pvz-name">${escapeHtml(point.name || '')}</span>
      </div>
      <div class="pvz-suggestion-address">${escapeHtml(point.address || '')}</div>
      ${point.workTime ? `<div class="pvz-suggestion-worktime">${escapeHtml(point.workTime)}</div>` : ''}
    `;

    item.addEventListener('click', () => {
      selectPvzFromAutocomplete(point);
    });

    pvzSuggestionsContainer.appendChild(item);
  });

  pvzSuggestionsContainer.style.display = 'block';
}

/**
 * Handle PVZ selection from autocomplete
 */
function selectPvzFromAutocomplete(point) {
  const postalInput = document.getElementById('order-postal-index');

  // Store selected PVZ (including its postal code for calculation)
  shippingState.selectedPvz = {
    code: point.code,
    name: point.name,
    address: point.address,
    postalCode: point.postalCode,
    workTime: point.workTime
  };

  // Update input with PVZ address (not code) for clarity
  if (postalInput) {
    postalInput.value = point.address;
  }

  // Store PVZ code in hidden field
  const pvzCodeInput = document.getElementById('selected-pvz-code');
  if (pvzCodeInput) pvzCodeInput.value = point.code || '';

  // Show PVZ summary below the input
  updatePvzSummary(point.name || point.code, point.address, point.workTime);

  hidePvzSuggestions();

  // Hide the cdek-pvz-suggestions if visible
  const cdekSuggestions = document.getElementById('cdek-pvz-suggestions');
  if (cdekSuggestions) {
    cdekSuggestions.style.display = 'none';
  }

  // Trigger calculation with selected PVZ
  _triggerShippingCalculation();
}

/**
 * Update postal index field based on provider and delivery type
 */
export function updatePostalIndexField() {
  const postalInput = document.getElementById('order-postal-index');
  const postalLabel = document.getElementById('postal-label-text');
  const postalGroup = document.getElementById('postal-index-group');
  const pvzBtn = document.getElementById('open-pvz-btn');

  if (!postalInput || !postalLabel) return;

  const isCdekPvz = shippingState.provider === 'cdek' && shippingState.deliveryType === 'pvz';
  const isPochtaPvz = shippingState.provider === 'pochta' && shippingState.deliveryType === 'pvz';

  if (isCdekPvz) {
    // CDEK + PVZ: searchable PVZ field
    postalLabel.textContent = 'Пункт выдачи';
    postalInput.placeholder = 'Адрес пункта выдачи';
    postalInput.maxLength = 100;
    postalInput.value = ''; // Clear when switching
    if (pvzBtn) pvzBtn.style.display = 'flex';
  } else if (isPochtaPvz) {
    // Pochta + PVZ (to post office): postal code only
    postalLabel.textContent = 'Почтовый индекс';
    postalInput.placeholder = 'Индекс';
    postalInput.maxLength = 6;
    if (pvzBtn) pvzBtn.style.display = 'none'; // No PVZ selection for Pochta
  } else {
    // Courier delivery: postal code
    postalLabel.textContent = 'Почтовый индекс';
    postalInput.placeholder = 'Индекс';
    postalInput.maxLength = 6;
    if (pvzBtn) pvzBtn.style.display = 'none';
  }

  // Clear PVZ state when switching
  if (!isCdekPvz) {
    hidePvzSuggestions();
  }
}

