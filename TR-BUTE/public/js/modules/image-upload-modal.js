/**
 * Image Upload Modal Component
 * Provides a consistent UI for image selection across reviews and product id1
 *
 * Features:
 * - Three upload options: Gallery, Camera, URL
 * - Different layouts for reviews (URL hidden) vs product (URL prominent)
 * - Mobile-friendly with bottom sheet style
 * - Image preview before confirmation
 * - Integration with image-upload.js for compression and storage
 */

import {
  validateImageFile,
  validateImageUrl,
  processImageFile,
  selectImageFile,
  addPendingImage,
  getPendingImageForContext,
  removePendingImagesForContext
} from './image-upload.js';

// ============================================================
// MODAL STATE
// ============================================================

let activeUploadModal = null;

// ============================================================
// MAIN MODAL FUNCTION
// ============================================================

/**
 * Show image upload modal
 * @param {Object} options - Modal options
 * @param {string} options.type - 'review' or 'product'
 * @param {string} options.contextId - Product ID or cart item key
 * @param {string} [options.title] - Modal title (default based on type)
 * @param {boolean} [options.urlFirst] - Show URL field prominently (for product)
 * @param {boolean} [options.allowReplace] - Allow replacing existing image
 * @param {Function} [options.onSelect] - Callback when image is selected
 * @param {Function} [options.onRemove] - Callback when image is removed
 * @returns {Promise<{selected: boolean, imageData?: Object}>}
 */
export function showImageUploadModal(options) {
  return new Promise((resolve) => {
    const {
      type = 'review',
      contextId,
      title = type === 'review' ? 'Добавить фото' : 'Добавить изображение',
      urlFirst = type === 'product',
      allowReplace = false,
      onSelect = null,
      onRemove = null
    } = options;

    // Close any existing modal
    if (activeUploadModal) {
      closeUploadModal(null);
    }

    // Check for existing image
    const existingImage = getPendingImageForContext(type, contextId);

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'image-upload-modal-overlay';
    overlay.id = 'image-upload-modal-overlay';

    // Build modal content
    const modalHTML = buildModalHTML({
      type,
      title: allowReplace && existingImage ? 'Заменить фото' : title,
      urlFirst,
      existingImage,
      allowReplace
    });

    overlay.innerHTML = `
      <div class="image-upload-modal-backdrop"></div>
      <div class="image-upload-modal" data-type="${type}">
        <div class="image-upload-modal-handle"><span></span></div>
        ${modalHTML}
      </div>
    `;

    document.body.appendChild(overlay);

    const modal = overlay.querySelector('.image-upload-modal');
    const backdrop = overlay.querySelector('.image-upload-modal-backdrop');

    // Store state
    activeUploadModal = {
      overlay,
      modal,
      resolve,
      type,
      contextId,
      onSelect,
      onRemove
    };

    // Setup event handlers
    setupModalEventHandlers(modal, backdrop);

    // Save scroll position before locking
    const scrollY = window.scrollY;
    activeUploadModal.scrollY = scrollY;

    // Animate in
    requestAnimationFrame(() => {
      overlay.classList.add('active');
      // Lock scroll while preserving position
      document.body.style.top = `-${scrollY}px`;
      document.body.classList.add('modal-open');
    });
  });
}

/**
 * Build modal HTML content
 */
