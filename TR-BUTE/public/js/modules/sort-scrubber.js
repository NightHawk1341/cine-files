/**
 * Sort Scrubber Module
 *
 * A unified scrubber system for fast navigation across different sort types:
 * - title: Alphabetical navigation (numbers, ENG, RUS)
 * - new: Years navigation (2025, 2024, 2023... 2015)
 * - release: Decades navigation (10-е, 00-е, 90-е... 70-е)
 * - development_time: Hours navigation (>100h, >50h, etc.)
 *
 * Features:
 * - Trigger button to show/hide scrubber
 * - Reverse order support for ascending sort
 * - Expandable letter/item picker for alphabetical mode
 */

// ============ SCRUBBER CONFIGURATIONS ============

/**
 * Alphabetical categories for title sorting
 * Order: Numbers, Russian, English (matching actual sort order: 0-9, А-Я, A-Z)
 */
const ALPHABET_CATEGORIES = [
  {
    name: 'numbers',
    label: '#',
    groups: [
      { label: '#', displayLabel: '0-9', chars: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] }
    ]
  },
  {
    name: 'russian',
    label: 'РУС',
    groups: [
      { label: 'А', displayLabel: 'А-Г', chars: ['А', 'Б', 'В', 'Г'] },
      { label: 'Д', displayLabel: 'Д-З', chars: ['Д', 'Е', 'Ё', 'Ж', 'З'] },
      { label: 'И', displayLabel: 'И-Л', chars: ['И', 'Й', 'К', 'Л'] },
      { label: 'М', displayLabel: 'М-П', chars: ['М', 'Н', 'О', 'П'] },
      { label: 'Р', displayLabel: 'Р-У', chars: ['Р', 'С', 'Т', 'У'] },
      { label: 'Ф', displayLabel: 'Ф-Ш', chars: ['Ф', 'Х', 'Ц', 'Ч', 'Ш'] },
      { label: 'Щ', displayLabel: 'Щ-Я', chars: ['Щ', 'Ъ', 'Ы', 'Ь', 'Э', 'Ю', 'Я'] }
    ]
  },
  {
    name: 'english',
    label: 'ENG',
    groups: [
      { label: 'A', displayLabel: 'A-E', chars: ['A', 'B', 'C', 'D', 'E'] },
      { label: 'F', displayLabel: 'F-J', chars: ['F', 'G', 'H', 'I', 'J'] },
      { label: 'K', displayLabel: 'K-O', chars: ['K', 'L', 'M', 'N', 'O'] },
      { label: 'P', displayLabel: 'P-T', chars: ['P', 'Q', 'R', 'S', 'T'] },
      { label: 'U', displayLabel: 'U-Z', chars: ['U', 'V', 'W', 'X', 'Y', 'Z'] }
    ]
  }
];

/**
 * Individual years for novelty (new) sorting — top-level items
 * On hover/touch, shows months for that year in a picker
 */
const YEAR_ITEMS = [
  { value: '2025', label: '2025' },
  { value: '2024', label: '2024' },
  { value: '2023', label: '2023' },
  { value: '2022', label: '2022' },
  { value: '2021', label: '2021' },
  { value: '2020', label: '2020' },
  { value: '2019', label: '2019' },
  { value: '2018', label: '2018' },
  { value: '2017', label: '2017' },
  { value: '2016', label: '2016' },
  { value: '2015', label: '2015' }
];

/**
 * Month items for novelty picker (newest-first order — reversed for asc)
 * value = JS month index (0–11)
 */
const MONTH_ITEMS = [
  { value: '11', label: 'ДЕК' },
  { value: '10', label: 'НОЯ' },
  { value: '9',  label: 'ОКТ' },
  { value: '8',  label: 'СЕН' },
  { value: '7',  label: 'АВГ' },
  { value: '6',  label: 'ИЮЛ' },
  { value: '5',  label: 'ИЮН' },
  { value: '4',  label: 'МАЙ' },
  { value: '3',  label: 'АПР' },
  { value: '2',  label: 'МАР' },
  { value: '1',  label: 'ФЕВ' },
  { value: '0',  label: 'ЯНВ' },
];

/**
 * Decade groups for release date sorting
 * Shows decades from 2010s down to 1970s
 */
const DECADE_ITEMS = [
  { value: '2020', label: '20-е', startYear: 2020, endYear: 2029 },
  { value: '2010', label: '10-е', startYear: 2010, endYear: 2019 },
  { value: '2000', label: '00-е', startYear: 2000, endYear: 2009 },
  { value: '1990', label: '90-е', startYear: 1990, endYear: 1999 },
  { value: '1980', label: '80-е', startYear: 1980, endYear: 1989 },
  { value: '1970', label: '70-е', startYear: 1970, endYear: 1979 }
];

/**
 * Development time thresholds for time sorting
 * Used by getAvailableDevTimes() for availability detection
 */
const DEV_TIME_ITEMS = [
  { value: '100', label: '>100ч', minHours: 100 },
  { value: '50', label: '>50ч', minHours: 50 },
  { value: '25', label: '>25ч', minHours: 25 },
  { value: '10', label: '>10ч', minHours: 10 },
  { value: '5', label: '>5ч', minHours: 5 },
  { value: '0', label: '<5ч', minHours: 0, maxHours: 5 }
];

// Flatten all alphabet groups for easy access
const ALL_ALPHABET_GROUPS = ALPHABET_CATEGORIES.flatMap(cat => cat.groups);

// Special product ID that should be excluded from indexing
const SPECIAL_PRODUCT_ID = 1;

// ============ STATE ============
let isInitialized = false;
let triggerButtonElement = null;
let scrubberElement = null;
let letterPickerElement = null;
let previewElement = null;
let isDragging = false;
let isInLetterPicker = false;
let isScrubberVisible = false;
let currentExpandedGroup = null;
let currentExpandedGroupEl = null; // DOM element of the expanded group (for non-alphabet types)
let currentPickerType = 'letter'; // 'letter' | 'year' | 'release-year' | 'devtime'
let availableLetters = new Set();
let availableGroups = new Set();
let availableItems = new Set();
let availableReleaseYears = new Set(); // Individual release years for release decade picker
let hoverTimeout = null;
let hideTimeout = null;
let safeTriangleMoveHandler = null;
let currentSortType = null; // 'title', 'new', 'release', 'development_time'
let activeAlphabetGroups = ALL_ALPHABET_GROUPS; // Rebuilt on each scrubber update (reversed when desc)
let lastDragElement = null; // Track last element during drag for haptic feedback

