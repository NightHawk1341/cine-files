/**
 * Certificate Page Script
 * Handles certificate template selection, creation, and redemption
 */

import { syncCartToServer } from './core/data-sync.js';
import { isLoggedIn, getCurrentUser, getAccessToken } from './core/auth.js';
import { initFAQPopup, addFAQButton } from './modules/faq-popup.js';

// State
let selectedTemplate = null;
let verifiedCertificate = null;
let currentMode = 'gifter'; // 'gifter' or 'recipient'
let allTemplates = [];
let currentCarouselIndex = 0;

/**
 * Triggers haptic feedback
 * Uses subtle 'soft' feedback for better UX
 */
const triggerHaptic = (duration = 5) => {
  // Try Telegram WebApp haptic first
  if (window.Telegram?.WebApp?.HapticFeedback) {
    const style = duration >= 15 ? 'light' : 'soft';
    window.Telegram.WebApp.HapticFeedback.impactOccurred(style);
    return;
  }
  // Fallback to vibration API
  if ('vibrate' in navigator) {
    navigator.vibrate(duration);
  }
};

const showToast = (message, type = 'success') => {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
  }
};

// Page-level state for cleanup
let isCertificatePageInitialized = false;

/**
 * Cleanup certificate page (called when navigating away via SPA router)
 */
function cleanupCertificatePage() {

  // Reset initialization flag for re-entry
  isCertificatePageInitialized = false;

  // Reset module state
  selectedTemplate = null;
  verifiedCertificate = null;
  currentMode = 'gifter';
  allTemplates = [];
  currentCarouselIndex = 0;
}

/**
 * Initialize certificate page
 */
async function initCertificatePage() {
  if (isCertificatePageInitialized) {
    return;
  }
  isCertificatePageInitialized = true;

  // Wait for auth to initialize first
  if (typeof window.authReady === 'undefined') {
    // Import and initialize auth module
    const { init: initAuth } = await import('./core/auth.js');
    await initAuth();
  } else {
    await window.authReady;
  }

  // Initialize FAQ popup
  initFAQPopup('certificate');
  addFAQButton('.certificate-title');

  await loadTemplates();
  setupEventListeners();
  checkUserAuth();
}

// Register with SPA router
if (typeof window.registerPage === 'function') {
  window.registerPage('/certificate', {
    init: initCertificatePage,
    cleanup: cleanupCertificatePage
  });
}

// Auto-initialize when script loads (for direct page visits only)
const isCertificatePagePath = window.location.pathname === '/certificate' || window.location.pathname === '/certificate.html' || window.location.pathname === '/pages/certificate.html';
if (isCertificatePagePath) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCertificatePage);
  } else {
    initCertificatePage();
  }
}

/**
 * Load certificate templates from API
 */
async function loadTemplates() {
  try {
    const response = await fetch('/api/certificates/templates');
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || 'Failed to load templates');
    }

    renderTemplates(data.templates);
  } catch (error) {
    console.error('Error loading templates:', error);
    showToast('Ошибка при загрузке шаблонов', 'error');

    // Show error message in grid
    const grid = document.getElementById('templates-grid');
    if (grid) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-secondary);">
          <p>Не удалось загрузить шаблоны</p>
          <button onclick="location.reload()" style="margin-top: 15px; padding: 10px 20px; background: var(--primary); color: #000; border: none; border-radius: 6px; cursor: pointer;">
            Попробовать снова
          </button>
        </div>
      `;
    }
  }
}

/**
 * Render certificate templates in carousel
 */
function renderTemplates(templates) {
  const carousel = document.getElementById('templates-carousel');
  const indicatorsContainer = document.getElementById('carousel-indicators');
  const prevBtn = document.querySelector('.carousel-prev');
  const nextBtn = document.querySelector('.carousel-next');

  if (!carousel) return;

  allTemplates = templates;

  if (!templates || templates.length === 0) {
    carousel.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
        <p>Нет доступных шаблонов</p>
      </div>
    `;
    return;
  }

  // Render carousel items
  carousel.innerHTML = templates.map(template => `
    <div class="template-carousel-item" data-template-id="${template.id}" data-template-title="${template.title}" data-template-image="${template.image_url}">
      <div class="template-image-wrapper">
        <img src="${template.image_url}" alt="${template.title}" loading="lazy" class="template-zoom-image" style="cursor: pointer;" title="Нажмите, чтобы увеличить">
        <div class="template-selected-badge">
          <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
            <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
          </svg>
          Выбрано
        </div>
      </div>
      <div class="template-info">
        <h4 class="template-title">${template.title}</h4>
        <button class="template-choose-btn">Выбрать</button>
      </div>
    </div>
  `).join('');

  // Setup carousel navigation
  if (templates.length > 1) {
    prevBtn.style.display = 'flex';
    nextBtn.style.display = 'flex';

    prevBtn.onclick = () => {
      navigateCarousel(-1);
      triggerHaptic();
    };

    nextBtn.onclick = () => {
      navigateCarousel(1);
      triggerHaptic();
    };
  }

  // Setup indicators
  if (indicatorsContainer && templates.length > 1) {
    indicatorsContainer.innerHTML = templates.map((_, idx) =>
      `<button class="carousel-indicator ${idx === 0 ? 'active' : ''}" data-index="${idx}"></button>`
    ).join('');

    document.querySelectorAll('.carousel-indicator').forEach((indicator, idx) => {
      indicator.addEventListener('click', () => {
        currentCarouselIndex = idx;
        updateCarouselDisplay();
        triggerHaptic();
      });
    });
  }

  // Setup choose buttons
  document.querySelectorAll('.template-choose-btn').forEach((btn, idx) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = btn.closest('.template-carousel-item');
      selectTemplate(item);
      triggerHaptic();
    });
  });

  // Setup zoom on image click
  document.querySelectorAll('.template-zoom-image').forEach((img, idx) => {
    img.addEventListener('click', (e) => {
      e.stopPropagation();
      const allImages = allTemplates.map(t => t.image_url);
      window.openZoom(allImages, currentCarouselIndex);
      triggerHaptic();
    });
  });

  // Show first template
  updateCarouselDisplay();
}

