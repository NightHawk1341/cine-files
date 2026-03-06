/**
 * shipping/ui.js
 * UI show/hide helpers, form validation, loading/error/manual states.
 */

import { getState } from './state.js';
import { cleanDuplicateAddressParts } from './utils.js';

// ============ DELIVERY TYPE SECTION ============

export function showDeliveryTypeSelection() {
  const typeSection = document.getElementById('shipping-type-selection');
  if (typeSection) {
    typeSection.style.display = 'block';
  }
}

export function hideDeliveryTypeSelection() {
  const typeSection = document.getElementById('shipping-type-selection');
  if (typeSection) {
    typeSection.style.display = 'none';
  }
}

// ============ ADDRESS SECTION ============

export function showAddressSection() {
  const addressSection = document.getElementById('address-section');
  if (addressSection) {
    addressSection.style.display = 'block';
  }
}

// ============ PVZ LABEL ============

export function updatePvzLabel(provider) {
  const pvzLabel = document.getElementById('pvz-label');
  if (pvzLabel) {
    pvzLabel.textContent = provider === 'pochta' ? 'До отделения' : 'До ПВЗ';
  }
}

// ============ POSTAL INDEX SECTION ============

/**
 * Show postal index section and configure based on provider and delivery type
 */
export function showPostalIndexSection(deliveryType) {
  const state = getState();
  const postalGroup = document.getElementById('postal-index-group');
  const postalInput = document.getElementById('order-postal-index');
  const postalLabel = document.getElementById('postal-label-text');
  const requiredMarker = document.getElementById('postal-required-marker');
  const pvzBtn = document.getElementById('open-pvz-btn');
  const courierFieldsGroup = document.getElementById('courier-address-fields');

  const isCdek = state.provider === 'cdek';
  const isPochta = state.provider === 'pochta';
  const isCourier = deliveryType === 'courier';
  const isPvz = deliveryType === 'pvz';

  // Courier delivery: hide index section entirely, show courier fields
  if (isCourier) {
    if (postalGroup) postalGroup.style.display = 'none';
    if (courierFieldsGroup) courierFieldsGroup.style.display = 'block';
    // Hide verification warning for courier
    updateShippingVerifyWarning(false);
    return;
  }

  // PVZ delivery: show appropriate section
  if (postalGroup) postalGroup.style.display = 'block';
  if (courierFieldsGroup) courierFieldsGroup.style.display = 'none';

  // Show verification warning immediately for PVZ delivery
  if (isPvz) {
    updateShippingVerifyWarning(true);
  }

  // CDEK PVZ: searchable PVZ field with autocomplete
  if (isCdek && isPvz) {
    if (postalLabel) postalLabel.textContent = 'Пункт выдачи СДЭК';
    if (postalInput) {
      postalInput.required = false;
      postalInput.disabled = false;
      postalInput.style.opacity = '1';
      postalInput.placeholder = 'Введите код или адрес ПВЗ...';
      postalInput.maxLength = 100;
      // Clear value if switching to CDEK PVZ (unless already has PVZ)
      if (!state.selectedPvz) {
        postalInput.value = '';
      }
    }
    if (pvzBtn) pvzBtn.style.display = 'flex';
    if (requiredMarker) requiredMarker.style.display = 'none';
    return;
  }

  // Pochta PVZ: show postal index field
  if (isPochta && isPvz) {
    if (postalLabel) postalLabel.textContent = 'Индекс отделения Почты России';
    if (postalInput) {
      postalInput.required = false;
      postalInput.disabled = false;
      postalInput.style.opacity = '1';
      postalInput.placeholder = 'Индекс';
      postalInput.maxLength = 6;
    }
    if (pvzBtn) pvzBtn.style.display = 'flex';
    if (requiredMarker) requiredMarker.style.display = 'none';
    return;
  }

  // Default: show postal index
  if (postalLabel) postalLabel.textContent = 'Почтовый индекс';
  if (postalInput) {
    postalInput.required = false;
    postalInput.disabled = false;
    postalInput.style.opacity = '1';
    postalInput.placeholder = 'Индекс';
    postalInput.maxLength = 6;
  }
  if (pvzBtn) pvzBtn.style.display = isPvz ? 'flex' : 'none';
  if (requiredMarker) requiredMarker.style.display = 'none';

  // Scroll postal input into view on focus (may appear below keyboard)
  if (postalInput && !postalInput._scrollListenerAttached) {
    postalInput._scrollListenerAttached = true;
    postalInput.addEventListener('focus', () => {
      const fullViewportHeight = window.innerHeight;
      setTimeout(() => {
        const headerHeight = document.querySelector('.header')?.offsetHeight || 60;
        const rect = postalInput.getBoundingClientRect();
        const isAboveViewport = rect.top < headerHeight;
        const isBelowViewport = rect.bottom > fullViewportHeight;
        if (isAboveViewport || isBelowViewport) {
          if (isBelowViewport) {
            const bottomNavEl = window.innerWidth <= 1024 ? document.querySelector('.bottom-nav') : null;
            const bottomNavHeight = bottomNavEl ? bottomNavEl.offsetHeight : 0;
            window.scrollTo({ top: window.pageYOffset + rect.bottom - fullViewportHeight + 20 + bottomNavHeight, behavior: 'smooth' });
          } else {
            window.scrollTo({ top: window.pageYOffset + rect.top - headerHeight - 10, behavior: 'smooth' });
          }
        }
      }, 300);
    });
  }
}

