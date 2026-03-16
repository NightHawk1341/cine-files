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
        '<svg width="20" height="20" viewBox="0 0 24 24"><use href="#icon-yandex"/></svg>' +
        'Яндекс ID' +
      '</a>' +
      '<a href="/api/auth/telegram" class="auth-login-btn auth-login-btn--telegram" data-no-spa>' +
        '<svg width="20" height="20" viewBox="0 0 24 24"><use href="#icon-telegram"/></svg>' +
        'Telegram' +
      '</a>' +
    '</div>' +
    '<div class="profile-theme-guest">' +
      '<button class="profile-theme-btn" id="profile-theme-toggle">' +
        '<svg width="18" height="18" viewBox="0 0 64 64"><use href="#icon-sun"/></svg>' +
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
    return '<svg width="14" height="14" viewBox="0 0 24 24" style="color:var(--text-secondary)"><use href="#icon-yandex"/></svg>';
  }
  if (method === 'telegram') {
    return '<svg width="14" height="14" viewBox="0 0 24 24" style="color:var(--text-secondary)"><use href="#icon-telegram"/></svg>';
  }
  return '';
}
