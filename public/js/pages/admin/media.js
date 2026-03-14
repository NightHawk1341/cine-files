/**
 * Admin media library.
 * Route: /admin/media
 */

Router.registerPage('/admin/media', {
  styles: ['/css/admin.css'],

  async init() {
    var content = document.getElementById('page-content');
    content.innerHTML = '';

    var container = document.createElement('div');
    container.className = 'container page-content admin-page';

    var header = document.createElement('div');
    header.className = 'admin-header';
    header.innerHTML = '<h1 class="admin-title">Медиатека</h1>';
    container.appendChild(header);

    var grid = document.createElement('div');
    grid.className = 'admin-media-grid';
    grid.innerHTML = '<div class="skeleton" style="height:400px"></div>';
    container.appendChild(grid);

    content.appendChild(container);

    try {
      var data = await Utils.apiFetch('/api/media?limit=100');
      var items = data.media || [];
      grid.innerHTML = '';

      if (items.length === 0) {
        grid.innerHTML = '<p class="admin-empty">Медиафайлов нет</p>';
        return;
      }

      items.forEach(function (m) {
        var card = document.createElement('div');
        card.className = 'admin-media-card';

        var sizeStr = m.file_size ? (m.file_size / 1024).toFixed(0) + ' KB' : '';
        var dims = m.width && m.height ? m.width + 'x' + m.height : '';

        card.innerHTML =
          '<div class="admin-media-preview">' +
          '<img src="' + Utils.escapeHtml(m.url) + '" alt="' + Utils.escapeHtml(m.alt_text || m.filename) + '" loading="lazy">' +
          '</div>' +
          '<div class="admin-media-info">' +
          '<div class="admin-media-filename" title="' + Utils.escapeHtml(m.filename) + '">' + Utils.escapeHtml(m.filename) + '</div>' +
          '<div class="admin-media-meta">' +
          (sizeStr ? '<span>' + sizeStr + '</span>' : '') +
          (dims ? '<span>' + dims + '</span>' : '') +
          '</div>' +
          '<div class="admin-media-meta">' +
          '<span>' + Utils.formatDateShort(m.created_at) + '</span>' +
          (m.uploader_name ? '<span>' + Utils.escapeHtml(m.uploader_name) + '</span>' : '') +
          '</div>' +
          '<div class="admin-media-actions">' +
          '<button class="admin-btn-sm admin-btn-copy" data-url="' + Utils.escapeHtml(m.url) + '">URL</button>' +
          '<button class="admin-btn-sm admin-btn-danger" data-action="delete" data-id="' + m.id + '">Удалить</button>' +
          '</div>' +
          '</div>';
        grid.appendChild(card);
      });

      // Action handlers
      grid.addEventListener('click', async function (e) {
        // Copy URL
        var copyBtn = e.target.closest('.admin-btn-copy');
        if (copyBtn) {
          var url = copyBtn.getAttribute('data-url');
          try {
            await navigator.clipboard.writeText(url);
            Toast.show('URL скопирован', 'success');
          } catch (_) {
            Toast.show('Не удалось скопировать', 'error');
          }
          return;
        }

        // Delete
        var delBtn = e.target.closest('[data-action="delete"]');
        if (delBtn) {
          var id = delBtn.getAttribute('data-id');
          if (!confirm('Удалить медиафайл?')) return;

          try {
            await Utils.apiFetch('/api/media/' + id, { method: 'DELETE' });
            Toast.show('Файл удален', 'success');
            delBtn.closest('.admin-media-card').remove();
          } catch (err) {
            Toast.show('Не удалось удалить', 'error');
          }
        }
      });
    } catch (err) {
      console.error('Admin media error:', err);
      grid.innerHTML = '<p class="admin-error">Не удалось загрузить медиатеку</p>';
    }

    document.title = 'Медиатека — Админ — CineFiles';
  },
});
