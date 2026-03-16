/**
 * Article Editor Modal — full-screen modal for creating/editing articles.
 * Opens from header "new article" button, edit buttons on articles, profile page.
 * Block-based editor with context menus, bottom toolbar, auto-save.
 */

var ArticleEditorModal = (function () {
  var overlay = null;
  var article = null;
  var blocks = [];
  var isDirty = false;
  var autoSaveTimer = null;
  var categories = [];

  /**
   * Open editor for new article or existing article ID.
   * @param {number|null} articleId
   */
  async function open(articleId) {
    if (overlay) close();

    article = null;
    blocks = [];
    isDirty = false;

    // Load categories
    try {
      var catData = await Utils.apiFetch('/api/categories');
      categories = catData.categories || [];
    } catch (err) {
      categories = [];
    }

    // Load article if editing
    if (articleId) {
      try {
        article = await Utils.apiFetch('/api/articles/' + articleId);
        blocks = article.content_blocks || [];
      } catch (err) {
        Toast.show('Не удалось загрузить статью', 'error');
        return;
      }
    }

    if (blocks.length === 0) {
      blocks = [{ type: 'paragraph', text: '' }];
    }

    createModal();
    renderBlocks();
    startAutoSave();

    document.body.classList.add('modal-open');
  }

  function close() {
    stopAutoSave();
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    overlay = null;
    document.body.classList.remove('modal-open');
  }

  // ============================================================
  // Modal structure
  // ============================================================

  function createModal() {
    overlay = document.createElement('div');
    overlay.className = 'editor-modal';

    var catOptions = '<option value="">Без темы</option>';
    categories.forEach(function (cat) {
      var selected = article && Number(article.category_id) === cat.id ? ' selected' : '';
      catOptions += '<option value="' + cat.id + '"' + selected + '>' + Utils.escapeHtml(cat.name_ru) + '</option>';
    });

    overlay.innerHTML =
      '<div class="editor-modal-content">' +
        // Top bar
        '<div class="editor-topbar">' +
          '<div class="editor-topbar-left">' +
            '<button class="editor-close-btn" id="editor-close" aria-label="Закрыть">' +
              '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>' +
            '</button>' +
            '<div class="editor-author-info" id="editor-author-info"></div>' +
          '</div>' +
          '<div class="editor-topbar-right">' +
            '<select class="editor-category-select" id="editor-category">' + catOptions + '</select>' +
          '</div>' +
        '</div>' +
        // Content area
        '<div class="editor-body" id="editor-body">' +
          '<input class="editor-title-input" id="editor-title" type="text" placeholder="Заголовок" value="' + Utils.escapeHtml((article && article.title) || '') + '">' +
          '<input class="editor-subtitle-input" id="editor-subtitle" type="text" placeholder="Подзаголовок (необязательно)" value="' + Utils.escapeHtml((article && article.subtitle) || '') + '">' +
          '<div class="editor-blocks" id="editor-blocks"></div>' +
        '</div>' +
        // Bottom toolbar
        '<div class="editor-toolbar">' +
          '<button class="editor-toolbar-publish" id="editor-publish">' +
            (article && article.status === 'published' ? 'Обновить' : 'Опубликовать') +
          '</button>' +
          '<button class="editor-toolbar-btn" id="editor-save-draft" title="Сохранить черновик">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>' +
          '</button>' +
          '<button class="editor-toolbar-btn" id="editor-overflow" title="Ещё">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="1.5"/><circle cx="6" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/></svg>' +
          '</button>' +
          '<span class="editor-save-status" id="editor-save-status"></span>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    // Set author info
    Auth.getUser().then(function (user) {
      var authorEl = document.getElementById('editor-author-info');
      if (authorEl && user) {
        var avatar = user.avatar_url
          ? '<img src="' + Utils.escapeHtml(user.avatar_url) + '" class="editor-author-avatar">'
          : '<div class="editor-author-avatar editor-author-avatar--fallback">' + (user.display_name || '?')[0].toUpperCase() + '</div>';
        authorEl.innerHTML = avatar + '<span class="editor-author-name">' + Utils.escapeHtml(user.display_name || '') + '</span>';
      }
    });

    // Event listeners
    document.getElementById('editor-close').addEventListener('click', function () {
      if (isDirty && !confirm('Закрыть без сохранения?')) return;
      close();
    });

    document.getElementById('editor-publish').addEventListener('click', function () {
      save('published');
    });

    document.getElementById('editor-save-draft').addEventListener('click', function () {
      save('draft');
    });

    document.getElementById('editor-overflow').addEventListener('click', function (e) {
      showOverflowMenu(e.currentTarget);
    });

    // Mark dirty on changes
    document.getElementById('editor-title').addEventListener('input', function () { isDirty = true; });
    document.getElementById('editor-subtitle').addEventListener('input', function () { isDirty = true; });
    document.getElementById('editor-category').addEventListener('change', function () { isDirty = true; });
  }

  // ============================================================
  // Block rendering
  // ============================================================

  function renderBlocks() {
    var container = document.getElementById('editor-blocks');
    if (!container) return;
    container.innerHTML = '';

    blocks.forEach(function (block, index) {
      var el = renderBlockEditor(block, index);
      container.appendChild(el);
    });

    // Add block button at end
    var addBtn = document.createElement('button');
    addBtn.className = 'editor-add-block';
    addBtn.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
      '<span>Добавить блок</span>';
    addBtn.addEventListener('click', function () {
      showBlockTypePicker(blocks.length);
    });
    container.appendChild(addBtn);
  }

  function renderBlockEditor(block, index) {
    var wrapper = document.createElement('div');
    wrapper.className = 'editor-block';
    wrapper.setAttribute('data-index', index);
    wrapper.setAttribute('draggable', 'true');

    // Drag handle + context menu trigger
    var handle = document.createElement('button');
    handle.className = 'editor-block-handle';
    handle.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>';
    handle.addEventListener('click', function (e) {
      showBlockContextMenu(e.currentTarget, index);
    });

    var content = document.createElement('div');
    content.className = 'editor-block-content';

    switch (block.type) {
      case 'paragraph':
        content.innerHTML = '<div class="editor-block-text" contenteditable="true" data-placeholder="Текст...">' + Utils.sanitizeInlineHtml(block.text || '') + '</div>';
        break;
      case 'heading':
        var lvl = block.level || 2;
        content.innerHTML = '<div class="editor-block-heading editor-block-heading--' + lvl + '" contenteditable="true" data-placeholder="Заголовок">' + Utils.escapeHtml(block.text || '') + '</div>';
        break;
      case 'image':
        content.innerHTML =
          '<div class="editor-image-block">' +
            '<input class="editor-input" type="text" placeholder="URL изображения" value="' + Utils.escapeHtml(block.url || '') + '" data-field="url">' +
            (block.url ? '<img src="' + Utils.escapeHtml(block.url) + '" class="editor-image-preview">' : '') +
            '<input class="editor-input editor-input-sm" type="text" placeholder="Alt текст" value="' + Utils.escapeHtml(block.alt || '') + '" data-field="alt">' +
            '<input class="editor-input editor-input-sm" type="text" placeholder="Подпись" value="' + Utils.escapeHtml(block.caption || '') + '" data-field="caption">' +
            '<input class="editor-input editor-input-sm" type="text" placeholder="Источник" value="' + Utils.escapeHtml(block.credit || '') + '" data-field="credit">' +
          '</div>';
        break;
      case 'quote':
        content.innerHTML =
          '<div class="editor-quote-block">' +
            '<textarea class="editor-textarea" placeholder="Цитата..." data-field="text">' + Utils.escapeHtml(block.text || '') + '</textarea>' +
            '<input class="editor-input editor-input-sm" type="text" placeholder="Автор" value="' + Utils.escapeHtml(block.author || '') + '" data-field="author">' +
          '</div>';
        break;
      case 'list':
        var items = block.items || [''];
        var listHtml = '<div class="editor-list-block" data-style="' + (block.style || 'unordered') + '">' +
          '<div class="editor-list-toggle">' +
            '<button class="editor-list-style-btn' + (block.style !== 'ordered' ? ' active' : '') + '" data-style="unordered">UL</button>' +
            '<button class="editor-list-style-btn' + (block.style === 'ordered' ? ' active' : '') + '" data-style="ordered">OL</button>' +
          '</div>' +
          '<div class="editor-list-items">';
        items.forEach(function (item, i) {
          listHtml += '<div class="editor-list-item"><input class="editor-input" type="text" value="' + Utils.escapeHtml(item) + '" data-item-index="' + i + '" placeholder="Элемент списка"><button class="editor-list-remove" data-item-index="' + i + '">&times;</button></div>';
        });
        listHtml += '</div><button class="editor-list-add">+ элемент</button></div>';
        content.innerHTML = listHtml;
        break;
      case 'embed':
        content.innerHTML =
          '<div class="editor-embed-block">' +
            '<input class="editor-input" type="text" placeholder="URL видео (YouTube, VK, RuTube)" value="' + Utils.escapeHtml(block.videoId || '') + '" data-field="videoId">' +
            '<span class="editor-embed-provider">' + Utils.escapeHtml(block.provider || '') + '</span>' +
          '</div>';
        break;
      case 'divider':
        content.innerHTML = '<hr class="editor-divider-preview">';
        break;
      case 'spoiler':
        content.innerHTML =
          '<div class="editor-spoiler-block">' +
            '<input class="editor-input" type="text" placeholder="Заголовок спойлера" value="' + Utils.escapeHtml(block.title || '') + '" data-field="title">' +
            '<textarea class="editor-textarea" placeholder="Скрытый текст..." data-field="content">' + Utils.escapeHtml(getSpoilerText(block)) + '</textarea>' +
          '</div>';
        break;
      case 'infobox':
        content.innerHTML =
          '<div class="editor-infobox-block">' +
            '<select class="editor-select" data-field="variant">' +
              '<option value="info"' + (block.variant === 'info' || !block.variant ? ' selected' : '') + '>Инфо</option>' +
              '<option value="warning"' + (block.variant === 'warning' ? ' selected' : '') + '>Внимание</option>' +
              '<option value="tip"' + (block.variant === 'tip' ? ' selected' : '') + '>Совет</option>' +
              '<option value="error"' + (block.variant === 'error' ? ' selected' : '') + '>Ошибка</option>' +
            '</select>' +
            '<input class="editor-input" type="text" placeholder="Заголовок" value="' + Utils.escapeHtml(block.title || '') + '" data-field="title">' +
            '<textarea class="editor-textarea" placeholder="Содержимое..." data-field="content">' + Utils.escapeHtml(getInfoboxText(block)) + '</textarea>' +
          '</div>';
        break;
      case 'movie_card':
        content.innerHTML =
          '<div class="editor-movie-block">' +
            '<input class="editor-input" type="text" placeholder="Поиск фильма/сериала в TMDB..." data-field="tmdbSearch">' +
            '<input class="editor-input editor-input-sm" type="number" placeholder="TMDB Entity ID" value="' + (block.tmdbEntityId || '') + '" data-field="tmdbEntityId">' +
          '</div>';
        break;
      case 'tribute_products':
        content.innerHTML =
          '<div class="editor-tribute-block">' +
            '<input class="editor-input" type="text" placeholder="ID товаров через запятую" value="' + (block.productIds || []).join(', ') + '" data-field="productIds">' +
          '</div>';
        break;
      case 'gallery':
        content.innerHTML =
          '<div class="editor-gallery-block">' +
            '<textarea class="editor-textarea" placeholder="URL изображений (по одному на строку)" data-field="urls">' + ((block.images || []).map(function (img) { return img.url || ''; }).join('\n')) + '</textarea>' +
          '</div>';
        break;
      case 'rating':
        content.innerHTML =
          '<div class="editor-rating-block">' +
            '<input class="editor-input editor-input-sm" type="number" min="1" max="10" placeholder="Оценка (1-10)" value="' + (block.score || '') + '" data-field="score">' +
            '<input class="editor-input editor-input-sm" type="text" placeholder="Подпись" value="' + Utils.escapeHtml(block.label || '') + '" data-field="label">' +
          '</div>';
        break;
      case 'table':
        content.innerHTML =
          '<div class="editor-table-block">' +
            '<textarea class="editor-textarea" placeholder="Таблица: строки через перенос, ячейки через | (первая строка — заголовок)" data-field="tableData">' + Utils.escapeHtml(tableToText(block)) + '</textarea>' +
          '</div>';
        break;
      case 'code':
        content.innerHTML =
          '<div class="editor-code-block">' +
            '<input class="editor-input editor-input-sm" type="text" placeholder="Язык" value="' + Utils.escapeHtml(block.language || '') + '" data-field="language">' +
            '<textarea class="editor-textarea editor-textarea-mono" placeholder="Код..." data-field="code">' + Utils.escapeHtml(block.code || '') + '</textarea>' +
          '</div>';
        break;
      case 'audio':
        content.innerHTML =
          '<div class="editor-audio-block">' +
            '<input class="editor-input" type="text" placeholder="URL аудио" value="' + Utils.escapeHtml(block.url || '') + '" data-field="url">' +
            '<input class="editor-input editor-input-sm" type="text" placeholder="Подпись" value="' + Utils.escapeHtml(block.caption || '') + '" data-field="caption">' +
          '</div>';
        break;
      case 'comparison':
        content.innerHTML =
          '<div class="editor-comparison-block">' +
            '<input class="editor-input" type="text" placeholder="Левая сторона (URL или текст)" value="' + Utils.escapeHtml(block.left || '') + '" data-field="left">' +
            '<input class="editor-input" type="text" placeholder="Правая сторона (URL или текст)" value="' + Utils.escapeHtml(block.right || '') + '" data-field="right">' +
            '<input class="editor-input editor-input-sm" type="text" placeholder="Подпись слева" value="' + Utils.escapeHtml(block.leftLabel || '') + '" data-field="leftLabel">' +
            '<input class="editor-input editor-input-sm" type="text" placeholder="Подпись справа" value="' + Utils.escapeHtml(block.rightLabel || '') + '" data-field="rightLabel">' +
          '</div>';
        break;
      default:
        content.innerHTML = '<p class="editor-block-unknown">Неизвестный блок: ' + Utils.escapeHtml(block.type) + '</p>';
    }

    wrapper.appendChild(handle);
    wrapper.appendChild(content);

    // Mark dirty on any input
    content.addEventListener('input', function () { isDirty = true; });
    content.addEventListener('change', function () { isDirty = true; });

    // List block interactions
    if (block.type === 'list') {
      setupListBlock(content, index);
    }

    // Drag events
    wrapper.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('text/plain', String(index));
      wrapper.classList.add('editor-block--dragging');
    });
    wrapper.addEventListener('dragend', function () {
      wrapper.classList.remove('editor-block--dragging');
    });
    wrapper.addEventListener('dragover', function (e) {
      e.preventDefault();
      wrapper.classList.add('editor-block--dragover');
    });
    wrapper.addEventListener('dragleave', function () {
      wrapper.classList.remove('editor-block--dragover');
    });
    wrapper.addEventListener('drop', function (e) {
      e.preventDefault();
      wrapper.classList.remove('editor-block--dragover');
      var fromIndex = Number(e.dataTransfer.getData('text/plain'));
      var toIndex = index;
      if (fromIndex !== toIndex) {
        moveBlock(fromIndex, toIndex);
      }
    });

    return wrapper;
  }

  function setupListBlock(content, blockIndex) {
    content.addEventListener('click', function (e) {
      var styleBtn = e.target.closest('.editor-list-style-btn');
      if (styleBtn) {
        blocks[blockIndex].style = styleBtn.getAttribute('data-style');
        isDirty = true;
        renderBlocks();
        return;
      }
      var removeBtn = e.target.closest('.editor-list-remove');
      if (removeBtn) {
        var itemIdx = Number(removeBtn.getAttribute('data-item-index'));
        blocks[blockIndex].items.splice(itemIdx, 1);
        if (blocks[blockIndex].items.length === 0) blocks[blockIndex].items = [''];
        isDirty = true;
        renderBlocks();
        return;
      }
      var addBtn = e.target.closest('.editor-list-add');
      if (addBtn) {
        blocks[blockIndex].items.push('');
        isDirty = true;
        renderBlocks();
      }
    });
  }

  // ============================================================
  // Block context menu
  // ============================================================

  function showBlockContextMenu(anchor, index) {
    closeAllMenus();
    var block = blocks[index];
    var menu = document.createElement('div');
    menu.className = 'editor-context-menu';

    var items = [];

    if (block.type === 'paragraph') {
      items.push({ label: 'H2 Сделать H2', action: function () { convertBlock(index, 'heading', 2); } });
      items.push({ label: 'H3 Сделать H3', action: function () { convertBlock(index, 'heading', 3); } });
    }
    if (block.type === 'heading') {
      items.push({ label: 'Сделать текст', action: function () { convertBlock(index, 'paragraph'); } });
    }

    items.push({ label: 'Переместить вверх', action: function () { moveBlock(index, index - 1); }, disabled: index === 0 });
    items.push({ label: 'Переместить вниз', action: function () { moveBlock(index, index + 1); }, disabled: index >= blocks.length - 1 });
    items.push({ label: 'Дублировать', action: function () { duplicateBlock(index); } });
    items.push({ label: 'Удалить блок', action: function () { deleteBlock(index); }, danger: true });

    items.forEach(function (item) {
      var btn = document.createElement('button');
      btn.className = 'editor-context-item' + (item.danger ? ' editor-context-item--danger' : '');
      btn.textContent = item.label;
      btn.disabled = item.disabled || false;
      btn.addEventListener('click', function () {
        closeAllMenus();
        item.action();
      });
      menu.appendChild(btn);
    });

    anchor.parentNode.appendChild(menu);

    // Position relative to handle
    var rect = anchor.getBoundingClientRect();
    menu.style.top = (anchor.offsetTop + anchor.offsetHeight + 4) + 'px';
    menu.style.left = anchor.offsetLeft + 'px';

    // Close on outside click
    setTimeout(function () {
      document.addEventListener('click', closeAllMenus, { once: true });
    }, 0);
  }

  // ============================================================
  // Block type picker
  // ============================================================

  function showBlockTypePicker(insertAtIndex) {
    closeAllMenus();

    var picker = document.createElement('div');
    picker.className = 'editor-block-picker';

    var types = [
      { type: 'paragraph', label: 'Текст' },
      { type: 'heading', label: 'Заголовок' },
      { type: 'image', label: 'Изображение' },
      { type: 'gallery', label: 'Галерея' },
      { type: 'quote', label: 'Цитата' },
      { type: 'list', label: 'Список' },
      { type: 'embed', label: 'Видео' },
      { type: 'divider', label: 'Разделитель' },
      { type: 'spoiler', label: 'Спойлер' },
      { type: 'infobox', label: 'Инфоблок' },
      { type: 'movie_card', label: 'Карточка фильма' },
      { type: 'tribute_products', label: 'TR-BUTE товары' },
      { type: 'comparison', label: 'Сравнение' },
      { type: 'rating', label: 'Оценка' },
      { type: 'table', label: 'Таблица' },
      { type: 'code', label: 'Код' },
      { type: 'audio', label: 'Аудио' },
    ];

    types.forEach(function (t) {
      var btn = document.createElement('button');
      btn.className = 'editor-block-picker-item';
      btn.textContent = t.label;
      btn.addEventListener('click', function () {
        closeAllMenus();
        insertBlock(insertAtIndex, createEmptyBlock(t.type));
      });
      picker.appendChild(btn);
    });

    var addBtn = document.querySelector('.editor-add-block');
    if (addBtn) {
      addBtn.parentNode.insertBefore(picker, addBtn);
    }

    setTimeout(function () {
      document.addEventListener('click', closeAllMenus, { once: true });
    }, 0);
  }

  function createEmptyBlock(type) {
    switch (type) {
      case 'paragraph': return { type: 'paragraph', text: '' };
      case 'heading': return { type: 'heading', level: 2, text: '' };
      case 'image': return { type: 'image', url: '', alt: '', caption: '', credit: '' };
      case 'gallery': return { type: 'gallery', images: [] };
      case 'quote': return { type: 'quote', text: '', author: '' };
      case 'list': return { type: 'list', style: 'unordered', items: [''] };
      case 'embed': return { type: 'embed', provider: '', videoId: '' };
      case 'divider': return { type: 'divider' };
      case 'spoiler': return { type: 'spoiler', title: '', blocks: [{ type: 'paragraph', text: '' }] };
      case 'infobox': return { type: 'infobox', variant: 'info', title: '', blocks: [{ type: 'paragraph', text: '' }] };
      case 'movie_card': return { type: 'movie_card', tmdbEntityId: null };
      case 'tribute_products': return { type: 'tribute_products', productIds: [] };
      case 'comparison': return { type: 'comparison', left: '', right: '', leftLabel: '', rightLabel: '' };
      case 'rating': return { type: 'rating', score: null, label: '' };
      case 'table': return { type: 'table', headers: [], rows: [] };
      case 'code': return { type: 'code', language: '', code: '' };
      case 'audio': return { type: 'audio', url: '', caption: '' };
      default: return { type: type };
    }
  }

  // ============================================================
  // Block operations
  // ============================================================

  function insertBlock(atIndex, block) {
    blocks.splice(atIndex, 0, block);
    isDirty = true;
    renderBlocks();
  }

  function deleteBlock(index) {
    if (blocks.length <= 1) {
      blocks[0] = { type: 'paragraph', text: '' };
    } else {
      blocks.splice(index, 1);
    }
    isDirty = true;
    renderBlocks();
  }

  function duplicateBlock(index) {
    var copy = JSON.parse(JSON.stringify(blocks[index]));
    blocks.splice(index + 1, 0, copy);
    isDirty = true;
    renderBlocks();
  }

  function moveBlock(from, to) {
    if (to < 0 || to >= blocks.length) return;
    var block = blocks.splice(from, 1)[0];
    blocks.splice(to, 0, block);
    isDirty = true;
    renderBlocks();
  }

  function convertBlock(index, newType, level) {
    var block = blocks[index];
    var text = block.text || '';
    if (newType === 'heading') {
      blocks[index] = { type: 'heading', level: level || 2, text: text };
    } else {
      blocks[index] = { type: 'paragraph', text: text };
    }
    isDirty = true;
    renderBlocks();
  }

  // ============================================================
  // Collect block data from DOM
  // ============================================================

  function collectBlocks() {
    var container = document.getElementById('editor-blocks');
    if (!container) return blocks;

    var blockEls = container.querySelectorAll('.editor-block');
    blockEls.forEach(function (el, i) {
      if (i >= blocks.length) return;
      var block = blocks[i];

      switch (block.type) {
        case 'paragraph': {
          var textEl = el.querySelector('.editor-block-text');
          if (textEl) block.text = textEl.innerHTML;
          break;
        }
        case 'heading': {
          var headingEl = el.querySelector('[contenteditable]');
          if (headingEl) block.text = headingEl.textContent;
          break;
        }
        case 'image': {
          block.url = getFieldValue(el, 'url');
          block.alt = getFieldValue(el, 'alt');
          block.caption = getFieldValue(el, 'caption');
          block.credit = getFieldValue(el, 'credit');
          break;
        }
        case 'quote': {
          block.text = getFieldValue(el, 'text');
          block.author = getFieldValue(el, 'author');
          break;
        }
        case 'list': {
          var inputs = el.querySelectorAll('[data-item-index]');
          block.items = [];
          inputs.forEach(function (input) {
            if (input.tagName === 'INPUT') block.items.push(input.value);
          });
          break;
        }
        case 'embed': {
          block.videoId = getFieldValue(el, 'videoId');
          block.provider = detectProvider(block.videoId);
          break;
        }
        case 'spoiler': {
          block.title = getFieldValue(el, 'title');
          var spoilerText = getFieldValue(el, 'content');
          block.blocks = [{ type: 'paragraph', text: spoilerText }];
          break;
        }
        case 'infobox': {
          block.variant = getFieldValue(el, 'variant');
          block.title = getFieldValue(el, 'title');
          var infoText = getFieldValue(el, 'content');
          block.blocks = [{ type: 'paragraph', text: infoText }];
          break;
        }
        case 'movie_card': {
          var tmdbVal = getFieldValue(el, 'tmdbEntityId');
          block.tmdbEntityId = tmdbVal ? Number(tmdbVal) : null;
          break;
        }
        case 'tribute_products': {
          var idsStr = getFieldValue(el, 'productIds');
          block.productIds = idsStr ? idsStr.split(',').map(function (s) { return Number(s.trim()); }).filter(Boolean) : [];
          break;
        }
        case 'gallery': {
          var urls = getFieldValue(el, 'urls');
          block.images = urls ? urls.split('\n').filter(Boolean).map(function (u) { return { url: u.trim() }; }) : [];
          break;
        }
        case 'rating': {
          var score = getFieldValue(el, 'score');
          block.score = score ? Number(score) : null;
          block.label = getFieldValue(el, 'label');
          break;
        }
        case 'table': {
          var tableText = getFieldValue(el, 'tableData');
          var parsed = parseTableText(tableText);
          block.headers = parsed.headers;
          block.rows = parsed.rows;
          break;
        }
        case 'code': {
          block.language = getFieldValue(el, 'language');
          block.code = getFieldValue(el, 'code');
          break;
        }
        case 'audio': {
          block.url = getFieldValue(el, 'url');
          block.caption = getFieldValue(el, 'caption');
          break;
        }
        case 'comparison': {
          block.left = getFieldValue(el, 'left');
          block.right = getFieldValue(el, 'right');
          block.leftLabel = getFieldValue(el, 'leftLabel');
          block.rightLabel = getFieldValue(el, 'rightLabel');
          break;
        }
      }
    });

    return blocks;
  }

  function getFieldValue(el, field) {
    var input = el.querySelector('[data-field="' + field + '"]');
    if (!input) return '';
    return input.value !== undefined ? input.value : input.textContent;
  }

  // ============================================================
  // Save
  // ============================================================

  async function save(status) {
    collectBlocks();

    var titleEl = document.getElementById('editor-title');
    var title = titleEl ? titleEl.value.trim() : '';
    if (!title) {
      Toast.show('Заголовок обязателен', 'warning');
      return;
    }

    var body = {
      title: title,
      subtitle: (document.getElementById('editor-subtitle').value || '').trim() || null,
      category_id: Number(document.getElementById('editor-category').value) || null,
      content_blocks: blocks,
      status: status,
    };

    setSaveStatus('Сохранение...');

    try {
      if (article && article.id) {
        await Utils.apiFetch('/api/articles/' + article.id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        article.status = status;
        isDirty = false;
        setSaveStatus('Сохранено');
        Toast.show(status === 'published' ? 'Опубликовано' : 'Черновик сохранен', 'success');
        // Update publish button text
        var pubBtn = document.getElementById('editor-publish');
        if (pubBtn) pubBtn.textContent = status === 'published' ? 'Обновить' : 'Опубликовать';
      } else {
        var result = await Utils.apiFetch('/api/articles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        article = result;
        isDirty = false;
        setSaveStatus('Сохранено');
        Toast.show('Статья создана', 'success');
      }
    } catch (err) {
      setSaveStatus('Ошибка');
      Toast.show('Не удалось сохранить', 'error');
    }
  }

  // ============================================================
  // Auto-save
  // ============================================================

  function startAutoSave() {
    autoSaveTimer = setInterval(function () {
      if (isDirty && article && article.id) {
        collectBlocks();
        var titleEl = document.getElementById('editor-title');
        if (!titleEl || !titleEl.value.trim()) return;

        var body = {
          title: titleEl.value.trim(),
          subtitle: (document.getElementById('editor-subtitle').value || '').trim() || null,
          category_id: Number(document.getElementById('editor-category').value) || null,
          content_blocks: blocks,
        };

        setSaveStatus('Сохранение...');
        Utils.apiFetch('/api/articles/' + article.id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }).then(function () {
          isDirty = false;
          setSaveStatus('Сохранено');
        }).catch(function () {
          setSaveStatus('Ошибка автосохранения');
        });
      }
    }, 30000);
  }

  function stopAutoSave() {
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }

  // ============================================================
  // Overflow menu
  // ============================================================

  function showOverflowMenu(anchor) {
    closeAllMenus();

    var menu = document.createElement('div');
    menu.className = 'editor-overflow-menu';

    var items = [
      { label: 'Предпросмотр', action: showPreview },
      { label: 'SEO настройки', action: showSeoPanel },
      { label: 'Теги', action: showTagsPanel },
      { label: 'Обложка', action: showCoverPanel },
    ];

    if (article && article.id) {
      items.push({ label: 'Удалить', action: deleteArticle, danger: true });
    }

    items.forEach(function (item) {
      var btn = document.createElement('button');
      btn.className = 'editor-context-item' + (item.danger ? ' editor-context-item--danger' : '');
      btn.textContent = item.label;
      btn.addEventListener('click', function () {
        closeAllMenus();
        item.action();
      });
      menu.appendChild(btn);
    });

    anchor.parentNode.appendChild(menu);
    menu.style.bottom = '100%';
    menu.style.right = '0';
    menu.style.marginBottom = '8px';

    setTimeout(function () {
      document.addEventListener('click', closeAllMenus, { once: true });
    }, 0);
  }

  function showPreview() {
    collectBlocks();
    var previewOverlay = document.createElement('div');
    previewOverlay.className = 'editor-preview-overlay';
    previewOverlay.innerHTML =
      '<div class="editor-preview-wrap">' +
        '<div class="editor-preview-header">' +
          '<span>Предпросмотр</span>' +
          '<button class="editor-preview-close">&times;</button>' +
        '</div>' +
        '<div class="editor-preview-content"></div>' +
      '</div>';

    var contentEl = previewOverlay.querySelector('.editor-preview-content');
    ArticleBody.render(contentEl, blocks);

    previewOverlay.querySelector('.editor-preview-close').addEventListener('click', function () {
      previewOverlay.remove();
    });
    previewOverlay.addEventListener('click', function (e) {
      if (e.target === previewOverlay) previewOverlay.remove();
    });

    document.body.appendChild(previewOverlay);
  }

  function showSeoPanel() {
    Toast.show('SEO настройки: в разработке', 'info');
  }

  function showTagsPanel() {
    Toast.show('Теги: в разработке', 'info');
  }

  function showCoverPanel() {
    Toast.show('Обложка: в разработке', 'info');
  }

  async function deleteArticle() {
    if (!article || !article.id) return;
    if (!confirm('Удалить статью? Это действие нельзя отменить.')) return;
    try {
      await Utils.apiFetch('/api/articles/' + article.id, { method: 'DELETE' });
      Toast.show('Статья удалена', 'success');
      close();
      Router.navigate('/profile');
    } catch (err) {
      Toast.show('Не удалось удалить', 'error');
    }
  }

  // ============================================================
  // Helpers
  // ============================================================

  function closeAllMenus() {
    document.querySelectorAll('.editor-context-menu, .editor-overflow-menu, .editor-block-picker').forEach(function (m) {
      m.remove();
    });
  }

  function setSaveStatus(text) {
    var el = document.getElementById('editor-save-status');
    if (el) el.textContent = text;
  }

  function detectProvider(url) {
    if (!url) return '';
    if (url.includes('youtube') || url.includes('youtu.be')) return 'youtube';
    if (url.includes('vk.com')) return 'vk_video';
    if (url.includes('rutube')) return 'rutube';
    return '';
  }

  function getSpoilerText(block) {
    if (block.blocks && block.blocks.length > 0) {
      return block.blocks.map(function (b) { return b.text || ''; }).join('\n');
    }
    return '';
  }

  function getInfoboxText(block) {
    if (block.blocks && block.blocks.length > 0) {
      return block.blocks.map(function (b) { return b.text || ''; }).join('\n');
    }
    return '';
  }

  function tableToText(block) {
    var lines = [];
    if (block.headers && block.headers.length) {
      lines.push(block.headers.join(' | '));
    }
    if (block.rows) {
      block.rows.forEach(function (row) {
        lines.push((row || []).join(' | '));
      });
    }
    return lines.join('\n');
  }

  function parseTableText(text) {
    if (!text) return { headers: [], rows: [] };
    var lines = text.split('\n').filter(Boolean);
    if (lines.length === 0) return { headers: [], rows: [] };
    var headers = lines[0].split('|').map(function (s) { return s.trim(); });
    var rows = lines.slice(1).map(function (line) {
      return line.split('|').map(function (s) { return s.trim(); });
    });
    return { headers: headers, rows: rows };
  }

  return {
    open: open,
    close: close,
  };
})();
