/**
 * components/imageManager.js
 * Extracted from admin-miniapp/script.js
 */

import { API_BASE, tg, isBrowserMode } from '../config.js';
import { showModal, hideModal, formatDate, formatTime, formatPrice, showToast, showError, copyToClipboard, addImageSize } from '../utils.js';
import { loadProductsList, handlePostCreateInsertion } from '../views/products.js';
import { searchProductsRelevance, searchProductsWithVariants } from '../utils/productSearch.js';
import { apiGet, apiPost } from '../utils/apiClient.js';
import { isAdmin, isEditor, hasPermission } from '../state.js';
import { loadCatalogsForProduct, renderCatalogsUI, renderSelectedCatalogs, refreshCatalogsUI, setupCatalogsSearch, addCatalogToProduct, removeCatalogFromProduct, saveCatalogAssignments, resetCatalogsState } from './imageManager/catalogs.js';
import { loadAuthorSuggestions, initializeKeywordTags, initializeIpNamesTags, initializeAuthorTags, initializeSlugSuggestions } from './imageManager/tags.js';

/**
 * Check if current user can delete products (set status to not_for_sale)
 * Admin can always delete, editor depends on permissions
 */
function canDeleteProducts() {
  if (isAdmin()) return true;
  return hasPermission('products', 'canDelete');
}

// ============================================================================
// IMAGE MANAGEMENT FUNCTIONS
// ============================================================================

// Global state for managing images in the product modal
let productImagesState = {
  product_images: [],
  product_images_2: []
};

// Track original image IDs to detect deletions
let originalImageIds = {
  product_images: [],
  product_images_2: []
};

// Track original image ref IDs (for linked images in product_images_2)
let originalRefIds = [];

// Track original image data to detect changes (for save optimization)
let originalImagesState = {
  product_images: [],
  product_images_2: []
};

// Global state for linked products
let linkedProductsState = [];
// Tracks whether the product was originally in a link group (set when modal loads)
let linkedProductsOriginallyHadLinks = false;
let allProductsCache = [];

// Global state for type link (фирменный <-> оригинальный)
let typeLinkState = null; // { product_id, title, image, type, slug } or null
let typeLinkOriginallyHadLink = false;

async function loadProductImages(productId) {
  try {
    const response = await apiGet(`/api/products/images/get?product_id=${productId}`);
    if (!response.ok) throw new Error('Failed to load images');

    const result = await response.json();
    // Handle response wrapper format: { success: true, data: { images: {...} } }
    const images = result.data?.images || result.images || {};

    // Ensure productImagesState always has the correct structure
    productImagesState = {
      product_images: images.product_images || [],
      product_images_2: images.product_images_2 || []
    };

    // Track original image IDs (owned images only) to detect deletions on save
    originalImageIds = {
      product_images: (images.product_images || []).filter(img => img.id).map(img => img.id),
      product_images_2: (images.product_images_2 || []).filter(img => img.id && !img.linked).map(img => img.id)
    };

    // Track original ref IDs (linked images) to detect removals on save
    originalRefIds = (images.product_images_2 || []).filter(img => img.linked && img.ref_id).map(img => img.ref_id);

    // Track original image data for change detection (skips linked images)
    originalImagesState = {
      product_images: (images.product_images || []).filter(img => img.id).map(img => ({ ...img })),
      product_images_2: (images.product_images_2 || []).filter(img => img.id && !img.linked).map(img => ({ ...img }))
    };

    return productImagesState;
  } catch (error) {
    console.error('Error loading images:', error);
    productImagesState = { product_images: [], product_images_2: [] };
    originalImageIds = { product_images: [], product_images_2: [] };
    originalRefIds = [];
    originalImagesState = { product_images: [], product_images_2: [] };
    return productImagesState;
  }
}

function renderImageManagementUI(tableName) {
  const images = productImagesState[tableName] || [];
  const containerId = `${tableName}-container`;

  return `
    <div id="${containerId}" class="images-container">
      ${images.map((img, index) => renderImageRow(img, tableName, index)).join('')}
      <button type="button" class="btn btn-secondary btn-sm" data-action="add-image-row" data-table-name='${tableName}' style="margin-top: var(--spacing-sm);">
        Добавить изображение
      </button>
    </div>
  `;
}