// ============ SHIPPING VERIFY WARNING ============

/**
 * Update shipping verify warning based on current state
 */
export function updateShippingVerifyWarning(show) {
  const state = getState();
  const warningEl = document.getElementById('shipping-verify-warning');
  if (!warningEl) return;

  // Don't show warning for international delivery
  if (show && state.deliveryType === 'pvz' && !state.isInternational) {
    if (state.provider === 'pochta') {
      warningEl.innerHTML = 'Рекомендуем проверить индекс (и текущий статус отделения) вручную на <a href="https://www.pochta.ru/offices" target="_blank" rel="noopener noreferrer">сайте Почты</a>';
    } else if (state.provider === 'cdek') {
      warningEl.innerHTML = 'Рекомендуем проверить адрес (и текущий статус) пункта выдачи на <a href="https://www.cdek.ru/ru/offices" target="_blank" rel="noopener noreferrer">сайте СДЭК</a>';
    }
    warningEl.style.display = 'block';
  } else {
    warningEl.style.display = 'none';
  }
}

// ============ EXPRESS TOGGLE VISIBILITY ============

export function updateExpressToggleVisibility(deliveryType) {
  const state = getState();
  const expressSection = document.getElementById('express-delivery-section');
  if (!expressSection) return;

  // Only show express toggle for PVZ/office delivery, not courier
  if (deliveryType === 'pvz') {
    expressSection.style.display = 'block';
  } else {
    expressSection.style.display = 'none';
    // Reset express when switching to courier
    state.express = false;
    const expressCheckbox = document.getElementById('express-delivery-checkbox');
    if (expressCheckbox) expressCheckbox.checked = false;
  }
}

// ============ SHIPPING RESULTS ============

export function showShippingResults() {
  const resultsSection = document.getElementById('shipping-results');
  if (resultsSection) {
    resultsSection.style.display = 'block';
  }
}

export function hideShippingResults() {
  const resultsSection = document.getElementById('shipping-results');
  if (resultsSection) {
    resultsSection.style.display = 'none';
    resultsSection.classList.remove('has-error');
  }
  // Note: shipping-verify-warning is now in postal-index-group and managed by updateShippingVerifyWarning()
}

