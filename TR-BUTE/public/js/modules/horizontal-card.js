/**
 * Horizontal Product Card Component
 *
 * Unified card component for displaying products horizontally across the site.
 * Used for order items, cart items, and checkout items.
 *
 * @module horizontal-card
 */

import { escapeHtml, formatNumberRussian } from '../core/formatters.js';

/**
 * Render a horizontal product card
 *
 * @param {Object} options - Card configuration
 * @param {string} options.image - Product image URL
 * @param {string} options.title - Product title
 * @param {string} options.details - Product details (format + quantity text for bar)
 * @param {number} options.price - Product price
 * @param {number} [options.oldPrice] - Original price (for discounts)
 * @param {string} [options.href] - Link URL for image/title navigation
 * @param {boolean} [options.compact=false] - Use compact variant (for checkout/cart summary)
 * @param {boolean} [options.triptych=false] - Apply triptych shadow effect
 * @param {boolean} [options.customProduct=false] - Apply custom product styling
 * @param {boolean} [options.specialProduct=false] - Apply special product styling (orange hover)
 * @param {number} [options.quantity] - Item quantity (shown in bar as "× N")
 * @param {string} [options.className] - Additional CSS classes
 * @param {string} [options.contentExtra] - Extra HTML to append after the card
 * @param {Object} [options.dataAttrs] - Data attributes as key-value pairs
 * @returns {string} HTML string for the card
 */
export function renderHorizontalCard(options) {
  const {
    image,
    title,
    details,
    price,
    oldPrice,
    href,
    compact = false,
    triptych = false,
    customProduct = false,
    specialProduct = false,
    quantity,
    className = '',
    contentExtra = '',
    dataAttrs = {}
  } = options;

  // Build class list
  const classes = ['horizontal-card'];
  if (compact) classes.push('compact');
  if (triptych) classes.push('triptych');
  if (customProduct) classes.push('custom-product');
  if (specialProduct) classes.push('special-product');
  if (className) classes.push(className);

  // Build data attributes
  const dataAttrsStr = Object.entries(dataAttrs)
    .map(([key, value]) => `data-${key}="${escapeHtml(String(value))}"`)
    .join(' ');

  // Build image wrapper
  const imageWrapperClass = `horizontal-card-image-wrapper${triptych ? ' triptych' : ''}`;
  const imageLink = href
    ? `<a href="${escapeHtml(href)}" class="horizontal-card-image-link"><img src="${escapeHtml(image)}" alt="${escapeHtml(title)}" class="horizontal-card-image" onerror="this.src='/placeholder.png'" loading="lazy"></a>`
    : `<img src="${escapeHtml(image)}" alt="${escapeHtml(title)}" class="horizontal-card-image" onerror="this.src='/placeholder.png'" loading="lazy">`;

  // Build title section
  const titleHTML = href
    ? `<a href="${escapeHtml(href)}" class="horizontal-card-title-link"><div class="horizontal-card-title">${escapeHtml(title)}</div></a>`
    : `<div class="horizontal-card-title">${escapeHtml(title)}</div>`;

  // Build bar info (format + quantity)
  let barInfoHTML = `<span>${escapeHtml(details)}</span>`;
  if (quantity && quantity > 1) {
    barInfoHTML = `<span>${escapeHtml(details)}</span><span class="horizontal-card-bar-qty">× ${quantity}</span>`;
  }

  // Build price display
  let priceHTML = '';
  if (price !== undefined && price !== null) {
    priceHTML = `<span class="horizontal-card-price">${formatPrice(price)}</span>`;
    if (oldPrice && oldPrice > price) {
      priceHTML += `<span class="horizontal-card-old-price">${formatPrice(oldPrice)}</span>`;
    }
  }

  return `
    <div class="${classes.join(' ')}" ${dataAttrsStr}>
      <div class="horizontal-card-top">
        <div class="${imageWrapperClass}">
          ${imageLink}
        </div>
        <div class="horizontal-card-info">
          ${titleHTML}
        </div>
      </div>
      <div class="horizontal-card-bar">
        <div class="horizontal-card-bar-info">
          ${barInfoHTML}
        </div>
        <div class="horizontal-card-bar-price">
          ${priceHTML}
        </div>
      </div>
      ${contentExtra}
    </div>
  `;
}

function formatPrice(price) {
  return `${formatNumberRussian(price)} ₽`;
}

/**
 * Create a horizontal card element (returns DOM element instead of HTML string)
 *
 * @param {Object} options - Same as renderHorizontalCard
 * @returns {HTMLElement} Card element
 */
export function createHorizontalCard(options) {
  const html = renderHorizontalCard(options);
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstChild;
}

export default {
  renderHorizontalCard,
  createHorizontalCard
};