function renderImageRow(image, tableName, index) {
  const hasImage = image && image.url;
  const imageUrl = hasImage ? addImageSize(image.url, '480x0') : '';
  const isLinked = Boolean(image?.linked);

  // Normalize extra value (trim and handle null/undefined)
  const extraValue = (image?.extra || '').trim();

  if (isLinked) {
    // Read-only row for images linked via product_image_refs
    return `
      <div class="image-input-row image-input-row--linked" data-table="${tableName}" data-index="${index}" data-ref-id="${image.ref_id || ''}">
        <div class="image-drag-handle" style="opacity: 0.3; cursor: default;">☰</div>
        ${hasImage ?
          `<div class="image-preview-container">
            <img src="${imageUrl}"
                 class="image-preview"
                 onerror="this.style.display='none'; this.parentElement.classList.add('image-load-error');">
          </div>` :
          `<div class="image-preview-placeholder" style="font-size: 0.75rem;">IMG</div>`
        }
        <div style="flex: 1; display: flex; flex-direction: column; gap: var(--spacing-xs); justify-content: center;">
          <span style="font-size: 0.75rem; color: var(--brand-primary); font-weight: 500;">↗ Ссылка</span>
          <span style="font-size: 0.75rem; color: var(--text-secondary);">Продукт #${image.source_product_id}</span>
          ${extraValue ? `<span style="font-size: 0.7rem; color: var(--text-tertiary);">${extraValue}</span>` : ''}
        </div>
        <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; flex-shrink: 0;">
          <button type="button" class="btn btn-secondary btn-xs" data-action="delete-image-row" data-table-name="${tableName}" data-index="${index}" title="Удалить ссылку">×</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="image-input-row" data-table="${tableName}" data-index="${index}" data-image-id="${image?.id || ''}">
      <div class="image-drag-handle">☰</div>
      ${hasImage ?
        `<div class="image-preview-container" style="position: relative;">
          <img src="${imageUrl}"
               class="image-preview"
               onload="window.updateCachedImageHealth && window.updateCachedImageHealth('${image.url}', true)"
               onerror="this.style.display='none'; this.parentElement.classList.add('image-load-error'); this.parentElement.title='Изображение не загрузилось. Проверьте URL.'">
        </div>` :
        `<div class="image-preview-placeholder" style="font-size: 0.75rem;">IMG</div>`
      }
      <div style="flex: 1; display: flex; flex-direction: column; gap: var(--spacing-xs);">
        <input type="text"
               class="form-input"
               placeholder="URL изображения"
               value="${image?.url || ''}"
               onchange="updateImageUrl('${tableName}', ${index}, this.value)"
               style="font-size: 0.875rem;">
        ${tableName === 'product_images' ? `
        <select class="form-input product-image-extra-select"
                onchange="updateImageExtra('${tableName}', ${index}, this.value)"
                style="font-size: 0.875rem;">
          <option value="">Без категории</option>
          <option value="сборка обложки" ${extraValue === 'сборка обложки' ? 'selected' : ''}>Сборка обложки</option>
          <option value="обложка" ${extraValue === 'обложка' ? 'selected' : ''}>Обложка</option>
          <option value="варианты" ${extraValue === 'варианты' ? 'selected' : ''}>Варианты</option>
          <option value="приближение" ${extraValue === 'приближение' ? 'selected' : ''}>Приближение</option>
          <option value="фон" ${extraValue === 'фон' ? 'selected' : ''} class="custom-status-option" style="display: none;">Фон (для Custom)</option>
        </select>
        ` : ''}
        ${tableName === 'product_images_2' ? `
        <select class="form-input"
                onchange="updateImageExtra('${tableName}', ${index}, this.value)"
                style="font-size: 0.875rem;">
          <option value="">Без категории</option>
          <option value="фото" ${extraValue === 'фото' ? 'selected' : ''}>Фото</option>
          <option value="процесс" ${extraValue === 'процесс' ? 'selected' : ''}>Процесс</option>
          <option value="рендеры" ${extraValue === 'рендеры' ? 'selected' : ''}>Рендеры</option>
        </select>
        ` : ''}
      </div>
      <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; flex-shrink: 0;">
        <button type="button" class="btn btn-secondary btn-xs" data-action="delete-image-row" data-table-name="${tableName}" data-index="${index}" title="Удалить">×</button>
        ${tableName === 'product_images_2' ? `
        <button type="button" class="btn btn-secondary btn-xs" data-action="copy-image-to-product" data-table-name="${tableName}" data-index="${index}" title="Добавить к другому продукту" style="font-size: 0.8rem;">↗</button>
        <label style="display: flex; flex-direction: column; align-items: center; gap: 2px; cursor: pointer; font-size: 0.7rem; color: var(--text-secondary); white-space: nowrap;">
          <input type="checkbox" ${image?.deprecated ? 'checked' : ''} onchange="updateImageDeprecated('${tableName}', ${index}, this.checked)" style="cursor: pointer;">
          Устарел
        </label>
        ` : ''}
        ${tableName === 'product_images' ? `
        <label style="display: flex; flex-direction: column; align-items: center; gap: 2px; cursor: pointer; font-size: 0.7rem; color: var(--text-secondary); white-space: nowrap;">
          <input type="checkbox" ${image?.mix ? 'checked' : ''} onchange="updateImageMix('${tableName}', ${index}, this.checked)" style="cursor: pointer;">
          микс
        </label>
        <label style="display: flex; flex-direction: column; align-items: center; gap: 2px; cursor: pointer; font-size: 0.7rem; color: var(--text-secondary); white-space: nowrap;">
          <input type="checkbox" ${image?.hidden ? 'checked' : ''} onchange="updateImageHidden('${tableName}', ${index}, this.checked)" style="cursor: pointer;">
          Скрыть с сетки
        </label>
        <label style="display: flex; flex-direction: column; align-items: center; gap: 2px; cursor: pointer; font-size: 0.7rem; color: var(--text-secondary); white-space: nowrap;">
          <input type="checkbox" ${image?.hidden_product ? 'checked' : ''} onchange="updateImageHiddenProduct('${tableName}', ${index}, this.checked)" style="cursor: pointer;">
          Скрыть с товара
        </label>
        ` : ''}
      </div>
    </div>
  `;
}

function addImageRow(tableName) {
  productImagesState[tableName].push({
    url: '',
    extra: '',
    sort_order: productImagesState[tableName].length
  });
  refreshImageContainer(tableName);
}

function deleteImageRow(tableName, index) {
  productImagesState[tableName].splice(index, 1);
  refreshImageContainer(tableName);
}

function updateImageUrl(tableName, index, url) {
  if (productImagesState[tableName][index]) {
    productImagesState[tableName][index].url = url;
    refreshImageContainer(tableName);
  }
}

function updateImageExtra(tableName, index, extra) {
  if (productImagesState[tableName][index]) {
    productImagesState[tableName][index].extra = extra;
  }
}

function updateImageDeprecated(tableName, index, value) {
  if (productImagesState[tableName]?.[index]) {
    productImagesState[tableName][index].deprecated = value;
  }
}

function updateImageMix(tableName, index, value) {
  if (productImagesState[tableName]?.[index]) {
    productImagesState[tableName][index].mix = value;
  }
}

function updateImageHidden(tableName, index, value) {
  if (productImagesState[tableName]?.[index]) {
    productImagesState[tableName][index].hidden = value;
  }
}

function updateImageHiddenProduct(tableName, index, value) {
  if (productImagesState[tableName]?.[index]) {
    productImagesState[tableName][index].hidden_product = value;
  }
}

function refreshImageContainer(tableName) {
  const container = document.getElementById(`${tableName}-container`);
  if (!container) return;

  const images = productImagesState[tableName] || [];
  container.innerHTML = `
    ${images.map((img, index) => renderImageRow(img, tableName, index)).join('')}
    <button type="button" class="btn btn-secondary btn-sm" data-action="add-image-row" data-table-name='${tableName}' style="margin-top: var(--spacing-sm);">
      Добавить изображение
    </button>
  `;

  // Re-initialize Sortable for the container
  initializeImageSortable(tableName);

  // Update visibility of custom-status options based on current status
  const statusSelect = document.getElementById('modal-product-status');
  if (statusSelect) {
    const isCustom = statusSelect.value === 'custom';
    container.querySelectorAll('.custom-status-option').forEach(option => {
      option.style.display = isCustom ? '' : 'none';
    });
  }
}

function initializeImageSortable(tableName) {
  const container = document.getElementById(`${tableName}-container`);
  if (!container || !window.Sortable) return;

  new Sortable(container, {
    animation: 150,
    handle: '.image-drag-handle',
    ghostClass: 'sortable-ghost',
    filter: '.btn',
    onEnd: function(evt) {
      const oldIndex = evt.oldIndex;
      const newIndex = evt.newIndex;

      // Reorder the array
      const [movedImage] = productImagesState[tableName].splice(oldIndex, 1);
      productImagesState[tableName].splice(newIndex, 0, movedImage);

      // Update sort_order
      productImagesState[tableName].forEach((img, idx) => {
        img.sort_order = idx;
      });

      refreshImageContainer(tableName);
    }
  });
}

async function saveProductImages(productId) {
  for (const tableName of ['product_images', 'product_images_2']) {
    const allImages = productImagesState[tableName] || [];

    // Separate owned images from linked image refs
    const ownedImages = allImages.filter(img => !img.linked);
    const linkedImages = tableName === 'product_images_2' ? allImages.filter(img => img.linked) : [];

    // --- Handle linked image refs (product_image_refs) ---
    if (tableName === 'product_images_2') {
      const currentRefIds = linkedImages.filter(img => img.ref_id).map(img => img.ref_id);
      const deletedRefIds = originalRefIds.filter(id => !currentRefIds.includes(id));
      await Promise.all(deletedRefIds.map(async (refId) => {
        try {
          const resp = await apiPost('/api/products/image-refs/delete', { ref_id: refId });
          if (resp.ok || resp.status === 404) {
            originalRefIds = originalRefIds.filter(id => id !== refId);
          }
        } catch (err) {
          console.error(`Error deleting image ref ${refId}:`, err);
        }
      }));
    }

    // --- Handle owned images ---
    const currentImageIds = ownedImages.filter(img => img.id).map(img => img.id);
    const deletedImageIds = (originalImageIds[tableName] || []).filter(id => !currentImageIds.includes(id));

    // Delete removed owned images
    await Promise.all(deletedImageIds.map(async (imageId) => {
      try {
        const deleteResp = await apiPost('/api/products/images/delete', { id: imageId, table_name: tableName });
        if (deleteResp.ok || deleteResp.status === 404) {
          originalImageIds[tableName] = originalImageIds[tableName].filter(id => id !== imageId);
        }
      } catch (error) {
        console.error(`Error deleting image ${imageId}:`, error);
      }
    }));

    // Update existing images (only those that changed)
    const updatePromises = [];
    for (let i = 0; i < ownedImages.length; i++) {
      const img = ownedImages[i];
      if (!img.url || !img.id) continue;

      const original = originalImagesState[tableName]?.find(o => o.id === img.id);
      const dataChanged = !original ||
        img.url !== original.url ||
        (img.extra || null) !== (original.extra || null) ||
        (tableName === 'product_images'
          ? (Boolean(img.mix) !== Boolean(original.mix) || Boolean(img.hidden) !== Boolean(original.hidden) || Boolean(img.hidden_product) !== Boolean(original.hidden_product))
          : Boolean(img.deprecated) !== Boolean(original.deprecated));

      if (dataChanged) {
        const updatePayload = { id: img.id, url: img.url, extra: img.extra || null, table_name: tableName };
        if (tableName === 'product_images_2') updatePayload.deprecated = img.deprecated || false;
        if (tableName === 'product_images') { updatePayload.mix = img.mix || false; updatePayload.hidden = img.hidden || false; updatePayload.hidden_product = img.hidden_product || false; }
        updatePromises.push(apiPost('/api/products/images/update', updatePayload));
      }
    }
    await Promise.all(updatePromises);

    // Add new images (sequential to get IDs back)
    for (let i = 0; i < ownedImages.length; i++) {
      const img = ownedImages[i];
      if (!img.url || img.id) continue;

      const addPayload = { product_id: productId, url: img.url, extra: img.extra || null, table_name: tableName };
      if (tableName === 'product_images_2') addPayload.deprecated = img.deprecated || false;
      if (tableName === 'product_images') { addPayload.mix = img.mix || false; addPayload.hidden = img.hidden || false; addPayload.hidden_product = img.hidden_product || false; }

      const response = await apiPost('/api/products/images/add', addPayload);
      if (response.ok) {
        const data = await response.json();
        img.id = data.image?.id;
      }
    }

    // Reorder if order changed (single batch call per table)
    const orderedIds = ownedImages.filter(img => img.url && img.id).map(img => img.id);
    const originalOrderedIds = (originalImagesState[tableName] || []).map(o => o.id);
    const orderChanged = orderedIds.length !== originalOrderedIds.length ||
      orderedIds.some((id, i) => id !== originalOrderedIds[i]);

    if (orderChanged && orderedIds.length > 0) {
      await apiPost('/api/products/images/batch-reorder', { table_name: tableName, image_ids: orderedIds });
    }
  }
}

// ============================================================================
// LINKED PRODUCTS FUNCTIONS
// ============================================================================

async function loadLinkedProducts(productId) {
  try {
    const response = await apiGet(`/api/products/links?product_id=${productId}`);
    if (!response.ok) throw new Error('Failed to load linked products');

    const result = await response.json();
    linkedProductsState = result.linked_products || [];
    linkedProductsOriginallyHadLinks = linkedProductsState.length > 0;
    return linkedProductsState;
  } catch (error) {
    console.error('Error loading linked products:', error);
    linkedProductsState = [];
    linkedProductsOriginallyHadLinks = false;
    return linkedProductsState;
  }
}

async function loadAllProductsForSearch(forceRefresh = false) {
  // Return cached data if available and not forcing refresh
  if (!forceRefresh && allProductsCache.length > 0) {
    return allProductsCache;
  }

  try {
    const response = await apiGet(`/products?all=true`);
    if (!response.ok) throw new Error('Failed to load products');
    allProductsCache = await response.json();
    return allProductsCache;
  } catch (error) {
    console.error('Error loading products for search:', error);
    allProductsCache = [];
    return allProductsCache;
  }
}

/**
 * Invalidate product cache - call after product create/update/delete
 */
function invalidateProductCache() {
  allProductsCache = [];
}

async function saveLinkedProducts(productId) {
  try {
    // Send all products in their current order (including the current product).
    // If only the current product remains (no others), send empty to trigger unlink.
    const allOrderedIds = linkedProductsState.map(p => p.product_id);
    const linkedIds = allOrderedIds.some(id => id !== productId) ? allOrderedIds : [];

    // Skip the API call if there are no links and there never were any — nothing to do.
    if (linkedIds.length === 0 && !linkedProductsOriginallyHadLinks) {
      return null;
    }

    // Collect variant names from the UI inputs
    const variantNames = {};
    const variantInputs = document.querySelectorAll('.linked-product-variant-name');
    variantInputs.forEach(input => {
      const pid = parseInt(input.dataset.productId);
      const name = input.value.trim();
      if (name) {
        variantNames[pid] = name;
      }
    });

    // Collect excluded product IDs
    const variantExcludedIds = [];
    const excludeCheckboxes = document.querySelectorAll('.linked-product-exclude-checkbox');
    excludeCheckboxes.forEach(cb => {
      if (cb.checked) variantExcludedIds.push(parseInt(cb.dataset.productId));
    });

    const response = await apiPost('/api/products/links', {
        product_id: productId,
        linked_product_ids: linkedIds,
        variant_names: variantNames,
        variant_excluded_ids: variantExcludedIds
      });

    if (!response.ok) {
      throw new Error('Failed to save linked products');
    }

    return await response.json();
  } catch (error) {
    console.error('Error saving linked products:', error);
    throw error;
  }
}

function renderLinkedProductsUI(currentProductId) {
  const hasLinkedProducts = linkedProductsState.length > 0;

  return `
    <div id="linked-products-container" class="linked-products-container">
      <div class="linked-products-search" style="margin-bottom: var(--spacing-sm);">
        <input type="text"
               id="linked-products-search-input"
               class="form-input"
               placeholder="Поиск товаров для связывания..."
               style="font-size: 0.875rem;">
        <div id="linked-products-search-results" class="linked-products-search-results" style="display: none;"></div>
      </div>
      <div id="linked-products-list" class="linked-products-list">
        ${hasLinkedProducts ? linkedProductsState.map((item, index) =>
          renderLinkedProductItem(item, index, currentProductId)
        ).join('') : '<div class="linked-products-empty" style="color: var(--text-secondary); font-size: 0.875rem; padding: var(--spacing-sm);">Нет связанных товаров</div>'}
      </div>
      <p style="color: var(--text-secondary); font-size: 0.75rem; margin-top: var(--spacing-sm);">
        Связанные товары отображаются как "варианты" на странице товара. Перетаскивайте для изменения порядка.
        Задайте название варианта (например: "муж. род", "англ. яз", "1-й сезон") или оставьте пустым для "вар. N".
      </p>
    </div>
  `;
}

function renderLinkedProductItem(item, index, currentProductId) {
  const isCurrentProduct = item.product_id === currentProductId;
  const imageUrl = item.image ? addImageSize(item.image, '120x0') : '';
  const variantName = item.variant_name || '';
  const defaultVarLabel = `вар. ${index + 1}`;
  const isExcluded = item.variant_excluded || false;

  return `
    <div class="linked-product-item ${isCurrentProduct ? 'is-current' : ''}"
         data-product-id="${item.product_id}"
         data-index="${index}">
      <div class="linked-product-drag-handle">☰</div>
      ${imageUrl ?
        `<img src="${imageUrl}" class="linked-product-image" onerror="this.style.display='none'">` :
        `<div class="linked-product-image-placeholder">IMG</div>`
      }
      <div class="linked-product-info">
        <span class="linked-product-title">${item.title || 'Без названия'}</span>
        <span class="linked-product-id">ID: ${item.product_id}</span>
        <input type="text"
               class="form-input linked-product-variant-name"
               placeholder="${defaultVarLabel}"
               value="${variantName}"
               data-product-id="${item.product_id}"
               style="font-size: 0.75rem; padding: 4px 8px; margin-top: 4px; width: 100%;">
        <label style="display: flex; align-items: center; gap: 4px; margin-top: 4px; font-size: 0.75rem; color: var(--text-secondary); cursor: pointer; user-select: none;">
          <input type="checkbox"
                 class="linked-product-exclude-checkbox"
                 data-product-id="${item.product_id}"
                 ${isExcluded ? 'checked' : ''}>
          Исключить из вар. выбора
        </label>
      </div>
      <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0;">
        ${isCurrentProduct ? `<span class="linked-product-current-badge">текущий</span>` : ''}
        <button type="button" class="btn btn-secondary btn-xs" data-action="remove-linked-product" data-product-id="${item.product_id}" title="${isCurrentProduct ? 'Покинуть группу' : 'Удалить'}">${isCurrentProduct ? '↩' : '×'}</button>
      </div>
    </div>
  `;
}

function refreshLinkedProductsUI(currentProductId) {
  const container = document.getElementById('linked-products-list');
  if (!container) return;

  if (linkedProductsState.length === 0) {
    container.innerHTML = '<div class="linked-products-empty" style="color: var(--text-secondary); font-size: 0.875rem; padding: var(--spacing-sm);">Нет связанных товаров</div>';
  } else {
    container.innerHTML = linkedProductsState.map((item, index) =>
      renderLinkedProductItem(item, index, currentProductId)
    ).join('');
  }

  initializeLinkedProductsSortable(currentProductId);
}

function addLinkedProduct(productToAdd, currentProductId) {
  // Check if product is already linked
  if (linkedProductsState.some(p => p.product_id === productToAdd.id)) {
    showToast('Товар уже связан', 'warning');
    return;
  }

  // If this is the first linked product and current product is not in the list,
  // add the current product first
  if (linkedProductsState.length === 0) {
    // Find current product in cache
    const currentProduct = allProductsCache.find(p => p.id === currentProductId);
    if (currentProduct) {
      // Support both image formats: single 'image' string or 'images' array
      const currentImage = currentProduct.image || currentProduct.images?.[0]?.url || currentProduct.images?.[0] || null;
      linkedProductsState.push({
        product_id: currentProduct.id,
        title: currentProduct.title,
        image: currentImage,
        sort_order: 0
      });
    }
  }

  // Add the new product
  // Support both image formats: single 'image' string or 'images' array
  const newImage = productToAdd.image || productToAdd.images?.[0]?.url || productToAdd.images?.[0] || null;
  linkedProductsState.push({
    product_id: productToAdd.id,
    title: productToAdd.title,
    image: newImage,
    sort_order: linkedProductsState.length
  });

  refreshLinkedProductsUI(currentProductId);

  // Clear search
  const searchInput = document.getElementById('linked-products-search-input');
  const searchResults = document.getElementById('linked-products-search-results');
  if (searchInput) searchInput.value = '';
  if (searchResults) searchResults.style.display = 'none';
}

function removeLinkedProduct(productIdToRemove, currentProductId) {
  // If the current product removes itself, it leaves the group entirely
  if (productIdToRemove === currentProductId) {
    linkedProductsState = [];
  } else {
    linkedProductsState = linkedProductsState.filter(p => p.product_id !== productIdToRemove);
    // If only current product remains, clear the list
    if (linkedProductsState.length === 1 && linkedProductsState[0].product_id === currentProductId) {
      linkedProductsState = [];
    }
  }

  refreshLinkedProductsUI(currentProductId);
}

function initializeLinkedProductsSortable(currentProductId) {
  const container = document.getElementById('linked-products-list');
  if (!container || !window.Sortable) return;

  // Destroy existing sortable if any
  if (container._sortable) {
    container._sortable.destroy();
  }

  container._sortable = new Sortable(container, {
    animation: 150,
    handle: '.linked-product-drag-handle',
    ghostClass: 'sortable-ghost',
    onEnd: function(evt) {
      const oldIndex = evt.oldIndex;
      const newIndex = evt.newIndex;

      // Reorder the array
      const [movedItem] = linkedProductsState.splice(oldIndex, 1);
      linkedProductsState.splice(newIndex, 0, movedItem);

      // Update sort_order
      linkedProductsState.forEach((item, idx) => {
        item.sort_order = idx;
      });

      refreshLinkedProductsUI(currentProductId);
    }
  });
}

function setupLinkedProductsSearch(currentProductId) {
  const searchInput = document.getElementById('linked-products-search-input');
  const searchResults = document.getElementById('linked-products-search-results');
  if (!searchInput || !searchResults) return;

  let searchTimeout = null;

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim();

    clearTimeout(searchTimeout);

    if (query.length < 2) {
      searchResults.style.display = 'none';
      return;
    }

    searchTimeout = setTimeout(async () => {
      // Search products excluding already linked ones (with variant support)
      const linkedIds = linkedProductsState.map(p => p.product_id);
      const availableProducts = allProductsCache.filter(p =>
        !linkedIds.includes(p.id) && p.id !== currentProductId
      );
      const results = await searchProductsWithVariants(availableProducts, query, 5);

      if (results.length === 0) {
        searchResults.innerHTML = '<div class="linked-products-search-empty" style="padding: var(--spacing-sm); color: var(--text-secondary); font-size: 0.875rem;">Ничего не найдено</div>';
      } else {
        searchResults.innerHTML = results.map(product => {
          // Support both image formats: single 'image' string or 'images' array
          const imageUrl = product.image || product.images?.[0]?.url || product.images?.[0];
          return `
          <div class="linked-products-search-item" data-action="add-linked-product" data-product-id="${product.id}">
            ${imageUrl ?
              `<img src="${addImageSize(imageUrl, '60x0')}" class="linked-products-search-item-image">` :
              `<div class="linked-products-search-item-image-placeholder">IMG</div>`
            }
            <div class="linked-products-search-item-info">
              <span class="linked-products-search-item-title">${product.title}</span>
              <span class="linked-products-search-item-id">ID: ${product.id}</span>
            </div>
          </div>
        `;}).join('');
      }

      searchResults.style.display = 'block';
    }, 200);
  });

  // Hide results when clicking outside
  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
      searchResults.style.display = 'none';
    }
  });
}

