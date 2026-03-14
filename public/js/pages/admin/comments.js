/**
 * Admin comments moderation.
 * Route: /admin/comments
 */

Router.registerPage('/admin/comments', {
  styles: ['/css/admin.css'],

  async init() {
    var content = document.getElementById('page-content');
    content.innerHTML = '';

    var container = document.createElement('div');
    container.className = 'container page-content admin-page';

    var h1 = document.createElement('h1');
    h1.className = 'admin-title';
    h1.textContent = 'Комментарии';
    container.appendChild(h1);

    var listWrap = document.createElement('div');
    listWrap.className = 'admin-list';
    listWrap.innerHTML = '<div class="skeleton" style="height:300px"></div>';
    container.appendChild(listWrap);

    content.appendChild(container);

    try {
      var data = await Utils.apiFetch('/api/comments?limit=50');
      var comments = data.comments || [];
      listWrap.innerHTML = '';

      if (comments.length === 0) {
        listWrap.innerHTML = '<p class="admin-empty">Комментариев нет</p>';
        return;
      }

      comments.forEach(function (c) {
        var item = document.createElement('div');
        item.className = 'admin-comment-item';
        item.innerHTML =
          '<div class="admin-comment-header">' +
          '<strong>' + Utils.escapeHtml(c.author_name || 'Аноним') + '</strong>' +
          '<span class="admin-comment-date">' + Utils.formatDateShort(c.created_at) + '</span>' +
          '<span class="admin-status admin-status-' + c.status + '">' + c.status + '</span>' +
          '</div>' +
          '<p class="admin-comment-text">' + Utils.escapeHtml(c.text || '') + '</p>' +
          '<div class="admin-comment-actions">' +
          '<button class="admin-btn-sm" data-action="hide" data-id="' + c.id + '">Скрыть</button>' +
          '<button class="admin-btn-sm admin-btn-danger" data-action="delete" data-id="' + c.id + '">Удалить</button>' +
          '</div>';
        listWrap.appendChild(item);
      });

      // Action handlers
      listWrap.addEventListener('click', async function (e) {
        var btn = e.target.closest('[data-action]');
        if (!btn) return;
        var action = btn.getAttribute('data-action');
        var id = btn.getAttribute('data-id');

        try {
          await Utils.apiFetch('/api/admin/comments/' + id + '/moderate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: action }),
          });
          Toast.show('Действие выполнено', 'success');
          btn.closest('.admin-comment-item').remove();
        } catch (err) {
          Toast.show('Не удалось выполнить действие', 'error');
        }
      });
    } catch (err) {
      console.error('Admin comments error:', err);
      listWrap.innerHTML = '<p class="admin-error">Не удалось загрузить комментарии</p>';
    }

    document.title = 'Комментарии — Админ — CineFiles';
  },
});
