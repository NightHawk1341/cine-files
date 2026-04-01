/**
 * Integrations (partner placements) management view
 */

import { escapeHtml, showToast, showConfirmModal, showModal, hideModal, formatDateShort } from '../utils.js';
import { apiFetch } from '../utils/apiClient.js';
import { createPageHeader, createLoadingSpinner } from '../utils/templates.js';

let tableWrapRef = null;

async function loadList() {
  if (!tableWrapRef) return;
  tableWrapRef.innerHTML = createLoadingSpinner();

  try {
    const res = await apiFetch('/api/integrations?all=1');
    const data = await res.json();
    const items = data.items || [];
    tableWrapRef.innerHTML = '';

    if (items.length === 0) {
      tableWrapRef.innerHTML = '<p class="text-secondary">Интеграций нет</p>';
      return;
    }

    const table = document.createElement('table');
    table.className = 'admin-table';
    table.innerHTML =
      '<thead><tr>' +
      '<th>Название</th><th>Тип</th><th>Размещение</th><th>Активна</th>' +
      '<th>ОРД</th><th>Показы</th><th>Клики</th><th>Период</th><th></th>' +
      '</tr></thead>';

    const tbody = document.createElement('tbody');
    items.forEach(function (item) {
      const tr = document.createElement('tr');
      const startStr = item.start_date ? formatDateShort(item.start_date) : '';
      const endStr = item.end_date ? formatDateShort(item.end_date) : '';
      const maxLabel = item.max_views > 0 ? ' / ' + item.max_views : '';

      let ordBadge = '';
      if (!item.erid) {
        ordBadge = '<span class="text-tertiary">&mdash;</span>';
      } else if (!item.advertiser_name) {
        ordBadge = '<span class="status-badge status-warning" title="Нет рекламодателя">!</span>';
      } else if (item.is_active && !item.ord_reported_at) {
        ordBadge = '<span class="status-badge status-pending" title="Нужен отчёт в ОРД">Отчёт</span>';
      } else {
        ordBadge = '<span class="status-badge status-success" title="Соответствует">ОРД</span>';
      }

      tr.innerHTML =
        '<td>' + escapeHtml(item.title) + '</td>' +
        '<td>' + escapeHtml(item.integration_type || item.promo_type || '') + '</td>' +
        '<td>' + escapeHtml(item.placement) + '</td>' +
        '<td><span class="status-badge status-' + (item.is_active ? 'success' : 'hidden') + '">' +
          (item.is_active ? 'Да' : 'Нет') + '</span></td>' +
        '<td>' + ordBadge + '</td>' +
        '<td>' + Number(item.current_views || 0) + maxLabel + '</td>' +
        '<td>' + Number(item.click_count || 0) + '</td>' +
        '<td>' + (startStr || '') + (startStr || endStr ? ' &mdash; ' : '') + (endStr || '') + '</td>' +
        '<td style="white-space:nowrap">' +
          '<button class="btn btn-secondary btn-sm" data-action="edit-intg" data-id="' + item.id + '">Изменить</button> ' +
          '<button class="btn btn-danger btn-sm" data-action="delete-intg" data-id="' + item.id + '">Удалить</button>' +
        '</td>';
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    tableWrapRef.appendChild(table);
  } catch (err) {
    console.error('Admin integrations error:', err);
    tableWrapRef.innerHTML = '<p class="text-secondary">Не удалось загрузить интеграции</p>';
  }
}

function openIntegrationModal(item) {
  const isEdit = !!item;
  const i = item || {};

  const bodyHTML =
    '<form id="intg-modal-form">' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
      '<div class="form-group">' +
        '<label class="form-label">Название</label>' +
        '<input class="form-input" name="title" required value="' + escapeHtml(i.title || '') + '">' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">Тип</label>' +
        '<select class="form-select" name="integration_type">' +
          '<option value="featured"' + (i.integration_type === 'featured' || i.promo_type === 'featured' ? ' selected' : '') + '>Featured</option>' +
          '<option value="partner"' + (i.integration_type === 'partner' || i.promo_type === 'partner' ? ' selected' : '') + '>Partner</option>' +
          '<option value="html"' + (i.integration_type === 'html' || i.promo_type === 'html' ? ' selected' : '') + '>HTML</option>' +
        '</select>' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">Размещение</label>' +
        '<select class="form-select" name="placement">' +
          '<option value="sidebar"' + (i.placement === 'sidebar' ? ' selected' : '') + '>Сайдбар</option>' +
          '<option value="between"' + (i.placement === 'between' ? ' selected' : '') + '>Между статьями</option>' +
          '<option value="footer"' + (i.placement === 'footer' ? ' selected' : '') + '>Подвал статьи</option>' +
          '<option value="header"' + (i.placement === 'header' ? ' selected' : '') + '>Шапка</option>' +
        '</select>' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">Приоритет</label>' +
        '<input class="form-input" name="priority" type="number" value="' + (i.priority || 0) + '">' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">URL изображения</label>' +
        '<input class="form-input" name="image_url" value="' + escapeHtml(i.image_url || '') + '">' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">URL перехода</label>' +
        '<input class="form-input" name="destination_url" value="' + escapeHtml(i.destination_url || '') + '">' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">Alt текст</label>' +
        '<input class="form-input" name="alt_text" value="' + escapeHtml(i.alt_text || '') + '">' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">Макс. показов (0 = без лимита)</label>' +
        '<input class="form-input" name="max_views" type="number" value="' + (i.max_views || 0) + '">' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">Дата начала</label>' +
        '<input class="form-input" name="start_date" type="datetime-local" value="' + (i.start_date ? i.start_date.slice(0, 16) : '') + '">' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">Дата окончания</label>' +
        '<input class="form-input" name="end_date" type="datetime-local" value="' + (i.end_date ? i.end_date.slice(0, 16) : '') + '">' +
      '</div>' +
    '</div>' +
    '<div class="form-group">' +
      '<label class="form-label">HTML-контент</label>' +
      '<textarea class="form-textarea" name="html_content" rows="4">' + escapeHtml(i.html_content || '') + '</textarea>' +
    '</div>' +
    '<details style="margin-top:12px">' +
      '<summary style="cursor:pointer;font-weight:600;color:var(--text-primary);padding:8px 0">Юридические данные</summary>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding-top:12px">' +
        '<div class="form-group">' +
          '<label class="form-label">ERID</label>' +
          '<input class="form-input" name="erid" placeholder="Токен из ОРД" value="' + escapeHtml(i.erid || '') + '">' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label">Рекламодатель</label>' +
          '<input class="form-input" name="advertiser_name" placeholder="Юр. название" value="' + escapeHtml(i.advertiser_name || '') + '">' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label">Сайт рекламодателя</label>' +
          '<input class="form-input" name="advertiser_url" placeholder="https://" value="' + escapeHtml(i.advertiser_url || '') + '">' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label">Номер договора</label>' +
          '<input class="form-input" name="contract_number" value="' + escapeHtml(i.contract_number || '') + '">' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label">Дата договора</label>' +
          '<input class="form-input" name="contract_date" type="date" value="' + (i.contract_date ? i.contract_date.slice(0, 10) : '') + '">' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label">Сумма (RUB)</label>' +
          '<input class="form-input" name="revenue_amount" type="number" step="0.01" value="' + Number(i.revenue_amount || 0) + '">' +
        '</div>' +
      '</div>' +
    '</details>' +
    '</form>';

  showModal(
    isEdit ? 'Редактировать интеграцию' : 'Новая интеграция',
    bodyHTML,
    [
      { text: 'Отмена', className: 'btn btn-secondary', onClick: () => hideModal() },
      {
        text: 'Сохранить',
        className: 'btn btn-primary',
        onClick: async () => {
          const form = document.getElementById('intg-modal-form');
          const payload = {
            title: form.title.value.trim(),
            integration_type: form.integration_type.value,
            placement: form.placement.value,
            priority: Number(form.priority.value) || 0,
            image_url: form.image_url.value.trim() || null,
            destination_url: form.destination_url.value.trim() || null,
            alt_text: form.alt_text.value.trim() || null,
            max_views: Number(form.max_views.value) || 0,
            start_date: form.start_date.value || null,
            end_date: form.end_date.value || null,
            html_content: form.html_content.value.trim() || null,
            erid: form.erid.value.trim() || null,
            advertiser_name: form.advertiser_name.value.trim() || null,
            advertiser_url: form.advertiser_url.value.trim() || null,
            contract_number: form.contract_number.value.trim() || null,
            contract_date: form.contract_date.value || null,
            revenue_amount: Number(form.revenue_amount.value) || 0,
          };

          if (!payload.title) {
            showToast('Введите название', 'warning');
            return;
          }

          try {
            if (isEdit) {
              await apiFetch('/api/integrations/' + i.id, {
                method: 'PUT',
                body: JSON.stringify(payload),
              });
              showToast('Интеграция обновлена', 'success');
            } else {
              await apiFetch('/api/integrations', {
                method: 'POST',
                body: JSON.stringify(payload),
              });
              showToast('Интеграция создана', 'success');
            }
            hideModal();
            loadList();
          } catch (err) {
            showToast('Ошибка сохранения', 'error');
          }
        }
      }
    ]
  );
}

export async function renderIntegrationsView() {
  const content = document.getElementById('content');
  content.innerHTML = createPageHeader({
    title: 'Интеграции',
    refreshAction: 'refresh-integrations',
    extraButtons: '<button class="btn btn-primary btn-sm" data-action="new-intg">Добавить</button>'
  });

  const tableWrap = document.createElement('div');
  tableWrapRef = tableWrap;
  content.appendChild(tableWrap);

  content.addEventListener('click', async function (e) {
    if (e.target.closest('[data-action="refresh-integrations"]')) {
      renderIntegrationsView();
      return;
    }
    if (e.target.closest('[data-action="new-intg"]')) {
      openIntegrationModal(null);
      return;
    }

    const editBtn = e.target.closest('[data-action="edit-intg"]');
    if (editBtn) {
      const id = editBtn.getAttribute('data-id');
      try {
        const res = await apiFetch('/api/integrations/' + id);
        const data = await res.json();
        openIntegrationModal(data);
      } catch (err) {
        showToast('Не удалось загрузить', 'error');
      }
      return;
    }

    const delBtn = e.target.closest('[data-action="delete-intg"]');
    if (delBtn) {
      const confirmed = await showConfirmModal('Удалить интеграцию?');
      if (!confirmed) return;
      const id = delBtn.getAttribute('data-id');
      try {
        await apiFetch('/api/integrations/' + id, { method: 'DELETE' });
        showToast('Удалено', 'success');
        loadList();
      } catch (err) {
        showToast('Не удалось удалить', 'error');
      }
    }
  });

  await loadList();
}