// ============================================================================
// TYPE LINK FUNCTIONS (фирменный <-> оригинальный)
// ============================================================================

async function loadTypeLink(productId) {
  try {
    const response = await apiGet(`/api/products/type-links?product_id=${productId}`);
    if (!response.ok) throw new Error('Failed to load type link');
    const result = await response.json();
    typeLinkState = result.linked_product || null;
    typeLinkOriginallyHadLink = typeLinkState !== null;
    return typeLinkState;
  } catch (error) {
    console.error('Error loading type link:', error);
    typeLinkState = null;
    typeLinkOriginallyHadLink = false;
    return null;
  }
}

async function saveTypeLink(productId) {
  try {
    const linkedId = typeLinkState ? typeLinkState.product_id : null;

    if (!linkedId && !typeLinkOriginallyHadLink) return null;

    const response = await apiPost('/api/products/type-links', {
      product_id: productId,
      linked_product_id: linkedId || null
    });

    if (!response.ok) throw new Error('Failed to save type link');
    return await response.json();
  } catch (error) {
    console.error('Error saving type link:', error);
    throw error;
  }
}

function getOppositeType(currentType) {
  if (currentType === 'фирменный') return 'оригинал';
  if (currentType === 'оригинал') return 'фирменный';
  return null;
}

function renderTypeLinkUI(currentProductId, typeOverride) {
  const currentType = typeOverride !== undefined ? typeOverride : (document.getElementById('modal-product-type')?.value || '');
  const oppositeType = getOppositeType(currentType);

  if (!oppositeType) {
    return `
      <div id="type-link-container" class="linked-products-container">
        <p style="color: var(--text-secondary); font-size: 0.875rem; padding: var(--spacing-sm);">
          Выберите тип товара, чтобы управлять тип-связью.
        </p>
      </div>
    `;
  }

  const oppositeTypeLabel = oppositeType === 'оригинал' ? 'оригинальные' : 'фирменные';

  return `
    <div id="type-link-container" class="linked-products-container">
      <div class="linked-products-search" style="margin-bottom: var(--spacing-sm);">
        <input type="text"
               id="type-link-search-input"
               class="form-input"
               placeholder="Поиск (${oppositeTypeLabel} товары)..."
               style="font-size: 0.875rem;">
        <div id="type-link-search-results" class="linked-products-search-results" style="display: none;"></div>
      </div>
      <div id="type-link-item-list">
        ${typeLinkState ? renderTypeLinkItem(typeLinkState) : '<div class="linked-products-empty" style="color: var(--text-secondary); font-size: 0.875rem; padding: var(--spacing-sm);">Не связан</div>'}
      </div>
      <p style="color: var(--text-secondary); font-size: 0.75rem; margin-top: var(--spacing-sm);">
        Связывает фирменный и оригинальный товар одного бренда (1:1). Отображается на странице товара.
      </p>
    </div>
  `;
}

