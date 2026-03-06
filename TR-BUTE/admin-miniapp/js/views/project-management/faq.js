/**
 * FAQ management sub-module
 */

import { apiGet, apiPost, apiPut, apiDelete } from '../../utils/apiClient.js';
import { SVGIcons, showToast } from '../../utils.js';
import {
  faqCategories, setFaqCategories,
  faqCategoryItems, setFaqCategoryItems,
  expandedCategories, setExpandedCategories,
  editingCategoryId, setEditingCategoryId,
  editingItemId, setEditingItemId,
  faqCategorySortable, setFaqCategorySortable,
  faqItemSortables, setFaqItemSortables,
  faqSectionExpanded, setFaqSectionExpanded,
  faqLoaded, setFaqLoaded,
  showConfirmDialog
} from './state.js';

export function renderFaqSubtab() {
  return `
    <!-- FAQ Management Section -->
    <div class="card" id="faq-management-section">
      <div class="card-header">
        <h3 class="card-title" style="display: flex; align-items: center; gap: var(--spacing-sm);">
          <span class="icon-wrapper" style="width: 20px; height: 20px;">${SVGIcons.helpCircle}</span>
          Управление FAQ
        </h3>
      </div>
      <div class="card-body" id="faq-section-content">
        <div id="faq-inline-container">
          <div class="loading-spinner" style="padding: var(--spacing-md);">
            <div class="spinner"></div>
            <p>Загрузка FAQ...</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

export async function toggleFaqSection() {
  const content = document.getElementById('faq-section-content');
  const chevron = document.getElementById('faq-section-chevron');

  if (!content || !chevron) return;

  setFaqSectionExpanded(!faqSectionExpanded);

  if (faqSectionExpanded) {
    content.style.display = 'block';
    chevron.style.transform = 'rotate(180deg)';

    // Load FAQ data if not already loaded
    if (!faqLoaded) {
      await loadFaqInline();
    }
  } else {
    content.style.display = 'none';
    chevron.style.transform = 'rotate(0deg)';
  }
}

export async function loadFaqInline() {
  const container = document.getElementById('faq-inline-container');
  if (!container) return;

  try {
    await loadFaqCategories();
    // Load items for all categories
    for (const cat of faqCategories) {
      await loadFaqItemsForCategory(cat.id);
    }
    setFaqLoaded(true);
    renderFaqInline();
    setupFaqEventDelegation();
    initFaqSortable();
  } catch (err) {
    console.error('Error loading FAQ:', err);
    container.innerHTML = `
      <div class="empty-state" style="padding: var(--spacing-md);">
        <p>Не удалось загрузить FAQ</p>
        <button class="btn btn-primary btn-sm" data-action="reload-faq-inline">Повторить</button>
      </div>
    `;
  }
}

// Keep for backwards compatibility — expands the inline section instead of navigating
export async function showFaqManagement() {
  const content = document.getElementById('faq-section-content');
  const chevron = document.getElementById('faq-section-chevron');

  if (content && chevron) {
    setFaqSectionExpanded(true);
    content.style.display = 'block';
    chevron.style.transform = 'rotate(180deg)';

    if (!faqLoaded) {
      await loadFaqInline();
    }

    // Scroll to FAQ section
    const faqSection = document.getElementById('faq-management-section');
    if (faqSection) {
      faqSection.scrollIntoView({ behavior: 'smooth' });
    }
  }
}

export function renderFaqInline() {
  const container = document.getElementById('faq-inline-container');
  if (!container) return;

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-md);">
      <p style="color: var(--text-secondary); font-size: 0.813rem; margin: 0;">
        Перетаскивайте для изменения порядка. Нажмите на текст для редактирования.
      </p>
      <button class="btn btn-primary btn-sm" data-action="add-faq-category">
        + Категория
      </button>
    </div>

    <div id="faq-categories-container" style="display: flex; flex-direction: column; gap: var(--spacing-sm);">
      ${faqCategories.length === 0 ? `
        <div class="empty-state" style="padding: var(--spacing-md);">
          <p style="color: var(--text-tertiary);">Нет категорий FAQ</p>
        </div>
      ` : faqCategories.map(cat => renderFaqCategory(cat)).join('')}
    </div>
  `;

  setupFaqEventDelegation();
  initFaqSortable();
}

