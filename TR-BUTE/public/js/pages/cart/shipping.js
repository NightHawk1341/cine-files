/**
 * cart/shipping.js
 * New shipping selection flow with provider/delivery type selection
 *
 * Flow:
 * 1. User selects provider (CDEK / Pochta)
 * 2. User selects delivery type (PVZ / Courier)
 * 3. User enters address with autocomplete
 * 4. System calculates shipping for selected provider
 * 5. If PVZ: user selects pickup point
 * 6. If international detected: show warning, enable manual mode
 */

import { getState, resetState, setDeps } from './shipping/state.js';
import { initAddressAutocomplete, initPostalCodeListener, setAddressCallbacks } from './shipping/address.js';
import {
  showDeliveryTypeSelection, hideDeliveryTypeSelection, showAddressSection,
  updatePvzLabel, showPostalIndexSection, updateShippingVerifyWarning,
  updateExpressToggleVisibility, showShippingResults, hideShippingResults,
  showLoadingState, hideLoadingState, showErrorState, showManualModeNotice,
  showNoProductsMessage, showInternationalWarning, hideInternationalWarning,
  disableProviderButtons, enableProviderButtons, showPostalAddressHint,
  hidePostalAddressHint, showSuggestedPostalCode, hideSuggestedPostalCode,
  updateFormValidation
} from './shipping/ui.js';
import {
  formatItemsCount, mapDeliveryTypeCode, getPostalCode
} from './shipping/utils.js';
import { initPvzDeps, initPvzAutocomplete } from './shipping/pvz.js';
import {
  initMapsDeps, showPvzSelection, hidePvzSelection,
  createUnifiedMap, fetchCdekPvzForAddress
} from './shipping/maps.js';

// ============ MODULE STATE ============

// Shared state (single source of truth via state.js)
const shippingState = getState();

// Debounce timer (local to main module)
let calculationDebounceTimer = null;

// Dependencies (set by initShippingModule)
let cart = {};
let allProducts = [];
let getProductPrice = null;
let formatNumberRussian = null;

// ============ INITIALIZATION ============

/**
 * Initialize shipping module with dependencies
 */
export function initShippingModule(cartRef, productsRef, priceFn, formatFn) {
  cart = cartRef;
  allProducts = productsRef;
  getProductPrice = priceFn;
  formatNumberRussian = formatFn;
  // Also set deps in shared state so sub-modules can access them
  setDeps(cartRef, productsRef, priceFn, formatFn);
}

/**
 * Initialize shipping calculation handlers and UI
 */
export function initShippingCalculation() {
  // Wire up address sub-module callbacks (avoids circular deps)
  setAddressCallbacks({
    triggerShippingCalculation,
    handleInternationalAddress,
    fetchCdekPvzForAddress,
    createUnifiedMap
  });

  // Inject triggerShippingCalculation into pvz and maps sub-modules
  initPvzDeps({ triggerShippingCalculation });
  initMapsDeps({ triggerShippingCalculation });

  // Provider selection buttons
  initProviderSelection();

  // Delivery type selection buttons
  initDeliveryTypeSelection();

  // Express delivery toggle
  initExpressToggle();

  // Address autocomplete (from address sub-module)
  initAddressAutocomplete();

  // Postal code change listener (from address sub-module)
  initPostalCodeListener(triggerShippingCalculation);

  // CDEK PVZ autocomplete
  initPvzAutocomplete();

  // PVZ selection button
  initPvzButton();

  // International phone input
  initInternationalPhoneInput();

  // Latin character validation for international orders
  initLatinValidation();

  // Form validation updates
  updateFormValidation();

  console.log('[Shipping] Module initialized');
}

/**
 * Initialize PVZ selection button and summary change button
 */
function initPvzButton() {
  const pvzBtn = document.getElementById('open-pvz-btn');
  if (pvzBtn) {
    pvzBtn.addEventListener('click', () => {
      // Toggle map visibility
      const pvzSection = document.getElementById('pvz-selection-section');
      if (pvzSection && pvzSection.style.display === 'block') {
        hidePvzSelection();
      } else {
        showPvzSelection();
      }
    });
  }

  // Add change button handler for PVZ summary
  const pvzSummary = document.getElementById('selected-pvz-summary');
  if (pvzSummary) {
    const changeBtn = pvzSummary.querySelector('.pvz-summary-change');
    if (changeBtn) {
      changeBtn.addEventListener('click', () => {
        showPvzSelection();
      });
    }
  }
}

/**
 * Initialize international phone input with country detection
 * Behavior changes based on delivery method:
 * - CDEK/Pochta: Russia only, no country selector
 * - International: Full country selector with flags
 */