function renderTypeLinkItem(linked) {
  const imageUrl = linked.image ? addImageSize(linked.image, '120x0') : '';
  return `
    <div class="linked-product-item" data-product-id="${linked.product_id}">
      ${imageUrl
        ? `<img src="${imageUrl}" class="linked-product-image" onerror="this.style.display='none'">`
        : `<div class="linked-product-image-placeholder">IMG</div>`
      }
      <div class="linked-product-info">
        <span class="linked-product-title">${linked.title || 'Без названия'}</span>
        <span class="linked-product-id">ID: ${linked.product_id} · ${linked.type || ''}</span>
      </div>
      <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0;">
        <button type="button" class="btn btn-secondary btn-xs" data-action="remove-type-link" title="Убрать связь">×</button>
      </div>
    </div>
  `;
}

function refreshTypeLinkUI() {
  const itemList = document.getElementById('type-link-item-list');
  if (!itemList) return;

  if (!typeLinkState) {
    itemList.innerHTML = '<div class="linked-products-empty" style="color: var(--text-secondary); font-size: 0.875rem; padding: var(--spacing-sm);">Не связан</div>';
  } else {
    itemList.innerHTML = renderTypeLinkItem(typeLinkState);
  }
}

function setupTypeLinkSearch(currentProductId) {
  const searchInput = document.getElementById('type-link-search-input');
  const searchResults = document.getElementById('type-link-search-results');
  if (!searchInput || !searchResults) return;

  let searchTimeout = null;

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim();

    clearTimeout(searchTimeout);

    if (query.length < 2) {
      searchResults.style.display = 'none';
      return;
    }

    searchTimeout = setTimeout(async () => {
      const currentType = document.getElementById('modal-product-type')?.value || '';
      const oppositeType = getOppositeType(currentType);

      if (!oppositeType) {
        searchResults.style.display = 'none';
        return;
      }

      // Filter by opposite type, exclude current product
      const filtered = allProductsCache.filter(p =>
        p.id !== currentProductId &&
        p.type === oppositeType &&
        (!typeLinkState || p.id !== typeLinkState.product_id)
      );

      const results = await searchProductsWithVariants(filtered, query, 5);

      if (results.length === 0) {
        searchResults.innerHTML = '<div class="linked-products-search-empty" style="padding: var(--spacing-sm); color: var(--text-secondary); font-size: 0.875rem;">Ничего не найдено</div>';
      } else {
        searchResults.innerHTML = results.map(product => {
          const imageUrl = product.image || product.images?.[0]?.url || product.images?.[0];
          return `
            <div class="linked-products-search-item" data-action="add-type-link" data-product-id="${product.id}">
              ${imageUrl
                ? `<img src="${addImageSize(imageUrl, '60x0')}" class="linked-products-search-item-image">`
                : `<div class="linked-products-search-item-image-placeholder">IMG</div>`
              }
              <div class="linked-products-search-item-info">
                <span class="linked-products-search-item-title">${product.title}</span>
                <span class="linked-products-search-item-id">ID: ${product.id} · ${product.type || ''}</span>
              </div>
            </div>
          `;
        }).join('');
      }

      searchResults.style.display = 'block';
    }, 200);
  });

  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
      searchResults.style.display = 'none';
    }
  });
}

