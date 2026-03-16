/**
 * Admin integrations (partner placements) management.
 * Route: /admin/integrations
 */

Router.registerPage('/admin/integrations', {
  styles: ['/css/admin.css'],

  async init() {
    var content = document.getElementById('page-content');
    content.innerHTML = '';

    var container = document.createElement('div');
    container.className = 'container page-content admin-page';

    // Header
    var header = document.createElement('div');
    header.className = 'admin-header';
    header.innerHTML =
      '<h1 class="admin-title">Интеграции</h1>' +
      '<button class="admin-btn-primary" id="intg-add-btn">Добавить</button>';
    container.appendChild(header);

    // Form (hidden by default)
    var formWrap = document.createElement('div');
    formWrap.id = 'intg-form-wrap';
    formWrap.style.display = 'none';
    formWrap.innerHTML =
      '<form class="admin-form" id="intg-form" style="max-width:100%">' +
      '<input type="hidden" id="intg-edit-id">' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
        '<div class="admin-form-group">' +
          '<label class="admin-label">Название</label>' +
          '<input class="admin-input" id="intg-title" required>' +
        '</div>' +
        '<div class="admin-form-group">' +
          '<label class="admin-label">Тип</label>' +
          '<select class="admin-select" id="intg-type">' +
            '<option value="featured">Featured</option>' +
            '<option value="partner">Partner</option>' +
            '<option value="html">HTML</option>' +
          '</select>' +
        '</div>' +
        '<div class="admin-form-group">' +
          '<label class="admin-label">Размещение</label>' +
          '<select class="admin-select" id="intg-placement">' +
            '<option value="sidebar">Сайдбар</option>' +
            '<option value="between">Между статьями</option>' +
            '<option value="footer">Подвал статьи</option>' +
            '<option value="header">Шапка</option>' +
          '</select>' +
        '</div>' +
        '<div class="admin-form-group">' +
          '<label class="admin-label">Приоритет</label>' +
          '<input class="admin-input" id="intg-priority" type="number" value="0">' +
        '</div>' +
        '<div class="admin-form-group">' +
          '<label class="admin-label">URL изображения</label>' +
          '<input class="admin-input" id="intg-image">' +
        '</div>' +
        '<div class="admin-form-group">' +
          '<label class="admin-label">URL перехода</label>' +
          '<input class="admin-input" id="intg-dest">' +
        '</div>' +
        '<div class="admin-form-group">' +
          '<label class="admin-label">Alt текст</label>' +
          '<input class="admin-input" id="intg-alt">' +
        '</div>' +
        '<div class="admin-form-group">' +
          '<label class="admin-label">Макс. показов (0 = без лимита)</label>' +
          '<input class="admin-input" id="intg-max-views" type="number" value="0">' +
        '</div>' +
        '<div class="admin-form-group">' +
          '<label class="admin-label">Дата начала</label>' +
          '<input class="admin-input" id="intg-start" type="datetime-local">' +
        '</div>' +
        '<div class="admin-form-group">' +
          '<label class="admin-label">Дата окончания</label>' +
          '<input class="admin-input" id="intg-end" type="datetime-local">' +
        '</div>' +
      '</div>' +
      '<div class="admin-form-group">' +
        '<label class="admin-label">HTML-контент</label>' +
        '<textarea class="admin-textarea" id="intg-html" rows="4"></textarea>' +
      '</div>' +
      '<div class="admin-form-actions">' +
        '<button type="submit" class="admin-btn-primary">Сохранить</button>' +
        '<button type="button" class="admin-btn-secondary" id="intg-cancel">Отмена</button>' +
      '</div>' +
      '</form>';
    container.appendChild(formWrap);

    // Table
    var tableWrap = document.createElement('div');
    tableWrap.className = 'admin-table-wrap';
    tableWrap.id = 'intg-table-wrap';
    tableWrap.innerHTML = '<div class="skeleton" style="height:300px"></div>';
    container.appendChild(tableWrap);

    content.appendChild(container);
    document.title = 'Интеграции — Админ — CineFiles';

    // State
    var editingId = null;

    // Load list
    async function loadList() {
      try {
        var data = await Utils.apiFetch('/api/integrations?all=1');
        var items = data.items || [];
        tableWrap.innerHTML = '';

        if (items.length === 0) {
          tableWrap.innerHTML = '<p class="admin-empty">Интеграций нет</p>';
          return;
        }

        var table = document.createElement('table');
        table.className = 'admin-table';
        table.innerHTML =
          '<thead><tr>' +
          '<th>Название</th><th>Тип</th><th>Размещение</th><th>Активна</th>' +
          '<th>Показы</th><th>Клики</th><th>Период</th><th></th>' +
          '</tr></thead>';

        var tbody = document.createElement('tbody');
        items.forEach(function (item) {
          var tr = document.createElement('tr');
          var startStr = item.start_date ? Utils.formatDateShort(item.start_date) : '—';
          var endStr = item.end_date ? Utils.formatDateShort(item.end_date) : '—';
          var maxLabel = item.max_views > 0 ? ' / ' + item.max_views : '';

          tr.innerHTML =
            '<td>' + Utils.escapeHtml(item.title) + '</td>' +
            '<td>' + Utils.escapeHtml(item.integration_type || item.promo_type || '') + '</td>' +
            '<td>' + Utils.escapeHtml(item.placement) + '</td>' +
            '<td><span class="admin-status admin-status-' + (item.is_active ? 'visible' : 'hidden') + '">' +
              (item.is_active ? 'Да' : 'Нет') + '</span></td>' +
            '<td>' + Number(item.current_views || 0) + maxLabel + '</td>' +
            '<td>' + Number(item.click_count || 0) + '</td>' +
            '<td>' + startStr + ' — ' + endStr + '</td>' +
            '<td style="white-space:nowrap">' +
              '<button class="admin-btn-sm intg-edit-btn" data-id="' + item.id + '">Изменить</button> ' +
              '<button class="admin-btn-sm admin-btn-danger intg-del-btn" data-id="' + item.id + '">Удалить</button>' +
            '</td>';
          tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        tableWrap.appendChild(table);
      } catch (err) {
        console.error('Admin integrations error:', err);
        tableWrap.innerHTML = '<p class="admin-error">Не удалось загрузить интеграции</p>';
      }
    }

    function resetForm() {
      editingId = null;
      document.getElementById('intg-edit-id').value = '';
      document.getElementById('intg-title').value = '';
      document.getElementById('intg-type').value = 'featured';
      document.getElementById('intg-placement').value = 'sidebar';
      document.getElementById('intg-priority').value = '0';
      document.getElementById('intg-image').value = '';
      document.getElementById('intg-dest').value = '';
      document.getElementById('intg-alt').value = '';
      document.getElementById('intg-max-views').value = '0';
      document.getElementById('intg-start').value = '';
      document.getElementById('intg-end').value = '';
      document.getElementById('intg-html').value = '';
      formWrap.style.display = 'none';
    }

    function fillForm(item) {
      editingId = item.id;
      document.getElementById('intg-edit-id').value = item.id;
      document.getElementById('intg-title').value = item.title || '';
      document.getElementById('intg-type').value = item.integration_type || item.promo_type || 'featured';
      document.getElementById('intg-placement').value = item.placement || 'sidebar';
      document.getElementById('intg-priority').value = item.priority || 0;
      document.getElementById('intg-image').value = item.image_url || '';
      document.getElementById('intg-dest').value = item.destination_url || '';
      document.getElementById('intg-alt').value = item.alt_text || '';
      document.getElementById('intg-max-views').value = item.max_views || 0;
      document.getElementById('intg-start').value = item.start_date ? item.start_date.slice(0, 16) : '';
      document.getElementById('intg-end').value = item.end_date ? item.end_date.slice(0, 16) : '';
      document.getElementById('intg-html').value = item.html_content || '';
      formWrap.style.display = '';
    }

    // Add button
    document.getElementById('intg-add-btn').addEventListener('click', function () {
      resetForm();
      formWrap.style.display = '';
    });

    // Cancel
    document.getElementById('intg-cancel').addEventListener('click', resetForm);

    // Submit
    document.getElementById('intg-form').addEventListener('submit', async function (e) {
      e.preventDefault();

      var payload = {
        title: document.getElementById('intg-title').value.trim(),
        integration_type: document.getElementById('intg-type').value,
        placement: document.getElementById('intg-placement').value,
        priority: Number(document.getElementById('intg-priority').value) || 0,
        image_url: document.getElementById('intg-image').value.trim() || null,
        destination_url: document.getElementById('intg-dest').value.trim() || null,
        alt_text: document.getElementById('intg-alt').value.trim() || null,
        max_views: Number(document.getElementById('intg-max-views').value) || 0,
        start_date: document.getElementById('intg-start').value || null,
        end_date: document.getElementById('intg-end').value || null,
        html_content: document.getElementById('intg-html').value.trim() || null,
      };

      try {
        if (editingId) {
          await Utils.apiFetch('/api/integrations/' + editingId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          Toast.show('Интеграция обновлена', 'success');
        } else {
          await Utils.apiFetch('/api/integrations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          Toast.show('Интеграция создана', 'success');
        }
        resetForm();
        loadList();
      } catch (err) {
        Toast.show(err.data && err.data.error ? err.data.error : 'Ошибка сохранения', 'error');
      }
    });

    // Table click delegation
    tableWrap.addEventListener('click', async function (e) {
      var editBtn = e.target.closest('.intg-edit-btn');
      var delBtn = e.target.closest('.intg-del-btn');

      if (editBtn) {
        var id = editBtn.getAttribute('data-id');
        try {
          var item = await Utils.apiFetch('/api/integrations/' + id);
          fillForm(item);
        } catch (err) {
          Toast.show('Не удалось загрузить', 'error');
        }
      }

      if (delBtn) {
        var delId = delBtn.getAttribute('data-id');
        if (!confirm('Удалить интеграцию?')) return;
        try {
          await Utils.apiFetch('/api/integrations/' + delId, { method: 'DELETE' });
          Toast.show('Удалено', 'success');
          loadList();
        } catch (err) {
          Toast.show('Не удалось удалить', 'error');
        }
      }
    });

    loadList();
  },
});
