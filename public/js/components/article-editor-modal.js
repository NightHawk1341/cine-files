/**
 * Article Editor Modal — full-screen modal for creating/editing articles.
 * Opens from header "new article" button, edit buttons on articles, profile page.
 * Block-based editor with inline formatting, slash commands, context menus,
 * cover/tags/SEO panels, auto-save.
 */

var ArticleEditorModal = (function () {
  var overlay = null;
  var article = null;
  var blocks = [];
  var isDirty = false;
  var autoSaveTimer = null;
  var categories = [];
  var articleTags = [];
  var coverData = { url: '', alt: '', credit: '' };
  var seoData = { metaTitle: '', metaDescription: '' };
  var inlineToolbar = null;
  var selectionHandler = null;
  var slashMenu = null;
  var savedRange = null;

  // ============================================================
  // Open / Close
  // ============================================================

  async function open(articleId) {
    if (overlay) close();

    article = null;
    blocks = [];
    isDirty = false;
    articleTags = [];
    coverData = { url: '', alt: '', credit: '' };
    seoData = { metaTitle: '', metaDescription: '' };

    try {
      var catData = await Utils.apiFetch('/api/categories');
      categories = catData.categories || [];
    } catch (err) {
      categories = [];
    }

    if (articleId) {
      try {
        var data = await Utils.apiFetch('/api/articles/' + articleId);
        article = data.article || data;
        blocks = article.body || [];
        articleTags = (article.tags || []).map(function (t) { return t.id; });
        coverData = {
          url: article.coverImageUrl || '',
          alt: article.coverImageAlt || '',
          credit: article.coverImageCredit || '',
        };
        seoData = {
          metaTitle: article.metaTitle || '',
          metaDescription: article.metaDescription || '',
        };
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
    setupInlineToolbar();

    document.body.classList.add('modal-open');
  }

  function close() {
    stopAutoSave();
    teardownInlineToolbar();
    hideSlashMenu();
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    overlay = null;
    article = null;
    articleTags = [];
    coverData = { url: '', alt: '', credit: '' };
    seoData = { metaTitle: '', metaDescription: '' };
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
      var selected = article && Number(article.categoryId) === cat.id ? ' selected' : '';
      catOptions += '<option value="' + cat.id + '"' + selected + '>' + Utils.escapeHtml(cat.name_ru) + '</option>';
    });

    overlay.innerHTML =
      '<div class="editor-modal-content">' +
        '<div class="editor-topbar">' +
          '<div class="editor-topbar-left">' +
            '<button class="editor-close-btn" id="editor-close" aria-label="Закрыть">' +
              '<svg width="20" height="20" viewBox="0 0 64 64"><use href="#icon-arrow-left"/></svg>' +
            '</button>' +
            '<div class="editor-author-info" id="editor-author-info"></div>' +
          '</div>' +
          '<div class="editor-topbar-right">' +
            '<select class="editor-category-select" id="editor-category">' + catOptions + '</select>' +
          '</div>' +
        '</div>' +
        '<div class="editor-body" id="editor-body">' +
          (coverData.url
            ? '<div class="editor-cover-banner" id="editor-cover-banner">' +
                '<img src="' + Utils.escapeHtml(coverData.url) + '" class="editor-cover-banner-img">' +
                '<button class="editor-cover-banner-change" id="editor-cover-change">Изменить обложку</button>' +
              '</div>'
            : '<button class="editor-cover-add" id="editor-cover-add">+ Обложка</button>') +
          '<input class="editor-title-input" id="editor-title" type="text" placeholder="Заголовок" value="' + Utils.escapeHtml((article && article.title) || '') + '">' +
          '<input class="editor-subtitle-input" id="editor-subtitle" type="text" placeholder="Подзаголовок (необязательно)" value="' + Utils.escapeHtml((article && article.subtitle) || '') + '">' +
          '<div class="editor-blocks" id="editor-blocks"></div>' +
        '</div>' +
        '<div class="editor-toolbar">' +
          '<button class="editor-toolbar-publish" id="editor-publish">' +
            (article && article.status === 'published' ? 'Обновить' : 'Опубликовать') +
          '</button>' +
          '<button class="editor-toolbar-btn" id="editor-save-draft" title="Сохранить черновик">' +
            '<svg width="18" height="18" viewBox="0 0 64 64"><use href="#icon-save"/></svg>' +
          '</button>' +
          '<button class="editor-toolbar-btn" id="editor-overflow" title="Ещё">' +
            '<svg width="18" height="18" viewBox="0 0 64 64"><use href="#icon-more"/></svg>' +
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

    // Cover buttons
    var coverAddBtn = document.getElementById('editor-cover-add');
    if (coverAddBtn) {
      coverAddBtn.addEventListener('click', function () { showCoverPanel(); });
    }
    var coverChangeBtn = document.getElementById('editor-cover-change');
    if (coverChangeBtn) {
      coverChangeBtn.addEventListener('click', function () { showCoverPanel(); });
    }

    // Mark dirty on changes
    document.getElementById('editor-title').addEventListener('input', function () { isDirty = true; });
    document.getElementById('editor-subtitle').addEventListener('input', function () { isDirty = true; });
    document.getElementById('editor-category').addEventListener('change', function () { isDirty = true; });
  }

  // ============================================================
  // Inline formatting toolbar
  // ============================================================

  function setupInlineToolbar() {
    inlineToolbar = document.createElement('div');
    inlineToolbar.className = 'editor-inline-toolbar';
    inlineToolbar.innerHTML = getToolbarHtml();

    var editorBody = document.getElementById('editor-body');
    if (editorBody) editorBody.appendChild(inlineToolbar);

    setupToolbarButtons();

    selectionHandler = function () {
      positionInlineToolbar();
    };
    document.addEventListener('selectionchange', selectionHandler);
  }

  function teardownInlineToolbar() {
    if (selectionHandler) {
      document.removeEventListener('selectionchange', selectionHandler);
      selectionHandler = null;
    }
    if (inlineToolbar && inlineToolbar.parentNode) {
      inlineToolbar.parentNode.removeChild(inlineToolbar);
    }
    inlineToolbar = null;
    savedRange = null;
  }

  function getToolbarHtml() {
    return '<button class="editor-inline-btn" data-cmd="bold" title="Ctrl+B"><strong>B</strong></button>' +
      '<button class="editor-inline-btn" data-cmd="italic" title="Ctrl+I"><em>I</em></button>' +
      '<button class="editor-inline-btn" data-cmd="strikethrough" title="Ctrl+Shift+S"><s>S</s></button>' +
      '<button class="editor-inline-btn editor-inline-btn--code" data-cmd="code" title="Ctrl+E">&lt;/&gt;</button>' +
      '<span class="editor-inline-sep"></span>' +
      '<button class="editor-inline-btn editor-inline-btn--link" data-cmd="link" title="Ctrl+K">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>' +
          '<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>' +
        '</svg>' +
      '</button>';
  }

  function setupToolbarButtons() {
    if (!inlineToolbar) return;
    inlineToolbar.querySelectorAll('.editor-inline-btn').forEach(function (btn) {
      btn.addEventListener('mousedown', function (e) {
        e.preventDefault();
        var cmd = btn.getAttribute('data-cmd');
        if (cmd === 'link') {
          showLinkInput();
        } else if (cmd === 'code') {
          applyInlineCode();
        } else {
          restoreSelection();
          document.execCommand(cmd, false, null);
          isDirty = true;
        }
      });
    });
  }

  function positionInlineToolbar() {
    if (!inlineToolbar || !overlay) return;
    if (inlineToolbar.classList.contains('editor-inline-toolbar--link-mode')) return;

    var sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) {
      inlineToolbar.classList.remove('editor-inline-toolbar--visible');
      return;
    }

    var anchorEl = sel.anchorNode;
    if (!anchorEl) { inlineToolbar.classList.remove('editor-inline-toolbar--visible'); return; }
    var el = anchorEl.nodeType === 1 ? anchorEl : anchorEl.parentElement;
    if (!el) { inlineToolbar.classList.remove('editor-inline-toolbar--visible'); return; }
    var ce = el.closest && el.closest('[contenteditable="true"]');
    if (!ce || !overlay.contains(ce)) {
      inlineToolbar.classList.remove('editor-inline-toolbar--visible');
      return;
    }

    savedRange = sel.getRangeAt(0).cloneRange();

    var range = sel.getRangeAt(0);
    var rect = range.getBoundingClientRect();
    var editorBody = document.getElementById('editor-body');
    if (!editorBody) return;
    var bodyRect = editorBody.getBoundingClientRect();

    var top = rect.top - bodyRect.top + editorBody.scrollTop - 44;
    var left = rect.left + rect.width / 2 - bodyRect.left - 90;
    left = Math.max(0, Math.min(left, bodyRect.width - 180));

    inlineToolbar.style.top = top + 'px';
    inlineToolbar.style.left = left + 'px';
    inlineToolbar.classList.add('editor-inline-toolbar--visible');
  }

  function restoreSelection() {
    if (savedRange) {
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange);
    }
  }

  function applyInlineCode() {
    restoreSelection();
    var sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;
    var range = sel.getRangeAt(0);

    var ancestor = range.commonAncestorContainer;
    var codeParent = ancestor.nodeType === 1
      ? ancestor.closest('code')
      : (ancestor.parentElement && ancestor.parentElement.closest('code'));
    if (codeParent) {
      var text = codeParent.textContent;
      var textNode = document.createTextNode(text);
      codeParent.parentNode.replaceChild(textNode, codeParent);
    } else {
      var code = document.createElement('code');
      range.surroundContents(code);
    }
    isDirty = true;
  }

  function showLinkInput() {
    if (!inlineToolbar) return;
    savedRange = window.getSelection().getRangeAt(0).cloneRange();
    inlineToolbar.classList.add('editor-inline-toolbar--link-mode');
    inlineToolbar.innerHTML =
      '<input class="editor-inline-link-input" type="url" placeholder="https://">' +
      '<button class="editor-inline-btn editor-inline-btn--apply" title="Применить">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' +
      '</button>' +
      '<button class="editor-inline-btn editor-inline-btn--cancel" title="Отмена">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
      '</button>';

    var input = inlineToolbar.querySelector('.editor-inline-link-input');
    var applyBtn = inlineToolbar.querySelector('.editor-inline-btn--apply');
    var cancelBtn = inlineToolbar.querySelector('.editor-inline-btn--cancel');

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyLink(input.value);
      } else if (e.key === 'Escape') {
        restoreToolbarFromLink();
      }
    });

    applyBtn.addEventListener('mousedown', function (e) {
      e.preventDefault();
      applyLink(input.value);
    });

    cancelBtn.addEventListener('mousedown', function (e) {
      e.preventDefault();
      restoreToolbarFromLink();
    });

    setTimeout(function () { input.focus(); }, 0);
  }

  function applyLink(url) {
    if (!url) { restoreToolbarFromLink(); return; }
    restoreSelection();
    document.execCommand('createLink', false, url);

    var sel = window.getSelection();
    if (sel.anchorNode) {
      var container = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
      if (container) {
        var links = container.querySelectorAll('a[href="' + CSS.escape(url) + '"]');
        links.forEach(function (a) {
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener');
        });
      }
    }

    isDirty = true;
    restoreToolbarFromLink();
  }

  function restoreToolbarFromLink() {
    if (!inlineToolbar) return;
    inlineToolbar.classList.remove('editor-inline-toolbar--link-mode');
    inlineToolbar.classList.remove('editor-inline-toolbar--visible');
    inlineToolbar.innerHTML = getToolbarHtml();
    setupToolbarButtons();
  }

  // ============================================================
  // Block rendering
  // ============================================================

  function renderBlocks() {
    var container = document.getElementById('editor-blocks');
    if (!container) return;
    container.innerHTML = '';

    blocks.forEach(function (block, index) {
      // Plus button before each block (except first)
      if (index > 0) {
        container.appendChild(createPlusButton(index));
      }

      var el = renderBlockEditor(block, index);
      container.appendChild(el);
    });

    // Plus button + add block button at end
    if (blocks.length > 0) {
      container.appendChild(createPlusButton(blocks.length));
    }

    var addBtn = document.createElement('button');
    addBtn.className = 'editor-add-block';
    addBtn.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 64 64"><use href="#icon-plus"/></svg>' +
      '<span>Добавить блок</span>';
    addBtn.addEventListener('click', function () {
      showBlockTypePicker(blocks.length);
    });
    container.appendChild(addBtn);
  }

  function createPlusButton(insertIndex) {
    var wrap = document.createElement('div');
    wrap.className = 'editor-block-plus-wrap';
    var btn = document.createElement('button');
    btn.className = 'editor-block-plus';
    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 64 64"><use href="#icon-plus"/></svg>';
    btn.addEventListener('click', function () {
      showBlockTypePicker(insertIndex);
    });
    wrap.appendChild(btn);
    return wrap;
  }

  function renderBlockEditor(block, index) {
    var wrapper = document.createElement('div');
    wrapper.className = 'editor-block';
    wrapper.setAttribute('data-index', index);
    wrapper.setAttribute('data-type', block.type);
    wrapper.setAttribute('draggable', 'true');

    // Drag handle + context menu trigger
    var handle = document.createElement('button');
    handle.className = 'editor-block-handle';
    handle.innerHTML = '<svg width="14" height="14" viewBox="0 0 64 64"><use href="#icon-drag"/></svg>';
    handle.addEventListener('click', function (e) {
      showBlockContextMenu(e.currentTarget, index);
    });

    var content = document.createElement('div');
    content.className = 'editor-block-content';

    switch (block.type) {
      case 'paragraph':
        content.innerHTML = '<div class="editor-block-text" contenteditable="true" data-placeholder="Введите текст или / для выбора блока">' + Utils.sanitizeInlineHtml(block.text || '') + '</div>';
        break;
      case 'heading':
        var lvl = block.level || 2;
        content.innerHTML = '<div class="editor-block-heading editor-block-heading--' + lvl + '" contenteditable="true" data-placeholder="Заголовок">' + Utils.escapeHtml(block.text || '') + '</div>';
        break;
      case 'image':
        content.innerHTML =
          '<div class="editor-image-block">' +
            (block.url
              ? '<img src="' + Utils.escapeHtml(block.url) + '" class="editor-image-preview">'
              : '') +
            '<div class="editor-image-actions">' +
              '<button class="editor-image-upload-btn" data-action="upload">Выбрать изображение</button>' +
              '<input class="editor-input editor-input-sm" type="text" placeholder="или вставьте URL" value="' + Utils.escapeHtml(block.url || '') + '" data-field="url">' +
            '</div>' +
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

    // Contenteditable keyboard handling (Enter, Backspace, slash, shortcuts)
    if (block.type === 'paragraph' || block.type === 'heading') {
      var editableEl = content.querySelector('[contenteditable]');
      if (editableEl) {
        editableEl.addEventListener('keydown', function (e) {
          handleContentEditableKeydown(e, index, block.type);
        });
        if (block.type === 'paragraph') {
          editableEl.addEventListener('input', function () {
            handleSlashInput(editableEl, wrapper, index);
          });
        }
      }
    }

    // List block interactions
    if (block.type === 'list') {
      setupListBlock(content, index);
    }

    // Image block: upload button + URL change preview
    if (block.type === 'image') {
      setupImageBlock(content, index);
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

  // ============================================================
  // Contenteditable keyboard handling
  // ============================================================

  function handleContentEditableKeydown(e, index, blockType) {
    var el = e.target;

    // Enter: create new paragraph below
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      collectBlocks();

      var sel = window.getSelection();
      if (!sel.rangeCount) return;

      var range = sel.getRangeAt(0);
      range.deleteContents();

      // Extract content after cursor
      var afterRange = document.createRange();
      afterRange.setStart(range.endContainer, range.endOffset);
      afterRange.setEndAfter(el.lastChild || el);
      var afterFrag = afterRange.extractContents();
      var temp = document.createElement('div');
      temp.appendChild(afterFrag);
      var afterHtml = temp.innerHTML;

      // Update current block
      blocks[index].text = el.innerHTML;

      // Insert new paragraph with remaining content
      blocks.splice(index + 1, 0, { type: 'paragraph', text: afterHtml });
      isDirty = true;
      renderBlocks();
      focusBlock(index + 1, false);
      return;
    }

    // Backspace on empty block: delete it and focus previous
    if (e.key === 'Backspace' && el.textContent.trim() === '' && blocks.length > 1) {
      e.preventDefault();
      collectBlocks();
      blocks.splice(index, 1);
      isDirty = true;
      renderBlocks();
      focusBlock(Math.max(0, index - 1), true);
      return;
    }

    // Keyboard shortcuts for formatting (paragraph only)
    if (blockType === 'paragraph') {
      var isMac = navigator.platform.indexOf('Mac') > -1;
      var mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key === 'b') {
        e.preventDefault();
        document.execCommand('bold', false, null);
        isDirty = true;
      } else if (mod && e.key === 'i') {
        e.preventDefault();
        document.execCommand('italic', false, null);
        isDirty = true;
      } else if (mod && e.key === 'k') {
        e.preventDefault();
        showLinkInput();
      } else if (mod && e.key === 'e') {
        e.preventDefault();
        applyInlineCode();
      }
    }
  }

  function focusBlock(index, atEnd) {
    requestAnimationFrame(function () {
      var container = document.getElementById('editor-blocks');
      if (!container) return;
      var blockEls = container.querySelectorAll('.editor-block');
      if (!blockEls[index]) return;
      var editable = blockEls[index].querySelector('[contenteditable]');
      if (!editable) {
        var input = blockEls[index].querySelector('input, textarea');
        if (input) input.focus();
        return;
      }
      editable.focus();
      if (atEnd && editable.childNodes.length > 0) {
        var range = document.createRange();
        range.selectNodeContents(editable);
        range.collapse(false);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });
  }

  // ============================================================
  // Slash commands
  // ============================================================

  function handleSlashInput(editableEl, wrapper, index) {
    var text = editableEl.textContent;
    if (text.startsWith('/')) {
      showSlashMenu(wrapper, index, text.slice(1));
    } else {
      hideSlashMenu();
    }
  }

  function showSlashMenu(blockWrapper, index, filterText) {
    hideSlashMenu();

    var types = [
      { type: 'paragraph', label: 'Текст', keywords: 'текст text paragraph параграф' },
      { type: 'heading', label: 'Заголовок', keywords: 'заголовок heading h2 h3' },
      { type: 'image', label: 'Изображение', keywords: 'изображение image фото photo картинка img' },
      { type: 'gallery', label: 'Галерея', keywords: 'галерея gallery' },
      { type: 'quote', label: 'Цитата', keywords: 'цитата quote' },
      { type: 'list', label: 'Список', keywords: 'список list ul ol' },
      { type: 'embed', label: 'Видео', keywords: 'видео video embed youtube vk rutube' },
      { type: 'divider', label: 'Разделитель', keywords: 'разделитель divider hr линия' },
      { type: 'spoiler', label: 'Спойлер', keywords: 'спойлер spoiler скрытый' },
      { type: 'infobox', label: 'Инфоблок', keywords: 'инфоблок infobox info подсказка' },
      { type: 'movie_card', label: 'Карточка фильма', keywords: 'фильм movie tmdb кино сериал' },
      { type: 'tribute_products', label: 'TR-BUTE товары', keywords: 'товары products tribute магазин' },
      { type: 'comparison', label: 'Сравнение', keywords: 'сравнение comparison' },
      { type: 'rating', label: 'Оценка', keywords: 'оценка rating рейтинг' },
      { type: 'table', label: 'Таблица', keywords: 'таблица table' },
      { type: 'code', label: 'Код', keywords: 'код code программа' },
      { type: 'audio', label: 'Аудио', keywords: 'аудио audio звук музыка' },
    ];

    if (filterText) {
      var lower = filterText.toLowerCase();
      types = types.filter(function (t) {
        return t.label.toLowerCase().indexOf(lower) !== -1 || t.keywords.indexOf(lower) !== -1;
      });
    }

    if (types.length === 0) return;

    slashMenu = document.createElement('div');
    slashMenu.className = 'editor-slash-menu';

    types.forEach(function (t) {
      var btn = document.createElement('button');
      btn.className = 'editor-slash-item';
      btn.textContent = t.label;
      btn.addEventListener('mousedown', function (e) {
        e.preventDefault();
        hideSlashMenu();
        blocks[index] = createEmptyBlock(t.type);
        isDirty = true;
        renderBlocks();
        focusBlock(index, false);
      });
      slashMenu.appendChild(btn);
    });

    var contentEl = blockWrapper.querySelector('.editor-block-content');
    if (contentEl) contentEl.appendChild(slashMenu);
  }

  function hideSlashMenu() {
    if (slashMenu && slashMenu.parentNode) {
      slashMenu.parentNode.removeChild(slashMenu);
    }
    slashMenu = null;
  }

  // ============================================================
  // Image block setup
  // ============================================================

  function setupImageBlock(content, blockIndex) {
    var uploadBtn = content.querySelector('[data-action="upload"]');
    if (uploadBtn) {
      uploadBtn.addEventListener('click', function () {
        MediaPicker.open(function (url) {
          blocks[blockIndex].url = url;
          isDirty = true;
          renderBlocks();
        });
      });
    }

    var urlInput = content.querySelector('[data-field="url"]');
    if (urlInput) {
      urlInput.addEventListener('change', function () {
        var url = urlInput.value.trim();
        blocks[blockIndex].url = url;
        isDirty = true;
        var preview = content.querySelector('.editor-image-preview');
        if (url && !preview) {
          var img = document.createElement('img');
          img.className = 'editor-image-preview';
          img.src = url;
          content.querySelector('.editor-image-block').insertBefore(img, content.querySelector('.editor-image-actions'));
        } else if (preview) {
          preview.src = url;
        }
      });
    }
  }

  // ============================================================
  // List block setup
  // ============================================================

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
      items.push({ label: 'H2', action: function () { convertBlock(index, 'heading', 2); } });
      items.push({ label: 'H3', action: function () { convertBlock(index, 'heading', 3); } });
    }
    if (block.type === 'heading') {
      items.push({ label: 'Текст', action: function () { convertBlock(index, 'paragraph'); } });
    }

    items.push({ label: 'Вверх', action: function () { moveBlock(index, index - 1); }, disabled: index === 0 });
    items.push({ label: 'Вниз', action: function () { moveBlock(index, index + 1); }, disabled: index >= blocks.length - 1 });
    items.push({ label: 'Дублировать', action: function () { duplicateBlock(index); } });
    items.push({ label: 'Удалить', action: function () { deleteBlock(index); }, danger: true });

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

    var rect = anchor.getBoundingClientRect();
    menu.style.top = (anchor.offsetTop + anchor.offsetHeight + 4) + 'px';
    menu.style.left = anchor.offsetLeft + 'px';

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
    focusBlock(atIndex, false);
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
    collectBlocks();
    var block = blocks.splice(from, 1)[0];
    blocks.splice(to, 0, block);
    isDirty = true;
    renderBlocks();
  }

  function convertBlock(index, newType, level) {
    collectBlocks();
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

  function buildSaveBody(status) {
    var titleEl = document.getElementById('editor-title');
    var title = titleEl ? titleEl.value.trim() : '';

    return {
      title: title,
      subtitle: (document.getElementById('editor-subtitle').value || '').trim() || null,
      categoryId: Number(document.getElementById('editor-category').value) || null,
      body: blocks,
      status: status,
      coverImageUrl: coverData.url || null,
      coverImageAlt: coverData.alt || null,
      coverImageCredit: coverData.credit || null,
      metaTitle: seoData.metaTitle || null,
      metaDescription: seoData.metaDescription || null,
      tagIds: articleTags.length > 0 ? articleTags : undefined,
    };
  }

  async function save(status) {
    collectBlocks();

    var titleEl = document.getElementById('editor-title');
    var title = titleEl ? titleEl.value.trim() : '';
    if (!title) {
      Toast.show('Заголовок обязателен', 'warning');
      return;
    }

    var payload = buildSaveBody(status);
    setSaveStatus('Сохранение...');

    try {
      if (article && article.id) {
        var updated = await Utils.apiFetch('/api/articles/' + article.id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        article = updated.article || updated;
        article.status = status;
        isDirty = false;
        setSaveStatus('Сохранено');
        Toast.show(status === 'published' ? 'Опубликовано' : 'Черновик сохранен', 'success');
        var pubBtn = document.getElementById('editor-publish');
        if (pubBtn) pubBtn.textContent = status === 'published' ? 'Обновить' : 'Опубликовать';
      } else {
        var result = await Utils.apiFetch('/api/articles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        article = result.article || result;
        isDirty = false;
        setSaveStatus('Сохранено');
        Toast.show('Статья создана', 'success');
        var pubBtn2 = document.getElementById('editor-publish');
        if (pubBtn2) pubBtn2.textContent = article.status === 'published' ? 'Обновить' : 'Опубликовать';
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

        var payload = buildSaveBody(undefined);
        delete payload.status;

        setSaveStatus('Сохранение...');
        Utils.apiFetch('/api/articles/' + article.id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
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
  // Cover panel
  // ============================================================

  function showCoverPanel() {
    closeAllMenus();

    var panelOverlay = document.createElement('div');
    panelOverlay.className = 'editor-panel-overlay';
    panelOverlay.innerHTML =
      '<div class="editor-panel">' +
        '<div class="editor-panel-header">' +
          '<span>Обложка</span>' +
          '<button class="editor-panel-close">&times;</button>' +
        '</div>' +
        '<div class="editor-panel-body">' +
          (coverData.url
            ? '<img src="' + Utils.escapeHtml(coverData.url) + '" class="editor-cover-preview">'
            : '<div class="editor-cover-empty">Нет обложки</div>') +
          '<button class="editor-cover-select-btn" id="panel-cover-select">Выбрать изображение</button>' +
          '<input class="editor-input" type="text" placeholder="Alt текст" value="' + Utils.escapeHtml(coverData.alt) + '" id="panel-cover-alt">' +
          '<input class="editor-input" type="text" placeholder="Источник" value="' + Utils.escapeHtml(coverData.credit) + '" id="panel-cover-credit">' +
          (coverData.url ? '<button class="editor-cover-remove-btn" id="panel-cover-remove">Удалить обложку</button>' : '') +
        '</div>' +
      '</div>';

    panelOverlay.querySelector('.editor-panel-close').addEventListener('click', function () {
      saveCoverFromPanel(panelOverlay);
      panelOverlay.remove();
    });
    panelOverlay.addEventListener('click', function (e) {
      if (e.target === panelOverlay) {
        saveCoverFromPanel(panelOverlay);
        panelOverlay.remove();
      }
    });

    panelOverlay.querySelector('#panel-cover-select').addEventListener('click', function () {
      MediaPicker.open(function (url) {
        coverData.url = url;
        isDirty = true;
        // Refresh panel
        panelOverlay.remove();
        showCoverPanel();
        updateCoverBanner();
      });
    });

    var removeBtn = panelOverlay.querySelector('#panel-cover-remove');
    if (removeBtn) {
      removeBtn.addEventListener('click', function () {
        coverData = { url: '', alt: '', credit: '' };
        isDirty = true;
        panelOverlay.remove();
        updateCoverBanner();
      });
    }

    document.body.appendChild(panelOverlay);
  }

  function saveCoverFromPanel(panelOverlay) {
    var altEl = panelOverlay.querySelector('#panel-cover-alt');
    var creditEl = panelOverlay.querySelector('#panel-cover-credit');
    if (altEl) coverData.alt = altEl.value.trim();
    if (creditEl) coverData.credit = creditEl.value.trim();
    isDirty = true;
    updateCoverBanner();
  }

  function updateCoverBanner() {
    var body = document.getElementById('editor-body');
    if (!body) return;

    var existing = body.querySelector('.editor-cover-banner, .editor-cover-add');
    if (existing) existing.remove();

    var titleInput = body.querySelector('.editor-title-input');
    if (!titleInput) return;

    if (coverData.url) {
      var banner = document.createElement('div');
      banner.className = 'editor-cover-banner';
      banner.id = 'editor-cover-banner';
      banner.innerHTML =
        '<img src="' + Utils.escapeHtml(coverData.url) + '" class="editor-cover-banner-img">' +
        '<button class="editor-cover-banner-change" id="editor-cover-change">Изменить обложку</button>';
      banner.querySelector('#editor-cover-change').addEventListener('click', function () { showCoverPanel(); });
      body.insertBefore(banner, titleInput);
    } else {
      var addBtn = document.createElement('button');
      addBtn.className = 'editor-cover-add';
      addBtn.id = 'editor-cover-add';
      addBtn.textContent = '+ Обложка';
      addBtn.addEventListener('click', function () { showCoverPanel(); });
      body.insertBefore(addBtn, titleInput);
    }
  }

  // ============================================================
  // Tags panel
  // ============================================================

  function showTagsPanel() {
    closeAllMenus();

    var panelOverlay = document.createElement('div');
    panelOverlay.className = 'editor-panel-overlay';
    panelOverlay.innerHTML =
      '<div class="editor-panel">' +
        '<div class="editor-panel-header">' +
          '<span>Теги</span>' +
          '<button class="editor-panel-close">&times;</button>' +
        '</div>' +
        '<div class="editor-panel-body">' +
          '<input class="editor-input" type="text" placeholder="Поиск тегов..." id="panel-tag-search">' +
          '<div class="editor-tags-selected" id="panel-tags-selected"></div>' +
          '<div class="editor-tags-list" id="panel-tags-list">Загрузка...</div>' +
        '</div>' +
      '</div>';

    panelOverlay.querySelector('.editor-panel-close').addEventListener('click', function () {
      panelOverlay.remove();
    });
    panelOverlay.addEventListener('click', function (e) {
      if (e.target === panelOverlay) panelOverlay.remove();
    });

    document.body.appendChild(panelOverlay);

    // Load tags
    loadTagsForPanel(panelOverlay);
  }

  async function loadTagsForPanel(panelOverlay) {
    var listEl = panelOverlay.querySelector('#panel-tags-list');
    var searchEl = panelOverlay.querySelector('#panel-tag-search');
    var selectedEl = panelOverlay.querySelector('#panel-tags-selected');

    try {
      var data = await Utils.apiFetch('/api/tags?limit=200');
      var allTags = data.tags || [];

      function renderTagsList(filter) {
        var filtered = allTags;
        if (filter) {
          var lower = filter.toLowerCase();
          filtered = allTags.filter(function (t) {
            return (t.nameRu || '').toLowerCase().indexOf(lower) !== -1 ||
              (t.nameEn || '').toLowerCase().indexOf(lower) !== -1;
          });
        }

        listEl.innerHTML = '';
        if (filtered.length === 0) {
          listEl.innerHTML = '<span class="editor-tags-empty">Ничего не найдено</span>';
          return;
        }

        filtered.forEach(function (tag) {
          var isSelected = articleTags.indexOf(tag.id) !== -1;
          var chip = document.createElement('button');
          chip.className = 'editor-tag-chip' + (isSelected ? ' editor-tag-chip--selected' : '');
          chip.textContent = tag.nameRu || tag.nameEn || tag.slug;
          chip.addEventListener('click', function () {
            var idx = articleTags.indexOf(tag.id);
            if (idx !== -1) {
              articleTags.splice(idx, 1);
            } else {
              articleTags.push(tag.id);
            }
            isDirty = true;
            renderTagsList(searchEl.value);
            renderSelectedTags(allTags);
          });
          listEl.appendChild(chip);
        });
      }

      function renderSelectedTags(tags) {
        selectedEl.innerHTML = '';
        if (articleTags.length === 0) return;
        articleTags.forEach(function (tagId) {
          var tag = tags.find(function (t) { return t.id === tagId; });
          if (!tag) return;
          var chip = document.createElement('span');
          chip.className = 'editor-tag-selected';
          chip.innerHTML = Utils.escapeHtml(tag.nameRu || tag.slug) +
            '<button class="editor-tag-remove">&times;</button>';
          chip.querySelector('.editor-tag-remove').addEventListener('click', function () {
            var idx = articleTags.indexOf(tagId);
            if (idx !== -1) articleTags.splice(idx, 1);
            isDirty = true;
            renderTagsList(searchEl.value);
            renderSelectedTags(tags);
          });
          selectedEl.appendChild(chip);
        });
      }

      renderSelectedTags(allTags);
      renderTagsList('');

      searchEl.addEventListener('input', Utils.debounce(function () {
        renderTagsList(searchEl.value);
      }, 150));

    } catch (err) {
      listEl.innerHTML = '<span class="editor-tags-empty">Не удалось загрузить теги</span>';
    }
  }

  // ============================================================
  // SEO panel
  // ============================================================

  function showSeoPanel() {
    closeAllMenus();

    var panelOverlay = document.createElement('div');
    panelOverlay.className = 'editor-panel-overlay';
    panelOverlay.innerHTML =
      '<div class="editor-panel">' +
        '<div class="editor-panel-header">' +
          '<span>SEO</span>' +
          '<button class="editor-panel-close">&times;</button>' +
        '</div>' +
        '<div class="editor-panel-body">' +
          '<label class="editor-panel-label">Meta Title <span class="editor-char-count" id="seo-title-count">' + (seoData.metaTitle || '').length + '/70</span></label>' +
          '<input class="editor-input" type="text" maxlength="70" value="' + Utils.escapeHtml(seoData.metaTitle) + '" id="panel-seo-title" placeholder="Заголовок для поисковиков">' +
          '<label class="editor-panel-label">Meta Description <span class="editor-char-count" id="seo-desc-count">' + (seoData.metaDescription || '').length + '/160</span></label>' +
          '<textarea class="editor-textarea" maxlength="160" id="panel-seo-desc" placeholder="Описание для поисковиков">' + Utils.escapeHtml(seoData.metaDescription) + '</textarea>' +
        '</div>' +
      '</div>';

    var closePanel = function () {
      var titleEl = panelOverlay.querySelector('#panel-seo-title');
      var descEl = panelOverlay.querySelector('#panel-seo-desc');
      seoData.metaTitle = titleEl ? titleEl.value.trim() : '';
      seoData.metaDescription = descEl ? descEl.value.trim() : '';
      isDirty = true;
      panelOverlay.remove();
    };

    panelOverlay.querySelector('.editor-panel-close').addEventListener('click', closePanel);
    panelOverlay.addEventListener('click', function (e) {
      if (e.target === panelOverlay) closePanel();
    });

    // Character counters
    var titleInput = panelOverlay.querySelector('#panel-seo-title');
    var descInput = panelOverlay.querySelector('#panel-seo-desc');
    var titleCount = panelOverlay.querySelector('#seo-title-count');
    var descCount = panelOverlay.querySelector('#seo-desc-count');

    titleInput.addEventListener('input', function () {
      titleCount.textContent = titleInput.value.length + '/70';
      titleCount.classList.toggle('editor-char-count--over', titleInput.value.length > 60);
    });
    descInput.addEventListener('input', function () {
      descCount.textContent = descInput.value.length + '/160';
      descCount.classList.toggle('editor-char-count--over', descInput.value.length > 150);
    });

    document.body.appendChild(panelOverlay);
    titleInput.focus();
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
      { label: 'Обложка', action: showCoverPanel },
      { label: 'Теги', action: showTagsPanel },
      { label: 'SEO настройки', action: showSeoPanel },
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

    // Show cover in preview
    if (coverData.url) {
      var coverFig = document.createElement('figure');
      coverFig.className = 'article-figure';
      coverFig.style.marginBottom = '20px';
      var coverImg = document.createElement('img');
      coverImg.src = coverData.url;
      coverImg.alt = coverData.alt || '';
      coverImg.style.width = '100%';
      coverImg.style.borderRadius = '8px';
      coverFig.appendChild(coverImg);
      contentEl.appendChild(coverFig);
    }

    ArticleBody.render(contentEl, blocks);

    previewOverlay.querySelector('.editor-preview-close').addEventListener('click', function () {
      previewOverlay.remove();
    });
    previewOverlay.addEventListener('click', function (e) {
      if (e.target === previewOverlay) previewOverlay.remove();
    });

    document.body.appendChild(previewOverlay);
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
    hideSlashMenu();
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