function addTypeLink(productToLink) {
  typeLinkState = {
    product_id: productToLink.id,
    title: productToLink.title,
    image: productToLink.image || productToLink.images?.[0]?.url || productToLink.images?.[0] || null,
    type: productToLink.type,
    slug: productToLink.slug
  };

  refreshTypeLinkUI();

  const searchInput = document.getElementById('type-link-search-input');
  const searchResults = document.getElementById('type-link-search-results');
  if (searchInput) searchInput.value = '';
  if (searchResults) searchResults.style.display = 'none';
}

function removeTypeLink() {
  typeLinkState = null;
  refreshTypeLinkUI();
}

/**
 * Reset modal state for a new product, optionally pre-populating from template data.
 * Strips image IDs so template images are treated as new (not DB images).
 */
async function prepareNewProductModal(templateData = null) {
  // Reset image state
  productImagesState = {
    product_images: [],
    product_images_2: []
  };
  originalImageIds = {
    product_images: [],
    product_images_2: []
  };
  linkedProductsState = [];
  linkedProductsOriginallyHadLinks = false;
  resetCatalogsState();

  // Pre-populate images from template (strip IDs so they're saved as new images)
  if (templateData?.product_images) {
    productImagesState.product_images = templateData.product_images.map(img => ({
      url: img.url || '',
      extra: img.extra || '',
      sort_order: img.sort_order || 0
    }));
  }
  if (templateData?.product_images_2) {
    productImagesState.product_images_2 = templateData.product_images_2.map(img => ({
      url: img.url || '',
      extra: img.extra || '',
      sort_order: img.sort_order || 0
    }));
  }

  await loadCatalogsForProduct();
}

async function showAddProductModal(isTemplate = false) {
  await prepareNewProductModal();
  showProductModal(null, isTemplate);
}

async function editProduct(productId, productData = null) {
  try {
    // Use provided product data, or fall back to fetching
    const product = productData || (await loadAllProductsForSearch()).find(p => p.id === productId);

    if (!product) {
      showToast('Товар не найден', 'error');
      return;
    }

    // Load images, linked products, catalogs and type link before showing modal
    await Promise.all([
      loadProductImages(productId),
      loadLinkedProducts(productId),
      loadCatalogsForProduct(),
      loadTypeLink(productId)
    ]);
    showProductModal(product);
  } catch (error) {
    console.error('Error loading product:', error);
    showToast('Ошибка загрузки товара', 'error');
  }
}

