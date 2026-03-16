/**
 * Profile page — doubles as login page (like TR-BUTE).
 * Route: /profile
 * Logged out: shows OAuth login buttons.
 * Logged in: shows profile info, saved articles, my comments, my articles (editors).
 */

Router.registerPage('/profile', {
  styles: ['/css/profile.css'],
  init: initProfile,
  cleanup: cleanupProfile,
});

var _profileCleanups = [];

async function initProfile() {
  var content = document.getElementById('page-content');
  content.innerHTML = '';

  var container = document.createElement('div');
  container.className = 'container page-content profile-page';

  var user = await Auth.getUser();

  if (!user) {
    renderLoggedOut(container);
  } else {
    await renderLoggedIn(container, user);
  }

  content.appendChild(container);
  document.title = user ? 'Профиль — CineFiles' : 'Вход — CineFiles';
}

function cleanupProfile() {
  _profileCleanups.forEach(function (fn) { fn(); });
  _profileCleanups = [];
}

// ============================================================
// Logged-out state
// ============================================================

function renderLoggedOut(container) {
  var section = document.createElement('div');
  section.className = 'profile-login-section';

  section.innerHTML =
    '<h1 class="profile-login-title">Вход в CineFiles</h1>' +
    '<p class="profile-login-hint">Выберите способ входа:</p>' +
    '<div class="profile-login-buttons">' +
      '<a href="/api/auth/yandex" class="auth-login-btn auth-login-btn--yandex" data-no-spa>' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">' +
          '<path d="M13.32 8.6v11.4h-2.28V4h2.76c3.24 0 4.92 1.56 4.92 4.08 0 1.86-1.08 3.24-3.12 3.96L19.08 20h-2.52l-3.24-7.56V8.6zm0-2.64v4.92h.48c1.8 0 2.76-.96 2.76-2.52 0-1.56-.96-2.4-2.76-2.4h-.48z"/>' +
        '</svg>' +
        'Яндекс ID' +
      '</a>' +
      '<a href="/api/auth/telegram" class="auth-login-btn auth-login-btn--telegram" data-no-spa>' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">' +
          '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.03-1.99 1.27-5.62 3.72-.53.36-1.01.54-1.44.53-.47-.01-1.38-.27-2.06-.49-.83-.27-1.49-.42-1.43-.88.03-.24.37-.49 1.02-.74 3.99-1.74 6.65-2.89 7.99-3.44 3.81-1.58 4.6-1.86 5.12-1.87.11 0 .37.03.53.17.14.12.18.28.2.45-.01.06.01.24 0 .38z"/>' +
        '</svg>' +
        'Telegram' +
      '</a>' +
    '</div>' +
    '<div class="profile-theme-guest">' +
      '<button class="profile-theme-btn" id="profile-theme-toggle">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
          '<circle cx="12" cy="12" r="5"/>' +
          '<path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>' +
        '</svg>' +
        '<span>Переключить тему</span>' +
      '</button>' +
    '</div>';

  container.appendChild(section);

  // Theme toggle for guests
  var themeBtn = section.querySelector('#profile-theme-toggle');
  if (themeBtn) {
    var handler = function () {
      ThemeToggle.toggle();
    };
    themeBtn.addEventListener('click', handler);
    _profileCleanups.push(function () {
      themeBtn.removeEventListener('click', handler);
    });
  }
}

// ============================================================
// Logged-in state
// ============================================================

