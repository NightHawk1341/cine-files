// ============================================================
// ORDER PAGE - Product Search Modal
// ============================================================

import { getAccessToken } from '../../core/auth.js';
import { formatNumberRussian, addImageSize, showModal, FORMAT_OPTIONS } from './constants.js';

let searchDebounceTimer = null;

/**
 * Show product search modal for adding items to an order
 */
export async function showProductSearchModal(order) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'order-modal-overlay faq-popup-overlay active';
    overlay.style.zIndex = '9999';

    overlay.innerHTML = `
      <div class="order-modal-content faq-popup-content" style="max-width: 480px; max-height: 85vh; display: flex; flex-direction: column;">
        <div class="faq-popup-header">
          <div class="faq-popup-title">Добавить товар</div>
          <button class="order-modal-close faq-popup-close btn-icon" id="search-modal-close">
            <svg width="12" height="12"><use href="#x"></use></svg>
          </button>
        </div>
        <div style="padding: 0 16px 12px;">
          <input type="text" id="product-search-input" placeholder="Поиск товаров..." style="
            width: 100%; padding: 10px 14px; border: 1px solid var(--border-color, #414141); border-radius: 8px;
            background: var(--bg-secondary, #1e1e1e); color: var(--text-primary, #E0E0E0); font-size: 14px; box-sizing: border-box;
          ">
        </div>
        <div id="product-search-results" style="flex: 1; overflow-y: auto; padding: 0 16px 16px; min-height: 100px;">
          <p style="color: var(--text-tertiary, #818181); font-size: 13px; text-align: center; padding: 20px 0;">Введите название товара для поиска</p>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    const searchInput = overlay.querySelector('#product-search-input');
    const resultsContainer = overlay.querySelector('#product-search-results');

    const closeModal = (result = null) => {
      overlay.classList.remove('active');
      document.body.style.overflow = '';
      setTimeout(() => overlay.remove(), 300);
      resolve(result);
    };

    // Close button
    overlay.querySelector('#search-modal-close').addEventListener('click', () => closeModal());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    // Search input handler with debounce
    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounceTimer);
      const query = searchInput.value.trim();
      if (query.length < 2) {
        resultsContainer.innerHTML = '<p style="color: var(--text-tertiary, #818181); font-size: 13px; text-align: center; padding: 20px 0;">Введите минимум 2 символа</p>';
        return;
      }
      resultsContainer.innerHTML = '<p style="color: var(--text-tertiary, #818181); font-size: 13px; text-align: center; padding: 20px 0;">Поиск...</p>';
      searchDebounceTimer = setTimeout(() => searchProducts(query, resultsContainer, order, closeModal), 300);
    });

    // Focus input
    setTimeout(() => searchInput.focus(), 100);
  });
}

/**
 * Search products via API and render results
 */
async function searchProducts(query, container, order, closeModal) {
  try {
    const response = await fetch(`/api/products/search?query=${encodeURIComponent(query)}`);
    const result = await response.json();

    if (!result.success || !result.data?.products?.length) {
      container.innerHTML = '<p style="color: var(--text-tertiary, #818181); font-size: 13px; text-align: center; padding: 20px 0;">Ничего не найдено</p>';
      return;
    }

    container.innerHTML = result.data.products.map(product => `
      <div class="product-search-item" data-product-id="${product.id}" style="
        display: flex; gap: 10px; align-items: center; padding: 10px; margin-bottom: 8px;
        border: 1px solid var(--border-color, #414141); border-radius: 10px; cursor: pointer;
        background: var(--card-bg, rgba(30, 30, 30, 0.6)); transition: border-color 0.2s;
      ">
        <img src="${addImageSize(product.image_url, '100x0')}" alt="${product.title}" style="
          width: 50px; height: 50px; border-radius: 6px; object-fit: cover; flex-shrink: 0;
        " onerror="this.style.display='none'">
        <div style="flex: 1; min-width: 0;">
          <div style="font-size: 14px; font-weight: 500; color: var(--text-primary, #E0E0E0); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${product.title}</div>
          <div style="font-size: 12px; color: var(--text-tertiary, #818181);">${formatNumberRussian(product.price)} ₽</div>
        </div>
      </div>
    `).join('');

    // Attach click handlers for each product
    container.querySelectorAll('.product-search-item').forEach(item => {
      item.addEventListener('click', () => {
        const productId = parseInt(item.dataset.productId);
        const product = result.data.products.find(p => p.id === productId);
        if (product) {
          showFormatSelectionStep(product, container, order, closeModal);
        }
      });
    });
  } catch (err) {
    console.error('Product search error:', err);
    container.innerHTML = '<p style="color: var(--status-error, #ef4444); font-size: 13px; text-align: center; padding: 20px 0;">Ошибка поиска</p>';
  }
}

/**
 * Show format selection step after product is chosen
 */
function showFormatSelectionStep(product, container, order, closeModal) {
  container.innerHTML = `
    <div style="padding: 8px 0;">
      <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 16px;">
        <img src="${addImageSize(product.image_url, '100x0')}" alt="${product.title}" style="
          width: 60px; height: 60px; border-radius: 8px; object-fit: cover; flex-shrink: 0;
        " onerror="this.style.display='none'">
        <div>
          <div style="font-size: 15px; font-weight: 500; color: var(--text-primary, #E0E0E0);">${product.title}</div>
          <div style="font-size: 13px; color: var(--text-tertiary, #818181);">${formatNumberRussian(product.price)} ₽</div>
        </div>
      </div>
      <label style="font-size: 13px; color: var(--text-secondary, #a3a3a3); display: block; margin-bottom: 8px;">Выберите формат:</label>
      <div id="format-options" style="display: flex; flex-direction: column; gap: 6px;">
        ${FORMAT_OPTIONS.map(fmt => `
          <button class="format-option-btn" data-format="${fmt.value}" style="
            display: flex; justify-content: space-between; align-items: center; padding: 10px 14px;
            border: 1px solid var(--border-color, #414141); border-radius: 8px; cursor: pointer;
            background: var(--card-bg, rgba(30, 30, 30, 0.6)); color: var(--text-primary, #E0E0E0);
            font-size: 14px; transition: border-color 0.2s;
          ">
            <span>${fmt.label}</span>
            <span style="font-size: 12px; color: var(--text-tertiary, #818181);">${fmt.dimensions}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;

  container.querySelectorAll('.format-option-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const format = btn.dataset.format;
      btn.disabled = true;
      btn.textContent = 'Добавляем...';
      await addProductToOrder(order, product, format, closeModal);
    });
  });
}

/**
 * Add selected product to order via API
 */
async function addProductToOrder(order, product, format, closeModal) {
  try {
    const token = getAccessToken();
    const response = await fetch('/api/orders/items/add', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        order_id: order.id,
        product_id: product.id,
        title: product.title,
        quantity: 1,
        price_at_purchase: product.price,
        property: format,
        variation_num: null,
        image: product.image_url
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Не удалось добавить товар');
    }

    closeModal(true);
    await showModal('Товар добавлен в заказ!', 'success');
    window.location.reload();
  } catch (err) {
    console.error('Error adding product to order:', err);
    await showModal(`Ошибка: ${err.message}`, 'error');
  }
}
