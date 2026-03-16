/**
 * Comment list — renders threaded comments with reply form.
 */

var CommentList = (function () {
  /**
   * Render comments into a container.
   * @param {HTMLElement} container
   * @param {number|string} articleId
   */
  async function render(container, articleId) {
    container.innerHTML = '';

    if (!articleId) return;

    var section = document.createElement('section');
    section.className = 'comment-section';

    var title = document.createElement('h2');
    title.className = 'comment-section-title';
    title.textContent = 'Комментарии';
    section.appendChild(title);

    try {
      var data = await Utils.apiFetch('/api/comments?article_id=' + articleId);
      var comments = data.comments || [];

      if (comments.length === 0) {
        var empty = document.createElement('p');
        empty.className = 'comment-empty';
        empty.textContent = 'Комментариев пока нет. Будьте первым!';
        section.appendChild(empty);
      } else {
        comments.forEach(function (comment) {
          section.appendChild(buildComment(comment, articleId));
        });
      }
    } catch (err) {
      var error = document.createElement('p');
      error.className = 'comment-error';
      error.textContent = 'Не удалось загрузить комментарии';
      section.appendChild(error);
    }

    // Comment form
    section.appendChild(buildCommentForm(articleId));
    container.appendChild(section);
  }

  function buildComment(comment, articleId) {
    var el = document.createElement('div');
    el.className = 'comment-item';
    if (comment.status === 'hidden') el.classList.add('comment-hidden');

    var header = document.createElement('div');
    header.className = 'comment-header';

    var author = document.createElement('span');
    author.className = 'comment-author';
    var authorName = comment.user ? comment.user.displayName : '';
    author.textContent = authorName || 'Аноним';
    header.appendChild(author);

    var date = document.createElement('time');
    date.className = 'comment-date';
    date.textContent = Utils.formatDate(comment.createdAt);
    header.appendChild(date);

    el.appendChild(header);

    if (comment.status === 'deleted') {
      var deleted = document.createElement('p');
      deleted.className = 'comment-deleted';
      deleted.textContent = 'Комментарий удален';
      el.appendChild(deleted);
    } else {
      var body = document.createElement('div');
      body.className = 'comment-body';
      body.innerHTML = Utils.sanitizeInlineHtml(comment.body || '');
      el.appendChild(body);

      // Inline moderation buttons for editors/admins
      if (Auth.isEditor()) {
        var modActions = document.createElement('div');
        modActions.className = 'comment-mod-actions';

        var hideBtn = document.createElement('button');
        hideBtn.className = 'comment-mod-btn';
        hideBtn.textContent = comment.status === 'hidden' ? 'Показать' : 'Скрыть';
        hideBtn.addEventListener('click', async function () {
          var action = comment.status === 'hidden' ? 'show' : 'hide';
          try {
            await Utils.apiFetch('/api/admin/comments/' + comment.id + '/moderate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: action }),
            });
            Toast.show(action === 'hide' ? 'Комментарий скрыт' : 'Комментарий восстановлен', 'success');
            var container = el.closest('.comment-section').parentNode;
            if (container) await render(container, articleId);
          } catch (err) {
            Toast.show('Не удалось выполнить действие', 'error');
          }
        });

        var delBtn = document.createElement('button');
        delBtn.className = 'comment-mod-btn comment-mod-btn--danger';
        delBtn.textContent = 'Удалить';
        delBtn.addEventListener('click', async function () {
          if (!confirm('Удалить комментарий?')) return;
          try {
            await Utils.apiFetch('/api/admin/comments/' + comment.id + '/moderate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'delete' }),
            });
            Toast.show('Комментарий удален', 'success');
            var container = el.closest('.comment-section').parentNode;
            if (container) await render(container, articleId);
          } catch (err) {
            Toast.show('Не удалось удалить', 'error');
          }
        });

        modActions.appendChild(hideBtn);
        modActions.appendChild(delBtn);
        el.appendChild(modActions);
      }
    }

    // Replies
    if (comment.replies && comment.replies.length > 0) {
      var replies = document.createElement('div');
      replies.className = 'comment-replies';
      comment.replies.forEach(function (reply) {
        replies.appendChild(buildComment(reply, articleId));
      });
      el.appendChild(replies);
    }

    return el;
  }

  function buildCommentForm(articleId, parentId) {
    var form = document.createElement('form');
    form.className = 'comment-form';

    var textarea = document.createElement('textarea');
    textarea.className = 'comment-textarea';
    textarea.placeholder = 'Написать комментарий...';
    textarea.rows = 3;
    form.appendChild(textarea);

    var submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'comment-submit';
    submitBtn.textContent = 'Отправить';
    form.appendChild(submitBtn);

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var text = textarea.value.trim();
      if (!text) return;

      submitBtn.disabled = true;
      try {
        var payload = { articleId: Number(articleId), body: text };
        if (parentId) payload.parentId = Number(parentId);

        await Utils.apiFetch('/api/comments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        Toast.show('Комментарий отправлен', 'success');
        textarea.value = '';

        // Re-render comments
        var container = form.closest('.comment-section').parentNode;
        if (container) await render(container, articleId);
      } catch (err) {
        if (err.status === 401) {
          Toast.show('Войдите, чтобы оставить комментарий', 'warning');
        } else {
          Toast.show('Не удалось отправить комментарий', 'error');
        }
      } finally {
        submitBtn.disabled = false;
      }
    });

    return form;
  }

  return {
    render: render,
  };
})();