let phoneInput = null;
function initInternationalPhoneInput(isInternational = false) {
  const phoneField = document.getElementById('order-phone');
  if (!phoneField) return;

  // Destroy existing instance if present
  if (phoneInput) {
    phoneInput.destroy();
    phoneInput = null;
  }

  // Check if intlTelInput is available
  if (typeof window.intlTelInput !== 'function') {
    console.warn('[Shipping] intlTelInput not loaded, skipping phone input enhancement');
    return;
  }

  // Configure based on delivery type
  const config = {
    initialCountry: isInternational ? '' : 'ru', // Default to Russia for domestic, empty for international
    separateDialCode: true, // Show country code separately
    autoPlaceholder: 'aggressive',
    nationalMode: false, // Always show country code
    utilsScript: 'https://cdn.jsdelivr.net/npm/intl-tel-input@23.0.4/build/js/utils.js',
    formatOnDisplay: true, // Format as user types
  };

  if (isInternational) {
    // International: show all countries with flags
    config.preferredCountries = ['ru', 'by', 'kz', 'ua'];
    config.onlyCountries = undefined; // Allow all countries
    config.allowDropdown = true;
  } else {
    // CDEK/Pochta: Russia only, locked
    config.onlyCountries = ['ru'];
    config.allowDropdown = false;
    config.initialCountry = 'ru';
  }

  // Initialize intl-tel-input
  phoneInput = window.intlTelInput(phoneField, config);

  // Format phone input with spaces for Russian numbers (+7 XXX XXX XX XX)
  if (!isInternational) {
    phoneField.placeholder = '+7 999 999-99-99';
  }

  // Format phone number with spaces as user types
  phoneField.addEventListener('input', () => {
    if (!isInternational && phoneInput) {
      // For Russian numbers, ensure proper formatting with spaces
      const number = phoneField.value;
      if (number && /^\+?7/.test(number.replace(/\s/g, ''))) {
        // Get the international format to ensure proper spacing
        const formatted = phoneInput.getNumber('INTERNATIONAL');
        if (formatted) {
          phoneField.value = formatted;
        }
      }
    }
  });

  // Update hidden input with full international number on change
  phoneField.addEventListener('blur', () => {
    if (phoneInput && phoneInput.isValidNumber()) {
      const fullNumber = phoneInput.getNumber(); // E.164 format
      phoneField.setAttribute('data-full-number', fullNumber);
    }
  });

  // Also update on country change (only for international)
  if (isInternational) {
    phoneField.addEventListener('countrychange', () => {
      phoneField.value = ''; // Clear when country changes
    });
  }
}

/**
 * Transliterate Russian Cyrillic to Latin
 */
function transliterateRussianToLatin(text) {
  const replacements = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e',
    'ё': 'yo', 'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k',
    'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r',
    'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts',
    'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '',
    'э': 'e', 'ю': 'yu', 'я': 'ya',
    'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E',
    'Ё': 'Yo', 'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K',
    'Л': 'L', 'М': 'M', 'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R',
    'С': 'S', 'Т': 'T', 'У': 'U', 'Ф': 'F', 'Х': 'H', 'Ц': 'Ts',
    'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Shch', 'Ъ': '', 'Ы': 'Y', 'Ь': '',
    'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
  };

  return text.split('').map(char => replacements[char] || char).join('');
}

/**
 * Initialize Latin character validation for international orders
 */
function initLatinValidation() {
  const nameInput = document.getElementById('order-name');
  const surnameInput = document.getElementById('order-surname');
  const addressInput = document.getElementById('order-address');

  // Create validation message elements
  const createValidationMessage = (fieldId) => {
    const existingMsg = document.getElementById(`${fieldId}-latin-warning`);
    if (existingMsg) return existingMsg;

    const container = document.createElement('div');
    container.id = `${fieldId}-latin-warning`;
    container.style.cssText = 'display: none; margin-top: 4px; font-size: 12px;';

    const text = document.createElement('div');
    text.style.cssText = 'color: var(--warning); margin-bottom: 6px;';
    text.textContent = 'Для международной доставки используйте латинские буквы';

    const button = document.createElement('button');
    button.type = 'button';
    button.style.cssText = 'background: var(--link-color); color: white; border: none; border-radius: 6px; padding: 4px 10px; font-size: 11px; cursor: pointer; font-weight: 600;';
    button.textContent = 'Транслитерировать';
    button.addEventListener('click', (e) => {
      e.preventDefault();
      const input = document.getElementById(fieldId);
      if (input) {
        input.value = transliterateRussianToLatin(input.value);
        input.dispatchEvent(new Event('input'));
      }
    });

    container.appendChild(text);
    container.appendChild(button);
    return container;
  };

  // Helper to check if string contains only Latin characters, spaces, and common punctuation
  const isLatinOnly = (str) => {
    return /^[a-zA-Z\s\-.,\/0-9]*$/.test(str);
  };

  // Add validation for each field
  [nameInput, surnameInput, addressInput].forEach(input => {
    if (!input) return;

    const validationMsg = createValidationMessage(input.id);
    input.parentElement.appendChild(validationMsg);

    input.addEventListener('input', () => {
      // Only validate if international delivery is selected
      if (!shippingState.isInternational) {
        validationMsg.style.display = 'none';
        input.setCustomValidity('');
        return;
      }

      const value = input.value.trim();
      if (value && !isLatinOnly(value)) {
        validationMsg.style.display = 'block';
        input.setCustomValidity('Для международной доставки используйте латинские буквы');
      } else {
        validationMsg.style.display = 'none';
        input.setCustomValidity('');
      }
    });

    // Also validate on blur
    input.addEventListener('blur', () => {
      if (shippingState.isInternational) {
        input.dispatchEvent(new Event('input'));
      }
    });
  });
}