/**
 * Navigate carousel
 */
function navigateCarousel(direction) {
  currentCarouselIndex += direction;

  if (currentCarouselIndex < 0) {
    currentCarouselIndex = allTemplates.length - 1;
  } else if (currentCarouselIndex >= allTemplates.length) {
    currentCarouselIndex = 0;
  }

  updateCarouselDisplay();
}

/**
 * Update carousel display
 */
function updateCarouselDisplay() {
  const items = document.querySelectorAll('.template-carousel-item');
  const indicators = document.querySelectorAll('.carousel-indicator');

  items.forEach((item, idx) => {
    if (idx === currentCarouselIndex) {
      item.classList.add('active');
      item.style.display = 'flex';
    } else {
      item.classList.remove('active');
      item.style.display = 'none';
    }
  });

  indicators.forEach((indicator, idx) => {
    if (idx === currentCarouselIndex) {
      indicator.classList.add('active');
    } else {
      indicator.classList.remove('active');
    }
  });
}

/**
 * Select a certificate template
 */
function selectTemplate(item) {
  // Remove previous selection
  document.querySelectorAll('.template-carousel-item').forEach(c => c.classList.remove('selected'));

  // Add selection to clicked item
  item.classList.add('selected');

  // Store selected template data
  selectedTemplate = {
    id: parseInt(item.dataset.templateId),
    title: item.dataset.templateTitle,
    image: item.dataset.templateImage
  };

  showToast('Дизайн выбран', 'success');
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Mode toggle buttons
  document.querySelectorAll('.mode-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      switchMode(mode);
      triggerHaptic();
    });
  });

  // Add to cart button
  const addToCartBtn = document.getElementById('add-to-cart-btn');
  if (addToCartBtn) {
    addToCartBtn.addEventListener('click', addCertificateToCart);
  }

  // Verify certificate button
  const verifyBtn = document.getElementById('verify-certificate-btn');
  if (verifyBtn) {
    verifyBtn.addEventListener('click', verifyCertificateCode);
  }

  // Redeem certificate button
  const redeemBtn = document.getElementById('redeem-certificate-btn');
  if (redeemBtn) {
    redeemBtn.addEventListener('click', redeemCertificate);
  }

  // Format certificate code input with auto-dash: XXXX-XXXX
  const codeInput = document.getElementById('certificate-code');
  if (codeInput) {
    codeInput.addEventListener('input', (e) => {
      // Strip everything except alphanumeric
      let raw = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      // Limit to 8 chars (two groups of 4)
      raw = raw.substring(0, 8);
      // Insert dash after first 4 chars
      if (raw.length > 4) {
        raw = raw.substring(0, 4) + '-' + raw.substring(4);
      }
      e.target.value = raw;
    });
  }
}

/**
 * Switch between gifter and recipient modes
 */
