// Templates subtab and product creation flow for admin products view.
//
// Dep injected via initTemplatesDeps():
//   setCurrentSubtab        - set currentSubtab in products.js
//   loadProductsSubtabContent - re-render active subtab content
//   loadProductsList          - reload products list from API
//   getAllProducts             - returns current allProductsList array

import { showToast, showError, showModal, hideModal, showPromptModal, formatDate } from '../../utils.js';
import { apiPost } from '../../utils/apiClient.js';
import { prepareNewProductModal } from '../../components/imageManager.js';

let _setCurrentSubtab, _getCurrentSubtab, _loadProductsSubtabContent, _loadProductsList, _getAllProducts;

export function initTemplatesDeps({ setCurrentSubtab, getCurrentSubtab, loadProductsSubtabContent, loadProductsList, getAllProducts }) {
  _setCurrentSubtab = setCurrentSubtab;
  _getCurrentSubtab = getCurrentSubtab;
  _loadProductsSubtabContent = loadProductsSubtabContent;
  _loadProductsList = loadProductsList;
  _getAllProducts = getAllProducts;
}

export async function createFromTemplate(templateId) {
  const templates = getTemplates();
  const template = templates.find(t => t.id === templateId);

  if (!template) {
    showError('Шаблон не найден');
    return;
  }

  // Switch to products tab
  _setCurrentSubtab('products');
  document.querySelectorAll('[data-action="switch-products-subtab"]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.subtab === 'products');
  });

  const { showProductModal } = await import('../../components/imageManager.js');

  // Reset state and pre-populate from template, then open modal
  await prepareNewProductModal(template.data);
  const productFromTemplate = {
    ...template.data,
    id: null
  };
  showProductModal(productFromTemplate);
}

export function deleteTemplateWithConfirm(templateId) {
  if (!confirm('Удалить этот шаблон?')) return;

  deleteTemplate(templateId);
  showToast('Шаблон удален', 'success');
  renderTemplatesSubtab();
}

// Export function to save current product as template (called from imageManager.js)
export async function saveProductAsTemplate(productData) {
  const templateName = await showPromptModal(
    'Введите название шаблона:',
    'Сохранить шаблон',
    productData.title || 'Новый шаблон'
  );

  if (!templateName) return;

  const template = addTemplate(productData, templateName);
  showToast(`Шаблон "${templateName}" сохранен`, 'success');

  // Refresh the list immediately if currently viewing the templates subtab
  if (_getCurrentSubtab() === 'templates') {
    renderTemplatesSubtab();
  }

  return template;
}

// ============================================================================
// TEMPLATE SELECTION
// ============================================================================

/**
 * Show template selection modal when creating a new product.
 * @returns {Promise<{selectedTemplate: Object|null, addToAlpha: boolean}>}
 */