// ============ UTILITY FUNCTIONS ============

function isMobile() {
  return window.innerWidth <= 1024;
}

function getCurrentSort() {
  try {
    const filters = JSON.parse(sessionStorage.getItem('catalogFilters') || '{}');
    return filters.sort || null;
  } catch (e) {
    return null;
  }
}

function getSortDirection() {
  return window.sortDirection || 'desc';
}

/**
 * Determine if scrubber items should be reversed based on sort type and direction
 *
 * For title sort: Default order is A→Z (ascending), so reverse when descending (Z→A)
 * For year/decade/devtime: Default order is newest/highest first (descending),
 *   so reverse when ascending (oldest/lowest first)
 */
function isReversed() {
  const sortType = getCurrentSort();
  const direction = getSortDirection();

  if (sortType === 'title') {
    // Alphabet arrays are in A→Z order, reverse for desc (Z→A)
    return direction === 'desc';
  }
  // Year, decade, devtime arrays are in desc order (newest/highest first)
  // Reverse when asc (oldest/lowest first)
  return direction === 'asc';
}

// ============ PRODUCT DATA EXTRACTION ============

/**
 * Get all available first letters from displayed products (for alphabetical sort)
 */
function getAvailableLetters() {
  const products = document.querySelectorAll('.product-card, .product');
  const letters = new Set();

  products.forEach(card => {
    const productId = card.dataset?.productId || card.getAttribute('data-product-id');
    if (productId && parseInt(productId) === SPECIAL_PRODUCT_ID) return;

    const title = card.querySelector('.product-title, h3')?.textContent?.trim();
    if (title && title.length > 0) {
      const firstChar = title.charAt(0).toUpperCase();
      letters.add(firstChar);
    }
  });

  return letters;
}

/**
 * Get available years from products (for novelty sort)
 */
function getAvailableYears() {
  const products = document.querySelectorAll('.product-card, .product');
  const years = new Set();

  products.forEach(card => {
    const productId = card.dataset?.productId || card.getAttribute('data-product-id');
    if (productId && parseInt(productId) === SPECIAL_PRODUCT_ID) return;

    const createdAt = card.dataset?.createdAt || card.getAttribute('data-created-at');
    if (createdAt) {
      const year = new Date(createdAt).getFullYear().toString();
      years.add(year);
    }
  });

  return years;
}

/**
 * Get available decades from products (for release date sort)
 */
function getAvailableDecades() {
  const products = document.querySelectorAll('.product-card, .product');
  const decades = new Set();

  products.forEach(card => {
    const productId = card.dataset?.productId || card.getAttribute('data-product-id');
    if (productId && parseInt(productId) === SPECIAL_PRODUCT_ID) return;

    const releaseDate = card.dataset?.releaseDate || card.getAttribute('data-release-date');
    if (releaseDate) {
      const year = new Date(releaseDate).getFullYear();
      for (const decade of DECADE_ITEMS) {
        if (year >= decade.startYear && year <= decade.endYear) {
          decades.add(decade.value);
          break;
        }
      }
    }
  });

  return decades;
}

/**
 * Get available development time ranges from products
 */
function getAvailableDevTimes() {
  const products = document.querySelectorAll('.product-card, .product');
  const devTimes = new Set();

  products.forEach(card => {
    const productId = card.dataset?.productId || card.getAttribute('data-product-id');
    if (productId && parseInt(productId) === SPECIAL_PRODUCT_ID) return;

    const devTime = card.dataset?.developmentTime || card.getAttribute('data-development-time');
    if (devTime) {
      const hours = parseInt(devTime);
      for (const threshold of DEV_TIME_ITEMS) {
        if (threshold.maxHours !== undefined) {
          if (hours >= threshold.minHours && hours < threshold.maxHours) {
            devTimes.add(threshold.value);
            break;
          }
        } else if (hours >= threshold.minHours) {
          devTimes.add(threshold.value);
          break;
        }
      }
    }
  });

  return devTimes;
}

/**
 * Get individual release years from products (for release decade picker items)
 */
function getAvailableReleaseYears() {
  const products = document.querySelectorAll('.product-card, .product');
  const years = new Set();

  products.forEach(card => {
    const productId = card.dataset?.productId || card.getAttribute('data-product-id');
    if (productId && parseInt(productId) === SPECIAL_PRODUCT_ID) return;

    const releaseDate = card.dataset?.releaseDate || card.getAttribute('data-release-date');
    if (releaseDate) {
      const year = new Date(releaseDate).getFullYear().toString();
      years.add(year);
    }
  });

  return years;
}

/**
 * Scroll to product matching a specific release year
 */
function scrollToReleaseYear(year) {
  const products = document.querySelectorAll('.product-card, .product');
  const productList = [...products];
  if (isReversed()) productList.reverse();

  for (const card of productList) {
    const productId = card.dataset?.productId || card.getAttribute('data-product-id');
    if (productId && parseInt(productId) === SPECIAL_PRODUCT_ID) continue;

    const releaseDate = card.dataset?.releaseDate || card.getAttribute('data-release-date');
    if (releaseDate) {
      const cardYear = new Date(releaseDate).getFullYear().toString();
      if (cardYear === year) {
        scrollToCard(card);
        return true;
      }
    }
  }
  return false;
}

/**
 * Get months that have products for a given year (for novelty month picker)
 * Returns a Set of month index strings ('0'–'11')
 */
function getAvailableMonthsForYear(year) {
  const products = document.querySelectorAll('.product-card, .product');
  const months = new Set();

  products.forEach(card => {
    const productId = card.dataset?.productId || card.getAttribute('data-product-id');
    if (productId && parseInt(productId) === SPECIAL_PRODUCT_ID) return;

    const createdAt = card.dataset?.createdAt || card.getAttribute('data-created-at');
    if (createdAt) {
      const date = new Date(createdAt);
      if (date.getFullYear().toString() === year) {
        months.add(date.getMonth().toString());
      }
    }
  });

  return months;
}

/**
 * Scroll to first product matching a specific year + month (novelty sort)
 */
function scrollToYearMonth(year, month) {
  const products = document.querySelectorAll('.product-card, .product');
  const productList = [...products];
  if (isReversed()) productList.reverse();

  for (const card of productList) {
    const productId = card.dataset?.productId || card.getAttribute('data-product-id');
    if (productId && parseInt(productId) === SPECIAL_PRODUCT_ID) continue;

    const createdAt = card.dataset?.createdAt || card.getAttribute('data-created-at');
    if (createdAt) {
      const date = new Date(createdAt);
      if (date.getFullYear().toString() === year && date.getMonth().toString() === month) {
        scrollToCard(card);
        return true;
      }
    }
  }
  return false;
}

