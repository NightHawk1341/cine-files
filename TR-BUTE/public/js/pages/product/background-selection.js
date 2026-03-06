/**
 * Background Selection Module for Custom Products
 * Allows users to select or upload backgrounds for transparent PNG products
 */

// Store user's selected background for each product
let userBackgroundSelections = {};

// Load from localStorage
try {
  const stored = localStorage.getItem('tributeCustomBackgrounds');
  if (stored) {
    userBackgroundSelections = JSON.parse(stored);
  }
} catch (e) {
  console.error('Error loading background selections:', e);
}

/**
 * Save background selections to localStorage
 */
function saveBackgroundSelections() {
  try {
    localStorage.setItem('tributeCustomBackgrounds', JSON.stringify(userBackgroundSelections));
  } catch (e) {
    console.error('Error saving background selections:', e);
  }
}

/**
 * Get admin-provided background images for a product
 * @param {number} productId
 * @param {Array} allImages - All product images
 * @returns {Array} Background images with extra="фон"
 */
export function getBackgroundImages(productId, allImages) {
  if (!allImages || allImages.length === 0) return [];

  return allImages.filter(img => {
    if (typeof img === 'string') return false;
    return img.extra === 'фон';
  });
}

/**
 * Get the selected background for a product
 * @param {number} productId
 * @param {Array} adminBackgrounds - Admin-provided backgrounds
 * @returns {Object} Selected background {url, isUserUpload, displayUrl}
 */
export function getSelectedBackground(productId, adminBackgrounds) {
  const selection = userBackgroundSelections[productId];

  // If user has a selection
  if (selection) {
    // User uploaded a custom background - display it but use admin's first
    if (selection.isUserUpload) {
      return {
        displayUrl: selection.url, // Show user's uploaded image
        actualUrl: adminBackgrounds[0]?.url || null, // But use admin's first background
        isUserUpload: true
      };
    }
    // User selected an admin background
    return {
      displayUrl: selection.url,
      actualUrl: selection.url,
      isUserUpload: false
    };
  }

  // No selection yet - return null (user hasn't chosen)
  return null;
}

/**
 * Set the selected background for a product
 * @param {number} productId
 * @param {string} url - Background URL
 * @param {boolean} isUserUpload - Whether this is a user-uploaded image
 */
export function setSelectedBackground(productId, url, isUserUpload = false) {
  userBackgroundSelections[productId] = {
    url,
    isUserUpload,
    selectedAt: Date.now()
  };
  saveBackgroundSelections();
}

/**
 * Clear background selection for a product
 * @param {number} productId
 */
export function clearBackgroundSelection(productId) {
  delete userBackgroundSelections[productId];
  saveBackgroundSelections();
}

/**
 * Render the background selection section
 * @param {HTMLElement} container - Container element
 * @param {Object} product - Product data
 * @param {Array} adminBackgrounds - Admin-provided background images
 */
export function renderBackgroundSelection(container, product, adminBackgrounds) {
  if (!container) return;

  container.innerHTML = '';

  // Section title
  const title = document.createElement('h3');
  title.className = 'background-selection-title';
  title.textContent = 'Предложенные пользователями фоны';
  container.appendChild(title);

  // Cards container
  const cardsContainer = document.createElement('div');
  cardsContainer.className = 'background-cards';

  // Get current selection
  const currentSelection = getSelectedBackground(product.id, adminBackgrounds);

  // Render admin backgrounds first
  adminBackgrounds.forEach((bg, index) => {
    const card = createBackgroundCard(bg.url, false, index, product.id, adminBackgrounds);
    if (currentSelection && !currentSelection.isUserUpload && currentSelection.displayUrl === bg.url) {
      card.classList.add('selected');
    }
    cardsContainer.appendChild(card);
  });

  // Render user's uploaded background if exists
  if (currentSelection && currentSelection.isUserUpload) {
    const userCard = createBackgroundCard(currentSelection.displayUrl, true, -1, product.id, adminBackgrounds);
    userCard.classList.add('selected');
    cardsContainer.appendChild(userCard);
  }

  // Add upload button (max 5 cards total)
  const totalCards = adminBackgrounds.length + (currentSelection?.isUserUpload ? 1 : 0);
  if (totalCards < 5) {
    const uploadCard = createUploadCard(product.id, adminBackgrounds);
    cardsContainer.appendChild(uploadCard);
  }

  container.appendChild(cardsContainer);
}

/**
 * Create a background card element
 */
function createBackgroundCard(url, isUserUpload, index, productId, adminBackgrounds) {
  const card = document.createElement('div');
  card.className = 'background-card';
  card.setAttribute('data-url', url);
  card.setAttribute('data-user-upload', isUserUpload ? 'true' : 'false');

  const img = document.createElement('img');
  img.src = url;
  img.alt = isUserUpload ? 'Ваш фон' : `Фон ${index + 1}`;
  img.loading = 'lazy';

  card.appendChild(img);

  // Click to select
  card.addEventListener('click', () => {
    // Remove selected from all cards
    card.parentElement.querySelectorAll('.background-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');

    setSelectedBackground(productId, url, isUserUpload);

    // Dispatch event for carousel update
    window.dispatchEvent(new CustomEvent('backgroundSelected', {
      detail: { productId, url, isUserUpload, adminBackgrounds }
    }));
  });

  return card;
}

/**
 * Create upload button card
 */
function createUploadCard(productId, adminBackgrounds) {
  const card = document.createElement('div');
  card.className = 'background-card upload-card';

  const plusIcon = document.createElement('div');
  plusIcon.className = 'upload-plus';
  plusIcon.innerHTML = '<svg width="24" height="24"><use href="#plus-stroke"></use></svg>';

  card.appendChild(plusIcon);

  // Hidden file input
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';

  input.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Intentional failure — guide user to admin-provided backgrounds
    if (window.showToast) {
      window.showToast('Не удалось загрузить изображение, используйте предложенные пользователями варианты', 'error');
    }
    // Reset file input so the same file can be re-selected
    input.value = '';
  });

  card.appendChild(input);

  // Click to open file picker
  card.addEventListener('click', () => {
    input.click();
  });

  return card;
}

/**
 * Check if a product is a custom product (status="custom")
 * @param {Object} product
 * @returns {boolean}
 */
export function isCustomProduct(product) {
  return product && product.status === 'custom';
}

// Export for cart/order pages
export function getBackgroundForCart(productId) {
  // Get stored backgrounds from localStorage
  try {
    const stored = localStorage.getItem('tributeCustomBackgrounds');
    if (stored) {
      const selections = JSON.parse(stored);
      const selection = selections[productId];

      if (selection) {
        // Always return the admin's first background for actual use
        // But include display URL for preview
        return {
          displayUrl: selection.url,
          actualUrl: selection.isUserUpload ? null : selection.url, // Admin's will be set later
          isUserUpload: selection.isUserUpload
        };
      }
    }
  } catch (e) {
    console.error('Error getting background for cart:', e);
  }
  return null;
}

// Make available globally for non-module scripts
window.BackgroundSelection = {
  getBackgroundImages,
  getSelectedBackground,
  setSelectedBackground,
  clearBackgroundSelection,
  renderBackgroundSelection,
  isCustomProduct,
  getBackgroundForCart
};
