/**
 * shipping/utils.js
 * Pure utility functions with no state dependencies.
 */

import { escapeHtml } from '../../../core/formatters.js';
export { escapeHtml };

/**
 * Clean address by removing duplicate consecutive parts
 * (e.g., "Москва, Москва, ул. Пушкина" -> "Москва, ул. Пушкина")
 * Also removes country if followed by city
 * (e.g., "Россия, Москва, Москва" -> "Москва")
 */
export function cleanDuplicateAddressParts(address) {
  if (!address) return '';

  // Split by comma, trim each part
  const parts = address.split(',').map(p => p.trim()).filter(p => p);

  // Remove "Россия" if present as first part
  if (parts.length > 0 && parts[0].toLowerCase() === 'россия') {
    parts.shift();
  }

  // Remove consecutive duplicates (case-insensitive comparison)
  const cleaned = [];
  for (let i = 0; i < parts.length; i++) {
    if (i === 0 || parts[i].toLowerCase() !== parts[i - 1].toLowerCase()) {
      cleaned.push(parts[i]);
    }
  }

  return cleaned.join(', ');
}

/**
 * Format suggested address for display - shows street and house without city/country prefix
 */
export function formatSuggestedAddress(address) {
  if (!address) return '';

  const cleaned = cleanDuplicateAddressParts(address);

  // Try to extract just the street part (skip city/region)
  // Address format is usually: "City, Street, House" or "Region, City, Street, House"
  const parts = cleaned.split(',').map(p => p.trim());

  // If we have 3+ parts, skip the first 1-2 (likely city/region) and show the rest
  if (parts.length >= 3) {
    // Check if first part looks like a city/region (ends with area keywords or is short)
    const cityKeywords = ['область', 'край', 'республика', 'округ', 'г.', 'город'];
    const firstPartLooksLikeCity = parts[0].length <= 20 ||
      cityKeywords.some(kw => parts[0].toLowerCase().includes(kw));

    if (firstPartLooksLikeCity && parts.length >= 3) {
      return parts.slice(1).join(', ');
    }
  }

  return cleaned;
}

/**
 * Format items count with correct Russian plural
 */
export function formatItemsCount(count) {
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return `${count} товаров`;
  }

  if (lastDigit === 1) {
    return `${count} товар`;
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return `${count} товара`;
  }

  return `${count} товаров`;
}

/**
 * Map delivery type to API code
 */
export function mapDeliveryTypeCode(provider, deliveryType, express) {
  if (!provider || !deliveryType) return '';

  if (provider === 'cdek') {
    if (express) {
      return deliveryType === 'pvz' ? 'cdek_pvz_express' : 'cdek_courier';
    }
    return deliveryType === 'pvz' ? 'cdek_pvz' : 'cdek_courier';
  } else if (provider === 'pochta') {
    if (express) {
      return deliveryType === 'pvz' ? 'pochta_first_class' : 'pochta_courier';
    }
    return deliveryType === 'pvz' ? 'pochta_standard' : 'pochta_courier';
  }

  return '';
}

/**
 * Get postal code from input field
 */
export function getPostalCode() {
  const postalInput = document.getElementById('order-postal-index');
  return postalInput ? postalInput.value.trim() : '';
}
