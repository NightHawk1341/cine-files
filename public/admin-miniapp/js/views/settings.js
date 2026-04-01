/**
 * Settings management view
 */

import { escapeHtml, showToast, formatDateShort } from '../utils.js';
import { apiFetch } from '../utils/apiClient.js';
import { createPageHeader, createLoadingSpinner } from '../utils/templates.js';

export async function renderSettingsView() {
  const content = document.getElementById('content');
  content.innerHTML = createPageHeader({ title: 'Настройки', refreshAction: 'refresh-settings' });

  const settingsWrap = document.createElement('div');
  settingsWrap.innerHTML = createLoadingSpinner();
  content.appendChild(settingsWrap);

  content.addEventListener('click', function (e) {
    if (e.target.closest('[data-action="refresh-settings"]')) {
      renderSettingsView();
    }
  });

  try {
    const res = await apiFetch('/api/settings');
    const data = await res.json();
    const settings = data.settings || [];
    settingsWrap.innerHTML = '';

    if (settings.length > 0) {
      const table = document.createElement('table');
      table.className = 'admin-table';
      table.innerHTML = '<thead><tr><th>Ключ</th><th>Значение</th><th>Обновлено</th><th></th></tr></thead>';
      const tbody = document.createElement('tbody');

      settings.forEach(function (s) {
        const valueStr = typeof s.value === 'object' ? JSON.stringify(s.value) : String(s.value);
        const tr = document.createElement('tr');
        tr.innerHTML =
          '<td><code>' + escapeHtml(s.key) + '</code></td>' +
          '<td class="admin-setting-value">' +
          '<textarea class="form-textarea admin-setting-textarea" data-key="' + escapeHtml(s.key) + '">' +
          escapeHtml(valueStr) +
          '</textarea></td>' +
          '<td>' + formatDateShort(s.updated_at) + '</td>' +
          '<td><button class="btn btn-secondary btn-sm" data-action="save" data-key="' + escapeHtml(s.key) + '">Сохранить</button></td>';
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      settingsWrap.appendChild(table);
    } else {
      settingsWrap.innerHTML = '<p class="text-secondary">Настроек нет</p>';
    }

    // Add new setting form
    const addForm = document.createElement('div');
    addForm.style.marginTop = '32px';
    addForm.innerHTML =
      '<h3 class="section-header">Добавить настройку</h3>' +
      '<div class="form-group">' +
      '<label class="form-label">Ключ</label>' +
      '<input class="form-input" id="new-setting-key" placeholder="site_name">' +
      '</div>' +
      '<div class="form-group">' +
      '<label class="form-label">Значение (JSON)</label>' +
      '<textarea class="form-textarea" id="new-setting-value" placeholder="&quot;CineFiles&quot;"></textarea>' +
      '</div>' +
      '<button class="btn btn-primary" id="add-setting-btn">Добавить</button>';
    content.appendChild(addForm);

    // Save existing setting
    settingsWrap.addEventListener('click', async function (e) {
      const btn = e.target.closest('[data-action="save"]');
      if (!btn) return;

      const key = btn.getAttribute('data-key');
      const textarea = settingsWrap.querySelector('textarea[data-key="' + key + '"]');
      if (!textarea) return;

      const rawValue = textarea.value.trim();
      let value;
      try { value = JSON.parse(rawValue); } catch (_) { value = rawValue; }

      try {
        await apiFetch('/api/settings', {
          method: 'PUT',
          body: JSON.stringify({ key: key, value: value }),
        });
        showToast('Настройка сохранена', 'success');
      } catch (err) {
        showToast('Не удалось сохранить', 'error');
      }
    });

    // Add new setting
    document.getElementById('add-setting-btn').addEventListener('click', async function () {
      const keyInput = document.getElementById('new-setting-key');
      const valInput = document.getElementById('new-setting-value');
      const key = keyInput.value.trim();
      const rawValue = valInput.value.trim();

      if (!key) {
        showToast('Введите ключ', 'warning');
        return;
      }

      let value;
      try { value = JSON.parse(rawValue); } catch (_) { value = rawValue; }

      try {
        await apiFetch('/api/settings', {
          method: 'PUT',
          body: JSON.stringify({ key: key, value: value }),
        });
        showToast('Настройка добавлена', 'success');
        renderSettingsView();
      } catch (err) {
        showToast('Не удалось добавить', 'error');
      }
    });
  } catch (err) {
    console.error('Admin settings error:', err);
    settingsWrap.innerHTML = '<p class="text-secondary">Не удалось загрузить настройки</p>';
  }
}
