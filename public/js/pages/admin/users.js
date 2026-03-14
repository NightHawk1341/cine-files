/**
 * Admin users management.
 * Route: /admin/users
 */

Router.registerPage('/admin/users', {
  styles: ['/css/admin.css'],

  async init() {
    var content = document.getElementById('page-content');
    content.innerHTML = '';

    var container = document.createElement('div');
    container.className = 'container page-content admin-page';

    var h1 = document.createElement('h1');
    h1.className = 'admin-title';
    h1.textContent = 'Пользователи';
    container.appendChild(h1);

    var tableWrap = document.createElement('div');
    tableWrap.className = 'admin-table-wrap';
    tableWrap.innerHTML = '<div class="skeleton" style="height:400px"></div>';
    container.appendChild(tableWrap);

    content.appendChild(container);

    try {
      var data = await Utils.apiFetch('/api/admin/users?limit=100');
      var users = data.users || [];
      tableWrap.innerHTML = '';

      if (users.length === 0) {
        tableWrap.innerHTML = '<p class="admin-empty">Пользователей нет</p>';
        return;
      }

      var table = document.createElement('table');
      table.className = 'admin-table';
      table.innerHTML =
        '<thead><tr>' +
        '<th>Имя</th><th>Email</th><th>Роль</th><th>Вход через</th><th>Регистрация</th><th>Последний вход</th><th></th>' +
        '</tr></thead>';

      var tbody = document.createElement('tbody');
      var roleLabels = { reader: 'Читатель', editor: 'Редактор', admin: 'Админ' };
      var methodLabels = { yandex: 'Яндекс', vk: 'ВК', telegram: 'Telegram' };

      users.forEach(function (u) {
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' + Utils.escapeHtml(u.display_name || '—') + '</td>' +
          '<td>' + Utils.escapeHtml(u.email || '—') + '</td>' +
          '<td><span class="admin-status admin-status-' + u.role + '">' + (roleLabels[u.role] || u.role) + '</span></td>' +
          '<td>' + (methodLabels[u.login_method] || u.login_method) + '</td>' +
          '<td>' + Utils.formatDateShort(u.created_at) + '</td>' +
          '<td>' + (u.last_login_at ? Utils.formatDateShort(u.last_login_at) : '—') + '</td>' +
          '<td>' +
          '<select class="admin-role-select" data-user-id="' + u.id + '">' +
          '<option value="reader"' + (u.role === 'reader' ? ' selected' : '') + '>Читатель</option>' +
          '<option value="editor"' + (u.role === 'editor' ? ' selected' : '') + '>Редактор</option>' +
          '<option value="admin"' + (u.role === 'admin' ? ' selected' : '') + '>Админ</option>' +
          '</select>' +
          '</td>';
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      tableWrap.appendChild(table);

      // Role change handler
      tableWrap.addEventListener('change', async function (e) {
        var select = e.target.closest('.admin-role-select');
        if (!select) return;

        var userId = select.getAttribute('data-user-id');
        var newRole = select.value;

        try {
          await Utils.apiFetch('/api/admin/users/' + userId + '/role', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: newRole }),
          });
          Toast.show('Роль обновлена', 'success');
          // Update the badge
          var badge = select.closest('tr').querySelector('.admin-status');
          if (badge) {
            badge.className = 'admin-status admin-status-' + newRole;
            badge.textContent = roleLabels[newRole] || newRole;
          }
        } catch (err) {
          Toast.show(err.data && err.data.error ? err.data.error : 'Не удалось обновить роль', 'error');
          // Revert select — reload page to get correct state
          Router.navigate('/admin/users');
        }
      });
    } catch (err) {
      console.error('Admin users error:', err);
      tableWrap.innerHTML = '<p class="admin-error">Не удалось загрузить пользователей</p>';
    }

    document.title = 'Пользователи — Админ — CineFiles';
  },
});