function renderFaqCategory(category) {
  const isExpanded = expandedCategories.has(category.id);
  const isEditing = editingCategoryId === category.id;
  const items = faqCategoryItems[category.id] || [];

  if (isEditing) {
    return `
      <div class="faq-category-wrapper" data-category-id="${category.id}">
        <div class="faq-category-edit-form" style="padding: var(--spacing-sm); background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--primary);">
          <div style="display: flex; gap: var(--spacing-sm); align-items: center;">
            <input type="text" id="edit-cat-title-${category.id}" class="form-input" value="${category.title}" placeholder="Название категории" style="flex: 1; padding: var(--spacing-xs);">
            <button class="btn btn-primary btn-sm" data-action="save-category" data-category-id="${category.id}" style="padding: var(--spacing-xs) var(--spacing-sm);">✓</button>
            <button class="btn btn-secondary btn-sm" data-action="cancel-edit-category" style="padding: var(--spacing-xs) var(--spacing-sm);">✕</button>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="faq-category-wrapper" data-category-id="${category.id}">
      <div class="faq-category-toggle ${isExpanded ? 'expanded' : ''}"
           data-action="toggle-category" data-category-id="${category.id}"
           style="
             display: flex;
             align-items: center;
             padding: var(--spacing-sm) var(--spacing-md);
             background: var(--bg-secondary);
             border-radius: var(--radius-md);
             gap: var(--spacing-sm);
             cursor: pointer;
           ">
        <div class="faq-drag-handle" data-drag="category" style="cursor: grab; color: var(--text-tertiary); padding: 4px; touch-action: none;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <path d="M4 8h16M4 16h16"/>
          </svg>
        </div>
        <div data-action="toggle-category" data-category-id="${category.id}" style="display: flex; align-items: center; gap: var(--spacing-sm); flex: 1; cursor: pointer; min-width: 0;">
          <span class="faq-category-chevron" style="color: var(--text-tertiary); display: flex; transition: transform 0.2s; flex-shrink: 0; ${isExpanded ? 'transform: rotate(90deg);' : ''}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </span>
          <span style="flex: 1; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${category.title}</span>
          <span style="color: var(--text-tertiary); font-size: 0.813rem; flex-shrink: 0;">${items.length} вопросов</span>
        </div>
        <button class="btn btn-secondary btn-sm" data-action="edit-category" data-category-id="${category.id}" title="Редактировать" style="padding: 4px 8px; font-size: 0.75rem;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="btn btn-danger btn-sm" data-action="delete-category" data-category-id="${category.id}" title="Удалить" style="padding: 4px 8px; font-size: 0.75rem;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          </svg>
        </button>
      </div>

      ${isExpanded ? `
        <div class="faq-items-container" data-category-id="${category.id}" style="margin-left: var(--spacing-md); margin-top: var(--spacing-xs); padding-left: var(--spacing-md); border-left: 2px solid var(--border-color);">
          <div id="faq-items-${category.id}" style="display: flex; flex-direction: column; gap: var(--spacing-xs);">
            ${items.map(item => renderFaqItem(item)).join('')}
          </div>
          <button class="btn btn-secondary btn-sm" data-action="add-faq-item" data-category-id="${category.id}" style="margin-top: var(--spacing-sm); width: 100%;">
            + Добавить вопрос
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

function renderFaqItem(item) {
  const isEditing = editingItemId === item.id;

  if (isEditing) {
    const pages = item.show_on_pages || [];
    const pageOptions = [
      { value: 'cart', label: 'Корзина' },
      { value: 'picker', label: 'Подборщик' },
      { value: 'profile', label: 'Профиль' },
      { value: 'order', label: 'Заказ' },
      { value: 'checkout', label: 'Оформление' }
    ];
    return `
      <div class="faq-item-wrapper" data-item-id="${item.id}" style="padding: var(--spacing-sm); background: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--primary);">
        <div class="form-group" style="margin-bottom: var(--spacing-xs);">
          <input type="text" id="edit-item-question-${item.id}" class="form-input" value="${item.question}" placeholder="Вопрос" style="font-size: 0.875rem;">
        </div>
        <div class="form-group" style="margin-bottom: var(--spacing-xs);">
          <textarea id="edit-item-answer-${item.id}" class="form-input" rows="3" placeholder="Ответ" style="font-size: 0.813rem;">${item.answer}</textarea>
        </div>
        <div class="form-group" style="margin-bottom: var(--spacing-xs);">
          <label style="font-size: 0.75rem; color: var(--text-secondary); display: block; margin-bottom: 4px;">Показывать на страницах:</label>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${pageOptions.map(p => `
              <label style="display: flex; align-items: center; gap: 4px; font-size: 0.75rem; color: var(--text-primary); cursor: pointer; padding: 4px 8px; border: 1px solid var(--border-color); border-radius: 6px; background: ${pages.includes(p.value) ? 'var(--bg-quaternary)' : 'transparent'};">
                <input type="checkbox" class="faq-page-checkbox" data-page="${p.value}" ${pages.includes(p.value) ? 'checked' : ''} style="margin: 0;">
                ${p.label}
              </label>
            `).join('')}
          </div>
        </div>
        <div style="display: flex; gap: var(--spacing-sm); justify-content: flex-end;">
          <button class="btn btn-primary btn-sm" data-action="save-item" data-item-id="${item.id}" style="padding: var(--spacing-xs) var(--spacing-sm);">✓ Сохранить</button>
          <button class="btn btn-secondary btn-sm" data-action="cancel-edit-item" style="padding: var(--spacing-xs) var(--spacing-sm);">✕ Отмена</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="faq-item-wrapper" data-item-id="${item.id}"
         style="
           display: flex;
           align-items: flex-start;
           padding: var(--spacing-sm);
           background: var(--bg-tertiary);
           border-radius: var(--radius-sm);
           gap: var(--spacing-sm);
         ">
      <div class="faq-drag-handle" data-drag="item" style="margin-top: 2px; cursor: grab; color: var(--text-tertiary); padding: 4px; touch-action: none;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <path d="M4 8h16M4 16h16"/>
        </svg>
      </div>
      <div style="flex: 1; min-width: 0;">
        <div style="font-size: 0.875rem; font-weight: 500; color: var(--text-primary);">
          ${item.question}
        </div>
        <div style="font-size: 0.75rem; color: var(--text-tertiary); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${item.answer.substring(0, 80)}${item.answer.length > 80 ? '...' : ''}
        </div>
        ${item.show_on_pages && item.show_on_pages.length > 0 ? `
          <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px;">
            ${item.show_on_pages.map(p => `<span style="font-size: 0.625rem; padding: 1px 5px; border-radius: 4px; background: var(--status-info-bg); color: var(--status-info);">${p}</span>`).join('')}
          </div>
        ` : ''}
      </div>
      <button class="btn btn-secondary btn-sm" data-action="edit-item" data-item-id="${item.id}" title="Редактировать" style="padding: 4px 8px; font-size: 0.75rem; flex-shrink: 0;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
      <button class="btn btn-danger btn-sm" data-action="delete-item" data-item-id="${item.id}" data-category-id="${item.category_id}" title="Удалить" style="padding: 4px 8px; font-size: 0.75rem; flex-shrink: 0;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
        </svg>
      </button>
    </div>
  `;
}

function setupFaqEventDelegation() {
  const content = document.getElementById('content');
  if (!content) return;

  // Remove previous handler
  if (content._faqClickHandler) {
    content.removeEventListener('click', content._faqClickHandler);
  }

  const clickHandler = async (e) => {
    const target = e.target;
    const actionEl = target.closest('[data-action]');
    const action = actionEl?.dataset.action;

    if (!action) return;

    const categoryId = parseInt(actionEl?.dataset.categoryId || target.closest('[data-category-id]')?.dataset.categoryId);
    const itemId = parseInt(actionEl?.dataset.itemId || target.closest('[data-item-id]')?.dataset.itemId);

    switch (action) {
      case 'toggle-faq-section':
        await toggleFaqSection();
        break;

      case 'reload-faq-inline':
        setFaqLoaded(false);
        await loadFaqInline();
        break;

      case 'toggle-category':
        // Don't toggle if clicking on drag handle or buttons
        if (target.closest('.faq-drag-handle') || target.closest('button')) {
          return;
        }
        toggleCategoryExpand(categoryId);
        break;

      case 'add-faq-category':
        await addNewCategory();
        break;

      case 'edit-category':
        e.stopPropagation();
        setEditingCategoryId(categoryId);
        setEditingItemId(null);
        renderFaqInline();
        setTimeout(() => {
          const input = document.getElementById(`edit-cat-title-${categoryId}`);
          if (input) {
            input.focus();
            input.select();
          }
        }, 50);
        break;

      case 'cancel-edit-category':
        setEditingCategoryId(null);
        renderFaqInline();
        break;

      case 'save-category':
        await saveCategory(categoryId);
        break;

      case 'delete-category':
        e.stopPropagation();
        await deleteCategory(categoryId);
        break;

      case 'add-faq-item':
        await addNewItem(categoryId);
        break;

      case 'edit-item':
        setEditingItemId(itemId);
        setEditingCategoryId(null);
        renderFaqInline();
        setTimeout(() => {
          const input = document.getElementById(`edit-item-question-${itemId}`);
          if (input) {
            input.focus();
            input.select();
          }
        }, 50);
        break;

      case 'cancel-edit-item':
        setEditingItemId(null);
        renderFaqInline();
        break;

      case 'save-item':
        await saveItem(itemId);
        break;

      case 'delete-item':
        await deleteItem(itemId, categoryId);
        break;
    }
  };

  content._faqClickHandler = clickHandler;
  content.addEventListener('click', clickHandler);
}

function toggleCategoryExpand(categoryId) {
  if (expandedCategories.has(categoryId)) {
    expandedCategories.delete(categoryId);
  } else {
    expandedCategories.add(categoryId);
  }
  renderFaqInline();
}

export function initFaqSortable() {
  // Initialize sortable for categories
  const categoriesContainer = document.getElementById('faq-categories-container');
  if (categoriesContainer && faqCategories.length > 0) {
    if (faqCategorySortable) {
      faqCategorySortable.destroy();
    }
    setFaqCategorySortable(new Sortable(categoriesContainer, {
      animation: 150,
      handle: '[data-drag="category"]',
      ghostClass: 'faq-item-ghost',
      chosenClass: 'faq-item-chosen',
      onEnd: async (evt) => {
        const items = categoriesContainer.querySelectorAll('.faq-category-wrapper');
        const newOrder = Array.from(items).map(item => parseInt(item.dataset.categoryId));
        await saveCategoryOrder(newOrder);
      }
    }));
  }

  // Initialize sortable for items in each expanded category
  Object.keys(faqItemSortables).forEach(key => {
    if (faqItemSortables[key]) {
      faqItemSortables[key].destroy();
    }
  });
  setFaqItemSortables({});

  expandedCategories.forEach(categoryId => {
    const itemsContainer = document.getElementById(`faq-items-${categoryId}`);
    if (itemsContainer) {
      const newSortables = { ...faqItemSortables };
      newSortables[categoryId] = new Sortable(itemsContainer, {
        animation: 150,
        handle: '[data-drag="item"]',
        ghostClass: 'faq-item-ghost',
        chosenClass: 'faq-item-chosen',
        onEnd: async (evt) => {
          const items = itemsContainer.querySelectorAll('.faq-item-wrapper');
          const newOrder = Array.from(items).map(item => parseInt(item.dataset.itemId));
          await saveItemOrder(categoryId, newOrder);
        }
      });
      setFaqItemSortables(newSortables);
    }
  });
}

async function loadFaqCategories() {
  try {
    const response = await apiGet('/api/admin/faq/categories');
    if (response.ok) {
      const result = await response.json();
      setFaqCategories(result.categories || []);
    }
  } catch (err) {
    console.error('Error loading FAQ categories:', err);
    showToast('Ошибка загрузки категорий', 'error');
  }
}

async function loadFaqItemsForCategory(categoryId) {
  try {
    const response = await apiGet(`/api/admin/faq/items?category_id=${categoryId}`);
    if (response.ok) {
      const result = await response.json();
      setFaqCategoryItems({ ...faqCategoryItems, [categoryId]: result.items || [] });
    }
  } catch (err) {
    console.error('Error loading FAQ items:', err);
  }
}

async function addNewCategory() {
  try {
    const response = await apiPost('/api/admin/faq/categories', {
        title: 'Новая категория',
        sort_order: faqCategories.length
      });

    if (response.ok) {
      const result = await response.json();
      showToast('Категория создана', 'success');
      await loadFaqCategories();
      setFaqCategoryItems({ ...faqCategoryItems, [result.id]: [] });
      setEditingCategoryId(result.id);
      expandedCategories.add(result.id);
      renderFaqInline();
      setTimeout(() => {
        const input = document.getElementById(`edit-cat-title-${result.id}`);
        if (input) {
          input.select();
          input.focus();
        }
      }, 50);
    } else {
      showToast('Ошибка создания категории', 'error');
    }
  } catch (err) {
    console.error('Error adding category:', err);
    showToast('Ошибка создания категории', 'error');
  }
}

async function saveCategory(categoryId) {
  const titleInput = document.getElementById(`edit-cat-title-${categoryId}`);

  if (!titleInput) return;

  const title = titleInput.value.trim();

  if (!title) {
    showToast('Введите название категории', 'error');
    return;
  }

  try {
    const response = await apiPut('/api/admin/faq/categories', { id: categoryId, title });

    if (response.ok) {
      showToast('Категория сохранена', 'success');
      await loadFaqCategories();
      setEditingCategoryId(null);
      renderFaqInline();
    } else {
      showToast('Ошибка сохранения', 'error');
    }
  } catch (err) {
    console.error('Error saving category:', err);
    showToast('Ошибка сохранения', 'error');
  }
}

async function deleteCategory(categoryId) {
  const category = faqCategories.find(c => c.id === categoryId);
  if (!category) return;

  const items = faqCategoryItems[categoryId] || [];
  if (items.length > 0) {
    showToast('Сначала удалите все вопросы в категории', 'error');
    return;
  }

  const confirmed = await showConfirmDialog(
    'Удалить категорию?',
    `Вы уверены, что хотите удалить категорию "${category.title}"?`,
    'Удалить',
    true
  );

  if (!confirmed) return;

  try {
    const response = await apiDelete(`/api/admin/faq/categories?id=${categoryId}`);

    if (response.ok) {
      showToast('Категория удалена', 'success');
      expandedCategories.delete(categoryId);
      const newItems = { ...faqCategoryItems };
      delete newItems[categoryId];
      setFaqCategoryItems(newItems);
      await loadFaqCategories();
      renderFaqInline();
    } else {
      showToast('Ошибка удаления', 'error');
    }
  } catch (err) {
    console.error('Error deleting category:', err);
    showToast('Ошибка удаления', 'error');
  }
}

async function addNewItem(categoryId) {
  try {
    const response = await apiPost('/api/admin/faq/items', {
        category_id: categoryId,
        question: 'Новый вопрос',
        answer: 'Ответ на вопрос',
        sort_order: (faqCategoryItems[categoryId]?.length || 0)
    });

    if (response.ok) {
      const result = await response.json();
      showToast('Вопрос создан', 'success');
      await loadFaqItemsForCategory(categoryId);
      setEditingItemId(result.id);
      renderFaqInline();
      setTimeout(() => {
        const input = document.getElementById(`edit-item-question-${result.id}`);
        if (input) {
          input.select();
          input.focus();
        }
      }, 50);
    } else {
      showToast('Ошибка создания вопроса', 'error');
    }
  } catch (err) {
    console.error('Error adding item:', err);
    showToast('Ошибка создания вопроса', 'error');
  }
}

async function saveItem(itemId) {
  const questionInput = document.getElementById(`edit-item-question-${itemId}`);
  const answerInput = document.getElementById(`edit-item-answer-${itemId}`);

  if (!questionInput || !answerInput) return;

  const question = questionInput.value.trim();
  const answer = answerInput.value.trim();

  if (!question || !answer) {
    showToast('Заполните вопрос и ответ', 'error');
    return;
  }

  // Collect page placement checkboxes
  const wrapper = questionInput.closest('.faq-item-wrapper');
  const checkboxes = wrapper ? wrapper.querySelectorAll('.faq-page-checkbox') : [];
  const show_on_pages = Array.from(checkboxes)
    .filter(cb => cb.checked)
    .map(cb => cb.dataset.page);

  try {
    const response = await apiPut('/api/admin/faq/items', { id: itemId, question, answer, show_on_pages });

    if (response.ok) {
      showToast('Вопрос сохранен', 'success');
      // Find category for this item
      for (const [catId, items] of Object.entries(faqCategoryItems)) {
        if (items.some(i => i.id === itemId)) {
          await loadFaqItemsForCategory(parseInt(catId));
          break;
        }
      }
      setEditingItemId(null);
      renderFaqInline();
    } else {
      showToast('Ошибка сохранения', 'error');
    }
  } catch (err) {
    console.error('Error saving item:', err);
    showToast('Ошибка сохранения', 'error');
  }
}

async function deleteItem(itemId, categoryId) {
  const items = faqCategoryItems[categoryId] || [];
  const item = items.find(i => i.id === itemId);
  if (!item) return;

  const confirmed = await showConfirmDialog(
    'Удалить вопрос?',
    `Удалить "${item.question.substring(0, 40)}${item.question.length > 40 ? '...' : ''}"?`,
    'Удалить',
    true
  );

  if (!confirmed) return;

  try {
    const response = await apiDelete(`/api/admin/faq/items?id=${itemId}`);

    if (response.ok) {
      showToast('Вопрос удален', 'success');
      await loadFaqItemsForCategory(categoryId);
      renderFaqInline();
    } else {
      showToast('Ошибка удаления', 'error');
    }
  } catch (err) {
    console.error('Error deleting item:', err);
    showToast('Ошибка удаления', 'error');
  }
}

async function saveCategoryOrder(newOrder) {
  try {
    const response = await apiPost('/api/admin/faq/categories/reorder', { category_ids: newOrder });

    if (response.ok) {
      showToast('Порядок сохранен', 'success');
      await loadFaqCategories();
    } else {
      showToast('Ошибка сохранения порядка', 'error');
      renderFaqInline();
    }
  } catch (err) {
    console.error('Error saving category order:', err);
    showToast('Ошибка сохранения порядка', 'error');
  }
}

async function saveItemOrder(categoryId, newOrder) {
  try {
    const response = await apiPost('/api/admin/faq/items/reorder', { category_id: categoryId, item_ids: newOrder });

    if (response.ok) {
      showToast('Порядок сохранен', 'success');
      await loadFaqItemsForCategory(categoryId);
    } else {
      showToast('Ошибка сохранения порядка', 'error');
      renderFaqInline();
    }
  } catch (err) {
    console.error('Error saving item order:', err);
    showToast('Ошибка сохранения порядка', 'error');
  }
}
