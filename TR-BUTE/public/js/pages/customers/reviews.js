import { isLoggedIn, getCurrentUser } from '../../core/auth.js';
import { showSkeletonLoaders } from '../../modules/skeleton-loader.js';
import { escapeHtml, addImageSize } from '../../core/formatters.js';

let cachedAllReviews = null;
let cachedReviewsTimestamp = 0;
let userReviewLikes = new Set();

let _getProducts = () => [];
let _getImages = () => new Map();

export const initReviews = (getProducts, getImages) => {
  _getProducts = getProducts;
  _getImages = getImages;
};

export const invalidateReviewsCache = () => {
  cachedAllReviews = null;
};

const filterImagesByExtra = (images, extras) => {
  if (!Array.isArray(images)) return [];
  return images.filter(img => {
    const extra = typeof img === 'string' ? null : img.extra;
    return extras.includes(extra);
  });
};

const loadUserReviewLikes = async () => {
  if (!isLoggedIn()) return;

  try {
    const response = await fetch('/api/reviews/likes', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('tributary_accessToken')}`
      }
    });
    if (response.ok) {
      const likedIds = await response.json();
      userReviewLikes = new Set(likedIds);
    }
  } catch (err) {
    console.error('Error loading review likes:', err);
  }
};

const toggleReviewLike = async (reviewId) => {
  if (!isLoggedIn()) {
    window.showToast('Войдите чтобы поставить лайк', 'removed');
    return;
  }

  try {
    const response = await fetch(`/api/reviews/${reviewId}/like`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('tributary_accessToken')}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      cachedAllReviews = null;
      await renderReviewsPopup();
    }
  } catch (err) {
    console.error('Error toggling review like:', err);
    window.showToast('Ошибка при постановке лайка', 'removed');
  }
};

const displayReviewsInPopup = (reviews, reviewsList) => {
  if (!reviewsList) {
    console.error('reviewsList is null or undefined');
    return;
  }

  reviewsList.innerHTML = '';

  const reviewsCounter = document.getElementById('reviews-counter');
  if (reviewsCounter) {
    reviewsCounter.textContent = (reviews && reviews.length > 0) ? reviews.length : '';
  }

  if (!reviews || reviews.length === 0) {
    reviewsList.innerHTML = '<div class="no-reviews">Нет отзывов</div>';
    return;
  }

  const allProducts = _getProducts();
  const allImagesByProduct = _getImages();

  reviews.forEach(review => {
    const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
    const date = new Date(review.created_at).toLocaleDateString('ru-RU');
    const userName = [review.first_name, review.last_name].filter(Boolean).join(' ') || review.username;
    const canDelete = isLoggedIn() && getCurrentUser()?.id === review.user_id;

    const initials = (review.first_name?.[0] || review.username?.[0] || '?').toUpperCase();
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#20B2AA', '#FF8C00'];
    const colorIndex = review.user_id ? Math.abs(review.user_id) % colors.length : 0;
    const bgColor = colors[colorIndex];

    const avatarUrl = review.photo_url || `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect fill='${encodeURIComponent(bgColor)}' width='40' height='40'/%3E%3Ctext x='20' y='25' text-anchor='middle' fill='%23fff' font-size='18' font-weight='bold' font-family='Arial'%3E${initials}%3C/text%3E%3C/svg%3E`;

    let responseHTML = '';
    if (review.response_text) {
      responseHTML = `
        <div class="review-item-response">
          <div class="review-item-response-author">TR/BUTE</div>
          <div class="review-item-response-text">${escapeHtml(review.response_text)}</div>
        </div>
      `;
    }

    const likeCount = review.like_count || 0;
    const isLiked = userReviewLikes.has(review.id);
    const heartFilled = '<svg width="16" height="16" style="color: var(--favorite-color, #e91e63);"><use href="#heart-like"></use></svg>';
    const heartOutline = '<svg width="16" height="16" style="color: #818181;"><use href="#heart-like-outline"></use></svg>';
    const likeButton = isLoggedIn() ? `
      <button class="review-like-btn ${isLiked ? 'liked' : ''}" data-review-id="${review.id}" style="background: none; border: none; padding: 4px 8px; cursor: pointer; display: flex; align-items: center; gap: 4px; color: ${isLiked ? 'var(--favorite-color, #e91e63)' : 'var(--text-tertiary, #818181)'}; transition: color 0.2s;">
        ${isLiked ? heartFilled : heartOutline}
        <span>${likeCount}</span>
      </button>
    ` : (likeCount > 0 ? `<span style="padding: 4px 8px; color: #818181; font-size: 14px; display: flex; align-items: center; gap: 4px;">${heartFilled} ${likeCount}</span>` : '');

    const reviewDiv = document.createElement('div');

    if (!review.product_id) {
      const orderPostersHTML = review.order_products && review.order_products.length > 0
        ? `<div class="review-item-order-posters">Постеры в заказе: ${review.order_products.map(p => escapeHtml(p.title)).join(', ')}</div>`
        : '';

      reviewDiv.className = 'review-item product-review-item';
      reviewDiv.innerHTML = `
        <img src="${avatarUrl}" alt="" class="product-review-avatar" loading="eager"/>
        <div class="product-review-content">
          <div class="product-review-header">
            <div>
              <div class="product-review-user">${escapeHtml(userName)}</div>
              <div class="product-review-rating"><span class="product-review-star">${stars}</span></div>
            </div>
            ${canDelete ? `<button class="review-item-delete" data-review-id="${review.id}" style="align-self: flex-start; padding: 4px 8px; font-size: 12px;">Удалить</button>` : ''}
          </div>
          ${orderPostersHTML}
          <div class="product-review-text">${escapeHtml(review.review_text)}</div>
          <div class="product-review-footer" style="display: flex; justify-content: space-between; align-items: center;">
            <div class="product-review-date">${date}</div>
            ${likeButton}
          </div>
          ${responseHTML}
        </div>
      `;
    } else {
      let productImageUrl = 'https://placeholder.com/200x240';
      const product = allProducts.find(p => p.id === review.product_id);
      if (product) {
        const images = allImagesByProduct.get(product.id) || [];
        const filtered = filterImagesByExtra(images, ['сборка обложки', 'варианты', 'приближение']);
        if (filtered.length > 0) {
          productImageUrl = typeof filtered[0] === 'string' ? filtered[0] : filtered[0].url || filtered[0];
        } else if (product.image) {
          productImageUrl = product.image;
        }
      }
      productImageUrl = addImageSize(productImageUrl, '480x0');

      reviewDiv.className = 'review-item';
      const productParam = product ? (product.slug || product.id) : review.product_id;
      const productUrl = `/product?id=${productParam}`;

      reviewDiv.innerHTML = `
        <div class="review-item-product-image">
          <a href="${productUrl}" class="review-item-product-img-link" style="text-decoration: none;">
            <img src="${productImageUrl}" alt="" class="review-item-product-img" data-product-id="${review.product_id}" loading="eager"/>
          </a>
          <img src="${avatarUrl}" alt="" class="review-item-avatar" loading="eager"/>
        </div>
        <div class="review-item-content">
          <div class="review-item-header">
            <div>
              <a href="${productUrl}" class="review-item-product" data-product-id="${review.product_id}" style="text-decoration: none; color: inherit; display: block;">${escapeHtml(review.product_title)}</a>
              <div class="review-item-user">${escapeHtml(userName)}</div>
            </div>
            ${canDelete ? `<button class="review-item-delete" data-review-id="${review.id}" style="padding: 4px 8px; font-size: 12px;">Удалить</button>` : ''}
          </div>
          <div class="review-item-rating">
            <span class="review-item-star">${stars}</span>
          </div>
          <div class="review-item-text">${escapeHtml(review.review_text)}</div>
          <div class="review-item-footer" style="display: flex; justify-content: space-between; align-items: center;">
            <div class="review-item-date">${date}</div>
            ${likeButton}
          </div>
          ${responseHTML}
        </div>
      `;

      const productImgLink = reviewDiv.querySelector('.review-item-product-img-link');
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

      const productLink = reviewDiv.querySelector('.review-item-product');
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
    }

    reviewsList.appendChild(reviewDiv);

    if (canDelete) {
      const deleteBtn = reviewDiv.querySelector('.review-item-delete');
      deleteBtn?.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const confirmed = await window.mobileModal.confirmDanger('Это действие нельзя отменить.', 'Удалить отзыв?');
        if (!confirmed) return;

        try {
          const accessToken = localStorage.getItem('tributary_accessToken');
          const response = await fetch(`/api/reviews/${review.id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          });

          if (response.ok) {
            cachedAllReviews = null;
            renderReviewsPopup();
            window.showToast('Отзыв удалён');
          } else {
            const error = await response.json();
            window.showToast('Ошибка при удалении: ' + (error.error || 'неизвестная ошибка'), 'removed');
          }
        } catch (err) {
          console.error('Error deleting review:', err);
          window.showToast('Ошибка: ' + err.message, 'removed');
        }
      });
    }

    if (isLoggedIn()) {
      const likeBtn = reviewDiv.querySelector('.review-like-btn');
      likeBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleReviewLike(review.id);
      });
    }
  });
};

export const renderReviewsPopup = async () => {
  const reviewsList = document.getElementById('reviews-list');

  if (!reviewsList) {
    console.error('Could not find reviews-list element');
    return;
  }

  await loadUserReviewLikes();

  const now = Date.now();

  if (cachedAllReviews && now - cachedReviewsTimestamp < 300000) {
    displayReviewsInPopup(cachedAllReviews, reviewsList);
    return;
  }

  showSkeletonLoaders(reviewsList, 'review', 3);

  try {
    const response = await fetch('/api/reviews');
    const result = await response.json();
    cachedAllReviews = Array.isArray(result) ? result : (result.data || []);
    cachedReviewsTimestamp = now;
    displayReviewsInPopup(cachedAllReviews, reviewsList);
  } catch (err) {
    console.error('Error loading reviews:', err);
    if (reviewsList) {
      reviewsList.innerHTML = '<div class="no-reviews">Ошибка загрузки отзывов</div>';
    }
  }
};