async function renderLoggedIn(container, user) {
  // Header section
  var header = document.createElement('div');
  header.className = 'profile-header';

  var avatarHtml = user.avatar_url
    ? '<img src="' + Utils.escapeHtml(user.avatar_url) + '" alt="" class="profile-avatar">'
    : '<div class="profile-avatar profile-avatar-fallback">' + getInitials(user.display_name) + '</div>';

  var loginMethodIcon = getLoginMethodIcon(user.login_method);

  header.innerHTML =
    '<div class="profile-avatar-wrap">' + avatarHtml + '</div>' +
    '<div class="profile-info">' +
      '<h1 class="profile-name">' + Utils.escapeHtml(user.display_name || 'Пользователь') + '</h1>' +
      '<div class="profile-meta">' +
        '<span class="profile-login-method">' + loginMethodIcon + '</span>' +
        '<span class="profile-member-since">с ' + Utils.formatDate(user.created_at) + '</span>' +
      '</div>' +
    '</div>';

  container.appendChild(header);

  // Tabs
  var tabs = [
    { id: 'saved', label: 'Сохраненные', count: Favorites.count() },
    { id: 'comments', label: 'Комментарии' },
  ];

  if (Auth.isEditor()) {
    tabs.push({ id: 'articles', label: 'Мои статьи' });
  }

  var tabNav = document.createElement('div');
  tabNav.className = 'profile-tabs';

  var tabContent = document.createElement('div');
  tabContent.className = 'profile-tab-content';

  tabs.forEach(function (tab, i) {
    var btn = document.createElement('button');
    btn.className = 'profile-tab' + (i === 0 ? ' active' : '');
    btn.setAttribute('data-tab', tab.id);
    btn.textContent = tab.label;
    if (tab.count !== undefined && tab.count > 0) {
      var badge = document.createElement('span');
      badge.className = 'profile-tab-badge';
      badge.textContent = tab.count;
      btn.appendChild(badge);
    }
    tabNav.appendChild(btn);
  });

  container.appendChild(tabNav);
  container.appendChild(tabContent);

  // Tab click handler
  var tabHandler = function (e) {
    var btn = e.target.closest('.profile-tab');
    if (!btn) return;
    tabNav.querySelectorAll('.profile-tab').forEach(function (t) { t.classList.remove('active'); });
    btn.classList.add('active');
    loadTab(btn.getAttribute('data-tab'), tabContent, user);
  };
  tabNav.addEventListener('click', tabHandler);
  _profileCleanups.push(function () {
    tabNav.removeEventListener('click', tabHandler);
  });

  // Load first tab
  await loadTab('saved', tabContent, user);

  // Actions section
  var actions = document.createElement('div');
  actions.className = 'profile-actions';

  var logoutBtn = document.createElement('button');
  logoutBtn.className = 'profile-action-btn';
  logoutBtn.textContent = 'Выйти';
  var logoutHandler = async function () {
    await Auth.logout();
    Router.navigate('/profile');
  };
  logoutBtn.addEventListener('click', logoutHandler);
  _profileCleanups.push(function () {
    logoutBtn.removeEventListener('click', logoutHandler);
  });

  var deleteBtn = document.createElement('button');
  deleteBtn.className = 'profile-action-btn profile-action-btn--danger';
  deleteBtn.textContent = 'Удалить аккаунт';
  var deleteHandler = async function () {
    if (!confirm('Вы уверены? Все данные будут удалены безвозвратно.')) return;
    try {
      await Utils.apiFetch('/api/users/me', { method: 'DELETE' });
      await Auth.logout();
      Router.navigate('/');
      Toast.show('Аккаунт удален', 'success');
    } catch (err) {
      Toast.show('Не удалось удалить аккаунт', 'error');
    }
  };
  deleteBtn.addEventListener('click', deleteHandler);
  _profileCleanups.push(function () {
    deleteBtn.removeEventListener('click', deleteHandler);
  });

  actions.appendChild(logoutBtn);
  actions.appendChild(deleteBtn);
  container.appendChild(actions);
}

// ============================================================
// Tab loading
// ============================================================

async function loadTab(tabId, container, user) {
  container.innerHTML = '<div class="profile-loading">Загрузка...</div>';

  if (tabId === 'saved') {
    await loadSavedArticles(container);
  } else if (tabId === 'comments') {
    await loadMyComments(container);
  } else if (tabId === 'articles') {
    await loadMyArticles(container);
  }
}

async function loadSavedArticles(container) {
  var ids = Favorites.getAll();

  if (ids.length === 0) {
    container.innerHTML = '<p class="profile-empty">Нет сохраненных статей</p>';
    return;
  }

  try {
    // Fetch article details for saved IDs
    var data = await Utils.apiFetch('/api/articles?ids=' + ids.join(',') + '&limit=' + ids.length);
    var articles = data.articles || [];

    if (articles.length === 0) {
      container.innerHTML = '<p class="profile-empty">Нет сохраненных статей</p>';
      return;
    }

    container.innerHTML = '';
    var grid = document.createElement('div');
    grid.className = 'profile-articles-grid';

    articles.forEach(function (article) {
      var card = document.createElement('a');
      card.className = 'profile-article-card';
      card.href = '/' + (article.category_slug || 'news') + '/' + article.slug;

      var imgHtml = article.cover_image_url
        ? '<img src="' + Utils.escapeHtml(article.cover_image_url) + '" alt="" class="profile-article-img">'
        : '<div class="profile-article-img profile-article-img--empty"></div>';

      card.innerHTML =
        imgHtml +
        '<div class="profile-article-info">' +
          '<div class="profile-article-title">' + Utils.escapeHtml(article.title) + '</div>' +
          '<div class="profile-article-meta">' + Utils.formatDateShort(article.published_at || article.created_at) + '</div>' +
        '</div>';

      grid.appendChild(card);
    });

    container.appendChild(grid);
  } catch (err) {
    container.innerHTML = '<p class="profile-empty">Не удалось загрузить статьи</p>';
  }
}

