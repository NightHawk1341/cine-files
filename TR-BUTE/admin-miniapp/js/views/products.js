/**
 * views/products.js
 * Products management with subtabs: Products and Catalogs
 */

import { state, updateState, hasPermission, isAdmin } from '../state.js';
import { API_BASE, tg, isBrowserMode } from '../config.js';
import { SVGIcons, requireAuth, formatDate, formatTime, formatPrice, formatNumber, showToast, showError, copyToClipboard, addImageSize, showModal, showPromptModal, hideModal } from '../utils.js';
import { showAddProductModal, editProduct, prepareNewProductModal } from '../components/imageManager.js';
import { searchProductsRelevance, preloadLinkedVariantsCache, searchProductsWithVariants, invalidateLinkedVariantsCache } from '../utils/productSearch.js';
import { apiGet, apiPost } from '../utils/apiClient.js';
import { createPageHeader } from '../utils/templates.js';
import { checkImageHealth, getCachedImageHealth } from '../utils/imageHealthChecker.js';
import { initCatalogsDeps, renderCatalogsSubtab, loadCatalogs, openCatalogManagement, addProductToCatalog, removeProductFromCatalog, saveCatalogInfo, saveCatalogProductChanges, showCreateCatalogModal } from './products/catalogs.js';
import { initTemplatesDeps, renderTemplatesSubtab, createFromTemplate, deleteTemplateWithConfirm, showTemplateSelectionModal, initiateProductCreation, insertProductAtPosition, handlePostCreateInsertion, saveProductAsTemplate } from './products/templates.js';

// ============================================================================
// SUBTAB STATE
// ============================================================================

let currentSubtab = 'products'; // 'products' | 'catalogs' | 'templates'


// Global products list for filtering
let allProductsList = [];

// Link group data for group-aware rendering
// allLinkGroups: Array of arrays [[{product_id, group_id, sort_order, ...}]]
let allLinkGroups = [];
// productToGroupId: Map<product_id, group_id>
let productToGroupId = new Map();
// groupsById: Map<group_id, Array<{product_id, sort_order, ...}>> sorted by sort_order
let groupsById = new Map();

// ============================================================================
// SUBTAB PERMISSIONS
// ============================================================================

/**
 * Check if user can access a specific subtab
 */
function canAccessSubtab(subtab) {
  // Admin can access everything
  if (isAdmin()) return true;

  // Map subtabs to permission keys
  const subtabPermissions = {
    'products': 'canAccessProducts',
    'catalogs': 'canAccessCatalogs',
    'templates': 'canAccessTemplates'
  };

  const permKey = subtabPermissions[subtab];
  if (!permKey) return false;

  return hasPermission('products', permKey);
}

/**
 * Get list of accessible subtabs for current user
 */
function getAccessibleSubtabs() {
  return ['products', 'catalogs', 'templates'].filter(canAccessSubtab);
}

/**
 * Get first accessible subtab (for initial load)
 */
function getDefaultSubtab() {
  const accessible = getAccessibleSubtabs();
  return accessible.length > 0 ? accessible[0] : 'products';
}

// ============================================================================
// MAIN RENDER
// ============================================================================

function loadProducts() {
  requireAuth();

  // Wire up sub-module dep injection
  initCatalogsDeps({ getAllProducts: () => allProductsList });
  initTemplatesDeps({
    setCurrentSubtab: (v) => { currentSubtab = v; },
    getCurrentSubtab: () => currentSubtab,
    loadProductsSubtabContent,
    loadProductsList,
    getAllProducts: () => allProductsList,
  });

  // Ensure current subtab is accessible
  if (!canAccessSubtab(currentSubtab)) {
    currentSubtab = getDefaultSubtab();
  }

  const content = document.getElementById('content');

  // Define all subtabs with their metadata
  const allSubtabs = [
    { id: 'products',  label: 'Товары',    icon: SVGIcons.shopping },
    { id: 'catalogs',  label: 'Каталоги',  icon: SVGIcons.grid },
    { id: 'templates', label: 'Шаблоны',   icon: SVGIcons.file },
  ];

  // Filter subtabs based on permissions
  const visibleSubtabs = allSubtabs.filter(tab => canAccessSubtab(tab.id));

  // Render subtab buttons
  const subtabsHTML = visibleSubtabs.map(tab => `
    <button class="tab-btn ${currentSubtab === tab.id ? 'active' : ''}" data-action="switch-products-subtab" data-subtab="${tab.id}">
      <span class="tab-icon">${tab.icon}</span>
      <span class="tab-label">${tab.label}</span>
    </button>
  `).join('');

  content.innerHTML = `
    ${createPageHeader({ title: 'Управление товарами', refreshAction: 'refresh-products' })}

    <!-- Subtabs Navigation -->
    <div class="tabs-carousel" style="margin-bottom: var(--spacing-md);">
      <div class="tabs-container">
        ${subtabsHTML}
      </div>
    </div>

    <!-- Subtab Content -->
    <div id="products-subtab-content">
      <div class="loading-spinner">
        <div class="spinner"></div>
        <p>Загрузка...</p>
      </div>
    </div>
  `;

  attachProductsEventListeners();
  loadProductsSubtabContent();
}

function loadProductsSubtabContent() {
  switch (currentSubtab) {
    case 'products':
      renderProductsSubtab();
      break;
    case 'catalogs':
      renderCatalogsSubtab();
      break;
    case 'templates':
      renderTemplatesSubtab();
      break;
    default:
      renderProductsSubtab();
  }
}

// ============================================================================
// PRODUCTS SUBTAB
// ============================================================================

function renderProductsSubtab() {
  const container = document.getElementById('products-subtab-content');
  if (!container) return;

  container.innerHTML = `
    <div class="search-and-filters">
      <div class="search-box">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
        <input type="text" class="search-input" placeholder="Поиск товаров..." id="products-search">
      </div>

      <div class="filters-container">
        <div class="filters-grid">
          <div class="filter-with-icon">
            <svg class="filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
            </svg>
            <select id="filter-status" class="filter-select">
              <option value="">Все статусы</option>
              <option value="available">Доступен</option>
              <option value="coming_soon">Скоро</option>
              <option value="not_for_sale">Не в продаже</option>
              <option value="available_via_var">Доступен как вариант</option>
              <option value="custom">Custom (с фонами)</option>
              <option value="test">Тест</option>
            </select>
          </div>

          <div class="filter-with-icon">
            <svg class="filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
            <select id="filter-genre" class="filter-select">
              <option value="">Все жанры</option>
            </select>
          </div>

          <div class="filter-with-icon">
            <svg class="filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="8" cy="12" r="4"/><circle cx="16" cy="12" r="4"/>
              <path d="M8 8V4M16 8V4M8 16v4M16 16v4"/>
            </svg>
            <select id="filter-type" class="filter-select">
              <option value="">Все типы</option>
            </select>
          </div>

          <div class="filter-with-icon">
            <svg class="filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z"/>
              <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
            </svg>
            <select id="filter-fields" class="filter-select">
              <option value="">Заполненность полей</option>
              <option value="has-alt">Есть alt</option>
              <option value="no-alt">Нет alt</option>
              <option value="has-keywords">Есть keywords</option>
              <option value="no-keywords">Нет keywords</option>
              <option value="has-url">Есть URL</option>
              <option value="no-url">Нет URL</option>
              <option value="has-description">Есть описание</option>
              <option value="no-description">Нет описания</option>
              <option value="has-ip-names">Есть IP-названия</option>
              <option value="no-ip-names">Нет IP-названий</option>
            </select>
          </div>

          <div class="filter-with-icon">
            <svg class="filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="9" y1="18" x2="15" y2="18"/>
            </svg>
            <select id="sort-completeness" class="filter-select">
              <option value="">Сортировка</option>
              <option value="asc">Заполненность ↑</option>
              <option value="desc">Заполненность ↓</option>
            </select>
          </div>

          <button class="btn-filter-reset" id="reset-product-filters" data-action="reset-product-filters" title="Сбросить фильтры">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>

          <button class="btn-verify-images" id="verify-images-btn" data-action="verify-product-images" title="Проверить изображения товаров">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <path d="M9 11l3 3L22 4"/>
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
            </svg>
            <span>Проверить изображения</span>
          </button>
        </div>
      </div>
    </div>

    <div id="products-list" style="padding-bottom: 80px;">
      <div class="loading-spinner">
        <div class="spinner"></div>
        <p>Загрузка товаров...</p>
      </div>
    </div>

    <!-- Help FAB (above primary FAB) -->
    <button class="fab fab-help" data-action="show-subtab-help" title="Помощь">?</button>

    <!-- Floating Action Button -->
    <button class="fab" data-action="show-add-product-modal" title="Добавить товар">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    </button>
  `;

  setupProductFilterListeners();
  loadProductsList();
}

