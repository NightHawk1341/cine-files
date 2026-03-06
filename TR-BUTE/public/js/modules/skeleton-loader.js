/**
 * Skeleton Loader Module
 * Displays skeleton loading states while content is being fetched
 *
 * Features:
 * - Multiple skeleton types (faq, product, order, cart, catalog, picker, gallery, review)
 * - Automatic cleanup via hideSkeletonLoaders() or clearSkeletonLoaders()
 * - Integration with LoadingState manager for coordinated loading
 * - Smooth fade-in transitions when content replaces skeletons
 */

/**
 * Show skeleton loaders in a container
 * @param {HTMLElement} container - Container to show skeletons in
 * @param {string} type - Type of skeleton (faq, product, order, etc.)
 * @param {number} count - Number of skeleton items to show
 * @param {Object} options - Optional configuration
 * @param {string} options.moduleName - Module name for LoadingState tracking
 * @param {boolean} options.append - If true, append skeletons instead of replacing content
 */
export function showSkeletonLoaders(container, type, count = 3, options = {}) {
  if (!container) return;

  const { moduleName, append = false } = options;

  // Register with LoadingState if module name provided
  if (moduleName && window.LoadingState) {
    window.LoadingState.startLoading(moduleName);
  }

  // Clear existing content unless appending
  if (!append) {
    container.innerHTML = '';
  }

  // Mark container as having skeletons
  container.dataset.skeletonType = type;
  container.dataset.skeletonCount = count;

  for (let i = 0; i < count; i++) {
    const skeleton = createSkeleton(type);
    if (skeleton) {
      container.appendChild(skeleton);
    }
  }
}

/**
 * Create a skeleton element based on type
 * @param {string} type - Type of skeleton to create
 * @returns {HTMLElement} Skeleton element
 */
function createSkeleton(type) {
  switch (type) {
    case 'faq':
      return createFAQSkeleton();
    case 'product':
      return createProductSkeleton();
    case 'order':
      return createOrderSkeleton();
    case 'cart':
      return createCartSkeleton();
    case 'catalog':
      return createCatalogSkeleton();
    case 'picker':
      return createPickerSkeleton();
    case 'gallery':
      return createGallerySkeleton();
    case 'review':
    case 'comment':
    case 'suggestion':
      return createReviewSkeleton();
    default:
      return createGenericSkeleton();
  }
}

/**
 * Create FAQ category skeleton
 */
function createFAQSkeleton() {
  const skeleton = document.createElement('div');
  skeleton.className = 'faq-category skeleton';
  skeleton.innerHTML = `
    <div class="faq-category-header">
      <div class="faq-category-title">
        <div class="skeleton-line" style="width: 200px; height: 20px;"></div>
      </div>
      <div class="faq-category-toggle">
        <div class="skeleton-circle" style="width: 24px; height: 24px;"></div>
      </div>
    </div>
    <div class="faq-category-items" style="display: block;">
      <div class="faq-item">
        <div class="faq-item-header">
          <div class="skeleton-line" style="width: 80%; height: 16px; margin-bottom: 8px;"></div>
        </div>
      </div>
      <div class="faq-item">
        <div class="faq-item-header">
          <div class="skeleton-line" style="width: 70%; height: 16px; margin-bottom: 8px;"></div>
        </div>
      </div>
    </div>
  `;
  return skeleton;
}

/**
 * Create product skeleton
 * Matches product card structure with price-row at bottom
 */
function createProductSkeleton() {
  const skeleton = document.createElement('div');
  skeleton.className = 'product-skeleton product skeleton';
  skeleton.innerHTML = `
    <div class="product-card-inner" style="pointer-events: none; display: flex; flex-direction: column; height: 100%;">
      <div class="skeleton-rect" style="width: 100%; aspect-ratio: 5/6; border-radius: 6px;"></div>
      <div style="height: 7px;"></div>
      <div class="skeleton-line" style="width: 80%; height: 16px; margin: 0 0 4px 3px;"></div>
      <div class="skeleton-line" style="width: 60%; height: 16px; margin: 0 0 8px 3px;"></div>
      <div style="margin: 0 -6px -6px -6px; margin-top: auto; border-top: 1px solid var(--divider); border-radius: 0 0 11px 11px; padding: 9px 9px 10px 9px;">
        <div class="skeleton-line" style="width: 35%; height: 13px; margin: 0;"></div>
      </div>
    </div>
  `;
  return skeleton;
}

