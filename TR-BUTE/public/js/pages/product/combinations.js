// Cart combination cards for custom product and original products
//
// Deps injected via initCombinations():
//   saveCart       - persist cart to localStorage
//   showToast      - display toast notification
//   getCartVariations  - getter returning the cartVariations object

import { CUSTOM_PRODUCT_ID } from '../../core/constants.js';
import { allProducts, currentProduct } from './data.js';
import {
  formatOptions,
  triptychFormatOptions,
  getProductPrice,
  getProductOldPrice,
  getProductProperty,
  formatNumberRussian,
} from './pricing.js';

let _saveCart, _showToast, _getCartVariations;

export const initCombinations = ({ saveCart, showToast, getCartVariations }) => {
  _saveCart = saveCart;
  _showToast = showToast;
  _getCartVariations = getCartVariations;
};

export const renderCustomProductCombinations = () => {
  const container = document.getElementById('custom-product-combinations');
  if (!container) return;

  const product = allProducts.find(p => p.id === CUSTOM_PRODUCT_ID);
  const options = product && product.triptych ? triptychFormatOptions : formatOptions;

  // All cart items for custom product (id=1)
  const comboEntries = Object.entries(window.cart || {}).filter(([, item]) =>
    item.productId === CUSTOM_PRODUCT_ID
  );

  if (comboEntries.length === 0) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  container.style.display = 'flex';
  container.innerHTML = '';

  comboEntries.forEach(([key, item]) => {
    const price = product ? getProductPrice(product, item.property) : 0;
    const oldPrice = product ? getProductOldPrice(product, item.property) : null;
    const imageUrl = item.custom_url || '';

    const card = document.createElement('div');
    card.className = 'custom-product-combo-card';
    card.dataset.key = key;

    const priceHTML = oldPrice && oldPrice > price
      ? `<span class="combo-price-old">${formatNumberRussian(oldPrice)} ₽</span><span class="combo-price">${formatNumberRussian(price)} ₽</span>`
      : `<span class="combo-price">${formatNumberRussian(price)} ₽</span>`;

    const formatOptionsHTML = options.map(opt => {
      const isActive = item.property === opt.value || item.property === opt.label;
      const optPrice = product ? getProductPrice(product, opt.value) : 0;
      return `<button class="combo-format-option${isActive ? ' active' : ''}" data-format="${opt.value}" data-label="${opt.label}">
        <span class="combo-format-label">${opt.label}</span>
        <span class="combo-format-price">${formatNumberRussian(optPrice)} ₽</span>
      </button>`;
    }).join('');

    card.innerHTML = `
      <div class="custom-product-combo-image-wrapper">
        ${imageUrl
          ? `<img class="custom-product-combo-image" src="${imageUrl}" alt="" onerror="this.style.display='none'"/>`
          : '<div class="custom-product-combo-image-placeholder"></div>'}
      </div>
      <div class="custom-product-combo-body">
        <div class="custom-product-combo-price-row">
          <div class="custom-product-combo-price-info">${priceHTML}</div>
          <button class="custom-product-combo-format-btn">
            <svg class="combo-format-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
            <span>${item.property}</span>
          </button>
          <button class="custom-product-combo-delete-btn" aria-label="Удалить">
            <svg width="14" height="14"><use href="#trash"></use></svg>
          </button>
        </div>
        <div class="custom-product-combo-format-dropdown">${formatOptionsHTML}</div>
      </div>
    `;

    // Format toggle
    const formatBtn = card.querySelector('.custom-product-combo-format-btn');
    const formatDropdown = card.querySelector('.custom-product-combo-format-dropdown');
    formatBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = formatDropdown.classList.contains('active');
      document.querySelectorAll('.custom-product-combo-format-dropdown.active').forEach(d => {
        d.classList.remove('active');
        d.closest('.custom-product-combo-card')?.querySelector('.combo-format-chevron')?.classList.remove('open');
      });
      if (!isOpen) {
        formatDropdown.classList.add('active');
        card.querySelector('.combo-format-chevron').classList.add('open');

        setTimeout(() => {
          const headerHeight = document.querySelector('.header')?.offsetHeight || 60;
          const rect = formatDropdown.getBoundingClientRect();
          const viewportHeight = window.innerHeight;
          const isAboveViewport = rect.top < headerHeight;
          const isBelowViewport = rect.bottom > viewportHeight;
          if (isAboveViewport || isBelowViewport) {
            if (isBelowViewport) {
              const bottomNavEl = window.innerWidth <= 1024 ? document.querySelector('.bottom-nav') : null;
              const bottomNavHeight = bottomNavEl ? bottomNavEl.offsetHeight : 0;
              window.scrollTo({ top: window.pageYOffset + rect.bottom - viewportHeight + 20 + bottomNavHeight, behavior: 'smooth' });
            } else {
              window.scrollTo({ top: window.pageYOffset + rect.top - headerHeight - 10, behavior: 'smooth' });
            }
          }
        }, 100);
      }
    });

    // Format option click
    formatDropdown.querySelectorAll('.combo-format-option').forEach(optBtn => {
      optBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const newFormatValue = optBtn.dataset.format;
        if (!newFormatValue || !product) return;

        const displayProperty = getProductProperty(product, newFormatValue);
        // Extract imageId: key is "1_property_imageId" where property may contain underscores
        // imageId is always the last segment after the last underscore that looks like a base-36 timestamp
        const keyParts = key.split('_');
        const imageId = keyParts[keyParts.length - 1];
        const newKey = `${CUSTOM_PRODUCT_ID}_${displayProperty}_${imageId}`;

        if (newKey !== key) {
          const oldData = window.cart[key];
          delete window.cart[key];
          window.cart[newKey] = { ...oldData, property: displayProperty };
          _saveCart();
          renderCustomProductCombinations();
        } else {
          formatDropdown.classList.remove('active');
          card.querySelector('.combo-format-chevron')?.classList.remove('open');
        }
      });
    });

    // Delete button
    const deleteBtn = card.querySelector('.custom-product-combo-delete-btn');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const removedItem = { ...window.cart[key] };
      delete window.cart[key];
      _saveCart();
      renderCustomProductCombinations();
      _showToast('Удалено из корзины', 'removed', 3000, false, {}, () => {
        window.cart[key] = removedItem;
        _saveCart();
        renderCustomProductCombinations();
      });
    });

    container.appendChild(card);
  });

  // Close dropdowns when clicking outside
  if (!container._outsideClickSet) {
    container._outsideClickSet = true;
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.custom-product-combo-card')) {
        document.querySelectorAll('.custom-product-combo-format-dropdown.active').forEach(d => {
          d.classList.remove('active');
          d.closest('.custom-product-combo-card')?.querySelector('.combo-format-chevron')?.classList.remove('open');
        });
      }
    });
  }
};


