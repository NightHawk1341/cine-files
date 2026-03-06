/**
 * Mobile Sort Sheet
 * Bottom sheet for sorting on mobile devices
 * Non-module version for compatibility with script.js
 */

(function() {
  'use strict';

  let activeSortSheet = null;
  let sortSheetCleanupHandler = null;
  let savedScrollPosition = 0;

  /**
   * Check if we're on mobile
   */
  function isMobile() {
    return window.innerWidth <= 768;
  }

  /**
   * Show mobile sort bottom sheet
   * @param {Object} options
   * @param {Array} options.sortOptions - Array of {key, label} objects
   * @param {string} options.currentSort - Current sort key
   * @param {string} options.direction - Current direction ('asc' or 'desc')
   * @param {Function} options.onSelect - Callback when option selected
   * @param {Function} options.onReset - Callback when reset clicked
   */
  function showMobileSortSheet(options) {
    if (!isMobile()) return false;

    const {
      sortOptions = [],
      currentSort = null,
      direction = 'desc',
      onSelect,
      onReset
    } = options;

    // Close any existing sheet
    closeMobileSortSheet();

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'mobile-bottom-sheet-overlay';
    overlay.id = 'mobile-sort-sheet-overlay';

    // Create backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'mobile-bottom-sheet-backdrop';
    backdrop.addEventListener('click', closeMobileSortSheet);

    // Create sheet
    const sheet = document.createElement('div');
    sheet.className = 'mobile-bottom-sheet sort-sheet';
    sheet.id = 'mobile-sort-sheet';

    // Handle bar
    const handleBar = document.createElement('div');
    handleBar.className = 'mobile-bottom-sheet-handle';
    handleBar.innerHTML = '<span></span>';

    // Body with sort options
    const body = document.createElement('div');
    body.className = 'mobile-bottom-sheet-body';

    // Add sort options
    sortOptions.forEach(option => {
      const item = document.createElement('button');
      item.className = 'mobile-bottom-sheet-item';
      item.dataset.sort = option.key;

      if (option.key === currentSort) {
        item.classList.add('active');
      }

      const directionIcon = option.key === currentSort
        ? `<svg class="sort-direction" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left: auto; transform: ${direction === 'asc' ? 'rotate(180deg)' : 'none'};">
             <path d="M12 5v14M19 12l-7 7-7-7"/>
           </svg>`
        : '';

      const checkmark = option.key === currentSort
        ? '<svg class="checkmark" width="16" height="16"><use href="#checkmark-stroke"></use></svg>'
        : '<span class="checkmark" style="width: 16px;"></span>';

      item.innerHTML = `
        <span>${option.label}</span>
        ${directionIcon}
        ${checkmark}
      `;

      item.addEventListener('click', () => {
        if (onSelect) {
          onSelect(option.key, option.key === currentSort);
        }
        closeMobileSortSheet();
      });

      body.appendChild(item);
    });

    // Add separator before reset option
    const separator = document.createElement('div');
    separator.style.cssText = 'height: 1px; background: rgba(255,255,255,0.1); margin: 8px 0;';
    body.appendChild(separator);

    // Add reset option
    const resetItem = document.createElement('button');
    resetItem.className = 'mobile-bottom-sheet-item';
    resetItem.style.color = '#818181';
    resetItem.innerHTML = '<span>Сбросить</span>';
    resetItem.addEventListener('click', () => {
      if (onReset) {
        onReset();
      }
      closeMobileSortSheet();
    });
    body.appendChild(resetItem);

    // Assemble sheet
    sheet.appendChild(handleBar);
    sheet.appendChild(body);

    // Assemble overlay
    overlay.appendChild(backdrop);
    overlay.appendChild(sheet);

    // Add to DOM
    document.body.appendChild(overlay);

    // Store reference
    activeSortSheet = { overlay, sheet };

    // Setup swipe to dismiss
    setupSortSheetSwipe(sheet, overlay);

    // Animate in
    requestAnimationFrame(() => {
      overlay.classList.add('active');

      // Save scroll position and lock body scroll
      savedScrollPosition = window.scrollY;
      document.body.style.top = `-${savedScrollPosition}px`;
      document.body.classList.add('sheet-open');

      // Add grain to backdrop (replaces page grain which gets hidden)
      if (typeof window.addBackdropGrain === 'function') {
        window.addBackdropGrain(backdrop);
      }
    });

    // Escape key listener
    sortSheetCleanupHandler = (e) => {
      if (e.key === 'Escape') {
        closeMobileSortSheet();
      }
    };
    document.addEventListener('keydown', sortSheetCleanupHandler);

    return true;
  }

  /**
   * Close the sort sheet
   */
  function closeMobileSortSheet() {
    if (!activeSortSheet) return;

    const { overlay, sheet } = activeSortSheet;

    // Remove backdrop grain
    const backdrop = overlay.querySelector('.mobile-bottom-sheet-backdrop');
    if (backdrop && typeof window.removeBackdropGrain === 'function') {
      window.removeBackdropGrain(backdrop);
    }

    // Cleanup mouse events
    if (sheet && sheet._cleanupMouseEvents) {
      sheet._cleanupMouseEvents();
    }

    // Animate out
    overlay.classList.remove('active');

    // Restore scroll position and unlock body scroll
    document.body.classList.remove('sheet-open');
    document.body.style.top = '';
    window.scrollTo(0, savedScrollPosition);

    // Remove after animation
    setTimeout(() => {
      overlay.remove();
    }, 300);

    // Cleanup
    if (sortSheetCleanupHandler) {
      document.removeEventListener('keydown', sortSheetCleanupHandler);
      sortSheetCleanupHandler = null;
    }

    activeSortSheet = null;
  }

  /**
   * Setup swipe/drag to dismiss (touch and mouse)
   */
  function setupSortSheetSwipe(sheet, overlay) {
    let startY = 0;
    let currentY = 0;
    let isDragging = false;
    let isMouseDown = false;

    const handleDragStart = (clientY) => {
      startY = clientY;
      currentY = startY;
      isDragging = false;
    };

    const handleDragMove = (clientY, e) => {
      if (startY === 0) return;

      currentY = clientY;
      const diff = currentY - startY;

      if (diff > 0) {
        isDragging = true;
        const translateY = Math.min(diff * 0.5, 150);
        // Clear animation to allow transform override
        sheet.style.animation = 'none';
        sheet.style.transform = `translateY(${translateY}px)`;
        sheet.style.transition = 'none';

        const opacity = Math.max(0.3, 1 - (diff / 400));
        overlay.querySelector('.mobile-bottom-sheet-backdrop').style.opacity = opacity;

        if (e) e.preventDefault();
      }
    };

    const handleDragEnd = () => {
      const diff = currentY - startY;

      sheet.style.animation = '';
      sheet.style.transform = '';
      sheet.style.transition = '';
      const backdrop = overlay.querySelector('.mobile-bottom-sheet-backdrop');
      if (backdrop) {
        backdrop.style.opacity = '';
      }

      if (isDragging && diff > 100) {
        closeMobileSortSheet();
      }

      startY = 0;
      currentY = 0;
      isDragging = false;
      isMouseDown = false;
    };

    // Touch events
    const handleTouchStart = (e) => {
      handleDragStart(e.touches[0].clientY);
    };

    const handleTouchMove = (e) => {
      handleDragMove(e.touches[0].clientY, e);
    };

    sheet.addEventListener('touchstart', handleTouchStart, { passive: true });
    sheet.addEventListener('touchmove', handleTouchMove, { passive: false });
    sheet.addEventListener('touchend', handleDragEnd, { passive: true });
    sheet.addEventListener('touchcancel', handleDragEnd, { passive: true });

    // Mouse events for desktop users
    const handleMouseDown = (e) => {
      isMouseDown = true;
      handleDragStart(e.clientY);
      e.preventDefault();
    };

    const handleMouseMove = (e) => {
      if (!isMouseDown) return;
      handleDragMove(e.clientY, e);
    };

    const handleMouseUp = () => {
      if (isMouseDown) {
        handleDragEnd();
      }
    };

    sheet.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Store cleanup function for when sheet is removed
    sheet._cleanupMouseEvents = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }

  // Close sort sheet when resizing to desktop
  let sortSheetResizeTimeout = null;
  window.addEventListener('resize', () => {
    clearTimeout(sortSheetResizeTimeout);
    sortSheetResizeTimeout = setTimeout(() => {
      if (!isMobile() && activeSortSheet) {
        closeMobileSortSheet();
      }
    }, 150);
  });

  // Expose to window for non-module usage
  window.showMobileSortSheet = showMobileSortSheet;
  window.closeMobileSortSheet = closeMobileSortSheet;
  window.isMobileSortView = isMobile;

})();
