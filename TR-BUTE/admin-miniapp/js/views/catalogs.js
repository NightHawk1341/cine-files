/**
 * views/catalogs.js
 * Catalog management view for admin - create, edit, delete, reorder catalogs
 */

import { state, updateState } from '../state.js';
import { API_BASE, tg, isBrowserMode } from '../config.js';
import { requireAuth, showToast, showError, showModal, hideModal } from '../utils.js';
import { apiGet, apiPost } from '../utils/apiClient.js';

// Local state
let catalogs = [];
let sortableInstance = null;

/**
 * Load and render catalogs view
 */
async function loadCatalogsView() {
  requireAuth();
  const content = document.getElementById('content');

  content.innerHTML = `
    <div class="loading-spinner">
      <div class="spinner"></div>
      <p>Загрузка каталогов...</p>
    </div>
  `;

  try {
    await loadCatalogs();
    renderCatalogsContent();
    setupCatalogEvents();
  } catch (error) {
    console.error('Error loading catalogs:', error);
    content.innerHTML = `
      <div class="empty-state">
        <h3>Ошибка загрузки</h3>
        <p>Не удалось загрузить каталоги</p>
        <button class="btn btn-primary" data-action="reload-catalogs">Повторить</button>
      </div>
    `;
  }
}

/**
 * Fetch catalogs from API
 */