// ============ FORM FIELD RESET ============

/**
 * Reset user input fields when switching delivery methods
 * Keeps them available if user switches back, but doesn't carry them forward
 */
function resetFormFieldsForDeliverySwitch() {
  const fields = [
    'order-name',
    'order-surname',
    'order-address',
    'order-postal-index',
    'order-phone'
  ];

  fields.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) {
      field.value = '';
    }
  });
}

// ============ PROVIDER SELECTION ============

function initProviderSelection() {
  const providerButtons = document.querySelectorAll('.shipping-provider-btn, .international-shipping-btn');

  providerButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const provider = btn.dataset.provider;

      // Skip if auto-detected international (providers are disabled)
      if (shippingState.isInternational && shippingState.provider !== 'international') return;

      // Update state
      const previousProvider = shippingState.provider;
      shippingState.provider = provider;

      // Reset form fields when switching delivery methods
      resetFormFieldsForDeliverySwitch();

      // Update UI
      providerButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Set provider color coding on body
      document.body.setAttribute('data-shipping-provider', provider);

      // Update hidden input
      const providerInput = document.getElementById('selected-provider');
      if (providerInput) providerInput.value = provider;

      // Update phone input based on provider
      initInternationalPhoneInput(provider === 'international');

      // Handle international delivery explicitly
      if (provider === 'international') {
        handleInternationalSelection();
        return;
      }

      // Reload map if it's currently visible (provider changed)
      const pvzSection = document.getElementById('pvz-selection-section');
      if (pvzSection && pvzSection.style.display === 'block') {
        // Re-initialize map for new provider
        createUnifiedMap();
      }

      // Show delivery type selection
      showDeliveryTypeSelection();

      // Update PVZ label based on provider
      updatePvzLabel(provider);

      // If we already have a delivery type selected, update the postal label immediately
      if (shippingState.deliveryType) {
        showPostalIndexSection(shippingState.deliveryType);
      }

      // Save current provider's selections before switching
      const postalInput = document.getElementById('order-postal-index');
      if (previousProvider === 'cdek') {
        shippingState.savedCdekPvz = shippingState.selectedPvz;
        shippingState.savedCdekInputValue = postalInput?.value || '';
      } else if (previousProvider === 'pochta') {
        shippingState.savedPochtaPvz = shippingState.selectedPvz;
        shippingState.savedPochtaIndex = postalInput?.value || '';
      }

      // Clear inline address hint when switching
      hidePostalAddressHint();

      // Restore new provider's saved selections
      if (provider === 'cdek') {
        hideSuggestedPostalCode();
        shippingState.selectedPvz = shippingState.savedCdekPvz;
        if (postalInput) {
          postalInput.value = shippingState.savedCdekInputValue || '';
        }
        // Show CDEK PVZ suggestions if we have address and no saved PVZ
        if (shippingState.selectedAddress && !shippingState.savedCdekPvz) {
          const city = shippingState.selectedAddress.data?.city ||
                       shippingState.selectedAddress.data?.settlement || '';
          const lat = shippingState.selectedAddress.data?.geo_lat || shippingState.selectedAddress.geo_lat;
          const lng = shippingState.selectedAddress.data?.geo_lon || shippingState.selectedAddress.geo_lon;
          if (city && shippingState.deliveryType === 'pvz') {
            fetchCdekPvzForAddress(city, lat, lng);
          }
        }
        // Restore CDEK PVZ suggestions visibility
        const cdekSuggestions = document.getElementById('cdek-pvz-suggestions');
        if (cdekSuggestions && shippingState.savedCdekPvz) {
          cdekSuggestions.style.display = 'none'; // Already selected
        }
        // Show address hint if PVZ was saved
        if (shippingState.savedCdekPvz) {
          showPostalAddressHint(shippingState.savedCdekPvz.address);
        }
      } else if (provider === 'pochta') {
        // Hide CDEK suggestions
        const cdekSuggestions = document.getElementById('cdek-pvz-suggestions');
        if (cdekSuggestions) cdekSuggestions.style.display = 'none';

        shippingState.selectedPvz = shippingState.savedPochtaPvz;
        if (postalInput) {
          postalInput.value = shippingState.savedPochtaIndex || '';
        }
        // If no saved index but we have a suggested one, fill it
        if (!shippingState.savedPochtaIndex && shippingState.suggestedPostalCode) {
          if (postalInput && shippingState.deliveryType === 'pvz') {
            postalInput.value = shippingState.suggestedPostalCode;
          }
          showSuggestedPostalCode(shippingState.suggestedPostalCode, triggerShippingCalculation);
        }
        // Show address hint if office was saved
        if (shippingState.savedPochtaPvz) {
          showPostalAddressHint(shippingState.savedPochtaPvz.address);
        }
      }

      // Reset shipping results when switching providers
      // The old result card shows the previous provider's info which is confusing
      hideShippingResults();
      shippingState.calculatedResult = null;
      shippingState.lastCalcKey = null;

      // If we have valid data for new provider, trigger calculation
      if (shippingState.selectedAddress || getPostalCode()) {
        triggerShippingCalculation();
      }
    });
  });
}

