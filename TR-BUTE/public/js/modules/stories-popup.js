/**
 * Stories Popup Module
 * Instagram/VK-like stories system for announcements and updates
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = 'seen_stories';
const STORAGE_SHOWN_KEY = 'stories_auto_shown';
const DEFAULT_DURATION = 5000; // 5 seconds per story

// ============================================================================
// STATE
// ============================================================================

let stories = [];
let currentIndex = 0;
let isPaused = false;
let progressTimer = null;
let progressStartTime = 0;
let progressElapsed = 0;
let seenStories = new Set();
let isInitialized = false;
let onCloseCallback = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize stories module - fetch stories and set up hint
 */
export async function initStories() {
  if (isInitialized) return;
  isInitialized = true;

  // Load seen stories from localStorage
  loadSeenStories();

  // Fetch active stories
  await fetchStories();

  // Show story hint using hint system (desktop only, top-right)
  if (stories.length > 0 && hasUnseenStories()) {
    // Use the global HintsManager to show story hint
    if (typeof window.HintsManager !== 'undefined') {
      const hintId = `story-${stories[0].id}`; // Use latest story ID for versioning

      window.HintsManager.show({
        id: hintId,
        text: 'Что нового?',
        isStory: true,
        duration: 0, // Persistent - doesn't auto-hide
        onClick: () => {
          openStoriesPopup();
        }
      });
    }
  }
}

/**
 * Fetch active stories from API
 */
async function fetchStories() {
  try {
    const response = await fetch('/api/stories/active');
    if (response.ok) {
      const data = await response.json();
      stories = data.stories || [];
    }
  } catch (err) {
    console.error('Error fetching stories:', err);
    stories = [];
  }
}

/**
 * Refresh stories data (called when needed)
 */
export async function refreshStories() {
  await fetchStories();
  return stories;
}

// ============================================================================
// STORAGE HELPERS
// ============================================================================

/**
 * Load seen stories from localStorage
 */
function loadSeenStories() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      seenStories = new Set(parsed);
    }
  } catch (err) {
    console.error('Error loading seen stories:', err);
    seenStories = new Set();
  }
}

/**
 * Save seen stories to localStorage
 */
function saveSeenStories() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...seenStories]));
  } catch (err) {
    console.error('Error saving seen stories:', err);
  }
}

/**
 * Mark a story as seen
 */
function markStorySeen(storyId) {
  seenStories.add(storyId);
  saveSeenStories();
}

/**
 * Check if a story has been seen
 */
export function isStorySeen(storyId) {
  return seenStories.has(storyId);
}

/**
 * Check if there are any unseen stories
 */
export function hasUnseenStories() {
  return stories.some(story => !seenStories.has(story.id));
}

/**
 * Check if stories have been auto-shown before
 */
function hasAutoShownBefore() {
  return localStorage.getItem(STORAGE_SHOWN_KEY) === 'true';
}

/**
 * Mark that stories have been auto-shown
 */
