/**
 * Admin word filter / auto-moderation management.
 * Route: /admin/moderation
 */

Router.registerPage('/admin/moderation', {
  styles: ['/css/admin.css'],

  async init() {
    var content = document.getElementById('page-content');
    content.innerHTML = '';

    var container = document.createElement('div');
    container.className = 'container page-content admin-page';

    // Header
    var header = document.createElement('div');
    header.className = 'admin-header';
    header.innerHTML = '<h1 class="admin-title">Авто-модерация</h1>';
    container.appendChild(header);

    // Test section
    var testSection = document.createElement('div');
    testSection.style.cssText = 'margin-bottom:24px';
    testSection.innerHTML =
      '<div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">' +
        '<div style="flex:1;min-width:200px">' +
          '<label class="admin-label">Проверить текст</label>' +
          '<input class="admin-input" id="mod-test-input" placeholder="Введите текст для проверки...">' +
        '</div>' +
        '<button class="admin-btn-primary" id="mod-test-btn">Проверить</button>' +
      '</div>' +
      '<div id="mod-test-result" style="margin-top:8px;font-size:14px"></div>';
    container.appendChild(testSection);

    // Add words section
    var addSection = document.createElement('div');
    addSection.style.cssText = 'margin-bottom:24px';
    addSection.innerHTML =
      '<div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">' +
        '<div style="flex:1;min-width:200px">' +
          '<label class="admin-label">Добавить слова (через запятую)</label>' +
          '<input class="admin-input" id="mod-add-input" placeholder="слово1, слово2, слово3">' +
        '</div>' +
        '<div style="min-width:120px">' +
          '<label class="admin-label">Категория</label>' +
          '<select class="admin-select" id="mod-add-category">' +
            '<option value="general">general</option>' +
            '<option value="profanity">profanity</option>' +
            '<option value="spam">spam</option>' +
            '<option value="hate">hate</option>' +
          '</select>' +
        '</div>' +
        '<button class="admin-btn-primary" id="mod-add-btn">Добавить</button>' +
      '</div>';
    container.appendChild(addSection);

    // Filters
    var filters = document.createElement('div');
    filters.style.cssText = 'display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:flex-end';
    filters.innerHTML =
      '<div style="flex:1;min-width:150px">' +
        '<label class="admin-label">Поиск</label>' +
        '<input class="admin-input" id="mod-search" placeholder="Поиск...">' +
      '</div>' +
      '<div>' +
        '<label class="admin-label">Категория</label>' +
        '<select class="admin-select" id="mod-filter-category">' +
          '<option value="">Все</option>' +
          '<option value="general">general</option>' +
          '<option value="profanity">profanity</option>' +
          '<option value="spam">spam</option>' +
          '<option value="hate">hate</option>' +
        '</select>' +
      '</div>' +
      '<div>' +
        '<label class="admin-label">Статус</label>' +
        '<select class="admin-select" id="mod-filter-active">' +
          '<option value="">Все</option>' +
          '<option value="true">Активные</option>' +
          '<option value="false">Неактивные</option>' +
        '</select>' +
      '</div>' +
      '<button class="admin-btn-secondary" id="mod-filter-btn">Применить</button>';
    container.appendChild(filters);

    // Word list
    var tableWrap = document.createElement('div');
    tableWrap.className = 'admin-table-wrap';
    tableWrap.id = 'mod-table-wrap';
    tableWrap.innerHTML = '<div class="skeleton" style="height:300px"></div>';
    container.appendChild(tableWrap);

    content.appendChild(container);
    document.title = 'Авто-модерация — Админ — CineFiles';

    // Search debounce
    var searchTimer = null;

    // Load word list
    async function loadWords() {
      var search = document.getElementById('mod-search').value.trim();
      var category = document.getElementById('mod-filter-category').value;
      var active = document.getElementById('mod-filter-active').value;

      var qs = [];
      if (search) qs.push('search=' + encodeURIComponent(search));
      if (category) qs.push('category=' + encodeURIComponent(category));
      if (active) qs.push('active=' + active);

      try {
        var data = await Utils.apiFetch('/api/admin/moderation/words' + (qs.length ? '?' + qs.join('&') : ''));
        var words = data.words || [];
        tableWrap.innerHTML = '';

        if (words.length === 0) {
          tableWrap.innerHTML = '<p class="admin-empty">Слов не найдено</p>';
          return;
        }

        var table = document.createElement('table');
        table.className = 'admin-table';
        table.innerHTML =
          '<thead><tr>' +
          '<th>Слово</th><th>Категория</th><th>Активно</th><th>Добавлено</th><th></th>' +
          '</tr></thead>';

        var tbody = document.createElement('tbody');
        words.forEach(function (w) {
          var tr = document.createElement('tr');
          tr.innerHTML =
            '<td>' + Utils.escapeHtml(w.word) + '</td>' +
            '<td>' + Utils.escapeHtml(w.category) + '</td>' +
            '<td>' +
              '<button class="admin-btn-sm mod-toggle-btn" data-id="' + w.id + '" data-active="' + w.is_active + '">' +
              (w.is_active ? 'Активно' : 'Неактивно') +
              '</button>' +
            '</td>' +
            '<td>' + Utils.formatDateShort(w.created_at) + '</td>' +
            '<td>' +
              '<button class="admin-btn-sm admin-btn-danger mod-del-btn" data-id="' + w.id + '">Удалить</button>' +
            '</td>';
          tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        tableWrap.appendChild(table);
      } catch (err) {
        console.error('Admin moderation error:', err);
        tableWrap.innerHTML = '<p class="admin-error">Не удалось загрузить слова</p>';
      }
    }

    // Test
    document.getElementById('mod-test-btn').addEventListener('click', async function () {
      var text = document.getElementById('mod-test-input').value.trim();
      if (!text) return;
      var result = document.getElementById('mod-test-result');
      try {
        var data = await Utils.apiFetch('/api/admin/moderation/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: text }),
        });
        if (data.pass) {
          result.innerHTML = '<span style="color:var(--status-success)">Текст прошел проверку</span>';
        } else {
          result.innerHTML =
            '<span style="color:var(--status-error)">Найдены: ' +
            data.triggered.map(function (w) { return Utils.escapeHtml(w); }).join(', ') +
            '</span>';
        }
      } catch (err) {
        result.textContent = 'Ошибка проверки';
      }
    });

    // Add words
    document.getElementById('mod-add-btn').addEventListener('click', async function () {
      var input = document.getElementById('mod-add-input');
      var raw = input.value.trim();
      if (!raw) return;

      var words = raw.split(',').map(function (w) { return w.trim(); }).filter(Boolean);
      var category = document.getElementById('mod-add-category').value;

      try {
        var data = await Utils.apiFetch('/api/admin/moderation/words', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ words: words, category: category }),
        });
        Toast.show('Добавлено: ' + data.inserted + ', пропущено: ' + data.skipped, 'success');
        input.value = '';
        loadWords();
      } catch (err) {
        Toast.show('Ошибка добавления', 'error');
      }
    });

    // Filter
    document.getElementById('mod-filter-btn').addEventListener('click', loadWords);

    // Search with debounce
    document.getElementById('mod-search').addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(loadWords, 400);
    });

    // Table delegation
    tableWrap.addEventListener('click', async function (e) {
      var toggleBtn = e.target.closest('.mod-toggle-btn');
      var delBtn = e.target.closest('.mod-del-btn');

      if (toggleBtn) {
        var id = toggleBtn.getAttribute('data-id');
        var isActive = toggleBtn.getAttribute('data-active') === 'true';
        try {
          await Utils.apiFetch('/api/admin/moderation/words/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: !isActive }),
          });
          loadWords();
        } catch (err) {
          Toast.show('Ошибка обновления', 'error');
        }
      }

      if (delBtn) {
        var delId = delBtn.getAttribute('data-id');
        if (!confirm('Удалить слово?')) return;
        try {
          await Utils.apiFetch('/api/admin/moderation/words/' + delId, { method: 'DELETE' });
          Toast.show('Удалено', 'success');
          loadWords();
        } catch (err) {
          Toast.show('Ошибка удаления', 'error');
        }
      }
    });

    loadWords();
  },
});
