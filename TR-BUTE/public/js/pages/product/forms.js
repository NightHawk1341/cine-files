// ============================================================
// PRODUCT FORMS MODULE
// Handles review and comment form initialization
// ============================================================

import { isLoggedIn, getCurrentUser } from '../../core/auth.js';
import { isAdmin } from '../../core/state.js';
import { currentProduct } from './data.js';
import { submitProductReview } from './reviews.js';
import { submitComment, renderProductComments } from './comments.js';
import { showImageUploadModal } from '../../modules/image-upload-modal.js';
import { getPendingImageForContext, removePendingImagesForContext } from '../../modules/image-upload.js';
import { initEmojiSuggestions } from '../../modules/emoji-suggestions.js';

// ============ TOAST NOTIFICATION ============
// Use global toast module for consistent styling and behavior
const showToast = (message, type = 'success') => {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
  }
};

// ============ REVIEW FORM ============

export const updateProductReviewForm = async () => {
  const productReviewForm = document.getElementById('product-review-form');
  if (!productReviewForm) return;

  const currentlyLoggedIn = isLoggedIn();
  const loginPrompt = document.getElementById('product-review-login-prompt');
  const formContent = document.getElementById('product-review-form-content');
  const starsContainer = productReviewForm.querySelector('.review-form-stars');

  if (!currentlyLoggedIn) {
    // Show login prompt, hide form
    if (loginPrompt) {
      loginPrompt.innerHTML = '<button type="button" class="login-prompt-link">Войдите</button>, чтобы оставить отзыв';
      loginPrompt.classList.add('active');
      loginPrompt.querySelector('.login-prompt-link').addEventListener('click', () => {
        if (typeof smoothNavigate === 'function') smoothNavigate('/profile');
        else window.location.href = '/profile';
      });
    }
    if (formContent) formContent.classList.add('hidden');
    productReviewForm.dataset.initialized = '';
  } else if (starsContainer && !productReviewForm.dataset.initialized) {
    // Check if user has purchased this product (skip for admins)
    if (currentProduct && currentProduct.id && !isAdmin) {
      try {
        const verifyResponse = await fetch(`/api/reviews/verify-purchase?product_id=${currentProduct.id}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('tributary_accessToken')}`
          }
        });
        const verifyData = await verifyResponse.json();

        if (!verifyData.verified_purchase) {
          // User hasn't purchased, show message and hide form
          if (loginPrompt) {
            loginPrompt.textContent = 'Только покупатели могут оставлять отзывы на этот товар';
            loginPrompt.classList.add('active');
          }
          if (formContent) formContent.classList.add('hidden');
          productReviewForm.dataset.initialized = '';
          return;
        }
      } catch (err) {
        console.error('Error verifying purchase:', err);
        // On error, allow form to show (fallback to backend validation)
      }
    }

    // Hide login prompt, show form
    if (loginPrompt) loginPrompt.classList.remove('active');
    if (formContent) formContent.classList.remove('hidden');

    // Form exists in HTML with stars, just need to set up event listeners
    productReviewForm.dataset.initialized = 'true';

    const stars = productReviewForm.querySelectorAll('.review-star-btn');
    const textarea = productReviewForm.querySelector('.review-form-textarea');
    const submitBtn = productReviewForm.querySelector('.review-form-button');
    let selectedRating = 0;

    // Star hover and click handlers
    stars.forEach(star => {
      const rating = parseInt(star.dataset.rating);

      star.addEventListener('mouseenter', () => {
        // Add hovered class to all stars up to and including this one
        stars.forEach((s, idx) => {
          s.classList.toggle('hovered', idx < rating);
        });
      });

      star.addEventListener('click', () => {
        // Click-to-remove: if clicking the same star, deselect all
        if (selectedRating === rating) {
          selectedRating = 0;
          stars.forEach(s => {
            s.classList.remove('selected');
          });
        } else {
          selectedRating = rating;
          stars.forEach((s, idx) => {
            s.classList.toggle('selected', idx < rating);
          });
        }
      });

      star.addEventListener('mouseleave', () => {
        // Remove all hover classes - selected classes remain
        stars.forEach(s => {
          s.classList.remove('hovered');
        });
      });
    });

    // Auto-expand textarea
    if (textarea) {
      textarea.addEventListener('input', () => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
      });

      textarea.addEventListener('focus', () => {
        const fullViewportHeight = window.innerHeight;
        setTimeout(() => {
          const headerHeight = document.querySelector('.header')?.offsetHeight || 60;
          const rect = textarea.getBoundingClientRect();
          const isAboveViewport = rect.top < headerHeight;
          const isBelowViewport = rect.bottom > fullViewportHeight;
          if (isAboveViewport || isBelowViewport) {
            if (isBelowViewport) {
              const bottomNavEl = window.innerWidth <= 1024 ? document.querySelector('.bottom-nav') : null;
              const bottomNavHeight = bottomNavEl ? bottomNavEl.offsetHeight : 0;
              window.scrollTo({ top: window.pageYOffset + rect.bottom - fullViewportHeight + 20 + bottomNavHeight, behavior: 'smooth' });
            } else {
              window.scrollTo({ top: window.pageYOffset + rect.top - headerHeight - 10, behavior: 'smooth' });
            }
          }
        }, 300);
      });

      // Initialize emoji suggestions for review textarea
      initEmojiSuggestions(textarea);
    }

    // Image upload button handler
    const addPhotoBtn = productReviewForm.querySelector('#review-add-photo-btn');
    const imagePreview = productReviewForm.querySelector('#review-image-preview');
    const previewImg = imagePreview?.querySelector('img');
    const removePreviewBtn = imagePreview?.querySelector('.review-image-preview-remove');
    let pendingImageData = null;

    // Check for existing pending image
    if (currentProduct) {
      const existing = getPendingImageForContext('review', String(currentProduct.id));
      if (existing) {
        pendingImageData = existing;
        if (previewImg && imagePreview) {
          previewImg.src = existing.dataUrl;
          imagePreview.classList.add('active');
          if (addPhotoBtn) {
            addPhotoBtn.querySelector('span').textContent = 'Заменить фото';
          }
        }
      }
    }

    if (addPhotoBtn) {
      addPhotoBtn.addEventListener('click', async () => {
        if (!currentProduct) return;

        const result = await showImageUploadModal({
          type: 'review',
          contextId: String(currentProduct.id),
          title: pendingImageData ? 'Заменить фото' : 'Добавить фото',
          urlFirst: false,
          allowReplace: !!pendingImageData,
          onSelect: (imageData) => {
            pendingImageData = imageData;
            if (previewImg && imagePreview) {
              previewImg.src = imageData.dataUrl;
              imagePreview.classList.add('active');
            }
            addPhotoBtn.querySelector('span').textContent = 'Заменить фото';
          },
          onRemove: () => {
            pendingImageData = null;
            if (imagePreview) {
              imagePreview.classList.remove('active');
            }
            addPhotoBtn.querySelector('span').textContent = 'Добавить фото';
          }
        });
      });
    }

    if (removePreviewBtn) {
      removePreviewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentProduct) {
          removePendingImagesForContext('review', String(currentProduct.id));
        }
        pendingImageData = null;
        if (imagePreview) {
          imagePreview.classList.remove('active');
          if (previewImg) previewImg.src = '';
        }
        if (addPhotoBtn) {
          addPhotoBtn.querySelector('span').textContent = 'Добавить фото';
        }
      });
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', async () => {
        if (!currentProduct) {
          showToast('Ошибка: продукт не выбран', 'removed');
          return;
        }

        if (selectedRating === 0) {
          showToast('Выберите оценку', 'removed');
          return;
        }
        if (!textarea.value.trim()) {
          showToast('Напишите отзыв', 'removed');
          return;
        }

        // Pass pending image data to review submission
        await submitProductReview(currentProduct.id, selectedRating, textarea.value.trim(), pendingImageData);

        // Reset form
        textarea.value = '';
        selectedRating = 0;
        stars.forEach(s => s.classList.remove('selected'));

        // Clear image
        pendingImageData = null;
        if (imagePreview) {
          imagePreview.classList.remove('active');
          if (previewImg) previewImg.src = '';
        }
        if (addPhotoBtn) {
          addPhotoBtn.querySelector('span').textContent = 'Добавить фото';
        }

        // Clear pending image from localStorage
        removePendingImagesForContext('review', String(currentProduct.id));
      });
    }
  }
};