async function loadCatalogs() {
  const response = await apiGet('/api/catalogs');
  if (!response.ok) throw new Error('Failed to load catalogs');

  const data = await response.json();
  catalogs = Array.isArray(data) ? data : (data.catalogs || []);

  // Sort by sort_order
  catalogs.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

/**
 * Render catalogs content
 */
function renderCatalogsContent() {
  const content = document.getElementById('content');

  content.innerHTML = `
    <div class="catalogs-view">
      <div class="catalogs-header">
        <h2 class="card-title">Управление каталогами</h2>
        <button class="btn btn-primary" data-action="create-catalog">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          Создать каталог
        </button>
      </div>

      <div class="catalogs-info">
        <p style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: var(--spacing-md);">
          Перетащите каталоги для изменения порядка отображения на сайте.
        </p>
      </div>

      <div class="catalogs-list" id="catalogs-list">
        ${catalogs.length === 0 ? `
          <div class="empty-state">
            <p>Нет каталогов</p>
          </div>
        ` : catalogs.map((catalog, index) => renderCatalogItem(catalog, index)).join('')}
      </div>
    </div>
  `;

  // Initialize Sortable for drag-and-drop
  initSortable();
}

/**
 * Render a single catalog item
 */
function renderCatalogItem(catalog, index) {
  const productCount = catalog.product_ids
    ? catalog.product_ids.split(',').filter(id => id.trim()).length
    : 0;

  return `
    <div class="catalog-list-item" data-catalog-id="${catalog.id}" data-sort-order="${catalog.sort_order || index}">
      <div class="catalog-list-item-drag">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
          <line x1="4" y1="6" x2="20" y2="6"></line>
          <line x1="4" y1="12" x2="20" y2="12"></line>
          <line x1="4" y1="18" x2="20" y2="18"></line>
        </svg>
      </div>

      <div class="catalog-list-item-info">
        <div class="catalog-list-item-title">${catalog.title}</div>
        <div class="catalog-list-item-meta">
          <span class="catalog-list-item-genre">${catalog.genre || 'Без жанра'}</span>
          <span class="catalog-list-item-count">${productCount} товаров</span>
        </div>
        ${catalog.slug ? `<div class="catalog-list-item-slug">/${catalog.slug}</div>` : ''}
      </div>

      <div class="catalog-list-item-actions">
        <button class="btn btn-sm btn-secondary" data-action="edit-catalog" data-catalog-id="${catalog.id}" title="Редактировать">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="btn btn-sm btn-danger" data-action="delete-catalog" data-catalog-id="${catalog.id}" title="Удалить">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          </svg>
        </button>
      </div>
    </div>
  `;
}

/**
 * Initialize Sortable for drag-and-drop reordering
 */
function initSortable() {
  const list = document.getElementById('catalogs-list');
  if (!list || catalogs.length === 0) return;

  // Destroy previous instance if exists
  if (sortableInstance) {
    sortableInstance.destroy();
  }

  sortableInstance = new Sortable(list, {
    animation: 150,
    handle: '.catalog-list-item-drag',
    ghostClass: 'catalog-list-item-ghost',
    chosenClass: 'catalog-list-item-chosen',
    dragClass: 'catalog-list-item-drag-active',
    onEnd: async function(evt) {
      // Get new order of catalog IDs
      const items = list.querySelectorAll('.catalog-list-item');
      const newOrder = Array.from(items).map(item => parseInt(item.dataset.catalogId));

      // Save new order to server
      await saveOrder(newOrder);
    }
  });
}

/**
 * Save catalog order to server
 */
async function saveOrder(catalogIds) {
  try {
    const response = await apiPost('/api/catalogs/reorder', { catalog_ids: catalogIds });

    if (!response.ok) throw new Error('Failed to save order');

    showToast('Порядок сохранен', 'success');
  } catch (error) {
    console.error('Error saving order:', error);
    showToast('Ошибка сохранения порядка', 'error');
    // Reload to restore original order
    await loadCatalogs();
    renderCatalogsContent();
    setupCatalogEvents();
  }
}

/**
 * Show create/edit catalog modal
 */
function showCatalogModal(catalog = null) {
  const isEdit = !!catalog;
  const title = isEdit ? 'Редактировать каталог' : 'Создать каталог';

  showModal(title, `
    <form id="catalog-form" class="catalog-form">
      <div class="form-group">
        <label class="form-label">Название *</label>
        <input type="text" id="catalog-title" class="form-input" value="${catalog?.title || ''}" required placeholder="Название каталога">
      </div>

      <div class="form-group">
        <label class="form-label">Жанр *</label>
        <select id="catalog-genre" class="form-select" required>
          <option value="">Выберите жанр</option>
          <option value="игры" ${catalog?.genre === 'игры' ? 'selected' : ''}>Игры</option>
          <option value="фильмы" ${catalog?.genre === 'фильмы' ? 'selected' : ''}>Фильмы</option>
          <option value="аниме" ${catalog?.genre === 'аниме' ? 'selected' : ''}>Аниме</option>
          <option value="другое" ${catalog?.genre === 'другое' ? 'selected' : ''}>Другое</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Slug (URL)</label>
        <input type="text" id="catalog-slug" class="form-input" value="${catalog?.slug || ''}" placeholder="catalog-url-slug">
        <small style="color: var(--text-tertiary);">Оставьте пустым для автогенерации</small>
      </div>

      <div class="form-group">
        <label class="form-label">Описание</label>
        <textarea id="catalog-description" class="form-textarea" rows="3" placeholder="Описание каталога...">${catalog?.description || ''}</textarea>
      </div>

      <input type="hidden" id="catalog-id" value="${catalog?.id || ''}">
    </form>
  `, [
    {
      text: 'Отмена',
      className: 'btn btn-secondary',
      onClick: hideModal
    },
    {
      text: isEdit ? 'Сохранить' : 'Создать',
      className: 'btn btn-primary',
      onClick: () => saveCatalog(isEdit)
    }
  ]);

  // Auto-generate slug from title
  const titleInput = document.getElementById('catalog-title');
  const slugInput = document.getElementById('catalog-slug');

  if (!isEdit && titleInput && slugInput) {
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

    slugInput.addEventListener('input', () => {
      slugInput.dataset.manuallyEdited = 'true';
    });
  }
}

/**
 * Save catalog (create or update)
 */
async function saveCatalog(isEdit) {
  const title = document.getElementById('catalog-title').value.trim();
  const genre = document.getElementById('catalog-genre').value;
  const slug = document.getElementById('catalog-slug').value.trim();
  const description = document.getElementById('catalog-description').value.trim();
  const catalog_id = document.getElementById('catalog-id').value;

  if (!title) {
    showToast('Введите название', 'error');
    return;
  }

  if (!genre) {
    showToast('Выберите жанр', 'error');
    return;
  }

  try {
    const endpoint = isEdit ? '/api/catalogs/update' : '/api/catalogs/create';
    const body = {
      title,
      genre,
      slug: slug || null,
      description: description || null
    };

    if (isEdit) {
      body.catalog_id = parseInt(catalog_id);
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to save catalog');
    }

    hideModal();
    showToast(isEdit ? 'Каталог обновлен' : 'Каталог создан', 'success');

    // Reload catalogs
    await loadCatalogs();
    renderCatalogsContent();
    setupCatalogEvents();
  } catch (error) {
    console.error('Error saving catalog:', error);
    showToast(error.message || 'Ошибка сохранения', 'error');
  }
}

/**
 * Delete catalog
 */
async function deleteCatalog(catalogId) {
  const catalog = catalogs.find(c => c.id === parseInt(catalogId));
  if (!catalog) return;

  showModal('Удалить каталог?', `
    <p style="color: var(--text-secondary); margin-bottom: var(--spacing-md);">
      Вы уверены, что хотите удалить каталог "<strong>${catalog.title}</strong>"?
    </p>
    <p style="color: var(--text-tertiary); font-size: 0.875rem;">
      Товары из каталога не будут удалены, только связь с каталогом.
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
        try {
          const response = await apiPost('/api/catalogs/delete', { catalog_id: catalogId });

          if (!response.ok) throw new Error('Failed to delete catalog');

          hideModal();
          showToast('Каталог удален', 'success');

          // Reload catalogs
          await loadCatalogs();
          renderCatalogsContent();
          setupCatalogEvents();
        } catch (error) {
          console.error('Error deleting catalog:', error);
          showToast('Ошибка удаления', 'error');
        }
      }
    }
  ]);
}

/**
 * Setup event delegation for catalog actions
 */
function setupCatalogEvents() {
  const content = document.getElementById('content');

  // Remove previous handler if exists
  if (content._catalogClickHandler) {
    content.removeEventListener('click', content._catalogClickHandler);
  }

  const clickHandler = (e) => {
    const target = e.target;
    const action = target.dataset.action || target.closest('[data-action]')?.dataset.action;
    const catalogId = target.dataset.catalogId || target.closest('[data-catalog-id]')?.dataset.catalogId;

    if (!action) return;

    switch (action) {
      case 'create-catalog':
        showCatalogModal();
        break;

      case 'edit-catalog':
        if (catalogId) {
          const catalog = catalogs.find(c => c.id === parseInt(catalogId));
          if (catalog) showCatalogModal(catalog);
        }
        break;

      case 'delete-catalog':
        if (catalogId) deleteCatalog(catalogId);
        break;

      case 'reload-catalogs':
        loadCatalogsView();
        break;
    }
  };

  content._catalogClickHandler = clickHandler;
  content.addEventListener('click', clickHandler);
}

// Export
export {
  loadCatalogsView as renderCatalogsView,
  loadCatalogs,
  catalogs
};
