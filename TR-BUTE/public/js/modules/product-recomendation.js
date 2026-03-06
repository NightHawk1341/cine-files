/**
 * Product Recommendations Module
 * Renders horizontal scrollable product card strips
 */
import { getViewedProductsExcluding, hasViewedProducts } from '../core/viewed-products.js';
/**
 * Render a recommendation section with a horizontal scroll of product cards
 * @param {HTMLElement} container - Parent element to append the section to
 * @param {Object} options
 * @param {string} options.title - Section title
 * @param {Array} options.products - Array of product objects
 * @param {string} [options.emptyText] - Text to show if no products (section hidden if not set)
 * @param {string} [options.className] - Additional CSS class for the section
 * @returns {HTMLElement|null} The created section element, or null if no products
 */
export function renderRecommendationSection(container, { title, products, emptyText, className }) {
  if (!container) return null;
  if (!products || products.length === 0) {
    if (!emptyText) return null;
  }
  const section = document.createElement('div');
  section.className = `recommendation-section${className ? ' ' + className : ''}`;
  const header = document.createElement('h3');
  header.className = 'recommendation-section-title';
  header.textContent = title;
  section.appendChild(header);
  if (!products || products.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'recommendation-empty';
    empty.textContent = emptyText;
    section.appendChild(empty);
    container.appendChild(section);
    return section;
  }
  const scrollContainer = document.createElement('div');
  scrollContainer.className = 'recommendation-scroll';
  products.forEach((product, index) => {
    const card = createRecommendationCard(product, index);
    scrollContainer.appendChild(card);
  });
  section.appendChild(scrollContainer);
  container.appendChild(section);
  return section;
}
/**
 * Create a minimal product card for recommendation strips
 */
function createRecommendationCard(product, index) {
  const card = document.createElement('a');
  card.className = 'recommendation-card';
  card.href = `/product/${product.slug || product.id}`;
  card.addEventListener('click', (e) => {
    e.preventDefault();
    const url = `/product/${product.slug || product.id}`;
    if (typeof window.smoothNavigate === 'function') {
      window.smoothNavigate(url);
    } else {
      window.location.href = url;
    }
  });
  // Image
  const imgWrapper = document.createElement('div');
  imgWrapper.className = 'recommendation-card-image';
  const img = document.createElement('img');
  const imageUrl = product.image || product.image_url || '';
  img.src = imageUrl ? addSize(imageUrl, '480x0') : '';
  img.alt = product.alt || product.title || '';
  img.loading = index < 3 ? 'eager' : 'lazy';
  img.onerror = function () { this.style.opacity = '0'; };
  imgWrapper.appendChild(img);
  // Status badge
  if (product.status === 'coming_soon') {
    const badge = document.createElement('span');
    badge.className = 'recommendation-badge coming-soon';
    badge.textContent = 'скоро';
    imgWrapper.appendChild(badge);
  }
  card.appendChild(imgWrapper);
  // Info
  const info = document.createElement('div');
  info.className = 'recommendation-card-info';
  const title = document.createElement('span');
  title.className = 'recommendation-card-title';
  title.textContent = product.title || '';
  info.appendChild(title);
  if (product.price && product.status !== 'coming_soon') {
    const priceRow = document.createElement('div');
    priceRow.className = 'recommendation-card-price';
    if (product.old_price && Number(product.old_price) > Number(product.price)) {
      const oldPrice = document.createElement('span');
      oldPrice.className = 'recommendation-old-price';
      oldPrice.textContent = `${formatPrice(product.old_price)} ₽`;
      priceRow.appendChild(oldPrice);
    }
    const currentPrice = document.createElement('span');
    currentPrice.textContent = `${formatPrice(product.price)} ₽`;
    priceRow.appendChild(currentPrice);
    info.appendChild(priceRow);
  }
  card.appendChild(info);
  return card;
}
/**
 * Add VK CDN image size parameter
 */
function addSize(url, size) {
  if (!url || typeof url !== 'string') return url;
  if (url.includes('vk.com') || url.includes('userapi.com') || url.includes('vk.me')) {
    // Replace existing cs= value or add it — cs= is how VK CDN selects image size
    if (url.includes('cs=')) {
      return url.replace(/cs=\d+x\d+/, `cs=${size}`);
    }
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}cs=${size}`;
  }
  return url;
}
/**
 * Format price with spaces as thousands separator
 */
function formatPrice(value) {
  const num = Number(value);
  if (isNaN(num)) return value;
  return num.toLocaleString('ru-RU');
}
/**
 * Load and render all recommendation sections on the product page
 * @param {HTMLElement} container - The recommendations container element
 * @param {Object} product - Current product data
 */
export async function loadProductRecommendations(container, product) {
  if (!container || !product) return;
  container.innerHTML = '';
  // Fetch recommendations and coming soon in parallel
  const [recsData, comingSoonData] = await Promise.allSettled([
    fetch(`/api/products/recommendations?productId=${product.id}&limit=8`)
      .then(r => r.ok ? r.json() : { products: [] }),
    fetch('/api/products/coming-soon?limit=6')
      .then(r => r.ok ? r.json() : { products: [] })
  ]);
  const recommendations = recsData.status === 'fulfilled' ? (recsData.value.products || []) : [];
  const comingSoon = comingSoonData.status === 'fulfilled' ? (comingSoonData.value.products || []) : [];
  // Filter out current product from coming soon
  const filteredComingSoon = comingSoon.filter(p => p.id !== product.id);
  // "You may also like" section
  if (recommendations.length > 0) {
    renderRecommendationSection(container, {
      title: 'Вам может понравиться',
      products: recommendations,
      className: 'recs-similar'
    });
  }
  // "Coming soon" section
  if (filteredComingSoon.length > 0) {
    renderRecommendationSection(container, {
      title: 'Скоро в продаже',
      products: filteredComingSoon,
      className: 'recs-coming-soon'
    });
  }
  // "Recently viewed" section (from localStorage)
  if (hasViewedProducts()) {
    const viewed = getViewedProductsExcluding([product.id], 8);
    if (viewed.length > 0) {
      renderRecommendationSection(container, {
        title: 'Недавно просмотренные',
        products: viewed,
        className: 'recs-viewed'
      });
    }
  }
  // Show container only if it has content
  container.style.display = container.children.length > 0 ? '' : 'none';
}