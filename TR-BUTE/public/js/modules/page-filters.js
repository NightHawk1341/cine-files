/**
 * Page Filters Module
 * Shared filter bar (search, genre, type, sort, extras, reset, collapse) for all pages.
 *
 * Usage:
 *   import { createPageFilters } from '/js/modules/page-filters.js';
 *   const pf = createPageFilters(containerEl, { ... });
 *   // pf.getFilters(), pf.reset(), pf.destroy()
 */

// ---- Fuzzy matching helpers (shared across pages) ----

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function fuzzyMatchField(field, query) {
  if (!field) return false;
  const fieldWords = field.split(/\s+/).map(w => w.replace(/[.,!?;:'"«»()\-–—]/g, ''));
  const queryWords = query.split(/\s+/).filter(w => w.length >= 4);
  if (queryWords.length === 0) return false;
  return queryWords.every(qWord => {
    const maxDist = qWord.length <= 5 ? 1 : 2;
    return fieldWords.some(fWord => {
      if (Math.abs(fWord.length - qWord.length) > maxDist) return false;
      return levenshtein(fWord, qWord) <= maxDist;
    });
  });
}

// ---- Sort helper ----

export function sortProducts(products, key, direction) {
  if (!key) {
    return products.sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }
  switch (key) {
    case 'title':
      return products.sort((a, b) =>
        direction === 'asc' ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title)
      );
    case 'new':
      return products.sort((a, b) =>
        direction === 'asc' ? new Date(a.created_at) - new Date(b.created_at) : new Date(b.created_at) - new Date(a.created_at)
      );
    case 'release':
      return products.sort((a, b) =>
        direction === 'asc' ? new Date(a.release_date) - new Date(b.release_date) : new Date(b.release_date) - new Date(a.release_date)
      );
    case 'development_time':
      return products.sort((a, b) => {
        const aTime = a.development_time || 0;
        const bTime = b.development_time || 0;
        return direction === 'asc' ? aTime - bTime : bTime - aTime;
      });
    default:
      return products;
  }
}

// ---- Search match helper ----

export function matchesSearch(product, searchQ) {
  if (!searchQ) return true;
  return (
    product.title?.toLowerCase().includes(searchQ) ||
    product.alt?.toLowerCase().includes(searchQ) ||
    (product.keywords && product.keywords.toLowerCase().includes(searchQ)) ||
    fuzzyMatchField(product.title?.toLowerCase() || '', searchQ) ||
    fuzzyMatchField(product.alt?.toLowerCase() || '', searchQ) ||
    fuzzyMatchField(product.keywords?.toLowerCase() || '', searchQ)
  );
}

// ---- Default sort options ----

const DEFAULT_SORT_OPTIONS = [
  { key: 'title', label: 'Название' },
  { key: 'new', label: 'Новизна' },
  { key: 'release', label: 'Дата выхода' },
  { key: 'development_time', label: 'Время разработки' }
];

/**
 * Create a page filter bar inside a container element.
 *
 * @param {HTMLElement} container - The wrapper (e.g. .products-header or .sticky-filter-wrapper)
 * @param {Object} options
 * @param {string}   options.pageId          - Unique page key (for scoped IDs)
 * @param {Object}   options.features        - { search, genres, types, sort, reset, faq, collapse }
 * @param {Array}    options.extraGroups      - [{ key, buttons: [{ label, value }], toggle }]
 *                                              toggle: 'single' (radio-style, click active = deselect)
 * @param {Function} options.onFilter        - Called with current filters on every change
 * @param {Function} options.onFaqClick      - Handler for FAQ button
 * @param {string}   options.storageKey      - localStorage key for persistence (null = none)
 * @param {Array}    options.sortOptions     - [{ key, label }] (defaults to standard set)
 * @returns {Object} Controller: { getFilters, setFilters, reset, destroy, el }
 */
export function createPageFilters(container, options = {}) {
  const {
    pageId = 'page',
    features = {},
    extraGroups = [],
    onFilter = () => {},
    onFaqClick = null,
    storageKey = null,
    sortOptions = DEFAULT_SORT_OPTIONS
  } = options;

  // ---- State ----
  let filters = { search: null, genre: null, type: null, sort: null };
  let sortDirection = 'desc';
  let searchPanelManuallyOpened = false;
  let sortPanelManuallyOpened = false;
  let expandedSetupComplete = false;

  // Extra group state
  const extraState = {};
  extraGroups.forEach(g => { extraState[g.key] = null; });

  // ---- Build HTML ----
  const collapsible = document.createElement('div');
  collapsible.className = 'collapsible-content pf-collapsible-wrapper';

  const pill = document.createElement('div');
  pill.className = 'product-filters';

  // Search group
  if (features.search) {
    pill.innerHTML += `
      <div class="search-toggle-group">
        <button class="search-toggle-button btn-filter" aria-expanded="false" data-tooltip="Поиск">
          <svg width="12" height="12" class="filter-icon"><use href="#search"></use></svg>
        </button>
        <div class="search-toggle-panel hidden">
          <div class="search-inline-wrapper">
            <input type="text" class="pf-search-input" placeholder="Поиск товаров" />
            <button class="search-clear-inline btn-icon" data-tooltip="Очистить">
              <svg width="9" height="9"><use href="#x"></use></svg>
            </button>
          </div>
        </div>
      </div>`;
  }

  // Genre buttons
  if (features.genres) {
    pill.innerHTML += `
      <div class="filters-group">
        <button class="filter-button btn-filter" data-genre="игра">Игра</button>
        <button class="filter-button btn-filter" data-genre="фильм">Фильм</button>
        <button class="filter-button btn-filter" data-genre="сериал">Сериал</button>
        <button class="filter-button btn-filter" data-genre="аниме">Аниме</button>
      </div>`;
  }

  // Type buttons
  if (features.types) {
    pill.innerHTML += `
      <div class="types-group">
        <button class="type-button btn-filter" data-type="фирменный">Фирменный</button>
        <button class="type-button btn-filter" data-type="оригинал">Оригинал</button>
      </div>`;
  }

  // Extra groups (tags, masonry buttons, etc.)
  extraGroups.forEach(group => {
    const groupClass = group.groupClass || 'extras-group';
    const btnClass = group.buttonClass || 'extra-filter-button';
    const btns = group.buttons.map(b =>
      `<button class="${btnClass} btn-filter" data-extra-group="${group.key}" data-extra-value="${b.value}">${b.label}</button>`
    ).join('');
    pill.innerHTML += `<div class="${groupClass}">${btns}</div>`;
  });

  // Sort dropdown
  if (features.sort) {
    const lis = sortOptions.map(o =>
      `<li data-sort="${o.key}">${o.label}</li>`
    ).join('');
    pill.innerHTML += `
      <div class="sort-dropdown-wrapper">
        <button class="sort-toggle-button btn-filter" data-tooltip="Сортировка">
          <svg class="filter-icon" width="12" height="12"><use href="#sort"></use></svg>
        </button>
        <div class="sort-toggle-panel hidden">
          <div class="sort-dropdown">
            <button class="pf-sort-toggle btn-filter" data-tooltip="Сортировка">
              <span class="pf-sort-label">По умолчанию</span>
              <svg class="sort-direction-arrow pf-sort-arrow" width="10" height="10" style="display: none;"><use href="#chevron-down"></use></svg>
            </button>
            <ul class="hidden pf-sort-options">${lis}</ul>
          </div>
        </div>
      </div>`;
  }

  // Reset
  if (features.reset) {
    pill.innerHTML += `
      <div class="reset-group">
        <button class="reset-button btn-filter" data-tooltip="Сбросить">
          <svg class="filter-icon" width="12" height="12"><use href="#x"></use></svg>
        </button>
      </div>`;
  }

  // FAQ
  if (features.faq && onFaqClick) {
    pill.innerHTML += `
      <div class="faq-group">
        <button class="faq-filter-button btn-filter" data-tooltip="Как пользоваться сайтом">
          <svg class="filter-icon" width="12" height="12"><use href="#question"></use></svg>
        </button>
      </div>`;
  }

  // Collapse arrow
  if (features.collapse) {
    pill.innerHTML += `
      <div class="collapse-arrow-group">
        <button class="collapse-arrow-button btn-filter" data-tooltip="Свернуть">
          <svg class="collapse-arrow-icon down" width="12" height="12"><use href="#chevron-down"></use></svg>
        </button>
      </div>`;
  }

  collapsible.appendChild(pill);
  container.innerHTML = '';
  container.appendChild(collapsible);

  // ---- DOM refs ----
  const searchToggleBtn = pill.querySelector('.search-toggle-button');
  const searchTogglePanel = pill.querySelector('.search-toggle-panel');
  const searchInput = pill.querySelector('.pf-search-input');
  const searchClearBtn = pill.querySelector('.search-clear-inline');
  const searchToggleGroup = pill.querySelector('.search-toggle-group');

  const sortDropdownWrapper = pill.querySelector('.sort-dropdown-wrapper');
  const sortToggleBtn = pill.querySelector('.sort-toggle-button');
  const sortTogglePanel = pill.querySelector('.sort-toggle-panel');
  const sortToggle = pill.querySelector('.pf-sort-toggle');
  const sortOptionsUl = pill.querySelector('.pf-sort-options');
  const sortLabel = pill.querySelector('.pf-sort-label');
  const sortArrow = pill.querySelector('.pf-sort-arrow');

  const resetBtn = pill.querySelector('.reset-button');
  const faqBtn = pill.querySelector('.faq-filter-button');

  const collapseArrowBtn = pill.querySelector('.collapse-arrow-button');
  const collapseArrowIcon = pill.querySelector('.collapse-arrow-icon');

  // ---- Helpers ----

  function notifyChange() {
    const all = { ...filters, sortDirection };
    extraGroups.forEach(g => { all[g.key] = extraState[g.key]; });
    onFilter(all);
  }

  function saveToStorage() {
    if (!storageKey) return;
    try {
      const data = { ...filters, sortDirection };
      extraGroups.forEach(g => { data[g.key] = extraState[g.key]; });
      sessionStorage.setItem(storageKey, JSON.stringify(data));
    } catch (_) { /* ignore */ }
  }

  function loadFromStorage() {
    if (!storageKey) return;
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (!saved) return;
      const parsed = JSON.parse(saved);

      if (parsed.search) {
        filters.search = parsed.search;
        if (searchInput) {
          searchInput.value = parsed.search;
          searchInput.classList.add('has-value');
          searchTogglePanel?.classList.remove('hidden');
          searchToggleBtn?.classList.add('active-glow');
          updateSearchInputWidth();
        }
      }

      if (parsed.genre) {
        filters.genre = parsed.genre;
        pill.querySelectorAll('[data-genre]').forEach(btn => {
          if (btn.dataset.genre === parsed.genre) btn.classList.add('active');
        });
      }

      if (parsed.type) {
        filters.type = parsed.type;
        pill.querySelectorAll('[data-type]').forEach(btn => {
          if (btn.dataset.type === parsed.type) btn.classList.add('active');
        });
      }

      if (parsed.sort) {
        filters.sort = parsed.sort;
        const item = pill.querySelector(`[data-sort="${parsed.sort}"]`);
        if (item && sortLabel) {
          sortLabel.textContent = item.textContent;
          sortToggle?.classList.add('has-sort');
          sortToggleBtn?.classList.add('active-glow');
        }
      }

      if (parsed.sortDirection) {
        sortDirection = parsed.sortDirection;
        window.sortDirection = sortDirection;
      }

      updateSortArrow();

      // Restore extra state
      extraGroups.forEach(g => {
        if (parsed[g.key]) {
          extraState[g.key] = parsed[g.key];
          const btn = pill.querySelector(`[data-extra-group="${g.key}"][data-extra-value="${parsed[g.key]}"]`);
          if (btn) btn.classList.add('active');
        }
      });
    } catch (_) { /* ignore */ }
  }

  function updateSortArrow() {
    if (!sortArrow) return;
    if (filters.sort) {
      sortArrow.style.display = 'block';
      sortArrow.classList.toggle('asc', sortDirection === 'asc');
      sortArrow.classList.toggle('desc', sortDirection === 'desc');
    } else {
      sortArrow.style.display = 'none';
    }
  }

  function updateSearchInputWidth() {
    if (!searchInput) return;
    const value = searchInput.value;
    const minWidth = 120;
    const maxWidth = 200;
    const span = document.createElement('span');
    span.style.visibility = 'hidden';
    span.style.position = 'absolute';
    span.style.font = window.getComputedStyle(searchInput).font;
    span.textContent = value || searchInput.placeholder;
    document.body.appendChild(span);
    const textWidth = span.offsetWidth + 30;
    document.body.removeChild(span);
    searchInput.style.width = `${Math.min(maxWidth, Math.max(minWidth, textWidth))}px`;
  }

  // ---- Collapsed visibility ----

  function updateCollapsedVisibility() {
    const isCollapsed = !collapsible.classList.contains('active');

    requestAnimationFrame(() => {
      if (isCollapsed) {
        expandedSetupComplete = false;

        // Hide inactive genre/type/extra buttons
        pill.querySelectorAll('.filter-button:not(.active)').forEach(btn => btn.style.display = 'none');
        pill.querySelectorAll('.type-button:not(.active)').forEach(btn => btn.style.display = 'none');
        pill.querySelectorAll('.extra-filter-button:not(.active)').forEach(btn => btn.style.display = 'none');

        // Hide groups with no active buttons
        const filtersGroup = pill.querySelector('.filters-group');
        if (filtersGroup) {
          filtersGroup.style.display = filtersGroup.querySelector('.filter-button.active') ? 'flex' : 'none';
        }
        const typesGroup = pill.querySelector('.types-group');
        if (typesGroup) {
          typesGroup.style.display = typesGroup.querySelector('.type-button.active') ? 'flex' : 'none';
        }

        // Hide extra groups with no active buttons
        extraGroups.forEach(g => {
          const groupEl = pill.querySelector(`[data-extra-group="${g.key}"]`)?.parentElement;
          if (groupEl) {
            groupEl.style.display = groupEl.querySelector('.active') ? 'flex' : 'none';
          }
        });

        // Show toggle buttons, hide panels
        if (searchToggleBtn) {
          searchToggleBtn.style.display = '';
          if (!searchPanelManuallyOpened && searchTogglePanel) {
            searchTogglePanel.classList.add('hidden');
            searchToggleBtn.setAttribute('aria-expanded', 'false');
          }
          searchToggleBtn.classList.toggle('active-glow', !!filters.search);
        }
        if (sortToggleBtn) {
          sortToggleBtn.style.display = '';
          if (!sortPanelManuallyOpened && sortTogglePanel) {
            sortTogglePanel.classList.add('hidden');
          }
          sortToggleBtn.classList.toggle('active-glow', !!filters.sort);
        }
      } else {
        if (expandedSetupComplete) {
          if (searchInput) searchInput.classList.toggle('has-value', !!filters.search);
          return;
        }

        // Show all buttons
        pill.querySelectorAll('.filter-button').forEach(btn => btn.style.display = '');
        pill.querySelectorAll('.type-button').forEach(btn => btn.style.display = '');
        pill.querySelectorAll('.extra-filter-button').forEach(btn => btn.style.display = '');

        const filtersGroup = pill.querySelector('.filters-group');
        if (filtersGroup) filtersGroup.style.display = '';
        const typesGroup = pill.querySelector('.types-group');
        if (typesGroup) typesGroup.style.display = '';

        extraGroups.forEach(g => {
          const groupEl = pill.querySelector(`[data-extra-group="${g.key}"]`)?.parentElement;
          if (groupEl) groupEl.style.display = '';
        });

        // Hide toggle buttons, show panels
        if (searchToggleBtn) searchToggleBtn.style.display = 'none';
        if (searchTogglePanel) {
          searchTogglePanel.classList.remove('hidden');
          searchPanelManuallyOpened = false;
        }
        if (searchInput) searchInput.classList.toggle('has-value', !!filters.search);

        if (sortToggleBtn) sortToggleBtn.style.display = 'none';
        if (sortTogglePanel) {
          sortTogglePanel.classList.remove('hidden');
          sortPanelManuallyOpened = false;
        }

        expandedSetupComplete = true;
      }
    });
  }

  // ---- Event handlers (stored for cleanup) ----
  const handlers = [];

  function on(el, event, fn, opts) {
    if (!el) return;
    el.addEventListener(event, fn, opts);
    handlers.push({ el, event, fn, opts });
  }

  // Search
  if (features.search) {
    const setSearchValue = (val) => {
      filters.search = val.trim().toLowerCase() || null;
      searchInput?.classList.toggle('has-value', !!filters.search);
      searchToggleBtn?.classList.toggle('active-glow', !!filters.search);
      saveToStorage();
      notifyChange();
      updateCollapsedVisibility();
    };

    on(searchInput, 'input', () => {
      setSearchValue(searchInput.value);
      updateSearchInputWidth();
    });

    on(searchClearBtn, 'click', () => {
      if (searchInput) searchInput.value = '';
      setSearchValue('');
      updateSearchInputWidth();
    });

    on(searchToggleBtn, 'click', (e) => {
      e.stopPropagation();
      const isCollapsed = !collapsible.classList.contains('active');
      if (isCollapsed) {
        const nowExpanded = searchTogglePanel.classList.contains('hidden');
        searchTogglePanel.classList.toggle('hidden', !nowExpanded);
        searchToggleBtn.setAttribute('aria-expanded', String(nowExpanded));
        searchToggleBtn.dataset.tooltip = nowExpanded ? 'Закрыть поиск' : 'Поиск';
        searchPanelManuallyOpened = nowExpanded;
        if (nowExpanded) searchInput?.focus();
      }
    });
  }

  // Genre buttons
  if (features.genres) {
    pill.querySelectorAll('[data-genre]').forEach(btn => {
      on(btn, 'click', () => {
        if (btn.classList.contains('active')) {
          btn.classList.remove('active');
          filters.genre = null;
        } else {
          pill.querySelectorAll('[data-genre]').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          filters.genre = btn.dataset.genre;
        }
        saveToStorage();
        notifyChange();
        updateCollapsedVisibility();
      });
    });
  }

  // Type buttons
  if (features.types) {
    pill.querySelectorAll('[data-type]').forEach(btn => {
      on(btn, 'click', () => {
        if (btn.classList.contains('active')) {
          btn.classList.remove('active');
          filters.type = null;
        } else {
          pill.querySelectorAll('[data-type]').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          filters.type = btn.dataset.type;
        }
        saveToStorage();
        notifyChange();
        updateCollapsedVisibility();
      });
    });
  }

  // Extra groups
  extraGroups.forEach(group => {
    pill.querySelectorAll(`[data-extra-group="${group.key}"]`).forEach(btn => {
      on(btn, 'click', () => {
        if (btn.classList.contains('active')) {
          btn.classList.remove('active');
          extraState[group.key] = null;
        } else {
          pill.querySelectorAll(`[data-extra-group="${group.key}"]`).forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          extraState[group.key] = btn.dataset.extraValue;
        }
        saveToStorage();
        notifyChange();
        updateCollapsedVisibility();
      });
    });
  });

  // Sort
  if (features.sort) {
    // Sort toggle button (collapsed mode — icon)
    on(sortToggleBtn, 'click', (e) => {
      e.stopPropagation();
      if (window.isMobileSortView?.() && window.showMobileSortSheet) {
        openMobileSortSheet();
        return;
      }
      const isCollapsed = !collapsible.classList.contains('active');
      if (isCollapsed) {
        const nowExpanded = sortTogglePanel.classList.contains('hidden');
        sortTogglePanel.classList.toggle('hidden', !nowExpanded);
        sortPanelManuallyOpened = nowExpanded;
      }
    });

    // Sort toggle (expanded mode — label button)
    on(sortToggle, 'click', (e) => {
      e.stopPropagation();
      if (window.isMobileSortView?.() && window.showMobileSortSheet) {
        openMobileSortSheet();
        return;
      }
      sortOptionsUl.classList.toggle('hidden');
    });

    // Sort option items
    sortOptionsUl?.querySelectorAll('li').forEach(item => {
      on(item, 'click', () => {
        const sortKey = item.dataset.sort;
        if (filters.sort === sortKey) {
          sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          filters.sort = sortKey;
          sortDirection = sortKey === 'title' ? 'asc' : 'desc';
        }
        window.sortDirection = sortDirection;
        sortLabel.textContent = item.textContent;
        sortOptionsUl.classList.add('hidden');
        sortToggle?.classList.add('has-sort');
        sortToggleBtn?.classList.add('active-glow');
        updateSortArrow();
        saveToStorage();
        notifyChange();
        updateCollapsedVisibility();
      });
    });

    // Sort reset option
    const resetSort = document.createElement('li');
    resetSort.textContent = 'Сбросить';
    resetSort.style.fontWeight = 'bold';
    on(resetSort, 'click', () => {
      filters.sort = null;
      sortDirection = 'desc';
      window.sortDirection = sortDirection;
      sortLabel.textContent = 'По умолчанию';
      sortOptionsUl.classList.add('hidden');
      sortToggle?.classList.remove('has-sort');
      sortToggleBtn?.classList.remove('active-glow');
      updateSortArrow();
      saveToStorage();
      notifyChange();
      updateCollapsedVisibility();
    });
    sortOptionsUl?.appendChild(resetSort);

    function openMobileSortSheet() {
      window.showMobileSortSheet({
        sortOptions,
        currentSort: filters.sort,
        direction: sortDirection,
        onSelect: (sortKey, isSameKey) => {
          if (isSameKey) {
            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
          } else {
            filters.sort = sortKey;
            sortDirection = sortKey === 'title' ? 'asc' : 'desc';
          }
          window.sortDirection = sortDirection;
          const option = sortOptions.find(o => o.key === sortKey);
          if (option && sortLabel) sortLabel.textContent = option.label;
          sortToggle?.classList.add('has-sort');
          sortToggleBtn?.classList.add('active-glow');
          updateSortArrow();
          saveToStorage();
          notifyChange();
          updateCollapsedVisibility();
        },
        onReset: () => {
          filters.sort = null;
          sortDirection = 'desc';
          window.sortDirection = sortDirection;
          if (sortLabel) sortLabel.textContent = 'По умолчанию';
          sortToggle?.classList.remove('has-sort');
          sortToggleBtn?.classList.remove('active-glow');
          updateSortArrow();
          saveToStorage();
          notifyChange();
          updateCollapsedVisibility();
        }
      });
    }
  }

  // Reset all
  if (features.reset) {
    on(resetBtn, 'click', () => {
      if (searchInput) {
        searchInput.value = '';
        updateSearchInputWidth();
      }
      filters.search = null;

      pill.querySelectorAll('[data-genre]').forEach(btn => btn.classList.remove('active'));
      filters.genre = null;

      pill.querySelectorAll('[data-type]').forEach(btn => btn.classList.remove('active'));
      filters.type = null;

      // Reset extras
      extraGroups.forEach(g => {
        extraState[g.key] = null;
        pill.querySelectorAll(`[data-extra-group="${g.key}"]`).forEach(b => b.classList.remove('active'));
      });

      filters.sort = null;
      sortDirection = 'desc';
      window.sortDirection = sortDirection;
      if (sortLabel) sortLabel.textContent = 'По умолчанию';
      sortToggle?.classList.remove('has-sort');
      sortToggleBtn?.classList.remove('active-glow');
      searchToggleBtn?.classList.remove('active-glow');
      updateSortArrow();

      saveToStorage();
      notifyChange();
      updateCollapsedVisibility();
      if (typeof window.showToast === 'function') {
        window.showToast('Фильтры сброшены', 'success');
      }
    });
  }

  // FAQ
  if (features.faq && onFaqClick && faqBtn) {
    on(faqBtn, 'click', onFaqClick);
  }

  // Collapse arrow
  if (features.collapse && collapseArrowBtn) {
    on(collapseArrowBtn, 'click', (e) => {
      e.stopPropagation();
      const isExpanded = collapsible.classList.contains('active');
      if (isExpanded) {
        collapsible.classList.remove('active');
        collapseArrowIcon.classList.remove('up');
        collapseArrowIcon.classList.add('down');
        collapseArrowBtn.dataset.tooltip = 'Развернуть';
        searchPanelManuallyOpened = false;
        sortPanelManuallyOpened = false;
      } else {
        collapsible.classList.add('active');
        collapseArrowIcon.classList.add('up');
        collapseArrowIcon.classList.remove('down');
        collapseArrowBtn.dataset.tooltip = 'Свернуть';

        pill.querySelectorAll('.filter-button').forEach(btn => btn.style.display = '');
        pill.querySelectorAll('.type-button').forEach(btn => btn.style.display = '');
        pill.querySelectorAll('.extra-filter-button').forEach(btn => btn.style.display = '');
        const filtersGroup = pill.querySelector('.filters-group');
        if (filtersGroup) filtersGroup.style.display = '';
        const typesGroup = pill.querySelector('.types-group');
        if (typesGroup) typesGroup.style.display = '';
        extraGroups.forEach(g => {
          const groupEl = pill.querySelector(`[data-extra-group="${g.key}"]`)?.parentElement;
          if (groupEl) groupEl.style.display = '';
        });
      }
      updateCollapsedVisibility();
    });
  }

  // Document click: close sort dropdown + collapsed panels
  function onDocumentClick(e) {
    if (sortDropdownWrapper && !sortDropdownWrapper.contains(e.target)) {
      sortOptionsUl?.classList.add('hidden');
    }
    if (collapsible && searchToggleGroup && !searchToggleGroup.contains(e.target) && !collapsible.classList.contains('active')) {
      if (searchPanelManuallyOpened && searchTogglePanel) {
        searchTogglePanel.classList.add('hidden');
        searchToggleBtn?.setAttribute('aria-expanded', 'false');
        searchPanelManuallyOpened = false;
      }
    }
    if (collapsible && sortDropdownWrapper && !sortDropdownWrapper.contains(e.target) && !collapsible.classList.contains('active')) {
      if (sortPanelManuallyOpened && sortTogglePanel) {
        sortTogglePanel.classList.add('hidden');
        sortPanelManuallyOpened = false;
      }
    }
  }
  document.addEventListener('click', onDocumentClick);

  // ---- Resize handler ----
  let wasMobile = window.matchMedia('(max-width: 1024px)').matches;

  function onResize() {
    if (!features.collapse) return;
    const isNowMobile = window.matchMedia('(max-width: 1024px)').matches;
    if (wasMobile && !isNowMobile) {
      collapsible.classList.add('active');
      if (collapseArrowIcon) {
        collapseArrowIcon.classList.add('up');
        collapseArrowIcon.classList.remove('down');
      }
      updateCollapsedVisibility();
    } else if (!wasMobile && isNowMobile) {
      collapsible.classList.remove('active');
      if (collapseArrowIcon) {
        collapseArrowIcon.classList.remove('up');
        collapseArrowIcon.classList.add('down');
      }
      updateCollapsedVisibility();
    }
    wasMobile = isNowMobile;
  }
  window.addEventListener('resize', onResize);

  // ---- Initial state ----
  loadFromStorage();

  // Set initial expand/collapse synchronously
  const isMobile = window.matchMedia('(max-width: 1024px)').matches;
  if (features.collapse) {
    if (isMobile) {
      collapsible.classList.remove('active');
      if (collapseArrowIcon) {
        collapseArrowIcon.classList.remove('up');
        collapseArrowIcon.classList.add('down');
      }
    } else {
      collapsible.classList.add('active');
      if (collapseArrowIcon) {
        collapseArrowIcon.classList.add('up');
        collapseArrowIcon.classList.remove('down');
      }
    }
    updateCollapsedVisibility();
  }

  // Dispatch ready event
  window.dispatchEvent(new CustomEvent('spa:stickyfilterready'));

  // ---- Public controller ----
  return {
    el: collapsible,

    getFilters() {
      const all = { ...filters, sortDirection };
      extraGroups.forEach(g => { all[g.key] = extraState[g.key]; });
      return all;
    },

    setFilters(newFilters) {
      if (newFilters.search !== undefined) {
        filters.search = newFilters.search || null;
        if (searchInput) {
          searchInput.value = newFilters.search || '';
          searchInput.classList.toggle('has-value', !!filters.search);
          updateSearchInputWidth();
        }
        searchToggleBtn?.classList.toggle('active-glow', !!filters.search);
      }
      if (newFilters.genre !== undefined) {
        filters.genre = newFilters.genre || null;
        pill.querySelectorAll('[data-genre]').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.genre === filters.genre);
        });
      }
      if (newFilters.type !== undefined) {
        filters.type = newFilters.type || null;
        pill.querySelectorAll('[data-type]').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.type === filters.type);
        });
      }
      extraGroups.forEach(g => {
        if (newFilters[g.key] !== undefined) {
          extraState[g.key] = newFilters[g.key] || null;
          pill.querySelectorAll(`[data-extra-group="${g.key}"]`).forEach(b => {
            b.classList.toggle('active', b.dataset.extraValue === extraState[g.key]);
          });
        }
      });
      saveToStorage();
      updateCollapsedVisibility();
    },

    reset() {
      resetBtn?.click();
    },

    destroy() {
      handlers.forEach(({ el: e, event, fn, opts }) => e.removeEventListener(event, fn, opts));
      handlers.length = 0;
      document.removeEventListener('click', onDocumentClick);
      window.removeEventListener('resize', onResize);
    },

    updateCollapsedVisibility
  };
}