function showProductModal(product = null, isTemplate = false) {
  // Only treat as edit if the product has a real DB id
  const isEdit = !!(product?.id) && !isTemplate;
  const title = isTemplate ? 'Создать шаблон' : (isEdit ? 'Редактировать товар' : 'Добавить товар');

  showModal(title, `
    <div class="modal-two-column">
      <!-- Left Column: Basic Info -->
      <div class="modal-column-left">
        ${isEdit ? `
        <div class="form-group">
          <label class="form-label">ID товара</label>
          <div style="display: flex; gap: var(--spacing-sm); align-items: center;">
            <input type="text" id="modal-product-id" class="form-input" value="${product.id}" readonly style="background: var(--bg-tertiary); flex: 1;">
            <button type="button" id="edit-product-id-btn" style="padding: var(--spacing-sm) var(--spacing-md); background: var(--bg-tertiary); border: none; border-radius: var(--radius-sm); cursor: pointer; color: var(--text-secondary); font-size: 0.875rem;">Изменить</button>
          </div>
        </div>
        ` : ''}

        <div class="form-group">
          <label class="form-label">Название *</label>
          <input type="text" id="modal-product-title" class="form-input" value="${product?.title || ''}" placeholder="Постер минимализм">
        </div>

        <div class="form-group">
          <label class="form-label">Alt текст</label>
          <input type="text" id="modal-product-alt" class="form-input" value="${product?.alt || ''}" placeholder="Описание для SEO">
        </div>

        <div class="form-group">
          <label class="form-label">Ключевые слова</label>
          <div style="position:relative">
            <input type="text" class="form-input keyword-tags-input" id="keyword-tags-input" placeholder="Введите и нажмите Enter..." data-initial="${(product?.keywords || '').replace(/"/g, '&quot;')}">
            <div class="tag-suggestions-dropdown" id="keyword-suggestions-dropdown"></div>
          </div>
          <div class="keyword-tags-display" id="keyword-tags-display"></div>
          <input type="hidden" id="modal-product-keywords" value="${product?.keywords || ''}">
        </div>

        <div class="form-group">
          <label class="form-label">IP-названия <span style="color: var(--text-tertiary); font-size: 0.75rem;">— для проверки прав (ФИПС)</span></label>
          <div style="position:relative">
            <input type="text" class="form-input ip-names-tags-input" id="ip-names-tags-input" placeholder="Введите и нажмите Enter..." data-initial="${(product?.ip_names || '').replace(/"/g, '&quot;')}">
            <div class="tag-suggestions-dropdown" id="ip-names-suggestions-dropdown"></div>
          </div>
          <div class="keyword-tags-display" id="ip-names-tags-display"></div>
          <input type="hidden" id="modal-product-ip-names" value="${product?.ip_names || ''}">
        </div>

        <div class="form-group">
          <label class="form-label">URL (slug) <span style="color: #666; font-size: 12px;">— оставьте пустым для автогенерации</span></label>
          <div style="position:relative">
            <input type="text" id="modal-product-slug" class="form-input" value="${product?.slug || ''}" placeholder="product-name-slug">
            <div class="tag-suggestions-dropdown" id="slug-suggestions-dropdown"></div>
          </div>
          <small style="color: #666; font-size: 11px;">Используется в URL: /product/slug-here</small>
        </div>

        <div class="form-group">
          <label class="form-label">Описание</label>
          <textarea id="modal-product-description" class="form-input" style="min-height: 80px;">${product?.description || ''}</textarea>
        </div>

        <div class="form-group">
          <label class="form-label">Авторы</label>
          <div style="position:relative">
            <input type="text" class="form-input author-tags-input" id="author-tags-input" placeholder="Введите и нажмите Enter..." data-initial="${(product?.author || '').replace(/"/g, '&quot;')}">
            <div class="tag-suggestions-dropdown" id="author-suggestions-dropdown"></div>
          </div>
          <div class="author-tags-display" id="author-tags-display"></div>
          <input type="hidden" id="modal-product-author" value="${product?.author || ''}">
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-md);">
          <div class="form-group">
            <label class="form-label">Дата создания</label>
            <input type="date" id="modal-product-created" class="form-input" value="${product?.created_at ? product.created_at.split('T')[0] : ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Дата релиза</label>
            <input type="date" id="modal-product-release" class="form-input" value="${product?.release_date ? product.release_date.split('T')[0] : ''}">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">
            <input type="checkbox" id="modal-product-triptych" ${product?.triptych ? 'checked' : ''}>
            Триптих (3 модуля)
          </label>
        </div>

        <div class="form-group">
          <label class="form-label">
            <input type="checkbox" id="modal-product-discount" ${product?.discount ? 'checked' : ''}>
            Скидка активна
          </label>
        </div>

        <div class="form-group" id="modal-restored-group" style="display: ${product?.type === 'оригинал' ? '' : 'none'};">
          <label class="form-label">
            <input type="checkbox" id="modal-product-restored" ${product?.restored ? 'checked' : ''}>
            Отреставрировано
          </label>
        </div>
      </div>

      <!-- Right Column: Status, Pricing, Images -->
      <div class="modal-column-right">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-md);">
          <div class="form-group">
            <label class="form-label">Статус *</label>
            <select id="modal-product-status" class="form-input">
              <option value="available" ${product?.status === 'available' ? 'selected' : ''}>Доступен</option>
              <option value="coming_soon" ${product?.status === 'coming_soon' ? 'selected' : ''}>Скоро</option>
              ${canDeleteProducts() ? `<option value="not_for_sale" ${product?.status === 'not_for_sale' ? 'selected' : ''}>Не в продаже</option>` : ''}
              <option value="available_via_var" ${product?.status === 'available_via_var' ? 'selected' : ''}>Доступен как вариант</option>
              <option value="custom" ${product?.status === 'custom' ? 'selected' : ''}>Custom (с фонами)</option>
              <option value="test" ${product?.status === 'test' ? 'selected' : ''}>Тест</option>
            </select>
            ${!canDeleteProducts() ? `<small style="color: var(--text-tertiary); font-size: 0.75rem;">Опция "Не в продаже" недоступна для редактора</small>` : ''}
          </div>
          <div class="form-group">
            <label class="form-label">Жанр *</label>
            <select id="modal-product-genre" class="form-input">
              <option value="">Выберите жанр</option>
              <option value="игра" ${product?.genre === 'игра' ? 'selected' : ''}>Игра</option>
              <option value="фильм" ${product?.genre === 'фильм' ? 'selected' : ''}>Фильм</option>
              <option value="сериал" ${product?.genre === 'сериал' ? 'selected' : ''}>Сериал</option>
              <option value="аниме" ${product?.genre === 'аниме' ? 'selected' : ''}>Аниме</option>
            </select>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-md);">
          <div class="form-group">
            <label class="form-label">Тип *</label>
            <select id="modal-product-type" class="form-input">
              <option value="">Выберите тип</option>
              <option value="оригинал" ${product?.type === 'оригинал' ? 'selected' : ''}>Оригинал</option>
              <option value="фирменный" ${product?.type === 'фирменный' ? 'selected' : ''}>Фирменный</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Цена (₽)</label>
            <input type="number" id="modal-product-price" class="form-input" value="${product?.price || ''}" min="0" step="0.01">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Старая цена (₽) <span style="color: #666; font-size: 12px;">— для отображения скидки</span></label>
          <input type="number" id="modal-product-old-price" class="form-input" value="${product?.old_price || ''}" min="0" step="0.01" placeholder="Оставьте пустым, если нет скидки">
        </div>

        <div class="form-group">
          <label class="form-label">Время разработки (ч)</label>
          <input type="number" id="modal-product-development-time" class="form-input" value="${product?.development_time || ''}" min="0" placeholder="Количество часов">
          <label style="display: flex; align-items: center; gap: 6px; margin-top: 6px; font-size: 0.875rem; color: var(--text-secondary); cursor: pointer; user-select: none;">
            <input type="checkbox" id="modal-product-hide-development-time" ${product?.hide_development_time ? 'checked' : ''}>
            Скрыть время
          </label>
        </div>

        <div class="form-group">
          <label class="form-label">Ссылка на VK Market</label>
          <input type="url" id="modal-product-vk-market-url" class="form-input" value="${product?.vk_market_url || ''}" placeholder="https://vk.com/market-...">
        </div>

        <div class="form-group">
          <label class="form-label">Основные изображения</label>
          ${renderImageManagementUI('product_images')}
        </div>

        <div class="form-group">
          <label class="form-label">Дополнительные изображения</label>
          ${renderImageManagementUI('product_images_2')}
        </div>

        <div class="form-group">
          <label class="form-label">Каталоги</label>
          ${renderCatalogsUI(isEdit ? (product.catalog_ids || []) : [])}
        </div>

        <div class="form-group">
          <label class="form-label">Связанные товары (варианты)</label>
          ${renderLinkedProductsUI(isEdit ? product.id : null)}
        </div>

        <div class="form-group">
          <label class="form-label">Тип-связь (фирменный ↔ оригинальный)</label>
          <div id="type-link-wrapper">${renderTypeLinkUI(isEdit ? product.id : null, product?.type || '')}</div>
        </div>
      </div>
    </div>
  `, [
    {
      text: 'Отменить',
      className: 'btn btn-secondary',
      onClick: hideModal
    },
    ...(isEdit && !isTemplate ? [{
      text: 'Сохранить как шаблон',
      className: 'btn btn-secondary',
      onClick: async () => {
        const { saveProductAsTemplate } = await import('../views/products.js');

        // Collect current form data
        const formData = {
          title: document.getElementById('modal-product-title')?.value?.trim(),
          alt: document.getElementById('modal-product-alt')?.value?.trim(),
          keywords: document.getElementById('modal-product-keywords')?.value?.trim(),
          ip_names: document.getElementById('modal-product-ip-names')?.value?.trim() || null,
          status: document.getElementById('modal-product-status')?.value,
          genre: document.getElementById('modal-product-genre')?.value?.trim(),
          type: document.getElementById('modal-product-type')?.value?.trim(),
          price: parseFloat(document.getElementById('modal-product-price')?.value) || null,
          old_price: parseFloat(document.getElementById('modal-product-old-price')?.value) || null,
          description: document.getElementById('modal-product-description')?.value?.trim(),
          triptych: document.getElementById('modal-product-triptych')?.checked,
          discount: document.getElementById('modal-product-discount')?.checked || false,
          release_date: document.getElementById('modal-product-release')?.value || null,
          created_at: document.getElementById('modal-product-created')?.value || null,
          development_time: parseInt(document.getElementById('modal-product-development-time')?.value) || null,
          hide_development_time: document.getElementById('modal-product-hide-development-time')?.checked || false,
          quality: document.getElementById('modal-product-quality')?.value || null,
          author: document.getElementById('modal-product-author')?.value?.trim() || null,
          vk_market_url: document.getElementById('modal-product-vk-market-url')?.value?.trim() || null,
        };

        await saveProductAsTemplate(formData);
      }
    }] : []),
    {
      text: isTemplate ? 'Сохранить шаблон' : 'Сохранить',
      className: 'btn btn-primary',
      onClick: async () => {
        const formData = {
          title: document.getElementById('modal-product-title')?.value?.trim(),
          alt: document.getElementById('modal-product-alt')?.value?.trim(),
          keywords: document.getElementById('modal-product-keywords')?.value?.trim(),
          ip_names: document.getElementById('modal-product-ip-names')?.value?.trim() || null,
          slug: document.getElementById('modal-product-slug')?.value?.trim() || undefined,
          status: document.getElementById('modal-product-status')?.value,
          genre: document.getElementById('modal-product-genre')?.value?.trim(),
          type: document.getElementById('modal-product-type')?.value?.trim(),
          price: parseFloat(document.getElementById('modal-product-price')?.value) || null,
          old_price: parseFloat(document.getElementById('modal-product-old-price')?.value) || null,
          description: document.getElementById('modal-product-description')?.value?.trim(),
          author: document.getElementById('modal-product-author')?.value?.trim() || null,
          triptych: document.getElementById('modal-product-triptych')?.checked,
          discount: document.getElementById('modal-product-discount')?.checked || false,
          restored: document.getElementById('modal-product-restored')?.checked || false,
          release_date: document.getElementById('modal-product-release')?.value || null,
          created_at: document.getElementById('modal-product-created')?.value || null,
          development_time: parseInt(document.getElementById('modal-product-development-time')?.value) || null,
          hide_development_time: document.getElementById('modal-product-hide-development-time')?.checked || false,
          vk_market_url: document.getElementById('modal-product-vk-market-url')?.value?.trim() || null
        };

        // For templates, skip required field validation
        if (!isTemplate) {
          if (!formData.title || !formData.status || !formData.genre || !formData.type) {
            showToast('Заполните обязательные поля: Название, Статус, Жанр, Тип', 'error');
            return;
          }
        }

        // If creating a template, save as template instead of product
        if (isTemplate) {
          const { saveProductAsTemplate } = await import('../views/products.js');

          // Add images to formData
          formData.product_images = productImagesState.product_images;
          formData.product_images_2 = productImagesState.product_images_2;

          const template = await saveProductAsTemplate(formData);
          if (template) {
            // Reset unsaved-changes flag so hideModal() won't ask to discard
            hasChanges = false;
            hideModal();
          }
          return;
        }

        try {
          // Auto [/] suffix: фирменный titles always end with " [/]"
          if (formData.type === 'фирменный' && formData.title && !formData.title.endsWith(' [/]')) {
            formData.title = formData.title + ' [/]';
          } else if (formData.type !== 'фирменный' && formData.title && formData.title.endsWith(' [/]')) {
            formData.title = formData.title.replace(/ \[\/\]$/, '');
          }

          // Save product first
          const url = isEdit ? '/api/products/update' : '/api/products/create';
          const productId = isEdit ? (document.getElementById('modal-product-id')?.value || product.id) : undefined;
          const bodyData = isEdit ? { ...formData, id: productId } : formData;
          const response = await apiPost(url, bodyData);

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to save product');
          }

          const savedProduct = await response.json();
          const finalProductId = isEdit ? product.id : savedProduct.product?.id;

          // Save images
          if (finalProductId) {
            await saveProductImages(finalProductId);
          }

          // Save linked products
          if (finalProductId) {
            await saveLinkedProducts(finalProductId);
          }

          // Save catalog assignments
          if (finalProductId) {
            await saveCatalogAssignments(finalProductId, allProductsCache);
          }

          // Save type link
          if (finalProductId) {
            await saveTypeLink(finalProductId);
          }

          // Invalidate product cache and reload
          invalidateProductCache();
          hasChanges = false;

          // For new products, show success
          if (!isEdit && finalProductId) {
            hideModal();
            showToast('Товар создан', 'success');
            await loadProductsList();

            // Handle insertion at specific position if requested
            await handlePostCreateInsertion(finalProductId);
          } else {
            showToast('Товар обновлен', 'success');
            hideModal();
            loadProductsList();
          }
        } catch (error) {
          console.error('Error saving product:', error);
          showToast('Ошибка: ' + error.message, 'error');
        }
      }
    }
  ]);

  // Register modal state for unsaved changes tracking with field-level highlighting
  let hasChanges = false;
  const originalValues = {};

  import('../utils/modalManager.js').then(({ setModalState, markModalAsModified }) => {
    const productId = product?.id || 'new';
    setModalState('product', productId, () => ({
      hasUnsavedChanges: () => hasChanges
    }));

    // Store original values and track changes with field highlighting
    setTimeout(() => {
      const modalBody = document.getElementById('modal-body');
      if (!modalBody) return;

      // Store original values for all form fields
      const fields = modalBody.querySelectorAll('input, select, textarea');
      fields.forEach(field => {
        if (field.type === 'checkbox') {
          originalValues[field.id] = field.checked;
        } else {
          originalValues[field.id] = field.value;
        }
      });

      // Function to check and highlight a field
      const checkFieldChange = (field) => {
        if (!field.id || !originalValues.hasOwnProperty(field.id)) return;

        const currentValue = field.type === 'checkbox' ? field.checked : field.value;
        const originalValue = originalValues[field.id];
        const hasChanged = currentValue !== originalValue;

        // Update visual indicator
        if (hasChanged) {
          field.classList.add('field-modified');
          hasChanges = true;
        } else {
          field.classList.remove('field-modified');
          // Check if any other fields still have changes
          const anyChanges = Array.from(fields).some(f => f.classList.contains('field-modified'));
          hasChanges = anyChanges;
        }

        if (hasChanges) {
          markModalAsModified();
        }
      };

      // Add change listeners to all fields
      fields.forEach(field => {
        field.addEventListener('input', () => checkFieldChange(field));
        field.addEventListener('change', () => checkFieldChange(field));
      });
    }, 100);
  });

  // Initialize Sortable for image containers after modal is shown
  const currentProductId = isEdit ? product.id : null;
  attachImageManagerEventListeners(currentProductId);
  setTimeout(() => {
    initializeImageSortable('product_images');
    initializeImageSortable('product_images_2');

    // Load author suggestions for autocomplete
    loadAuthorSuggestions();

    // Initialize linked products, type link, and catalogs (always, including creation mode)
    initializeLinkedProductsSortable(currentProductId);
    setupLinkedProductsSearch(currentProductId);
    setupCatalogsSearch();
    setupTypeLinkSearch(currentProductId);
    // Load all products for search if not already loaded
    if (allProductsCache.length === 0) {
      loadAllProductsForSearch();
    }

    // Add event listener for product ID edit button
    const editIdBtn = document.getElementById('edit-product-id-btn');
    const productIdInput = document.getElementById('modal-product-id');
    if (editIdBtn && productIdInput) {
      editIdBtn.addEventListener('click', () => {
        if (productIdInput.readOnly) {
          productIdInput.readOnly = false;
          productIdInput.style.background = 'var(--bg-primary)';
          productIdInput.focus();
          editIdBtn.textContent = '✓';
          editIdBtn.style.background = 'var(--color-primary)';
          editIdBtn.style.color = 'white';
        } else {
          productIdInput.readOnly = true;
          productIdInput.style.background = 'var(--bg-tertiary)';
          editIdBtn.textContent = 'Изменить';
          editIdBtn.style.background = 'var(--bg-tertiary)';
          editIdBtn.style.color = 'var(--text-secondary)';
        }
      });
    }

    // Setup status dropdown listener to show/hide "фон" option
    const statusSelect = document.getElementById('modal-product-status');
    if (statusSelect) {
      const updateBackgroundOptionVisibility = () => {
        const isCustom = statusSelect.value === 'custom';
        document.querySelectorAll('.custom-status-option').forEach(option => {
          option.style.display = isCustom ? '' : 'none';
        });
      };
      // Initial check
      updateBackgroundOptionVisibility();
      // Listen for changes
      statusSelect.addEventListener('change', updateBackgroundOptionVisibility);
    }

    // Initialize keyword tags input
    initializeKeywordTags();
    // Initialize IP names tags input
    initializeIpNamesTags();
    // Initialize author tags input
    initializeAuthorTags();
    // Initialize slug suggestions
    initializeSlugSuggestions();
    // Grey out irrelevant fields when type = оригинал
    setupProductTypeGreyout(currentProductId);
  }, 100);
}

