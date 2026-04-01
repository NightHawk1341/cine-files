/**
 * Dashboard view — stats and quick navigation
 */

import { escapeHtml, showToast, formatDateShort } from '../utils.js';
import { apiFetch } from '../utils/apiClient.js';
import { createPageHeader, createLoadingSpinner } from '../utils/templates.js';

function formatNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function statCard(label, value, sub) {
  return '<div class="stat-card">' +
    '<div class="stat-value">' + value + '</div>' +
    '<div class="stat-label">' + label + '</div>' +
    (sub ? '<div class="stat-note">' + sub + '</div>' : '') +
  '</div>';
}

export async function renderDashboardView() {
  const content = document.getElementById('content');
  content.innerHTML = createPageHeader({ title: 'Панель управления', refreshAction: 'refresh-dashboard' });

  const statsRow = document.createElement('div');
  statsRow.className = 'stats-grid';
  statsRow.innerHTML = createLoadingSpinner();
  content.appendChild(statsRow);

  const columnsRow = document.createElement('div');
  columnsRow.className = 'admin-columns';
  columnsRow.innerHTML =
    '<div class="admin-column">' +
      '<h3 class="section-header">Популярные статьи</h3>' +
      '<div class="admin-top-articles">' + createLoadingSpinner() + '</div>' +
    '</div>' +
    '<div class="admin-column">' +
      '<h3 class="section-header">Авторы</h3>' +
      '<div class="admin-top-authors">' + createLoadingSpinner() + '</div>' +
    '</div>';
  content.appendChild(columnsRow);

  // Quick nav
  const navTitle = document.createElement('h3');
  navTitle.className = 'section-header';
  navTitle.textContent = 'Управление';
  content.appendChild(navTitle);

  const nav = document.createElement('nav');
  nav.className = 'admin-nav';

  const links = [
    { view: 'articles', label: 'Статьи' },
    { view: 'comments', label: 'Комментарии' },
    { view: 'categories', label: 'Категории' },
    { view: 'tags', label: 'Теги' },
    { view: 'users', label: 'Пользователи' },
    { view: 'media', label: 'Медиатека' },
    { view: 'collections', label: 'Подборки' },
    { view: 'integrations', label: 'Интеграции' },
    { view: 'moderation', label: 'Авто-модерация' },
    { view: 'settings', label: 'Настройки' },
  ];

  links.forEach(function (item) {
    const a = document.createElement('button');
    a.className = 'card';
    a.textContent = item.label;
    a.style.cssText = 'cursor:pointer;text-align:center;padding:16px';
    a.addEventListener('click', () => window.adminSwitchView(item.view));
    nav.appendChild(a);
  });
  content.appendChild(nav);

  // Refresh handler
  content.addEventListener('click', function (e) {
    if (e.target.closest('[data-action="refresh-dashboard"]')) {
      renderDashboardView();
    }
  });

  // Load analytics
  try {
    const res = await apiFetch('/api/admin/analytics');
    const data = await res.json();

    statsRow.innerHTML =
      statCard('Статьи', data.articles.published, 'опубл. / ' + data.articles.drafts + ' черн.') +
      statCard('Просмотры', formatNum(data.totalViews), 'всего') +
      statCard('Комментарии', data.comments.total, data.comments.visible + ' видимых') +
      statCard('Пользователи', data.userCount, '');

    // Top articles
    const topEl = content.querySelector('.admin-top-articles');
    if (data.topArticles.length === 0) {
      topEl.innerHTML = '<p class="text-secondary">Нет данных</p>';
    } else {
      topEl.innerHTML = '<table class="admin-table"><thead><tr>' +
        '<th>Статья</th><th>Просм.</th><th>Комм.</th>' +
        '</tr></thead><tbody>' +
        data.topArticles.map(function (a) {
          return '<tr>' +
            '<td>' + escapeHtml(a.title) + '</td>' +
            '<td>' + formatNum(a.viewCount) + '</td>' +
            '<td>' + a.commentCount + '</td>' +
          '</tr>';
        }).join('') +
        '</tbody></table>';
    }

    // Top authors
    const authorsEl = content.querySelector('.admin-top-authors');
    if (data.topAuthors.length === 0) {
      authorsEl.innerHTML = '<p class="text-secondary">Нет данных</p>';
    } else {
      authorsEl.innerHTML = '<table class="admin-table"><thead><tr>' +
        '<th>Автор</th><th>Статей</th><th>Просм.</th>' +
        '</tr></thead><tbody>' +
        data.topAuthors.map(function (a) {
          return '<tr>' +
            '<td>' + escapeHtml(a.displayName) + '</td>' +
            '<td>' + a.articleCount + '</td>' +
            '<td>' + formatNum(a.totalViews) + '</td>' +
          '</tr>';
        }).join('') +
        '</tbody></table>';
    }
  } catch (err) {
    console.error('Dashboard analytics error:', err);
    statsRow.innerHTML = '<p class="text-secondary">Не удалось загрузить аналитику</p>';
  }
}
