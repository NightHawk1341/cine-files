/**
 * T-Bank Payment Service
 *
 * Integration with T-Bank Acquiring API (EACQ) for payment processing.
 * Features:
 * - Payment initialization (Init)
 * - Payment status check (GetState)
 * - Refund/cancel processing (Cancel)
 * - Webhook/notification handling with token verification
 * - Fiscal receipt generation
 *
 * Documentation: https://developer.tbank.ru/eacq/
 */

const crypto = require('crypto');

const API_BASE_PRODUCTION = 'https://securepay.tinkoff.ru/v2';
const API_BASE_TEST = 'https://rest-api-test.tinkoff.ru/v2';

/**
 * Get the API base URL based on environment
 * DEMO terminals use production URL; test environment requires IP whitelisting
 */
function getApiBase() {
  if (process.env.TBANK_USE_TEST_ENV === 'true') {
    return API_BASE_TEST;
  }
  return API_BASE_PRODUCTION;
}

/**
 * Get T-Bank credentials from environment variables
 * @returns {object} Credentials { terminalKey, password }
 */
function getCredentials() {
  return {
    terminalKey: process.env.TBANK_TERMINAL_KEY,
    password: process.env.TBANK_PASSWORD
  };
}

/**
 * Generate token for T-Bank API request signing
 *
 * Algorithm:
 * 1. Collect all request params as key-value pairs (exclude nested objects and Token itself)
 * 2. Add Password to the collection
 * 3. Sort alphabetically by key
 * 4. Concatenate values only into a single string
 * 5. SHA-256 hash the result
 *
 * @param {object} params - Request parameters (flat key-value, no nested objects)
 * @param {string} password - Terminal password
 * @returns {string} SHA-256 hex hash
 */
function generateToken(params, password) {
  // Collect flat params, exclude Token and nested objects/arrays
  const tokenParams = {};

  for (const [key, value] of Object.entries(params)) {
    if (key === 'Token') continue;
    if (value === null || value === undefined) continue;
    if (typeof value === 'object') continue; // Skip Receipt, DATA, etc.
    tokenParams[key] = String(value);
  }

  // Add password
  tokenParams.Password = password;

  // Sort by key alphabetically
  const sortedKeys = Object.keys(tokenParams).sort();

  // Concatenate values only
  const concatenated = sortedKeys.map(key => tokenParams[key]).join('');

  // SHA-256 hash
  return crypto.createHash('sha256').update(concatenated, 'utf-8').digest('hex');
}

/**
 * Make request to T-Bank API
 * @param {string} method - API method name (e.g., 'Init', 'Cancel', 'GetState')
 * @param {object} params - Request parameters
 * @param {object} credentials - { terminalKey, password }
 * @returns {Promise<object>} Response data
 */
