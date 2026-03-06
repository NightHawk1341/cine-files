// ============================================================
// CONSTANTS AND CONFIGURATION
// Product format configurations and mappings
// ============================================================

/**
 * Layout breakpoints (px). Keep in sync with CSS media queries.
 * MOBILE_BREAKPOINT: desktop/mobile layout boundary (two-column collapse, bottom nav, etc.)
 * SMALL_MOBILE_BREAKPOINT: smaller phone adjustments (font sizes, spacing)
 */
export const MOBILE_BREAKPOINT = 1024;
export const SMALL_MOBILE_BREAKPOINT = 768;

/**
 * Interaction media queries for touch vs mouse detection.
 * Use these instead of width checks when the concern is input method, not layout.
 */
export const TOUCH_DEVICE_QUERY = '(pointer: coarse)';
export const HOVER_DEVICE_QUERY = '(hover: hover)';

/**
 * Special product ID for custom poster (appears first in lists)
 */
export const CUSTOM_PRODUCT_ID = 1;

/**
 * Mapping of property names to price IDs
 */
export const propertyToPriceId = {
  'A3 без рамки': 1,
  'A2 без рамки': 2,
  'A1 без рамки': 3,
  'A3 в рамке': 4,
  'A2 в рамке': 5
};

/**
 * Available format options for regular products
 */
export const formatOptions = [
  { value: 'A3 без рамки', label: 'A3 без рамки' },
  { value: 'A2 без рамки', label: 'A2 без рамки' },
  { value: 'A1 без рамки', label: 'A1 без рамки' },
  { value: 'A3 в рамке', label: 'A3 в рамке' },
  { value: 'A2 в рамке', label: 'A2 в рамке' }
];

/**
 * Available format options for triptych products
 */
export const triptychFormatOptions = [
  { value: 'A3 без рамки', label: '3 A3 без рамок' },
  { value: 'A2 без рамки', label: '3 A2 без рамок' },
  { value: 'A1 без рамки', label: '3 A1 без рамок' },
  { value: 'A3 в рамке', label: '3 A3 в рамках' },
  { value: 'A2 в рамке', label: '3 A2 в рамках' }
];

/**
 * Physical dimensions for each property type
 */
export const propertyDimensions = {
  'A3 без рамки': '29,7 × 42,0 см',
  'A2 без рамки': '42,0 × 59,4 см',
  'A1 без рамки': '59,4 × 84,1 см',
  'A3 в рамке': '29,7 × 42,0 см',
  'A2 в рамке': '42,0 × 59,4 см'
};
