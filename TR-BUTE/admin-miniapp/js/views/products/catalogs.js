// Catalogs subtab for admin products view.
//
// Dep injected via initCatalogsDeps():
//   getAllProducts - returns current allProductsList array

import { addImageSize, showToast, showModal, hideModal, escapeHtml } from '../../utils.js';
import { apiGet, apiPost } from '../../utils/apiClient.js';

let catalogsCache = [];
let currentOpenCatalogId = null;
let currentProductFilter = '';
// Pending product membership changes while the catalog modal is open.
// null = no modal open. Populated as a Set<number> (product IDs) on modal open.
let pendingProductIds = null;

let _getAllProducts;

export function initCatalogsDeps({ getAllProducts }) {
  _getAllProducts = getAllProducts;
}

// ============================================================================
// CATALOGS SUBTAB
// ============================================================================

export function renderCatalogsSubtab() {
  const container = document.getElementById('products-subtab-content');
  if (!container) return;

  container.innerHTML = `
    <div class="search-and-filters">
      <div class="search-box">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
        <input type="text" class="search-input" placeholder="Поиск каталога..." id="catalog-search-input">
      </div>
    </div>

    <div id="catalog-list" class="catalog-list">
      <div class="loading-spinner small"><div class="spinner"></div></div>
    </div>

    <!-- Help FAB (above primary FAB) -->
    <button class="fab fab-help" data-action="show-subtab-help" title="Помощь">?</button>

    <!-- Create catalog FAB -->
    <button class="fab" data-action="create-catalog" title="Создать каталог">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    </button>
  `;

  loadCatalogs();
}

export async function loadCatalogs() {
  try {
    const response = await apiGet('/api/catalogs');
    if (!response.ok) throw new Error('Failed to load catalogs');

    catalogsCache = await response.json();
    renderCatalogList(catalogsCache);
    setupCatalogSearch();
  } catch (error) {
    console.error('Error loading catalogs:', error);
    document.getElementById('catalog-list').innerHTML =
      '<div class="empty-state small"><p>Ошибка загрузки каталогов</p></div>';
  }
}

// Sortable instance for catalogs
let catalogSortableInstance = null;

function renderCatalogList(catalogs) {
  const container = document.getElementById('catalog-list');
  if (!container) return;

  if (!catalogs || catalogs.length === 0) {
    container.innerHTML = '<div class="empty-state small"><p>Каталогов нет</p></div>';
    return;
  }

  // Sort by sort_order
  const sortedCatalogs = [...catalogs].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  container.innerHTML = sortedCatalogs.map(catalog => {
    const productCount = catalog.product_ids
      ? catalog.product_ids.split(',').filter(id => id.trim()).length
      : 0;

    return `
      <div class="catalog-item" data-catalog-id="${catalog.id}">
        <div class="catalog-drag-handle" style="cursor: grab; padding: 8px; color: var(--text-tertiary); display: flex; align-items: center;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <line x1="4" y1="6" x2="20" y2="6"></line>
            <line x1="4" y1="12" x2="20" y2="12"></line>
            <line x1="4" y1="18" x2="20" y2="18"></line>
          </svg>
        </div>
        <div class="catalog-item-content" data-action="open-catalog-management" data-catalog-id="${catalog.id}" style="display: flex; align-items: center; flex: 1; gap: var(--spacing-sm); cursor: pointer;">
          <div class="catalog-item-info">
            <span class="catalog-item-title">${catalog.title}</span>
            <span class="catalog-item-count">${productCount} товаров</span>
          </div>
          <svg class="catalog-item-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </div>
      </div>
    `;
  }).join('');

  // Initialize SortableJS for catalog drag-and-drop reordering
  initCatalogSortable(container);
}

