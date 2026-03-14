/**
 * Admin settings.
 * Route: /admin/settings
 */

Router.registerPage('/admin/settings', {
  styles: ['/css/admin.css'],

  async init() {
    var content = document.getElementById('page-content');
    content.innerHTML = '';

    var container = document.createElement('div');
    container.className = 'container page-content admin-page';

    var h1 = document.createElement('h1');
    h1.className = 'admin-title';
    h1.textContent = 'Настройки';
    container.appendChild(h1);

    var settingsWrap = document.createElement('div');
    settingsWrap.innerHTML = '<div class="skeleton" style="height:300px"></div>';
    container.appendChild(settingsWrap);

    content.appendChild(container);

    try {
      var data = await Utils.apiFetch('/api/settings');
      var settings = data.settings || [];
      settingsWrap.innerHTML = '';

      // Existing settings table
      if (settings.length > 0) {
        var table = document.createElement('table');
        table.className = 'admin-table';
        table.innerHTML = '<thead><tr><th>Ключ</th><th>Значение</th><th>Обновлено</th><th></th></tr></thead>';
        var tbody = document.createElement('tbody');

        settings.forEach(function (s) {
          var tr = document.createElement('tr');
          var valueStr = typeof s.value === 'object' ? JSON.stringify(s.value) : String(s.value);
          tr.innerHTML =
            '<td><code>' + Utils.escapeHtml(s.key) + '</code></td>' +
            '<td class="admin-setting-value">' +
            '<textarea class="admin-textarea admin-setting-textarea" data-key="' + Utils.escapeHtml(s.key) + '">' +
            Utils.escapeHtml(valueStr) +
            '</textarea></td>' +
            '<td>' + Utils.formatDateShort(s.updated_at) + '</td>' +
            '<td><button class="admin-btn-sm" data-action="save" data-key="' + Utils.escapeHtml(s.key) + '">Сохранить</button></td>';
          tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        settingsWrap.appendChild(table);
      } else {
        settingsWrap.innerHTML = '<p class="admin-empty">Настроек нет</p>';
      }

      // Add new setting form
      var addForm = document.createElement('div');
      addForm.className = 'admin-form';
      addForm.style.marginTop = '32px';
      addForm.innerHTML =
        '<h2 style="font-size:16px;font-weight:600;color:var(--text-primary);margin-bottom:16px">Добавить настройку</h2>' +
        '<div class="admin-form-group">' +
        '<label class="admin-label">Ключ</label>' +
        '<input class="admin-input" id="new-setting-key" placeholder="site_name">' +
        '</div>' +
        '<div class="admin-form-group">' +
        '<label class="admin-label">Значение (JSON)</label>' +
        '<textarea class="admin-textarea" id="new-setting-value" placeholder="&quot;CineFiles&quot;"></textarea>' +
        '</div>' +
        '<button class="admin-btn-primary" id="add-setting-btn">Добавить</button>';
      container.appendChild(addForm);

      // Save existing setting
      settingsWrap.addEventListener('click', async function (e) {
        var btn = e.target.closest('[data-action="save"]');
        if (!btn) return;

        var key = btn.getAttribute('data-key');
        var textarea = settingsWrap.querySelector('textarea[data-key="' + key + '"]');
        if (!textarea) return;

        var rawValue = textarea.value.trim();
        var value;
        try {
          value = JSON.parse(rawValue);
        } catch (_) {
          value = rawValue;
        }

        try {
          await Utils.apiFetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: key, value: value }),
          });
          Toast.show('Настройка сохранена', 'success');
        } catch (err) {
          Toast.show('Не удалось сохранить', 'error');
        }
      });

      // Add new setting
      document.getElementById('add-setting-btn').addEventListener('click', async function () {
        var keyInput = document.getElementById('new-setting-key');
        var valInput = document.getElementById('new-setting-value');
        var key = keyInput.value.trim();
        var rawValue = valInput.value.trim();

        if (!key) {
          Toast.show('Введите ключ', 'warning');
          return;
        }

        var value;
        try {
          value = JSON.parse(rawValue);
        } catch (_) {
          value = rawValue;
        }

        try {
          await Utils.apiFetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: key, value: value }),
          });
          Toast.show('Настройка добавлена', 'success');
          Router.navigate('/admin/settings');
        } catch (err) {
          Toast.show('Не удалось добавить', 'error');
        }
      });
    } catch (err) {
      console.error('Admin settings error:', err);
      settingsWrap.innerHTML = '<p class="admin-error">Не удалось загрузить настройки</p>';
    }

    document.title = 'Настройки — Админ — CineFiles';
  },
});