/**
 * Create order skeleton
 * Matches order card styling with dark theme
 */
function createOrderSkeleton() {
  const skeleton = document.createElement('div');
  skeleton.className = 'order-skeleton skeleton';
  skeleton.innerHTML = `
    <div style="display: flex; gap: 16px; padding: 16px; background: rgba(30, 30, 30, 0.6); border: 1px solid rgba(65, 65, 65, 0.5); border-radius: 12px; margin-bottom: 12px;">
      <div class="skeleton-rect" style="width: 80px; height: 80px; border-radius: 8px; flex-shrink: 0;"></div>
      <div style="flex: 1; display: flex; flex-direction: column; gap: 8px;">
        <div class="skeleton-line" style="width: 60%; height: 16px; margin-bottom: 0;"></div>
        <div class="skeleton-line" style="width: 40%; height: 14px; margin-bottom: 0;"></div>
        <div class="skeleton-line" style="width: 30%; height: 14px; margin-bottom: 0;"></div>
      </div>
    </div>
  `;
  return skeleton;
}

/**
 * Create review/comment/suggestion skeleton
 */
function createReviewSkeleton() {
  const skeleton = document.createElement('div');
  skeleton.className = 'review-skeleton product-review-item';
  skeleton.innerHTML = `
    <div class="skeleton-circle" style="width: 40px; height: 40px; flex-shrink: 0;"></div>
    <div class="product-review-content" style="flex: 1;">
      <div class="product-review-header" style="margin-bottom: 8px;">
        <div class="skeleton-line" style="width: 50%; height: 14px;"></div>
      </div>
      <div class="skeleton-line" style="width: 100%; height: 12px; margin-bottom: 6px;"></div>
      <div class="skeleton-line" style="width: 80%; height: 12px; margin-bottom: 6px;"></div>
      <div class="product-review-footer" style="margin-top: 8px;">
        <div class="skeleton-line" style="width: 30%; height: 12px;"></div>
      </div>
    </div>
  `;
  return skeleton;
}

/**
 * Create cart item skeleton
 * Uses CSS classes from skeleton.css: .skeleton-cart-*
 */
function createCartSkeleton() {
  const skeleton = document.createElement('div');
  skeleton.className = 'skeleton-cart-item skeleton';
  skeleton.innerHTML = `
    <div class="skeleton-cart-image skeleton"></div>
    <div class="skeleton-cart-details">
      <div class="skeleton-cart-title skeleton"></div>
      <div class="skeleton-cart-property skeleton"></div>
      <div class="skeleton-cart-quantity skeleton"></div>
    </div>
  `;
  return skeleton;
}

/**
 * Create catalog category skeleton
 * Matches actual catalog item size (150px wide)
 * Uses 16:9 landscape ratio for catalog thumbnails
 */
function createCatalogSkeleton() {
  const skeleton = document.createElement('div');
  skeleton.className = 'catalog-skeleton catalog skeleton';
  skeleton.style.cssText = 'flex: 0 0 auto; text-align: center; width: 150px;';
  skeleton.innerHTML = `
    <div class="skeleton-rect" style="width: 100%; aspect-ratio: 16 / 9; border-radius: 8px;"></div>
  `;
  return skeleton;
}

/**
 * Create picker skeleton
 * Matches the actual picker layout: centered card image, title, 4 control buttons, counter
 * Card container: 333x400, card image inside fills ~90% width at 100% height
 */
