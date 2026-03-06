import { isLoggedIn, getCurrentUser } from '../../core/auth.js';
import { escapeHtml } from '../../core/formatters.js';

let cachedAllSuggestions = null;
let cachedSuggestionsTimestamp = 0;
let userSuggestionUpvotes = new Set();

export const getCachedSuggestions = () => cachedAllSuggestions;

export const invalidateSuggestionsCache = () => {
  cachedAllSuggestions = null;
  cachedSuggestionsTimestamp = 0;
};

export const displaySuggestionsInPopup = (suggestions, suggestionsList) => {
  if (!suggestionsList) {
    console.error('suggestionsList is null or undefined');
    return;
  }

  const suggestionsCounter = document.getElementById('suggestions-counter');
  if (suggestionsCounter) {
    suggestionsCounter.textContent = (suggestions && suggestions.length > 0) ? suggestions.length : '';
  }

  suggestionsList.innerHTML = '';

  if (!suggestions || suggestions.length === 0) {
    suggestionsList.innerHTML = '<div class="no-reviews">Нет предложений</div>';
    return;
  }

  suggestions.forEach(suggestion => {
    const date = new Date(suggestion.created_at).toLocaleDateString('ru-RU');
    const userName = [suggestion.first_name, suggestion.last_name].filter(Boolean).join(' ') || suggestion.username;
    const canDelete = isLoggedIn() && getCurrentUser()?.id === suggestion.user_id;
    const isUpvoted = userSuggestionUpvotes.has(suggestion.id);
    const upvoteCount = parseInt(suggestion.upvote_count) || 0;

    const initials = (suggestion.first_name?.[0] || suggestion.username?.[0] || '?').toUpperCase();
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#20B2AA', '#FF8C00'];
    const colorIndex = suggestion.user_id ? Math.abs(suggestion.user_id) % colors.length : 0;
    const bgColor = colors[colorIndex];

    const defaultAvatar = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect fill='${encodeURIComponent(bgColor)}' width='40' height='40'/%3E%3Ctext x='20' y='25' text-anchor='middle' fill='%23fff' font-size='18' font-weight='bold' font-family='Arial'%3E${initials}%3C/text%3E%3C/svg%3E`;
    const avatarUrl = (suggestion.hide_photo || !suggestion.photo_url) ? defaultAvatar : suggestion.photo_url;

    const suggestionDiv = document.createElement('div');
    suggestionDiv.className = 'suggestion-item';
    suggestionDiv.innerHTML = `
      <img src="${avatarUrl}" alt="" class="suggestion-item-avatar" loading="eager"/>
      <div class="suggestion-item-content">
        <div class="suggestion-item-header">
          <div class="suggestion-item-user">${escapeHtml(userName)}</div>
          ${canDelete ? `<button class="suggestion-item-delete" data-suggestion-id="${suggestion.id}">Удалить</button>` : ''}
        </div>
        <div class="suggestion-item-text">${escapeHtml(suggestion.suggestion_text)}</div>
        <div class="suggestion-item-footer">
          <div class="suggestion-item-date">${date}</div>
          <button class="suggestion-item-upvote ${isUpvoted ? 'upvoted' : ''}" data-suggestion-id="${suggestion.id}">
            <svg width="14" height="14"><use href="#favorite"></use></svg>
            <span>${upvoteCount}</span>
          </button>
        </div>
      </div>
    `;

    suggestionsList.appendChild(suggestionDiv);

    const upvoteBtn = suggestionDiv.querySelector('.suggestion-item-upvote');
    upvoteBtn?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (!isLoggedIn()) {
        window.showToast('Войдите чтобы проголосовать', 'removed');
        return;
      }

      try {
        const response = await fetch(`/api/suggestions/${suggestion.id}/upvote`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('tributary_accessToken')}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          if (data.liked) {
            userSuggestionUpvotes.add(suggestion.id);
            upvoteBtn.classList.add('upvoted');
          } else {
            userSuggestionUpvotes.delete(suggestion.id);
            upvoteBtn.classList.remove('upvoted');
          }

          const currentCount = parseInt(upvoteBtn.querySelector('span').textContent) || 0;
          upvoteBtn.querySelector('span').textContent = data.liked ? currentCount + 1 : Math.max(0, currentCount - 1);

          cachedAllSuggestions = null;
        }
      } catch (err) {
        console.error('Error toggling suggestion upvote:', err);
        window.showToast('Ошибка при голосовании', 'removed');
      }
    });

    if (canDelete) {
      const deleteBtn = suggestionDiv.querySelector('.suggestion-item-delete');
      deleteBtn?.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const confirmed = await window.mobileModal.confirmDanger('Это действие нельзя отменить.', 'Удалить предложение?');
        if (!confirmed) return;

        try {
          const response = await fetch(`/api/suggestions/${suggestion.id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('tributary_accessToken')}`,
              'Content-Type': 'application/json'
            }
          });

          if (response.ok) {
            cachedAllSuggestions = null;
            renderSuggestionsPopup();
            window.showToast('Предложение удалено');
          } else {
            window.showToast('Ошибка при удалении', 'removed');
          }
        } catch (err) {
          console.error('Error deleting suggestion:', err);
          window.showToast('Ошибка при удалении', 'removed');
        }
      });
    }
  });
};

export const renderSuggestionsPopup = async () => {
  const suggestionsList = document.getElementById('suggestions-list');

  if (!suggestionsList) {
    console.error('Could not find suggestions-list element');
    return;
  }

  const now = Date.now();

  if (cachedAllSuggestions && now - cachedSuggestionsTimestamp < 300000) {
    displaySuggestionsInPopup(cachedAllSuggestions, suggestionsList);
    return;
  }

  const { showSkeletonLoaders } = await import('../../modules/skeleton-loader.js');
  showSkeletonLoaders(suggestionsList, 'review', 3);

  try {
    if (isLoggedIn()) {
      const upvotesResponse = await fetch('/api/suggestions/upvotes', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('tributary_accessToken')}`
        }
      });
      if (upvotesResponse.ok) {
        const upvotedIds = await upvotesResponse.json();
        userSuggestionUpvotes = new Set(upvotedIds);
      }
    }

    const response = await fetch('/api/suggestions');
    cachedAllSuggestions = await response.json();
    cachedSuggestionsTimestamp = now;
    displaySuggestionsInPopup(cachedAllSuggestions, suggestionsList);
  } catch (err) {
    console.error('Error loading suggestions:', err);
    if (suggestionsList) {
      suggestionsList.innerHTML = '<div class="no-reviews">Ошибка загрузки предложений</div>';
    }
  }
};

export const submitSuggestion = async (suggestionText) => {
  if (!isLoggedIn()) {
    window.showToast('Войдите чтобы оставить предложение', 'removed');
    return false;
  }

  try {
    const response = await fetch('/api/suggestions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('tributary_accessToken')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        suggestion_text: suggestionText
      })
    });

    if (response.ok) {
      window.showToast('Предложение отправлено');
      cachedAllSuggestions = null;
      cachedSuggestionsTimestamp = 0;
      await renderSuggestionsPopup();

      const formSection = document.querySelector('.suggestion-form');
      if (formSection) {
        const textarea = formSection.querySelector('.suggestion-form-textarea');
        if (textarea) textarea.value = '';
      }
      return true;
    } else {
      const error = await response.json().catch(() => ({}));
      window.showToast(error.message || 'Ошибка при отправке предложения', 'removed');
      return false;
    }
  } catch (err) {
    console.error('Error submitting suggestion:', err);
    window.showToast('Ошибка при отправке предложения', 'removed');
    return false;
  }
};
