// ============================================================
// PRODUCT COMMENTS MODULE
// Handles product comments display and submission
// ============================================================

import { isLoggedIn, getCurrentUser } from '../../core/auth.js';
import { showSkeletonLoaders } from '../../modules/skeleton-loader.js';
import { escapeHtml } from '../../core/formatters.js';

// ============ TOAST NOTIFICATION ============
// Use global toast module for consistent styling and behavior
const showToast = (message, type = 'success') => {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
  }
};

// Use mobile-modal module for confirmations
const showConfirmation = async (message, subtitle = '', callback = null) => {
  const fullMessage = subtitle ? `${message}\n\n${subtitle}` : message;

  if (callback && typeof callback === 'function') {
    const confirmed = await window.mobileModal.confirm({
      title: 'Подтверждение',
      message: fullMessage,
      confirmText: 'Да',
      cancelText: 'Отмена'
    });
    if (confirmed) callback();
  } else {
    await window.mobileModal.alert(fullMessage, { title: 'Уведомление' });
  }
};

// ============ COMMENTS RENDERING ============

export const renderProductComments = async (productId) => {
  const commentsList = document.querySelector('.product-comments-list');
  if (!commentsList) {
    console.error('Product comments list element not found');
    return;
  }

  // Show skeleton loaders while loading
  showSkeletonLoaders(commentsList, 'comment', 3);

  try {
    const response = await fetch(`/api/comments?product_id=${productId}`);

    // Handle 404 as "no comments" rather than an error
    if (!response.ok) {
      if (response.status === 404) {
        commentsList.innerHTML = '<div style="color: #666; font-size: 12px; text-align: center; padding: 20px;">Комментариев пока нет</div>';
        return 0;
      }
      throw new Error(`Failed to fetch comments: ${response.status}`);
    }

    const comments = await response.json();

    // Load user's liked comments if logged in
    let userCommentLikes = new Set();
    if (isLoggedIn()) {
      try {
        const likesResponse = await fetch('/api/comments/likes', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('tributary_accessToken')}`
          }
        });
        if (likesResponse.ok) {
          const likedComments = await likesResponse.json();
          userCommentLikes = new Set(likedComments.map(c => c.comment_id));
        }
      } catch (err) {
        console.error('Error loading liked comments:', err);
      }
    }

    commentsList.innerHTML = '';

    // Update counter for product comments tab
    const productCommentsCounter = document.getElementById('product-comments-counter');
    if (productCommentsCounter) {
      productCommentsCounter.textContent = (comments && comments.length > 0) ? comments.length : '';
    }

    if (!comments || comments.length === 0) {
      commentsList.innerHTML = '<div class="no-reviews" style="padding: 20px; text-align: center;">Нет комментариев</div>';
      return 0;
    }

    comments.forEach(comment => {
      const date = new Date(comment.created_at).toLocaleDateString('ru-RU');
      const userName = [comment.first_name, comment.last_name].filter(Boolean).join(' ') || comment.username;
      const canDelete = isLoggedIn() && getCurrentUser()?.id === comment.user_id;
      const isLiked = userCommentLikes.has(comment.id);
      const likeCount = parseInt(comment.like_count) || 0;

      // Generate avatar
      const initials = (comment.first_name?.[0] || comment.username?.[0] || '?').toUpperCase();
      const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#20B2AA', '#FF8C00'];
      const colorIndex = comment.user_id ? Math.abs(comment.user_id) % colors.length : 0;
      const bgColor = colors[colorIndex];

      // Respect hide_photo preference - use default avatar if user has hidden their photo
      const defaultAvatar = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect fill='${encodeURIComponent(bgColor)}' width='40' height='40'/%3E%3Ctext x='20' y='25' text-anchor='middle' fill='%23fff' font-size='18' font-weight='bold' font-family='Arial'%3E${initials}%3C/text%3E%3C/svg%3E`;
      const avatarUrl = (comment.hide_photo || !comment.photo_url) ? defaultAvatar : comment.photo_url;

      const commentDiv = document.createElement('div');
      commentDiv.className = 'product-comment-item';
      commentDiv.innerHTML = `
        <img src="${avatarUrl}" alt="" class="product-comment-avatar" loading="eager"/>
        <div class="product-comment-content">
          <div class="product-comment-header">
            <div class="product-comment-user">${escapeHtml(userName)}</div>
            ${canDelete ? `<button class="product-comment-delete" data-comment-id="${comment.id}">Удалить</button>` : ''}
          </div>
          <div class="product-comment-text">${escapeHtml(comment.comment_text)}</div>
          <div class="product-comment-footer">
            <div class="product-comment-date">${date}</div>
            <button class="product-comment-like ${isLiked ? 'liked' : ''}" data-comment-id="${comment.id}">
              <svg width="14" height="14"><use href="#favorite"></use></svg>
              <span>${likeCount}</span>
            </button>
          </div>
        </div>
      `;

      commentsList.appendChild(commentDiv);

      // Like button
      const likeBtn = commentDiv.querySelector('.product-comment-like');
      likeBtn?.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!isLoggedIn()) {
          showToast('Войдите чтобы поставить лайк', 'removed');
          return;
        }

        try {
          const response = await fetch(`/api/comments/${comment.id}/like`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('tributary_accessToken')}`,
              'Content-Type': 'application/json'
            }
          });

          if (response.ok) {
            const data = await response.json();
            if (data.liked) {
              userCommentLikes.add(comment.id);
              likeBtn.classList.add('liked');
            } else {
              userCommentLikes.delete(comment.id);
              likeBtn.classList.remove('liked');
            }

            // Update count
            const currentCount = parseInt(likeBtn.querySelector('span').textContent) || 0;
            likeBtn.querySelector('span').textContent = data.liked ? currentCount + 1 : Math.max(0, currentCount - 1);
          }
        } catch (err) {
          console.error('Error toggling comment like:', err);
          showToast('Ошибка при постановке лайка', 'removed');
        }
      });

      if (canDelete) {
        const deleteBtn = commentDiv.querySelector('.product-comment-delete');
        if (deleteBtn) {
          deleteBtn.addEventListener('click', async () => {
            showConfirmation('Удалить комментарий?', 'Это действие нельзя отменить.', async () => {
              try {
                await fetch(`/api/comments/${comment.id}`, {
                  method: 'DELETE',
                  headers: { 'Authorization': `Bearer ${localStorage.getItem('tributary_accessToken')}` }
                });
                renderProductComments(productId);
              } catch (err) {
                console.error('Error deleting comment:', err);
              }
            });
          });
        }
      }
    });

    return comments.length;
  } catch (err) {
    console.error('Error loading product comments:', err);
    return 0;
  }
};

// ============ COMMENT SUBMISSION ============

export const submitComment = async (commentText, productId = null) => {
  if (!isLoggedIn()) {
    showToast('Войдите чтобы оставить комментарий', 'removed');
    return false;
  }

  try {
    const response = await fetch('/api/comments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('tributary_accessToken')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        product_id: productId,
        comment_text: commentText
      })
    });

    if (response.ok) {
      showToast('Комментарий отправлен');

      // Reset form
      const formSection = document.querySelector('.comment-form');
      if (formSection) {
        const textarea = formSection.querySelector('.comment-form-textarea');
        if (textarea) textarea.value = '';
      }
      return true;
    } else {
      const error = await response.json().catch(() => ({}));
      showToast(error.message || 'Ошибка при отправке комментария', 'removed');
      return false;
    }
  } catch (err) {
    console.error('Error submitting comment:', err);
    showToast('Ошибка при отправке комментария', 'removed');
    return false;
  }
};
