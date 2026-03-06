import { isVkCdnUrl, proxyVkCdnUrl, formatNumberRussian, addImageSize, sanitizeUrl } from '../../core/formatters.js';
import { showImageUploadModal } from '../../modules/image-upload-modal.js';
import { getBackgroundForCart, isCustomProduct as isCustomProductStatus } from '../product/background-selection.js';
import { AppSettings } from '../../core/app-settings.js';

// Injected dependencies — set via initItemRendering()
let _deps = {};

/**
 * Initialize item rendering with cart.js dependencies.
 * Must be called once during cart page init before any rendering.
 * deps shape: {
 *   getCart, getCartVariations, getAllProducts,
 *   getProductPrice, getProductOldPrice, getBaseProperty,
 *   formatOptions, triptychFormatOptions, propertyDimensions,
 *   saveCart, saveCartSilent, renderCart,
 *   updateItemQtyInDOM, updateOrderSummaryOnly, calculateCartTotal
 * }
 */
export const initItemRendering = (deps) => {
  _deps = deps;
};

function resolveVariantImage(productId, variantNum) {
  if (!variantNum || !window.allImagesByProduct) return null;
  const images = window.allImagesByProduct.get(productId);
  if (!images || !images.length) return null;
  const visibleVariants = images.filter(
    img => typeof img === 'object' && !img.hidden_product && img.extra === 'варианты'
  );
  const idx = parseInt(variantNum, 10) - 1;
  if (idx >= 0 && idx < visibleVariants.length) {
    return visibleVariants[idx].url || null;
  }
  return null;
}

function getCartItemTypeLabel(product, item, key) {
  if (product.id === window.CUSTOM_PRODUCT_ID) {
    return '<span class="cart-item-type-label">Изображение пользователя</span>';
  }
  if (product.status === 'custom') {
    return '<span class="cart-item-type-label">Изображение пользователя с дизайном TR/BUTE</span>';
  }
  if (product.type === 'оригинал' && !item.triptych) {
    const variationKey = `${item.productId}_${item.property}`;
    const varNum = _deps.getCartVariations()[variationKey];
    if (varNum) {
      return `<span class="cart-item-type-label">Вариант ${varNum}</span>`;
    }
  }
  return '';
}