async function apiRequest(method, params, credentials) {
  const requestBody = {
    TerminalKey: credentials.terminalKey,
    ...params
  };

  // Generate and add token
  requestBody.Token = generateToken(requestBody, credentials.password);

  const apiBase = getApiBase();
  const url = `${apiBase}/${method}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  const result = await response.json();

  if (!result.Success && result.ErrorCode !== '0') {
    const error = new Error(result.Message || `T-Bank API error: ${result.ErrorCode}`);
    error.code = result.ErrorCode;
    error.details = result.Details;
    error.response = result;
    throw error;
  }

  return result;
}

/**
 * Initialize a payment session
 *
 * @param {object} params - Payment parameters
 * @param {number} params.amount - Amount in rubles (will be converted to kopecks)
 * @param {string} params.orderId - Unique order ID (≤36 chars)
 * @param {string} params.description - Payment description (≤140 chars)
 * @param {string} params.customerEmail - Customer email for receipt
 * @param {object} params.receipt - Receipt object for fiscal compliance
 * @param {string} params.notificationUrl - Webhook URL for payment notifications
 * @param {string} params.successUrl - Redirect URL after successful payment
 * @param {string} params.failUrl - Redirect URL after failed payment
 * @param {object} credentials - T-Bank credentials
 * @returns {Promise<object>} { paymentId, paymentUrl, status, amount }
 */
async function initPayment(params, credentials) {
  const {
    amount,
    orderId,
    description,
    customerEmail,
    receipt,
    notificationUrl,
    successUrl,
    failUrl,
    data
  } = params;

  // Amount must be in kopecks (integer)
  const amountKopecks = Math.round(amount * 100);

  const requestParams = {
    Amount: amountKopecks,
    OrderId: String(orderId),
    Description: description ? description.substring(0, 140) : undefined,
    PayType: 'O', // One-stage payment
    Language: 'ru'
  };

  if (notificationUrl) requestParams.NotificationURL = notificationUrl;
  if (successUrl) requestParams.SuccessURL = successUrl;
  if (failUrl) requestParams.FailURL = failUrl;

  if (receipt) {
    requestParams.Receipt = receipt;
  }

  if (data) {
    requestParams.DATA = data;
  }

  const result = await apiRequest('Init', requestParams, credentials);

  return {
    paymentId: result.PaymentId,
    paymentUrl: result.PaymentURL,
    status: result.Status,
    amount: result.Amount,
    orderId: result.OrderId,
    raw: result
  };
}

/**
 * Get payment state
 *
 * @param {string} paymentId - T-Bank PaymentId
 * @param {object} credentials - T-Bank credentials
 * @returns {Promise<object>} Payment state
 */
async function getPaymentState(paymentId, credentials) {
  const result = await apiRequest('GetState', {
    PaymentId: paymentId
  }, credentials);

  return {
    paymentId: result.PaymentId,
    orderId: result.OrderId,
    status: result.Status,
    amount: result.Amount,
    raw: result
  };
}

/**
 * Cancel or refund a payment
 * For CONFIRMED payments, this acts as a refund.
 * Amount parameter enables partial refunds.
 *
 * @param {string} paymentId - T-Bank PaymentId
 * @param {number} amount - Amount to refund in rubles (omit for full refund)
 * @param {object} credentials - T-Bank credentials
 * @returns {Promise<object>} Cancel/refund result
 */
async function cancelPayment(paymentId, amount, credentials) {
  const params = {
    PaymentId: paymentId
  };

  if (amount !== undefined && amount !== null) {
    params.Amount = Math.round(amount * 100); // Convert to kopecks
  }

  const result = await apiRequest('Cancel', params, credentials);

  return {
    success: result.Success,
    status: result.Status,
    paymentId: result.PaymentId,
    originalAmount: result.OriginalAmount,
    newAmount: result.NewAmount,
    raw: result
  };
}

/**
 * Build receipt for T-Bank fiscal compliance
 *
 * @param {object} params - Receipt parameters
 * @param {Array} params.items - Order items [{ title, price (rubles), quantity }]
 * @param {number} params.deliveryCost - Delivery cost in rubles
 * @param {string} params.deliveryName - Label for the delivery line item (default: 'Доставка')
 * @param {string} params.email - Customer email
 * @param {string} params.phone - Customer phone (optional, format: +7XXXXXXXXXX)
 * @param {string} params.taxation - Taxation system (default: 'usn_income')
 * @returns {object} Receipt object for T-Bank Init
 */
function buildReceipt(params) {
  const {
    items,
    deliveryCost = 0,
    deliveryName = 'Доставка',
    email,
    phone,
    taxation = 'usn_income' // УСН доход
  } = params;

  const receiptItems = items.map(item => ({
    Name: (item.title || item.name).substring(0, 128),
    Price: Math.round(Number(item.price) * 100), // kopecks
    Quantity: Number(item.quantity),
    Amount: Math.round(Number(item.price) * Number(item.quantity) * 100), // kopecks
    Tax: 'none', // No VAT for УСН
    PaymentMethod: 'full_prepayment',
    PaymentObject: 'commodity'
  }));

  // Add delivery as separate service item
  if (deliveryCost > 0) {
    receiptItems.push({
      Name: deliveryName.substring(0, 128),
      Price: Math.round(Number(deliveryCost) * 100),
      Quantity: 1,
      Amount: Math.round(Number(deliveryCost) * 100),
      Tax: 'none',
      PaymentMethod: 'full_prepayment',
      PaymentObject: 'service'
    });
  }

  const receipt = {
    Items: receiptItems,
    Taxation: taxation
  };

  if (email) {
    receipt.Email = email;
  }

  if (phone) {
    receipt.Phone = phone;
  }

  // Payments object: Electronic must equal total Amount
  const totalAmount = receiptItems.reduce((sum, item) => sum + item.Amount, 0);
  receipt.Payments = {
    Electronic: totalAmount
  };

  return receipt;
}

/**
 * Verify webhook notification token
 *
 * Same algorithm as request signing:
 * 1. Collect all params except Token and nested objects
 * 2. Add Password
 * 3. Sort by key, concatenate values
 * 4. SHA-256 hash and compare
 *
 * @param {object} payload - Notification payload
 * @param {string} password - Terminal password
 * @returns {boolean} Is token valid
 */
function verifyNotificationToken(payload, password) {
  const receivedToken = payload.Token;
  if (!receivedToken) return false;

  const calculatedToken = generateToken(payload, password);
  return receivedToken === calculatedToken;
}

/**
 * Parse webhook notification payload
 *
 * @param {object} payload - Raw notification payload from T-Bank
 * @returns {object} Parsed notification data
 */
function parseNotificationPayload(payload) {
  return {
    terminalKey: payload.TerminalKey,
    orderId: payload.OrderId,
    success: payload.Success,
    status: payload.Status,
    paymentId: String(payload.PaymentId),
    errorCode: payload.ErrorCode,
    amount: payload.Amount ? payload.Amount / 100 : 0, // Convert kopecks to rubles
    amountKopecks: payload.Amount,
    pan: payload.Pan, // Masked card number
    expDate: payload.ExpDate,
    cardId: payload.CardId,
    rebillId: payload.RebillId,
    token: payload.Token,
    raw: payload
  };
}

// T-Bank payment statuses
const PAYMENT_STATUSES = {
  NEW: 'NEW',
  FORM_SHOWED: 'FORM_SHOWED',
  AUTHORIZING: 'AUTHORIZING',
  AUTHORIZED: 'AUTHORIZED',
  CONFIRMED: 'CONFIRMED',
  REVERSING: 'REVERSING',
  REVERSED: 'REVERSED',
  REFUNDING: 'REFUNDING',
  PARTIAL_REFUNDED: 'PARTIAL_REFUNDED',
  REFUNDED: 'REFUNDED',
  REJECTED: 'REJECTED',
  AUTH_FAIL: 'AUTH_FAIL',
  CANCELED: 'CANCELED',
  DEADLINE_EXPIRED: 'DEADLINE_EXPIRED'
};

module.exports = {
  getCredentials,
  generateToken,
  apiRequest,
  initPayment,
  getPaymentState,
  cancelPayment,
  buildReceipt,
  verifyNotificationToken,
  parseNotificationPayload,
  PAYMENT_STATUSES
};
