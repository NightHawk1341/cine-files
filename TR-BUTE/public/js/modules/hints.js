// ============================================================
// HINTS MODULE
// Platform-specific hints system
// ============================================================

/**
 * Hints management for TR/BUTE
 * Shows contextual hints based on platform and user actions
 */

const HINTS_STORAGE_KEY = 'tribute-dismissed-hints';
const HINT_DISPLAY_DURATION = 5000; // 5 seconds

/**
 * Get dismissed hints from localStorage
 * @returns {string[]} Array of dismissed hint IDs
 */
function getDismissedHints() {
  try {
    const stored = localStorage.getItem(HINTS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    return [];
  }
}

/**
 * Mark a hint as dismissed
 * @param {string} hintId - The hint identifier
 */
function dismissHint(hintId) {
  const dismissed = getDismissedHints();
  if (!dismissed.includes(hintId)) {
    dismissed.push(hintId);
    localStorage.setItem(HINTS_STORAGE_KEY, JSON.stringify(dismissed));
  }
}

/**
 * Check if a hint has been dismissed
 * @param {string} hintId - The hint identifier
 * @returns {boolean}
 */
function isHintDismissed(hintId) {
  return getDismissedHints().includes(hintId);
}

/**
 * Create and show a corner hint
 * @param {Object} options - Hint options
 * @param {string} options.id - Unique hint identifier
 * @param {string} options.text - Hint text to display
 * @param {number} [options.duration] - Display duration in ms (default: 5000)
 * @param {Function} [options.onDismiss] - Callback when dismissed
 * @param {Function} [options.onClick] - Callback when clicked
 * @param {boolean} [options.isStory] - Whether this is a story hint (top-right, no arrow, persistent)
 */
function showCornerHint(options) {
  const { id, text, duration = HINT_DISPLAY_DURATION, onDismiss, onClick, isStory = false } = options;

  // Check if already dismissed
  if (isHintDismissed(id)) {
    return null;
  }

  // Create container
  const container = document.createElement('div');
  container.className = isStory ? 'hint-container story-hint active' : 'hint-container active';
  container.dataset.hintId = id;

  // Create bubble
  const bubble = document.createElement('div');
  bubble.className = 'hint-bubble';

  // Make bubble clickable for story hints
  if (isStory && onClick) {
    bubble.style.cursor = 'pointer';
    bubble.addEventListener('click', (e) => {
      // Don't trigger if clicking close button
      if (e.target.closest('.hint-close')) return;
      // Dismiss and hide the hint when clicked
      dismissHint(id);
      hideHint(container, true);
      onClick();
    });
  }

  // Create text
  const textEl = document.createElement('p');
  textEl.className = 'hint-text';
  textEl.textContent = text;

  // Create close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'hint-close';
  closeBtn.setAttribute('aria-label', 'Закрыть подсказку');
  closeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>`;

  // Assemble
  bubble.appendChild(textEl);
  bubble.appendChild(closeBtn);
  container.appendChild(bubble);

  // Add to document
  document.body.appendChild(container);

  // Auto-hide timeout (only for non-story hints)
  let autoHideTimeout = null;
  if (!isStory && duration > 0) {
    autoHideTimeout = setTimeout(() => {
      hideHint(container, false);
    }, duration);
  }

  // Close button handler
  closeBtn.addEventListener('click', () => {
    if (autoHideTimeout) {
      clearTimeout(autoHideTimeout);
    }
    dismissHint(id);
    hideHint(container, true);
    if (onDismiss) onDismiss();
  });

  return container;
}

/**
 * Hide and remove a hint
 * @param {HTMLElement} container - The hint container
 * @param {boolean} wasDismissed - Whether it was manually dismissed
 */
function hideHint(container, wasDismissed) {
  if (!container || container.classList.contains('hiding')) return;

  container.classList.add('hiding');

  // Track if removal happened via animation
  let removed = false;

  const removeContainer = () => {
    if (removed) return;
    removed = true;
    if (container.parentNode) {
      container.remove();
    }
  };

  // Primary: use animationend event
  container.addEventListener('animationend', removeContainer, { once: true });

  // Fallback for iOS Safari: animationend may not fire reliably
  // Use setTimeout matching the CSS animation duration (300ms) + buffer
  setTimeout(removeContainer, 400);
}

/**
 * Get Telegram platform info
 * @returns {Object} Platform information
 */
function getTelegramPlatform() {
  const tg = window.Telegram?.WebApp;
  if (!tg) {
    return { isTelegram: false, platform: null, isDesktop: false, isMobile: false };
  }

  const platform = tg.platform;
  const isDesktop = platform === 'tdesktop' || platform === 'macos';
  const isMobile = platform === 'ios' || platform === 'android';

  return { isTelegram: true, platform, isDesktop, isMobile };
}

/**
 * Initialize platform-specific hints
 */
function initHints() {
  const { isTelegram, isDesktop } = getTelegramPlatform();

  // Desktop miniapp hint: window resize
  if (isTelegram && isDesktop) {
    showCornerHint({
      id: 'desktop-resize-hint',
      text: 'Вы можете увеличить окно каталога',
      duration: HINT_DISPLAY_DURATION
    });
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHints);
} else {
  initHints();
}

// Expose API globally
window.HintsManager = {
  show: showCornerHint,
  dismiss: dismissHint,
  isDismissed: isHintDismissed,
  getPlatform: getTelegramPlatform
};
