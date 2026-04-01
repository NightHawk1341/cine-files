/**
 * Users management view
 */

import { escapeHtml, showToast, formatDateShort } from '../utils.js';
import { apiFetch } from '../utils/apiClient.js';
import { createPageHeader, createLoadingSpinner } from '../utils/templates.js';

export async function renderUsersView() {
  const content = document.getElementById('content');
  content.innerHTML = createPageHeader({ title: 'Пользователи', refreshAction: 'refresh-users' });

  const tableWrap = document.createElement('div');
  tableWrap.innerHTML = createLoadingSpinner();
  content.appendChild(tableWrap);

  content.addEventListener('click', function (e) {
    if (e.target.closest('[data-action="refresh-users"]')) {
      renderUsersView();
    }
  });

  const roleLabels = { reader: 'Читатель', editor: 'Редактор', admin: 'Админ' };
  const methodLabels = { yandex: 'Яндекс', vk: 'ВК', telegram: 'Telegram' };

  try {
    const res = await apiFetch('/api/admin/users?limit=100');
    const data = await res.json();
    const users = data.users || [];
    tableWrap.innerHTML = '';

    if (users.length === 0) {
      tableWrap.innerHTML = '<p class="text-secondary">Пользователей нет</p>';
      return;
    }

    const table = document.createElement('table');
    table.className = 'admin-table';
    table.innerHTML =
      '<thead><tr>' +
      '<th>Имя</th><th>Email</th><th>Роль</th><th>Вход через</th><th>Регистрация</th><th>Последний вход</th><th></th>' +
      '</tr></thead>';

    const tbody = document.createElement('tbody');

    users.forEach(function (u) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(u.display_name || '') + '</td>' +
        '<td>' + escapeHtml(u.email || '') + '</td>' +
        '<td><span class="role-badge role-' + u.role + '">' + (roleLabels[u.role] || u.role) + '</span></td>' +
        '<td>' + (methodLabels[u.login_method] || u.login_method || '') + '</td>' +
        '<td>' + formatDateShort(u.created_at) + '</td>' +
        '<td>' + (u.last_login_at ? formatDateShort(u.last_login_at) : '') + '</td>' +
        '<td>' +
        '<select class="form-select" data-user-id="' + u.id + '" style="min-width:120px">' +
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
      const select = e.target.closest('select[data-user-id]');
      if (!select) return;

      const userId = select.getAttribute('data-user-id');
      const newRole = select.value;

      try {
        await apiFetch('/api/admin/users/' + userId + '/role', {
          method: 'PUT',
          body: JSON.stringify({ role: newRole }),
        });
        showToast('Роль обновлена', 'success');
        const badge = select.closest('tr').querySelector('.role-badge');
        if (badge) {
          badge.className = 'role-badge role-' + newRole;
          badge.textContent = roleLabels[newRole] || newRole;
        }
      } catch (err) {
        showToast('Не удалось обновить роль', 'error');
        renderUsersView();
      }
    });
  } catch (err) {
    console.error('Admin users error:', err);
    tableWrap.innerHTML = '<p class="text-secondary">Не удалось загрузить пользователей</p>';
  }
}
