/**
 * Toast notifications with stacking.
 * Desktop: top-right, slide from right, click to dismiss, hover to expand stack.
 * Mobile: top-center, slide from above, swipe-up to dismiss, tap to expand.
 * Matches TR-BUTE toast behavior.
 */

var Toast = (function () {
  var LEAVE_DURATION = 220;
  var EXPAND_GAP = 8;
  var COLLAPSE_DELAY = 600;

  var container = null;
  var _isExpanded = false;
  var _isHovering = false;
  var _collapseTimer = null;
  var _docTouchHandler = null;

  function getContainer() {
    if (!container || !container.parentNode) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);

      container.addEventListener('mouseenter', function () {
        if (window.innerWidth <= 1024) return;
        _isHovering = true;
        clearTimeout(_collapseTimer);
        _collapseTimer = null;
        var visible = container.querySelectorAll('.toast-notification:not(.toast-leaving)');
        if (visible.length >= 2) {
          expandToasts();
        } else if (visible.length === 1) {
          pauseToastTimers();
        }
      });

      container.addEventListener('mouseleave', function () {
        if (window.innerWidth <= 1024) return;
        _isHovering = false;
        clearTimeout(_collapseTimer);
        _collapseTimer = null;
        if (_isExpanded) {
          _collapseTimer = setTimeout(function () { collapseToasts(); }, COLLAPSE_DELAY);
        } else {
          var visible = container.querySelectorAll('.toast-notification:not(.toast-leaving)');
          if (visible.length === 1) {
            _collapseTimer = setTimeout(function () {
              container.querySelectorAll('.toast-notification:not(.toast-leaving)').forEach(function (t) {
                dismissToast(t);
              });
            }, COLLAPSE_DELAY);
          }
        }
      });
    }
    return container;
  }

  function updateStackIndices() {
    var c = getContainer();
    var visible = Array.from(c.querySelectorAll('.toast-notification:not(.toast-leaving)'));
    visible.reverse();
    visible.forEach(function (t, i) {
      t.dataset.stackIndex = i;
      t.style.zIndex = String(3 - i);
    });

    c.style.pointerEvents = visible.length > 0 ? 'auto' : 'none';

    if (_isExpanded) {
      if (visible.length < 2) {
        _isExpanded = false;
        c.classList.remove('toast-expanded');
        removeDocumentCollapseListener();
        clearTimeout(_collapseTimer);
        _collapseTimer = null;
        resumeToastTimers();
        layoutCollapsed();
      } else {
        layoutExpanded();
      }
    } else {
      layoutCollapsed();
      if (_isHovering && window.innerWidth > 1024 && visible.length >= 2) {
        expandToasts();
      }
    }
  }

  function layoutCollapsed() {
    var c = getContainer();
    var toasts = Array.from(c.querySelectorAll('.toast-notification:not(.toast-leaving)'));
    toasts.forEach(function (t) { t.style.transform = ''; });
    var sorted = toasts.slice().sort(function (a, b) {
      return Number(a.dataset.stackIndex) - Number(b.dataset.stackIndex);
    });
    var newest = sorted[0];
    c.style.height = newest ? newest.offsetHeight + 'px' : '0px';
  }

  function layoutExpanded() {
    var c = getContainer();
    var toasts = Array.from(c.querySelectorAll(
      '.toast-notification:not(.toast-leaving):not(.toast-entering)'
    ));
    toasts.sort(function (a, b) {
      return Number(a.dataset.stackIndex) - Number(b.dataset.stackIndex);
    });
    var y = 0;
    toasts.forEach(function (t) {
      t.style.transform = 'translateY(' + y + 'px)';
      t._expandedY = y;
      y += t.offsetHeight + EXPAND_GAP;
    });
    c.style.height = toasts.length > 0 ? (y - EXPAND_GAP) + 'px' : '0px';
  }

  function expandToasts() {
    var c = getContainer();
    var visible = Array.from(c.querySelectorAll('.toast-notification:not(.toast-leaving)'));
    if (visible.length < 2 || _isExpanded) return;
    _isExpanded = true;
    c.classList.add('toast-expanded');
    pauseToastTimers();
    layoutExpanded();
    if (window.innerWidth <= 1024) addDocumentCollapseListener();
  }

  function collapseToasts() {
    if (!_isExpanded) return;
    var c = getContainer();
    _isExpanded = false;
    c.classList.remove('toast-expanded');
    removeDocumentCollapseListener();
    clearTimeout(_collapseTimer);
    _collapseTimer = null;
    layoutCollapsed();
    resumeToastTimers();
  }

  function pauseToastTimers() {
    var c = getContainer();
    c.querySelectorAll('.toast-notification:not(.toast-leaving)').forEach(function (t) {
      clearTimeout(t._autoDismiss);
      t._remainingTime = t._autoDismissAt ? Math.max(0, t._autoDismissAt - Date.now()) : 0;
    });
  }

  function resumeToastTimers() {
    var c = getContainer();
    c.querySelectorAll('.toast-notification:not(.toast-leaving)').forEach(function (t) {
      if (t._dismissed) return;
      var remaining = t._remainingTime != null ? t._remainingTime : (t._duration || 3000);
      t._remainingTime = null;
      if (remaining <= 0) {
        dismissToast(t);
      } else {
        t._autoDismissAt = Date.now() + remaining;
        t._autoDismiss = setTimeout(function () { dismissToast(t); }, remaining);
      }
    });
  }

  function addDocumentCollapseListener() {
    removeDocumentCollapseListener();
    _docTouchHandler = function (e) {
      if (!container.contains(e.target)) collapseToasts();
    };
    document.addEventListener('touchstart', _docTouchHandler, { passive: true });
  }

  function removeDocumentCollapseListener() {
    if (_docTouchHandler) {
      document.removeEventListener('touchstart', _docTouchHandler);
      _docTouchHandler = null;
    }
  }

  function dismissToast(toast) {
    if (toast._dismissed) return;
    toast._dismissed = true;
    clearTimeout(toast._autoDismiss);
    toast.classList.remove('toast-entering');
    toast.classList.add('toast-leaving');
    setTimeout(function () {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
        updateStackIndices();
      }
    }, LEAVE_DURATION);
  }

  /**
   * Show a toast notification.
   * @param {string} message
   * @param {'default'|'success'|'error'|'warning'|'info'} [variant='default']
   * @param {number} [duration=3000]
   */
  function show(message, variant, duration) {
    variant = variant || 'default';
    duration = duration || 3000;
    var isMobile = window.innerWidth <= 1024;

    var c = getContainer();
    var toast = document.createElement('div');
    toast.className = 'toast-notification' + (variant !== 'default' ? ' ' + variant : '');
    toast.style.opacity = '0';
    toast._dismissed = false;
    toast._duration = duration;

    toast.textContent = message;

    // Cap at 3 visible toasts
    var visible = c.querySelectorAll('.toast-notification:not(.toast-leaving)');
    if (visible.length >= 3) {
      dismissToast(visible[0]);
    }

    c.appendChild(toast);
    updateStackIndices();

    // Enter animation
    requestAnimationFrame(function () {
      toast.style.opacity = '';
      toast.classList.add('toast-entering');
      toast.addEventListener('animationend', function handler() {
        toast.classList.remove('toast-entering');
        toast.removeEventListener('animationend', handler);
        if (_isExpanded) layoutExpanded();
      });
    });

    toast._autoDismissAt = Date.now() + duration;
    toast._autoDismiss = setTimeout(function () { dismissToast(toast); }, duration);

    // Desktop: click to dismiss
    if (!isMobile) {
      toast.addEventListener('click', function () { dismissToast(toast); });
    }

    // Mobile: swipe up to dismiss, tap to expand
    if (isMobile) {
      var startY = 0;
      var currentY = 0;
      var dragging = false;

      toast.addEventListener('touchstart', function (e) {
        dragging = true;
        startY = e.touches[0].clientY;
        currentY = startY;
        toast.style.transition = 'none';
        clearTimeout(toast._autoDismiss);
      }, { passive: true });

      toast.addEventListener('touchmove', function (e) {
        if (!dragging) return;
        currentY = e.touches[0].clientY;
        var diff = currentY - startY;
        if (diff < 0) {
          e.preventDefault();
          var baseY = _isExpanded ? (toast._expandedY || 0) : 0;
          toast.style.transform = 'translateY(' + (baseY + diff) + 'px)';
          toast.style.opacity = String(Math.max(0, 1 + diff / 80));
        }
      }, { passive: false });

      toast.addEventListener('touchend', function () {
        if (!dragging) return;
        dragging = false;
        var diff = currentY - startY;
        if (diff < -40) {
          toast.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
          toast.style.transform = 'translateY(-60px)';
          toast.style.opacity = '0';
          toast._dismissed = true;
          setTimeout(function () {
            if (toast.parentNode) {
              toast.parentNode.removeChild(toast);
              updateStackIndices();
            }
          }, 200);
        } else {
          toast.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
          toast.style.opacity = '';
          if (_isExpanded) {
            toast.style.transform = 'translateY(' + (toast._expandedY || 0) + 'px)';
          } else {
            toast.style.transform = '';
            if (Math.abs(diff) < 10) {
              expandToasts();
              return;
            }
            toast._autoDismissAt = Date.now() + duration;
            toast._autoDismiss = setTimeout(function () { dismissToast(toast); }, duration);
          }
        }
      }, { passive: true });
    }

    return toast;
  }

  return {
    show: show,
  };
})();