function initCatalogSortable(container) {
  if (!window.Sortable || !container) return;

  // Destroy previous instance if exists
  if (catalogSortableInstance) {
    catalogSortableInstance.destroy();
    catalogSortableInstance = null;
  }

  catalogSortableInstance = new Sortable(container, {
    animation: 150,
    handle: '.catalog-drag-handle',
    ghostClass: 'sortable-ghost',
    onEnd: async function(evt) {
      // Get new order of catalog IDs
      const items = container.querySelectorAll('.catalog-item');
      const newOrder = Array.from(items).map(item => parseInt(item.dataset.catalogId));

      try {
        const response = await apiPost('/api/catalogs/reorder', { catalog_ids: newOrder });

        if (!response.ok) throw new Error('Failed to reorder catalogs');

        // Update local cache with new order
        newOrder.forEach((id, index) => {
          const catalog = catalogsCache.find(c => c.id === id);
          if (catalog) catalog.sort_order = index;
        });

        showToast('Порядок каталогов обновлен', 'success');
      } catch (error) {
        console.error('Error reordering catalogs:', error);
        showToast('Ошибка при изменении порядка', 'error');
        // Reload to restore original order
        loadCatalogs();
      }
    }
  });
}

function setupCatalogSearch() {
  const searchInput = document.getElementById('catalog-search-input');
  if (!searchInput) return;

  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      const query = searchInput.value.trim().toLowerCase();
      if (!query) {
        renderCatalogList(catalogsCache);
        return;
      }

      const filtered = catalogsCache.filter(c =>
        c.title?.toLowerCase().includes(query) ||
        c.genre?.toLowerCase().includes(query)
      );
      renderCatalogList(filtered);
    }, 200);
  });
}

// ============================================================================
// CATALOG MANAGEMENT MODAL
// ============================================================================

export async function openCatalogManagement(catalogId) {
  const catalog = catalogsCache.find(c => c.id === catalogId);
  if (!catalog) {
    showToast('Каталог не найден', 'error');
    return;
  }

  currentOpenCatalogId = catalogId;
  currentProductFilter = '';
  pendingProductIds = new Set(parseCatalogProductIds(catalog));

  showModal(`Каталог: ${escapeHtml(catalog.title)}`, `
    <div class="catalog-management-modal">

      <div class="catalog-info-section" style="display: flex; flex-direction: column; gap: var(--spacing-sm); padding-bottom: var(--spacing-md); border-bottom: 1px solid var(--border-color); margin-bottom: var(--spacing-md);">
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label" style="font-size: 0.8rem;">Название</label>
          <input type="text" id="catalog-edit-title" class="form-input"
                 value="${escapeHtml(catalog.title || '')}" style="font-size: 0.875rem;">
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label" style="font-size: 0.8rem;">URL-slug</label>
          <input type="text" id="catalog-edit-slug" class="form-input"
                 value="${escapeHtml(catalog.slug || '')}" placeholder="my-catalog"
                 style="font-size: 0.875rem;">
        </div>
        <button type="button" class="btn btn-primary btn-sm"
                data-action="save-catalog-info"
                data-catalog-id="${catalogId}"
                style="align-self: flex-start;">
          Сохранить изменения
        </button>
      </div>

      <div class="catalog-products-section">
        <div style="display: flex; gap: var(--spacing-sm); align-items: center; margin-bottom: var(--spacing-sm);">
          <input type="text" id="catalog-product-filter-input" class="form-input"
                 placeholder="Фильтр товаров..." style="font-size: 0.875rem; flex: 1;">
          <button type="button" class="btn btn-primary btn-sm"
                  data-action="save-catalog-products"
                  data-catalog-id="${catalogId}"
                  id="save-catalog-products-btn">
            Сохранить состав
          </button>
        </div>
        <div id="catalog-products-list" class="catalog-products-list">
          ${renderAllProductsForModal([...pendingProductIds], catalogId)}
        </div>
      </div>

    </div>
  `, [
    {
      text: 'Закрыть',
      className: 'btn btn-secondary',
      onClick: () => {
        hideModal();
        currentOpenCatalogId = null;
        currentProductFilter = '';
        pendingProductIds = null;
        loadCatalogs();
      }
    }
  ]);

  // Setup product filter after modal renders
  setTimeout(() => {
    setupCatalogProductFilter(catalogId);
  }, 50);
}

function parseCatalogProductIds(catalog) {
  return catalog.product_ids
    ? catalog.product_ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
    : [];
}