export function showLoadingState() {
  const loading = document.getElementById('shipping-loading');
  const calculated = document.getElementById('shipping-calculated');
  const error = document.getElementById('shipping-error');
  const manual = document.getElementById('shipping-manual-mode');
  const results = document.getElementById('shipping-results');

  if (loading) loading.style.display = 'flex';
  if (calculated) calculated.style.display = 'none';
  if (error) error.style.display = 'none';
  if (manual) manual.style.display = 'none';
  if (results) results.classList.remove('has-error');
}

export function hideLoadingState() {
  const loading = document.getElementById('shipping-loading');
  if (loading) loading.style.display = 'none';
}

export function showErrorState() {
  const calculated = document.getElementById('shipping-calculated');
  const error = document.getElementById('shipping-error');
  const manual = document.getElementById('shipping-manual-mode');
  const results = document.getElementById('shipping-results');

  if (calculated) calculated.style.display = 'none';
  if (manual) manual.style.display = 'none';
  if (error) error.style.display = 'block';
  if (results) results.classList.add('has-error');
}

export function showManualModeNotice() {
  showShippingResults();
  hideLoadingState();

  const calculated = document.getElementById('shipping-calculated');
  const error = document.getElementById('shipping-error');
  const manual = document.getElementById('shipping-manual-mode');
  const results = document.getElementById('shipping-results');

  if (calculated) calculated.style.display = 'none';
  if (error) error.style.display = 'none';
  if (manual) manual.style.display = 'flex';
  if (results) results.classList.remove('has-error');

  // Update manual input
  const manualInput = document.getElementById('is-manual-calculation');
  if (manualInput) manualInput.value = 'true';
}

export function showNoProductsMessage() {
  const calculated = document.getElementById('shipping-calculated');
  if (calculated) {
    calculated.style.display = 'block';
    calculated.innerHTML = `
      <div class="shipping-info-message" style="padding: 16px; text-align: center; color: var(--text-tertiary);">
        Только сертификаты — доставка не требуется
      </div>
    `;
  }
}

// ============ INTERNATIONAL WARNINGS ============

export function showInternationalWarning() {
  const warningEl = document.getElementById('international-detected');
  if (warningEl) {
    warningEl.style.display = 'flex';
  }
}

export function hideInternationalWarning() {
  const detectedWarning = document.getElementById('international-detected');
  if (detectedWarning) detectedWarning.style.display = 'none';

  const selectedWarning = document.getElementById('international-selected');
  if (selectedWarning) selectedWarning.style.display = 'none';
}

// ============ PROVIDER BUTTONS ============

export function disableProviderButtons() {
  const state = getState();
  const providerButtons = document.querySelectorAll('.shipping-provider-btn');
  providerButtons.forEach(btn => {
    btn.classList.add('disabled');
    btn.classList.remove('active');
  });

  // Reset provider selection
  state.provider = null;

  // Hide delivery type section
  hideDeliveryTypeSelection();
}

export function enableProviderButtons() {
  const providerButtons = document.querySelectorAll('.shipping-provider-btn');
  providerButtons.forEach(btn => {
    btn.classList.remove('disabled');
  });
}

// ============ POSTAL ADDRESS HINT ============

/**
 * Show greyed-out address hint after postal index (disappears on focus)
 */
export function showPostalAddressHint(address) {
  const state = getState();
  const hint = document.getElementById('postal-address-hint');
  if (!hint || !address) return;

  // Only show postal address hint for Pochta, not for CDEK
  if (state.provider === 'cdek') {
    hint.style.display = 'none';
    return;
  }

  // Clean up address - remove duplicates like "Москва, Москва"
  const cleanedAddress = cleanDuplicateAddressParts(address);
  hint.textContent = `(${cleanedAddress})`;
  hint.style.display = 'inline';

  // Hide hint when user focuses the input (only attach once)
  const postalInput = document.getElementById('order-postal-index');
  if (postalInput && !postalInput._hintListenerAttached) {
    postalInput._hintListenerAttached = true;
    postalInput.addEventListener('focus', hidePostalAddressHint);
    postalInput.addEventListener('blur', () => {
      // Re-show hint if there's a selected PVZ and provider is Pochta
      if (state.selectedPvz?.address && state.provider !== 'cdek') {
        const h = document.getElementById('postal-address-hint');
        if (h) {
          const cleaned = cleanDuplicateAddressParts(state.selectedPvz.address);
          h.textContent = `(${cleaned})`;
          h.style.display = 'inline';
        }
      }
    });
  }
}