export const renderOriginalProductCombinations = () => {
  const container = document.getElementById('original-product-combinations');
  if (!container || !currentProduct) return;

  const options = currentProduct.triptych ? triptychFormatOptions : formatOptions;

  const comboEntries = Object.entries(window.cart || {}).filter(([, item]) =>
    item.productId === currentProduct.id
  );

  if (comboEntries.length === 0) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  container.style.display = 'flex';
  container.innerHTML = '';

  comboEntries.forEach(([key, item]) => {
    const price = getProductPrice(currentProduct, item.property);
    const oldPrice = getProductOldPrice(currentProduct, item.property);
    const variationKey = `${currentProduct.id}_${item.property}`;
    const varNum = _getCartVariations()[variationKey] || '';

    const card = document.createElement('div');
    card.className = 'custom-product-combo-card';
    card.dataset.key = key;

    const priceHTML = oldPrice && oldPrice > price
      ? `<span class="combo-price-old">${formatNumberRussian(oldPrice)} ₽</span><span class="combo-price">${formatNumberRussian(price)} ₽</span>`
      : `<span class="combo-price">${formatNumberRussian(price)} ₽</span>`;

    const formatOptionsHTML = options.map(opt => {
      const isActive = item.property === opt.value || item.property === opt.label;
      const optPrice = getProductPrice(currentProduct, opt.value);
      return `<button class="combo-format-option${isActive ? ' active' : ''}" data-format="${opt.value}" data-label="${opt.label}">
        <span class="combo-format-label">${opt.label}</span>
        <span class="combo-format-price">${formatNumberRussian(optPrice)} ₽</span>
      </button>`;
    }).join('');

    const varLabel = varNum ? `<span class="original-combo-var">вар. ${varNum}</span>` : '';

    card.innerHTML = `
      <div class="custom-product-combo-body" style="width:100%">
        <div class="custom-product-combo-price-row">
          <div class="custom-product-combo-price-info">${priceHTML}${varLabel}</div>
          <button class="custom-product-combo-format-btn">
            <svg class="combo-format-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
            <span>${item.property}</span>
          </button>
          <button class="custom-product-combo-delete-btn" aria-label="Удалить">
            <svg width="14" height="14"><use href="#trash"></use></svg>
          </button>
        </div>
        <div class="custom-product-combo-format-dropdown">${formatOptionsHTML}</div>
      </div>
    `;

    const formatBtn = card.querySelector('.custom-product-combo-format-btn');
    const formatDropdown = card.querySelector('.custom-product-combo-format-dropdown');
    formatBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = formatDropdown.classList.contains('active');
      document.querySelectorAll('#original-product-combinations .custom-product-combo-format-dropdown.active').forEach(d => {
        d.classList.remove('active');
        d.closest('.custom-product-combo-card')?.querySelector('.combo-format-chevron')?.classList.remove('open');
      });
      if (!isOpen) {
        formatDropdown.classList.add('active');
        card.querySelector('.combo-format-chevron').classList.add('open');

        setTimeout(() => {
          const headerHeight = document.querySelector('.header')?.offsetHeight || 60;
          const rect = formatDropdown.getBoundingClientRect();
          const viewportHeight = window.innerHeight;
          const isAboveViewport = rect.top < headerHeight;
          const isBelowViewport = rect.bottom > viewportHeight;
          if (isAboveViewport || isBelowViewport) {
            if (isBelowViewport) {
              const bottomNavEl = window.innerWidth <= 1024 ? document.querySelector('.bottom-nav') : null;
              const bottomNavHeight = bottomNavEl ? bottomNavEl.offsetHeight : 0;
              window.scrollTo({ top: window.pageYOffset + rect.bottom - viewportHeight + 20 + bottomNavHeight, behavior: 'smooth' });
            } else {
              window.scrollTo({ top: window.pageYOffset + rect.top - headerHeight - 10, behavior: 'smooth' });
            }
          }
        }, 100);
      }
    });

    formatDropdown.querySelectorAll('.combo-format-option').forEach(optBtn => {
      optBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const newFormatValue = optBtn.dataset.format;
        if (!newFormatValue) return;

        const displayProperty = getProductProperty(currentProduct, newFormatValue);
        const newKey = `${currentProduct.id}_${displayProperty}`;

        if (newKey !== key) {
          const oldVariation = _getCartVariations()[variationKey];
          const oldData = window.cart[key];
          delete window.cart[key];
          delete _getCartVariations()[variationKey];
          window.cart[newKey] = { ...oldData, property: displayProperty };
          if (oldVariation) _getCartVariations()[`${currentProduct.id}_${displayProperty}`] = oldVariation;
          _saveCart();
          renderOriginalProductCombinations();
        } else {
          formatDropdown.classList.remove('active');
          card.querySelector('.combo-format-chevron')?.classList.remove('open');
        }
      });
    });

    const deleteBtn = card.querySelector('.custom-product-combo-delete-btn');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const removedItem = { ...window.cart[key] };
      const removedVariation = _getCartVariations()[variationKey];
      delete window.cart[key];
      delete _getCartVariations()[variationKey];
      _saveCart();
      renderOriginalProductCombinations();
      _showToast('Удалено из корзины', 'removed', 3000, false, {}, () => {
        window.cart[key] = removedItem;
        if (removedVariation) _getCartVariations()[variationKey] = removedVariation;
        _saveCart();
        renderOriginalProductCombinations();
      });
    });

    container.appendChild(card);
  });

  if (!container._outsideClickSet) {
    container._outsideClickSet = true;
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#original-product-combinations .custom-product-combo-card')) {
        document.querySelectorAll('#original-product-combinations .custom-product-combo-format-dropdown.active').forEach(d => {
          d.classList.remove('active');
          d.closest('.custom-product-combo-card')?.querySelector('.combo-format-chevron')?.classList.remove('open');
        });
      }
    });
  }
};