export const createCartItemElement = (product, item, key) => {
  const { getCartVariations, getBaseProperty, getProductPrice, getProductOldPrice,
    formatOptions, triptychFormatOptions, propertyDimensions } = _deps;

  const isTriptych = item.triptych;
  const baseProperty = getBaseProperty(item.property);

  const propertyOptions = product.triptych ? triptychFormatOptions : formatOptions;

  const price = getProductPrice(product, item.property);
  const oldPrice = getProductOldPrice(product, item.property);
  const itemTotal = price * item.quantity;
  const itemOldTotal = oldPrice ? oldPrice * item.quantity : null;

  const cartItemDiv = document.createElement('div');
  const isCustomProductForStyling = product.type === 'custom' || product.product_type === 'custom' || product.status === 'custom';
  const isSpecialProduct = product.type === 'фирменный';
  const classes = ['cart-item'];
  if (isCustomProductForStyling) classes.push('custom-product');
  if (isSpecialProduct) classes.push('special-product');
  if (isTriptych) classes.push('triptych');
  cartItemDiv.className = classes.join(' ');
  cartItemDiv.dataset.key = key;

  const isSpecial = product.type === 'фирменный';
  const isCustomProductWithInput = product.id === window.CUSTOM_PRODUCT_ID;
  const showVariation = !isSpecial && !isTriptych && product.type === 'оригинал' && !isCustomProductWithInput;

  let variationColHTML = '';
  if (showVariation) {
    const variationKey = `${item.productId}_${item.property}`;
    const variationNum = getCartVariations()[variationKey] || '';
    variationColHTML = `
      <div class="cart-item-variation-col">
        <div class="cart-item-variation-col-row" data-tooltip="Указать вариант">
          <span class="cart-item-variation-col-label">вар.</span>
          <input type="text" class="cart-item-variation-col-input" inputmode="numeric" maxlength="2" value="${variationNum}"/>
        </div>
      </div>
    `;
  }

  const productParam = product.slug || product.id;
  const productUrl = "/product?id=" + productParam;

  let displayImage;
  if (isCustomProductWithInput) {
    displayImage = item.custom_url || item.image;
  } else if (showVariation) {
    const variationKey = `${item.productId}_${item.property}`;
    const varNum = getCartVariations()[variationKey];
    displayImage = resolveVariantImage(item.productId, varNum) || item.variant_image_url || item.image;
  } else {
    displayImage = item.image;
  }

  const isCustomProductWithBg = isCustomProductStatus(product);
  const selectedBackground = isCustomProductWithBg ? getBackgroundForCart(product.id) : null;
  const hasBackground = isCustomProductWithBg && selectedBackground && selectedBackground.displayUrl;

  let imageWrapperClass = 'cart-item-image-wrapper';
  if (isTriptych) imageWrapperClass += ' triptych';
  if (hasBackground) imageWrapperClass += ' with-background';

  let imageWrapperHTML = `<div class="${imageWrapperClass}"`;
  if (hasBackground) {
    const safeBgUrl = sanitizeUrl(selectedBackground.displayUrl);
    imageWrapperHTML += ` style="--bg-image: url('${safeBgUrl}')"`;
  }
  const fallbackImage = addImageSize(item.image, '480x0');
  const displayImageSrc = isCustomProductWithInput
    ? (sanitizeUrl(displayImage) || addImageSize(item.image, '480x0'))
    : addImageSize(displayImage, '480x0');
  imageWrapperHTML += `>
      ${hasBackground ? '<div class="cart-item-background"></div>' : ''}
      <a href="${productUrl}" class="cart-item-image-link">
        <img class="cart-item-image" src="${displayImageSrc}" alt="" data-fallback="${sanitizeUrl(fallbackImage)}"/>
      </a>
      <button class="cart-item-check ${item.checked !== false ? 'checked' : ''}" type="button" aria-label="Выбрать" title="${item.checked !== false ? 'Снять выбор' : 'Выбрать'}">
        <svg width="14" height="14"><use href="#checkmark"></use></svg>
      </button>
    </div>`;

  if (isCustomProductWithInput) {
    const replaceBtnLabel = item.custom_url ? 'Заменить' : 'Загрузить';
    imageWrapperHTML = `<div class="cart-item-image-col">
      ${imageWrapperHTML}
      <button class="cart-item-replace-btn" data-item-key="${key}">${replaceBtnLabel}</button>
    </div>`;
  } else if (isCustomProductWithBg) {
    imageWrapperHTML = `<div class="cart-item-image-col">
      ${imageWrapperHTML}
      <button class="cart-item-replace-btn cart-item-replace-btn-custom" data-item-key="${key}">Заменить</button>
    </div>`;
  } else if (showVariation) {
    imageWrapperHTML = `<div class="cart-item-image-col">
      ${imageWrapperHTML}
      ${variationColHTML}
    </div>`;
  }

  const currentLabel = propertyOptions.find(o => o.value === getBaseProperty(item.property))?.label || item.property;

  const formatOptionsHTML = propertyOptions.map(opt => {
    const isActive = getBaseProperty(item.property) === opt.value;
    const optDimensions = propertyDimensions[opt.value] || '';
    const optPrice = getProductPrice(product, opt.value);
    const optOldPrice = getProductOldPrice(product, opt.value);

    return `
      <div class="cart-item-format-option ${isActive ? 'active' : ''}" data-format="${opt.value}" role="button" tabindex="0">
        ${isActive
          ? '<span class="cart-item-format-selected">Выбран</span>'
          : `<button type="button" class="cart-item-format-add" data-format="${opt.value}" title="Добавить в корзину">+</button>`}
        <span class="cart-item-format-label">${opt.label}</span>
        <span class="cart-item-format-dims">${optDimensions}</span>
        <div class="cart-item-format-price-cell">
          ${optOldPrice ? `<span class="cart-item-format-old-price">${formatNumberRussian(optOldPrice)} ₽</span>` : ''}
          <span class="cart-item-format-price">${formatNumberRussian(optPrice)} ₽</span>
        </div>
      </div>
    `;
  }).join('');

  cartItemDiv.innerHTML = `
    <div class="cart-item-error-msg" hidden></div>
    <div class="cart-item-content">
      ${imageWrapperHTML}
      <div class="cart-item-middle">
        <div class="cart-item-info">
          <a href="${productUrl}" class="cart-item-title-link">
            <div class="cart-item-title">${item.title}</div>
          </a>
          ${getCartItemTypeLabel(product, item, key)}
          <div class="cart-item-format-info">${currentLabel}</div>
        </div>
        <div class="cart-item-bar">
          <button class="cart-item-bar-toggle" type="button">
            <span class="button-text-full">Изменить формат</span>
            <span class="button-text-short">Изменить</span>
            <svg width="10" height="10" viewBox="0 0 64 64"><use href="#chevron-down"></use></svg>
          </button>
          <div class="cart-item-bar-counter">
            <button type="button" class="cart-item-bar-counter-minus" title="Убрать">−</button>
            <span class="cart-item-bar-counter-qty">${item.quantity}</span>
            <button type="button" class="cart-item-bar-counter-plus" title="Добавить">+</button>
          </div>
          <div class="cart-item-bar-price">
            ${itemOldTotal ? `<span class="cart-item-old-price">${formatNumberRussian(itemOldTotal)} ₽</span>` : ''}
            <span class="cart-item-price">${formatNumberRussian(itemTotal)} ₽</span>
          </div>
          <button class="cart-item-bar-delete" type="button" aria-label="Удалить" title="Удалить">
            <svg width="14" height="14"><use href="#trash"></use></svg>
          </button>
        </div>
      </div>
      <button class="cart-item-favorite ${window.favorites && window.favorites.has(product.id) ? 'is-favorite' : ''}" type="button" aria-label="В избранное" title="${window.favorites && window.favorites.has(product.id) ? 'Убрать из избранного' : 'В избранное'}">
        <svg width="14" height="14"><use href="#heart"></use></svg>
      </button>
      <button class="cart-item-zoom" type="button" aria-label="Приблизить" title="Приблизить">
        <svg width="13" height="13"><use href="#search"></use></svg>
      </button>
    </div>
    <div class="cart-item-formats">
      <div class="cart-item-formats-list">
        ${formatOptionsHTML}
      </div>
    </div>
  `;

  return cartItemDiv;
};