function switchMode(mode) {
  currentMode = mode;

  // Update button states
  document.querySelectorAll('.mode-toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

  // Update page title
  const pageTitle = document.getElementById('certificate-page-title');
  if (pageTitle) {
    pageTitle.textContent = mode === 'gifter' ? 'Подарочный сертификат' : 'Использовать сертификат';
  }

  // Show/hide mode sections
  document.getElementById('gifter-mode').style.display = mode === 'gifter' ? 'block' : 'none';
  document.getElementById('recipient-mode').style.display = mode === 'recipient' ? 'block' : 'none';

  // Check auth for recipient mode
  if (mode === 'recipient') {
    checkUserAuth();
  }
}

/**
 * Check if user is authenticated
 */
async function checkUserAuth() {
  const loginRequired = document.getElementById('login-required');
  const redemption = document.getElementById('certificate-redemption');

  // Simple check - auth should be ready by now
  const userLoggedIn = isLoggedIn();
  const currentUser = getCurrentUser();

  if (loginRequired && redemption) {
    if (userLoggedIn && currentUser) {
      loginRequired.style.display = 'none';
      redemption.style.display = 'block';
      loadUserActiveCertsForPage();
    } else {
      loginRequired.style.display = 'block';
      redemption.style.display = 'none';
    }
  }
}

/**
 * Add certificate to cart
 */
async function addCertificateToCart() {
  try {
    // Validation
    const recipientName = document.getElementById('recipient-name').value.trim();
    const amount = parseFloat(document.getElementById('certificate-amount').value);

    if (!selectedTemplate) {
      showToast('Пожалуйста, выберите дизайн сертификата', 'error');
      return;
    }

    if (!recipientName) {
      showToast('Пожалуйста, введите имя получателя', 'error');
      return;
    }

    if (!amount || amount < 10) {
      showToast('Минимальная сумма сертификата 10₽', 'error');
      return;
    }

    if (amount > 50000) {
      showToast('Максимальная сумма сертификата 50000₽', 'error');
      return;
    }

    // Don't create certificate in DB until order is paid (avoid abandoned cart entries)
    const cartKey = `cert_temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Initialize cart if needed
    if (!window.cart) {
      window.cart = {};
    }

    // Add certificate to cart (no DB entry yet - created on payment)
    window.cart[cartKey] = {
      type: 'certificate',
      template_id: selectedTemplate.id,
      recipient_name: recipientName,
      amount: amount,
      template_title: selectedTemplate.title,
      template_image: selectedTemplate.image,
      quantity: 1,
      // Flag to indicate this needs DB creation on checkout
      pending_creation: true
    };

    // Save to localStorage
    try {
      localStorage.setItem('tributeCart', JSON.stringify(window.cart));
    } catch (e) {
      console.error('Error saving cart to localStorage:', e);
    }

    // Sync to server if logged in
    if (isLoggedIn() && typeof syncCartToServer === 'function') {
      await syncCartToServer(window.cart);
    }

    // Update cart counter
    window.dispatchEvent(new Event('cartUpdated'));

    // Show success message
    showToast('Сертификат добавлен в корзину!', 'success', 3000);
    triggerHaptic(20);

    // Clear form
    document.getElementById('recipient-name').value = '';
    document.getElementById('certificate-amount').value = '';
    document.querySelectorAll('.template-carousel-item').forEach(c => c.classList.remove('selected'));
    selectedTemplate = null;

  } catch (error) {
    console.error('Error adding certificate to cart:', error);
    showToast(error.message || 'Ошибка при создании сертификата', 'error');
  }
}

/**
 * Verify certificate code for redemption
 */
async function verifyCertificateCode() {
  try {
    const code = document.getElementById('certificate-code').value.trim().toUpperCase().replace(/-/g, '');

    if (!code || code.length < 8) {
      showToast('Пожалуйста, введите полный код сертификата', 'error');
      return;
    }

    // Call API to verify certificate (send without dashes)
    const response = await fetch(`/api/certificates/verify/${code}`);
    const data = await response.json();

    if (!data.success) {
      showToast(data.message || 'Сертификат не найден', 'error');
      return;
    }

    // Store verified certificate
    verifiedCertificate = data.certificate;

    // Display certificate details
    displayVerifiedCertificate(verifiedCertificate);
    showToast('Сертификат подтвержден!', 'success');
    triggerHaptic(20);

  } catch (error) {
    console.error('Error verifying certificate:', error);
    showToast('Ошибка при проверке сертификата', 'error');
  }
}

/**
 * Display verified certificate details
 */
function displayVerifiedCertificate(cert) {
  const detailsSection = document.getElementById('certificate-details');
  if (!detailsSection) return;

  // Update details
  document.getElementById('verified-recipient').textContent = cert.recipient_name;
  document.getElementById('verified-amount').textContent = `${cert.amount.toLocaleString('ru-RU')}₽`;
  document.getElementById('verified-template').textContent = cert.template_title;

  // Show generated certificate image if available, otherwise template preview
  const verifiedImage = document.getElementById('verified-image');
  verifiedImage.src = cert.cert_image_url || cert.template_image;

  // Show/hide certificate image actions (download + copy code)
  const actionsContainer = document.getElementById('certificate-image-actions');
  if (actionsContainer) {
    if (cert.cert_image_url) {
      actionsContainer.style.display = 'flex';
      const downloadBtn = document.getElementById('download-certificate-btn');
      if (downloadBtn) {
        downloadBtn.onclick = () => {
          const a = document.createElement('a');
          a.href = cert.cert_image_url;
          a.download = `certificate-${cert.code}.jpg`;
          a.target = '_blank';
          a.click();
        };
      }
      const copyCodeBtn = document.getElementById('copy-code-btn');
      if (copyCodeBtn) {
        copyCodeBtn.onclick = () => {
          navigator.clipboard.writeText(cert.code).then(() => {
            showToast('Код скопирован!', 'success');
          }).catch(() => {
            // Fallback for older browsers
            const input = document.createElement('input');
            input.value = cert.code;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
            showToast('Код скопирован!', 'success');
          });
        };
      }
    } else {
      actionsContainer.style.display = 'none';
    }
  }

  // Show details
  detailsSection.style.display = 'block';
}

/**
 * Redeem certificate (add to cart as credit)
 */
async function redeemCertificate() {
  try {
    if (!verifiedCertificate) {
      showToast('Сначала проверьте код сертификата', 'error');
      return;
    }

    // Add redeemed certificate to cart
    const cartKey = `cert_redeemed_${verifiedCertificate.id}`;

    // Initialize cart if needed
    if (!window.cart) {
      window.cart = {};
    }

    // Enforce one certificate per order: remove existing redemptions
    Object.keys(window.cart).forEach(k => {
      if (window.cart[k].type === 'certificate_redemption') delete window.cart[k];
    });

    // Add certificate as credit to cart
    window.cart[cartKey] = {
      type: 'certificate_redemption',
      certificate_id: verifiedCertificate.id,
      certificate_code: verifiedCertificate.code,
      recipient_name: verifiedCertificate.recipient_name,
      amount: -verifiedCertificate.amount, // Negative amount = discount
      min_cart_amount: verifiedCertificate.min_cart_amount || 0,
      template_title: verifiedCertificate.template_title,
      template_image: verifiedCertificate.template_image,
      quantity: 1
    };

    // Save to localStorage
    try {
      localStorage.setItem('tributeCart', JSON.stringify(window.cart));
    } catch (e) {
      console.error('Error saving cart to localStorage:', e);
    }

    // Sync to server if logged in
    if (isLoggedIn() && typeof syncCartToServer === 'function') {
      await syncCartToServer(window.cart);
    }

    // Update cart counter
    window.dispatchEvent(new Event('cartUpdated'));

    // Show success message and navigate to cart
    showToast('Сертификат добавлен! Перенаправление в корзину...', 'success', 3000);
    triggerHaptic(20);

    // Redirect to cart after 1 second using SPA navigation
    setTimeout(() => {
      if (typeof window.smoothNavigate === 'function') {
        window.smoothNavigate('/cart');
      } else {
        window.location.href = '/cart';
      }
    }, 1000);

  } catch (error) {
    console.error('Error redeeming certificate:', error);
    showToast('Ошибка при использовании сертификата', 'error');
  }
}

/**
 * Load user's active certificates on the certificate page recipient section
 */
async function loadUserActiveCertsForPage() {
  const container = document.getElementById('cert-page-active-certs');
  if (!container) return;
  const user = getCurrentUser();
  if (!user) return;
  try {
    const token = getAccessToken();
    const response = await fetch(`/api/certificates/user/${user.id}`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    if (!response.ok) return;
    const data = await response.json();
    const activeCerts = (data.certificates || []).filter(c =>
      (c.status === 'paid' || c.status === 'delivered') && c.relationship === 'purchased'
    );
    if (activeCerts.length === 0) return;

    container.innerHTML = '';
    const label = document.createElement('div');
    label.className = 'cart-cert-active-label';
    label.textContent = 'Ваши сертификаты:';
    container.appendChild(label);

    const chipsRow = document.createElement('div');
    chipsRow.className = 'cart-cert-chips-row';
    activeCerts.forEach(cert => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'cart-cert-active-chip';
      chip.innerHTML = `<span class="cart-cert-chip-amount">${Number(cert.amount).toLocaleString('ru-RU')} ₽</span>`;
      chip.title = cert.certificate_code;
      chip.addEventListener('click', () => {
        const input = document.getElementById('certificate-code');
        if (input) {
          input.value = cert.certificate_code;
          input.dispatchEvent(new Event('input'));
        }
      });
      chipsRow.appendChild(chip);
    });
    container.appendChild(chipsRow);
  } catch (err) {
    console.warn('Failed to load user certificates:', err);
  }
}

// Export for potential use by other modules
export {
  addCertificateToCart,
  verifyCertificateCode,
  redeemCertificate
};