function buildModalHTML({ type, title, urlFirst, existingImage, allowReplace }) {
  // Preview section (shown when image exists or is selected)
  const previewHTML = existingImage
    ? `
      <div class="image-upload-preview active">
        <img src="${escapeAttr(existingImage.dataUrl)}" alt="Preview">
        <button class="image-upload-preview-remove" aria-label="Удалить">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `
    : `
      <div class="image-upload-preview">
        <img src="" alt="Preview">
        <button class="image-upload-preview-remove" aria-label="Удалить">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;

  // URL input section
  const urlInputHTML = `
    <div class="image-upload-url-section ${urlFirst ? 'prominent' : 'hidden'}">
      <div class="image-upload-url-input-wrapper">
        <input
          type="url"
          class="image-upload-url-input"
          placeholder="https://example.com/image.jpg"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
        >
        <button class="image-upload-url-submit" disabled>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      </div>
      <p class="image-upload-url-hint">Вставьте прямую ссылку на изображение</p>
    </div>
  `;

  // Main action buttons
  const galleryBtnHTML = `
    <button class="image-upload-action-btn gallery ${urlFirst ? 'secondary' : 'primary'}">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <circle cx="8.5" cy="8.5" r="1.5"></circle>
        <polyline points="21 15 16 10 5 21"></polyline>
      </svg>
      <span>Загрузить из галереи</span>
    </button>
  `;

  // Camera button only for reviews, not for custom products
  const cameraBtnHTML = type === 'review' ? `
    <button class="image-upload-action-btn camera ${urlFirst ? 'secondary' : 'primary'}">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
        <circle cx="12" cy="13" r="4"></circle>
      </svg>
      <span>Сделать фото</span>
    </button>
  ` : '';

  const urlToggleBtnHTML = !urlFirst ? `
    <button class="image-upload-action-btn url-toggle tertiary">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
      </svg>
      <span>Добавить ссылку на изображение</span>
    </button>
  ` : '';

  // Organize layout based on urlFirst
  let actionsHTML;
  if (urlFirst) {
    actionsHTML = `
      ${urlInputHTML}
      <div class="image-upload-divider">
        <span>или</span>
      </div>
      <div class="image-upload-actions secondary-mode">
        ${galleryBtnHTML}
        ${cameraBtnHTML}
      </div>
    `;
  } else {
    actionsHTML = `
      <div class="image-upload-actions primary-mode">
        ${galleryBtnHTML}
        ${cameraBtnHTML}
      </div>
      ${urlToggleBtnHTML}
      ${urlInputHTML}
    `;
  }

  return `
    <div class="image-upload-modal-header">
      <h3 class="image-upload-modal-title">${escapeHTML(title)}</h3>
    </div>
    <div class="image-upload-modal-body">
      ${previewHTML}
      ${actionsHTML}
    </div>
    <div class="image-upload-modal-footer">
      <button class="image-upload-modal-btn cancel">Отмена</button>
      <button class="image-upload-modal-btn confirm" disabled>Готово</button>
    </div>
  `;
}

/**
 * Setup event handlers for the modal
 */
function setupModalEventHandlers(modal, backdrop) {
  const { type, contextId, onSelect, onRemove, resolve } = activeUploadModal;

  // Backdrop click
  backdrop.addEventListener('click', () => closeUploadModal(null));

  // Cancel button
  const cancelBtn = modal.querySelector('.image-upload-modal-btn.cancel');
  cancelBtn?.addEventListener('click', () => closeUploadModal(null));

  // Confirm button
  const confirmBtn = modal.querySelector('.image-upload-modal-btn.confirm');
  confirmBtn?.addEventListener('click', handleConfirm);

  // Gallery button
  const galleryBtn = modal.querySelector('.image-upload-action-btn.gallery');
  galleryBtn?.addEventListener('click', () => handleFileSelect(false));

  // Camera button
  const cameraBtn = modal.querySelector('.image-upload-action-btn.camera');
  cameraBtn?.addEventListener('click', () => handleFileSelect(true));

  // URL toggle button
  const urlToggleBtn = modal.querySelector('.image-upload-action-btn.url-toggle');
  urlToggleBtn?.addEventListener('click', handleUrlToggle);

  // URL input
  const urlInput = modal.querySelector('.image-upload-url-input');
  const urlSubmitBtn = modal.querySelector('.image-upload-url-submit');

  urlInput?.addEventListener('input', () => {
    const value = urlInput.value.trim();
    urlSubmitBtn.disabled = !value;
  });

  urlInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleUrlSubmit();
    }
  });

  urlSubmitBtn?.addEventListener('click', handleUrlSubmit);

  // Preview remove button
  const previewRemoveBtn = modal.querySelector('.image-upload-preview-remove');
  previewRemoveBtn?.addEventListener('click', handleRemovePreview);

  // Swipe to dismiss
  setupSwipeToDismiss(modal);

  // Escape key
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeUploadModal(null);
    }
  };
  document.addEventListener('keydown', escHandler);
  activeUploadModal.escHandler = escHandler;
}

/**
 * Handle file selection (gallery or camera)
 */
async function handleFileSelect(useCamera) {
  if (!activeUploadModal) return;

  const { modal, type, contextId } = activeUploadModal;

  // Show loading state
  const btn = modal.querySelector(useCamera ? '.image-upload-action-btn.camera' : '.image-upload-action-btn.gallery');
  btn?.classList.add('loading');

  try {
    const file = await selectImageFile(useCamera);

    if (!file) {
      btn?.classList.remove('loading');
      return;
    }

    // Process image
    const result = await processImageFile(file, type);

    if (!result.success) {
      showError(modal, result.error);
      btn?.classList.remove('loading');
      return;
    }

    // Show preview
    showPreview(modal, result.dataUrl);

    // Store in modal state
    activeUploadModal.selectedImage = {
      source: useCamera ? 'camera' : 'file',
      dataUrl: result.dataUrl,
      width: result.width,
      height: result.height
    };

    // Enable confirm button
    modal.querySelector('.image-upload-modal-btn.confirm').disabled = false;
  } catch (error) {
    console.error('Error selecting file:', error);
    showError(modal, 'Не удалось обработать изображение');
  }

  btn?.classList.remove('loading');
}

/**
 * Handle URL toggle button click
 */
function handleUrlToggle() {
  if (!activeUploadModal) return;

  const { modal } = activeUploadModal;
  const urlSection = modal.querySelector('.image-upload-url-section');
  const toggleBtn = modal.querySelector('.image-upload-action-btn.url-toggle');

  if (urlSection.classList.contains('hidden')) {
    urlSection.classList.remove('hidden');
    urlSection.classList.add('visible');
    toggleBtn.style.display = 'none';

    // Focus input
    const input = modal.querySelector('.image-upload-url-input');
    setTimeout(() => input?.focus(), 100);
  }
}

/**
 * Handle URL submission
 */
async function handleUrlSubmit() {
  if (!activeUploadModal) return;

  const { modal, type } = activeUploadModal;
  const urlInput = modal.querySelector('.image-upload-url-input');
  const url = urlInput?.value.trim();

  if (!url) return;

  // Validate URL
  const validation = validateImageUrl(url);
  if (!validation.valid) {
    showError(modal, validation.error);
    return;
  }

  if (validation.warning) {
    // Show warning but continue
    showWarning(modal, validation.warning);
  }

  // Try to load image to verify it works
  const submitBtn = modal.querySelector('.image-upload-url-submit');
  submitBtn?.classList.add('loading');

  try {
    // Create image element to test loading
    await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.onerror = () => reject(new Error('Не удалось загрузить изображение'));
      img.crossOrigin = 'anonymous';
      img.src = url;

      // Timeout after 10 seconds
      setTimeout(() => reject(new Error('Таймаут загрузки изображения')), 10000);
    }).then(({ width, height }) => {
      // Show preview
      showPreview(modal, url);

      // Store in modal state
      activeUploadModal.selectedImage = {
        source: 'url',
        dataUrl: url,
        originalUrl: url,
        width,
        height
      };

      // Enable confirm button
      modal.querySelector('.image-upload-modal-btn.confirm').disabled = false;
    });
  } catch (error) {
    // If image fails to load, still allow it (CORS might block preview)
    showPreview(modal, url, true); // true = may fail

    activeUploadModal.selectedImage = {
      source: 'url',
      dataUrl: url,
      originalUrl: url,
      width: 0,
      height: 0
    };

    modal.querySelector('.image-upload-modal-btn.confirm').disabled = false;
  }

  submitBtn?.classList.remove('loading');
}

/**
 * Handle confirm button click
 */
function handleConfirm() {
  if (!activeUploadModal) return;

  const { type, contextId, onSelect } = activeUploadModal;
  const selectedImage = activeUploadModal.selectedImage;

  if (!selectedImage) {
    closeUploadModal(null);
    return;
  }

  // Remove any existing images for this context
  removePendingImagesForContext(type, contextId);

  // Add new pending image
  const pendingImage = addPendingImage(
    type,
    contextId,
    selectedImage.source,
    selectedImage.dataUrl,
    selectedImage.width,
    selectedImage.height
  );

  // Call callback
  if (onSelect) {
    onSelect(pendingImage);
  }

  // Close with result
  closeUploadModal({ selected: true, imageData: pendingImage });
}

/**
 * Handle remove preview button click
 */
function handleRemovePreview() {
  if (!activeUploadModal) return;

  const { modal, type, contextId, onRemove } = activeUploadModal;

  // Hide preview
  const preview = modal.querySelector('.image-upload-preview');
  preview?.classList.remove('active');
  const previewImg = preview?.querySelector('img');
  if (previewImg) previewImg.src = '';

  // Clear selected image
  activeUploadModal.selectedImage = null;

  // Remove from localStorage
  removePendingImagesForContext(type, contextId);

  // Disable confirm button
  modal.querySelector('.image-upload-modal-btn.confirm').disabled = true;

  // Call callback
  if (onRemove) {
    onRemove();
  }
}

/**
 * Show image preview
 */
function showPreview(modal, imageUrl, mayFail = false) {
  const preview = modal.querySelector('.image-upload-preview');
  const img = preview?.querySelector('img');

  if (!preview || !img) return;

  if (mayFail) {
    img.onerror = () => {
      // Show placeholder
      img.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect fill="%23f3f4f6" width="100" height="100"/%3E%3Ctext x="50" y="55" text-anchor="middle" fill="%239ca3af" font-size="12"%3EURL%3C/text%3E%3C/svg%3E';
    };
  }

  img.src = imageUrl;
  preview.classList.add('active');
}

/**
 * Show error message
 */
function showError(modal, message) {
  // Use toast if available
  if (typeof window.showToast === 'function') {
    window.showToast(message, 'removed');
  } else {
    console.error('Image upload error:', message);
  }
}

/**
 * Show warning message
 */
function showWarning(modal, message) {
  if (typeof window.showToast === 'function') {
    window.showToast(message, 'info');
  }
}

/**
 * Setup swipe to dismiss
 */
function setupSwipeToDismiss(modal) {
  let touchStartY = 0;
  let isDragging = false;

  const handleTouchStart = (e) => {
    const handle = e.target.closest('.image-upload-modal-handle');
    if (handle) {
      touchStartY = e.touches[0].clientY;
      isDragging = false;
    }
  };

  const handleTouchMove = (e) => {
    if (touchStartY === 0) return;

    const diff = e.touches[0].clientY - touchStartY;
    if (diff > 0) {
      isDragging = true;
      modal.style.transform = `translateY(${diff}px)`;
      modal.style.transition = 'none';
      e.preventDefault();
    }
  };

  const handleTouchEnd = () => {
    const diff = parseInt(modal.style.transform.replace(/[^-\d]/g, '')) || 0;

    modal.style.transition = 'transform 0.2s ease-out';
    modal.style.transform = '';

    if (isDragging && diff > 100) {
      closeUploadModal(null);
    }

    touchStartY = 0;
    isDragging = false;
  };

  modal.addEventListener('touchstart', handleTouchStart, { passive: true });
  modal.addEventListener('touchmove', handleTouchMove, { passive: false });
  modal.addEventListener('touchend', handleTouchEnd, { passive: true });
}

/**
 * Close the modal
 */
function closeUploadModal(result) {
  if (!activeUploadModal) return;

  const capturedModal = activeUploadModal;
  const { overlay, resolve, escHandler, scrollY } = capturedModal;

  // Animate out
  overlay.classList.remove('active');
  document.body.classList.remove('modal-open');
  document.body.style.top = '';

  // Restore scroll position
  if (typeof scrollY === 'number') {
    window.scrollTo(0, scrollY);
  }

  // Remove escape handler
  if (escHandler) {
    document.removeEventListener('keydown', escHandler);
  }

  // Remove after animation
  setTimeout(() => {
    overlay.remove();
    if (resolve) {
      resolve(result || { selected: false });
    }
    // Only clear activeUploadModal if it still points to this modal
    // (a new modal may have been opened before this timeout fires)
    if (activeUploadModal === capturedModal) {
      activeUploadModal = null;
    }
  }, 300);
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================
// EXPORTS
// ============================================================

export { closeUploadModal };

// Make available globally
window.imageUploadModal = {
  show: showImageUploadModal,
  close: closeUploadModal
};
