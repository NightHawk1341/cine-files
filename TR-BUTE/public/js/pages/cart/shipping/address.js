/**
 * shipping/address.js
 * Address autocomplete (DaData), suggestion rendering, and address selection.
 */

import { getState, setAddressDebounceTimer, getAddressDebounceTimer } from './state.js';
import { escapeHtml } from './utils.js';
import {
  hideSuggestions,
  showSuggestedPostalCode,
  hideSuggestedPostalCode,
  showPostalAddressHint,
  hideInternationalWarning,
  enableProviderButtons,
  hidePostalAddressHint,
} from './ui.js';

// These are set by the main module to avoid circular deps
let _triggerShippingCalculation = null;
let _handleInternationalAddress = null;
let _fetchCdekPvzForAddress = null;
let _createUnifiedMap = null;

/**
 * Inject callback references from the main module to avoid circular dependencies.
 */
export function setAddressCallbacks({ triggerShippingCalculation, handleInternationalAddress, fetchCdekPvzForAddress, createUnifiedMap }) {
  _triggerShippingCalculation = triggerShippingCalculation;
  _handleInternationalAddress = handleInternationalAddress;
  _fetchCdekPvzForAddress = fetchCdekPvzForAddress;
  _createUnifiedMap = createUnifiedMap;
}

/**
 * Initialize address autocomplete on the address input field
 */
export function initAddressAutocomplete() {
  const addressInput = document.getElementById('order-address');
  if (!addressInput) return;

  // Create suggestions container
  let suggestionsContainer = document.getElementById('address-suggestions');
  if (!suggestionsContainer) {
    suggestionsContainer = document.createElement('div');
    suggestionsContainer.id = 'address-suggestions';
    suggestionsContainer.className = 'address-suggestions';
    suggestionsContainer.style.display = 'none';
    addressInput.parentElement.style.position = 'relative';
    addressInput.parentElement.appendChild(suggestionsContainer);
  }

  // Input handler with debounce
  addressInput.addEventListener('input', () => {
    const state = getState();
    const query = addressInput.value.trim();

    // Clear previous timer
    const timer = getAddressDebounceTimer();
    if (timer) {
      clearTimeout(timer);
    }

    // Don't use DaData for international delivery
    if (state.provider === 'international') {
      hideSuggestions();
      return;
    }

    // Don't search for short queries
    if (query.length < 3) {
      hideSuggestions();
      return;
    }

    // Debounce API calls
    setAddressDebounceTimer(setTimeout(() => {
      fetchAddressSuggestions(query);
    }, 300));
  });

  // Focus handler - show suggestions if address already filled (from previous visit)
  addressInput.addEventListener('focus', () => {
    const state = getState();
    // Don't use DaData for international delivery
    if (state.provider === 'international') {
      return;
    }

    const query = addressInput.value.trim();

    // If address is already filled and has sufficient length, fetch suggestions
    if (query.length >= 3) {
      fetchAddressSuggestions(query);
    }
  });

  // Close suggestions on blur (with delay for click handling)
  addressInput.addEventListener('blur', () => {
    setTimeout(() => {
      hideSuggestions();
    }, 200);
  });

  // Close suggestions on escape
  addressInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideSuggestions();
    }
  });
}

async function fetchAddressSuggestions(query) {
  const suggestionsContainer = document.getElementById('address-suggestions');
  if (!suggestionsContainer) return;

  try {
    const response = await fetch('/api/address/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, count: 7 })
    });

    const result = await response.json();

    if (!response.ok || !result.suggestions) {
      hideSuggestions();
      return;
    }

    renderSuggestions(result.suggestions);

  } catch (error) {
    console.error('[Shipping] Address suggestion error:', error);
    hideSuggestions();
  }
}

function renderSuggestions(suggestions) {
  const state = getState();
  const suggestionsContainer = document.getElementById('address-suggestions');
  if (!suggestionsContainer) return;

  if (!suggestions || suggestions.length === 0) {
    hideSuggestions();
    return;
  }

  suggestionsContainer.innerHTML = '';

  suggestions.forEach(suggestion => {
    const item = document.createElement('div');
    item.className = 'address-suggestion-item';

    // Build display text
    const mainText = suggestion.value || '';

    // Only show postal code in suggestions for Pochta (or when no provider is selected yet)
    // CDEK uses PVZ codes, not postal codes
    const shouldShowPostalCode = suggestion.postal_code &&
                                 (state.provider !== 'cdek' || !state.provider);
    const secondaryText = shouldShowPostalCode
      ? `Индекс: ${suggestion.postal_code}`
      : '';

    item.innerHTML = `
      <div class="suggestion-main">${escapeHtml(mainText)}</div>
      ${secondaryText ? `<div class="suggestion-secondary">${escapeHtml(secondaryText)}</div>` : ''}
    `;

    item.addEventListener('click', () => {
      selectAddress(suggestion);
    });

    suggestionsContainer.appendChild(item);
  });

  suggestionsContainer.style.display = 'block';
}