// ============ DELIVERY TYPE SELECTION ============

function initDeliveryTypeSelection() {
  const typeButtons = document.querySelectorAll('.shipping-type-btn');

  typeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const deliveryType = btn.dataset.type;

      // Update state
      shippingState.deliveryType = deliveryType;
      // Note: Don't clear PVZ selection when switching - it's retained for user convenience
      // CDEK courier uses user's address postal code, not PVZ postal code (handled in calculateShipping)

      // Update UI
      typeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update hidden input
      const deliveryTypeInput = document.getElementById('order-delivery-type');
      if (deliveryTypeInput) {
        deliveryTypeInput.value = mapDeliveryTypeCode(shippingState.provider, deliveryType, shippingState.express);
      }

      // Show/hide express toggle (only for PVZ, not courier)
      updateExpressToggleVisibility(deliveryType);

      // Hide map when switching to courier (map is only for PVZ selection)
      if (deliveryType === 'courier') {
        hidePvzSelection();
      }

      // Show address and postal index sections
      showAddressSection();
      showPostalIndexSection(deliveryType);

      // Update form validation based on delivery type
      updateFormValidation();

      // Trigger calculation if we have address
      if (shippingState.selectedAddress || getPostalCode()) {
        triggerShippingCalculation();
      }

      // Show/hide CDEK PVZ suggestions based on selection
      const cdekSuggestions = document.getElementById('cdek-pvz-suggestions');
      if (shippingState.provider === 'cdek' && deliveryType === 'pvz') {
        // If CDEK + PVZ and we have an address, fetch PVZ suggestions with coordinates
        if (shippingState.selectedAddress) {
          const city = shippingState.selectedAddress.data?.city ||
                       shippingState.selectedAddress.data?.settlement || '';
          const lat = shippingState.selectedAddress.data?.geo_lat ||
                      shippingState.selectedAddress.geo_lat;
          const lng = shippingState.selectedAddress.data?.geo_lon ||
                      shippingState.selectedAddress.geo_lon;
          if (city) {
            fetchCdekPvzForAddress(city, lat, lng);
          }
        }
      } else if (cdekSuggestions) {
        // Hide suggestions for other delivery types
        cdekSuggestions.style.display = 'none';
      }
    });
  });
}

// ============ EXPRESS DELIVERY TOGGLE ============

function initExpressToggle() {
  const expressCheckbox = document.getElementById('express-delivery-checkbox');
  if (!expressCheckbox) return;

  expressCheckbox.addEventListener('change', () => {
    shippingState.express = expressCheckbox.checked;

    // Update delivery type code
    const deliveryTypeInput = document.getElementById('order-delivery-type');
    if (deliveryTypeInput) {
      deliveryTypeInput.value = mapDeliveryTypeCode(shippingState.provider, shippingState.deliveryType, shippingState.express);
    }

    // Recalculate with express option
    if (shippingState.selectedAddress || getPostalCode()) {
      triggerShippingCalculation();
    }
  });
}

// ============ INTERNATIONAL HANDLING ============

function handleInternationalAddress(address) {
  shippingState.isInternational = true;
  shippingState.isManualMode = true;

  // Update hidden inputs
  const manualInput = document.getElementById('is-manual-calculation');
  if (manualInput) manualInput.value = 'true';

  // Disable provider buttons
  disableProviderButtons();

  // Show international warning (auto-detected)
  showInternationalWarning();

  // Hide shipping results section
  hideShippingResults();

  // Update form validation for international
  updateFormValidation();

  // Trigger validation for Latin characters
  const fieldsToValidate = ['order-name', 'order-surname', 'order-address'];
  fieldsToValidate.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) field.dispatchEvent(new Event('input'));
  });
}

/**
 * Handle explicit selection of international delivery
 */
function handleInternationalSelection() {
  shippingState.isInternational = true;
  shippingState.isManualMode = true;
  shippingState.deliveryType = 'manual'; // Simplified type for international

  // Update hidden inputs
  const manualInput = document.getElementById('is-manual-calculation');
  if (manualInput) manualInput.value = 'true';

  const deliveryTypeInput = document.getElementById('order-delivery-type');
  if (deliveryTypeInput) deliveryTypeInput.value = 'international';

  // Show selected international warning
  const selectedWarning = document.getElementById('international-selected');
  if (selectedWarning) selectedWarning.style.display = 'flex';

  // Hide auto-detected warning if shown
  hideInternationalWarning();

  // Hide delivery type selection (not needed for international)
  hideDeliveryTypeSelection();

  // Hide shipping results section
  hideShippingResults();

  // Hide PVZ section
  hidePvzSelection();

  // Show address section with simple manual entry
  showAddressSection();
  showPostalIndexSection('international');

  // Update form validation for international
  updateFormValidation();

  // Update summary to show manual calculation
  updateOrderSummary();
}

// ============ SHIPPING CALCULATION ============

/**
 * Debounced shipping calculation trigger
 */