/**
 * Hide the postal address hint
 */
export function hidePostalAddressHint() {
  const hint = document.getElementById('postal-address-hint');
  if (hint) {
    hint.style.display = 'none';
  }
}

// ============ SUGGESTED POSTAL CODE ============

/**
 * Show suggested postal code next to input
 */
export function showSuggestedPostalCode(postalCode, triggerCalcFn) {
  const suggestedSpan = document.getElementById('suggested-postal');
  const suggestedValue = document.getElementById('suggested-postal-value');
  const postalInput = document.getElementById('order-postal-index');

  if (suggestedSpan && suggestedValue) {
    suggestedValue.textContent = postalCode;
    suggestedSpan.style.display = 'block';

    // If values match, show as applied (gray)
    if (postalInput && postalInput.value === postalCode) {
      suggestedValue.classList.add('applied');
      suggestedValue.style.pointerEvents = 'none';
    } else {
      suggestedValue.classList.remove('applied');
      suggestedValue.style.pointerEvents = '';
    }

    // Add click handler to use suggested value
    suggestedValue.onclick = () => {
      if (postalInput) {
        postalInput.value = postalCode;
        // Show as applied (gray) instead of hiding
        suggestedValue.classList.add('applied');
        suggestedValue.style.pointerEvents = 'none';
        if (triggerCalcFn) triggerCalcFn();
      }
    };
  }
}

/**
 * Hide suggested postal code
 */
export function hideSuggestedPostalCode() {
  const suggestedSpan = document.getElementById('suggested-postal');
  if (suggestedSpan) {
    suggestedSpan.style.display = 'none';
  }
}

// ============ FORM VALIDATION ============

export function updateFormValidation() {
  const state = getState();
  const postalIndexInput = document.getElementById('order-postal-index');
  const postalLabelText = document.getElementById('postal-label-text');

  // Postal code is optional for all delivery types
  if (postalIndexInput) postalIndexInput.required = false;

  // Only reset label if not CDEK PVZ (which has its own label)
  const isCdekPvz = state.provider === 'cdek' && state.deliveryType === 'pvz';
  if (postalLabelText && !isCdekPvz) {
    postalLabelText.textContent = 'Почтовый индекс';
  }
}

// ============ PVZ SUMMARY (inline hint) ============

/**
 * Update PVZ summary displayed below postal code
 */
export function updatePvzSummary(name, address, workTime) {
  // Show address as inline hint after the postal index
  showPostalAddressHint(address);
}

/**
 * Hide PVZ summary
 */
export function hidePvzSummary() {
  hidePostalAddressHint();
}

// ============ POCHTA SECTION (legacy) ============

export function showPochtaPvzSection() {
  // Deprecated - using unified map widget now
  console.log('[Shipping] showPochtaPvzSection deprecated, using unified map');
}

export function hidePochaPvzSection() {
  // Hide old Pochta-specific section (if it exists)
  const pochtaSection = document.getElementById('pochta-pvz-section');
  if (pochtaSection) {
    pochtaSection.style.display = 'none';
  }
}

// ============ SUGGESTIONS CONTAINER ============

export function hideSuggestions() {
  const suggestionsContainer = document.getElementById('address-suggestions');
  if (suggestionsContainer) {
    suggestionsContainer.style.display = 'none';
  }
}

export function hidePvzSuggestions() {
  const pvzSuggestionsContainer = document.getElementById('pvz-suggestions');
  if (pvzSuggestionsContainer) {
    pvzSuggestionsContainer.style.display = 'none';
  }
}
