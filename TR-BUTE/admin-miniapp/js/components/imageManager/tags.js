// Tag input systems (keywords, IP names, authors) for the product modal.

import { apiGet } from '../../utils/apiClient.js';

let authorSuggestionsCache = [];
let keywordSuggestionsCache = [];
let slugSuggestionsCache = [];
let ipNamesSuggestionsCache = [];

/**
 * Load author and keyword suggestions for autocomplete dropdowns
 */
async function loadAuthorSuggestions() {
  try {
    const [authResp, kwResp, slugResp, ipResp] = await Promise.all([
      apiGet('/api/products/authors'),
      apiGet('/api/products/keywords'),
      apiGet('/api/products/slugs'),
      apiGet('/api/products/ip-names'),
    ]);
    if (authResp.ok) {
      const data = await authResp.json();
      authorSuggestionsCache = data.authors || [];
    }
    if (kwResp.ok) {
      const data = await kwResp.json();
      keywordSuggestionsCache = data.keywords || [];
    }
    if (slugResp.ok) {
      const data = await slugResp.json();
      slugSuggestionsCache = data.slugs || [];
    }
    if (ipResp.ok) {
      const data = await ipResp.json();
      ipNamesSuggestionsCache = data.ip_names || [];
    }
  } catch (err) {
    console.error('Error loading suggestions:', err);
  }
}

/**
 * Attach a suggestion dropdown to a tag input.
 * @param {string} inputId   - text input element id
 * @param {string} dropdownId - dropdown container element id
 * @param {string[]} cache   - array of suggestion strings
 * @param {function} addTagFn   - (value) => void, adds a tag
 * @param {function} getTagsFn  - () => string[], returns current lowercase tags
 */
function attachTagSuggestions(inputId, dropdownId, cache, addTagFn, getTagsFn) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  if (!input || !dropdown) return;

  let activeIndex = -1;

  function showDropdown(query) {
    const q = query.trim().toLowerCase();
    if (!q || cache.length === 0) { hideDropdown(); return; }

    const existing = getTagsFn();
    const matches = cache.filter(s =>
      s.toLowerCase().includes(q) && !existing.includes(s.toLowerCase())
    ).slice(0, 8);

    if (!matches.length) { hideDropdown(); return; }

    dropdown.innerHTML = matches.map((s, i) =>
      `<div class="tag-suggestion-item" data-index="${i}" data-value="${s.replace(/"/g, '&quot;')}">${s}</div>`
    ).join('');
    dropdown.classList.add('visible');
    activeIndex = -1;
  }

  function hideDropdown() {
    dropdown.classList.remove('visible');
    dropdown.innerHTML = '';
    activeIndex = -1;
  }

  function applyActive() {
    const items = dropdown.querySelectorAll('.tag-suggestion-item');
    items.forEach((el, i) => el.classList.toggle('active', i === activeIndex));
  }

  input.addEventListener('input', () => {
    showDropdown(input.value);
  });

  input.addEventListener('keydown', (e) => {
    const items = dropdown.querySelectorAll('.tag-suggestion-item');
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      applyActive();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, -1);
      applyActive();
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const val = items[activeIndex]?.dataset.value;
      if (val) { addTagFn(val); input.value = ''; hideDropdown(); }
    } else if (e.key === 'Escape') {
      hideDropdown();
    }
  });

  dropdown.addEventListener('mousedown', (e) => {
    const item = e.target.closest('.tag-suggestion-item');
    if (!item) return;
    e.preventDefault();
    addTagFn(item.dataset.value);
    input.value = '';
    hideDropdown();
    input.focus();
  });

  input.addEventListener('blur', () => setTimeout(hideDropdown, 150));
}

/**
 * Initialize keyword tags input component
 * Converts comma-separated keywords to interactive pill tags
 */