/**
 * Get years in a decade range, ordered by current sort direction (newest-first by default)
 */
function getYearsInRange(startYear, endYear) {
  const years = [];
  for (let y = endYear; y >= startYear; y--) {
    years.push(y.toString());
  }
  return isReversed() ? years.reverse() : years;
}

/**
 * Find the first available year in a decade range
 */
function findBestYearInRange(startYear, endYear, availableYearsSet) {
  const years = getYearsInRange(startYear, endYear);
  for (const y of years) {
    if (availableYearsSet.has(y)) return y;
  }
  return null;
}

/**
 * Show picker panel with generic items (for year, release-year, devtime modes)
 * items: Array of { value, label, available }
 * pickerType: 'year' | 'release-year' | 'devtime'
 */
function showGroupPicker(items, anchorElement, pickerType) {
  if (!letterPickerElement || !items || !items.length) return;

  currentPickerType = pickerType;
  currentExpandedGroupEl = anchorElement;
  letterPickerElement.innerHTML = '';

  for (const item of items) {
    const itemEl = document.createElement('span');
    itemEl.className = 'picker-item';
    itemEl.textContent = item.label;
    itemEl.dataset.value = item.value;
    itemEl.dataset.type = pickerType;
    if (item.extra) {
      for (const [k, v] of Object.entries(item.extra)) {
        itemEl.dataset[k] = v;
      }
    }
    itemEl.classList.toggle('available', item.available);
    itemEl.classList.toggle('unavailable', !item.available);
    letterPickerElement.appendChild(itemEl);
  }

  const scrubberRect = scrubberElement.getBoundingClientRect();
  const anchorRect = anchorElement.getBoundingClientRect();
  const pickerHeight = items.length * 36 + 12;

  const anchorCenter = anchorRect.top + anchorRect.height / 2;
  const pickerTop = Math.max(10, anchorCenter - pickerHeight / 2);
  const maxTop = window.innerHeight - pickerHeight - 10;
  const finalTop = Math.min(pickerTop, maxTop);

  letterPickerElement.style.right = `${window.innerWidth - scrubberRect.left + 8}px`;
  letterPickerElement.style.top = `${finalTop}px`;
  letterPickerElement.classList.add('visible');
}

/**
 * Get picker item element at position — works for both letter and generic items
 */
function getPickerItemFromPosition(x, y) {
  if (!letterPickerElement) return null;

  const items = letterPickerElement.querySelectorAll('.alphabet-letter-item, .picker-item');
  for (const item of items) {
    const rect = item.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return item;
    }
  }
  return null;
}

/**
 * Highlight an item element in the picker
 */
function highlightPickerItem(el) {
  if (!letterPickerElement) return;
  letterPickerElement.querySelectorAll('.alphabet-letter-item, .picker-item').forEach(item => {
    item.classList.toggle('active', item === el);
  });
}

// ============ ALPHABET SPECIFIC FUNCTIONS ============

function updateAvailableGroups() {
  availableGroups.clear();
  for (const group of activeAlphabetGroups) {
    const hasAvailable = group.chars.some(char => availableLetters.has(char));
    if (hasAvailable) {
      availableGroups.add(group.label);
    }
  }
}

function findBestMatchInGroup(groupLabel) {
  const group = activeAlphabetGroups.find(g => g.label === groupLabel);
  if (group) {
    // chars are already in correct order (reversed when desc)
    for (const char of group.chars) {
      if (availableLetters.has(char)) {
        return char;
      }
    }
  }
  return null;
}

// ============ SCROLL TO FUNCTIONS ============

function scrollToLetter(letter) {
  const products = document.querySelectorAll('.product-card, .product');
  const productList = [...products];
  if (isReversed()) productList.reverse();

  for (const card of productList) {
    const productId = card.dataset?.productId || card.getAttribute('data-product-id');
    if (productId && parseInt(productId) === SPECIAL_PRODUCT_ID) continue;

    const title = card.querySelector('.product-title, h3')?.textContent?.trim();
    if (title && title.length > 0) {
      const firstChar = title.charAt(0).toUpperCase();
      if (firstChar === letter) {
        scrollToCard(card);
        return true;
      }
    }
  }
  return false;
}

function scrollToYear(year) {
  const products = document.querySelectorAll('.product-card, .product');
  const productList = [...products];
  if (isReversed()) productList.reverse();

  for (const card of productList) {
    const productId = card.dataset?.productId || card.getAttribute('data-product-id');
    if (productId && parseInt(productId) === SPECIAL_PRODUCT_ID) continue;

    const createdAt = card.dataset?.createdAt || card.getAttribute('data-created-at');
    if (createdAt) {
      const cardYear = new Date(createdAt).getFullYear().toString();
      if (cardYear === year) {
        scrollToCard(card);
        return true;
      }
    }
  }
  return false;
}

function scrollToDecade(decadeValue) {
  const decade = DECADE_ITEMS.find(d => d.value === decadeValue);
  if (!decade) return false;

  const products = document.querySelectorAll('.product-card, .product');
  const productList = [...products];
  if (isReversed()) productList.reverse();

  for (const card of productList) {
    const productId = card.dataset?.productId || card.getAttribute('data-product-id');
    if (productId && parseInt(productId) === SPECIAL_PRODUCT_ID) continue;

    const releaseDate = card.dataset?.releaseDate || card.getAttribute('data-release-date');
    if (releaseDate) {
      const year = new Date(releaseDate).getFullYear();
      if (year >= decade.startYear && year <= decade.endYear) {
        scrollToCard(card);
        return true;
      }
    }
  }
  return false;
}

function scrollToDevTime(thresholdValue) {
  const threshold = DEV_TIME_ITEMS.find(t => t.value === thresholdValue);
  if (!threshold) return false;

  const products = document.querySelectorAll('.product-card, .product');
  const productList = [...products];
  if (isReversed()) productList.reverse();

  for (const card of productList) {
    const productId = card.dataset?.productId || card.getAttribute('data-product-id');
    if (productId && parseInt(productId) === SPECIAL_PRODUCT_ID) continue;

    const devTime = card.dataset?.developmentTime || card.getAttribute('data-development-time');
    if (devTime) {
      const hours = parseInt(devTime);
      let matches = false;
      if (threshold.maxHours !== undefined) {
        matches = hours >= threshold.minHours && hours < threshold.maxHours;
      } else {
        matches = hours >= threshold.minHours;
      }
      if (matches) {
        scrollToCard(card);
        return true;
      }
    }
  }
  return false;
}