function setupProductTypeGreyout(currentProductId) {
  const typeSelect = document.getElementById('modal-product-type');
  if (!typeSelect) return;

  const greyoutIds = [
    'modal-product-alt',
    'modal-product-created',
    'author-tags-input',
    'modal-product-development-time',
  ];

  function applyGreyout(isOriginal) {
    greyoutIds.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const group = el.closest('.form-group');
      if (!group) return;
      group.style.opacity = isOriginal ? '0.35' : '';
      group.style.pointerEvents = isOriginal ? 'none' : '';
    });
  }

  function updateRestoredVisibility(isOriginal) {
    const restoredGroup = document.getElementById('modal-restored-group');
    if (restoredGroup) restoredGroup.style.display = isOriginal ? '' : 'none';
  }

  applyGreyout(typeSelect.value === 'оригинал');
  updateRestoredVisibility(typeSelect.value === 'оригинал');
  typeSelect.addEventListener('change', () => {
    applyGreyout(typeSelect.value === 'оригинал');
    updateRestoredVisibility(typeSelect.value === 'оригинал');

    // Re-render type-link section when type changes (different opposite type filter)
    const wrapper = document.getElementById('type-link-wrapper');
    if (wrapper) {
      // Clear type link if it's no longer compatible with the new type
      if (typeLinkState) {
        const expectedOpposite = getOppositeType(typeSelect.value);
        if (typeLinkState.type !== expectedOpposite) {
          typeLinkState = null;
        }
      }
      wrapper.innerHTML = renderTypeLinkUI(currentProductId);
      setupTypeLinkSearch(currentProductId);
    }
  });
}

