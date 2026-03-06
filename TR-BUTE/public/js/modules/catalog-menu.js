// ============================================================
// CATALOG MENU MODULE
// Side panel (desktop) / mobile modal for catalog navigation
// ============================================================

const MOBILE_BREAKPOINT = 1024;
let catalogsData = null;
let panelElement = null;
let backdropElement = null;
let isOpen = false;

/**
 * Fetch catalogs from API on load and cache the result
 */
async function fetchCatalogs() {
  try {
    const res = await fetch('/api/catalogs');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    catalogsData = Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Failed to fetch catalogs:', err);
    catalogsData = [];
  }
}

/**
 * Build the certificate link HTML (above catalog list)
 */
function buildCertificateLinkHTML() {
  return `
    <a href="/certificate" class="catalog-menu-item catalog-menu-certificate" data-catalog-url="/certificate">
      <svg width="16" height="16"><use href="#gift"></use></svg>
      <span>Подарочный сертификат</span>
    </a>
  `;
}

/**
 * Build the catalog list HTML (text-only, no images)
 */
function buildCatalogListHTML() {
  if (!catalogsData || catalogsData.length === 0) {
    return '<div class="catalog-menu-empty">Нет каталогов</div>';
  }

  return catalogsData.map(cat => {
    const param = cat.slug || cat.id;
    const url = `/catalog?id=${param}`;
    return `<a href="${url}" class="catalog-menu-item" data-catalog-url="${url}">${cat.title}</a>`;
  }).join('');
}

/**
 * Create the desktop side panel (injected once, toggled via class)
 */
function createPanel() {
  if (panelElement) return;

  backdropElement = document.createElement('div');
  backdropElement.className = 'catalog-menu-backdrop';
  backdropElement.addEventListener('click', closePanel);

  panelElement = document.createElement('div');
  panelElement.className = 'catalog-menu-panel';
  panelElement.innerHTML = `
    <div class="catalog-menu-header">
      <span class="catalog-menu-title">Каталоги</span>
    </div>
    <div class="catalog-menu-certificate-section">${buildCertificateLinkHTML()}</div>
    <div class="catalog-menu-list"></div>
  `;

  document.body.appendChild(backdropElement);
  document.body.appendChild(panelElement);

  // Navigation handler for catalog links
  panelElement.addEventListener('click', (e) => {
    const link = e.target.closest('.catalog-menu-item');
    if (!link) return;
    if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      const url = link.dataset.catalogUrl;
      if (typeof smoothNavigate === 'function') {
        smoothNavigate(url);
      } else {
        window.location.href = url;
      }
    }
  });
}

/**
 * Open the desktop side panel
 */
function openPanel() {
  createPanel();
  const listEl = panelElement.querySelector('.catalog-menu-list');
  listEl.innerHTML = buildCatalogListHTML();

  requestAnimationFrame(() => {
    backdropElement.classList.add('active');
    panelElement.classList.add('active');
    if (typeof window.addBackdropGrain === 'function') {
      window.addBackdropGrain(backdropElement);
    }
  });

  isOpen = true;
  updateBurgerActive(true);

  // ESC to close
  document.addEventListener('keydown', handleEsc);
}

/**
 * Close the desktop side panel
 */
function closePanel() {
  if (!panelElement) return;

  if (typeof window.removeBackdropGrain === 'function') {
    window.removeBackdropGrain(backdropElement);
  }

  backdropElement.classList.remove('active');
  panelElement.classList.remove('active');
  isOpen = false;
  updateBurgerActive(false);
  document.removeEventListener('keydown', handleEsc);
}

function handleEsc(e) {
  if (e.key === 'Escape') closePanel();
}

/**
 * Open via mobile modal
 */
function openMobileModal() {
  const content = `<div class="catalog-menu-certificate-section">${buildCertificateLinkHTML()}</div><div class="catalog-menu-list">${buildCatalogListHTML()}</div>`;

  updateBurgerActive(true);

  window.showMobileModal({
    type: 'content',
    title: 'Каталоги',
    content: content,
    onClose: () => {
      updateBurgerActive(false);
    }
  });

  // Attach navigation handlers to modal links
  setTimeout(() => {
    const overlay = document.querySelector('.mobile-modal-overlay');
    if (!overlay) return;
    overlay.addEventListener('click', (e) => {
      const link = e.target.closest('.catalog-menu-item');
      if (!link) return;
      if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        const url = link.dataset.catalogUrl;

        // Close modal first on mobile
        if (window.mobileModal && window.mobileModal.close) {
          window.mobileModal.close();
        }

        setTimeout(() => {
          if (typeof smoothNavigate === 'function') {
            smoothNavigate(url);
          } else {
            window.location.href = url;
          }
        }, 150);
      }
    });
  }, 50);
}

/**
 * Update burger button active state
 */
function updateBurgerActive(active) {
  const btn = document.getElementById('header-burger-btn');
  if (btn) btn.classList.toggle('active', active);
}

/**
 * Toggle the catalog menu (called by burger button click)
 */
function toggleCatalogMenu() {
  if (window.innerWidth <= MOBILE_BREAKPOINT) {
    openMobileModal();
  } else {
    if (isOpen) {
      closePanel();
    } else {
      openPanel();
    }
  }
}

/**
 * Initialize the catalog menu module
 */
function initCatalogMenu() {
  fetchCatalogs();
}

// Auto-initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCatalogMenu);
} else {
  initCatalogMenu();
}

// Expose globally
window.toggleCatalogMenu = toggleCatalogMenu;
window.closeCatalogMenu = closePanel;
