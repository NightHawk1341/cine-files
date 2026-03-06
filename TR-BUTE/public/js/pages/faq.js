// ============================================================
// FAQ PAGE
// Database-driven FAQ with search and toggleable sections
// ============================================================

import { showSkeletonLoaders } from '../modules/skeleton-loader.js';
import { escapeHtml } from '../core/formatters.js';

// ============ PAGE STATE ============
let allCategories = [];
let allItems = {};
let searchQuery = '';
let searchInputHandler = null;
let clearButtonHandler = null;
let isFAQPageInitialized = false;

/**
 * Initialize FAQ page
 */
async function initFAQPage() {
  if (isFAQPageInitialized) {
    return;
  }
  isFAQPageInitialized = true;

  setupSearch();
  await loadFAQData();
}

/**
 * Setup search functionality
 */
function setupSearch() {
  const searchInput = document.getElementById('faq-search-input');
  const clearButton = document.getElementById('faq-search-clear');

  if (!searchInput || !clearButton) return;

  // Handle search input
  searchInputHandler = (e) => {
    searchQuery = e.target.value.trim().toLowerCase();

    // Show/hide clear button
    clearButton.style.display = searchQuery ? 'flex' : 'none';

    // Filter FAQ
    filterFAQ();
  };
  searchInput.addEventListener('input', searchInputHandler);

  // Handle clear button
  clearButtonHandler = () => {
    searchInput.value = '';
    searchQuery = '';
    clearButton.style.display = 'none';
    filterFAQ();
    searchInput.focus();
  };
  clearButton.addEventListener('click', clearButtonHandler);
}

/**
 * Load FAQ data from database
 */
async function loadFAQData() {
  const loadingEl = document.getElementById('faq-loading');
  const errorEl = document.getElementById('faq-error');
  const categoriesEl = document.getElementById('faq-categories');

  try {
    // Hide error and show skeleton loaders
    errorEl.style.display = 'none';
    showSkeletonLoaders(categoriesEl, 'faq', 6);

    // Fetch categories
    const categoriesResponse = await fetch('/api/faq/get-categories');

    if (!categoriesResponse.ok) {
      throw new Error('Failed to fetch categories');
    }

    const categoriesData = await categoriesResponse.json();
    allCategories = categoriesData.data?.categories || categoriesData.categories || [];

    // Fetch items for each category
    for (const category of allCategories) {
      const itemsResponse = await fetch(`/api/faq/get-items?category_id=${category.id}`);

      if (!itemsResponse.ok) {
        throw new Error('Failed to fetch items');
      }

      const itemsData = await itemsResponse.json();
      allItems[category.id] = itemsData.data?.items || itemsData.items || [];
    }

    renderFAQ();

    // Hide loading spinner
    loadingEl.style.display = 'none';

  } catch (error) {
    console.error('[FAQ] Error loading FAQ:', error);
    loadingEl.style.display = 'none';
    categoriesEl.innerHTML = '';
    errorEl.style.display = 'block';
  }
}

/**
 * Render FAQ categories and items
 */
function renderFAQ() {
  const categoriesEl = document.getElementById('faq-categories');
  const emptyEl = document.getElementById('faq-empty');

  if (!categoriesEl) return;

  categoriesEl.innerHTML = '';

  // Filter categories that have matching items
  const filteredCategories = allCategories.filter(category => {
    const items = allItems[category.id] || [];

    if (!searchQuery) return items.length > 0;

    // Check if any items match the search
    return items.some(item => matchesSearch(item));
  });

  // Show empty state if no results
  if (filteredCategories.length === 0) {
    categoriesEl.style.display = 'none';
    emptyEl.style.display = 'block';
    return;
  }

  categoriesEl.style.display = 'flex';
  emptyEl.style.display = 'none';

  // Render each category
  filteredCategories.forEach((category, index) => {
    const categoryEl = createCategoryElement(category, index === 0);
    categoriesEl.appendChild(categoryEl);
  });
}

/**
 * Create category element
 */
function createCategoryElement(category, isFirst) {
  const items = allItems[category.id] || [];

  // Filter items by search
  const filteredItems = searchQuery
    ? items.filter(item => matchesSearch(item))
    : items;

  if (filteredItems.length === 0) return null;

  // Create category container
  const categoryEl = document.createElement('div');
  categoryEl.className = 'faq-category';
  categoryEl.dataset.categoryId = category.id;

  // Don't auto-open any category on initial load
  // Categories will only open on user interaction or search

  // Create category header
  const headerEl = document.createElement('div');
  headerEl.className = 'faq-category-header';

  const titleEl = document.createElement('div');
  titleEl.className = 'faq-category-title';

  const titleTextEl = document.createElement('span');
  titleTextEl.textContent = category.title;
  titleEl.appendChild(titleTextEl);

  const toggleEl = document.createElement('div');
  toggleEl.className = 'faq-category-toggle';
  toggleEl.innerHTML = `
    <svg viewBox="0 0 64 64">
      <use href="#chevron-down"></use>
    </svg>
  `;

  headerEl.appendChild(titleEl);
  headerEl.appendChild(toggleEl);

  // Create category items container
  const itemsEl = document.createElement('div');
  itemsEl.className = 'faq-category-items';

  // Add items
  filteredItems.forEach(item => {
    const itemEl = createItemElement(item);
    itemsEl.appendChild(itemEl);
  });

  // Add event listener for toggling with smooth animation
  headerEl.addEventListener('click', () => {
    const isExpanding = !categoryEl.classList.contains('active');

    if (isExpanding) {
      // Calculate actual height for smooth expand
      const scrollHeight = itemsEl.scrollHeight;
      itemsEl.style.setProperty('--items-height', scrollHeight + 'px');
      categoryEl.classList.add('active');
    } else {
      // For collapse, first set current height explicitly, then animate to 0
      const currentHeight = itemsEl.scrollHeight;
      itemsEl.style.setProperty('--items-height', currentHeight + 'px');
      // Force reflow
      itemsEl.offsetHeight;
      // Now remove active to trigger collapse animation
      categoryEl.classList.remove('active');
    }
  });

  categoryEl.appendChild(headerEl);
  categoryEl.appendChild(itemsEl);

  return categoryEl;
}

