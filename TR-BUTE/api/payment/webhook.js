/**
 * Payment Webhook - Entry Point
 *
 * Routes to the appropriate payment provider webhook handler.
 * Currently uses T-Bank (EACQ) integration.
 */

module.exports = require('./tbank/webhook');
