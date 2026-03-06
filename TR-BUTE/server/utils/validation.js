/**
 * Validation Helper Functions
 * Reusable validation logic for common patterns
 */

/**
 * Valid product image table names
 * @type {string[]}
 */
const VALID_IMAGE_TABLES = ['product_images', 'product_images_2'];

/**
 * Validate product image table name
 *
 * @param {string} tableName - Table name to validate
 * @returns {Object} Validation result { valid: boolean, error?: string }
 *
 * @example
 * validateImageTableName('product_images');
 * // Returns: { valid: true }
 *
 * validateImageTableName('invalid_table');
 * // Returns: { valid: false, error: 'table_name must be...' }
 */
function validateImageTableName(tableName) {
  if (!tableName || !VALID_IMAGE_TABLES.includes(tableName)) {
    return {
      valid: false,
      error: 'table_name must be either "product_images" or "product_images_2"'
    };
  }
  return { valid: true };
}

/**
 * Check if a value is a valid positive integer ID
 *
 * @param {*} id - Value to check
 * @returns {boolean} True if valid ID
 *
 * @example
 * isValidId(123); // true
 * isValidId('123'); // true
 * isValidId(-5); // false
 * isValidId('abc'); // false
 */
function isValidId(id) {
  const numId = parseInt(id);
  return !isNaN(numId) && numId > 0 && String(numId) === String(id).trim();
}

/**
 * Validate that an object has all required fields
 *
 * @param {Object} obj - Object to validate
 * @param {string[]} fields - Array of required field names
 * @returns {Object} Validation result { valid: boolean, error?: string, missing?: string[] }
 *
 * @example
 * requireFields({ name: 'John', age: 30 }, ['name', 'age', 'email']);
 * // Returns: { valid: false, error: 'Missing required fields: email', missing: ['email'] }
 */
function requireFields(obj, fields) {
  if (!obj || typeof obj !== 'object') {
    return {
      valid: false,
      error: 'Invalid input object',
      missing: fields
    };
  }

  const missing = fields.filter(field => {
    const value = obj[field];
    return value === undefined || value === null || value === '';
  });

  if (missing.length > 0) {
    return {
      valid: false,
      error: `Missing required fields: ${missing.join(', ')}`,
      missing
    };
  }

  return { valid: true };
}

/**
 * Validate email format
 *
 * @param {string} email - Email address to validate
 * @returns {boolean} True if valid email format
 *
 * @example
 * isValidEmail('user@example.com'); // true
 * isValidEmail('invalid-email'); // false
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Validate phone number format (Russian format)
 *
 * @param {string} phone - Phone number to validate
 * @returns {boolean} True if valid phone format
 *
 * @example
 * isValidPhone('+79991234567'); // true
 * isValidPhone('89991234567'); // true
 * isValidPhone('123'); // false
 */
function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') {
    return false;
  }
  // Russian phone: +7 or 8 followed by 10 digits
  const phoneRegex = /^(\+7|8)\d{10}$/;
  return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
}

/**
 * Validate that a string is not empty
 *
 * @param {string} str - String to validate
 * @param {number} [minLength=1] - Minimum length
 * @returns {boolean} True if non-empty string
 *
 * @example
 * isNonEmptyString('hello'); // true
 * isNonEmptyString('  '); // false
 * isNonEmptyString('hi', 3); // false (too short)
 */
function isNonEmptyString(str, minLength = 1) {
  return typeof str === 'string' && str.trim().length >= minLength;
}

/**
 * Validate that a value is a number within a range
 *
 * @param {*} value - Value to check
 * @param {number} [min=-Infinity] - Minimum value (inclusive)
 * @param {number} [max=Infinity] - Maximum value (inclusive)
 * @returns {boolean} True if valid number in range
 *
 * @example
 * isInRange(5, 1, 10); // true
 * isInRange(15, 1, 10); // false
 * isInRange('5', 1, 10); // true (string numbers accepted)
 */
function isInRange(value, min = -Infinity, max = Infinity) {
  const num = Number(value);
  return !isNaN(num) && num >= min && num <= max;
}

/**
 * Sanitize a string for safe use in queries (remove special chars)
 *
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 *
 * @example
 * sanitizeString('Hello <script>alert("xss")</script>');
 * // Returns: 'Hello scriptalertxssscript'
 */
function sanitizeString(str) {
  if (typeof str !== 'string') {
    return '';
  }
  return str.replace(/[<>\"\'&]/g, '');
}

/**
 * Validate array is non-empty and all elements pass validator
 *
 * @param {Array} arr - Array to validate
 * @param {Function} [validator=null] - Optional validator function for elements
 * @returns {Object} Validation result { valid: boolean, error?: string }
 *
 * @example
 * validateArray([1, 2, 3], isValidId);
 * // Returns: { valid: true }
 *
 * validateArray([]);
 * // Returns: { valid: false, error: 'Array is empty' }
 */
function validateArray(arr, validator = null) {
  if (!Array.isArray(arr)) {
    return { valid: false, error: 'Value is not an array' };
  }

  if (arr.length === 0) {
    return { valid: false, error: 'Array is empty' };
  }

  if (validator && typeof validator === 'function') {
    const invalidIndex = arr.findIndex(item => !validator(item));
    if (invalidIndex !== -1) {
      return {
        valid: false,
        error: `Invalid element at index ${invalidIndex}`
      };
    }
  }

  return { valid: true };
}

module.exports = {
  // Constants
  VALID_IMAGE_TABLES,

  // Validation functions
  validateImageTableName,
  isValidId,
  requireFields,
  isValidEmail,
  isValidPhone,
  isNonEmptyString,
  isInRange,
  sanitizeString,
  validateArray
};