function renderAllProductsForModal(currentProductIds, catalogId, filter = '') {
  const allProducts = _getAllProducts ? _getAllProducts() : [];
  const lowerFilter = filter.toLowerCase();

  const filtered = lowerFilter
    ? allProducts.filter(p =>
        p.title?.toLowerCase().includes(lowerFilter) ||
        String(p.id).includes(lowerFilter)
      )
    : allProducts;

  if (filtered.length === 0) {
    return '<div class="empty-state small"><p>Товаров не найдено</p></div>';
  }

  const inCatalog = filtered.filter(p => currentProductIds.includes(p.id));
  const notInCatalog = filtered.filter(p => !currentProductIds.includes(p.id));

  let html = '';

  if (inCatalog.length > 0) {
    html += `<div style="font-size: 0.75rem; color: var(--text-tertiary); font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; padding: 4px 0 6px;">В каталоге (${inCatalog.length})</div>`;
    html += inCatalog.map(p => renderProductRow(p, true, catalogId)).join('');
  }

  if (notInCatalog.length > 0) {
    if (inCatalog.length > 0) {
      html += `<div style="font-size: 0.75rem; color: var(--text-tertiary); font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; padding: 10px 0 6px;">Все товары (${notInCatalog.length})</div>`;
    }
    html += notInCatalog.map(p => renderProductRow(p, false, catalogId)).join('');
  }

  return html;
}

function renderProductRow(product, inCatalog, catalogId) {
  const imageUrl = product.image ? addImageSize(product.image, '60x0') : '';

  const imgEl = imageUrl
    ? `<img src="${imageUrl}" class="catalog-product-image" alt="${escapeHtml(product.title)}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; flex-shrink: 0;">`
    : '<div class="catalog-product-image-placeholder" style="width: 40px; height: 40px; flex-shrink: 0;"></div>';

  const btn = inCatalog
    ? `<button type="button" class="btn btn-secondary btn-xs btn-danger"
               data-action="remove-product-from-catalog"
               data-product-id="${product.id}"
               data-catalog-id="${catalogId}"
               title="Удалить из каталога">×</button>`
    : `<button type="button" class="btn btn-secondary btn-xs"
               data-action="add-product-to-catalog"
               data-product-id="${product.id}"
               data-catalog-id="${catalogId}"
               title="Добавить в каталог">+</button>`;

  const borderStyle = inCatalog ? 'border-left: 3px solid var(--brand-primary);' : '';

  return `
    <div class="catalog-product-item" data-product-id="${product.id}" style="${borderStyle}">
      ${imgEl}
      <div class="catalog-product-info" style="flex: 1; min-width: 0;">
        <span class="catalog-product-title" style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(product.title)}</span>
        <span class="catalog-product-id">ID: ${product.id}</span>
      </div>
      ${btn}
    </div>
  `;
}

function setupCatalogProductFilter(catalogId) {
  const filterInput = document.getElementById('catalog-product-filter-input');
  if (!filterInput) return;

  let filterTimeout;
  filterInput.addEventListener('input', () => {
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(() => {
      currentProductFilter = filterInput.value.trim();
      refreshModalProductList(catalogId);
    }, 150);
  });
}

function refreshModalProductList(catalogId) {
  const listEl = document.getElementById('catalog-products-list');
  if (!listEl) return;

  const ids = pendingProductIds ? [...pendingProductIds] : parseCatalogProductIds(catalogsCache.find(c => c.id === catalogId) || {});
  listEl.innerHTML = renderAllProductsForModal(ids, catalogId, currentProductFilter);
}

// ============================================================================
// SAVE CATALOG INFO (title, slug)
// ============================================================================

export async function saveCatalogInfo(catalogId) {
  const titleEl = document.getElementById('catalog-edit-title');
  const slugEl = document.getElementById('catalog-edit-slug');

  if (!titleEl) return;

  const title = titleEl.value.trim();
  if (!title) {
    showToast('Название обязательно', 'error');
    return;
  }

  const slug = slugEl ? slugEl.value.trim() : undefined;

  try {
    const body = { catalog_id: catalogId, title };
    if (slug !== undefined) body.slug = slug || null;

    const response = await apiPost('/api/catalogs/update', body);
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update catalog');
    }

    // Update local cache
    const catalog = catalogsCache.find(c => c.id === catalogId);
    if (catalog) {
      catalog.title = title;
      if (slug !== undefined) catalog.slug = slug || null;
    }

    showToast('Каталог обновлён', 'success');
  } catch (error) {
    console.error('Error saving catalog info:', error);
    showToast('Ошибка сохранения: ' + error.message, 'error');
  }
}

