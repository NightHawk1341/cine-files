// ============================================================
// PRODUCT REVIEWS MODULE
// Handles product reviews display and submission
// ============================================================

import { isLoggedIn, getCurrentUser } from '../../core/auth.js';
import { showSkeletonLoaders } from '../../modules/skeleton-loader.js';
import { escapeHtml } from '../../core/formatters.js';
import { uploadImageToServer } from '../../modules/image-upload.js';
import { createImageReloadOverlay } from '../../core/formatters.js';

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

// ============ REVIEWS RENDERING ============

const VK_COMMUNITY_URL = 'https://vk.com/buy_tribute';

export const renderProductReviews = async (productId, vkMarketUrl = null) => {
  const reviewsList = document.querySelector('.product-reviews-list');
  if (!reviewsList) {
    console.error('Product reviews list element not found');
    return;
  }

  // Show skeleton loaders while loading
  showSkeletonLoaders(reviewsList, 'review', 3);

  try {
    const response = await fetch(`/api/reviews/product/${productId}`);
    let reviews = await response.json();

    if (!Array.isArray(reviews)) {
      reviews = reviews.reviews || reviews.data || [];
    }

    // Load user's liked reviews if logged in
    let userReviewLikes = new Set();
    if (isLoggedIn()) {
      try {
        const likesResponse = await fetch('/api/reviews/likes', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('tributary_accessToken')}`
          }
        });
        if (likesResponse.ok) {
          const likedReviews = await likesResponse.json();
          userReviewLikes = new Set(likedReviews);
        }
      } catch (err) {
        console.error('Error loading liked reviews:', err);
      }
    }

    reviewsList.innerHTML = '';

    // Update counter for product reviews tab
    const productReviewsCounter = document.getElementById('product-reviews-counter');
    if (productReviewsCounter) {
      productReviewsCounter.textContent = (reviews && reviews.length > 0) ? reviews.length : '';
    }

    if (!reviews || reviews.length === 0) {
      reviewsList.innerHTML = '<div class="no-reviews" style="padding: 20px; text-align: center;">Нет отзывов</div>';
      appendVkReviewsButton(reviewsList, vkMarketUrl);
      return 0;
    }

    reviews.forEach(review => {
      const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
      const date = new Date(review.created_at).toLocaleDateString('ru-RU');
      const userName = [review.first_name, review.last_name].filter(Boolean).join(' ') || review.username;
      const canDelete = isLoggedIn() && getCurrentUser()?.id === review.user_id;

      // Generate avatar
      const initials = (review.first_name?.[0] || review.username?.[0] || '?').toUpperCase();
      const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#20B2AA', '#FF8C00'];
      const colorIndex = review.user_id ? Math.abs(review.user_id) % colors.length : 0;
      const bgColor = colors[colorIndex];

      // Respect hide_photo preference - use default avatar if user has hidden their photo
      const defaultAvatar = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect fill='${encodeURIComponent(bgColor)}' width='40' height='40'/%3E%3Ctext x='20' y='25' text-anchor='middle' fill='%23fff' font-size='18' font-weight='bold' font-family='Arial'%3E${initials}%3C/text%3E%3C/svg%3E`;
      const avatarUrl = (review.hide_photo || !review.photo_url) ? defaultAvatar : review.photo_url;

      let responseHTML = '';
      if (review.responses && review.responses.length > 0) {
        const resp = review.responses[0];
        responseHTML = `
          <div class="product-review-response">
            <div class="product-review-response-author">TR/BUTE</div>
            <div class="product-review-response-text">${escapeHtml(resp.response_text)}</div>
          </div>
        `;
      }

      // Review images
      let imagesHTML = '';
      if (review.images && review.images.length > 0) {
        imagesHTML = `<div class="product-review-images">` +
          review.images.map(img => `
            <div class="product-review-image" data-image-url="${escapeHtml(img.image_url)}">
              <img src="${escapeHtml(img.image_url)}" alt="Review image" loading="lazy">
            </div>
          `).join('') +
          `</div>`;
      }

      // Order-level review: show current product + others from order
      let orderContextHTML = '';
      if (review.order_id && review.order_products && review.order_products.length > 0) {
        const currentProduct = review.order_products.find(p => p.id === productId);
        const otherProducts = review.order_products.filter(p => p.id !== productId);
        if (currentProduct && otherProducts.length > 0) {
          orderContextHTML = `<div class="review-item-order-posters">${escapeHtml(currentProduct.title)} + ещё ${otherProducts.length} ${otherProducts.length === 1 ? 'постер' : otherProducts.length < 5 ? 'постера' : 'постеров'}</div>`;
        } else if (review.order_products.length > 1) {
          const otherCount = review.order_products.length - 1;
          orderContextHTML = `<div class="review-item-order-posters">${escapeHtml(review.order_products[0].title)} + ещё ${otherCount} ${otherCount === 1 ? 'постер' : otherCount < 5 ? 'постера' : 'постеров'}</div>`;
        }
      }

      // Like button with SVG icons
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
      reviewDiv.className = 'product-review-item';
      reviewDiv.innerHTML = `
        <img src="${avatarUrl}" alt="" class="product-review-avatar" loading="eager"/>
        <div class="product-review-content">
          <div class="product-review-header">
            <div>
              <div class="product-review-user">${escapeHtml(userName)}</div>
              <div class="product-review-rating"><span class="product-review-star">${stars}</span></div>
            </div>
            ${canDelete ? `<button class="review-item-delete" style="align-self: flex-start;" data-review-id="${review.id}">Удалить</button>` : ''}
          </div>
          ${orderContextHTML}
          <div class="product-review-text">${escapeHtml(review.review_text)}</div>
          ${imagesHTML}
          <div class="product-review-footer" style="display: flex; justify-content: space-between; align-items: center;">
            <div class="product-review-date">${date}</div>
            ${likeButton}
          </div>
          ${responseHTML}
        </div>
      `;

      reviewsList.appendChild(reviewDiv);

      // Add reload buttons for review images that fail to load
      reviewDiv.querySelectorAll('.product-review-image').forEach(imgContainer => {
        const img = imgContainer.querySelector('img');
        if (img) {
          const originalSrc = img.src;
          img.addEventListener('error', () => {
            createImageReloadOverlay(img, originalSrc, imgContainer);
          }, { once: true });
        }
      });

      if (canDelete) {
        const deleteBtn = reviewDiv.querySelector('.review-item-delete');
        if (deleteBtn) {
          deleteBtn.addEventListener('click', async () => {
            showConfirmation('Удалить отзыв?', 'Это действие нельзя отменить.', async () => {
              try {
                await fetch(`/api/reviews/${review.id}`, {
                  method: 'DELETE',
                  headers: { 'Authorization': `Bearer ${localStorage.getItem('tributary_accessToken')}` }
                });
                renderProductReviews(productId);
              } catch (err) {
                console.error('Error deleting review:', err);
              }
            });
          });
        }
      }

      if (isLoggedIn()) {
        const likeBtn = reviewDiv.querySelector('.review-like-btn');
        if (likeBtn) {
          likeBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
              const response = await fetch(`/api/reviews/${review.id}/like`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${localStorage.getItem('tributary_accessToken')}`,
                  'Content-Type': 'application/json'
                }
              });
              if (response.ok) {
                renderProductReviews(productId);
              }
            } catch (err) {
              console.error('Error toggling review like:', err);
              showToast('Ошибка при постановке лайка', 'removed');
            }
          });
        }
      }
    });

    // VK reviews button at the end of the list
    appendVkReviewsButton(reviewsList, vkMarketUrl);

    return reviews.length;
  } catch (err) {
    console.error('Error loading product reviews:', err);
    return 0;
  }
};

// ============ VK REVIEWS BUTTON ============

function appendVkReviewsButton(container, vkMarketUrl) {
  // Determine target URL: use product's VK Market URL if valid, otherwise fall back to community
  let href = VK_COMMUNITY_URL;
  if (vkMarketUrl && vkMarketUrl.trim()) {
    try {
      const url = new URL(vkMarketUrl.trim());
      if (url.hostname === 'vk.com' || url.hostname.endsWith('.vk.com')) {
        href = vkMarketUrl.trim();
      }
    } catch {
      // Invalid URL, use community fallback
    }
  }

  const btn = document.createElement('a');
  btn.href = href;
  btn.target = '_blank';
  btn.rel = 'noopener noreferrer';
  btn.className = 'vk-reviews-button';
  btn.textContent = 'Больше отзывов в нашем сообществе VK';
  container.appendChild(btn);
}

// ============ REVIEW SUBMISSION ============

export const submitProductReview = async (productId, rating, reviewText, pendingImageData = null) => {
  if (!isLoggedIn()) {
    showToast('Войдите чтобы оставить отзыв', 'removed');
    return;
  }

  const accessToken = localStorage.getItem('tributary_accessToken');

  try {
    // First, submit the review
    const response = await fetch('/api/reviews', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        productId,
        rating,
        reviewText
      })
    });

    if (!response.ok) {
      showToast('Ошибка при отправке отзыва', 'removed');
      return;
    }

    const reviewData = await response.json();
    const reviewId = reviewData.id || reviewData.review?.id;

    // If there's an image, upload it
    if (pendingImageData && reviewId) {
      try {
        // For URL sources, just save the URL to the review
        if (pendingImageData.source === 'url') {
          await fetch(`/api/reviews/${reviewId}/image`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ imageUrl: pendingImageData.originalUrl })
          });
        } else {
          // Upload file/camera image
          const uploadResult = await uploadImageToServer(pendingImageData, accessToken);
          if (uploadResult.success) {
            await fetch(`/api/reviews/${reviewId}/image`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ imageUrl: uploadResult.url })
            });
          }
        }
      } catch (imgErr) {
        console.error('Error uploading review image:', imgErr);
        // Review was submitted, but image failed - show partial success
        showToast('Отзыв отправлен (изображение не загружено)', 'info');
        renderProductReviews(productId);
        return;
      }
    }

    showToast('Отзыв отправлен');
    renderProductReviews(productId);

    // Reset form
    const formSection = document.querySelector('.review-form');
    if (formSection) {
      formSection.querySelector('.review-form-textarea').value = '';
      formSection.querySelectorAll('.review-star-btn').forEach(btn => btn.classList.remove('selected'));
    }
  } catch (err) {
    console.error('Error submitting review:', err);
    showToast('Ошибка при отправке отзыва', 'removed');
  }
};