function markAutoShown() {
  localStorage.setItem(STORAGE_SHOWN_KEY, 'true');
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get all active stories
 */
export function getStories() {
  return stories;
}

/**
 * Get count of active stories
 */
export function getStoriesCount() {
  return stories.length;
}

/**
 * Get count of unseen stories
 */
export function getUnseenCount() {
  return stories.filter(s => !seenStories.has(s.id)).length;
}

/**
 * Set callback for when stories popup closes
 */
export function onClose(callback) {
  onCloseCallback = callback;
}

// ============================================================================
// POPUP MANAGEMENT
// ============================================================================

/**
 * Open stories popup
 */
export function openStoriesPopup(startIndex = 0) {
  if (stories.length === 0) return;

  // Find first unseen story, or use startIndex
  if (startIndex === 0 && hasUnseenStories()) {
    const firstUnseenIndex = stories.findIndex(s => !seenStories.has(s.id));
    if (firstUnseenIndex !== -1) {
      startIndex = firstUnseenIndex;
    }
  }

  currentIndex = Math.min(startIndex, stories.length - 1);
  isPaused = false;
  progressElapsed = 0;

  createPopupHTML();
  setupEventListeners();
  showStory(currentIndex);

  document.body.style.overflow = 'hidden';
  document.body.classList.add('popup-open');

  // Add backdrop grain effect
  const overlay = document.querySelector('.stories-popup-overlay');
  if (overlay && typeof window.addBackdropGrain === 'function') {
    window.addBackdropGrain(overlay);
  }
}

/**
 * Close stories popup
 */
export function closeStoriesPopup() {
  stopProgressTimer();

  const overlay = document.querySelector('.stories-popup-overlay');
  if (overlay) {
    // Remove backdrop grain effect
    if (typeof window.removeBackdropGrain === 'function') {
      window.removeBackdropGrain(overlay);
    }

    overlay.classList.add('closing');
    setTimeout(() => {
      overlay.remove();
    }, 200);
  }

  document.body.style.overflow = '';
  document.body.classList.remove('popup-open');

  // Trigger callback
  if (onCloseCallback) {
    onCloseCallback();
  }
}

// ============================================================================
// HTML GENERATION
// ============================================================================

/**
 * Create popup HTML and inject into DOM
 */
function createPopupHTML() {
  // Remove existing popup if any
  const existing = document.querySelector('.stories-popup-overlay');
  if (existing) existing.remove();

  const popupHTML = `
    <div class="stories-popup-overlay">
      <div class="stories-popup-container">
        <!-- Progress bars at top -->
        <div class="stories-progress-container">
          ${stories.map((_, i) => `
            <div class="stories-progress-segment" data-index="${i}">
              <div class="stories-progress-fill"></div>
            </div>
          `).join('')}
        </div>

        <!-- Story image area -->
        <div class="stories-content">
          <img class="stories-image" src="" alt="Story" />

          <!-- Navigation areas (invisible, for tap detection) -->
          <div class="stories-nav stories-nav-prev"></div>
          <div class="stories-nav stories-nav-next"></div>

          <!-- Loading indicator -->
          <div class="stories-loading">
            <div class="stories-loading-spinner"></div>
          </div>

          <!-- Pause indicator -->
          <div class="stories-pause-indicator">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1"/>
              <rect x="14" y="4" width="4" height="16" rx="1"/>
            </svg>
          </div>

          <!-- Text and link overlaid at bottom of image -->
          <div class="stories-bottom-overlay">
            <div class="stories-title-container">
              <span class="stories-title"></span>
            </div>
            <div class="stories-link-container">
              <a class="stories-link-btn" href="#" target="_blank" rel="noopener">
                <span class="stories-link-text"></span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </a>
            </div>
          </div>
        </div>

        <!-- Close button below image -->
        <div class="stories-close-row">
          <button class="stories-close-btn">Закрыть</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', popupHTML);

  // Add styles if not already added
  if (!document.getElementById('stories-popup-styles')) {
    addStyles();
  }
}

/**
 * Add CSS styles for stories popup
 */
function addStyles() {
  const styles = document.createElement('style');
  styles.id = 'stories-popup-styles';
  styles.textContent = `
    .stories-popup-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      z-index: 30000;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: storiesFadeIn 0.2s ease-out;
    }

    @media (max-width: 480px) {
      .stories-popup-overlay {
        align-items: stretch;
      }
    }

    .stories-popup-overlay.closing {
      animation: storiesFadeOut 0.2s ease-out forwards;
    }

    @keyframes storiesFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes storiesFadeOut {
      from { opacity: 1; }
      to { opacity: 0; }
    }

    .stories-popup-container {
      position: relative;
      width: 100%;
      max-width: 400px;
      max-height: 85vh;
      margin: 20px;
      display: flex;
      flex-direction: column;
      background: transparent;
      border: none;
      border-radius: 0;
      overflow: visible;
      box-shadow: none;
    }

    @media (max-width: 480px) {
      .stories-popup-container {
        max-width: 100%;
        max-height: 100%;
        margin: 0;
      }
    }

    /* Progress bars - at top of card */
    .stories-progress-container {
      display: flex;
      gap: 4px;
      padding: 12px 12px 8px;
      background: transparent;
      flex-shrink: 0;
    }

    .stories-progress-segment {
      flex: 1;
      height: 3px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 2px;
      overflow: hidden;
    }

    .stories-progress-fill {
      height: 100%;
      width: 0%;
      background: #fff;
      border-radius: 2px;
      transition: none;
    }

    .stories-progress-segment.seen .stories-progress-fill {
      width: 100%;
    }

    .stories-progress-segment.current .stories-progress-fill {
      transition: width linear;
    }

    /* Story content - image area (styled like zoom-wrapper) */
    .stories-content {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-secondary, #1a1a1a);
      min-height: 200px;
      flex: 1;
      overflow: hidden;
      border-radius: 12px;
      user-select: none;
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
    }

    @media (max-width: 480px) {
      .stories-content {
        border-radius: 0;
      }
    }

    .stories-image {
      width: 100%;
      height: 100%;
      object-fit: contain;
      user-select: none;
      -webkit-user-drag: none;
      opacity: 0;
      transition: opacity 0.2s;
    }

    .stories-image.loaded {
      opacity: 1;
    }

    /* Navigation areas - cover image area */
    .stories-nav {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 35%;
      z-index: 5;
      cursor: pointer;
    }

    .stories-nav-prev {
      left: 0;
    }

    .stories-nav-next {
      right: 0;
    }

    /* Loading indicator */
    .stories-loading {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 8;
      display: none;
    }

    .stories-loading.visible {
      display: block;
    }

    .stories-loading-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(255,255,255,0.2);
      border-top-color: #fff;
      border-radius: 50%;
      animation: storiesSpin 0.8s linear infinite;
    }

    @keyframes storiesSpin {
      to { transform: rotate(360deg); }
    }

    /* Pause indicator - centered on image */
    .stories-pause-indicator {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) scale(0.8);
      width: 60px;
      height: 60px;
      background: rgba(0, 0, 0, 0.6);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s, transform 0.2s;
      z-index: 15;
    }

    .stories-popup-container.paused .stories-pause-indicator {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }

    .stories-pause-indicator svg {
      width: 24px;
      height: 24px;
      fill: #fff;
    }

    /* Pause also stops progress bar animation */
    .stories-popup-container.paused .stories-progress-segment.current .stories-progress-fill {
      transition: none !important;
    }

    /* Bottom overlay — gradient + text/link overlaid on image */
    .stories-bottom-overlay {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 48px 20px 20px;
      background: linear-gradient(to bottom, transparent, rgba(0, 0, 0, 0.72));
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      pointer-events: none;
      z-index: 6;
    }

    .stories-title-container {
      text-align: center;
      opacity: 0;
      transition: opacity 0.3s;
    }

    .stories-title-container.visible {
      opacity: 1;
    }

    .stories-title {
      color: #fff;
      font-size: 16px;
      font-weight: 600;
      line-height: 1.4;
      text-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
    }

    /* Link button */
    .stories-link-container {
      opacity: 0;
      transition: opacity 0.3s;
      pointer-events: none;
    }

    .stories-link-container.visible {
      opacity: 1;
      pointer-events: auto;
    }

    .stories-link-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 24px;
      background: #fff;
      color: #000;
      text-decoration: none;
      border-radius: 12px;
      font-weight: 600;
      font-size: 14px;
      transition: transform 0.2s, opacity 0.2s;
      pointer-events: auto;
    }

    .stories-link-btn:hover {
      transform: scale(1.02);
    }

    .stories-link-btn:active {
      transform: scale(0.98);
    }

    .stories-link-btn svg {
      color: #000;
    }

    .stories-link-btn svg path {
      stroke: #000;
      fill: none;
    }

    /* Close button below image */
    .stories-close-row {
      display: flex;
      justify-content: center;
      margin-top: 12px;
      flex-shrink: 0;
      padding-bottom: env(safe-area-inset-bottom, 0px);
    }

    .stories-close-btn {
      font-size: 14px;
      font-weight: 600;
      background-color: var(--bg-secondary);
      color: var(--text-secondary);
      border: 1px solid var(--border-color);
      border-radius: 40px;
      padding: 10px 28px;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
      font-family: Montserrat, sans-serif;
    }

    .stories-close-btn:hover {
      background-color: var(--bg-tertiary);
    }
  `;
  document.head.appendChild(styles);
}

// ============================================================================
// STORY DISPLAY
// ============================================================================

/**
 * Show a specific story
 */
function showStory(index) {
  if (index < 0 || index >= stories.length) return;

  const story = stories[index];
  const container = document.querySelector('.stories-popup-container');
  const image = document.querySelector('.stories-image');
  const titleContainer = document.querySelector('.stories-title-container');
  const titleSpan = document.querySelector('.stories-title');
  const linkContainer = document.querySelector('.stories-link-container');
  const linkBtn = document.querySelector('.stories-link-btn');
  const linkText = document.querySelector('.stories-link-text');
  const loading = document.querySelector('.stories-loading');

  if (!container || !image) return;

  // Stop current timer
  stopProgressTimer();

  // Clear any previous reload overlay
  const existingOverlay = container.querySelector('.img-reload-overlay');
  if (existingOverlay) existingOverlay.remove();

  // Show loading
  loading.classList.add('visible');
  image.classList.remove('loaded');

  // Update progress bars
  updateProgressBars(index);

  // Load image with proxy fallback
  const img = new Image();
  let hasTriedProxy = false;

  img.onload = () => {
    image.src = img.src;
    loading.classList.remove('visible');

    // Wait for image to fully appear (opacity transition) before starting timer
    const handleTransitionEnd = (e) => {
      if (e.propertyName === 'opacity') {
        image.removeEventListener('transitionend', handleTransitionEnd);

        // Start progress timer only after image is fully visible
        progressElapsed = 0;
        startProgressTimer(story.duration || DEFAULT_DURATION);

        // Mark as seen
        markStorySeen(story.id);
      }
    };

    image.addEventListener('transitionend', handleTransitionEnd);
    image.classList.add('loaded');

    // Fallback: if transition doesn't fire (e.g., image already loaded), start timer anyway
    setTimeout(() => {
      if (!progressTimer) {
        progressElapsed = 0;
        startProgressTimer(story.duration || DEFAULT_DURATION);
        markStorySeen(story.id);
      }
    }, 300);
  };

  img.onerror = () => {
    // Try proxy fallback if not already tried
    if (!hasTriedProxy) {
      hasTriedProxy = true;
      const proxiedUrl = `/api/img?url=${encodeURIComponent(story.image_url)}`;
      console.log('Story image failed to load directly, trying proxy:', proxiedUrl);
      img.src = proxiedUrl;
    } else {
      // Show reload button instead of skipping
      loading.classList.remove('visible');
      console.error('Failed to load story image even with proxy:', story.image_url);
      const content = document.querySelector('.stories-content');
      if (content) {
        const existing = content.querySelector('.img-reload-overlay');
        if (existing) existing.remove();
        const overlay = document.createElement('div');
        overlay.className = 'img-reload-overlay';
        const btn = document.createElement('button');
        btn.className = 'img-reload-btn';
        btn.textContent = 'Повторить загрузку';
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          overlay.remove();
          showStory(currentIndex);
        });
        overlay.appendChild(btn);
        content.appendChild(overlay);
      }
    }
  };

  img.src = story.image_url;

  // Update title
  if (story.title) {
    titleSpan.textContent = story.title;
    titleContainer.classList.add('visible');
  } else {
    titleContainer.classList.remove('visible');
  }

  // Update link
  if (story.link_url) {
    linkBtn.href = story.link_url;
    linkText.textContent = story.link_text || 'Подробнее';
    linkContainer.classList.add('visible');
  } else {
    linkContainer.classList.remove('visible');
  }

  currentIndex = index;
}

/**
 * Update progress bar visual state
 */
function updateProgressBars(currentIdx) {
  const segments = document.querySelectorAll('.stories-progress-segment');
  segments.forEach((segment, i) => {
    const fill = segment.querySelector('.stories-progress-fill');
    segment.classList.remove('seen', 'current');

    if (i < currentIdx) {
      segment.classList.add('seen');
      fill.style.width = '100%';
    } else if (i === currentIdx) {
      segment.classList.add('current');
      fill.style.width = '0%';
    } else {
      fill.style.width = '0%';
    }
  });
}

// ============================================================================
// PROGRESS TIMER
// ============================================================================

/**
 * Start the progress timer for current story
 */
function startProgressTimer(duration) {
  const currentSegment = document.querySelector('.stories-progress-segment.current');
  const fill = currentSegment?.querySelector('.stories-progress-fill');

  if (!fill) return;

  const remainingDuration = duration - progressElapsed;
  const startWidth = (progressElapsed / duration) * 100;

  fill.style.width = `${startWidth}%`;

  // Force reflow before starting transition
  fill.offsetWidth;

  fill.style.transition = `width ${remainingDuration}ms linear`;
  fill.style.width = '100%';

  progressStartTime = Date.now();

  progressTimer = setTimeout(() => {
    goToNextStory();
  }, remainingDuration);
}

/**
 * Stop the progress timer
 */
function stopProgressTimer() {
  if (progressTimer) {
    clearTimeout(progressTimer);
    progressTimer = null;
  }
}

/**
 * Pause the progress timer
 */
function pauseProgress() {
  if (isPaused) return;
  isPaused = true;

  stopProgressTimer();

  // Calculate elapsed time
  if (progressStartTime > 0) {
    progressElapsed += Date.now() - progressStartTime;
  }

  // Freeze the progress bar
  const currentSegment = document.querySelector('.stories-progress-segment.current');
  const fill = currentSegment?.querySelector('.stories-progress-fill');
  if (fill) {
    const computedWidth = getComputedStyle(fill).width;
    fill.style.transition = 'none';
    fill.style.width = computedWidth;
  }

  const container = document.querySelector('.stories-popup-container');
  container?.classList.add('paused');
}

/**
 * Resume the progress timer
 */
function resumeProgress() {
  if (!isPaused) return;
  isPaused = false;

  const container = document.querySelector('.stories-popup-container');
  container?.classList.remove('paused');

  const story = stories[currentIndex];
  if (story) {
    startProgressTimer(story.duration || DEFAULT_DURATION);
  }
}

// ============================================================================
// NAVIGATION
// ============================================================================

/**
 * Go to next story
 */
function goToNextStory() {
  if (currentIndex < stories.length - 1) {
    progressElapsed = 0;
    showStory(currentIndex + 1);
  } else {
    // End of stories
    closeStoriesPopup();
  }
}

/**
 * Go to previous story
 */
function goToPrevStory() {
  if (currentIndex > 0) {
    progressElapsed = 0;
    showStory(currentIndex - 1);
  } else {
    // Restart first story
    progressElapsed = 0;
    showStory(0);
  }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

/**
 * Set up all event listeners
 */
function setupEventListeners() {
  const overlay = document.querySelector('.stories-popup-overlay');
  const container = document.querySelector('.stories-popup-container');
  const closeBtn = document.querySelector('.stories-close-btn');
  const navPrev = document.querySelector('.stories-nav-prev');
  const navNext = document.querySelector('.stories-nav-next');
  const content = document.querySelector('.stories-content');

  if (!overlay) return;

  // Close button
  closeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeStoriesPopup();
  });

  // Navigation clicks
  navPrev?.addEventListener('click', (e) => {
    e.stopPropagation();
    goToPrevStory();
  });

  navNext?.addEventListener('click', (e) => {
    e.stopPropagation();
    goToNextStory();
  });

  // Close on overlay click (outside container on desktop)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeStoriesPopup();
    }
  });

  // Keyboard navigation
  const handleKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowLeft':
        goToPrevStory();
        break;
      case 'ArrowRight':
      case ' ':
        e.preventDefault();
        goToNextStory();
        break;
      case 'Escape':
        closeStoriesPopup();
        break;
    }
  };
  document.addEventListener('keydown', handleKeyDown);

  // Store cleanup function
  overlay._cleanup = () => {
    document.removeEventListener('keydown', handleKeyDown);
  };

  // Remove cleanup on close
  const originalClose = closeStoriesPopup;
  closeStoriesPopup = function() {
    overlay._cleanup?.();
    originalClose.call(this);
    closeStoriesPopup = originalClose;
  };

  // ========== DESKTOP: Click to toggle pause ==========
  // Simple click on content area toggles pause/resume
  let mouseDownTime = 0;
  let mouseDownPos = { x: 0, y: 0 };

  content?.addEventListener('mousedown', (e) => {
    // Don't handle if clicking on interactive elements
    if (e.target.closest('.stories-link-btn') || e.target.closest('.stories-close-btn') ||
        e.target.closest('.stories-nav-prev') || e.target.closest('.stories-nav-next')) {
      return;
    }
    mouseDownTime = Date.now();
    mouseDownPos = { x: e.clientX, y: e.clientY };
  });

  content?.addEventListener('mouseup', (e) => {
    // Don't handle if clicking on interactive elements
    if (e.target.closest('.stories-link-btn') || e.target.closest('.stories-close-btn') ||
        e.target.closest('.stories-nav-prev') || e.target.closest('.stories-nav-next')) {
      return;
    }

    const timeDiff = Date.now() - mouseDownTime;
    const posDiff = Math.abs(e.clientX - mouseDownPos.x) + Math.abs(e.clientY - mouseDownPos.y);

    // Treat as click if time < 300ms and position moved < 10px
    if (timeDiff < 300 && posDiff < 10) {
      // Toggle pause on click
      if (isPaused) {
        resumeProgress();
      } else {
        pauseProgress();
      }
    }
  });

  // ========== MOBILE: Touch hold to pause, release to resume ==========
  let touchStartTime = 0;
  let touchStartX = 0;
  let touchStartY = 0;
  let isTouchHolding = false;

  content?.addEventListener('touchstart', (e) => {
    // Don't handle if touching interactive elements
    if (e.target.closest('.stories-link-btn') || e.target.closest('.stories-close-btn')) {
      return;
    }

    touchStartTime = Date.now();
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    isTouchHolding = false;

    // Start holding immediately on touch (no delay)
    // Pause will be confirmed after a short hold
    setTimeout(() => {
      // If still touching after 100ms, consider it a hold/pause
      if (touchStartTime > 0) {
        isTouchHolding = true;
        pauseProgress();
      }
    }, 100);
  }, { passive: true });

  content?.addEventListener('touchend', (e) => {
    const touchEndTime = Date.now();
    const timeDiff = touchEndTime - touchStartTime;
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const diffX = touchEndX - touchStartX;
    const diffY = touchEndY - touchStartY;

    // Reset touch start time
    touchStartTime = 0;

    // If was holding, resume on release
    if (isTouchHolding) {
      isTouchHolding = false;
      resumeProgress();
      return;
    }

    // Handle swipe navigation (horizontal swipes > 50px)
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
      if (diffX > 0) {
        goToPrevStory();
      } else {
        goToNextStory();
      }
    }
  }, { passive: true });

  content?.addEventListener('touchcancel', () => {
    touchStartTime = 0;
    if (isTouchHolding) {
      isTouchHolding = false;
      resumeProgress();
    }
  }, { passive: true });
}

// ============================================================================
// PREVIEW CIRCLE COMPONENT
// ============================================================================

/**
 * Create a stories preview circle element (for FAQ header)
 * @param {Object} options - Configuration options
 * @param {number} options.size - Circle size in pixels (default: 40)
 * @param {Function} options.onClick - Click handler (default: openStoriesPopup)
 * @returns {HTMLElement} The circle element
 */
export function createStoriesPreviewCircle(options = {}) {
  const {
    size = 40,
    onClick = () => openStoriesPopup()
  } = options;

  if (stories.length === 0) return null;

  const hasUnseen = hasUnseenStories();
  const firstStory = stories[0];
  const storyCount = stories.length;

  // Create container
  const container = document.createElement('div');
  container.className = 'stories-preview-circle';
  container.title = hasUnseen ? 'Новые истории' : 'Истории';
  container.style.cssText = `
    width: ${size}px;
    height: ${size}px;
    position: relative;
    cursor: pointer;
    flex-shrink: 0;
  `;

  // Create SVG for sectioned border
  const borderWidth = 2;
  const radius = (size - borderWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;
  const gapAngle = storyCount > 1 ? 8 : 0; // Gap in degrees between segments
  const gapLength = (gapAngle / 360) * circumference;
  const segmentLength = (circumference - gapLength * storyCount) / storyCount;

  let svgContent = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="position: absolute; top: 0; left: 0; transform: rotate(-90deg);">
  `;

  for (let i = 0; i < storyCount; i++) {
    const isSeen = seenStories.has(stories[i].id);
    const color = isSeen ? 'var(--text-tertiary, #666)' : 'var(--accent, #ff9500)';
    const dashOffset = -(i * (segmentLength + gapLength));

    svgContent += `
      <circle
        cx="${cx}"
        cy="${cy}"
        r="${radius}"
        fill="none"
        stroke="${color}"
        stroke-width="${borderWidth}"
        stroke-dasharray="${segmentLength} ${circumference - segmentLength}"
        stroke-dashoffset="${dashOffset}"
        stroke-linecap="round"
      />
    `;
  }

  svgContent += '</svg>';

  // Create image container
  const imgSize = size - borderWidth * 2 - 4; // 4px padding from border
  const imageContainer = document.createElement('div');
  imageContainer.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: ${imgSize}px;
    height: ${imgSize}px;
    border-radius: 50%;
    overflow: hidden;
    background: var(--bg-secondary, #1a1a1a);
  `;

  // Add first story image as preview
  if (firstStory?.image_url) {
    const img = document.createElement('img');
    img.src = firstStory.image_url;
    img.alt = 'Stories';
    img.style.cssText = `
      width: 100%;
      height: 100%;
      object-fit: cover;
    `;
    img.onerror = function () {
      const src = this.src;
      if (!src.includes('/api/img')) {
        this.src = `/api/img?url=${encodeURIComponent(firstStory.image_url)}`;
      }
    };
    imageContainer.appendChild(img);
  }

  container.innerHTML = svgContent;
  container.appendChild(imageContainer);

  // Click handler
  container.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });

  return container;
}

/**
 * Update the preview circle (call when stories change or are viewed)
 */
export function updatePreviewCircle(circleElement) {
  if (!circleElement) return;

  const newCircle = createStoriesPreviewCircle({
    size: parseInt(circleElement.style.width) || 40,
    onClick: () => openStoriesPopup()
  });

  if (newCircle) {
    circleElement.replaceWith(newCircle);
    return newCircle;
  }

  return circleElement;
}

// ============================================================================
// EXPORTS FOR WINDOW (backward compatibility)
// ============================================================================

if (typeof window !== 'undefined') {
  window.StoriesPopup = {
    init: initStories,
    open: openStoriesPopup,
    close: closeStoriesPopup,
    refresh: refreshStories,
    getStories,
    getStoriesCount,
    getUnseenCount,
    hasUnseenStories,
    isStorySeen,
    createPreviewCircle: createStoriesPreviewCircle,
    onClose
  };
}