// ============ COMMENT FORM ============

export const updateProductCommentForm = () => {
  const productCommentForm = document.getElementById('product-comment-form');
  if (!productCommentForm) return;

  const currentlyLoggedIn = isLoggedIn();
  const loginPrompt = document.getElementById('product-comment-login-prompt');
  const formContent = document.getElementById('product-comment-form-content');
  const textarea = productCommentForm.querySelector('.comment-form-textarea');

  if (!currentlyLoggedIn) {
    // Show login prompt, hide form
    if (loginPrompt) loginPrompt.classList.add('active');
    if (formContent) formContent.classList.add('hidden');
    productCommentForm.dataset.initialized = '';
  } else if (textarea && !productCommentForm.dataset.initialized) {
    // Hide login prompt, show form
    if (loginPrompt) loginPrompt.classList.remove('active');
    if (formContent) formContent.classList.remove('hidden');

    productCommentForm.dataset.initialized = 'true';

    const submitBtn = productCommentForm.querySelector('.comment-form-button');

    // Auto-expand textarea
    if (textarea) {
      textarea.addEventListener('input', () => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
      });

      textarea.addEventListener('focus', () => {
        const fullViewportHeight = window.innerHeight;
        setTimeout(() => {
          const headerHeight = document.querySelector('.header')?.offsetHeight || 60;
          const rect = textarea.getBoundingClientRect();
          const isAboveViewport = rect.top < headerHeight;
          const isBelowViewport = rect.bottom > fullViewportHeight;
          if (isAboveViewport || isBelowViewport) {
            if (isBelowViewport) {
              const bottomNavEl = window.innerWidth <= 1024 ? document.querySelector('.bottom-nav') : null;
              const bottomNavHeight = bottomNavEl ? bottomNavEl.offsetHeight : 0;
              window.scrollTo({ top: window.pageYOffset + rect.bottom - fullViewportHeight + 20 + bottomNavHeight, behavior: 'smooth' });
            } else {
              window.scrollTo({ top: window.pageYOffset + rect.top - headerHeight - 10, behavior: 'smooth' });
            }
          }
        }, 300);
      });

      // Initialize emoji suggestions for comment textarea
      initEmojiSuggestions(textarea);
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', async () => {
        if (!currentProduct) {
          showToast('Ошибка: продукт не выбран', 'removed');
          return;
        }

        if (!textarea.value.trim()) {
          showToast('Напишите комментарий', 'removed');
          return;
        }

        const success = await submitComment(textarea.value.trim(), currentProduct.id);
        if (success) {
          textarea.value = '';
          textarea.style.height = 'auto';

          // Reload comments for this product in the comments tab
          await renderProductComments(currentProduct.id);
        }
      });
    }
  }
};