/**
 * Show a search popover to copy an additional image to another product.
 */
async function showCopyImageToProductPopover(buttonEl, tableName, index) {
  const img = productImagesState[tableName]?.[index];
  if (!img?.url) {
    showToast('Сначала укажите URL изображения', 'error');
    return;
  }

  // Remove any existing popover
  document.querySelector('.copy-to-product-popover')?.remove();

  const popover = document.createElement('div');
  popover.className = 'copy-to-product-popover';
  popover.style.cssText = `
    position: fixed;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    box-shadow: var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.3));
    z-index: 10000;
    width: 280px;
    padding: var(--spacing-sm, 8px);
  `;
  popover.innerHTML = `
    <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 6px;">Добавить к продукту:</div>
    <input type="text"
           class="form-input copy-to-product-search-input"
           placeholder="Поиск..."
           autocomplete="off"
           style="font-size: 0.875rem; width: 100%; box-sizing: border-box;">
    <div class="copy-to-product-search-results" style="display: none; margin-top: 4px; max-height: 200px; overflow-y: auto;"></div>
  `;

  document.body.appendChild(popover);

  // Position below button
  const btnRect = buttonEl.getBoundingClientRect();
  const popoverBottom = btnRect.bottom + 4 + 260;
  const top = popoverBottom > window.innerHeight
    ? btnRect.top - 4 - popover.offsetHeight
    : btnRect.bottom + 4;
  popover.style.top = `${Math.max(4, top)}px`;
  const left = Math.min(btnRect.left, window.innerWidth - 290);
  popover.style.left = `${Math.max(4, left)}px`;

  const searchInput = popover.querySelector('.copy-to-product-search-input');
  const searchResults = popover.querySelector('.copy-to-product-search-results');

  searchInput.focus();

  let searchTimeout = null;

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim();
    clearTimeout(searchTimeout);
    if (query.length < 2) {
      searchResults.style.display = 'none';
      return;
    }
    searchTimeout = setTimeout(async () => {
      const results = await searchProductsWithVariants(allProductsCache, query, 6);
      if (results.length === 0) {
        searchResults.innerHTML = `<div style="padding: 8px; color: var(--text-secondary); font-size: 0.875rem;">Ничего не найдено</div>`;
      } else {
        searchResults.innerHTML = results.map(product => {
          const imageUrl = product.image || product.images?.[0]?.url || product.images?.[0];
          const safeTitle = product.title.replace(/"/g, '&quot;');
          return `
            <div class="linked-products-search-item" data-copy-product-id="${product.id}" data-copy-product-title="${safeTitle}" style="cursor:pointer;">
              ${imageUrl
                ? `<img src="${addImageSize(imageUrl, '60x0')}" class="linked-products-search-item-image">`
                : `<div class="linked-products-search-item-image-placeholder">IMG</div>`}
              <div class="linked-products-search-item-info">
                <span class="linked-products-search-item-title">${product.title}</span>
                <span class="linked-products-search-item-id">ID: ${product.id}</span>
              </div>
            </div>
          `;
        }).join('');
      }
      searchResults.style.display = 'block';
    }, 200);
  });

  searchResults.addEventListener('click', async (e) => {
    const item = e.target.closest('[data-copy-product-id]');
    if (!item) return;

    const targetProductId = parseInt(item.dataset.copyProductId);
    const targetTitle = item.dataset.copyProductTitle;
    popover.remove();

    if (!img.id) {
      showToast('Сохраните изображение перед связыванием', 'error');
      return;
    }

    try {
      const response = await apiPost('/api/products/image-refs/add', {
        product_id: targetProductId,
        image_id: img.id
      });
      if (response.ok) {
        showToast(`Ссылка добавлена к "${targetTitle}"`, 'success');
      } else {
        const data = await response.json().catch(() => ({}));
        showToast(data.error || 'Ошибка при добавлении ссылки', 'error');
      }
    } catch (err) {
      console.error('Error linking image to product:', err);
      showToast('Ошибка при добавлении ссылки на изображение', 'error');
    }
  });

  const closeHandler = (e) => {
    if (!popover.contains(e.target) && !buttonEl.contains(e.target)) {
      popover.remove();
      document.removeEventListener('click', closeHandler, true);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler, true), 0);
}

/**
 * Attach event listeners for image manager modal
 */
function attachImageManagerEventListeners(currentProductId) {
  const modal = document.getElementById('modal-overlay');
  if (!modal) return;

  const oldHandler = modal._imageManagerClickHandler;
  if (oldHandler) {
    modal.removeEventListener('click', oldHandler);
  }

  const clickHandler = (e) => {
    const target = e.target;
    const action = target.dataset.action || target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    const tableName = target.dataset.tableName || target.closest('[data-table-name]')?.dataset.tableName;
    const index = parseInt(target.dataset.index || target.closest('[data-index]')?.dataset.index);
    const productId = parseInt(target.dataset.productId || target.closest('[data-product-id]')?.dataset.productId);
    const catalogId = parseInt(target.dataset.catalogId || target.closest('[data-catalog-id]')?.dataset.catalogId);

    switch (action) {
      case 'add-image-row':
        if (tableName) addImageRow(tableName);
        break;
      case 'delete-image-row':
        if (tableName !== undefined && index !== undefined) deleteImageRow(tableName, index);
        break;
      case 'copy-image-to-product': {
        const btn = target.closest('[data-action]');
        if (btn && tableName && !isNaN(index)) showCopyImageToProductPopover(btn, tableName, index);
        break;
      }
      case 'add-linked-product':
        if (productId) {
          const productToAdd = allProductsCache.find(p => p.id === productId);
          if (productToAdd) {
            addLinkedProduct(productToAdd, currentProductId);
          }
        }
        break;
      case 'remove-linked-product':
        if (productId) {
          removeLinkedProduct(productId, currentProductId);
        }
        break;
      case 'add-catalog-to-product':
        if (catalogId) {
          addCatalogToProduct(catalogId);
        }
        break;
      case 'remove-catalog-from-product':
        if (catalogId) {
          removeCatalogFromProduct(catalogId);
        }
        break;
      case 'add-type-link':
        if (productId) {
          const productToLink = allProductsCache.find(p => p.id === productId);
          if (productToLink) addTypeLink(productToLink);
        }
        break;
      case 'remove-type-link':
        removeTypeLink();
        break;
    }
  };

  modal._imageManagerClickHandler = clickHandler;
  modal.addEventListener('click', clickHandler);
}

// Exports
export {
  loadProductImages,
  saveProductImages,
  renderImageManagementUI,
  updateImageUrl,
  updateImageExtra,
  updateImageDeprecated,
  updateImageMix,
  updateImageHidden,
  updateImageHiddenProduct,
  showAddProductModal,
  editProduct,
  showProductModal,
  prepareNewProductModal
};
