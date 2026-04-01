/**
 * Header — persistent site header with search panel, theme toggle, auth buttons.
 * Matches TR-BUTE header behavior: hide on scroll down (desktop only).
 * Search: side panel on desktop, bottom sheet on mobile.
 */

var Header = (function () {
  var hidden = false;
  var lastScrollY = 0;
  var ticking = false;
  var scrollHandler = null;
  var authChangeHandler = null;

  // Search state
  var SEARCH_MOBILE_BREAKPOINT = 768;
  var RECENT_SEARCHES_KEY = 'cinefiles_recentSearches';
  var MAX_RECENT_SEARCHES = 5;
  var searchPanelElement = null;
  var searchBackdropElement = null;
  var searchPanelOpen = false;
  var mobileSearchSheetOpen = false;
  var mobileSearchSheetCleanup = null;
  var headerSearchTimeout = null;

  function init() {
    var header = document.getElementById('site-header');

    if (!header) return;

    // Hide header on scroll down (desktop only)
    scrollHandler = function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var currentY = window.scrollY;
        if (currentY > lastScrollY && currentY > 80) {
          if (!hidden) {
            hidden = true;
            header.classList.add('header-hidden');
          }
        } else {
          if (hidden) {
            hidden = false;
            header.classList.remove('header-hidden');
          }
        }
        lastScrollY = currentY;
        ticking = false;
      });
    };
    window.addEventListener('scroll', scrollHandler, { passive: true });

    // Init theme toggle
    ThemeToggle.init();

    // Search button — toggle panel/sheet instead of navigating
    var searchBtn = document.getElementById('header-search-btn');
    if (searchBtn) {
      searchBtn.addEventListener('click', function () {
        toggleSearch();
      });
    }

    // New article button opens editor modal
    var newArticleBtn = document.getElementById('header-new-article');
    if (newArticleBtn) {
      newArticleBtn.addEventListener('click', function () {
        ArticleEditorModal.open(null);
      });
    }

    // Listen for auth changes
    authChangeHandler = function () {
      updateAuthButtons();
    };
    document.addEventListener('auth:change', authChangeHandler);

    // Initial auth state (async, non-blocking)
    Auth.getUser().then(function () {
      updateAuthButtons();
    });

    // Auto-switch between mobile/desktop search on resize
    initSearchResizeHandler();
  }

  /**
   * Update header buttons based on auth state.
   */
  function updateAuthButtons() {
    var newArticleBtn = document.getElementById('header-new-article');
    var profileBtn = document.getElementById('header-profile-btn');
    var profileAvatar = document.getElementById('header-profile-avatar');
    var profileIcon = document.getElementById('header-profile-icon');

    if (!profileBtn) return;

    if (Auth.isLoggedIn()) {
      if (newArticleBtn) {
        newArticleBtn.style.display = Auth.isEditor() ? 'flex' : 'none';
      }

      Auth.getUser().then(function (u) {
        if (!u) return;
        if (profileAvatar && profileIcon) {
          if (u.avatar_url) {
            profileAvatar.src = u.avatar_url;
            profileAvatar.style.display = 'block';
            profileIcon.style.display = 'none';
          } else {
            profileAvatar.style.display = 'none';
            profileIcon.style.display = 'block';
          }
        }
      });
    } else {
      if (newArticleBtn) {
        newArticleBtn.style.display = 'none';
      }
      if (profileAvatar) profileAvatar.style.display = 'none';
      if (profileIcon) profileIcon.style.display = 'block';
    }
  }

  // ============================================================
  // RECENT SEARCHES
  // ============================================================

  function getRecentSearches() {
    try {
      var stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  }

  function saveRecentSearch(query) {
    if (!query || query.trim().length < 2) return;
    try {
      var searches = getRecentSearches();
      var trimmed = query.trim();
      searches = searches.filter(function (s) {
        return s.toLowerCase() !== trimmed.toLowerCase();
      });
      searches.unshift(trimmed);
      searches = searches.slice(0, MAX_RECENT_SEARCHES);
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches));
    } catch (e) {}
  }

  function clearRecentSearches() {
    try { localStorage.removeItem(RECENT_SEARCHES_KEY); } catch (e) {}
  }

  function renderRecentSearches(container, inputSelector) {
    if (!container) return;
    var recent = getRecentSearches();
    if (recent.length === 0) {
      container.innerHTML = '';
      return;
    }

    var searchIcon = '<svg width="14" height="14" viewBox="0 0 64 64" fill="currentColor"><use href="#icon-search"/></svg>';
    var itemsHTML = recent.map(function (q) {
      return '<div class="search-panel-recent-item" data-query="' + Utils.escapeHtml(q) + '">' +
        searchIcon + '<span class="search-panel-recent-query">' + Utils.escapeHtml(q) + '</span></div>';
    }).join('');

    container.innerHTML =
      '<div class="search-panel-recent-header">' +
        '<span>Недавние запросы</span>' +
        '<button class="search-panel-recent-clear">Очистить</button>' +
      '</div>' +
      '<div class="search-panel-recent-list">' + itemsHTML + '</div>';

    container.querySelectorAll('.search-panel-recent-item').forEach(function (item) {
      item.addEventListener('click', function () {
        var input = document.querySelector(inputSelector);
        if (input) {
          input.value = item.dataset.query;
          input.dispatchEvent(new Event('input'));
          input.focus();
        }
      });
    });

    var clearBtn = container.querySelector('.search-panel-recent-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        clearRecentSearches();
        container.innerHTML = '';
      });
    }
  }

  function renderRecentSearchesMobile(container, goBtn) {
    if (!container) return;
    var recent = getRecentSearches();
    if (recent.length === 0) {
      container.innerHTML = '';
      if (goBtn) goBtn.style.display = 'none';
      return;
    }

    var searchIcon = '<svg width="16" height="16" viewBox="0 0 64 64" fill="currentColor"><use href="#icon-search"/></svg>';
    var itemsHTML = recent.map(function (q) {
      return '<div class="mobile-search-recent-item" data-query="' + Utils.escapeHtml(q) + '">' +
        searchIcon + '<span class="mobile-search-recent-query">' + Utils.escapeHtml(q) + '</span></div>';
    }).join('');

    container.innerHTML =
      '<div class="mobile-search-recent-header">' +
        '<span>Недавние запросы</span>' +
        '<button class="mobile-search-recent-clear">Очистить</button>' +
      '</div>' +
      '<div class="mobile-search-recent-list">' + itemsHTML + '</div>';

    if (goBtn) goBtn.style.display = 'none';

    container.querySelectorAll('.mobile-search-recent-item').forEach(function (item) {
      item.addEventListener('click', function () {
        var input = document.querySelector('.mobile-search-sheet-input');
        if (input) {
          input.value = item.dataset.query;
          input.dispatchEvent(new Event('input'));
          input.focus();
        }
      });
    });

    var clearBtn = container.querySelector('.mobile-search-recent-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        clearRecentSearches();
        container.innerHTML = '';
      });
    }
  }

  // ============================================================
  // SEARCH API
  // ============================================================

  function performSearch(query, resultsContainer, moreBtn, isMobile, goBtn) {
    if (isMobile) {
      resultsContainer.innerHTML = '<div class="mobile-search-sheet-loading">Загрузка...</div>';
    } else {
      resultsContainer.innerHTML = '<div class="search-panel-loading">Загрузка...</div>';
    }

    Utils.apiFetch('/api/search?q=' + encodeURIComponent(query) + '&limit=5')
      .then(function (data) {
        var tags = data.tags || [];
        var articles = data.articles || [];

        if (tags.length === 0 && articles.length === 0) {
          if (isMobile) {
            resultsContainer.innerHTML = '<div class="mobile-search-sheet-empty">Ничего не найдено</div>';
            if (goBtn) goBtn.style.display = 'none';
          } else {
            resultsContainer.innerHTML = '<div class="search-panel-empty">Ничего не найдено</div>';
            if (moreBtn) moreBtn.style.display = 'none';
          }
          return;
        }

        var html = '';

        if (isMobile) {
          // Tags
          if (tags.length > 0) {
            html += '<div class="mobile-search-sheet-section-label">Теги</div>';
            html += '<div class="mobile-search-sheet-tags">';
            tags.slice(0, 5).forEach(function (tag) {
              html += '<a href="/tag/' + Utils.escapeHtml(tag.slug) + '" class="mobile-search-sheet-tag">' +
                Utils.escapeHtml(tag.nameRu) + '</a>';
            });
            html += '</div>';
          }

          // Articles
          if (articles.length > 0) {
            html += '<div class="mobile-search-sheet-section-label">Статьи</div>';
            articles.slice(0, 3).forEach(function (article) {
              var catSlug = article.category ? article.category.slug : 'articles';
              var href = '/' + catSlug + '/' + article.slug;
              var imgSrc = article.coverImageUrl ? resolveImageUrl(article.coverImageUrl) : '';
              var subtitle = article.category ? article.category.name_ru : '';

              html += '<a href="' + Utils.escapeHtml(href) + '" class="mobile-search-sheet-result-item">';
              if (imgSrc) {
                html += '<img src="' + Utils.escapeHtml(imgSrc) + '" alt="" class="mobile-search-sheet-result-image" loading="lazy">';
              } else {
                html += '<div class="mobile-search-sheet-result-image"></div>';
              }
              html += '<div class="mobile-search-sheet-result-info">' +
                '<div class="mobile-search-sheet-result-title">' + Utils.escapeHtml(article.title) + '</div>' +
                '<div class="mobile-search-sheet-result-subtitle">' + Utils.escapeHtml(subtitle) + '</div>' +
                '</div></a>';
            });
          }

          resultsContainer.innerHTML = html;
          if (goBtn) goBtn.style.display = 'flex';

          // Handle article link clicks
          resultsContainer.querySelectorAll('.mobile-search-sheet-result-item').forEach(function (item) {
            item.addEventListener('click', function (e) {
              e.preventDefault();
              var href = item.getAttribute('href');
              closeMobileSearchSheet();
              Router.navigate(href);
            });
          });

          // Handle tag clicks
          resultsContainer.querySelectorAll('.mobile-search-sheet-tag').forEach(function (tag) {
            tag.addEventListener('click', function (e) {
              e.preventDefault();
              var href = tag.getAttribute('href');
              closeMobileSearchSheet();
              Router.navigate(href);
            });
          });
        } else {
          // Desktop panel results
          if (tags.length > 0) {
            html += '<div class="search-panel-section-label">Теги</div>';
            html += '<div class="search-panel-tags">';
            tags.slice(0, 5).forEach(function (tag) {
              html += '<a href="/tag/' + Utils.escapeHtml(tag.slug) + '" class="search-panel-tag">' +
                Utils.escapeHtml(tag.nameRu) + '</a>';
            });
            html += '</div>';
          }

          if (articles.length > 0) {
            html += '<div class="search-panel-section-label">Статьи</div>';
            articles.slice(0, 3).forEach(function (article) {
              var catSlug = article.category ? article.category.slug : 'articles';
              var href = '/' + catSlug + '/' + article.slug;
              var imgSrc = article.coverImageUrl ? resolveImageUrl(article.coverImageUrl) : '';
              var subtitle = article.category ? article.category.name_ru : '';

              html += '<a href="' + Utils.escapeHtml(href) + '" class="search-panel-result-item">';
              if (imgSrc) {
                html += '<img src="' + Utils.escapeHtml(imgSrc) + '" alt="" class="search-panel-result-image" loading="lazy">';
              } else {
                html += '<div class="search-panel-result-image"></div>';
              }
              html += '<div class="search-panel-result-info">' +
                '<div class="search-panel-result-title">' + Utils.escapeHtml(article.title) + '</div>' +
                '<div class="search-panel-result-subtitle">' + Utils.escapeHtml(subtitle) + '</div>' +
                '</div></a>';
            });
          }

          resultsContainer.innerHTML = html;
          if (moreBtn) moreBtn.style.display = 'flex';

          // Handle clicks
          resultsContainer.querySelectorAll('.search-panel-result-item').forEach(function (item) {
            item.addEventListener('click', function (e) {
              e.preventDefault();
              var href = item.getAttribute('href');
              closeSearchPanel();
              Router.navigate(href);
            });
          });

          resultsContainer.querySelectorAll('.search-panel-tag').forEach(function (tag) {
            tag.addEventListener('click', function (e) {
              e.preventDefault();
              var href = tag.getAttribute('href');
              closeSearchPanel();
              Router.navigate(href);
            });
          });
        }

        // Hide broken images
        resultsContainer.querySelectorAll('img').forEach(function (img) {
          img.addEventListener('error', function () { img.style.display = 'none'; }, { once: true });
        });
      })
      .catch(function () {
        if (isMobile) {
          resultsContainer.innerHTML = '<div class="mobile-search-sheet-empty">Поиск временно недоступен</div>';
          if (goBtn) goBtn.style.display = 'none';
        } else {
          resultsContainer.innerHTML = '<div class="search-panel-empty">Поиск временно недоступен</div>';
          if (moreBtn) moreBtn.style.display = 'none';
        }
      });
  }

  function resolveImageUrl(url) {
    if (typeof window.resolveImageUrl === 'function') return window.resolveImageUrl(url);
    return url || '';
  }

  // ============================================================
  // DESKTOP SEARCH PANEL
  // ============================================================

  function toggleSearch() {
    var isMobile = window.innerWidth <= SEARCH_MOBILE_BREAKPOINT;
    if (isMobile) {
      mobileSearchSheetOpen ? closeMobileSearchSheet() : openMobileSearchSheet();
    } else {
      searchPanelOpen ? closeSearchPanel() : openSearchPanel();
    }
  }

  function createSearchPanel() {
    if (searchPanelElement) return;

    searchBackdropElement = document.createElement('div');
    searchBackdropElement.className = 'search-panel-backdrop';
    searchBackdropElement.addEventListener('click', closeSearchPanel);

    searchPanelElement = document.createElement('div');
    searchPanelElement.className = 'search-panel';
    searchPanelElement.innerHTML =
      '<div class="search-panel-header">' +
        '<span class="search-panel-title">Поиск</span>' +
      '</div>' +
      '<div class="search-panel-content">' +
        '<div class="search-panel-input-wrapper">' +
          '<input type="text" class="search-panel-input" placeholder="Поиск статей, тегов..." />' +
          '<button class="search-panel-clear" title="Очистить">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="search-panel-results"></div>' +
        '<button class="search-panel-more-btn" style="display: none;">' +
          'Показать все результаты' +
          '<svg width="12" height="12" viewBox="0 0 64 64" fill="currentColor"><use href="#icon-arrow-left" transform="rotate(180 32 32)"/></svg>' +
        '</button>' +
      '</div>';

    document.body.appendChild(searchBackdropElement);
    document.body.appendChild(searchPanelElement);

    // Set up input handlers
    var searchInput = searchPanelElement.querySelector('.search-panel-input');
    var searchClear = searchPanelElement.querySelector('.search-panel-clear');
    var searchResults = searchPanelElement.querySelector('.search-panel-results');
    var moreBtn = searchPanelElement.querySelector('.search-panel-more-btn');

    searchInput.addEventListener('input', function () {
      var query = searchInput.value.trim();
      clearTimeout(headerSearchTimeout);

      if (query.length === 0) {
        renderRecentSearches(searchResults, '.search-panel-input');
        moreBtn.style.display = 'none';
        return;
      }

      if (query.length < 2) {
        searchResults.innerHTML = '';
        moreBtn.style.display = 'none';
        return;
      }

      headerSearchTimeout = setTimeout(function () {
        performSearch(query, searchResults, moreBtn, false, null);
      }, 300);
    });

    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var query = searchInput.value.trim();
        if (query.length >= 2) {
          saveRecentSearch(query);
          navigateToSearch(query);
        }
      } else if (e.key === 'Escape') {
        closeSearchPanel();
      }
    });

    searchClear.addEventListener('click', function () {
      searchInput.value = '';
      searchResults.innerHTML = '';
      moreBtn.style.display = 'none';
      searchInput.focus();
    });

    moreBtn.addEventListener('click', function () {
      var query = searchInput.value.trim();
      if (query.length >= 2) {
        saveRecentSearch(query);
        navigateToSearch(query);
      }
    });
  }

  function openSearchPanel() {
    createSearchPanel();

    var searchInput = searchPanelElement.querySelector('.search-panel-input');
    var searchResults = searchPanelElement.querySelector('.search-panel-results');

    if (searchInput && searchInput.value.trim().length >= 2) {
      performSearch(searchInput.value.trim(), searchResults,
        searchPanelElement.querySelector('.search-panel-more-btn'), false, null);
    } else if (searchInput && searchInput.value.trim().length === 0) {
      renderRecentSearches(searchResults, '.search-panel-input');
    }

    requestAnimationFrame(function () {
      searchBackdropElement.classList.add('active');
      searchPanelElement.classList.add('active');
    });

    searchPanelOpen = true;
    updateSearchBtnActive(true);
    document.addEventListener('keydown', handleSearchEsc);

    setTimeout(function () {
      if (searchInput) searchInput.focus();
    }, 100);
  }

  function closeSearchPanel() {
    if (!searchPanelElement) return;

    searchBackdropElement.classList.remove('active');
    searchPanelElement.classList.remove('active');
    searchPanelOpen = false;
    updateSearchBtnActive(false);
    document.removeEventListener('keydown', handleSearchEsc);
  }

  function handleSearchEsc(e) {
    if (e.key === 'Escape') closeSearchPanel();
  }

  function updateSearchBtnActive(active) {
    var btn = document.getElementById('header-search-btn');
    if (btn) btn.classList.toggle('header-button-active', active);
  }

  // ============================================================
  // MOBILE SEARCH SHEET
  // ============================================================

  function openMobileSearchSheet() {
    if (mobileSearchSheetOpen && !document.getElementById('mobile-search-sheet-overlay')) {
      mobileSearchSheetOpen = false;
      document.documentElement.style.overflow = '';
      document.documentElement.style.overscrollBehavior = '';
      document.body.style.overflow = '';
    }
    if (mobileSearchSheetOpen) return;
    mobileSearchSheetOpen = true;
    updateSearchBtnActive(true);

    var overlay = document.createElement('div');
    overlay.className = 'mobile-search-sheet-overlay';
    overlay.id = 'mobile-search-sheet-overlay';

    var backdrop = document.createElement('div');
    backdrop.className = 'mobile-search-sheet-backdrop';
    backdrop.addEventListener('click', closeMobileSearchSheet);
    backdrop.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });

    var sheet = document.createElement('div');
    sheet.className = 'mobile-search-sheet';
    sheet.id = 'mobile-search-sheet';

    sheet.innerHTML =
      '<div class="mobile-search-sheet-handle"><span></span></div>' +
      '<div class="mobile-search-sheet-search">' +
        '<input type="text" class="mobile-search-sheet-input" placeholder="Поиск статей, тегов..." autofocus>' +
        '<button class="mobile-search-sheet-clear" title="Очистить">' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="mobile-search-sheet-results"></div>' +
      '<button class="mobile-search-sheet-go-full" style="display: none;">' +
        'Показать все результаты' +
        '<svg width="14" height="14" viewBox="0 0 64 64" fill="currentColor"><use href="#icon-arrow-left" transform="rotate(180 32 32)"/></svg>' +
      '</button>';

    overlay.appendChild(backdrop);
    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    setupMobileSearchSheetSwipe(sheet, overlay);

    var input = sheet.querySelector('.mobile-search-sheet-input');
    var clearBtn = sheet.querySelector('.mobile-search-sheet-clear');
    var resultsContainer = sheet.querySelector('.mobile-search-sheet-results');
    var goBtn = sheet.querySelector('.mobile-search-sheet-go-full');
    var searchTimeout = null;

    input.addEventListener('input', function () {
      var query = input.value.trim();
      clearTimeout(searchTimeout);

      if (query.length === 0) {
        renderRecentSearchesMobile(resultsContainer, goBtn);
        return;
      }

      if (query.length < 2) {
        resultsContainer.innerHTML = '';
        goBtn.style.display = 'none';
        return;
      }

      searchTimeout = setTimeout(function () {
        performSearch(query, resultsContainer, null, true, goBtn);
      }, 300);
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var query = input.value.trim();
        if (query.length >= 2) {
          saveRecentSearch(query);
          closeMobileSearchSheet();
          navigateToSearch(query);
        }
      } else if (e.key === 'Escape') {
        closeMobileSearchSheet();
      }
    });

    clearBtn.addEventListener('click', function () {
      input.value = '';
      resultsContainer.innerHTML = '';
      goBtn.style.display = 'none';
      input.focus();
    });

    goBtn.addEventListener('click', function () {
      var query = input.value.trim();
      if (query.length >= 2) {
        saveRecentSearch(query);
      }
      closeMobileSearchSheet();
      if (query.length >= 2) {
        navigateToSearch(query);
      }
    });

    renderRecentSearchesMobile(resultsContainer, goBtn);

    requestAnimationFrame(function () {
      overlay.classList.add('active');
      document.documentElement.style.overflow = 'hidden';
      document.documentElement.style.overscrollBehavior = 'none';
      document.body.style.overflow = 'hidden';
      input.focus();
    });

    mobileSearchSheetCleanup = function (e) {
      if (e.key === 'Escape') closeMobileSearchSheet();
    };
    document.addEventListener('keydown', mobileSearchSheetCleanup);
  }

  function closeMobileSearchSheet() {
    if (!mobileSearchSheetOpen) return;
    mobileSearchSheetOpen = false;
    document.documentElement.style.overflow = '';
    document.documentElement.style.overscrollBehavior = '';
    document.body.style.overflow = '';

    var overlay = document.getElementById('mobile-search-sheet-overlay');
    if (!overlay) return;

    overlay.classList.remove('active');
    updateSearchBtnActive(false);

    setTimeout(function () {
      overlay.remove();
    }, 300);

    if (mobileSearchSheetCleanup) {
      document.removeEventListener('keydown', mobileSearchSheetCleanup);
      mobileSearchSheetCleanup = null;
    }
  }

  function setupMobileSearchSheetSwipe(sheet, overlay) {
    var touchStartY = 0;
    var touchCurrentY = 0;
    var isDragging = false;
    var canDrag = false;

    var handleTouchStart = function (e) {
      var results = sheet.querySelector('.mobile-search-sheet-results');
      var resultsScrollTop = results ? results.scrollTop : 0;
      var input = sheet.querySelector('.mobile-search-sheet-input');
      var fromHandle = !!e.target.closest('.mobile-search-sheet-handle');
      var keyboardHidden = document.activeElement !== input;

      canDrag = fromHandle || resultsScrollTop <= 5 || keyboardHidden;

      if (canDrag) {
        touchStartY = e.touches[0].clientY;
        touchCurrentY = touchStartY;
        isDragging = false;
      }
    };

    var handleTouchMove = function (e) {
      if (!canDrag || touchStartY === 0) return;
      touchCurrentY = e.touches[0].clientY;
      var diff = touchCurrentY - touchStartY;

      if (diff > 0) {
        isDragging = true;
        var translateY = Math.min(diff * 0.5, 150);
        sheet.style.transform = 'translateY(' + translateY + 'px)';
        sheet.style.transition = 'none';

        var opacity = Math.max(0.3, 1 - (diff / 400));
        var backdrop = overlay.querySelector('.mobile-search-sheet-backdrop');
        if (backdrop) backdrop.style.opacity = opacity;

        e.preventDefault();
      }
    };

    var handleTouchEnd = function () {
      var diff = touchCurrentY - touchStartY;

      sheet.style.transform = '';
      sheet.style.transition = '';
      var backdrop = overlay.querySelector('.mobile-search-sheet-backdrop');
      if (backdrop) backdrop.style.opacity = '';

      if (isDragging && diff > 60) {
        closeMobileSearchSheet();
      }

      touchStartY = 0;
      touchCurrentY = 0;
      isDragging = false;
      canDrag = false;
    };

    sheet.addEventListener('touchstart', handleTouchStart, { passive: true });
    sheet.addEventListener('touchmove', handleTouchMove, { passive: false });
    sheet.addEventListener('touchend', handleTouchEnd, { passive: true });
    sheet.addEventListener('touchcancel', handleTouchEnd, { passive: true });
  }

  // ============================================================
  // RESIZE HANDLER
  // ============================================================

  function initSearchResizeHandler() {
    var resizeTimeout = null;
    var lastWasMobile = window.innerWidth <= SEARCH_MOBILE_BREAKPOINT;

    window.addEventListener('resize', function () {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(function () {
        var isMobile = window.innerWidth <= SEARCH_MOBILE_BREAKPOINT;
        if (isMobile === lastWasMobile) return;
        lastWasMobile = isMobile;

        if (isMobile && searchPanelOpen) {
          var panelInput = searchPanelElement ? searchPanelElement.querySelector('.search-panel-input') : null;
          var query = panelInput ? panelInput.value : '';
          closeSearchPanel();
          openMobileSearchSheet();
          setTimeout(function () {
            var mobileInput = document.querySelector('.mobile-search-sheet-input');
            if (mobileInput && query) {
              mobileInput.value = query;
              mobileInput.dispatchEvent(new Event('input'));
            }
          }, 50);
        } else if (!isMobile && mobileSearchSheetOpen) {
          var mobileInput = document.querySelector('.mobile-search-sheet-input');
          var query = mobileInput ? mobileInput.value : '';
          closeMobileSearchSheet();
          setTimeout(function () {
            openSearchPanel();
            var panelInput = searchPanelElement ? searchPanelElement.querySelector('.search-panel-input') : null;
            if (panelInput && query) {
              panelInput.value = query;
              panelInput.dispatchEvent(new Event('input'));
            }
          }, 350);
        }
      }, 150);
    });
  }

  // ============================================================
  // NAVIGATION
  // ============================================================

  function navigateToSearch(query) {
    var panelInput = searchPanelElement ? searchPanelElement.querySelector('.search-panel-input') : null;
    if (panelInput) panelInput.value = '';

    closeSearchPanel();
    closeMobileSearchSheet();

    Router.navigate('/search?q=' + encodeURIComponent(query));
  }

  function closeAllSearch() {
    if (searchPanelOpen) closeSearchPanel();
    if (mobileSearchSheetOpen) closeMobileSearchSheet();
  }

  // ============================================================

  function cleanup() {
    if (scrollHandler) {
      window.removeEventListener('scroll', scrollHandler);
      scrollHandler = null;
    }
    if (authChangeHandler) {
      document.removeEventListener('auth:change', authChangeHandler);
      authChangeHandler = null;
    }
  }

  return {
    init: init,
    cleanup: cleanup,
    updateAuthButtons: updateAuthButtons,
    toggleSearch: toggleSearch,
    closeAllSearch: closeAllSearch,
  };
})();
