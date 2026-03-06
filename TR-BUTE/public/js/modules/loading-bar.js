/**
 * Loading Bar Module
 * Shows a progress bar at the top of the page during page loads and navigation
 */

// Track state to prevent duplicate animations
let isHiding = false;

/**
 * Get or create progress bar element
 */
const getOrCreateProgressBar = () => {
  // Wait for body to exist before trying to access it
  if (!document.body) {
    console.warn('document.body not ready yet for progress bar');
    return null;
  }

  let progressBar = document.querySelector('.spa-progress-bar');
  if (!progressBar) {
    progressBar = document.createElement('div');
    progressBar.className = 'spa-progress-bar';
    document.body.appendChild(progressBar);
  }
  return progressBar;
};

/**
 * Show progress bar (start animation)
 */
const showProgressBar = () => {
  const progressBar = getOrCreateProgressBar();
  if (!progressBar) return; // Skip if body not ready yet
  // Skip if already running — avoid restarting the animation on duplicate calls
  if (progressBar.classList.contains('active')) return;

  isHiding = false;
  progressBar.classList.remove('completing');
  // Force reflow to restart animation
  progressBar.offsetHeight;
  progressBar.classList.add('active');
};

/**
 * Complete and hide progress bar
 */
const hideProgressBar = () => {
  const progressBar = getOrCreateProgressBar();
  if (!progressBar) return; // Skip if body not ready yet

  // Prevent duplicate hide animations
  if (isHiding) return;
  isHiding = true;

  progressBar.classList.remove('active');
  // Use rAF to ensure Safari processes the removal of .active before adding .completing
  // Without this, Safari may not restart the animation and the bar stays stuck at 70%
  requestAnimationFrame(() => {
    progressBar.classList.add('completing');
    // Remove completing class after animation (matches CSS animation duration)
    setTimeout(() => {
      progressBar.classList.remove('completing');
      isHiding = false;
    }, 800);
  });
};

// Show progress bar when script loads (page is loading)
// Defer to next frame to ensure stylesheets are loaded (fixes FOUC in Firefox)
if (document.readyState === 'loading') {
  // Use requestAnimationFrame to wait for CSS to be parsed before forcing layout
  requestAnimationFrame(() => {
    showProgressBar();
  });
}

// Hide progress bar when page is fully loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    hideProgressBar();
  });
} else {
  // Document already loaded
  hideProgressBar();
}

// Also hide on window load (all resources loaded)
window.addEventListener('load', () => {
  hideProgressBar();
});

// Handle Safari/iOS bfcache (back-forward cache)
// When page is restored from bfcache, DOMContentLoaded doesn't fire
// but pageshow does with event.persisted = true
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    // Page was restored from bfcache - immediately hide any stuck progress bar
    const progressBar = document.querySelector('.spa-progress-bar');
    if (progressBar) {
      progressBar.classList.remove('active', 'completing');
      isHiding = false;
    }
  }
});

// Show progress bar when navigating away
window.addEventListener('beforeunload', () => {
  showProgressBar();
});
