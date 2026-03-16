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
    header.innerHTML =
      '<h1 class="admin-title">Медиатека</h1>' +
      '<button class="admin-btn-primary" id="admin-media-upload-btn">Загрузить</button>';
    container.appendChild(header);

    // Upload zone
    var uploadZone = document.createElement('div');
    uploadZone.className = 'admin-upload-zone';
    uploadZone.id = 'admin-upload-zone';
    uploadZone.innerHTML =
      '<input type="file" id="admin-upload-file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" style="display:none">' +
      '<p class="admin-upload-text">Перетащите файл сюда или нажмите "Загрузить"</p>' +
      '<div class="admin-upload-fields" id="admin-upload-fields" style="display:none">' +
        '<input class="admin-input" id="admin-upload-alt" type="text" placeholder="Alt текст">' +
        '<input class="admin-input" id="admin-upload-credit" type="text" placeholder="Источник">' +
        '<button class="admin-btn-primary" id="admin-upload-submit">Загрузить файл</button>' +
      '</div>' +
      '<div id="admin-upload-progress" style="display:none" class="admin-upload-text">Загрузка...</div>';
    container.appendChild(uploadZone);

    // Upload event handlers
    document.getElementById('admin-media-upload-btn').addEventListener('click', function () {
      document.getElementById('admin-upload-file').click();
    });

    var _pendingFile = null;
    document.getElementById('admin-upload-file').addEventListener('change', function (e) {
      if (e.target.files.length > 0) {
        _pendingFile = e.target.files[0];
        document.getElementById('admin-upload-fields').style.display = 'flex';
        uploadZone.querySelector('.admin-upload-text').textContent = _pendingFile.name;
      }
    });

    uploadZone.addEventListener('dragover', function (e) { e.preventDefault(); uploadZone.classList.add('admin-upload-zone--active'); });
    uploadZone.addEventListener('dragleave', function () { uploadZone.classList.remove('admin-upload-zone--active'); });
    uploadZone.addEventListener('drop', function (e) {
      e.preventDefault();
      uploadZone.classList.remove('admin-upload-zone--active');
      if (e.dataTransfer.files.length > 0) {
        _pendingFile = e.dataTransfer.files[0];
        document.getElementById('admin-upload-fields').style.display = 'flex';
        uploadZone.querySelector('.admin-upload-text').textContent = _pendingFile.name;
      }
    });

    document.getElementById('admin-upload-submit').addEventListener('click', async function () {
      if (!_pendingFile) return;
      document.getElementById('admin-upload-fields').style.display = 'none';
      document.getElementById('admin-upload-progress').style.display = 'block';

      var formData = new FormData();
      formData.append('file', _pendingFile);
      var altVal = document.getElementById('admin-upload-alt').value;
      var creditVal = document.getElementById('admin-upload-credit').value;
      if (altVal) formData.append('alt', altVal);
      if (creditVal) formData.append('credit', creditVal);

      try {
        var res = await fetch('/api/media/upload', { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Upload failed');
        Toast.show('Файл загружен', 'success');
        Router.navigate('/admin/media');
      } catch (err) {
        Toast.show('Не удалось загрузить', 'error');
        document.getElementById('admin-upload-progress').style.display = 'none';
        document.getElementById('admin-upload-fields').style.display = 'flex';
      }
      _pendingFile = null;
    });

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