// ============================================================================
// ADD / REMOVE PRODUCT
// ============================================================================

export function addProductToCatalog(productId, catalogId) {
  if (!pendingProductIds) return;
  pendingProductIds.add(productId);
  refreshModalProductList(catalogId);
}

export function removeProductFromCatalog(productId, catalogId) {
  if (!pendingProductIds) return;
  pendingProductIds.delete(productId);
  refreshModalProductList(catalogId);
}

export async function saveCatalogProductChanges(catalogId) {
  const catalog = catalogsCache.find(c => c.id === catalogId);
  if (!catalog || !pendingProductIds) return;

  const originalIds = new Set(parseCatalogProductIds(catalog));
  const toAdd = [...pendingProductIds].filter(id => !originalIds.has(id));
  const toRemove = [...originalIds].filter(id => !pendingProductIds.has(id));

  if (toAdd.length === 0 && toRemove.length === 0) {
    showToast('Изменений нет', 'info');
    return;
  }

  const btn = document.getElementById('save-catalog-products-btn');
  if (btn) btn.disabled = true;

  try {
    for (const productId of toAdd) {
      const resp = await apiPost('/api/catalogs/add-product', { catalog_id: catalogId, product_id: productId });
      if (!resp.ok) throw new Error('Failed to add product ' + productId);
    }
    for (const productId of toRemove) {
      const resp = await apiPost('/api/catalogs/remove-product', { catalog_id: catalogId, product_id: productId });
      if (!resp.ok) throw new Error('Failed to remove product ' + productId);
    }

    // Update local cache
    catalog.product_ids = [...pendingProductIds].join(',');
    showToast('Состав каталога сохранён', 'success');
  } catch (error) {
    console.error('Error saving catalog products:', error);
    showToast('Ошибка сохранения: ' + error.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ============================================================================
// CREATE CATALOG
// ============================================================================

export function showCreateCatalogModal() {
  showModal('Создать каталог', `
    <div class="form-group">
      <label class="form-label">Название *</label>
      <input type="text" id="new-catalog-title" class="form-input" placeholder="Название каталога">
    </div>
    <div class="form-group">
      <label class="form-label">Жанр *</label>
      <select id="new-catalog-genre" class="form-select">
        <option value="">Выберите жанр</option>
        <option value="игры">Игры</option>
        <option value="фильмы">Фильмы</option>
        <option value="аниме">Аниме</option>
        <option value="другое">Другое</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Slug (URL)</label>
      <input type="text" id="new-catalog-slug" class="form-input" placeholder="catalog-url-slug">
      <small style="color: var(--text-tertiary);">Оставьте пустым для автогенерации</small>
    </div>
  `, [
    { text: 'Отмена', className: 'btn btn-secondary', onClick: hideModal },
    { text: 'Создать', className: 'btn btn-primary', onClick: _createCatalog }
  ]);

  // Auto-generate slug from title
  setTimeout(() => {
    const titleInput = document.getElementById('new-catalog-title');
    const slugInput = document.getElementById('new-catalog-slug');
    if (titleInput && slugInput) {
      titleInput.addEventListener('input', () => {
        if (!slugInput.dataset.manuallyEdited) {
          slugInput.value = titleInput.value
            .toLowerCase()
            .replace(/[^a-zа-яё0-9\s-]/gi, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .trim();
        }
      });
      slugInput.addEventListener('input', () => { slugInput.dataset.manuallyEdited = 'true'; });
    }
  }, 50);
}

async function _createCatalog() {
  const title = document.getElementById('new-catalog-title')?.value.trim();
  const genre = document.getElementById('new-catalog-genre')?.value;
  const slug = document.getElementById('new-catalog-slug')?.value.trim();

  if (!title) { showToast('Введите название', 'error'); return; }
  if (!genre) { showToast('Выберите жанр', 'error'); return; }

  try {
    const response = await apiPost('/api/catalogs/create', { title, genre, slug: slug || null });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create catalog');
    }
    hideModal();
    showToast('Каталог создан', 'success');
    await loadCatalogs();
  } catch (error) {
    console.error('Error creating catalog:', error);
    showToast('Ошибка: ' + error.message, 'error');
  }
}
