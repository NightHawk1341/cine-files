/**
 * shipping/state.js
 * Shared state and dependency holders for the shipping module.
 * All sub-modules import getState()/getDeps() to read/modify shared data.
 */

let shippingState = {
  provider: null,        // 'cdek' | 'pochta' | null
  deliveryType: null,    // 'pvz' | 'courier' | null
  express: false,        // Express delivery toggle (PVZ only)
  isInternational: false,
  isManualMode: false,
  selectedAddress: null, // DaData address object
  selectedPvz: null,     // Selected PVZ data
  suggestedPostalCode: null, // Postal code from dadata
  calculatedResult: null,
  nextShipmentDate: null, // Next shipment date from admin settings
  nextShipmentDateEnd: null, // End of shipment period (optional)
  isCalculating: false,
  mapOpen: false,        // Track whether PVZ map is currently open
  // Per-provider saved selections (restored when switching back)
  savedCdekPvz: null,          // { code, name, address, postalCode, workTime }
  savedCdekInputValue: '',     // Postal input value for CDEK
  savedPochtaIndex: '',        // Postal index for Pochta
  savedPochtaPvz: null,        // { code, name, address, postalCode }
  // Last calculation params (to avoid redundant API calls)
  lastCalcKey: null             // 'provider|deliveryType|postalCode|express'
};

// Debounce timers
let addressDebounceTimer = null;
let calculationDebounceTimer = null;

// Dependencies (set by initShippingModule)
let cart = {};
let allProducts = [];
let getProductPrice = null;
let formatNumberRussian = null;

// CDEK Widget instance
let cdekWidget = null;

// Yandex Maps loaded flag
let ymapsLoaded = false;

// Phone input instance
let phoneInput = null;

// PVZ debounce timer
let pvzDebounceTimer = null;

/** Get the current shipping state object (mutable reference) */
export function getState() {
  return shippingState;
}

/** Reset the shipping state in place (preserves object reference) */
export function resetState() {
  Object.assign(shippingState, {
    provider: null,
    deliveryType: null,
    express: false,
    isInternational: false,
    isManualMode: false,
    selectedAddress: null,
    selectedPvz: null,
    suggestedPostalCode: null,
    calculatedResult: null,
    nextShipmentDate: null,
    nextShipmentDateEnd: null,
    isCalculating: false,
    mapOpen: false,
    savedCdekPvz: null,
    savedCdekInputValue: '',
    savedPochtaIndex: '',
    savedPochtaPvz: null,
    lastCalcKey: null
  });
}

/** Get shared dependencies */
export function getDeps() {
  return { cart, allProducts, getProductPrice, formatNumberRussian };
}

/** Set shared dependencies (called once at init) */
export function setDeps(cartRef, productsRef, priceFn, formatFn) {
  cart = cartRef;
  allProducts = productsRef;
  getProductPrice = priceFn;
  formatNumberRussian = formatFn;
}

// --- Debounce timer accessors ---

export function getAddressDebounceTimer() { return addressDebounceTimer; }
export function setAddressDebounceTimer(t) { addressDebounceTimer = t; }

export function getCalculationDebounceTimer() { return calculationDebounceTimer; }
export function setCalculationDebounceTimer(t) { calculationDebounceTimer = t; }

// --- Singleton accessors ---

export function getCdekWidget() { return cdekWidget; }
export function setCdekWidget(w) { cdekWidget = w; }

export function getYmapsLoaded() { return ymapsLoaded; }
export function setYmapsLoaded(v) { ymapsLoaded = v; }

export function getPhoneInput() { return phoneInput; }
export function setPhoneInput(v) { phoneInput = v; }

export function getPvzDebounceTimer() { return pvzDebounceTimer; }
export function setPvzDebounceTimer(t) { pvzDebounceTimer = t; }
