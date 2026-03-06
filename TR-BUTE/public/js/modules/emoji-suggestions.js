/**
 * Sticker/Emoji Suggestions Module
 * Shows sticker suggestions based on the word being typed
 * Uses image-based stickers from VK CDN instead of Unicode emojis
 */

import {
  findMatchingStickers,
  getCurrentWord,
  getFrequentStickers,
  getStickerById,
  stickerCategories,
  getStickersByCategory
} from './emoji-data.js';

let activeSuggestionContainer = null;
let activeInput = null;
let activeWordInfo = null;

/**
 * Create suggestion container element
 * @returns {HTMLElement}
 */
function createSuggestionContainer() {
  const container = document.createElement('div');
  container.className = 'emoji-suggestions';
  container.style.cssText = `
    position: absolute;
    display: none;
    background: var(--bg-secondary, #fff);
    border: 1px solid var(--border-color, #e0e0e0);
    border-radius: 12px;
    padding: 6px 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 1000;
    gap: 4px;
    flex-wrap: wrap;
    max-width: 200px;
  `;
  return container;
}

/**
 * Create sticker picker button and popup
 * @param {HTMLElement} input - Input element
 * @returns {HTMLElement} - Picker button
 */
export function createEmojiPicker(input) {
  const wrapper = document.createElement('div');
  wrapper.className = 'emoji-picker-wrapper';
  wrapper.style.cssText = '';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'emoji-picker-btn';
  button.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
    <line x1="9" y1="9" x2="9.01" y2="9"></line>
    <line x1="15" y1="9" x2="15.01" y2="9"></line>
  </svg>`;
  button.title = 'Добавить стикер';
  button.style.cssText = `
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 8px;
    transition: background-color 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary, #666);
  `;

  button.addEventListener('mouseenter', () => {
    button.style.backgroundColor = 'var(--bg-hover, #f0f0f0)';
  });
  button.addEventListener('mouseleave', () => {
    button.style.backgroundColor = 'transparent';
  });

  const popup = createStickerPopup(input);
  wrapper.appendChild(button);
  wrapper.appendChild(popup);

  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const isOpening = popup.style.display === 'none';
    popup.style.display = isOpening ? 'block' : 'none';

    // Position popup to stay within viewport
    if (isOpening) {
      requestAnimationFrame(() => {
        const popupRect = popup.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;

        // Reset position first
        popup.style.bottom = '100%';
        popup.style.top = 'auto';
        popup.style.marginBottom = '4px';
        popup.style.marginTop = '0';

        // Check if popup goes above viewport
        const newRect = popup.getBoundingClientRect();
        if (newRect.top < 10) {
          popup.style.bottom = 'auto';
          popup.style.top = '100%';
          popup.style.marginTop = '4px';
          popup.style.marginBottom = '0';
        }

        // Check if popup goes off right edge
        if (newRect.right > viewportWidth - 10) {
          popup.style.right = '0';
          popup.style.left = 'auto';
        }

        // Check if popup goes off left edge
        if (newRect.left < 10) {
          popup.style.left = '0';
          popup.style.right = 'auto';
        }
      });
    }
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) {
      popup.style.display = 'none';
    }
  });

  return wrapper;
}

/**
 * Create sticker popup with categories
 * @param {HTMLElement} input - Input element
 * @returns {HTMLElement}
 */
function createStickerPopup(input) {
  const popup = document.createElement('div');
  popup.className = 'emoji-popup sticker-popup';
  popup.style.cssText = `
    position: absolute;
    display: none;
    bottom: 100%;
    right: 0;
    background: var(--bg-secondary, #fff);
    border: 1px solid var(--border-color, #e0e0e0);
    border-radius: 12px;
    padding: 12px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.2);
    z-index: 1001;
    width: 280px;
    max-height: 300px;
    overflow-y: auto;
    margin-bottom: 4px;
  `;

  // Prevent click events from propagating to avoid scroll issues
  popup.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Frequent stickers section
  const frequentSection = document.createElement('div');
  frequentSection.innerHTML = `<div style="font-size: 11px; color: var(--text-secondary, #666); margin-bottom: 6px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;">Часто используемые</div>`;
  const frequentGrid = document.createElement('div');
  frequentGrid.className = 'sticker-grid';
  frequentGrid.style.cssText = 'display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px;';

  const frequentStickers = getFrequentStickers();
  frequentStickers.forEach(sticker => {
    const btn = createStickerButton(sticker, input, popup);
    frequentGrid.appendChild(btn);
  });
  frequentSection.appendChild(frequentGrid);
  popup.appendChild(frequentSection);

  // Category sections
  Object.entries(stickerCategories).forEach(([category, stickerIds]) => {
    const stickers = getStickersByCategory(category);
    if (stickers.length === 0) return;

    const section = document.createElement('div');
    section.innerHTML = `<div style="font-size: 11px; color: var(--text-secondary, #666); margin-bottom: 6px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;">${category}</div>`;
    const grid = document.createElement('div');
    grid.className = 'sticker-grid';
    grid.style.cssText = 'display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px;';

    stickers.forEach(sticker => {
      const btn = createStickerButton(sticker, input, popup);
      grid.appendChild(btn);
    });
    section.appendChild(grid);
    popup.appendChild(section);
  });

  return popup;
}

/**
 * Create individual sticker button
 * @param {Object} sticker - Sticker object with id, url, alt
 * @param {HTMLElement} input
 * @param {HTMLElement} popup
 * @returns {HTMLElement}
 */
function createStickerButton(sticker, input, popup) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sticker-btn';
  btn.title = sticker.alt || sticker.id;
  btn.style.cssText = `
    background: var(--bg-tertiary, #f5f5f5);
    border: none;
    cursor: pointer;
    padding: 8px;
    border-radius: 8px;
    transition: background-color 0.2s, transform 0.1s;
    display: flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 1;
  `;

  // Create image element for sticker
  const img = document.createElement('img');
  img.src = sticker.url;
  img.alt = sticker.alt || sticker.id;
  img.loading = 'lazy';
  img.style.cssText = `
    width: 32px;
    height: 32px;
    object-fit: contain;
    pointer-events: none;
  `;

  // Fallback for broken images
  img.onerror = () => {
    img.style.display = 'none';
    btn.textContent = sticker.alt?.[0] || '?';
    btn.style.fontSize = '20px';
    btn.style.color = 'var(--text-secondary, #666)';
  };

  btn.appendChild(img);

  btn.addEventListener('mouseenter', () => {
    btn.style.backgroundColor = 'var(--bg-hover, #e5e5e5)';
    btn.style.transform = 'scale(1.1)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.backgroundColor = 'var(--bg-tertiary, #f5f5f5)';
    btn.style.transform = 'scale(1)';
  });

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    insertSticker(input, sticker);
    popup.style.display = 'none';
  });

  return btn;
}

/**
 * Insert sticker at cursor position
 * Inserts a markdown-style reference: [sticker:id]
 * @param {HTMLElement} input
 * @param {Object} sticker
 */
function insertSticker(input, sticker) {
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const text = input.value;

  // Insert sticker as markdown-like syntax
  // The backend/renderer will convert this to an actual image
  const stickerText = `[sticker:${sticker.id}]`;

  input.value = text.substring(0, start) + stickerText + text.substring(end);
  input.selectionStart = input.selectionEnd = start + stickerText.length;
  input.focus();

  // Trigger input event for reactivity
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Initialize sticker suggestions for an input field
 * @param {HTMLElement} input - Input or textarea element
 * @param {Object} options - Configuration options
 */
export function initEmojiSuggestions(input, options = {}) {
  if (!input) return;

  const container = createSuggestionContainer();

  // Position container relative to input's parent
  const inputParent = input.parentElement;
  if (inputParent) {
    inputParent.style.position = 'relative';
    inputParent.appendChild(container);
  }

  let debounceTimer = null;

  input.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      handleInput(input, container);
    }, 150);
  });

  input.addEventListener('keydown', (e) => {
    if (container.style.display !== 'none') {
      if (e.key === 'Escape') {
        hideSuggestions(container);
        e.preventDefault();
      }
    }
  });

  input.addEventListener('blur', () => {
    // Delay hiding to allow click on suggestions
    setTimeout(() => {
      hideSuggestions(container);
    }, 200);
  });

  // Store reference
  input._emojiContainer = container;
}

/**
 * Handle input changes and show suggestions
 * @param {HTMLElement} input
 * @param {HTMLElement} container
 */
function handleInput(input, container) {
  const cursorPos = input.selectionStart;
  const wordInfo = getCurrentWord(input.value, cursorPos);

  if (!wordInfo.word || wordInfo.word.length < 2) {
    hideSuggestions(container);
    return;
  }

  const matches = findMatchingStickers(wordInfo.word);

  if (matches.length === 0) {
    hideSuggestions(container);
    return;
  }

  // Store for later use when selecting
  activeInput = input;
  activeWordInfo = wordInfo;
  activeSuggestionContainer = container;

  showSuggestions(container, matches, input);
}

/**
 * Show sticker suggestions
 * @param {HTMLElement} container
 * @param {Array} stickers
 * @param {HTMLElement} input
 */
function showSuggestions(container, stickers, input) {
  container.innerHTML = '';

  stickers.forEach(sticker => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'emoji-suggestion-btn sticker-suggestion-btn';
    btn.title = sticker.alt || sticker.id;
    btn.style.cssText = `
      background: var(--bg-tertiary, #f5f5f5);
      border: none;
      cursor: pointer;
      padding: 6px;
      border-radius: 8px;
      transition: background-color 0.2s, transform 0.1s;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    // Create image
    const img = document.createElement('img');
    img.src = sticker.url;
    img.alt = sticker.alt || sticker.id;
    img.style.cssText = 'width: 28px; height: 28px; object-fit: contain;';
    btn.appendChild(img);

    btn.addEventListener('mouseenter', () => {
      btn.style.backgroundColor = 'var(--bg-hover, #e5e5e5)';
      btn.style.transform = 'scale(1.15)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.backgroundColor = 'var(--bg-tertiary, #f5f5f5)';
      btn.style.transform = 'scale(1)';
    });

    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      selectSuggestion(sticker);
    });

    container.appendChild(btn);
  });

  // Position above input
  container.style.display = 'flex';
  container.style.bottom = '100%';
  container.style.left = '0';
  container.style.marginBottom = '4px';
}