async function loadMyComments(container) {
  try {
    var data = await Utils.apiFetch('/api/users/me/comments');
    var comments = data.comments || [];

    if (comments.length === 0) {
      container.innerHTML = '<p class="profile-empty">Нет комментариев</p>';
      return;
    }

    container.innerHTML = '';
    comments.forEach(function (c) {
      var item = document.createElement('div');
      item.className = 'profile-comment-item';

      var articleUrl = '/' + (c.category_slug || 'news') + '/' + c.article_slug;

      item.innerHTML =
        '<div class="profile-comment-header">' +
          '<a href="' + articleUrl + '" class="profile-comment-article">' + Utils.escapeHtml(c.article_title) + '</a>' +
          '<span class="profile-comment-date">' + Utils.formatDateShort(c.created_at) + '</span>' +
        '</div>' +
        '<div class="profile-comment-text">' + Utils.escapeHtml(c.body) + '</div>' +
        '<button class="profile-comment-delete" data-comment-id="' + c.id + '">Удалить</button>';

      container.appendChild(item);
    });

    // Delete handler
    var deleteHandler = async function (e) {
      var btn = e.target.closest('.profile-comment-delete');
      if (!btn) return;
      var commentId = btn.getAttribute('data-comment-id');
      if (!confirm('Удалить комментарий?')) return;
      try {
        await Utils.apiFetch('/api/comments/' + commentId, { method: 'DELETE' });
        btn.closest('.profile-comment-item').remove();
        Toast.show('Комментарий удален', 'success');
      } catch (err) {
        Toast.show('Не удалось удалить', 'error');
      }
    };
    container.addEventListener('click', deleteHandler);
    _profileCleanups.push(function () {
      container.removeEventListener('click', deleteHandler);
    });
  } catch (err) {
    container.innerHTML = '<p class="profile-empty">Не удалось загрузить комментарии</p>';
  }
}

async function loadMyArticles(container) {
  try {
    var data = await Utils.apiFetch('/api/users/me/articles');
    var articles = data.articles || [];

    if (articles.length === 0) {
      container.innerHTML = '<p class="profile-empty">Нет статей</p>';
      return;
    }

    container.innerHTML = '';
    var list = document.createElement('div');
    list.className = 'profile-my-articles';

    articles.forEach(function (a) {
      var item = document.createElement('div');
      item.className = 'profile-my-article';

      var statusClass = 'profile-status profile-status--' + a.status;

      item.innerHTML =
        '<div class="profile-my-article-info">' +
          '<a href="/admin/articles/' + a.id + '" class="profile-my-article-title">' + Utils.escapeHtml(a.title) + '</a>' +
          '<div class="profile-my-article-meta">' +
            '<span class="' + statusClass + '">' + a.status + '</span>' +
            '<span>' + Utils.formatDateShort(a.created_at) + '</span>' +
            '<span>' + Number(a.view_count) + ' ' + Utils.pluralize(Number(a.view_count), ['просмотр', 'просмотра', 'просмотров']).split(' ').slice(1).join(' ') + '</span>' +
          '</div>' +
        '</div>';

      list.appendChild(item);
    });

    container.appendChild(list);
  } catch (err) {
    container.innerHTML = '<p class="profile-empty">Не удалось загрузить статьи</p>';
  }
}

// ============================================================
// Helpers
// ============================================================

function getInitials(name) {
  if (!name) return '?';
  var parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0][0].toUpperCase();
}

function getLoginMethodIcon(method) {
  if (method === 'yandex') {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="var(--text-secondary)"><path d="M13.32 8.6v11.4h-2.28V4h2.76c3.24 0 4.92 1.56 4.92 4.08 0 1.86-1.08 3.24-3.12 3.96L19.08 20h-2.52l-3.24-7.56V8.6zm0-2.64v4.92h.48c1.8 0 2.76-.96 2.76-2.52 0-1.56-.96-2.4-2.76-2.4h-.48z"/></svg>';
  }
  if (method === 'telegram') {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="var(--text-secondary)"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.03-1.99 1.27-5.62 3.72-.53.36-1.01.54-1.44.53-.47-.01-1.38-.27-2.06-.49-.83-.27-1.49-.42-1.43-.88.03-.24.37-.49 1.02-.74 3.99-1.74 6.65-2.89 7.99-3.44 3.81-1.58 4.6-1.86 5.12-1.87.11 0 .37.03.53.17.14.12.18.28.2.45-.01.06.01.24 0 .38z"/></svg>';
  }
  return '';
}