function scrollToCard(card) {
  const header = document.querySelector('.header');
  const productsHeader = document.querySelector('.products-header');
  const headerHeight = (header?.offsetHeight || 60) + (productsHeader?.offsetHeight || 0);

  const rect = card.getBoundingClientRect();
  const scrollTop = window.pageYOffset + rect.top - headerHeight - 20;

  window.scrollTo({
    top: scrollTop,
    behavior: 'smooth'
  });
}

// ============ LETTER PICKER (ALPHABETICAL ONLY) ============

function showLetterPicker(group, anchorElement) {
  if (!letterPickerElement || !group) return;

  currentExpandedGroup = group;
  currentExpandedGroupEl = anchorElement;
  currentPickerType = 'letter';
  letterPickerElement.innerHTML = '';

  // chars are already in correct order (reversed when desc) via activeAlphabetGroups
  const chars = group.chars;

  for (const char of chars) {
    const charEl = document.createElement('span');
    charEl.className = 'alphabet-letter-item';
    charEl.textContent = char;
    charEl.dataset.char = char;

    const isAvailable = availableLetters.has(char);
    charEl.classList.toggle('available', isAvailable);
    charEl.classList.toggle('unavailable', !isAvailable);

    letterPickerElement.appendChild(charEl);
  }

  const scrubberRect = scrubberElement.getBoundingClientRect();
  const anchorRect = anchorElement.getBoundingClientRect();
  const pickerHeight = chars.length * 30 + 12;

  const anchorCenter = anchorRect.top + anchorRect.height / 2;
  const pickerTop = Math.max(10, anchorCenter - pickerHeight / 2);
  const maxTop = window.innerHeight - pickerHeight - 10;
  const finalTop = Math.min(pickerTop, maxTop);

  letterPickerElement.style.right = `${window.innerWidth - scrubberRect.left + 8}px`;
  letterPickerElement.style.top = `${finalTop}px`;

  letterPickerElement.classList.add('visible');
}

function hideLetterPicker() {
  if (letterPickerElement) {
    letterPickerElement.classList.remove('visible');
  }
  currentExpandedGroup = null;
  currentExpandedGroupEl = null;
  isInLetterPicker = false;
  stopSafeTriangle();
}

function getLetterFromPickerPosition(x, y) {
  if (!letterPickerElement) return null;

  const letterItems = letterPickerElement.querySelectorAll('.alphabet-letter-item');
  for (const item of letterItems) {
    const rect = item.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return item.dataset.char;
    }
  }
  return null;
}

function highlightLetterInPicker(char) {
  if (!letterPickerElement) return;

  letterPickerElement.querySelectorAll('.alphabet-letter-item').forEach(el => {
    el.classList.toggle('active', el.dataset.char === char);
  });
}

// ============ SCRUBBER VISIBILITY ============

function showScrubber() {
  if (!scrubberElement) return;
  isScrubberVisible = true;
  scrubberElement.classList.add('visible');
  triggerButtonElement?.classList.add('active');
  updateAvailableItems();
}

function hideScrubber() {
  if (!scrubberElement) return;
  isScrubberVisible = false;
  scrubberElement.classList.remove('visible');
  triggerButtonElement?.classList.remove('active');
  hideLetterPicker();
  hidePreview();
  clearGroupHighlight();
}

function toggleScrubber() {
  if (isScrubberVisible) {
    hideScrubber();
  } else {
    showScrubber();
  }
}

// ============ TRIGGER BUTTON ============

function createTriggerButton() {
  if (triggerButtonElement) return triggerButtonElement;

  triggerButtonElement = document.createElement('button');
  triggerButtonElement.className = 'scrubber-trigger-button';
  triggerButtonElement.setAttribute('title', 'Навигация');

  updateTriggerButtonIcon();

  triggerButtonElement.addEventListener('click', () => {
    toggleScrubber();
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  });

  document.body.appendChild(triggerButtonElement);
  return triggerButtonElement;
}