export function triggerShippingCalculation() {
  // Clear previous timer
  if (calculationDebounceTimer) {
    clearTimeout(calculationDebounceTimer);
  }

  // Skip if international
  if (shippingState.isInternational) {
    showManualModeNotice();
    return;
  }

  // Need provider and delivery type selected
  if (!shippingState.provider || !shippingState.deliveryType) {
    return;
  }

  const isCourierDelivery = shippingState.deliveryType === 'courier';
  const postalCode = getPostalCode();
  const addressInput = document.getElementById('order-address');
  const hasAddress = addressInput?.value?.trim()?.length >= 5;

  // For courier: need address (postal code can come from DaData)
  // For PVZ: need postal code or PVZ selection
  if (isCourierDelivery) {
    if (!hasAddress && !shippingState.selectedAddress) {
      return;
    }
  } else {
    if (!postalCode && !shippingState.selectedAddress) {
      return;
    }
  }

  // Debounce calculation
  calculationDebounceTimer = setTimeout(() => {
    calculateShipping(postalCode);
  }, 500);
}

/**
 * Calculate shipping for selected provider
 */
export async function calculateShipping(postalCode, _retries = 0) {
  if (shippingState.isCalculating) return;

  const isCourierDelivery = shippingState.deliveryType === 'courier';
  const isCdekPvz = shippingState.provider === 'cdek' && shippingState.deliveryType === 'pvz';

  // Get address from input field (what user actually typed or selected)
  const addressInput = document.getElementById('order-address');
  const toAddress = addressInput?.value?.trim() || '';

  // Debug: Log address extraction for troubleshooting
  console.log('[Shipping] Address extraction debug:', {
    addressInputExists: !!addressInput,
    addressInputValue: addressInput?.value?.substring(0, 50),
    toAddressLength: toAddress.length,
    selectedAddress: shippingState.selectedAddress ? {
      value: shippingState.selectedAddress.value?.substring(0, 50),
      city: shippingState.selectedAddress.data?.city,
      settlement: shippingState.selectedAddress.data?.settlement,
      postal_code: shippingState.selectedAddress.postal_code || shippingState.selectedAddress.data?.postal_code
    } : 'none'
  });

  // Determine which postal code to use based on delivery mode
  // CRITICAL:
  // - CDEK PVZ: uses the PVZ's postal code (where the PVZ is located)
  // - CDEK Courier: uses user's address postal code (where to deliver)
  // - Pochta: always uses user's address postal code
  let postal;
  if (isCdekPvz && shippingState.selectedPvz?.postalCode) {
    // For CDEK PVZ: use postal code from the selected PVZ (where it's located)
    postal = shippingState.selectedPvz.postalCode;
    console.log('[Shipping] CDEK PVZ mode - using PVZ postal code:', postal, 'from PVZ:', shippingState.selectedPvz.code);
  } else if (isCdekPvz) {
    // CDEK PVZ mode but no PVZ selected yet - use address postal code for PVZ suggestions
    postal = postalCode || shippingState.suggestedPostalCode ||
             shippingState.selectedAddress?.postal_code ||
             shippingState.selectedAddress?.data?.postal_code || '';
    console.log('[Shipping] CDEK PVZ mode (no PVZ selected) - using address postal code for suggestions:', postal);
  } else if (isCourierDelivery) {
    // For courier (CDEK or Pochta): ALWAYS use postal code from user's selected address
    // This ensures delivery cost is calculated to user's location, NOT to any previously selected PVZ
    postal = shippingState.suggestedPostalCode ||
             shippingState.selectedAddress?.postal_code ||
             shippingState.selectedAddress?.data?.postal_code ||
             postalCode || '';
    console.log('[Shipping] Courier mode - using user address postal code:', postal);
  } else {
    // For Pochta PVZ: use postal code from input field
    postal = postalCode || getPostalCode();
    console.log('[Shipping] Pochta PVZ mode - using postal input:', postal);
  }

  // For courier delivery: address is required, postal code can be derived from DaData
  // For PVZ delivery: postal code (Pochta) or PVZ selection (CDEK) is required
  if (isCourierDelivery) {
    // Courier needs address
    if (!toAddress || toAddress.length < 5) {
      return;
    }
    // Try to get postal code from DaData if not manually entered
    const effectivePostal = postal || shippingState.suggestedPostalCode ||
                           shippingState.selectedAddress?.postal_code ||
                           shippingState.selectedAddress?.data?.postal_code || '';
    if (!effectivePostal || effectivePostal.length < 6) {
      console.warn('[Shipping] Courier delivery requires postal code from address');
      return;
    }
  } else {
    // PVZ needs postal code (Pochta) or PVZ selection (CDEK)
    if (isCdekPvz) {
      // CDEK PVZ: calculation requires PVZ to be selected
      if (!shippingState.selectedPvz) {
        // No PVZ selected yet - don't calculate, just show suggestions
        console.log('[Shipping] CDEK PVZ mode - PVZ not selected yet, skipping calculation');
        return;
      }
      // PVZ selected - need the PVZ's postal code for calculation
      if (!shippingState.selectedPvz.postalCode || shippingState.selectedPvz.postalCode.length < 6) {
        console.warn('[Shipping] CDEK PVZ selected but no postal code from PVZ:', shippingState.selectedPvz);
        return;
      }
    } else {
      // Pochta PVZ: needs postal code from postal input
      if (!postal || postal.length < 6) {
        return;
      }
    }
  }

  // Get cart items for calculation
  const orderItems = getOrderItems();

  if (orderItems.length === 0) {
    showShippingResults();
    showLoadingState();
    hideLoadingState();
    showNoProductsMessage();
    return;
  }

  // Get most specific city from DaData (settlement > city > area)
  // This handles nested cities like Moscow settlements (city: "Москва", settlement: "Внуково")
  // Using the most specific location ensures accurate delivery cost/time calculation
  const toCity = shippingState.selectedAddress?.data?.settlement ||
                 shippingState.selectedAddress?.data?.city ||
                 shippingState.selectedAddress?.data?.area ||
                 shippingState.selectedAddress?.city || '';

  // Use the appropriate postal code based on delivery mode
  // - CDEK PVZ: uses PVZ's postal code (already set in `postal` variable above)
  // - Pochta/Courier: uses user's address postal code
  const effectivePostalCode = postal || shippingState.suggestedPostalCode ||
                             shippingState.selectedAddress?.postal_code ||
                             shippingState.selectedAddress?.data?.postal_code || '';

  // Skip recalculation only for PVZ delivery modes (До отделения / До ПВЗ).
  // PVZ pricing depends on postal code / PVZ, not the user's street address.
  // Courier pricing may depend on exact address, so always recalculate for courier.
  const isPvzDelivery = shippingState.deliveryType === 'pvz';
  const calcKey = `${shippingState.provider}|${shippingState.deliveryType}|${effectivePostalCode}|${shippingState.express}|${orderItems.length}`;
  if (isPvzDelivery && calcKey === shippingState.lastCalcKey && shippingState.calculatedResult) {
    console.log('[Shipping] Skipping recalculation (PVZ, same postal code) — params:', calcKey);
    return;
  }

  // Show results section with loading
  showShippingResults();
  showLoadingState();

  shippingState.isCalculating = true;

  try {

    // Build request
    const requestBody = {
      toPostalCode: effectivePostalCode,
      toCity,
      toAddress,  // Full address - used for geocoding, especially for courier
      orderItems,
      providers: [shippingState.provider], // Single provider
      deliveryType: shippingState.deliveryType,
      express: shippingState.express
    };

    // For CDEK PVZ delivery, include PVZ code if selected
    if (shippingState.provider === 'cdek' && shippingState.deliveryType === 'pvz' && shippingState.selectedPvz?.code) {
      requestBody.pvzCode = shippingState.selectedPvz.code;
      console.log('[Shipping] CDEK PVZ calculation:', {
        pvzCode: shippingState.selectedPvz.code,
        pvzName: shippingState.selectedPvz.name,
        pvzPostalCode: shippingState.selectedPvz.postalCode,
        postalCodeUsedForCalc: effectivePostalCode
      });
    }

    console.log('[Shipping] ========== SHIPPING CALCULATION REQUEST ==========');
    console.log('[Shipping] Provider:', shippingState.provider);
    console.log('[Shipping] Delivery Type:', shippingState.deliveryType);
    console.log('[Shipping] Express:', shippingState.express);
    console.log('[Shipping] Full request body:', JSON.stringify(requestBody, null, 2));
    console.log('[Shipping] ==================================================');

    const response = await fetch('/api/shipping/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const result = await response.json();

    console.log('[Shipping] ========== SHIPPING CALCULATION RESPONSE ==========');
    console.log('[Shipping] Success:', result.success);
    console.log('[Shipping] Response data:', JSON.stringify(result.data, null, 2));
    if (result.data?.options) {
      console.log('[Shipping] Options received:', result.data.options.map(opt => ({
        code: opt.code,
        name: opt.name,
        price: opt.price,
        totalPrice: opt.totalPrice,
        minDays: opt.minDays,
        maxDays: opt.maxDays,
        deliveryTimeDisplay: opt.deliveryTimeDisplay
      })));
    }
    console.log('[Shipping] ===================================================');

    hideLoadingState();

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Ошибка расчёта доставки');
    }

    // Check if Pochta is in manual mode (either configured or zero price detected)
    if (result.pochtaManualMode && shippingState.provider === 'pochta') {
      console.log('[Shipping] Pochta manual mode active:', {
        configuredManualMode: !result.pochtaZeroPriceDetected,
        zeroPriceDetected: result.pochtaZeroPriceDetected
      });
      // Show manual mode notice - admin will calculate price
      showManualModeNotice();
      return;
    }

    // Store result and mark this calculation key as done
    shippingState.calculatedResult = result.data;
    shippingState.lastCalcKey = calcKey;

    // Update packaging cost
    const packagingInput = document.getElementById('packaging-cost');
    if (packagingInput) {
      packagingInput.value = result.data.packagingCost || 0;
    }

    // Display results
    displayShippingResult(result.data);

    // Only hide PVZ selection if it wasn't already open before calculation
    // (e.g. don't close map when provider switch triggers recalculation)
    if (!shippingState.mapOpen) {
      hidePvzSelection();
    }

  } catch (error) {
    if (_retries < 2) {
      console.warn(`[Shipping] Calculation error (attempt ${_retries + 1}/3), retrying...`, error);
      shippingState.isCalculating = false;
      await new Promise(r => setTimeout(r, 1000 * (_retries + 1)));
      await calculateShipping(postalCode, _retries + 1);
      return;
    }
    console.error('[Shipping] Calculation error after 3 attempts:', error);
    hideLoadingState();
    showErrorState();
    shippingState.isManualMode = true;
  } finally {
    shippingState.isCalculating = false;
  }
}