function selectAddress(suggestion) {
  const state = getState();
  const addressInput = document.getElementById('order-address');
  const postalInput = document.getElementById('order-postal-index');

  // Store selected address
  state.selectedAddress = suggestion;
  state.suggestedPostalCode = suggestion.postal_code || null;

  // Fill address field
  if (addressInput) {
    addressInput.value = suggestion.value || '';
  }

  // Store postal code in hidden field for potential delivery method switching
  const suggestedHidden = document.getElementById('suggested-postal-hidden');
  if (suggestedHidden && suggestion.postal_code) {
    suggestedHidden.value = suggestion.postal_code;
  }

  // Handle postal code display/fill based on delivery provider
  if (suggestion.postal_code) {
    if (state.provider === 'cdek') {
      // For CDEK: Don't show or fill postal code at all (CDEK uses PVZ codes, not postal codes)
      // Store in hidden field for potential switch to Pochta
      hideSuggestedPostalCode();
    } else {
      // For Pochta (or no provider selected yet): Show and auto-fill postal code
      showSuggestedPostalCode(suggestion.postal_code, _triggerShippingCalculation);
      // Auto-fill if postal input is empty
      if (postalInput && !postalInput.value.trim()) {
        postalInput.value = suggestion.postal_code;
      }
    }
  }

  // Note: Entrance, floor, apartment are manual entry fields

  // Check for international
  if (suggestion.isInternational) {
    if (_handleInternationalAddress) _handleInternationalAddress(suggestion);
  } else {
    // Reset international state
    state.isInternational = false;
    hideInternationalWarning();
    enableProviderButtons();
  }

  hideSuggestions();

  // If map is open, pan to the new address and reload markers
  if (state.mapOpen && window.unifiedPvzMap) {
    const lat = suggestion.data?.geo_lat || suggestion.geo_lat;
    const lng = suggestion.data?.geo_lon || suggestion.geo_lon;
    if (lat && lng) {
      console.log('[Shipping] Map open - panning to new address:', [lat, lng]);
      // Recreate the map entirely to reload markers for new location
      if (_createUnifiedMap) _createUnifiedMap();
    }
  }

  // Trigger shipping calculation
  if (_triggerShippingCalculation) _triggerShippingCalculation();

  // If CDEK + PVZ selected, auto-fetch nearby PVZs based on address/coordinates
  if (state.provider === 'cdek' && state.deliveryType === 'pvz') {
    const city = suggestion.data?.city || suggestion.data?.settlement || '';
    const lat = suggestion.data?.geo_lat || suggestion.geo_lat;
    const lng = suggestion.data?.geo_lon || suggestion.geo_lon;

    console.log('[Shipping] DaData address selected, extracting coordinates:', {
      city,
      lat,
      lng,
      fullSuggestion: suggestion
    });

    if (_fetchCdekPvzForAddress) _fetchCdekPvzForAddress(city, lat, lng);
  }
}

/**
 * Listen for postal code changes to trigger recalculation
 */
export function initPostalCodeListener(triggerCalcFn) {
  const postalInput = document.getElementById('order-postal-index');
  if (!postalInput) return;

  // Debounced handler for postal code changes
  let postalDebounceTimer = null;
  postalInput.addEventListener('input', () => {
    const state = getState();
    if (postalDebounceTimer) clearTimeout(postalDebounceTimer);

    // Update suggested indicator visibility
    const suggestedSpan = document.getElementById('suggested-postal');
    if (suggestedSpan && state.suggestedPostalCode) {
      // Show suggested if user's value differs from suggested, gray out if matches
      if (postalInput.value.trim() !== state.suggestedPostalCode) {
        suggestedSpan.style.display = 'block';
        const suggestedVal = document.getElementById('suggested-postal-value');
        if (suggestedVal) {
          suggestedVal.classList.remove('applied');
          suggestedVal.style.pointerEvents = '';
        }
      } else {
        // Match - show as applied (gray)
        suggestedSpan.style.display = 'block';
        const suggestedVal = document.getElementById('suggested-postal-value');
        if (suggestedVal) {
          suggestedVal.classList.add('applied');
          suggestedVal.style.pointerEvents = 'none';
        }
      }
    }

    postalDebounceTimer = setTimeout(() => {
      const postal = postalInput.value.trim();
      // Only trigger if we have a valid 6-digit postal code and provider selected
      if (postal.length === 6 && /^\d{6}$/.test(postal) && state.provider && state.deliveryType) {
        triggerCalcFn();
      }
    }, 500);
  });
}