function updateTriggerButtonIcon() {
  if (!triggerButtonElement) return;

  const sortType = getCurrentSort();
  let icon = '';

  switch (sortType) {
    case 'title':
      icon = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18M3 12h18M3 18h18"/>
          <text x="17" y="8" font-size="6" fill="currentColor" stroke="none" font-weight="bold">A</text>
          <text x="17" y="20" font-size="6" fill="currentColor" stroke="none" font-weight="bold">Я</text>
        </svg>
      `;
      break;
    case 'new':
      icon = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      `;
      break;
    case 'release':
      icon = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
      `;
      break;
    case 'development_time':
      icon = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
      `;
      break;
    default:
      icon = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18M3 12h18M3 18h18"/>
        </svg>
      `;
  }

  triggerButtonElement.innerHTML = icon;
}

// ============ SCRUBBER CREATION ============

function createScrubber() {
  if (scrubberElement) return scrubberElement;

  scrubberElement = document.createElement('div');
  scrubberElement.className = 'sort-scrubber';
  scrubberElement.setAttribute('aria-label', 'Sort navigation');

  rebuildScrubberContent();

  // Create letter picker (for alphabetical mode)
  letterPickerElement = document.createElement('div');
  letterPickerElement.className = 'alphabet-letter-picker';
  document.body.appendChild(letterPickerElement);

  // Create preview bubble
  previewElement = document.createElement('div');
  previewElement.className = 'scrubber-preview';
  previewElement.textContent = '';
  document.body.appendChild(previewElement);

  document.body.appendChild(scrubberElement);

  setupEventListeners();

  return scrubberElement;
}

function rebuildScrubberContent() {
  if (!scrubberElement) return;

  scrubberElement.innerHTML = '';
  const sortType = getCurrentSort();
  currentSortType = sortType;

  switch (sortType) {
    case 'title':
      buildAlphabetScrubber();
      break;
    case 'new':
      buildYearScrubber();
      break;
    case 'release':
      buildDecadeScrubber();
      break;
    case 'development_time':
      buildDevTimeScrubber();
      break;
  }

  updateItemAvailability();
}

function buildAlphabetScrubber() {
  const reversed = isReversed();
  const categories = reversed ? [...ALPHABET_CATEGORIES].reverse() : ALPHABET_CATEGORIES;

  // Rebuild activeAlphabetGroups to match current display order
  const builtGroups = [];

  for (const category of categories) {
    const categoryEl = document.createElement('div');
    categoryEl.className = 'scrubber-category';
    categoryEl.dataset.category = category.name;

    const groupsContainer = document.createElement('div');
    groupsContainer.className = 'scrubber-category-groups';

    let groups = category.groups;
    if (reversed) {
      groups = [...groups].reverse().map(group => {
        const reversedChars = [...group.chars].reverse();
        const firstChar = reversedChars[0];
        const lastChar = reversedChars[reversedChars.length - 1];
        const reversedLabel = group.displayLabel === '0-9' ? '9-0' :
                             `${firstChar}-${lastChar}`;
        return {
          label: firstChar,
          displayLabel: reversedLabel,
          chars: reversedChars
        };
      });
    }

    for (const group of groups) {
      builtGroups.push(group);
      const groupEl = document.createElement('span');
      groupEl.className = 'scrubber-group';
      groupEl.textContent = group.displayLabel;
      groupEl.dataset.group = group.label;
      groupEl.dataset.type = 'alphabet';
      groupEl.dataset.chars = group.chars.join(',');
      groupsContainer.appendChild(groupEl);
    }

    categoryEl.appendChild(groupsContainer);
    scrubberElement.appendChild(categoryEl);
  }

  activeAlphabetGroups = builtGroups;
}

function buildYearScrubber() {
  const items = isReversed() ? [...YEAR_ITEMS].reverse() : YEAR_ITEMS;
  const container = document.createElement('div');
  container.className = 'scrubber-category';

  const groupsContainer = document.createElement('div');
  groupsContainer.className = 'scrubber-category-groups';

  for (const item of items) {
    const groupEl = document.createElement('span');
    groupEl.className = 'scrubber-group';
    groupEl.textContent = item.label;
    groupEl.dataset.group = item.value;
    groupEl.dataset.type = 'year-item';
    groupsContainer.appendChild(groupEl);
  }

  container.appendChild(groupsContainer);
  scrubberElement.appendChild(container);
}

function buildDecadeScrubber() {
  const items = isReversed() ? [...DECADE_ITEMS].reverse() : DECADE_ITEMS;
  const container = document.createElement('div');
  container.className = 'scrubber-category';

  const groupsContainer = document.createElement('div');
  groupsContainer.className = 'scrubber-category-groups';

  for (const item of items) {
    const groupEl = document.createElement('span');
    groupEl.className = 'scrubber-group';
    groupEl.textContent = item.label;
    groupEl.dataset.group = item.value;
    groupEl.dataset.type = 'release-decade';
    groupEl.dataset.startYear = item.startYear;
    groupEl.dataset.endYear = item.endYear;
    groupsContainer.appendChild(groupEl);
  }

  container.appendChild(groupsContainer);
  scrubberElement.appendChild(container);
}

function buildDevTimeScrubber() {
  const items = isReversed() ? [...DEV_TIME_ITEMS].reverse() : DEV_TIME_ITEMS;
  const container = document.createElement('div');
  container.className = 'scrubber-simple-list';

  for (const item of items) {
    const itemEl = document.createElement('span');
    itemEl.className = 'scrubber-item';
    itemEl.textContent = item.label;
    itemEl.dataset.value = item.value;
    itemEl.dataset.type = 'devtime';
    container.appendChild(itemEl);
  }

  scrubberElement.appendChild(container);
}

// ============ AVAILABILITY UPDATES ============

function updateAvailableItems() {
  const sortType = getCurrentSort();

  switch (sortType) {
    case 'title':
      availableLetters = getAvailableLetters();
      updateAvailableGroups();
      break;
    case 'new':
      availableItems = getAvailableYears(); // Individual years from created_at
      break;
    case 'release':
      availableItems = getAvailableDecades(); // Decade values for group availability
      availableReleaseYears = getAvailableReleaseYears(); // Individual years for picker
      break;
    case 'development_time':
      availableItems = getAvailableDevTimes();
      break;
  }

  updateItemAvailability();
}

function updateItemAvailability() {
  if (!scrubberElement) return;

  const sortType = getCurrentSort();

  if (sortType === 'title') {
    // Alphabet: check if any char in the group is available
    scrubberElement.querySelectorAll('.scrubber-group').forEach(el => {
      const groupLabel = el.dataset.group;
      const isAvailable = availableGroups.has(groupLabel);
      el.classList.toggle('available', isAvailable);
      el.classList.toggle('unavailable', !isAvailable);
    });

    scrubberElement.querySelectorAll('.scrubber-category').forEach(catEl => {
      const groups = catEl.querySelectorAll('.scrubber-group');
      const hasAvailable = Array.from(groups).some(g => g.classList.contains('available'));
      catEl.classList.toggle('has-available', hasAvailable);
    });
  } else if (sortType === 'new') {
    // Individual year groups: available if that year has products
    scrubberElement.querySelectorAll('.scrubber-group[data-type="year-item"]').forEach(el => {
      const isAvailable = availableItems.has(el.dataset.group);
      el.classList.toggle('available', isAvailable);
      el.classList.toggle('unavailable', !isAvailable);
    });

    scrubberElement.querySelectorAll('.scrubber-category').forEach(catEl => {
      const hasAvailable = Array.from(catEl.querySelectorAll('.scrubber-group')).some(g => g.classList.contains('available'));
      catEl.classList.toggle('has-available', hasAvailable);
    });
  } else if (sortType === 'release') {
    // Release decade groups: available if the decade value is in availableItems
    scrubberElement.querySelectorAll('.scrubber-group[data-type="release-decade"]').forEach(el => {
      const isAvailable = availableItems.has(el.dataset.group);
      el.classList.toggle('available', isAvailable);
      el.classList.toggle('unavailable', !isAvailable);
    });

    scrubberElement.querySelectorAll('.scrubber-category').forEach(catEl => {
      const hasAvailable = Array.from(catEl.querySelectorAll('.scrubber-group')).some(g => g.classList.contains('available'));
      catEl.classList.toggle('has-available', hasAvailable);
    });
  } else if (sortType === 'development_time') {
    // Flat threshold list
    scrubberElement.querySelectorAll('.scrubber-item').forEach(el => {
      const isAvailable = availableItems.has(el.dataset.value);
      el.classList.toggle('available', isAvailable);
      el.classList.toggle('unavailable', !isAvailable);
    });
  }
}

// ============ EVENT LISTENERS ============

function setupEventListeners() {
  if (!scrubberElement) return;

  // Touch events
  scrubberElement.addEventListener('touchstart', handleTouchStart, { passive: false });
  document.addEventListener('touchmove', handleTouchMove, { passive: false });
  document.addEventListener('touchend', handleTouchEnd, { passive: true });
  document.addEventListener('touchcancel', handleTouchEnd, { passive: true });

  // Mouse events
  scrubberElement.addEventListener('mouseenter', handleMouseEnterScrubber);
  scrubberElement.addEventListener('mouseleave', handleMouseLeaveScrubber);
  scrubberElement.addEventListener('mousemove', handleMouseMoveScrubber);

  // Letter picker events (alphabet only)
  letterPickerElement.addEventListener('mouseenter', handleMouseEnterPicker);
  letterPickerElement.addEventListener('mouseleave', handleMouseLeavePicker);
  letterPickerElement.addEventListener('mousemove', handleMouseMovePicker);
  letterPickerElement.addEventListener('click', handleClickPicker);

  // Click handlers
  scrubberElement.addEventListener('click', handleItemClick);
  document.addEventListener('click', handleDocumentClick);
}

function handleItemClick(e) {
  // Flat scrubber-item (devtime)
  const itemEl = e.target.closest('.scrubber-item');
  if (itemEl && itemEl.classList.contains('available')) {
    const value = itemEl.dataset.value;
    if (itemEl.dataset.type === 'devtime') scrollToDevTime(value);
    if ('vibrate' in navigator) navigator.vibrate(10);
    return;
  }

  // Grouped scrubber-group (title, year-item, release-decade)
  const groupEl = e.target.closest('.scrubber-group');
  if (!groupEl || !groupEl.classList.contains('available')) return;

  scrollToElement(groupEl);
  if ('vibrate' in navigator) navigator.vibrate(10);
}

function handleDocumentClick(e) {
  if (!isScrubberVisible) return;

  if (scrubberElement?.contains(e.target) ||
      letterPickerElement?.contains(e.target) ||
      triggerButtonElement?.contains(e.target)) {
    return;
  }

  hideScrubber();
}

function getElementFromPosition(y) {
  const items = scrubberElement.querySelectorAll('.scrubber-group, .scrubber-item');

  // First try exact match
  for (const item of items) {
    const rect = item.getBoundingClientRect();
    if (y >= rect.top && y <= rect.bottom) {
      return item;
    }
  }

  // If no exact match, find closest element (for gaps between elements)
  const scrubberRect = scrubberElement.getBoundingClientRect();
  if (y >= scrubberRect.top && y <= scrubberRect.bottom) {
    let closestEl = null;
    let closestDist = Infinity;
    for (const item of items) {
      const rect = item.getBoundingClientRect();
      const centerY = rect.top + rect.height / 2;
      const dist = Math.abs(y - centerY);
      if (dist < closestDist) {
        closestDist = dist;
        closestEl = item;
      }
    }
    return closestEl;
  }

  return null;
}

// ============ PREVIEW ============

function showPreview(text, y) {
  previewElement.textContent = text;
  previewElement.classList.add('visible');

  const scrubberRect = scrubberElement.getBoundingClientRect();
  previewElement.style.top = `${y - 25}px`;
  previewElement.style.right = `${window.innerWidth - scrubberRect.left + 60}px`;
}

function hidePreview() {
  previewElement.classList.remove('visible');
}

// ============ TOUCH HANDLERS ============

function handleTouchStart(e) {
  const touch = e.touches[0];
  const el = getElementFromPosition(touch.clientY);

  if (el) {
    e.preventDefault();
    isDragging = true;
    lastDragElement = el;
    scrubberElement.classList.add('active');
    handleTouchInteraction(el, touch.clientY);
    if ('vibrate' in navigator) navigator.vibrate(5);
  }
}

function handleTouchMove(e) {
  if (!isDragging) return;
  e.preventDefault();

  const touch = e.touches[0];
  const x = touch.clientX;
  const y = touch.clientY;

  // Check if touch is inside the picker panel
  if (letterPickerElement?.classList.contains('visible')) {
    const pickerRect = letterPickerElement.getBoundingClientRect();
    if (x >= pickerRect.left && x <= pickerRect.right &&
        y >= pickerRect.top && y <= pickerRect.bottom) {
      isInLetterPicker = true;
      const pickerItem = getPickerItemFromPosition(x, y);
      if (pickerItem) {
        highlightPickerItem(pickerItem);
        const displayText = pickerItem.dataset.char || pickerItem.textContent;
        const value = pickerItem.dataset.char || pickerItem.dataset.value;
        const type = pickerItem.dataset.type || 'letter';
        showPreview(displayText, y);
        lastDragElement = { type, value, year: pickerItem.dataset.year };
        if ('vibrate' in navigator) navigator.vibrate(3);
      }
      return;
    }
  }

  isInLetterPicker = false;
  const el = getElementFromPosition(y);
  if (el) {
    if (el !== lastDragElement) {
      lastDragElement = el;
      handleTouchInteraction(el, y);
      if ('vibrate' in navigator) navigator.vibrate(3);
    }
  }
  // Don't stop dragging if outside - just keep last element
}

function handleTouchEnd() {
  if (isDragging && lastDragElement) {
    if (lastDragElement.type === 'letter') {
      if (availableLetters.has(lastDragElement.value)) {
        scrollToLetter(lastDragElement.value);
      }
    } else if (lastDragElement.type === 'year-month') {
      scrollToYearMonth(lastDragElement.year, lastDragElement.value);
    } else if (lastDragElement.type === 'release-year') {
      scrollToReleaseYear(lastDragElement.value);
    } else if (lastDragElement.type === 'devtime') {
      scrollToDevTime(lastDragElement.value);
    } else {
      // DOM element (scrubber group)
      scrollToElement(lastDragElement);
    }
  }

  isDragging = false;
  isInLetterPicker = false;
  lastDragElement = null;
  scrubberElement.classList.remove('active');
  hideLetterPicker();
  hidePreview();
  clearGroupHighlight();
}

/**
 * Handle touch interaction - update UI only, no scrolling
 */
function handleTouchInteraction(el, y) {
  if (!el.classList.contains('scrubber-group')) return;

  const groupType = el.dataset.type;
  const groupLabel = el.dataset.group;

  if (groupType === 'alphabet' || !groupType) {
    const group = activeAlphabetGroups.find(g => g.label === groupLabel);
    if (group) {
      highlightElement(groupLabel);
      showPreview(group.displayLabel, y);
      if (group !== currentExpandedGroup) {
        showLetterPicker(group, el);
      }
    }
  } else if (el !== currentExpandedGroupEl) {
    highlightElement(groupLabel);
    showPreview(el.textContent, y);

    if (groupType === 'year-item') {
      const year = groupLabel;
      const availableMonths = getAvailableMonthsForYear(year);
      const months = isReversed() ? [...MONTH_ITEMS].reverse() : MONTH_ITEMS;
      const pickerItems = months.map(m => ({ value: m.value, label: m.label, available: availableMonths.has(m.value), extra: { year } }));
      showGroupPicker(pickerItems, el, 'year-month');
    } else if (groupType === 'release-decade') {
      const startYear = parseInt(el.dataset.startYear);
      const endYear = parseInt(el.dataset.endYear);
      const years = getYearsInRange(startYear, endYear);
      const pickerItems = years.map(y2 => ({ value: y2, label: y2, available: availableReleaseYears.has(y2) }));
      showGroupPicker(pickerItems, el, 'release-year');
    }
  }
}

/**
 * Scroll to the given scrubber element based on its type
 */
function scrollToElement(el) {
  if (!el || !el.classList) return;

  if (el.classList.contains('scrubber-group')) {
    const groupType = el.dataset.type;
    const groupLabel = el.dataset.group;

    if (groupType === 'alphabet' || !groupType) {
      const bestMatch = findBestMatchInGroup(groupLabel);
      if (bestMatch) scrollToLetter(bestMatch);
    } else if (groupType === 'year-item') {
      scrollToYear(groupLabel);
    } else if (groupType === 'release-decade') {
      if (!scrollToDecade(groupLabel)) {
        const startYear = parseInt(el.dataset.startYear);
        const endYear = parseInt(el.dataset.endYear);
        const bestYear = findBestYearInRange(startYear, endYear, availableReleaseYears);
        if (bestYear) scrollToReleaseYear(bestYear);
      }
    }
  }
}

/**
 * Handle element interaction for mouse (with scrolling)
 */
function handleElementInteraction(el, y) {
  if (el.classList.contains('scrubber-group')) {
    const groupLabel = el.dataset.group;
    const group = activeAlphabetGroups.find(g => g.label === groupLabel);
    if (group && group !== currentExpandedGroup) {
      showLetterPicker(group, el);
      highlightElement(groupLabel);
      showPreview(group.displayLabel, y);

      const bestMatch = findBestMatchInGroup(groupLabel);
      if (bestMatch) scrollToLetter(bestMatch);
    }
  } else if (el.classList.contains('scrubber-item')) {
    const value = el.dataset.value;
    const type = el.dataset.type;
    highlightElement(value);
    showPreview(el.textContent, y);

    if (el.classList.contains('available')) {
      switch (type) {
        case 'year': scrollToYear(value); break;
        case 'decade': scrollToDecade(value); break;
        case 'devtime': scrollToDevTime(value); break;
      }
    }
  }
}

// ============ SAFE TRIANGLE ============

/**
 * While the cursor moves from the scrubber toward the picker panel,
 * track it on the document and cancel the hide timeout if the cursor
 * stays within the triangle formed by the exit point and the picker bounds.
 * This prevents the picker from closing during diagonal mouse movements.
 */
function startSafeTriangle(exitX, exitY) {
  stopSafeTriangle();
  if (!letterPickerElement?.classList.contains('visible')) return;

  safeTriangleMoveHandler = (e) => {
    if (!letterPickerElement?.classList.contains('visible')) {
      stopSafeTriangle();
      return;
    }
    // Once inside the picker, mouseenter handles everything
    if (letterPickerElement.contains(e.target) || scrubberElement?.contains(e.target)) {
      stopSafeTriangle();
      return;
    }

    const pickerRect = letterPickerElement.getBoundingClientRect();
    const mx = e.clientX, my = e.clientY;

    // Safe zone: cursor must be moving left toward the picker and within its
    // vertical extent (with a small margin). Any position outside closes the picker.
    const inVerticalRange = my >= pickerRect.top - 20 && my <= pickerRect.bottom + 20;
    const inHorizontalRange = mx >= pickerRect.left && mx <= exitX;

    if (!inVerticalRange || !inHorizontalRange) {
      stopSafeTriangle();
      clearTimeout(hoverTimeout);
      hoverTimeout = null;
      if (!isInLetterPicker) {
        scrubberElement.classList.remove('hover');
        hideLetterPicker();
        hidePreview();
        clearGroupHighlight();
      }
    }
  };

  document.addEventListener('mousemove', safeTriangleMoveHandler);
}

function stopSafeTriangle() {
  if (safeTriangleMoveHandler) {
    document.removeEventListener('mousemove', safeTriangleMoveHandler);
    safeTriangleMoveHandler = null;
  }
}

// ============ MOUSE HANDLERS ============

function handleMouseEnterScrubber() {
  clearTimeout(hideTimeout);
  scrubberElement.classList.add('hover');
}

function handleMouseLeaveScrubber(e) {
  const toElement = e.relatedTarget;
  if (letterPickerElement && letterPickerElement.contains(toElement)) return;

  clearTimeout(hoverTimeout);

  if (letterPickerElement?.classList.contains('visible')) {
    // Picker is open — use safe triangle so diagonal cursor movement toward
    // the picker doesn't prematurely close it.
    startSafeTriangle(e.clientX, e.clientY);
    hoverTimeout = setTimeout(() => {
      stopSafeTriangle();
      if (!isInLetterPicker) {
        scrubberElement.classList.remove('hover');
        hideLetterPicker();
        hidePreview();
        clearGroupHighlight();
      }
    }, 300);
  } else {
    hoverTimeout = setTimeout(() => {
      if (!isInLetterPicker) {
        scrubberElement.classList.remove('hover');
        hideLetterPicker();
        hidePreview();
        clearGroupHighlight();
      }
    }, 100);
  }
}

function handleMouseMoveScrubber(e) {
  const el = getElementFromPosition(e.clientY);
  if (!el || !el.classList.contains('scrubber-group')) return;

  const groupType = el.dataset.type;
  const groupLabel = el.dataset.group;

  if (groupType === 'alphabet' || !groupType) {
    const group = activeAlphabetGroups.find(g => g.label === groupLabel);
    if (group && group !== currentExpandedGroup) {
      showLetterPicker(group, el);
      highlightElement(groupLabel);
    }
  } else if (el !== currentExpandedGroupEl) {
    if (groupType === 'year-item') {
      const year = groupLabel;
      const availableMonths = getAvailableMonthsForYear(year);
      const months = isReversed() ? [...MONTH_ITEMS].reverse() : MONTH_ITEMS;
      const pickerItems = months.map(m => ({ value: m.value, label: m.label, available: availableMonths.has(m.value), extra: { year } }));
      showGroupPicker(pickerItems, el, 'year-month');
      highlightElement(groupLabel);
    } else if (groupType === 'release-decade') {
      const startYear = parseInt(el.dataset.startYear);
      const endYear = parseInt(el.dataset.endYear);
      const years = getYearsInRange(startYear, endYear);
      const pickerItems = years.map(y => ({ value: y, label: y, available: availableReleaseYears.has(y) }));
      showGroupPicker(pickerItems, el, 'release-year');
      highlightElement(groupLabel);
    }
  }
}

function handleMouseEnterPicker() {
  isInLetterPicker = true;
  clearTimeout(hoverTimeout);
  stopSafeTriangle();
}

function handleMouseLeavePicker(e) {
  const toElement = e.relatedTarget;
  if (scrubberElement && scrubberElement.contains(toElement)) {
    isInLetterPicker = false;
    return;
  }

  isInLetterPicker = false;
  clearTimeout(hoverTimeout);
  hoverTimeout = setTimeout(() => {
    scrubberElement.classList.remove('hover');
    hideLetterPicker();
    hidePreview();
    clearGroupHighlight();
  }, 100);
}

function handleMouseMovePicker(e) {
  const item = getPickerItemFromPosition(e.clientX, e.clientY);
  if (item) {
    highlightPickerItem(item);
    showPreview(item.dataset.char || item.textContent, e.clientY);
  }
}

function handleClickPicker(e) {
  const letterEl = e.target.closest('.alphabet-letter-item');
  if (letterEl && letterEl.classList.contains('available')) {
    scrollToLetter(letterEl.dataset.char);
    setTimeout(() => {
      hideLetterPicker();
      hidePreview();
      clearGroupHighlight();
      scrubberElement.classList.remove('hover');
    }, 200);
    return;
  }

  const pickerEl = e.target.closest('.picker-item');
  if (pickerEl && pickerEl.classList.contains('available')) {
    const value = pickerEl.dataset.value;
    const type = pickerEl.dataset.type;
    switch (type) {
      case 'year-month': scrollToYearMonth(pickerEl.dataset.year, value); break;
      case 'release-year': scrollToReleaseYear(value); break;
      case 'devtime': scrollToDevTime(value); break;
    }
    setTimeout(() => {
      hideLetterPicker();
      hidePreview();
      clearGroupHighlight();
      scrubberElement.classList.remove('hover');
    }, 200);
  }
}

// ============ HIGHLIGHT HELPERS ============

function highlightElement(identifier) {
  scrubberElement.querySelectorAll('.scrubber-group, .scrubber-item').forEach(el => {
    const match = el.dataset.group === identifier || el.dataset.value === identifier;
    el.classList.toggle('active', match);
  });
}

function clearGroupHighlight() {
  scrubberElement.querySelectorAll('.scrubber-group, .scrubber-item').forEach(el => {
    el.classList.remove('active');
  });
}

// ============ VISIBILITY MANAGEMENT ============

function updateVisibility() {
  const sortType = getCurrentSort();
  const shouldShow = sortType && sortType !== 'default';

  if (shouldShow) {
    if (!triggerButtonElement) createTriggerButton();
    if (!scrubberElement) createScrubber();

    updateTriggerButtonIcon();
    triggerButtonElement.classList.add('visible');

    // Preserve scrubber visibility state during rebuild (check both state and DOM)
    const wasScrubberVisible = isScrubberVisible || scrubberElement?.classList.contains('visible');

    rebuildScrubberContent();
    updateAvailableItems();

    // Keep scrubber visible if it was already visible (e.g., when changing sort direction)
    if (wasScrubberVisible) {
      // Ensure both state and DOM are synced
      isScrubberVisible = true;
      scrubberElement.classList.add('visible');
      triggerButtonElement?.classList.add('active');
    }
  } else {
    if (triggerButtonElement) {
      triggerButtonElement.classList.remove('visible');
    }
    hideScrubber();
  }
}

// ============ PUBLIC API ============

export function initSortScrubber() {
  if (isInitialized) return;
  isInitialized = true;

  updateVisibility();

  window.addEventListener('storage', (e) => {
    if (e.key === 'catalogFilters') {
      updateVisibility();
    }
  });

  window.addEventListener('resize', updateVisibility);

  window.addEventListener('sortChanged', () => {
    const wasScrubberVisible = isScrubberVisible;
    updateVisibility();

    if (getCurrentSort() && wasScrubberVisible && !isScrubberVisible) {
      showScrubber();
    }
  });

  // Observe DOM for product changes
  const observer = new MutationObserver(() => {
    if (getCurrentSort()) {
      clearTimeout(window.scrubberRefreshTimeout);
      window.scrubberRefreshTimeout = setTimeout(updateAvailableItems, 300);
    }
  });

  const container = document.querySelector('.products');
  if (container) {
    observer.observe(container, { childList: true, subtree: true });
  }

}

export function cleanupSortScrubber() {
  if (triggerButtonElement) {
    triggerButtonElement.remove();
    triggerButtonElement = null;
  }
  if (scrubberElement) {
    scrubberElement.remove();
    scrubberElement = null;
  }
  if (letterPickerElement) {
    letterPickerElement.remove();
    letterPickerElement = null;
  }
  if (previewElement) {
    previewElement.remove();
    previewElement = null;
  }
  document.removeEventListener('click', handleDocumentClick);
  isInitialized = false;
}

export function updateSortScrubberVisibility() {
  updateVisibility();
}

// Legacy exports for backwards compatibility
export const initAlphabeticalScroll = initSortScrubber;
export const cleanupAlphabeticalScroll = cleanupSortScrubber;
export const updateAlphabetScrollVisibility = updateSortScrubberVisibility;

// Make available globally
window.updateSortScrubberVisibility = updateSortScrubberVisibility;
window.updateAlphabetScrollVisibility = updateSortScrubberVisibility;
