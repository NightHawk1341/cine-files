/**
 * Payment Create Link - Entry Point
 *
 * Routes to the appropriate payment provider handler.
 * Currently uses T-Bank (EACQ) integration.
 */

module.exports = require('./tbank/create-link');