function initializeKeywordTags() {
  const input = document.getElementById('keyword-tags-input');
  const display = document.getElementById('keyword-tags-display');
  const hiddenInput = document.getElementById('modal-product-keywords');

  if (!input || !display || !hiddenInput) return;

  // Parse initial keywords from data attribute
  const initialValue = input.dataset.initial || '';
  const keywords = initialValue
    .split(',')
    .map(k => k.trim())
    .filter(k => k.length > 0);

  // Render initial tags
  keywords.forEach(keyword => addKeywordTag(keyword));

  // Handle Enter key to add new tag
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = input.value.trim();
      if (value && !getKeywords().includes(value.toLowerCase())) {
        addKeywordTag(value);
        input.value = '';
        updateHiddenInput();
      }
    } else if (e.key === 'Backspace' && input.value === '') {
      // Remove last tag on backspace if input is empty
      const tags = display.querySelectorAll('.keyword-tag');
      if (tags.length > 0) {
        tags[tags.length - 1].remove();
        updateHiddenInput();
      }
    }
  });

  // Also add on comma and newline (mobile keyboards insert newline instead of Enter)
  input.addEventListener('input', (e) => {
    const value = input.value;
    if (value.includes(',') || value.includes('\n')) {
      const parts = value.split(/[,\n]+/);
      parts.forEach((part, index) => {
        const trimmed = part.trim();
        if (trimmed && !getKeywords().includes(trimmed.toLowerCase())) {
          addKeywordTag(trimmed);
        }
      });
      input.value = '';
      updateHiddenInput();
    }
  });

  // Handle tag removal via event delegation
  display.addEventListener('click', (e) => {
    if (e.target.classList.contains('keyword-tag-remove') || e.target.closest('.keyword-tag-remove')) {
      const tag = e.target.closest('.keyword-tag');
      if (tag) {
        tag.remove();
        updateHiddenInput();
      }
    }
  });

  // Attach suggestion dropdown
  attachTagSuggestions('keyword-tags-input', 'keyword-suggestions-dropdown', keywordSuggestionsCache, addKeywordTag, getKeywords);

  function addKeywordTag(keyword) {
    if (getKeywords().includes(keyword.toLowerCase())) return;
    const tag = document.createElement('span');
    tag.className = 'keyword-tag';
    tag.innerHTML = `
      <span class="keyword-tag-text">${escapeHtml(keyword)}</span>
      <button type="button" class="keyword-tag-remove" title="Удалить">×</button>
    `;
    display.appendChild(tag);
    updateHiddenInput();
  }

  function getKeywords() {
    return Array.from(display.querySelectorAll('.keyword-tag-text'))
      .map(el => el.textContent.toLowerCase());
  }

  function updateHiddenInput() {
    const keywords = Array.from(display.querySelectorAll('.keyword-tag-text'))
      .map(el => el.textContent)
      .join(', ');
    hiddenInput.value = keywords;

    // Trigger input event for change tracking
    hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

/**
 * Initialize IP names tags input component
 * Same pattern as keyword tags but for ip_names field
 */
function initializeIpNamesTags() {
  const input = document.getElementById('ip-names-tags-input');
  const display = document.getElementById('ip-names-tags-display');
  const hiddenInput = document.getElementById('modal-product-ip-names');

  if (!input || !display || !hiddenInput) return;

  const initialValue = input.dataset.initial || '';
  const names = initialValue.split(',').map(k => k.trim()).filter(k => k.length > 0);
  names.forEach(name => addTag(name));

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = input.value.trim();
      if (value && !getTags().includes(value.toLowerCase())) {
        addTag(value);
        input.value = '';
        sync();
      }
    } else if (e.key === 'Backspace' && input.value === '') {
      const tags = display.querySelectorAll('.keyword-tag');
      if (tags.length > 0) { tags[tags.length - 1].remove(); sync(); }
    }
  });

  input.addEventListener('input', () => {
    const value = input.value;
    if (value.includes(',') || value.includes('\n')) {
      value.split(/[,\n]+/).forEach(part => {
        const trimmed = part.trim();
        if (trimmed && !getTags().includes(trimmed.toLowerCase())) addTag(trimmed);
      });
      input.value = '';
      sync();
    }
  });

  display.addEventListener('click', (e) => {
    if (e.target.classList.contains('keyword-tag-remove') || e.target.closest('.keyword-tag-remove')) {
      const tag = e.target.closest('.keyword-tag');
      if (tag) { tag.remove(); sync(); }
    }
  });

  attachTagSuggestions('ip-names-tags-input', 'ip-names-suggestions-dropdown', ipNamesSuggestionsCache, addTag, getTags);

  function addTag(name) {
    const tag = document.createElement('span');
    tag.className = 'keyword-tag';
    const div = document.createElement('div');
    div.textContent = name;
    tag.innerHTML = `<span class="keyword-tag-text">${div.innerHTML}</span><button type="button" class="keyword-tag-remove" title="Удалить">×</button>`;
    display.appendChild(tag);
  }

  function getTags() {
    return Array.from(display.querySelectorAll('.keyword-tag-text')).map(el => el.textContent.toLowerCase());
  }

  function sync() {
    hiddenInput.value = Array.from(display.querySelectorAll('.keyword-tag-text')).map(el => el.textContent).join(', ');
    hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

/**
 * Initialize author tags input component
 * Converts comma-separated authors to interactive pill tags
 */
function initializeAuthorTags() {
  const input = document.getElementById('author-tags-input');
  const display = document.getElementById('author-tags-display');
  const hiddenInput = document.getElementById('modal-product-author');

  if (!input || !display || !hiddenInput) return;

  // Parse initial authors from data attribute
  const initialValue = input.dataset.initial || '';
  const authors = initialValue
    .split(',')
    .map(a => a.trim())
    .filter(a => a.length > 0);

  // Render initial tags
  authors.forEach(author => addAuthorTag(author));

  // Handle Enter key to add new tag
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = input.value.trim();
      if (value && !getAuthors().includes(value.toLowerCase())) {
        addAuthorTag(value);
        input.value = '';
        updateHiddenInput();
      }
    } else if (e.key === 'Backspace' && input.value === '') {
      // Remove last tag on backspace if input is empty
      const tags = display.querySelectorAll('.author-tag');
      if (tags.length > 0) {
        tags[tags.length - 1].remove();
        updateHiddenInput();
      }
    }
  });

  // Also add on comma or newline (mobile keyboards may insert newline)
  input.addEventListener('input', (e) => {
    const value = input.value;
    if (value.includes(',') || value.includes('\n')) {
      value.split(/[,\n]+/).forEach(part => {
        const trimmed = part.trim();
        if (trimmed && !getAuthors().includes(trimmed.toLowerCase())) {
          addAuthorTag(trimmed);
        }
      });
      input.value = '';
      updateHiddenInput();
    }
  });

  // Handle tag removal via event delegation
  display.addEventListener('click', (e) => {
    if (e.target.classList.contains('author-tag-remove') || e.target.closest('.author-tag-remove')) {
      const tag = e.target.closest('.author-tag');
      if (tag) {
        tag.remove();
        updateHiddenInput();
      }
    }
  });

  // Attach suggestion dropdown
  attachTagSuggestions('author-tags-input', 'author-suggestions-dropdown', authorSuggestionsCache, addAuthorTag, getAuthors);

  function addAuthorTag(author) {
    if (getAuthors().includes(author.toLowerCase())) return;
    const tag = document.createElement('span');
    tag.className = 'author-tag keyword-tag';
    tag.innerHTML = `
      <span class="author-tag-text">${escapeHtml(author)}</span>
      <button type="button" class="author-tag-remove keyword-tag-remove" title="Удалить">×</button>
    `;
    display.appendChild(tag);
    updateHiddenInput();
  }

  function getAuthors() {
    return Array.from(display.querySelectorAll('.author-tag-text'))
      .map(el => el.textContent.toLowerCase());
  }

  function updateHiddenInput() {
    const authors = Array.from(display.querySelectorAll('.author-tag-text'))
      .map(el => el.textContent)
      .join(', ');
    hiddenInput.value = authors;

    // Trigger input event for change tracking
    hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

/**
 * Attach inline suggestion dropdown to a plain text input (single-value, not tags).
 */
function initializeSlugSuggestions() {
  const input = document.getElementById('modal-product-slug');
  const dropdown = document.getElementById('slug-suggestions-dropdown');
  if (!input || !dropdown) return;

  attachTagSuggestions(
    'modal-product-slug',
    'slug-suggestions-dropdown',
    slugSuggestionsCache,
    (val) => {
      input.value = val;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    },
    () => [] // single-value field — never exclude suggestions based on current value
  );
}

export {
  loadAuthorSuggestions, attachTagSuggestions,
  initializeKeywordTags, initializeIpNamesTags, initializeAuthorTags,
  initializeSlugSuggestions
};