export async function showTemplateSelectionModal() {
  const templates = getTemplates();

  return new Promise((resolve) => {
    showModal('Выберите шаблон', `
      <div style="padding: var(--spacing-sm) 0;">
        <p style="color: var(--text-secondary); margin-bottom: var(--spacing-md); font-size: 0.875rem;">
          Создайте товар на основе шаблона или с нуля
        </p>
        <div class="template-selection-list">
          <div class="template-selection-item" data-template-id="blank" style="padding: var(--spacing-md); background: var(--bg-secondary); border-radius: var(--radius-md); margin-bottom: var(--spacing-sm); cursor: pointer; transition: all 0.2s ease; border: 2px solid transparent;">
            <div style="display: flex; align-items: center; gap: var(--spacing-md);">
              <div style="width: 40px; height: 40px; border-radius: var(--radius-sm); background: var(--primary); display: flex; align-items: center; justify-content: center; color: white; font-size: 20px; flex-shrink: 0;">+</div>
              <div style="flex: 1;">
                <div style="font-weight: 600; margin-bottom: 2px;">Создать пустой товар</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary);">Начать с чистого листа</div>
              </div>
            </div>
          </div>
          ${templates.length === 0 ? '' : templates.map(template => `
            <div class="template-selection-item" data-template-id="${template.id}" style="padding: var(--spacing-md); background: var(--bg-secondary); border-radius: var(--radius-md); margin-bottom: var(--spacing-sm); cursor: pointer; transition: all 0.2s ease; border: 2px solid transparent;">
              <div style="display: flex; align-items: center; gap: var(--spacing-md);">
                <div style="width: 40px; height: 40px; border-radius: var(--radius-sm); background: var(--bg-tertiary); display: flex; align-items: center; justify-content: center; flex-shrink: 0;"></div>
                <div style="flex: 1; min-width: 0;">
                  <div style="font-weight: 600; margin-bottom: 2px;">${template.name}</div>
                  <div style="font-size: 0.75rem; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${template.data.title || 'Без названия'} • ${template.data.genre || ''} • ${template.data.type || ''}
                  </div>
                </div>
              </div>
            </div>
          `).join('')}
        </div>

        <label style="display: flex; align-items: center; gap: var(--spacing-sm); margin-top: var(--spacing-md); font-size: 0.875rem; color: var(--text-secondary); cursor: pointer; user-select: none;">
          <input type="checkbox" id="template-select-alpha" style="width: 16px; height: 16px;">
          Добавить в алфавитную сортировку
        </label>
      </div>
    `, [
      {
        text: 'Отмена',
        className: 'btn btn-secondary',
        onClick: () => {
          hideModal();
          resolve({ selectedTemplate: null, addToAlpha: false });
        }
      }
    ]);

    // Add click handlers to template items
    setTimeout(() => {
      const items = document.querySelectorAll('.template-selection-item');
      items.forEach(item => {
        item.addEventListener('mouseenter', () => {
          item.style.background = 'var(--bg-tertiary)';
          item.style.borderColor = 'var(--primary)';
        });
        item.addEventListener('mouseleave', () => {
          item.style.background = 'var(--bg-secondary)';
          item.style.borderColor = 'transparent';
        });

        item.addEventListener('click', () => {
          const templateId = item.dataset.templateId;
          const addToAlpha = document.getElementById('template-select-alpha')?.checked || false;
          hideModal();

          if (templateId === 'blank') {
            resolve({ selectedTemplate: { blank: true }, addToAlpha });
          } else {
            const template = templates.find(t => t.id === parseInt(templateId));
            resolve({ selectedTemplate: template || null, addToAlpha });
          }
        });
      });
    }, 100);
  });
}

/**
 * Initiate product creation with template selection
 */
// Track whether a new product should be placed in alphabetical section after creation
let pendingAlphabetical = false;

/**
 * Initiate product creation with template selection
 */
export async function initiateProductCreation() {
  const { addToAlpha, selectedTemplate } = await showTemplateSelectionModal();

  if (!selectedTemplate) {
    // User cancelled
    return;
  }

  pendingAlphabetical = addToAlpha;

  const { showProductModal } = await import('../../components/imageManager.js');

  if (selectedTemplate.blank) {
    await prepareNewProductModal(null);
    showProductModal(null);
  } else {
    const templateData = selectedTemplate.data;
    await prepareNewProductModal(templateData);
    const productFromTemplate = {
      ...templateData,
      id: null
    };
    showProductModal(productFromTemplate);
  }
}

// ============================================================================
// INSERT PRODUCT AT POSITION
// ============================================================================

// Track the desired insertion position for new products
let pendingInsertPosition = null;

export async function insertProductAtPosition(position) {
  // Store the position for after the product is created
  pendingInsertPosition = position;

  // Open template selection and then product modal
  await initiateProductCreation();

  // Note: The actual insertion will happen after the product is saved
  // We'll modify the save logic to check pendingInsertPosition
}

/**
 * After a product is created, handle position insertion and/or alphabetical placement,
 * then scroll to the new product in the list.
 * @param {number} productId - The newly created product ID
 */
