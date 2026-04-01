/**
 * Media library view
 */

import { escapeHtml, showToast, showConfirmModal, formatDateShort, copyToClipboard } from '../utils.js';
import { apiFetch } from '../utils/apiClient.js';
import { createPageHeader, createLoadingSpinner } from '../utils/templates.js';

export async function renderMediaView() {
  const content = document.getElementById('content');
  content.innerHTML = createPageHeader({
    title: 'Медиатека',
    refreshAction: 'refresh-media',
    extraButtons: '<button class="btn btn-primary btn-sm" id="admin-media-upload-btn">Загрузить</button>'
  });

  // Upload zone
  const uploadZone = document.createElement('div');
  uploadZone.className = 'upload-zone';
  uploadZone.innerHTML =
    '<input type="file" id="admin-upload-file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" style="display:none">' +
    '<p class="upload-zone-text">Перетащите файл сюда или нажмите "Загрузить"</p>' +
    '<div class="upload-zone-fields" id="admin-upload-fields" style="display:none">' +
      '<input class="form-input" id="admin-upload-alt" type="text" placeholder="Alt текст">' +
      '<input class="form-input" id="admin-upload-credit" type="text" placeholder="Источник">' +
      '<button class="btn btn-primary btn-sm" id="admin-upload-submit">Загрузить файл</button>' +
    '</div>' +
    '<div id="admin-upload-progress" style="display:none" class="upload-zone-text">Загрузка...</div>';
  content.appendChild(uploadZone);

  // Upload handlers
  let pendingFile = null;

  document.getElementById('admin-media-upload-btn').addEventListener('click', function () {
    document.getElementById('admin-upload-file').click();
  });

  document.getElementById('admin-upload-file').addEventListener('change', function (e) {
    if (e.target.files.length > 0) {
      pendingFile = e.target.files[0];
      document.getElementById('admin-upload-fields').style.display = 'flex';
      uploadZone.querySelector('.upload-zone-text').textContent = pendingFile.name;
    }
  });

  uploadZone.addEventListener('dragover', function (e) { e.preventDefault(); uploadZone.classList.add('active'); });
  uploadZone.addEventListener('dragleave', function () { uploadZone.classList.remove('active'); });
  uploadZone.addEventListener('drop', function (e) {
    e.preventDefault();
    uploadZone.classList.remove('active');
    if (e.dataTransfer.files.length > 0) {
      pendingFile = e.dataTransfer.files[0];
      document.getElementById('admin-upload-fields').style.display = 'flex';
      uploadZone.querySelector('.upload-zone-text').textContent = pendingFile.name;
    }
  });

  document.getElementById('admin-upload-submit').addEventListener('click', async function () {
    if (!pendingFile) return;
    document.getElementById('admin-upload-fields').style.display = 'none';
    document.getElementById('admin-upload-progress').style.display = 'block';

    const formData = new FormData();
    formData.append('file', pendingFile);
    const altVal = document.getElementById('admin-upload-alt').value;
    const creditVal = document.getElementById('admin-upload-credit').value;
    if (altVal) formData.append('alt', altVal);
    if (creditVal) formData.append('credit', creditVal);

    try {
      await apiFetch('/api/media/upload', { method: 'POST', body: formData });
      showToast('Файл загружен', 'success');
      renderMediaView();
    } catch (err) {
      showToast('Не удалось загрузить', 'error');
      document.getElementById('admin-upload-progress').style.display = 'none';
      document.getElementById('admin-upload-fields').style.display = 'flex';
    }
    pendingFile = null;
  });

  // Media grid
  const grid = document.createElement('div');
  grid.className = 'media-grid';
  grid.innerHTML = createLoadingSpinner();
  content.appendChild(grid);

  content.addEventListener('click', function (e) {
    if (e.target.closest('[data-action="refresh-media"]')) {
      renderMediaView();
    }
  });

  try {
    const res = await apiFetch('/api/media?limit=100');
    const data = await res.json();
    const items = data.media || [];
    grid.innerHTML = '';

    if (items.length === 0) {
      grid.innerHTML = '<p class="text-secondary">Медиафайлов нет</p>';
      return;
    }

    items.forEach(function (m) {
      const card = document.createElement('div');
      card.className = 'media-card';

      const sizeStr = m.file_size ? (m.file_size / 1024).toFixed(0) + ' KB' : '';
      const dims = m.width && m.height ? m.width + 'x' + m.height : '';

      card.innerHTML =
        '<div class="media-card-preview">' +
        '<img src="' + escapeHtml(m.url) + '" alt="' + escapeHtml(m.alt_text || m.filename) + '" loading="lazy">' +
        '</div>' +
        '<div class="media-card-info">' +
        '<div class="media-card-filename" title="' + escapeHtml(m.filename) + '">' + escapeHtml(m.filename) + '</div>' +
        '<div class="media-card-meta">' +
        (sizeStr ? '<span>' + sizeStr + '</span>' : '') +
        (dims ? '<span>' + dims + '</span>' : '') +
        '</div>' +
        '<div class="media-card-meta">' +
        '<span>' + formatDateShort(m.created_at) + '</span>' +
        (m.uploader_name ? '<span>' + escapeHtml(m.uploader_name) + '</span>' : '') +
        '</div>' +
        '<div class="media-card-actions">' +
        '<button class="btn btn-secondary btn-sm" data-action="copy-url" data-url="' + escapeHtml(m.url) + '">URL</button>' +
        '<button class="btn btn-danger btn-sm" data-action="delete-media" data-id="' + m.id + '">Удалить</button>' +
        '</div>' +
        '</div>';
      grid.appendChild(card);
    });

    grid.addEventListener('click', async function (e) {
      const copyBtn = e.target.closest('[data-action="copy-url"]');
      if (copyBtn) {
        copyToClipboard(copyBtn.getAttribute('data-url'));
        return;
      }

      const delBtn = e.target.closest('[data-action="delete-media"]');
      if (delBtn) {
        const confirmed = await showConfirmModal('Удалить медиафайл?');
        if (!confirmed) return;

        const id = delBtn.getAttribute('data-id');
        try {
          await apiFetch('/api/media/' + id, { method: 'DELETE' });
          showToast('Файл удален', 'success');
          delBtn.closest('.media-card').remove();
        } catch (err) {
          showToast('Не удалось удалить', 'error');
        }
      }
    });
  } catch (err) {
    console.error('Admin media error:', err);
    grid.innerHTML = '<p class="text-secondary">Не удалось загрузить медиатеку</p>';
  }
}