function getOrderItems() {
  const checkedItems = Object.values(cart).filter(item => item.checked !== false);
  const physicalItems = checkedItems.filter(item =>
    item.type !== 'certificate' && item.type !== 'certificate_redemption'
  );

  return physicalItems.map(item => {
    const product = allProducts.find(p => p.id === item.productId);
    if (!product) return null;

    const property = item.property || '';
    const format = property.includes('A1') ? 'A1' :
                   property.includes('A2') ? 'A2' : 'A3';
    const hasFrame = property.includes('в рамке');

    // Get price for declared value calculation
    const price = getProductPrice ? getProductPrice(product, property) : 0;

    return {
      product_id: item.productId,
      title: item.title,
      quantity: item.quantity,
      property,  // Include original property string for parcel calculator
      format,
      has_frame: hasFrame,
      is_triptych: item.triptych || false,
      price_at_purchase: price  // Include price for declared value
    };
  }).filter(item => item !== null);
}

function displayShippingResult(data) {
  const calculated = document.getElementById('shipping-calculated');
  if (!calculated) return;

  const options = data.options || [];

  // Find best option for selected delivery type
  let bestOption = options.find(opt => {
    if (shippingState.deliveryType === 'pvz') {
      return opt.deliveryMode === 'pvz' || opt.code?.includes('pvz');
    } else {
      return opt.deliveryMode === 'courier' || opt.code?.includes('courier');
    }
  });

  // Fallback to first option
  if (!bestOption && options.length > 0) {
    bestOption = options[0];
  }

  if (!bestOption) {
    showErrorState();
    return;
  }

  // Store in state - include nextShipmentDate (and optional period end) from full data
  shippingState.calculatedResult = bestOption;
  shippingState.nextShipmentDate = data.nextShipmentDate;
  shippingState.nextShipmentDateEnd = data.nextShipmentDateEnd || null;

  // Update hidden inputs
  const shippingCodeInput = document.getElementById('selected-shipping-code');
  const shippingPriceInput = document.getElementById('selected-shipping-price');
  const deliveryDaysInput = document.getElementById('estimated-delivery-days');

  if (shippingCodeInput) shippingCodeInput.value = bestOption.code || '';
  if (shippingPriceInput) shippingPriceInput.value = bestOption.totalPrice || bestOption.price || 0;
  if (deliveryDaysInput) deliveryDaysInput.value = bestOption.deliveryTimeDisplay || '';

  // Render result card
  const providerName = shippingState.provider === 'cdek' ? 'СДЭК' : 'Почта России';
  const typeName = shippingState.deliveryType === 'pvz'
    ? (shippingState.provider === 'cdek' ? 'До ПВЗ' : 'До отделения')
    : 'Курьером';
  const price = bestOption.totalPrice || bestOption.price || 0;

  // Delivery time in days (with ~ to indicate approximate)
  const deliveryDaysText = `~${bestOption.deliveryTimeDisplay || `${bestOption.minDays}-${bestOption.maxDays} дн.`}`;

  const resultProvider = document.getElementById('shipping-result-provider');
  const resultType = document.getElementById('shipping-result-type');
  const resultPrice = document.getElementById('shipping-result-price-value');
  const resultTime = document.getElementById('shipping-result-time-value');

  if (resultProvider) resultProvider.textContent = providerName;
  if (resultType) resultType.textContent = typeName;
  if (resultPrice) resultPrice.textContent = formatNumberRussian ? `${formatNumberRussian(price)} ₽` : `${price} ₽`;
  if (resultTime) resultTime.textContent = deliveryDaysText;

  // Helper to format date in Russian
  const formatDateRu = (dateStr) => {
    const date = new Date(dateStr);
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
                    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    return `${date.getDate()} ${months[date.getMonth()]}`;
  };

  // Update shipment date if available from API response (supports period)
  const shipmentDateRow = document.getElementById('shipping-shipment-date-row');
  const shipmentDateValue = document.getElementById('shipping-shipment-date-value');
  const nextShipmentDate = shippingState.nextShipmentDate;
  const nextShipmentDateEnd = shippingState.nextShipmentDateEnd;

  if (shipmentDateRow && shipmentDateValue && nextShipmentDate) {
    // Format as period if end date is different from start date
    if (nextShipmentDateEnd && nextShipmentDateEnd !== nextShipmentDate) {
      const startDate = new Date(nextShipmentDate);
      const endDate = new Date(nextShipmentDateEnd);
      // Check if same month
      if (startDate.getMonth() === endDate.getMonth()) {
        // "6-8 января"
        shipmentDateValue.textContent = `${startDate.getDate()}-${endDate.getDate()} ${formatDateRu(nextShipmentDateEnd).split(' ')[1]}`;
      } else {
        // "28 января — 2 февраля"
        shipmentDateValue.textContent = `${formatDateRu(nextShipmentDate)} — ${formatDateRu(nextShipmentDateEnd)}`;
      }
    } else {
      shipmentDateValue.textContent = formatDateRu(nextShipmentDate);
    }
    shipmentDateRow.style.display = 'flex';
  } else if (shipmentDateRow) {
    shipmentDateRow.style.display = 'none';
  }

  // Update estimated delivery date if available (with ~ to indicate approximate)
  const deliveryDateRow = document.getElementById('shipping-delivery-date-row');
  const deliveryDateValue = document.getElementById('shipping-delivery-date-value');

  if (deliveryDateRow && deliveryDateValue && bestOption.estimatedDeliveryDisplay) {
    deliveryDateValue.textContent = `~${bestOption.estimatedDeliveryDisplay}`;
    deliveryDateRow.style.display = 'flex';
  } else if (deliveryDateRow) {
    deliveryDateRow.style.display = 'none';
  }

  // Update verification warning (already shown from showPostalIndexSection, but ensure correct state)
  updateShippingVerifyWarning(shippingState.deliveryType === 'pvz');

  calculated.style.display = 'block';

  // Update order summary
  updateOrderSummaryWithShipping();
}