async function loadProductsList() {
  // Save current filter state so it survives data refreshes (e.g. after saving a product)
  const savedSearch = document.getElementById('products-search')?.value || '';
  const savedStatus = document.getElementById('filter-status')?.value || '';
  const savedGenre = document.getElementById('filter-genre')?.value || '';
  const savedType = document.getElementById('filter-type')?.value || '';
  const savedFields = document.getElementById('filter-fields')?.value || '';
  const savedSort = document.getElementById('sort-completeness')?.value || '';

  try {
    // Load products and link groups in parallel
    const [response, linksResponse] = await Promise.all([
      apiGet('/products?all=true'),
      apiGet('/api/products/links?all=true'),
      preloadLinkedVariantsCache() // Preload for variant-aware search
    ]);

    if (!response.ok) throw new Error('Failed to load products');

    const products = await response.json();
    allProductsList = products.sort((a, b) => (a.sort_order != null ? a.sort_order : a.id) - (b.sort_order != null ? b.sort_order : b.id));

    // Build link group maps
    if (linksResponse.ok) {
      const linksData = await linksResponse.json();
      allLinkGroups = linksData.groups || [];
    } else {
      allLinkGroups = [];
    }
    buildProductGroupMaps();

    // Repopulate genre/type filter dropdowns (rebuilds their options)
    populateProductFilters(allProductsList);

    // Restore values that populateProductFilters wiped by rebuilding innerHTML
    const genreEl = document.getElementById('filter-genre');
    if (genreEl && savedGenre) genreEl.value = savedGenre;
    const typeEl = document.getElementById('filter-type');
    if (typeEl && savedType) typeEl.value = savedType;

    const hasActiveFilters = !!(savedSearch || savedStatus || savedGenre || savedType || savedFields || savedSort);
    if (hasActiveFilters) {
      await applyProductFilters();
    } else {
      renderProductsList(allProductsList, false);
    }
  } catch (error) {
    console.error('Error loading products:', error);
    const el = document.getElementById('products-list');
    if (el) el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${SVGIcons.alert}</div><h3>Ошибка загрузки</h3></div>`;
  }
}

/**
 * Build productToGroupId and groupsById maps from allLinkGroups.
 * Only groups with 2+ products are treated as groups.
 */
function buildProductGroupMaps() {
  productToGroupId = new Map();
  groupsById = new Map();

  for (const group of allLinkGroups) {
    if (group.length < 2) continue;
    const gid = group[0].group_id;
    groupsById.set(gid, group); // already sorted by sort_order from API
    for (const item of group) {
      productToGroupId.set(item.product_id, gid);
    }
  }
}

/**
 * Force refresh products data
 */
async function refreshProducts() {
  showToast('Обновление...', 'info');

  if (currentSubtab === 'products') {
    allProductsList = [];
    allLinkGroups = [];
    productToGroupId = new Map();
    groupsById = new Map();
    invalidateLinkedVariantsCache();
    await loadProductsList();
    showToast('Товары обновлены', 'success');
  } else if (currentSubtab === 'catalogs') {
    renderCatalogsSubtab();
    showToast('Каталоги обновлены', 'success');
  }
}

function populateProductFilters(products) {
  // Get unique genres and types
  const genres = [...new Set(products.map(p => p.genre).filter(Boolean))].sort();
  const types = [...new Set(products.map(p => p.type).filter(Boolean))].sort();

  // Populate genre dropdown
  const genreSelect = document.getElementById('filter-genre');
  if (genreSelect) {
    genreSelect.innerHTML = '<option value="">Все жанры</option>' +
      genres.map(g => `<option value="${g}">${g}</option>`).join('');
  }

  // Populate type dropdown
  const typeSelect = document.getElementById('filter-type');
  if (typeSelect) {
    typeSelect.innerHTML = '<option value="">Все типы</option>' +
      types.map(t => `<option value="${t}">${t}</option>`).join('');
  }
}

function setupProductFilterListeners() {
  const searchInput = document.getElementById('products-search');
  const filterStatus = document.getElementById('filter-status');
  const filterGenre = document.getElementById('filter-genre');
  const filterType = document.getElementById('filter-type');
  const filterFields = document.getElementById('filter-fields');
  const sortCompleteness = document.getElementById('sort-completeness');

  // Search with debounce
  let searchTimeout;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => applyProductFilters(), 300);
    });
  }

  // Filters auto-apply
  [filterStatus, filterGenre, filterType, filterFields, sortCompleteness].forEach(el => {
    if (el) {
      el.addEventListener('change', () => {
        applyProductFilters();
        el.setAttribute('data-active', el.value !== '');
      });
    }
  });
}

async function applyProductFilters() {
  const searchQuery = document.getElementById('products-search')?.value?.trim() || '';
  const statusFilter = document.getElementById('filter-status')?.value || '';
  const genreFilter = document.getElementById('filter-genre')?.value || '';
  const typeFilter = document.getElementById('filter-type')?.value || '';
  const fieldsFilter = document.getElementById('filter-fields')?.value || '';
  const sortCompleteness = document.getElementById('sort-completeness')?.value || '';

  let filtered = allProductsList;

  // Search filter using unified search component with variant support
  if (searchQuery && searchQuery.length >= 2) {
    // Use relevance-based search that also checks linked variants
    filtered = await searchProductsWithVariants(filtered, searchQuery, filtered.length);
    // Also include genre matches (not in unified component)
    const queryLower = searchQuery.toLowerCase();
    const genreMatches = allProductsList.filter(p =>
      p.genre?.toLowerCase().includes(queryLower) &&
      !filtered.some(f => f.id === p.id)
    );
    filtered = [...filtered, ...genreMatches];
  } else if (searchQuery && searchQuery.length === 1) {
    // For single character, do simple includes search
    const queryLower = searchQuery.toLowerCase();
    filtered = filtered.filter(product =>
      product.title?.toLowerCase().includes(queryLower) ||
      product.alt?.toLowerCase().includes(queryLower) ||
      product.key_word?.toLowerCase().includes(queryLower) ||
      product.genre?.toLowerCase().includes(queryLower)
    );
  }

  // Status filter
  if (statusFilter) {
    filtered = filtered.filter(p => p.status === statusFilter);
  }

  // Genre filter
  if (genreFilter) {
    filtered = filtered.filter(p => p.genre === genreFilter);
  }

  // Type filter
  if (typeFilter) {
    filtered = filtered.filter(p => p.type === typeFilter);
  }

  // Fields filter
  if (fieldsFilter) {
    filtered = filtered.filter(p => {
      switch (fieldsFilter) {
        case 'has-alt': return p.alt && p.alt.trim() !== '';
        case 'no-alt': return !p.alt || p.alt.trim() === '';
        case 'has-keywords': return p.key_word && p.key_word.trim() !== '';
        case 'no-keywords': return !p.key_word || p.key_word.trim() === '';
        case 'has-url': return p.slug && p.slug.trim() !== '';
        case 'no-url': return !p.slug || p.slug.trim() === '';
        case 'has-description': return p.description && p.description.trim() !== '';
        case 'no-description': return !p.description || p.description.trim() === '';
        case 'has-ip-names': return p.ip_names && p.ip_names.trim() !== '';
        case 'no-ip-names': return !p.ip_names || p.ip_names.trim() === '';
        default: return true;
      }
    });
  }

  // Completeness sort — exclude statuses that don't use completeness
  if (sortCompleteness) {
    const manuallyCompleteIds = getManuallyCompleteIds();
    filtered = [...filtered].sort((a, b) => {
      // Products without completeness always sort last
      const aExcluded = NO_COMPLETENESS_STATUSES.has(a.status) || manuallyCompleteIds.has(a.id);
      const bExcluded = NO_COMPLETENESS_STATUSES.has(b.status) || manuallyCompleteIds.has(b.id);
      if (aExcluded && bExcluded) return 0;
      if (aExcluded) return 1;
      if (bExcluded) return -1;
      const pa = calculateProductCompleteness(a).percent;
      const pb = calculateProductCompleteness(b).percent;
      return sortCompleteness === 'asc' ? pa - pb : pb - pa;
    });
  }

  const hasActiveFilters = !!(searchQuery || statusFilter || genreFilter || typeFilter || fieldsFilter || sortCompleteness);
  renderProductsList(filtered, hasActiveFilters);
}

function resetProductFilters() {
  document.getElementById('products-search').value = '';
  document.getElementById('filter-status').value = '';
  document.getElementById('filter-genre').value = '';
  document.getElementById('filter-type').value = '';
  document.getElementById('filter-fields').value = '';
  const sortEl = document.getElementById('sort-completeness');
  if (sortEl) sortEl.value = '';

  // Remove active state from filters
  document.querySelectorAll('.filter-select').forEach(el => {
    el.removeAttribute('data-active');
  });

  renderProductsList(allProductsList, false);
}

// Track whether we're showing the full (unfiltered) list
let isFilteredView = false;

// Sortable instances
let productSortableInstance = null;
let groupSortableInstances = []; // inner sortables for within-group ordering

/**
 * Render insertion zone for adding products between existing products (desktop only)
 * @param {number} position - The position index where the product will be inserted
 */
function renderInsertionZone(position) {
  return `
    <div class="product-insertion-zone" data-position="${position}">
      <div class="product-insertion-line"></div>
      <button class="product-insertion-btn" data-action="insert-product-at-position" data-position="${position}" title="Добавить товар здесь">+</button>
    </div>
  `;
}

// Statuses that don't use the completeness counter
const NO_COMPLETENESS_STATUSES = new Set(['test', 'custom']);

// LocalStorage key for manually-marked-complete products
const MANUALLY_COMPLETE_KEY = 'tr-bute-manually-complete';

function getManuallyCompleteIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(MANUALLY_COMPLETE_KEY) || '[]'));
  } catch { return new Set(); }
}

function toggleManuallyComplete(productId) {
  const ids = getManuallyCompleteIds();
  if (ids.has(productId)) {
    ids.delete(productId);
  } else {
    ids.add(productId);
  }
  localStorage.setItem(MANUALLY_COMPLETE_KEY, JSON.stringify([...ids]));
}

/**
 * Calculate product completeness score (0-100%)
 * Fields depend on product type and status.
 */
function calculateProductCompleteness(product) {
  const isOriginal = product.type === 'оригинал';
  const isFirm = product.type === 'фирменный';
  const isComingSoon = product.status === 'coming_soon';
  const fields = [
    { fn: p => p.title && p.title.trim() },
    { fn: p => p.alt && p.alt.trim(),           skip: isOriginal || isComingSoon },
    { fn: p => p.keywords && p.keywords.trim() },
    { fn: p => p.ip_names && p.ip_names.trim() },
    { fn: p => p.slug && p.slug.trim() },
    { fn: p => p.description && p.description.trim(), skip: isOriginal || isComingSoon },
    { fn: p => p.author && p.author.trim(),      skip: isOriginal },
    { fn: p => p.release_date,                   skip: isComingSoon },
    { fn: p => p.development_time,               skip: isOriginal || isComingSoon },
    { fn: p => Array.isArray(p.catalog_ids) ? p.catalog_ids.length > 0 : (p.catalog_ids && p.catalog_ids !== '[]'), skip: isOriginal || isFirm },
    { fn: p => p.image },
    { fn: p => p.vk_market_url && p.vk_market_url.trim() },
  ];
  const active = fields.filter(f => !f.skip);
  const total = active.length;
  const filled = active.filter(f => f.fn(product)).length;
  return { filled, total, percent: Math.round((filled / total) * 100) };
}

function getCompletenessBadgeStyle(percent) {
  if (percent >= 100) return 'background:#1b5e20;color:#81c784;border:1px solid #388e3c;';
  if (percent >= 70) return 'background:#4a3800;color:#ffd54f;border:1px solid #f9a825;';
  return 'background:#5c1515;color:#ef9a9a;border:1px solid #c62828;';
}

function renderCompletenessPanel(product) {
  const isOriginal = product.type === 'оригинал';
  const isFirm = product.type === 'фирменный';
  const isComingSoon = product.status === 'coming_soon';
  const { percent } = calculateProductCompleteness(product);
  const barColor = percent >= 100 ? '#388e3c' : percent >= 70 ? '#f9a825' : '#c62828';

  const fields = [
    { label: 'Название',       ok: !!(product.title && product.title.trim()) },
    { label: 'Alt текст',      ok: !!(product.alt && product.alt.trim()),           skip: isOriginal || isComingSoon },
    { label: 'Ключевые слова', ok: !!(product.keywords && product.keywords.trim()) },
    { label: 'IP-названия',    ok: !!(product.ip_names && product.ip_names.trim()) },
    { label: 'URL',            ok: !!(product.slug && product.slug.trim()) },
    { label: 'Описание',       ok: !!(product.description && product.description.trim()), skip: isOriginal || isComingSoon },
    { label: 'Авторы',         ok: !!(product.author && product.author.trim()),      skip: isOriginal },
    { label: 'Дата релиза',    ok: !!product.release_date,                          skip: isComingSoon },
    { label: 'Время разр.',    ok: !!product.development_time,                      skip: isOriginal || isComingSoon },
    { label: 'В каталоге',     ok: Array.isArray(product.catalog_ids) ? product.catalog_ids.length > 0 : !!(product.catalog_ids && product.catalog_ids !== '[]'), skip: isOriginal || isFirm },
    { label: 'Изображение',    ok: !!product.image },
    { label: 'VK Market',      ok: !!(product.vk_market_url && product.vk_market_url.trim()) },
  ];

  return `
    <div style="padding: 8px 12px 10px; border-top: 1px solid var(--border-color);">
      <div style="height: 4px; background: var(--border-color); border-radius: 2px; margin-bottom: 8px; overflow: hidden;">
        <div style="height: 100%; width: ${percent}%; background: ${barColor}; border-radius: 2px;"></div>
      </div>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px 6px;">
        ${fields.filter(f => !f.skip).map(f => `
          <div style="display: flex; align-items: center; gap: 4px; font-size: 11px; color: ${f.ok ? 'var(--text-secondary)' : 'var(--text-tertiary)'};">
            <span style="width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; background: ${f.ok ? '#388e3c' : '#c62828'};"></span>
            ${f.label}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderProductItemHTML(product, inGroup = false) {
  let statusBadge = '';
  if (product.status === 'coming_soon') {
    statusBadge = '<span style="padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; background: var(--warning-muted, #ffeaa7); color: var(--warning, #fdcb6e); font-weight: 500; margin-left: 8px;">Скоро</span>';
  } else if (product.status === 'not_for_sale') {
    statusBadge = '<span style="padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; background: rgba(255, 107, 107, 0.2); color: #ff6b6b; font-weight: 500; margin-left: 8px;">Не в продаже</span>';
  } else if (product.status === 'custom') {
    statusBadge = '<span style="padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; background: rgba(155, 89, 182, 0.2); color: #9b59b6; font-weight: 500; margin-left: 8px;">Custom</span>';
  } else if (product.status === 'test') {
    statusBadge = '<span style="padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; background: var(--text-tertiary-bg, #e1e8ed); color: var(--text-tertiary, #657786); font-weight: 500; margin-left: 8px;">Тест</span>';
  }

  const hasBrokenImage = productHasBrokenImage(product);
  const isDeleted = product.status === 'not_for_sale';
  const productClass = [
    'product-item',
    hasBrokenImage ? 'has-broken-image' : '',
    isDeleted ? 'product-item--deleted' : '',
    inGroup ? 'product-item--in-group' : ''
  ].filter(Boolean).join(' ');

  const skipCompleteness = NO_COMPLETENESS_STATUSES.has(product.status);
  const manuallyComplete = getManuallyCompleteIds().has(product.id);

  const completeness = calculateProductCompleteness(product);
  const badgeStyle = getCompletenessBadgeStyle(completeness.percent);

  let completenessBadgeHTML = '';
  if (manuallyComplete) {
    completenessBadgeHTML = '<span style="padding: 1px 7px; border-radius: 20px; font-size: 0.7rem; font-weight: 700; background:#1b5e20;color:#81c784;border:1px solid #388e3c;" title="Отмечен как завершённый вручную">✓</span>';
  } else if (!skipCompleteness) {
    completenessBadgeHTML = `<span style="padding: 1px 7px; border-radius: 20px; font-size: 0.7rem; font-weight: 700; ${badgeStyle}">${completeness.filled}/${completeness.total}</span>`;
  }

  const dragHandleHTML = inGroup
    ? `<div class="drag-handle product-item-inner-handle" title="Порядок внутри группы" style="cursor: grab; font-size: 1rem; color: var(--text-tertiary); display: flex; align-items: center; opacity: 0.6;">⋮⋮</div>`
    : `<div class="drag-handle" style="cursor: grab; font-size: 1.2rem; color: var(--text-tertiary); display: flex; align-items: center;">☰</div>`;

  return `
    <div class="${productClass}" data-product-id="${product.id}" data-is-manual="${product.is_manual_sort !== false}" data-completeness="${completeness.percent}" style="background: var(--bg-secondary); border-radius: var(--radius-md); margin-bottom: var(--spacing-sm); overflow: hidden; position: relative;">
      <div class="product-item-row" style="padding: var(--spacing-md);">
        ${dragHandleHTML}
        <div style="position: relative; flex-shrink: 0;">
          <img src="${addImageSize(product.image) || 'https://placeholder.com/60'}" alt="${product.title}" style="width: 60px; height: 60px; object-fit: cover; border-radius: var(--radius-sm); display: block;">
          ${hasBrokenImage ? '<div class="image-health-badge broken" title="Изображение не загружается"></div>' : ''}
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; margin-bottom: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
            ${product.title}${statusBadge}
            ${hasBrokenImage ? '<span style="padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; background: var(--error-bg); color: var(--error); font-weight: 500;">⚠️ Нет изображения</span>' : ''}
          </div>
          <div style="display: flex; align-items: center; gap: 8px; margin-top: 2px;">
            ${product.price ? `<span style="font-size: 0.875rem; color: var(--text-secondary);">${formatNumber(product.price)}₽</span>` : ''}
            ${completenessBadgeHTML}
          </div>
        </div>
        <div class="product-item-actions">
          <button class="collapse-toggle-btn" data-action="toggle-product-completeness" data-product-id="${product.id}" title="Заполненность полей">
            <svg class="collapse-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
          <button class="btn btn-secondary btn-xs" data-action="toggle-product-complete" data-product-id="${product.id}" title="${manuallyComplete ? 'Снять отметку завершённого' : 'Отметить как завершённый'}" style="opacity: ${manuallyComplete ? '1' : '0.4'};">✓</button>
          <button class="btn btn-secondary btn-xs" data-action="edit-product" data-product-id="${product.id}" title="Редактировать">✎</button>
          <button class="btn btn-danger btn-xs" data-action="delete-product" data-product-id="${product.id}" title="Удалить (установить статус 'Не в продаже')">🗑</button>
        </div>
      </div>
      <div id="product-completeness-${product.id}" style="display: none;">
        ${renderCompletenessPanel(product)}
      </div>
    </div>
  `;
}

function toggleProductCompletenessPanel(productId) {
  const panel = document.getElementById(`product-completeness-${productId}`);
  const arrow = document.querySelector(`[data-action="toggle-product-completeness"][data-product-id="${productId}"] .collapse-arrow`);
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  if (arrow) arrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
}

function renderProductsList(products, filtered = false) {
  const container = document.getElementById('products-list');
  if (!container) return;
  isFilteredView = filtered;

  if (!Array.isArray(products) || products.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon"></div><h3>Товаров нет</h3></div>`;
    return;
  }

  // Destroy previous sortables
  if (productSortableInstance) {
    productSortableInstance.destroy();
    productSortableInstance = null;
  }
  groupSortableInstances.forEach(s => s.destroy());
  groupSortableInstances = [];

  if (filtered) {
    // Filtered view: no sections, no grouping
    container.innerHTML = products.map(p => renderProductItemHTML(p)).join('');
    initSwipeGestures(container);
    return;
  }

  // Full view: show manual, deleted (collapsible), and alphabetical sections
  const deletedProducts = products.filter(p => p.status === 'not_for_sale');
  const activeProducts = products.filter(p => p.status !== 'not_for_sale');
  const manualProducts = activeProducts.filter(p => p.is_manual_sort !== false);
  const alphaProducts = activeProducts.filter(p => p.is_manual_sort === false);

  // Count items in each section (groups count as 1 item each)
  const manualItems = buildSortItemList(manualProducts);
  const alphaItems = buildSortItemList(alphaProducts);

  let html = '';

  // Section label for manual
  if (manualItems.length > 0) {
    html += `<div class="sort-section-label" style="padding: 4px 12px; font-size: 0.75rem; color: var(--text-tertiary); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Ручная сортировка (${manualItems.length})</div>`;
  }

  // Add insertion zone at the beginning of manual section (desktop only)
  html += renderInsertionZone(0);

  // Render manual sort items with insertion zones between them
  manualItems.forEach((item, index) => {
    html += renderSortItem(item);
    html += renderInsertionZone(index + 1);
  });

  // Collapsible deleted products section
  if (deletedProducts.length > 0) {
    html += `
      <details class="deleted-products-section" style="margin: 8px 0;">
        <summary style="display: flex; align-items: center; gap: var(--spacing-sm); padding: 8px 12px; font-size: 0.75rem; color: var(--text-tertiary); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; cursor: pointer; user-select: none; list-style: none;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" class="details-arrow" style="transition: transform 0.2s;">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
          Не в продаже (${deletedProducts.length})
        </summary>
        <div style="margin-top: 4px;">
          ${deletedProducts.map(p => renderProductItemHTML(p)).join('')}
        </div>
      </details>
    `;
  }

  // Divider between deleted/manual and alphabetical sections
  html += `
    <div class="sort-section-divider" data-divider="true" style="display: flex; align-items: center; gap: var(--spacing-sm); padding: 12px 0; margin: 4px 0; user-select: none;">
      <div style="flex: 1; height: 1px; background: var(--border-color);"></div>
      <span style="font-size: 0.75rem; color: var(--text-tertiary); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap;">По алфавиту (${alphaItems.length})</span>
      <div style="flex: 1; height: 1px; background: var(--border-color);"></div>
    </div>
  `;

  html += alphaItems.map(item => renderSortItem(item)).join('');

  container.innerHTML = html;

  // Rotate the arrow icon when details is open
  const detailsEl = container.querySelector('.deleted-products-section');
  if (detailsEl) {
    const arrow = detailsEl.querySelector('.details-arrow');
    detailsEl.addEventListener('toggle', () => {
      if (arrow) arrow.style.transform = detailsEl.open ? 'rotate(90deg)' : '';
    });
  }

  // Initialize SortableJS with section + group support
  initProductSortable(container);

  // Initialize swipe gesture on product items (including those inside groups)
  initSwipeGestures(container);
}

/**
 * Build a list of sort items from a flat product array.
 * Linked products are collapsed into single group items.
 * Preserves the outer sort_order sequence (first encountered group member defines group position).
 */
function buildSortItemList(products) {
  const renderedGroupIds = new Set();
  const items = [];

  for (const product of products) {
    const groupId = productToGroupId.get(product.id);
    if (groupId !== undefined && !renderedGroupIds.has(groupId)) {
      renderedGroupIds.add(groupId);
      // Get all group members sorted by product_link_items.sort_order, filtered to those in this section
      const groupMemberIds = (groupsById.get(groupId) || []).map(g => g.product_id);
      const groupProducts = groupMemberIds
        .map(pid => products.find(p => p.id === pid))
        .filter(Boolean);

      if (groupProducts.length >= 2) {
        items.push({ type: 'group', groupId, products: groupProducts });
      } else if (groupProducts.length === 1) {
        items.push({ type: 'product', product: groupProducts[0] });
      }
    } else if (groupId === undefined) {
      items.push({ type: 'product', product });
    }
    // If groupId is defined and already rendered, skip (part of already-added group)
  }

  return items;
}

/**
 * Render a sort item: either a standalone product or a group container.
 */
function renderSortItem(item) {
  if (item.type === 'product') {
    return renderProductItemHTML(item.product);
  }
  return renderProductGroupHTML(item.groupId, item.products);
}

/**
 * Render a linked product group container with left border visual indicator.
 * The group has a single outer drag handle for moving the whole group,
 * and each product inside has an inner drag handle for within-group reordering.
 */
function renderProductGroupHTML(groupId, products) {
  const isManual = products[0]?.is_manual_sort !== false;
  const itemsHTML = products.map(p => renderProductItemHTML(p, true)).join('');

  return `
    <div class="product-group" data-group-id="${groupId}" data-is-manual="${isManual}">
      <div class="product-group-handle drag-handle" title="Переместить группу">☰</div>
      <div class="product-group-items" data-group-items="${groupId}">
        ${itemsHTML}
      </div>
    </div>
  `;
}

/**
 * Expand all outer sort items (groups + products) in a container into flat product ID arrays.
 * Respects within-group DOM order for group members.
 */
function expandSortItemsToIds(container) {
  const manualIds = [];
  const alphabeticalIds = [];
  let pastDivider = false;

  const children = container.children;
  for (const el of children) {
    if (el.dataset.divider === 'true') {
      pastDivider = true;
      continue;
    }

    // Skip non-sortable elements (section labels, insertion zones, deleted sections)
    if (el.classList.contains('product-group')) {
      // Expand group: read within-group DOM order
      const ids = [...el.querySelectorAll('.product-item[data-product-id]')]
        .map(item => parseInt(item.dataset.productId))
        .filter(Boolean);
      if (pastDivider) alphabeticalIds.push(...ids);
      else manualIds.push(...ids);
    } else if (el.classList.contains('product-item') && !el.classList.contains('product-item--deleted')) {
      const id = parseInt(el.dataset.productId);
      if (id) {
        if (pastDivider) alphabeticalIds.push(id);
        else manualIds.push(id);
      }
    }
  }

  return { manualIds, alphabeticalIds };
}

/**
 * Initialize SortableJS for the product list with section and group support.
 * Outer sortable drags groups (.product-group) and ungrouped products.
 * Inner sortables handle within-group reordering for each group.
 */
function initProductSortable(container) {
  if (!window.Sortable || !container) return;

  // Outer sortable: moves groups and ungrouped products
  productSortableInstance = new Sortable(container, {
    animation: 150,
    handle: '.drag-handle:not(.product-item-inner-handle)',
    ghostClass: 'sortable-ghost',
    draggable: '.product-group, .product-item:not(.product-item--in-group):not(.product-item--deleted)',
    onEnd: async function () {
      const { manualIds, alphabeticalIds } = expandSortItemsToIds(container);

      try {
        const response = await apiPost('/api/products/reorder', {
          manual_ids: manualIds,
          alphabetical_ids: alphabeticalIds
        });

        if (!response.ok) throw new Error('Failed to reorder');

        // Update local array to match new order and section flags
        const idToProduct = {};
        allProductsList.forEach(p => { idToProduct[p.id] = p; });

        const newList = [];
        manualIds.forEach((id, i) => {
          const p = idToProduct[id];
          if (p) { p.is_manual_sort = true; p.sort_order = i; newList.push(p); }
        });
        alphabeticalIds.forEach((id, i) => {
          const p = idToProduct[id];
          if (p) { p.is_manual_sort = false; p.sort_order = manualIds.length + i; newList.push(p); }
        });

        allProductsList.forEach(p => { if (!newList.includes(p)) newList.push(p); });
        allProductsList = newList;

        renderProductsList(allProductsList, isFilteredView);
        showToast('Порядок обновлен', 'success');
      } catch (error) {
        console.error('Error reordering:', error);
        showToast('Ошибка при изменении порядка', 'error');
        loadProductsList();
      }
    }
  });

  // Inner sortables: within-group reordering
  container.querySelectorAll('.product-group-items').forEach(groupItemsEl => {
    const groupId = parseInt(groupItemsEl.dataset.groupItems);
    if (!groupId) return;

    const innerSortable = new Sortable(groupItemsEl, {
      animation: 150,
      handle: '.product-item-inner-handle',
      ghostClass: 'sortable-ghost',
      draggable: '.product-item',
      onEnd: async function () {
        const orderedIds = [...groupItemsEl.querySelectorAll('.product-item[data-product-id]')]
          .map(el => parseInt(el.dataset.productId))
          .filter(Boolean);

        try {
          const response = await apiPost('/api/products/links/reorder', {
            group_id: groupId,
            ordered_product_ids: orderedIds
          });

          if (!response.ok) throw new Error('Failed to reorder group');

          // Update local groupsById to reflect new order
          const groupItems = groupsById.get(groupId);
          if (groupItems) {
            const idToItem = new Map(groupItems.map(g => [g.product_id, g]));
            orderedIds.forEach((pid, i) => {
              const item = idToItem.get(pid);
              if (item) item.sort_order = i;
            });
            groupItems.sort((a, b) => a.sort_order - b.sort_order);
          }

          // Sync outer products.sort_order to reflect new within-group order
          const { manualIds, alphabeticalIds } = expandSortItemsToIds(container);
          const outerResponse = await apiPost('/api/products/reorder', {
            manual_ids: manualIds,
            alphabetical_ids: alphabeticalIds
          });
          if (!outerResponse.ok) throw new Error('Failed to sync outer order');

          const idToProduct = {};
          allProductsList.forEach(p => { idToProduct[p.id] = p; });
          manualIds.forEach((id, i) => {
            const p = idToProduct[id];
            if (p) { p.is_manual_sort = true; p.sort_order = i; }
          });
          alphabeticalIds.forEach((id, i) => {
            const p = idToProduct[id];
            if (p) { p.is_manual_sort = false; p.sort_order = manualIds.length + i; }
          });

          showToast('Порядок в группе обновлен', 'success');
        } catch (error) {
          console.error('Error reordering group:', error);
          showToast('Ошибка при изменении порядка в группе', 'error');
          loadProductsList();
        }
      }
    });

    groupSortableInstances.push(innerSortable);
  });
}

/**
 * Update the section labels after reorder without full re-render
 */
function updateSectionLabels(container, manualCount, alphaCount) {
  const sectionLabel = container.querySelector('.sort-section-label');
  if (sectionLabel) {
    sectionLabel.textContent = `Ручная сортировка (${manualCount})`;
  }
  const divider = container.querySelector('.sort-section-divider span');
  if (divider) {
    divider.textContent = `По алфавиту (${alphaCount})`;
  }
}

// ============================================================================
// SWIPE GESTURE: Swipe right on a product item to switch sections
// Works on both touch (mobile) and mouse (desktop)
// Groups: swiping any product in a group moves the entire group
// ============================================================================

function initSwipeGestures(container) {
  // Attach swipe to all non-deleted product items (including in-group ones)
  const items = container.querySelectorAll('.product-item:not(.product-item--deleted)');

  items.forEach(item => {
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let isSwiping = false;

    // The swipeable visual element: for in-group items it's the item itself,
    // for standalone items it's also the item.
    const swipeEl = item;

    function onSwipeStart(clientX, clientY) {
      startX = clientX;
      startY = clientY;
      currentX = 0;
      isSwiping = false;
    }

    function onSwipeMove(clientX, clientY) {
      if (startX === 0) return;

      const deltaX = clientX - startX;
      const deltaY = Math.abs(clientY - startY);

      if (deltaY > 30 && !isSwiping) {
        startX = 0;
        return;
      }

      if (deltaX > 10) {
        isSwiping = true;
        currentX = Math.min(deltaX, 100);
        swipeEl.style.transform = `translateX(${currentX}px)`;
        swipeEl.style.transition = 'none';

        swipeEl.style.background = currentX > 60
          ? 'var(--accent-muted, rgba(0, 122, 255, 0.1))'
          : 'var(--bg-secondary)';
      }
    }

    // Returns true if a swipe action was triggered (to allow preventDefault on touchend)
    function onSwipeEnd() {
      if (!isSwiping) {
        startX = 0;
        return false;
      }

      swipeEl.style.transition = 'transform 0.2s ease, background 0.2s ease';
      swipeEl.style.transform = '';
      swipeEl.style.background = 'var(--bg-secondary)';

      const triggered = currentX > 60;
      if (triggered) {
        const productId = parseInt(item.dataset.productId);
        const isManual = item.dataset.isManual === 'true';
        if (productId) {
          showSortSectionModal(productId, isManual);
        }
      }

      startX = 0;
      currentX = 0;
      isSwiping = false;
      return triggered;
    }

    function onSwipeCancel() {
      swipeEl.style.transition = 'transform 0.2s ease, background 0.2s ease';
      swipeEl.style.transform = '';
      swipeEl.style.background = 'var(--bg-secondary)';
      startX = 0;
      currentX = 0;
      isSwiping = false;
    }

    // Touch events (mobile)
    item.addEventListener('touchstart', (e) => {
      if (e.target.closest('.drag-handle') || e.target.closest('button')) return;
      onSwipeStart(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    item.addEventListener('touchmove', (e) => {
      onSwipeMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    item.addEventListener('touchend', (e) => {
      const triggered = onSwipeEnd();
      // Prevent the ghost click that would otherwise fire on the modal overlay
      if (triggered) e.preventDefault();
    });

    item.addEventListener('touchcancel', onSwipeCancel);

    // Mouse events (desktop)
    item.addEventListener('mousedown', (e) => {
      if (e.target.closest('.drag-handle') || e.target.closest('button')) return;
      if (e.button !== 0) return;
      onSwipeStart(e.clientX, e.clientY);

      // Prevent text selection during the entire potential swipe
      document.body.style.userSelect = 'none';

      const onMouseMove = (e) => {
        onSwipeMove(e.clientX, e.clientY);
      };

      const onMouseUp = () => {
        document.body.style.userSelect = '';
        onSwipeEnd();
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  });

  // Group-level swipe: swipe on .product-group (outside individual items) to move the whole group.
  container.querySelectorAll('.product-group').forEach(groupEl => {
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let isSwiping = false;

    function onGroupSwipeStart(clientX, clientY) {
      startX = clientX;
      startY = clientY;
      currentX = 0;
      isSwiping = false;
    }

    function onGroupSwipeMove(clientX, clientY) {
      if (startX === 0) return;
      const deltaX = clientX - startX;
      const deltaY = Math.abs(clientY - startY);
      if (deltaY > 30 && !isSwiping) { startX = 0; return; }
      if (deltaX > 10) {
        isSwiping = true;
        currentX = Math.min(deltaX, 100);
        groupEl.style.transform = `translateX(${currentX}px)`;
        groupEl.style.transition = 'none';
        groupEl.style.background = currentX > 60
          ? 'var(--accent-muted, rgba(0, 122, 255, 0.1))'
          : '';
      }
    }

    function onGroupSwipeEnd() {
      if (!isSwiping) { startX = 0; return false; }
      groupEl.style.transition = 'transform 0.2s ease, background 0.2s ease';
      groupEl.style.transform = '';
      groupEl.style.background = '';
      const triggered = currentX > 60;
      if (triggered) {
        const groupId = parseInt(groupEl.dataset.groupId);
        const isManual = groupEl.dataset.isManual === 'true';
        const groupItems = groupsById.get(groupId);
        if (groupItems && groupItems.length > 0) {
          showSortSectionModal(groupItems[0].product_id, isManual);
        }
      }
      startX = 0;
      currentX = 0;
      isSwiping = false;
      return triggered;
    }

    function onGroupSwipeCancel() {
      groupEl.style.transition = 'transform 0.2s ease, background 0.2s ease';
      groupEl.style.transform = '';
      groupEl.style.background = '';
      startX = 0;
      currentX = 0;
      isSwiping = false;
    }

    groupEl.addEventListener('touchstart', (e) => {
      if (e.target.closest('.product-item') || e.target.closest('button')) return;
      onGroupSwipeStart(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    groupEl.addEventListener('touchmove', (e) => {
      onGroupSwipeMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    groupEl.addEventListener('touchend', (e) => {
      const triggered = onGroupSwipeEnd();
      if (triggered) e.preventDefault();
    });

    groupEl.addEventListener('touchcancel', onGroupSwipeCancel);

    groupEl.addEventListener('mousedown', (e) => {
      if (e.target.closest('.product-item') || e.target.closest('button')) return;
      if (e.button !== 0) return;
      onGroupSwipeStart(e.clientX, e.clientY);
      document.body.style.userSelect = 'none';
      const onMouseMove = (e) => onGroupSwipeMove(e.clientX, e.clientY);
      const onMouseUp = () => {
        document.body.style.userSelect = '';
        onGroupSwipeEnd();
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  });
}

// ============================================================================
// MODAL: Move product (or its group) between sections
// ============================================================================

function showSortSectionModal(productId, isCurrentlyManual) {
  const product = allProductsList.find(p => p.id === productId);
  if (!product) return;

  // Check if this product belongs to a link group
  const groupId = productToGroupId.get(productId);
  const groupItems = groupId ? (groupsById.get(groupId) || []) : null;
  const isGroupMove = groupItems && groupItems.length >= 2;

  const subjectLabel = isGroupMove
    ? `<strong>${product.title}</strong> <span style="color: var(--text-tertiary); font-size: 0.85em;">(группа из ${groupItems.length} товаров)</span>`
    : `<strong>${product.title}</strong>`;

  if (isCurrentlyManual) {
    showModal('Сортировка', `
      <div style="padding: var(--spacing-md) 0;">
        <p style="margin-bottom: var(--spacing-sm);">${subjectLabel}</p>
        <p style="line-height: 1.6;">
          ${isGroupMove
            ? `Разместить всю группу (${groupItems.length} товара) по алфавиту? Группа будет перемещена в алфавитную секцию.`
            : 'Разместить товар по алфавиту? Товар будет перемещён в алфавитную секцию и расположен в порядке 0-9, А-Я, A-Z.'}
        </p>
      </div>
    `, [
      { text: 'Отмена', className: 'btn btn-secondary', onClick: () => hideModal() },
      {
        text: 'По алфавиту',
        className: 'btn btn-primary',
        onClick: async () => {
          hideModal();
          await moveProductToSection(productId, 'alphabetical', groupId);
        }
      }
    ]);
  } else {
    showModal('Сортировка', `
      <div style="padding: var(--spacing-md) 0;">
        <p style="margin-bottom: var(--spacing-sm);">${subjectLabel}</p>
        <p style="line-height: 1.6;">
          ${isGroupMove
            ? `Переместить всю группу (${groupItems.length} товара) в ручную секцию? Группа будет добавлена в конец ручной сортировки.`
            : 'Переместить товар в ручную секцию? Товар будет добавлен в конец ручной сортировки.'}
        </p>
      </div>
    `, [
      { text: 'Отмена', className: 'btn btn-secondary', onClick: () => hideModal() },
      {
        text: 'В ручную',
        className: 'btn btn-primary',
        onClick: async () => {
          hideModal();
          await moveProductToSection(productId, 'manual', groupId);
        }
      }
    ]);
  }
}

async function moveProductToSection(productId, section, groupId = null) {
  try {
    showToast('Перемещение...', 'info');

    const body = groupId
      ? { group_id: groupId, section }
      : { product_id: productId, section };

    const response = await apiPost('/api/products/set-sort-section', body);

    if (!response.ok) throw new Error('Failed to move product');

    showToast(
      section === 'alphabetical' ? 'Перемещено в алфавитную секцию' : 'Перемещено в ручную секцию',
      'success'
    );

    await loadProductsList();
  } catch (error) {
    console.error('Error moving product:', error);
    showToast('Ошибка при перемещении', 'error');
    loadProductsList();
  }
}

async function moveProduct(productId, direction) {
  const currentIndex = allProductsList.findIndex(p => p.id === productId);
  if (currentIndex === -1) return;

  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= allProductsList.length) return;

  // Swap in local array
  const temp = allProductsList[currentIndex];
  allProductsList[currentIndex] = allProductsList[targetIndex];
  allProductsList[targetIndex] = temp;

  // Update sort_order on backend
  try {
    await apiPost('/api/products/reorder', {
      product_id: productId,
      new_position: targetIndex
    });

    renderProductsList(allProductsList, false);
    showToast('Порядок обновлен', 'success');
  } catch (error) {
    console.error('Error reordering product:', error);
    showToast('Ошибка при изменении порядка', 'error');
    loadProductsList();
  }
}


// ============================================================================
// IMAGE HEALTH CHECK
// ============================================================================

// Track image health results
let imageHealthResults = {};

/**
 * Verify all product images with rate-limited checking
 */
async function verifyAllProductImages() {
  const btn = document.getElementById('verify-images-btn');
  if (!btn) return;

  // Disable button and show loading state
  btn.classList.add('checking');
  const originalHTML = btn.innerHTML;
  btn.innerHTML = `
    <div class="spinner-icon"></div>
    <span>Проверка 0/${allProductsList.length}...</span>
  `;

  // Collect all unique image URLs from products
  const imageUrls = [];
  const productImageMap = {}; // Map URL to product IDs

  allProductsList.forEach(product => {
    if (product.image) {
      imageUrls.push(product.image);
      if (!productImageMap[product.image]) {
        productImageMap[product.image] = [];
      }
      productImageMap[product.image].push(product.id);
    }
  });

  try {
    // Check images with progress callback
    const results = await checkImageHealth(imageUrls, (current, total, url, isHealthy) => {
      // Update button text with progress
      btn.innerHTML = `
        <div class="spinner-icon"></div>
        <span>Проверка ${current}/${total}...</span>
      `;
    });

    // Store results
    imageHealthResults = results;

    // Count broken images
    const brokenCount = Object.values(results).filter(r => !r.healthy).length;
    const totalCount = Object.keys(results).length;

    // Re-render product list to show health indicators
    renderProductsList(allProductsList, isFilteredView);

    // Show summary toast
    if (brokenCount === 0) {
      showToast(`Проверка завершена: все изображения (${totalCount}) загружаются`, 'success');
    } else {
      showToast(`Проверка завершена: ${brokenCount} из ${totalCount} изображений не загружаются`, 'warning');
    }

  } catch (error) {
    console.error('Error verifying images:', error);
    showToast('Ошибка при проверке изображений', 'error');
  } finally {
    // Restore button
    btn.classList.remove('checking');
    btn.innerHTML = originalHTML;
  }
}

/**
 * Check if a product has broken images based on cached results
 */
function productHasBrokenImage(product) {
  if (!product.image) return false;

  const cached = getCachedImageHealth(product.image);
  return cached === false;
}

// ============================================================================
// DELETE PRODUCT
// ============================================================================

async function deleteProduct(productId) {
  const product = allProductsList.find(p => p.id === productId);
  const productTitle = product ? product.title : 'товар';

  showModal('Удалить товар?', `
    <p style="color: var(--text-secondary); margin-bottom: var(--spacing-md);">
      Вы уверены, что хотите удалить "<strong>${productTitle}</strong>"?
    </p>
    <p style="color: var(--text-tertiary); font-size: 0.875rem;">
      Статус товара будет изменен на "Не в продаже".
    </p>
  `, [
    {
      text: 'Отмена',
      className: 'btn btn-secondary',
      onClick: hideModal
    },
    {
      text: 'Удалить',
      className: 'btn btn-danger',
      onClick: async () => {
        hideModal();
        try {
          const response = await apiPost('/api/products/update', {
            id: productId,
            status: 'not_for_sale'
          });

          const data = await response.json();

          if (data.success) {
            showToast('Товар успешно удален (статус изменен на "Не в продаже")', 'success');
            // Refresh the products list
            await loadProductsList();
          } else {
            showError(data.error || 'Не удалось удалить товар');
          }
        } catch (err) {
          console.error('Error deleting product:', err);
          showError('Ошибка при удалении товара');
        }
      }
    }
  ]);
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function attachProductsEventListeners() {
  const content = document.getElementById('content');
  if (!content) return;

  const oldHandler = content._productsClickHandler;
  if (oldHandler) {
    content.removeEventListener('click', oldHandler);
  }

  const clickHandler = (e) => {
    const target = e.target;
    const action = target.dataset.action || target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    const productId = parseInt(target.dataset.productId || target.closest('[data-product-id]')?.dataset.productId);
    const catalogId = parseInt(target.dataset.catalogId || target.closest('[data-catalog-id]')?.dataset.catalogId);

    switch (action) {
      // Subtab switching
      case 'switch-products-subtab': {
        const subtab = target.dataset.subtab || target.closest('[data-subtab]')?.dataset.subtab;
        if (subtab && subtab !== currentSubtab) {
          // Check permission before switching
          if (!canAccessSubtab(subtab)) {
            showToast('Доступ к этому разделу ограничен', 'error');
            return;
          }
          currentSubtab = subtab;
          document.querySelectorAll('[data-action="switch-products-subtab"]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.subtab === currentSubtab);
          });
          loadProductsSubtabContent();
        }
        break;
      }
      case 'show-add-product-modal':
        initiateProductCreation();
        break;
      case 'toggle-product-completeness':
        if (productId) toggleProductCompletenessPanel(productId);
        break;
      case 'toggle-product-complete':
        if (productId) {
          toggleManuallyComplete(productId);
          renderProductsList(allProductsList, isFilteredView);
        }
        break;
      case 'edit-product':
        if (productId) editProduct(productId, allProductsList.find(p => p.id === productId) || null);
        break;
      case 'delete-product':
        if (productId) deleteProduct(productId);
        break;
      case 'reset-product-filters':
        resetProductFilters();
        break;
      case 'verify-product-images':
        verifyAllProductImages();
        break;
      case 'open-catalog-management':
        if (catalogId) openCatalogManagement(catalogId);
        break;
      case 'save-catalog-info':
        if (catalogId) saveCatalogInfo(catalogId);
        break;
      case 'add-product-to-catalog':
        if (productId && catalogId) addProductToCatalog(productId, catalogId);
        break;
      case 'remove-product-from-catalog':
        if (productId && catalogId) removeProductFromCatalog(productId, catalogId);
        break;
      case 'save-catalog-products':
        if (catalogId) saveCatalogProductChanges(catalogId);
        break;
      case 'create-catalog':
        showCreateCatalogModal();
        break;
      case 'refresh-products':
        refreshProducts();
        break;
      case 'insert-product-at-position': {
        const position = parseInt(target.dataset.position || target.closest('[data-position]')?.dataset.position);
        if (position !== undefined && position !== null) {
          insertProductAtPosition(position);
        }
        break;
      }
      case 'create-from-template': {
        const templateId = parseInt(target.dataset.templateId || target.closest('[data-template-id]')?.dataset.templateId);
        if (templateId) createFromTemplate(templateId);
        break;
      }
      case 'delete-template': {
        const templateId = parseInt(target.dataset.templateId || target.closest('[data-template-id]')?.dataset.templateId);
        if (templateId) deleteTemplateWithConfirm(templateId);
        break;
      }
      case 'rename-template': {
        const templateId = parseInt(target.dataset.templateId || target.closest('[data-template-id]')?.dataset.templateId);
        if (templateId) renameTemplate(templateId);
        break;
      }
      case 'create-template':
        showAddProductModal(true); // Pass true to indicate this is a template
        break;
      case 'show-subtab-help': {
        const helpContent = {
          products: `
            <p style="margin-bottom: var(--spacing-md);">Товары — основной каталог магазина.</p>
            <ul style="color: var(--text-secondary); line-height: 1.8; padding-left: var(--spacing-lg);">
              <li><strong>+</strong> — создать новый товар</li>
              <li>Карандаш — открыть и редактировать товар</li>
              <li>Фильтры — искать по статусу, жанру, типу или заполненности полей</li>
              <li>Перетаскивание строки меняет порядок товаров</li>
              <li>Стрелки ↑↓ на мобильном тоже двигают товар</li>
            </ul>`,
          catalogs: `
            <p style="margin-bottom: var(--spacing-md);">Каталоги группируют товары в разделы магазина.</p>
            <ul style="color: var(--text-secondary); line-height: 1.8; padding-left: var(--spacing-lg);">
              <li><strong>+</strong> — создать новый каталог</li>
              <li>Нажмите на каталог — управление его товарами и настройки</li>
              <li>Перетаскивание строки меняет порядок каталогов</li>
              <li>Изменения состава товаров применяются только после нажатия «Сохранить состав»</li>
            </ul>`,
          templates: `
            <p style="margin-bottom: var(--spacing-md);">Шаблоны хранят готовые наборы полей для быстрого создания товаров.</p>
            <ul style="color: var(--text-secondary); line-height: 1.8; padding-left: var(--spacing-lg);">
              <li><strong>+</strong> — создать новый шаблон</li>
              <li><strong>Использовать</strong> — создать товар из шаблона с предзаполненными полями</li>
              <li>При редактировании любого товара можно сохранить его как шаблон кнопкой «Сохранить как шаблон»</li>
            </ul>`
        };
        const helpTitles = { products: 'Товары', catalogs: 'Каталоги', templates: 'Шаблоны' };
        showModal(
          helpTitles[currentSubtab] || 'Помощь',
          `<div style="padding: var(--spacing-sm) 0;">${helpContent[currentSubtab] || ''}</div>`,
          [{ text: 'Понятно', className: 'btn btn-primary', onClick: hideModal }]
        );
        break;
      }
    }
  };

  content._productsClickHandler = clickHandler;
  content.addEventListener('click', clickHandler);

  // Also attach to modal for catalog management actions
  const modal = document.getElementById('modal-overlay');
  if (modal && !modal._catalogClickHandler) {
    modal._catalogClickHandler = clickHandler;
    modal.addEventListener('click', clickHandler);
  }
}

// Exports
export {
  loadProducts,
  loadProducts as renderProductsView,
  loadProductsList,
  moveProduct,
  handlePostCreateInsertion,
  saveProductAsTemplate
};
