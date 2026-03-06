/**
 * orders/product-search.js
 * Product search functionality for adding items to orders
 */

import { API_BASE } from '../../config.js';
import { showModal, hideModal, showToast, escapeHtml, formatNumber, addImageSize } from '../../utils.js';
import { searchProductsRelevance } from '../../utils/productSearch.js';
import { apiGet } from '../../utils/apiClient.js';

/**
 * Search products for inline adding to order
 */
export async function searchProductsForOrderInline(orderId, query, handleLocalItemAdd) {
  if (!query || query.length < 2) {
    const container = document.getElementById(`product-search-results-${orderId}`);
    if (container) {
      container.innerHTML = '<p class="text-sm text-secondary">Введите минимум 2 символа для поиска</p>';
    }
    return;
  }

  try {
    const response = await apiGet(`/products?all=true`);
    const products = await response.json();

    // Use relevance-based search
    const results = searchProductsRelevance(products, query, 10);

    const container = document.getElementById(`product-search-results-${orderId}`);
    if (!container) return;

    if (results.length === 0) {
      container.innerHTML = '<p class="text-sm text-secondary">Ничего не найдено</p>';
      return;
    }

    container.innerHTML = results.map(product => {
      const imageUrl = product.images && product.images.length > 0
        ? addImageSize(product.images[0], '100x0')
        : null;

      return `
        <div class="product-search-result" data-product-id="${product.id}">
          ${imageUrl ? `<img src="${imageUrl}" class="product-search-image" alt="${escapeHtml(product.title)}">` : ''}
          <div class="product-search-info">
            <div class="product-search-title">${escapeHtml(product.title)}</div>
            <div class="product-search-price">${formatNumber(product.price || 0)}₽</div>
          </div>
          <button class="btn btn-xs btn-primary" data-action="select-product-for-order" data-product-id="${product.id}" data-order-id="${orderId}">
            Выбрать
          </button>
        </div>
      `;
    }).join('');

  } catch (error) {
    console.error('Error searching products:', error);
    const container = document.getElementById(`product-search-results-${orderId}`);
    if (container) {
      container.innerHTML = '<p class="text-sm text-error">Ошибка поиска</p>';
    }
  }
}

/**
 * Add product to order inline (shows format selection)
 */
export async function addProductToOrderInline(orderId, productId, handleLocalItemAdd) {
  try {
    const response = await apiGet(`/products?all=true`);
    const products = await response.json();

    const product = products.find(p => p.id === productId);
    if (!product) {
      showToast('Продукт не найден', 'error');
      return;
    }

    // Get available formats based on product type
    const isTriptych = product.triptych;
    const formats = isTriptych
      ? ['3 A3 без рамок', '3 A2 без рамок', '3 A1 без рамок', '3 A3 в рамках', '3 A2 в рамках']
      : ['A3 без рамки', 'A2 без рамки', 'A1 без рамки', 'A3 в рамке', 'A2 в рамке'];

    // Show format selection
    const container = document.getElementById(`product-search-results-${orderId}`);
    if (!container) return;

    const imageUrl = product.images && product.images.length > 0
      ? addImageSize(product.images[0], '200x0')
      : null;

    container.innerHTML = `
      <div class="product-format-selection">
        <div class="product-format-header">
          ${imageUrl ? `<img src="${imageUrl}" class="product-format-image" alt="${escapeHtml(product.title)}">` : ''}
          <div class="product-format-info">
            <div class="product-format-title">${escapeHtml(product.title)}</div>
            <button class="btn btn-xs btn-secondary" data-action="back-to-search" data-order-id="${orderId}">
              ← Назад к поиску
            </button>
          </div>
        </div>
        <div class="product-format-options">
          <p class="text-sm text-secondary mb-sm">Выберите формат:</p>
          ${formats.map(format => `
            <button class="btn btn-format-option" data-action="add-product-with-format" data-product-id="${productId}" data-format="${format}" data-order-id="${orderId}">
              ${format}
            </button>
          `).join('')}
        </div>
      </div>
    `;

  } catch (error) {
    console.error('Error loading product for format selection:', error);
    showToast('Ошибка загрузки продукта', 'error');
  }
}

/**
 * Show add item modal for an order
 */
export async function showAddItemModal(orderId, handleLocalItemAdd, viewOrderDetails) {
  const modalContent = `
    <div class="add-item-form">
      <div class="form-group">
        <label class="form-label">Поиск товара</label>
        <input type="text" id="add-item-search-${orderId}" class="form-input" placeholder="Введите название товара...">
      </div>
      <div id="product-search-results-${orderId}" class="product-search-results">
        <p class="text-sm text-secondary">Начните вводить название товара</p>
      </div>
    </div>
  `;

  showModal('Добавить товар в заказ', modalContent, [
    {
      text: 'Отмена',
      className: 'btn btn-secondary',
      onClick: hideModal
    }
  ]);

  // Setup search listener
  setTimeout(() => {
    const searchInput = document.getElementById(`add-item-search-${orderId}`);
    const resultsContainer = document.getElementById(`product-search-results-${orderId}`);

    let searchTimeout;
    searchInput?.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      const query = e.target.value.trim();

      if (query.length < 2) {
        resultsContainer.innerHTML = '<p class="text-sm text-secondary">Введите минимум 2 символа для поиска</p>';
        return;
      }

      resultsContainer.innerHTML = '<p class="text-sm text-secondary">Поиск...</p>';

      searchTimeout = setTimeout(() => {
        searchProductsForOrderInline(orderId, query, handleLocalItemAdd);
      }, 300);
    });

    // Handle click events in modal
    resultsContainer?.addEventListener('click', async (e) => {
      const target = e.target;
      const action = target.dataset.action;

      if (action === 'select-product-for-order') {
        const productId = parseInt(target.dataset.productId);
        addProductToOrderInline(orderId, productId, handleLocalItemAdd);
      } else if (action === 'back-to-search') {
        const query = searchInput?.value || '';
        searchProductsForOrderInline(orderId, query, handleLocalItemAdd);
      } else if (action === 'add-product-with-format') {
        const productId = parseInt(target.dataset.productId);
        const format = target.dataset.format;
        hideModal();
        await handleLocalItemAdd(orderId, productId, format);
      }
    });

    searchInput?.focus();
  }, 100);
}
