/**
 * Admin article editor — create/edit articles with block editor.
 * Routes: /admin/articles/new, /admin/articles/:id
 */

Router.registerPage('/admin/articles/new', {
  styles: ['/css/admin.css'],
  init: function () { return initEditor(null); },
});

Router.registerPage('/admin/articles/:id', {
  styles: ['/css/admin.css'],
  init: function (params) { return initEditor(params.id); },
});

async function initEditor(articleId) {
  var content = document.getElementById('page-content');
  content.innerHTML = '';

  var container = document.createElement('div');
  container.className = 'container page-content admin-page';

  var h1 = document.createElement('h1');
  h1.className = 'admin-title';
  h1.textContent = articleId ? 'Редактировать статью' : 'Новая статья';
  container.appendChild(h1);

  // Form
  var form = document.createElement('form');
  form.className = 'admin-form';

  form.innerHTML =
    '<div class="admin-form-group">' +
    '<label class="admin-label">Заголовок</label>' +
    '<input type="text" id="editor-title" class="admin-input" placeholder="Заголовок статьи" required>' +
    '</div>' +
    '<div class="admin-form-group">' +
    '<label class="admin-label">Подзаголовок</label>' +
    '<input type="text" id="editor-subtitle" class="admin-input" placeholder="Подзаголовок (необязательно)">' +
    '</div>' +
    '<div class="admin-form-group">' +
    '<label class="admin-label">Лид</label>' +
    '<textarea id="editor-lead" class="admin-textarea" rows="3" placeholder="Краткое описание..."></textarea>' +
    '</div>' +
    '<div class="admin-form-group">' +
    '<label class="admin-label">Категория</label>' +
    '<select id="editor-category" class="admin-select" required>' +
    '<option value="">Выберите категорию</option>' +
    '</select>' +
    '</div>' +
    '<div class="admin-form-group">' +
    '<label class="admin-label">URL обложки</label>' +
    '<input type="text" id="editor-cover" class="admin-input" placeholder="https://...">' +
    '</div>' +
    '<div class="admin-form-group">' +
    '<label class="admin-label">Содержимое (JSON блоки)</label>' +
    '<textarea id="editor-content" class="admin-textarea admin-textarea-lg" rows="15" placeholder=\'[{"type":"paragraph","text":"..."}]\'></textarea>' +
    '</div>' +
    '<div class="admin-form-actions">' +
    '<button type="submit" class="admin-btn-primary">Сохранить</button>' +
    '<button type="button" id="editor-publish" class="admin-btn-secondary">Опубликовать</button>' +
    '</div>';

  container.appendChild(form);
  content.appendChild(container);

  // Load categories
  try {
    var catData = await Utils.apiFetch('/api/categories');
    var select = document.getElementById('editor-category');
    (catData.categories || []).forEach(function (cat) {
      var opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name_ru;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to load categories:', err);
  }

  // Load existing article if editing
  if (articleId) {
    try {
      var article = await Utils.apiFetch('/api/articles/' + articleId);
      document.getElementById('editor-title').value = article.title || '';
      document.getElementById('editor-subtitle').value = article.subtitle || '';
      document.getElementById('editor-lead').value = article.lead || '';
      document.getElementById('editor-category').value = article.category_id || '';
      document.getElementById('editor-cover').value = article.cover_image_url || '';
      document.getElementById('editor-content').value = JSON.stringify(article.content_blocks || [], null, 2);
    } catch (err) {
      console.error('Failed to load article:', err);
      Toast.show('Не удалось загрузить статью', 'error');
    }
  }

  // Save handler
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    await saveArticle(articleId, 'draft');
  });

  // Publish handler
  document.getElementById('editor-publish').addEventListener('click', async function () {
    await saveArticle(articleId, 'published');
  });

  document.title = (articleId ? 'Редактировать статью' : 'Новая статья') + ' — CineFiles';
}

async function saveArticle(articleId, status) {
  var body = {
    title: document.getElementById('editor-title').value.trim(),
    subtitle: document.getElementById('editor-subtitle').value.trim() || null,
    lead: document.getElementById('editor-lead').value.trim() || null,
    category_id: Number(document.getElementById('editor-category').value),
    cover_image_url: document.getElementById('editor-cover').value.trim() || null,
    status: status,
  };

  var contentStr = document.getElementById('editor-content').value.trim();
  if (contentStr) {
    try {
      body.content_blocks = JSON.parse(contentStr);
    } catch (err) {
      Toast.show('Некорректный JSON в содержимом', 'error');
      return;
    }
  }

  try {
    if (articleId) {
      await Utils.apiFetch('/api/articles/' + articleId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      Toast.show('Статья сохранена', 'success');
    } else {
      var result = await Utils.apiFetch('/api/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      Toast.show('Статья создана', 'success');
      Router.navigate('/admin/articles/' + result.id);
    }
  } catch (err) {
    console.error('Save error:', err);
    Toast.show('Не удалось сохранить статью', 'error');
  }
}
