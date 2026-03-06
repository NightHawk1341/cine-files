/**
 * Legal Page Script
 * Handles navigation highlighting, smooth scrolling, and mobile TOC
 */

import { showMobileBottomSheet, closeMobileBottomSheet, actionSheet } from '../modules/mobile-modal.js';
import { isVKMiniApp } from '../core/vk-miniapp.js';
import { isMAXMiniApp } from '../core/max-miniapp.js';

// ============ PAGE STATE ============
let sectionObserver = null;
let tocLinkHandlers = [];
let fabClickHandler = null;
let contactButtonHandlers = [];
let isLegalPageInitialized = false;

/**
 * Show contact modal with Telegram and VK options
 */
function showContactModal() {
  const inVK = isVKMiniApp();
  const inMAX = isMAXMiniApp();
  const actions = [];

  if (!inVK && !inMAX) {
    actions.push({
      text: 'Telegram',
      icon: 'socials-telegram',
      href: 'https://t.me/buy_tribute',
      style: 'primary'
    });
  }

  if (!inVK) {
    actions.push({
      text: 'ВКонтакте',
      icon: 'socials-vk',
      href: 'https://vk.com/buy_tribute'
    });
  }

  actionSheet({
    title: 'Связаться с нами',
    message: 'Выберите удобный способ связи\nEmail: buy-tribute@yandex.ru',
    actions,
    cancelText: 'Закрыть'
  });
}

/**
 * Initialize legal page
 */
async function initLegalPage() {
  if (isLegalPageInitialized) {
    return;
  }
  isLegalPageInitialized = true;

  initTocNavigation();
  initMobileToc();
  initContactButtons();
  initScrollToTop();
}

/**
 * Initialize contact buttons to open contact modal
 */
function initContactButtons() {
  const contactButtons = document.querySelectorAll('.legal-contact-modal-btn');

  contactButtons.forEach(btn => {
    const handler = (e) => {
      e.preventDefault();
      showContactModal();
    };
    btn.addEventListener('click', handler);
    contactButtonHandlers.push({ element: btn, handler });
  });
}

/**
 * Initialize jump-to-top button for legal page
 */
function initScrollToTop() {
  const btn = document.getElementById('legal-scroll-top-btn');
  if (!btn) return;

  btn.classList.add('visible');

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/**
 * Initialize TOC navigation with scroll highlighting
 */
function initTocNavigation() {
  const sections = document.querySelectorAll('.legal-section');
  const tocLinks = document.querySelectorAll('.legal-toc-link');

  if (sections.length === 0 || tocLinks.length === 0) return;

  // Smooth scroll for all TOC links (desktop sidebar)
  tocLinks.forEach(link => {
    const handler = (e) => {
      e.preventDefault();
      const targetId = link.getAttribute('href').substring(1);
      const targetSection = document.getElementById(targetId);

      if (targetSection) {
        targetSection.scrollIntoView({ behavior: 'smooth' });
        // Update URL without triggering navigation
        history.pushState(null, '', `#${targetId}`);
      }
    };
    link.addEventListener('click', handler);
    tocLinkHandlers.push({ element: link, handler });
  });

  // Update active link on scroll
  const observerOptions = {
    root: null,
    rootMargin: '-20% 0px -60% 0px',
    threshold: 0
  };

  sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;

        // Update all TOC links
        tocLinks.forEach(link => {
          link.classList.remove('active');
          if (link.getAttribute('href') === `#${id}`) {
            link.classList.add('active');
          }
        });
      }
    });
  }, observerOptions);

  sections.forEach(section => {
    sectionObserver.observe(section);
  });

  // Handle initial hash in URL
  if (window.location.hash) {
    const targetId = window.location.hash.substring(1);
    const targetSection = document.getElementById(targetId);

    if (targetSection) {
      setTimeout(() => {
        targetSection.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }
}

/**
 * Initialize mobile TOC floating button
 */
function initMobileToc() {
  const fab = document.getElementById('legal-toc-fab');

  if (!fab) return;

  // TOC items for the bottom sheet
  const tocItems = [
    { id: 'requisites', label: 'Реквизиты' },
    { id: 'offer', label: 'Оферта' },
    { id: 'privacy', label: 'Конфиденциальность' },
    { id: 'delivery', label: 'Доставка' },
    { id: 'payment', label: 'Оплата' },
    { id: 'returns', label: 'Возврат' },
    { id: 'copyright', label: 'Авторские права' }
  ];

  // Generate content HTML
  const generateContent = () => {
    return tocItems.map(item => `
      <a href="#${item.id}" class="mobile-bottom-sheet-item" data-sheet-item data-section="${item.id}">
        ${item.label}
      </a>
    `).join('');
  };

  // Open TOC on FAB click
  fabClickHandler = () => {
    showMobileBottomSheet({
      id: 'legal-toc-sheet',
      content: generateContent(),
      className: 'legal-toc-sheet',
      onItemClick: (e, item) => {
        e.preventDefault();
        const sectionId = item.dataset.section;
        const targetSection = document.getElementById(sectionId);

        if (targetSection) {
          // Close sheet first
          closeMobileBottomSheet();

          // Scroll to section after sheet closes
          setTimeout(() => {
            targetSection.scrollIntoView({ behavior: 'smooth' });
            history.pushState(null, '', `#${sectionId}`);
          }, 100);
        }
      }
    });
  };
  fab.addEventListener('click', fabClickHandler);
}

/**
 * Cleanup legal page (called when navigating away via SPA router)
 */
function cleanupLegalPage() {

  // Reset initialization flag
  isLegalPageInitialized = false;

  // Disconnect intersection observer
  if (sectionObserver) {
    sectionObserver.disconnect();
    sectionObserver = null;
  }

  // Remove TOC link handlers
  tocLinkHandlers.forEach(({ element, handler }) => {
    element.removeEventListener('click', handler);
  });
  tocLinkHandlers = [];

  // Remove FAB click handler
  if (fabClickHandler) {
    const fab = document.getElementById('legal-toc-fab');
    if (fab) {
      fab.removeEventListener('click', fabClickHandler);
    }
    fabClickHandler = null;
  }

  // Remove contact button handlers
  contactButtonHandlers.forEach(({ element, handler }) => {
    element.removeEventListener('click', handler);
  });
  contactButtonHandlers = [];

  // Close any open bottom sheets
  closeMobileBottomSheet();
}

// Register with SPA router
if (typeof window.registerPage === 'function') {
  window.registerPage('/legal', {
    init: initLegalPage,
    cleanup: cleanupLegalPage
  });
}

// Auto-initialize when script loads (for direct page visits)
const isLegalPagePath = window.location.pathname === '/legal';
if (isLegalPagePath) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLegalPage);
  } else {
    initLegalPage();
  }
}