/**
 * Create FAQ item element
 */
function createItemElement(item) {
  const itemEl = document.createElement('div');
  itemEl.className = 'faq-item';
  itemEl.dataset.itemId = item.id;

  // Create item header
  const headerEl = document.createElement('div');
  headerEl.className = 'faq-item-header';

  const questionEl = document.createElement('div');
  questionEl.className = 'faq-item-question';
  questionEl.innerHTML = highlightSearch(item.question);

  const toggleEl = document.createElement('div');
  toggleEl.className = 'faq-item-toggle';
  toggleEl.innerHTML = `
    <svg viewBox="0 0 64 64">
      <use href="#chevron-down"></use>
    </svg>
  `;

  headerEl.appendChild(questionEl);
  headerEl.appendChild(toggleEl);

  // Create item content
  const contentEl = document.createElement('div');
  contentEl.className = 'faq-item-content';

  const contentInnerEl = document.createElement('div');
  contentInnerEl.className = 'faq-item-content-inner';

  const answerEl = document.createElement('p');
  answerEl.className = 'faq-item-answer';
  answerEl.innerHTML = highlightSearch(item.answer);
  contentInnerEl.appendChild(answerEl);

  // Add image if provided (using safe DOM methods to prevent XSS)
  if (item.image_url) {
    const imageEl = document.createElement('div');
    imageEl.className = 'faq-item-image';
    const imgTag = document.createElement('img');
    imgTag.src = item.image_url;
    imgTag.alt = item.question;
    imgTag.loading = 'lazy';
    imageEl.appendChild(imgTag);
    contentInnerEl.appendChild(imageEl);
  }

  contentEl.appendChild(contentInnerEl);

  // Add event listener for toggling with smooth animation
  headerEl.addEventListener('click', () => {
    const isExpanding = !itemEl.classList.contains('active');

    if (isExpanding) {
      // Calculate actual height for smooth expand
      const scrollHeight = contentEl.scrollHeight;
      contentEl.style.setProperty('--content-height', scrollHeight + 'px');
      itemEl.classList.add('active');
    } else {
      // For collapse, first set current height explicitly, then animate to 0
      const currentHeight = contentEl.scrollHeight;
      contentEl.style.setProperty('--content-height', currentHeight + 'px');
      // Force reflow
      contentEl.offsetHeight;
      // Now remove active to trigger collapse animation
      itemEl.classList.remove('active');
    }
  });

  itemEl.appendChild(headerEl);
  itemEl.appendChild(contentEl);

  return itemEl;
}

/**
 * Check if item matches search query
 */
function matchesSearch(item) {
  if (!searchQuery) return true;

  const question = item.question.toLowerCase();
  const answer = item.answer.toLowerCase();

  return question.includes(searchQuery) || answer.includes(searchQuery);
}

/**
 * Highlight search terms in text
 */
function highlightSearch(text) {
  if (!searchQuery) return escapeHtml(text);

  const escapedText = escapeHtml(text);
  const escapedQuery = escapeRegex(searchQuery);
  const regex = new RegExp(`(${escapedQuery})`, 'gi');

  return escapedText.replace(regex, '<span class="faq-highlight">$1</span>');
}

/**
 * Escape special regex characters
 */
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Filter FAQ based on search query
 */
function filterFAQ() {
  renderFAQ();

  // If searching, open all categories
  if (searchQuery) {
    const categories = document.querySelectorAll('.faq-category');
    categories.forEach(cat => cat.classList.add('active'));
  }
}

/**
 * Cleanup FAQ page (called when navigating away via SPA router)
 */
function cleanupFAQPage() {

  // Reset initialization flag
  isFAQPageInitialized = false;

  // Remove search input handler
  if (searchInputHandler) {
    const searchInput = document.getElementById('faq-search-input');
    if (searchInput) {
      searchInput.removeEventListener('input', searchInputHandler);
    }
    searchInputHandler = null;
  }

  // Remove clear button handler
  if (clearButtonHandler) {
    const clearButton = document.getElementById('faq-search-clear');
    if (clearButton) {
      clearButton.removeEventListener('click', clearButtonHandler);
    }
    clearButtonHandler = null;
  }

  // Reset state
  allCategories = [];
  allItems = {};
  searchQuery = '';
}

// Register with SPA router
if (typeof window.registerPage === 'function') {
  window.registerPage('/faq', {
    init: initFAQPage,
    cleanup: cleanupFAQPage
  });
}

// Auto-initialize when script loads (for direct page visits)
const isFAQPagePath = window.location.pathname === '/faq';
if (isFAQPagePath) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFAQPage);
  } else {
    initFAQPage();
  }
}
