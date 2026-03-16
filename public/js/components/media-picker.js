/**
 * Media Picker — modal for selecting/uploading images.
 * Used by article editor for cover images and image blocks.
 */

var MediaPicker = (function () {
  var overlay = null;
  var onSelect = null;

  /**
   * Open media picker modal.
   * @param {function(string)} callback — called with selected image URL
   */
  function open(callback) {
    if (overlay) close();
    onSelect = callback;

    overlay = document.createElement('div');
    overlay.className = 'media-picker-overlay';
    overlay.innerHTML =
      '<div class="media-picker-modal">' +
        '<div class="media-picker-header">' +
          '<span class="media-picker-title">Медиа</span>' +
          '<button class="media-picker-close">&times;</button>' +
        '</div>' +
        '<div class="media-picker-upload-zone" id="media-picker-drop">' +
          '<input type="file" id="media-picker-file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" style="display:none">' +
          '<p class="media-picker-drop-text">Перетащите файл или <button class="media-picker-browse-btn" id="media-picker-browse">выберите</button></p>' +
          '<div class="media-picker-upload-fields" style="display:none" id="media-picker-fields">' +
            '<input class="media-picker-input" id="media-picker-alt" type="text" placeholder="Alt текст">' +
            '<input class="media-picker-input" id="media-picker-credit" type="text" placeholder="Источник">' +
            '<button class="media-picker-upload-btn" id="media-picker-upload-btn">Загрузить</button>' +
          '</div>' +
          '<div class="media-picker-progress" id="media-picker-progress" style="display:none">Загрузка...</div>' +
        '</div>' +
        '<div class="media-picker-grid" id="media-picker-grid">' +
          '<div class="media-picker-loading">Загрузка...</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    // Close handlers
    overlay.querySelector('.media-picker-close').addEventListener('click', close);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });

    // Browse button
    document.getElementById('media-picker-browse').addEventListener('click', function () {
      document.getElementById('media-picker-file').click();
    });

    // File input change
    document.getElementById('media-picker-file').addEventListener('change', function (e) {
      if (e.target.files.length > 0) {
        showUploadFields(e.target.files[0]);
      }
    });

    // Drop zone
    var dropZone = document.getElementById('media-picker-drop');
    dropZone.addEventListener('dragover', function (e) {
      e.preventDefault();
      dropZone.classList.add('media-picker-drop--active');
    });
    dropZone.addEventListener('dragleave', function () {
      dropZone.classList.remove('media-picker-drop--active');
    });
    dropZone.addEventListener('drop', function (e) {
      e.preventDefault();
      dropZone.classList.remove('media-picker-drop--active');
      if (e.dataTransfer.files.length > 0) {
        showUploadFields(e.dataTransfer.files[0]);
      }
    });

    // Load existing media
    loadMedia();
  }

  function close() {
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    overlay = null;
    onSelect = null;
  }

  var pendingFile = null;

  function showUploadFields(file) {
    pendingFile = file;
    var fields = document.getElementById('media-picker-fields');
    if (fields) fields.style.display = 'flex';

    document.getElementById('media-picker-upload-btn').addEventListener('click', function () {
      uploadFile();
    });
  }

  async function uploadFile() {
    if (!pendingFile) return;

    var progress = document.getElementById('media-picker-progress');
    var fields = document.getElementById('media-picker-fields');
    if (progress) progress.style.display = 'block';
    if (fields) fields.style.display = 'none';

    var formData = new FormData();
    formData.append('file', pendingFile);

    var altEl = document.getElementById('media-picker-alt');
    var creditEl = document.getElementById('media-picker-credit');
    if (altEl && altEl.value) formData.append('alt', altEl.value);
    if (creditEl && creditEl.value) formData.append('credit', creditEl.value);

    try {
      var res = await fetch('/api/media/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Upload failed');

      var data = await res.json();
      var url = data.media.url;

      if (onSelect) {
        onSelect(url);
        close();
      }

      Toast.show('Файл загружен', 'success');
    } catch (err) {
      Toast.show('Не удалось загрузить файл', 'error');
      if (progress) progress.style.display = 'none';
      if (fields) fields.style.display = 'flex';
    }

    pendingFile = null;
  }

  async function loadMedia() {
    var grid = document.getElementById('media-picker-grid');
    if (!grid) return;

    try {
      var data = await Utils.apiFetch('/api/media?limit=60');
      var items = data.media || [];

      if (items.length === 0) {
        grid.innerHTML = '<p class="media-picker-empty">Нет загруженных файлов</p>';
        return;
      }

      grid.innerHTML = '';
      items.forEach(function (item) {
        var card = document.createElement('button');
        card.className = 'media-picker-card';
        card.innerHTML = '<img src="' + Utils.escapeHtml(item.url) + '" alt="' + Utils.escapeHtml(item.alt_text || item.filename) + '" loading="lazy">';
        card.addEventListener('click', function () {
          if (onSelect) {
            onSelect(item.url);
            close();
          }
        });
        grid.appendChild(card);
      });
    } catch (err) {
      grid.innerHTML = '<p class="media-picker-empty">Не удалось загрузить</p>';
    }
  }

  return {
    open: open,
    close: close,
  };
})();
