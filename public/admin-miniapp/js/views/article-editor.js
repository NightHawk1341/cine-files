/**
 * Article editor view
 * In the old admin, this delegated to ArticleEditorModal.
 * Here we show a placeholder since the full block editor
 * requires the ArticleEditorModal component which lives in the main SPA.
 */

import { showToast } from '../utils.js';
import { createPageHeader } from '../utils/templates.js';

export function renderArticleEditorView() {
  const content = document.getElementById('content');
  const articleId = window._adminEditArticleId || null;
  window._adminEditArticleId = null;

  const title = articleId ? 'Редактировать статью' : 'Новая статья';

  content.innerHTML = createPageHeader({
    title: title,
    extraButtons: '<button class="btn btn-secondary btn-sm" data-action="back-to-articles">Назад к статьям</button>'
  });

  const info = document.createElement('div');
  info.className = 'card';
  info.style.padding = '24px';
  info.innerHTML =
    '<p class="text-secondary" style="margin-bottom:16px">Редактор статей использует блочный редактор из основного сайта.</p>' +
    '<p class="text-secondary">Для редактирования статей перейдите в основную админ-панель:</p>' +
    '<a href="/admin/articles' + (articleId ? '/' + articleId : '/new') + '" class="btn btn-primary" style="margin-top:16px" target="_blank">' +
    'Открыть в основном редакторе</a>';
  content.appendChild(info);

  content.addEventListener('click', function (e) {
    if (e.target.closest('[data-action="back-to-articles"]')) {
      window.adminSwitchView('articles');
    }
  });
}
