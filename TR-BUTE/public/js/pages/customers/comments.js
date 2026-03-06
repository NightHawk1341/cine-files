import { isLoggedIn, getCurrentUser } from '../../core/auth.js';
import { showSkeletonLoaders } from '../../modules/skeleton-loader.js';
import { escapeHtml, addImageSize } from '../../core/formatters.js';

let cachedAllComments = null;
let cachedCommentsTimestamp = 0;
let userCommentLikes = new Set();

let _getProducts = () => [];
let _getImages = () => new Map();

export const initComments = (getProducts, getImages) => {
  _getProducts = getProducts;
  _getImages = getImages;
};

export const getCachedComments = () => cachedAllComments;

export const invalidateCommentsCache = () => {
  cachedAllComments = null;
};

const filterImagesByExtra = (images, extras) => {
  if (!Array.isArray(images)) return [];
  return images.filter(img => {
    const extra = typeof img === 'string' ? null : img.extra;
    return extras.includes(extra);
  });
};

export const displayCommentsInPopup = (comments, commentsList) => {
  if (!commentsList) {
    console.error('commentsList is null or undefined');
    return;
  }

  const commentsCounter = document.getElementById('comments-counter');
  if (commentsCounter) {
    commentsCounter.textContent = (comments && comments.length > 0) ? comments.length : '';
  }

  commentsList.innerHTML = '';

  if (!comments || comments.length === 0) {
    commentsList.innerHTML = '<div class="no-reviews">Нет комментариев</div>';
    return;
  }

  const allProducts = _getProducts();
  const allImagesByProduct = _getImages();

  comments.forEach(comment => {
    const date = new Date(comment.created_at).toLocaleDateString('ru-RU');
    const userName = [comment.first_name, comment.last_name].filter(Boolean).join(' ') || comment.username;
    const canDelete = isLoggedIn() && getCurrentUser()?.id === comment.user_id;
    const isLiked = userCommentLikes.has(comment.id);
    const likeCount = parseInt(comment.like_count) || 0;

    const initials = (comment.first_name?.[0] || comment.username?.[0] || '?').toUpperCase();
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#20B2AA', '#FF8C00'];
    const colorIndex = comment.user_id ? Math.abs(comment.user_id) % colors.length : 0;
    const bgColor = colors[colorIndex];

    const defaultAvatar = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect fill='${encodeURIComponent(bgColor)}' width='40' height='40'/%3E%3Ctext x='20' y='25' text-anchor='middle' fill='%23fff' font-size='18' font-weight='bold' font-family='Arial'%3E${initials}%3C/text%3E%3C/svg%3E`;
    const avatarUrl = (comment.hide_photo || !comment.photo_url) ? defaultAvatar : comment.photo_url;

    let productInfo = '';
    let productImage = '';
    let productUrl = '';
    if (comment.product_id) {
      const product = allProducts.find(p => p.id === comment.product_id);
      if (product) {
        const productParam = product.slug || product.id;
        productUrl = `/product?id=${productParam}`;

        const images = allImagesByProduct.get(product.id) || [];
        const filtered = filterImagesByExtra(images, ['варианты']);
        let productImageUrl = 'https://placeholder.com/60x60';

        if (filtered.length > 0) {
          productImageUrl = typeof filtered[0] === 'string' ? filtered[0] : filtered[0].url || filtered[0];
        } else if (product.image) {
          productImageUrl = product.image;
        }

        const imageUrl = addImageSize(productImageUrl, '480x0');

        productImage = `
          <div class="comment-item-product-image-wrapper">
            <a href="${productUrl}" class="comment-item-product-image-link" style="text-decoration: none;">
              <img src="${imageUrl}" alt="" class="comment-item-product-image" loading="eager"/>
            </a>
            <img src="${avatarUrl}" alt="" class="comment-item-avatar" loading="eager"/>
          </div>
        `;
        productInfo = `<a href="${productUrl}" class="comment-item-product" data-product-id="${comment.product_id}" style="text-decoration: none; color: inherit;">${escapeHtml(product.title)}</a>`;
      }
    } else {
      productImage = `<img src="${avatarUrl}" alt="" class="comment-item-avatar product-review-avatar" loading="eager"/>`;
    }

    const commentDiv = document.createElement('div');
    commentDiv.className = comment.product_id ? 'comment-item' : 'comment-item product-review-item';
    commentDiv.innerHTML = `
      ${productImage}
      <div class="comment-item-content ${comment.product_id ? '' : 'product-review-content'}">
        <div class="comment-item-header">
          <div class="comment-item-user-info">
            <div class="comment-item-user ${comment.product_id ? '' : 'product-review-user'}">${escapeHtml(userName)}</div>
            ${productInfo}
          </div>
          ${canDelete ? `<button class="comment-item-delete" data-comment-id="${comment.id}">Удалить</button>` : ''}
        </div>
        <div class="comment-item-text ${comment.product_id ? '' : 'product-review-text'}">${escapeHtml(comment.comment_text)}</div>
        <div class="comment-item-footer ${comment.product_id ? '' : 'product-review-footer'}">
          <div class="comment-item-date ${comment.product_id ? '' : 'product-review-date'}">${date}</div>
          <button class="comment-item-like ${isLiked ? 'liked' : ''}" data-comment-id="${comment.id}">
            <svg width="14" height="14"><use href="#favorite"></use></svg>
            <span>${likeCount}</span>
          </button>
        </div>
      </div>
    `;

    commentsList.appendChild(commentDiv);

    if (comment.product_id) {
      const productLink = commentDiv.querySelector('.comment-item-product');
      productLink?.addEventListener('click', (e) => {
        if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          const href = productLink.getAttribute('href');
          if (typeof smoothNavigate === 'function') {
            smoothNavigate(href);
          } else {
            window.location.href = href;
          }
        }
      });

      const productImgLink = commentDiv.querySelector('.comment-item-product-image-link');
      productImgLink?.addEventListener('click', (e) => {
        if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          const href = productImgLink.getAttribute('href');
          if (typeof smoothNavigate === 'function') {
            smoothNavigate(href);
          } else {
            window.location.href = href;
          }
        }
      });
    }

    const likeBtn = commentDiv.querySelector('.comment-item-like');
    likeBtn?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (!isLoggedIn()) {
        window.showToast('Войдите чтобы поставить лайк', 'removed');
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

          const currentCount = parseInt(likeBtn.querySelector('span').textContent) || 0;
          likeBtn.querySelector('span').textContent = data.liked ? currentCount + 1 : Math.max(0, currentCount - 1);

          cachedAllComments = null;
        }
      } catch (err) {
        console.error('Error toggling comment like:', err);
        window.showToast('Ошибка при постановке лайка', 'removed');
      }
    });

    if (canDelete) {
      const deleteBtn = commentDiv.querySelector('.comment-item-delete');
      deleteBtn?.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const confirmed = await window.mobileModal.confirmDanger('Это действие нельзя отменить.', 'Удалить комментарий?');
        if (!confirmed) return;

        try {
          const response = await fetch(`/api/comments/${comment.id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('tributary_accessToken')}`,
              'Content-Type': 'application/json'
            }
          });

          if (response.ok) {
            cachedAllComments = null;
            renderCommentsPopup();
            window.showToast('Комментарий удалён');
          } else {
            window.showToast('Ошибка при удалении', 'removed');
          }
        } catch (err) {
          console.error('Error deleting comment:', err);
          window.showToast('Ошибка при удалении', 'removed');
        }
      });
    }
  });
};

export const renderCommentsPopup = async () => {
  const commentsList = document.getElementById('comments-list');

  if (!commentsList) {
    console.error('Could not find comments-list element');
    return;
  }

  const now = Date.now();

  if (cachedAllComments && now - cachedCommentsTimestamp < 300000) {
    displayCommentsInPopup(cachedAllComments, commentsList);
    return;
  }

  showSkeletonLoaders(commentsList, 'review', 3);

  try {
    if (isLoggedIn()) {
      const likesResponse = await fetch('/api/comments/likes', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('tributary_accessToken')}`
        }
      });
      if (likesResponse.ok) {
        const likedIds = await likesResponse.json();
        userCommentLikes = new Set(likedIds);
      }
    }

    const response = await fetch('/api/comments');
    cachedAllComments = await response.json();
    cachedCommentsTimestamp = now;
    displayCommentsInPopup(cachedAllComments, commentsList);
  } catch (err) {
    console.error('Error loading comments:', err);
    if (commentsList) {
      commentsList.innerHTML = '<div class="no-reviews">Ошибка загрузки комментариев</div>';
    }
  }
};

export const submitComment = async (commentText, productId = null) => {
  if (!isLoggedIn()) {
    window.showToast('Войдите чтобы оставить комментарий', 'removed');
    return;
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
      window.showToast('Комментарий отправлен');
      cachedAllComments = null;
      renderCommentsPopup();

      const formSection = document.querySelector('.comment-form');
      if (formSection) {
        formSection.querySelector('.comment-form-textarea').value = '';
      }
    } else {
      window.showToast('Ошибка при отправке комментария', 'removed');
    }
  } catch (err) {
    console.error('Error submitting comment:', err);
    window.showToast('Ошибка при отправке комментария', 'removed');
  }
};