// ============ ORDER SUMMARY ============

/**
 * Update order summary with shipping costs
 */
export function updateOrderSummaryWithShipping() {
  const checkedItems = Object.values(cart).filter(item => item.checked !== false);

  let productsTotal = 0;
  let totalItems = 0;

  checkedItems.forEach(item => {
    if (item.type === 'certificate' || item.type === 'certificate_redemption') {
      productsTotal += item.amount || 0;
      totalItems += item.quantity || 1;
    } else {
      const product = allProducts.find(p => p.id === item.productId);
      if (product && getProductPrice) {
        const price = getProductPrice(product, item.property);
        productsTotal += price * item.quantity;
        totalItems += item.quantity;
      }
    }
  });

  // Get shipping price from calculated result or hidden input
  // Note: shippingPrice (totalPrice) already includes packaging cost
  let shippingPrice = 0;
  const shippingPriceInput = document.getElementById('selected-shipping-price');
  if (shippingPriceInput) {
    shippingPrice = parseFloat(shippingPriceInput.value) || 0;
  }

  const grandTotal = productsTotal + shippingPrice;

  // Format items text
  const itemsText = formatItemsCount(totalItems);

  // Update summary elements
  const orderSummaryItemsCount = document.getElementById('order-summary-items-count');
  const orderSummaryTotal = document.getElementById('order-summary-total');
  const orderSummaryNote = document.querySelector('.order-summary-note');

  if (orderSummaryItemsCount) orderSummaryItemsCount.textContent = itemsText;
  if (orderSummaryTotal && formatNumberRussian) {
    orderSummaryTotal.textContent = formatNumberRussian(grandTotal) + ' ₽';
  }

  if (orderSummaryNote && formatNumberRussian) {
    if (shippingPrice > 0) {
      let noteHtml = `<span style="color: var(--text-tertiary);">Товары: ${formatNumberRussian(productsTotal)} ₽</span>`;
      noteHtml += `<br><span style="color: var(--text-tertiary);">Доставка: ${formatNumberRussian(shippingPrice)} ₽</span>`;
      orderSummaryNote.innerHTML = noteHtml;
    } else if (shippingState.isManualMode || shippingState.isInternational) {
      orderSummaryNote.textContent = 'Стоимость доставки будет рассчитана администратором';
    } else {
      orderSummaryNote.textContent = 'Выберите способ доставки для расчёта стоимости';
    }
  }
}