export async function handlePostCreateInsertion(productId) {
  try {
    if (pendingAlphabetical) {
      // Move new product to alphabetical section
      pendingAlphabetical = false;
      const response = await apiPost('/api/products/set-sort-section', {
        product_id: productId,
        section: 'alphabetical'
      });
      if (response.ok) {
        await _loadProductsList();
        showToast('Товар добавлен в алфавитную сортировку', 'success');
      }
    } else if (pendingInsertPosition !== null) {
      // Insert at a specific position in the manual list
      const manualProducts = _getAllProducts().filter(p => p.is_manual_sort !== false);
      const manual_ids = [];

      manualProducts.forEach((product, index) => {
        if (index === pendingInsertPosition) {
          manual_ids.push(productId);
        }
        manual_ids.push(product.id);
      });

      if (pendingInsertPosition >= manualProducts.length) {
        manual_ids.push(productId);
      }

      const response = await apiPost('/api/products/reorder', {
        manual_ids: manual_ids,
        alphabetical_ids: _getAllProducts().filter(p => p.is_manual_sort === false && p.id !== productId).map(p => p.id)
      });

      if (!response.ok) throw new Error('Failed to reorder products');

      pendingInsertPosition = null;
      await _loadProductsList();
      showToast('Товар добавлен на указанную позицию', 'success');
    }
  } catch (error) {
    console.error('Error in post-create insertion:', error);
    showToast('Ошибка вставки товара', 'error');
    pendingInsertPosition = null;
    pendingAlphabetical = false;
  }

  // Scroll to the new product element
  setTimeout(() => {
    const el = document.querySelector(`.product-item[data-product-id="${productId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.outline = '2px solid var(--primary)';
      setTimeout(() => { el.style.outline = ''; }, 2000);
    }
  }, 300);
}

// ============================================================================
// TEMPLATES SUBTAB
// ============================================================================

const TEMPLATES_STORAGE_KEY = 'tr-bute-product-templates';

function getTemplates() {
  try {
    const stored = localStorage.getItem(TEMPLATES_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error loading templates:', error);
    return [];
  }
}

function saveTemplates(templates) {
  try {
    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
    return true;
  } catch (error) {
    console.error('Error saving templates:', error);
    showError('Ошибка сохранения шаблонов');
    return false;
  }
}

function addTemplate(productData, templateName) {
  const templates = getTemplates();
  const newTemplate = {
    id: Date.now(),
    name: templateName,
    created_at: new Date().toISOString(),
    data: productData
  };
  templates.push(newTemplate);
  saveTemplates(templates);
  return newTemplate;
}

function deleteTemplate(templateId) {
  const templates = getTemplates();
  const filtered = templates.filter(t => t.id !== templateId);
  saveTemplates(filtered);
}

async function renameTemplate(templateId) {
  const templates = getTemplates();
  const template = templates.find(t => t.id === templateId);

  if (!template) {
    showError('Шаблон не найден');
    return;
  }

  const newName = await showPromptModal(
    'Введите новое название шаблона:',
    'Переименовать шаблон',
    template.name
  );

  if (!newName || newName === template.name) return;

  template.name = newName;
  saveTemplates(templates);
  showToast('Шаблон переименован', 'success');
  renderTemplatesSubtab();
}

export function renderTemplatesSubtab() {
  const container = document.getElementById('products-subtab-content');
  if (!container) return;

  const templates = getTemplates();

  container.innerHTML = `
    <div id="templates-list" style="padding-bottom: 80px;">
      ${templates.length === 0
        ? '<div class="empty-state"><h3>Шаблонов нет</h3></div>'
        : templates.map(template => `
          <div class="template-item" data-template-id="${template.id}" style="padding: var(--spacing-md); background: var(--bg-secondary); border-radius: var(--radius-md); margin-bottom: var(--spacing-sm); display: flex; gap: var(--spacing-md); align-items: center;">
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 600; margin-bottom: 4px;">${template.name}</div>
              <div style="font-size: 0.875rem; color: var(--text-secondary);">
                ${template.data.title || 'Без названия'} •
                Создан ${formatDate(template.created_at)}
              </div>
            </div>
            <button class="btn btn-primary btn-xs" data-action="create-from-template" data-template-id="${template.id}" title="Создать товар из шаблона">Использовать</button>
            <button class="btn btn-secondary btn-xs" data-action="rename-template" data-template-id="${template.id}" title="Переименовать шаблон">✏️</button>
            <button class="btn btn-danger btn-xs" data-action="delete-template" data-template-id="${template.id}" title="Удалить шаблон">🗑</button>
          </div>
        `).join('')
      }
    </div>

    <!-- Help FAB (above primary FAB) -->
    <button class="fab fab-help" data-action="show-subtab-help" title="Помощь">?</button>

    <!-- Floating Action Button for creating new template -->
    <button class="fab" data-action="create-template" title="Создать шаблон">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    </button>
  `;
}