function createPickerSkeleton() {
  const skeleton = document.createElement('div');
  skeleton.className = 'picker-skeleton skeleton';
  skeleton.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; width: 100%;">
      <div class="skeleton-rect" style="width: 280px; max-width: 90%; height: 380px; border-radius: 12px; margin-bottom: 20px;"></div>
      <div class="skeleton-line" style="width: 180px; height: 18px; margin-bottom: 15px; border-radius: 4px;"></div>
      <div style="display: flex; justify-content: center; gap: 15px; margin-bottom: 15px;">
        <div class="skeleton-circle" style="width: 50px; height: 50px;"></div>
        <div class="skeleton-circle" style="width: 50px; height: 50px;"></div>
        <div class="skeleton-circle" style="width: 50px; height: 50px;"></div>
        <div class="skeleton-circle" style="width: 50px; height: 50px;"></div>
      </div>
      <div class="skeleton-line" style="width: 60px; height: 14px; border-radius: 4px;"></div>
    </div>
  `;
  return skeleton;
}

/**
 * Create gallery skeleton
 * Shows placeholder for image gallery items
 */
function createGallerySkeleton() {
  const skeleton = document.createElement('div');
  skeleton.className = 'gallery-skeleton skeleton';
  skeleton.innerHTML = `
    <div class="skeleton-rect" style="width: 100%; aspect-ratio: 1; border-radius: 8px;"></div>
  `;
  return skeleton;
}

/**
 * Create generic skeleton
 */
function createGenericSkeleton() {
  const skeleton = document.createElement('div');
  skeleton.className = 'generic-skeleton skeleton';
  skeleton.innerHTML = `
    <div class="skeleton-line" style="width: 100%; height: 20px; margin-bottom: 12px;"></div>
    <div class="skeleton-line" style="width: 80%; height: 16px; margin-bottom: 8px;"></div>
    <div class="skeleton-line" style="width: 60%; height: 16px;"></div>
  `;
  return skeleton;
}

/**
 * Clear skeleton loaders from a container
 * @param {HTMLElement} container - Container to clear skeletons from
 * @param {Object} options - Optional configuration
 * @param {string} options.moduleName - Module name for LoadingState tracking
 * @param {boolean} options.fadeIn - Add fade-in animation to container content (default: true)
 */
export function clearSkeletonLoaders(container, options = {}) {
  if (!container) return;

  const { moduleName, fadeIn = true } = options;

  // Clear skeleton data attributes
  delete container.dataset.skeletonType;
  delete container.dataset.skeletonCount;

  const skeletons = container.querySelectorAll('.skeleton');
  skeletons.forEach(skeleton => skeleton.remove());

  // Add fade-in class for smooth transition
  if (fadeIn && skeletons.length > 0) {
    container.classList.add('skeleton-fade-in');
    setTimeout(() => container.classList.remove('skeleton-fade-in'), 300);
  }

  // Mark as loaded in LoadingState
  if (moduleName && window.LoadingState) {
    window.LoadingState.finishLoading(moduleName);
  }
}

/**
 * Hide skeleton loaders (alias for clearSkeletonLoaders)
 * @param {HTMLElement} container - Container to clear skeletons from
 * @param {Object} options - Optional configuration
 */
export function hideSkeletonLoaders(container, options = {}) {
  clearSkeletonLoaders(container, options);
}

/**
 * Replace skeletons with actual content
 * Clears skeletons and optionally waits for dependencies
 * @param {HTMLElement} container - Container with skeletons
 * @param {string} content - HTML content to insert
 * @param {Object} options - Optional configuration
 * @param {string} options.moduleName - Module name for LoadingState
 * @param {string[]} options.waitFor - Module names to wait for before showing content
 */
export async function replaceSkeletonsWithContent(container, content, options = {}) {
  if (!container) return;

  const { moduleName, waitFor = [] } = options;

  // Wait for dependencies if specified
  if (waitFor.length > 0 && window.LoadingState) {
    try {
      await window.LoadingState.waitFor(waitFor, 10000);
    } catch (e) {
      console.warn('Timeout waiting for dependencies:', waitFor);
    }
  }

  // Replace content
  container.innerHTML = content;

  // Add fade-in animation
  container.classList.add('skeleton-fade-in');
  setTimeout(() => container.classList.remove('skeleton-fade-in'), 300);

  // Mark as loaded
  if (moduleName && window.LoadingState) {
    window.LoadingState.finishLoading(moduleName);
  }
}