export const attachCartItemListeners = (cartItemDiv, key, product, item) => {
  const { getCart, getCartVariations, getAllProducts,
    getProductPrice, getBaseProperty, triptychFormatOptions,
    saveCart, saveCartSilent, renderCart,
    updateItemQtyInDOM, updateOrderSummaryOnly, calculateCartTotal } = _deps;

  const titleLink = cartItemDiv.querySelector('.cart-item-title-link');
  titleLink.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      const productParam = product.slug || product.id;
      const url = "/product?id=" + productParam;
      if (typeof smoothNavigate === 'function') {
        smoothNavigate(url);
      } else {
        window.location.href = url;
      }
    }
  });

  const imageLink = cartItemDiv.querySelector('.cart-item-image-link');
  imageLink.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      const productParam = product.slug || product.id;
      const url = "/product?id=" + productParam;
      if (typeof smoothNavigate === 'function') {
        smoothNavigate(url);
      } else {
        window.location.href = url;
      }
    }
  });

  const cartImage = cartItemDiv.querySelector('.cart-item-image');
  if (cartImage && cartImage.dataset.fallback) {
    cartImage.addEventListener('error', function() {
      const originalSrc = this.src;
      if (isVkCdnUrl(originalSrc) && !originalSrc.includes('/api/img')) {
        this.src = proxyVkCdnUrl(originalSrc);
        this.addEventListener('error', () => {
          if (this.dataset.fallback && this.src !== this.dataset.fallback) {
            this.src = this.dataset.fallback;
          }
        }, { once: true });
      } else if (this.dataset.fallback && this.src !== this.dataset.fallback) {
        this.src = this.dataset.fallback;
      }
    });
  }

  const variationColWrapper = cartItemDiv.querySelector('.cart-item-variation-col');
  if (variationColWrapper) {
    const variationKey = `${item.productId}_${item.property}`;
    const colInput = variationColWrapper.querySelector('.cart-item-variation-col-input');

    colInput.addEventListener('input', () => {
      colInput.value = colInput.value.replace(/[^0-9]/g, '').slice(0, 2);
    });

    colInput.addEventListener('change', () => {
      const cartVariations = getCartVariations();
      if (colInput.value) {
        cartVariations[variationKey] = colInput.value;
        cartItemDiv.classList.remove('variation-missing');
        const msg = cartItemDiv.querySelector('.cart-item-error-msg');
        if (msg) msg.hidden = true;
        // Update miniature image to match variant
        const variantUrl = resolveVariantImage(item.productId, colInput.value);
        if (variantUrl) {
          const cartImg = cartItemDiv.querySelector('.cart-item-image');
          if (cartImg) cartImg.src = addImageSize(variantUrl, '480x0');
        }
        // Update type label
        const typeLabel = cartItemDiv.querySelector('.cart-item-type-label');
        if (typeLabel) typeLabel.textContent = `Вариант ${colInput.value}`;
      } else {
        delete cartVariations[variationKey];
        // Reset image to default product image
        const cartImg = cartItemDiv.querySelector('.cart-item-image');
        if (cartImg) cartImg.src = addImageSize(item.image, '480x0');
        // Remove type label text
        const typeLabel = cartItemDiv.querySelector('.cart-item-type-label');
        if (typeLabel) typeLabel.textContent = '';
      }
      saveCart();
    });
  }

  const replaceBtn = cartItemDiv.querySelector('.cart-item-replace-btn');
  if (replaceBtn) {
    replaceBtn.addEventListener('click', async (e) => {
      e.stopPropagation();

      if (replaceBtn.classList.contains('cart-item-replace-btn-custom')) {
        if (window.showToast) {
          window.showToast('Не удалось загрузить изображение, используйте предложенные пользователями варианты', 'error');
        }
        return;
      }

      await showImageUploadModal({
        type: 'product',
        contextId: String(item.productId),
        title: item.custom_url ? 'Заменить изображение' : 'Загрузить изображение',
        urlFirst: true,
        onSelect: (imageData) => {
          const newUrl = imageData.originalUrl || imageData.dataUrl || '';
          const cart = getCart();
          if (newUrl && cart[key]) {
            cart[key].custom_url = newUrl;
            cartItemDiv.classList.remove('image-missing');
            const msg = cartItemDiv.querySelector('.cart-item-error-msg');
            if (msg) msg.hidden = true;
            replaceBtn.textContent = 'Заменить';
            saveCart();
          }
        }
      });
    });
  }

  const checkBtn = cartItemDiv.querySelector('.cart-item-check');
  checkBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isChecked = checkBtn.classList.toggle('checked');
    checkBtn.dataset.tooltip = isChecked ? 'Снять выбор' : 'Выбрать';
    getCart()[key].checked = isChecked;
    renderCart();
    saveCart();
  });

  const favoriteBtn = cartItemDiv.querySelector('.cart-item-favorite');
  favoriteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (window.toggleFavoriteSynced) {
      window.toggleFavoriteSynced(product.id);
      const nowFavorite = window.favorites && window.favorites.has(product.id);
      favoriteBtn.classList.toggle('is-favorite', nowFavorite);
      favoriteBtn.dataset.tooltip = nowFavorite ? 'Убрать из избранного' : 'В избранное';
    }
  });

  const zoomBtn = cartItemDiv.querySelector('.cart-item-zoom');
  zoomBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (window.openZoom) {
      const imagesMap = window.allImagesByProduct;
      let imageUrls;
      if (imagesMap && imagesMap.size > 0) {
        const imgs = (imagesMap.get(product.id) || []).filter(img => !(typeof img === 'object' && img.hidden) && !(typeof img === 'object' && img.extra === 'обложка'));
        imageUrls = imgs.length ? imgs.map(img => typeof img === 'string' ? img : (img.url || img)) : null;
      }
      if (!imageUrls || !imageUrls.length) {
        imageUrls = [item.image].filter(Boolean);
      }
      if (imageUrls.length) {
        const productInfoArr = imageUrls.map(() => ({ title: item.title, id: product.id, slug: product.slug }));
        window.openZoom(imageUrls, 0, productInfoArr);
      }
    }
  });

  const formatToggle = cartItemDiv.querySelector('.cart-item-bar-toggle');
  const formatsSection = cartItemDiv.querySelector('.cart-item-formats');
  formatToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.cart-item-formats.expanded').forEach(el => {
      if (el !== formatsSection) {
        el.classList.remove('expanded');
        const otherToggle = el.closest('.cart-item')?.querySelector('.cart-item-bar-toggle');
        if (otherToggle) otherToggle.classList.remove('open');
      }
    });
    formatsSection.classList.toggle('expanded');
    formatToggle.classList.toggle('open');

    if (formatsSection.classList.contains('expanded')) {
      setTimeout(() => {
        const rect = formatsSection.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        if (rect.bottom > viewportHeight) {
          const bottomNavEl = window.innerWidth <= 1024 ? document.querySelector('.bottom-nav') : null;
          const bottomNavHeight = bottomNavEl ? bottomNavEl.offsetHeight : 0;
          const scrollNeeded = rect.bottom - viewportHeight + 12 + bottomNavHeight;
          window.scrollTo({ top: window.pageYOffset + scrollNeeded, behavior: 'smooth' });
        }
      }, 100);
    }
  });

  cartItemDiv.querySelectorAll('.cart-item-format-option:not(.active)').forEach(optBtn => {
    optBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const baseFormat = optBtn.dataset.format;

      let newProperty = baseFormat;
      if (product.triptych) {
        const triptychOption = triptychFormatOptions.find(o => o.value === baseFormat);
        if (triptychOption) {
          newProperty = triptychOption.label;
        }
      }

      const oldKey = key;
      let newKey;
      if (item.productId === 1 && item.imageId) {
        newKey = `${item.productId}_${newProperty}_${item.imageId}`;
      } else {
        newKey = `${item.productId}_${newProperty}`;
      }
      const oldVariationKey = `${item.productId}_${item.property}`;
      const newVariationKey = `${item.productId}_${newProperty}`;

      const cartVariations = getCartVariations();
      if (cartVariations[oldVariationKey]) {
        cartVariations[newVariationKey] = cartVariations[oldVariationKey];
        delete cartVariations[oldVariationKey];
      }

      const cart = getCart();
      const oldData = cart[oldKey];
      if (!oldData) return;

      delete cart[oldKey];

      if (item.productId === 1) {
        cart[newKey] = { ...oldData, property: newProperty };
      } else if (cart[newKey]) {
        cart[newKey].quantity += oldData.quantity;
      } else {
        cart[newKey] = { ...oldData, property: newProperty };
      }

      saveCart();
    });
  });

  const barMinusBtn = cartItemDiv.querySelector('.cart-item-bar-counter-minus');
  if (barMinusBtn) {
    barMinusBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const cart = getCart();
      if (cart[key].quantity > 1) {
        cart[key].quantity--;
        updateItemQtyInDOM(cartItemDiv, key, product);
        saveCartSilent();
        updateOrderSummaryOnly();
      } else {
        if (cartItemDiv.classList.contains('removing')) return;

        const variationKey = `${item.productId}_${item.property}`;

        const overlay = document.createElement('div');
        overlay.className = 'cart-item-remove-overlay';
        const undoBtn = document.createElement('button');
        undoBtn.className = 'cart-item-remove-undo';
        undoBtn.textContent = 'Вернуть';
        overlay.appendChild(undoBtn);
        cartItemDiv.appendChild(overlay);
        cartItemDiv.classList.add('removing');

        const timer = setTimeout(() => {
          const cart = getCart();
          const cartVariations = getCartVariations();
          delete cart[key];
          delete cartVariations[variationKey];
          saveCart();
          cartItemDiv.remove();
        }, 2000);

        undoBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          clearTimeout(timer);
          overlay.remove();
          cartItemDiv.classList.remove('removing');
        });
      }
    });
  }

  const barPlusBtn = cartItemDiv.querySelector('.cart-item-bar-counter-plus');
  if (barPlusBtn) {
    barPlusBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const limits = AppSettings.getCartLimits();
      if (limits.max_cart_total > 0) {
        const itemPrice = product ? getProductPrice(product, item.property) : (parseFloat(item.unitPrice) || 0);
        const currentTotal = calculateCartTotal();
        if (currentTotal + itemPrice > limits.max_cart_total) {
          window.showToast(`Сумма корзины не может превышать ${formatNumberRussian(limits.max_cart_total)}\u00a0₽`, 'error');
          return;
        }
      }
      const cart = getCart();
      cart[key].quantity++;
      updateItemQtyInDOM(cartItemDiv, key, product);
      saveCartSilent();
      updateOrderSummaryOnly();
    });
  }

  cartItemDiv.querySelectorAll('.cart-item-format-add').forEach(addBtn => {
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const baseFormat = addBtn.dataset.format;

      let newProperty = baseFormat;
      if (product.triptych) {
        const triptychOption = triptychFormatOptions.find(o => o.value === baseFormat);
        if (triptychOption) newProperty = triptychOption.label;
      }

      const newKey = `${item.productId}_${newProperty}`;
      const limits = AppSettings.getCartLimits();

      if (limits.max_cart_total > 0) {
        const allProducts = getAllProducts();
        const newProduct = allProducts.find(p => p.id === item.productId);
        const itemPrice = newProduct ? getProductPrice(newProduct, newProperty) : (parseFloat(item.unitPrice) || 0);
        const currentTotal = calculateCartTotal();
        if (currentTotal + itemPrice > limits.max_cart_total) {
          window.showToast(`Сумма корзины не может превышать ${formatNumberRussian(limits.max_cart_total)}\u00a0₽`, 'error');
          return;
        }
      }

      const cart = getCart();
      if (cart[newKey]) {
        cart[newKey].quantity++;
      } else {
        cart[newKey] = { ...item, property: newProperty, quantity: 1 };
      }

      saveCart();
    });
  });

  const deleteBtn = cartItemDiv.querySelector('.cart-item-bar-delete');
  deleteBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (cartItemDiv.classList.contains('removing')) return;

    const overlay = document.createElement('div');
    overlay.className = 'cart-item-remove-overlay';
    const undoBtn = document.createElement('button');
    undoBtn.className = 'cart-item-remove-undo';
    undoBtn.textContent = 'Вернуть';
    overlay.appendChild(undoBtn);
    cartItemDiv.appendChild(overlay);
    cartItemDiv.classList.add('removing');

    const timer = setTimeout(() => {
      const cart = getCart();
      const cartVariations = getCartVariations();
      const variationKey = `${item.productId}_${item.property}`;
      delete cart[key];
      delete cartVariations[variationKey];
      saveCart();
      cartItemDiv.remove();
    }, 2000);

    undoBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      clearTimeout(timer);
      overlay.remove();
      cartItemDiv.classList.remove('removing');
    });
  });
};