/**
 * Hide suggestions
 * @param {HTMLElement} container
 */
function hideSuggestions(container) {
  if (container) {
    container.style.display = 'none';
  }
  activeInput = null;
  activeWordInfo = null;
  activeSuggestionContainer = null;
}

/**
 * Select sticker and insert after current word
 * @param {Object} sticker
 */
function selectSuggestion(sticker) {
  if (!activeInput || !activeWordInfo) return;

  const text = activeInput.value;
  const { endPos } = activeWordInfo;

  // Insert sticker reference after the current word
  const stickerText = ` [sticker:${sticker.id}] `;
  const before = text.substring(0, endPos);
  const after = text.substring(endPos);

  activeInput.value = before + stickerText + after.trimStart();

  // Position cursor after sticker
  const newPos = endPos + stickerText.length;
  activeInput.selectionStart = activeInput.selectionEnd = newPos;
  activeInput.focus();

  // Trigger input event
  activeInput.dispatchEvent(new Event('input', { bubbles: true }));

  hideSuggestions(activeSuggestionContainer);
}

/**
 * Add sticker picker button to an input field
 * @param {HTMLElement} input - Input or textarea element
 * @param {HTMLElement} targetContainer - Where to insert the picker button
 */
export function addEmojiPickerToInput(input, targetContainer) {
  const picker = createEmojiPicker(input);
  if (targetContainer) {
    targetContainer.appendChild(picker);
  } else if (input.parentElement) {
    input.parentElement.appendChild(picker);
  }
  return picker;
}