// ============ RESET & GETTERS ============

/**
 * Reset shipping selection state
 */
export function resetShippingSelection() {
  resetState();

  // Reset UI
  const providerButtons = document.querySelectorAll('.shipping-provider-btn');
  providerButtons.forEach(btn => btn.classList.remove('active', 'disabled'));

  const typeButtons = document.querySelectorAll('.shipping-type-btn');
  typeButtons.forEach(btn => btn.classList.remove('active'));

  hideDeliveryTypeSelection();
  hideShippingResults();
  hidePvzSelection();
  hideInternationalWarning();

  // Reset hidden inputs
  const inputs = ['order-delivery-type', 'selected-shipping-code', 'selected-shipping-price',
                  'packaging-cost', 'selected-provider', 'is-manual-calculation',
                  'selected-pvz-code', 'selected-pvz-address'];
  inputs.forEach(id => {
    const input = document.getElementById(id);
    if (input) input.value = id === 'is-manual-calculation' ? 'false' : '';
  });

  updateOrderSummaryWithShipping();
}

/**
 * Get selected shipping option
 */
export function getSelectedShippingOption() {
  return {
    provider: shippingState.provider,
    deliveryType: shippingState.deliveryType,
    express: shippingState.express,
    isInternational: shippingState.isInternational,
    isManualMode: shippingState.isManualMode,
    calculatedResult: shippingState.calculatedResult,
    selectedPvz: shippingState.selectedPvz
  };
}

