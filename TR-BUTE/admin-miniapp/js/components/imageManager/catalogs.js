// Catalog assignment for the product modal.

import { showToast } from '../../utils.js';
import { apiGet, apiPost } from '../../utils/apiClient.js';

let catalogsCache = [];
let selectedCatalogsState = [];

// ============================================================================
// CATALOG ASSIGNMENT FUNCTIONS
// ============================================================================

async function loadCatalogsForProduct() {
  if (catalogsCache.length > 0) return catalogsCache;
  try {
    const response = await apiGet('/api/catalogs');
    if (!response.ok) throw new Error('Failed to load catalogs');
    catalogsCache = await response.json();
    return catalogsCache;
  } catch (error) {
    console.error('Error loading catalogs:', error);
    catalogsCache = [];
    return catalogsCache;
  }
}

function renderCatalogsUI(productCatalogIds = []) {
  selectedCatalogsState = [...productCatalogIds];

  return `
    <div id="product-catalogs-container" class="product-catalogs-container">
      <div class="product-catalogs-search" style="margin-bottom: var(--spacing-sm);">
        <input type="text"
               id="product-catalogs-search-input"
               class="form-input"
               placeholder="Поиск каталогов..."
               style="font-size: 0.875rem;">
        <div id="product-catalogs-search-results" class="product-catalogs-search-results" style="display: none;"></div>
      </div>
      <div id="product-catalogs-list" class="product-catalogs-list">
        ${selectedCatalogsState.length === 0
          ? '<div class="product-catalogs-empty" style="color: var(--text-secondary); font-size: 0.875rem; padding: var(--spacing-sm);">Товар не добавлен ни в один каталог</div>'
          : renderSelectedCatalogs()}
      </div>
    </div>
  `;
}

function renderSelectedCatalogs() {
  return selectedCatalogsState.map(catalogId => {
    const catalog = catalogsCache.find(c => c.id === catalogId);
    if (!catalog) return '';

    return `
      <div class="product-catalog-item" data-catalog-id="${catalog.id}">
        <div class="product-catalog-info">
          <span class="product-catalog-title">${catalog.title}</span>
          <span class="product-catalog-genre">${catalog.genre || ''}</span>
        </div>
        <button type="button" class="btn btn-secondary btn-xs"
                data-action="remove-catalog-from-product"
                data-catalog-id="${catalog.id}"
                title="Удалить из каталога">×</button>
      </div>
    `;
  }).join('');
}

function refreshCatalogsUI() {
  const container = document.getElementById('product-catalogs-list');
  if (!container) return;

  if (selectedCatalogsState.length === 0) {
    container.innerHTML = '<div class="product-catalogs-empty" style="color: var(--text-secondary); font-size: 0.875rem; padding: var(--spacing-sm);">Товар не добавлен ни в один каталог</div>';
  } else {
    container.innerHTML = renderSelectedCatalogs();
  }
}

function setupCatalogsSearch() {
  const searchInput = document.getElementById('product-catalogs-search-input');
  const searchResults = document.getElementById('product-catalogs-search-results');
  if (!searchInput || !searchResults) return;

  let searchTimeout = null;

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();

    clearTimeout(searchTimeout);

    if (query.length < 1) {
      searchResults.style.display = 'none';
      return;
    }

    searchTimeout = setTimeout(() => {
      // Filter catalogs not already selected
      const availableCatalogs = catalogsCache.filter(c =>
        !selectedCatalogsState.includes(c.id) &&
        (c.title?.toLowerCase().includes(query) || c.genre?.toLowerCase().includes(query))
      );

      if (availableCatalogs.length === 0) {
        searchResults.innerHTML = '<div class="product-catalogs-search-empty" style="padding: var(--spacing-sm); color: var(--text-secondary); font-size: 0.875rem;">Ничего не найдено</div>';
      } else {
        searchResults.innerHTML = availableCatalogs.slice(0, 5).map(catalog => `
          <div class="product-catalogs-search-item" data-action="add-catalog-to-product" data-catalog-id="${catalog.id}">
            <div class="product-catalogs-search-item-info">
              <span class="product-catalogs-search-item-title">${catalog.title}</span>
              <span class="product-catalogs-search-item-genre">${catalog.genre || ''}</span>
            </div>
            <span class="product-catalogs-search-item-add">+</span>
          </div>
        `).join('');
      }

      searchResults.style.display = 'block';
    }, 150);
  });

  // Hide results when clicking outside
  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
      searchResults.style.display = 'none';
    }
  });
}

function addCatalogToProduct(catalogId) {
  if (selectedCatalogsState.includes(catalogId)) {
    showToast('Каталог уже добавлен', 'warning');
    return;
  }

  selectedCatalogsState.push(catalogId);
  refreshCatalogsUI();

  // Clear search
  const searchInput = document.getElementById('product-catalogs-search-input');
  const searchResults = document.getElementById('product-catalogs-search-results');
  if (searchInput) searchInput.value = '';
  if (searchResults) searchResults.style.display = 'none';
}

function removeCatalogFromProduct(catalogId) {
  selectedCatalogsState = selectedCatalogsState.filter(id => id !== catalogId);
  refreshCatalogsUI();
}

async function saveCatalogAssignments(productId, allProductsCache = []) {
  try {
    // Get current catalogs for this product
    const product = allProductsCache.find(p => p.id === productId);
    const oldCatalogIds = product?.catalog_ids || [];

    // Determine which catalogs to add and remove
    const toAdd = selectedCatalogsState.filter(id => !oldCatalogIds.includes(id));
    const toRemove = oldCatalogIds.filter(id => !selectedCatalogsState.includes(id));

    // Add product to new catalogs
    for (const catalogId of toAdd) {
      await apiPost('/api/catalogs/add-product', { catalog_id: catalogId, product_id: productId });
    }

    // Remove product from old catalogs
    for (const catalogId of toRemove) {
      await apiPost('/api/catalogs/remove-product', { catalog_id: catalogId, product_id: productId });
    }
  } catch (error) {
    console.error('Error saving catalog assignments:', error);
    throw error;
  }
}

export function resetCatalogsState() {
  selectedCatalogsState = [];
}

export {
  loadCatalogsForProduct, renderCatalogsUI, renderSelectedCatalogs,
  refreshCatalogsUI, setupCatalogsSearch,
  addCatalogToProduct, removeCatalogFromProduct, saveCatalogAssignments
};
