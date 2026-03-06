// ============================================================
// ANNOUNCEMENT BAR MODULE
// Persistent element displayed below footer on all pages.
// Fetches enabled/text from /api/settings/get?key=announcement_bar.
// When text overflows, scrolls horizontally; hover slows it;
// touch events allow manual dragging on mobile.
// ============================================================

const SETTING_KEY = 'announcement_bar';
const PX_PER_SEC = 60; // base scroll speed
const SLOW_MULTIPLIER = 4; // hover slows to 1/4 speed
const GAP_PX = 120; // spacing between the two text copies (2 × padding-left)

function initAnnouncementBar() {
  // Already rendered — nothing to do
  if (document.querySelector('.announcement-bar')) return;

  const bar = document.createElement('div');
  bar.className = 'announcement-bar';

  const inner = document.createElement('div');
  inner.className = 'announcement-bar-inner';
  bar.appendChild(inner);

  // Insert below footer, before the hidden SVG symbols block
  const svgEl = document.querySelector('svg[style*="display:none"]');
  if (svgEl) {
    svgEl.insertAdjacentElement('beforebegin', bar);
  } else {
    document.body.appendChild(bar);
  }

  // Fetch setting, then populate
  fetch('/api/settings/get?key=' + SETTING_KEY)
    .then(r => r.json())
    .then(data => {
      const val = data?.setting?.value;
      if (!val || !val.enabled) return;
      populateBar(bar, inner, val.text || '');
    })
    .catch(() => {/* silently ignore — bar stays hidden */});
}

function populateBar(bar, inner, text) {
  if (!text.trim()) return;

  inner.innerHTML = '';

  const track = document.createElement('div');
  track.className = 'announcement-bar-track';

  const span1 = document.createElement('span');
  span1.className = 'announcement-bar-text';
  span1.textContent = text;

  track.appendChild(span1);
  inner.appendChild(track);

  bar.classList.add('is-active');

  // Remove footer's bottom padding so bar sits flush against it
  const footer = document.querySelector('.footer');
  if (footer) footer.classList.add('has-announcement-bar');

  // Measure after a tick so the bar is painted and has a real width
  requestAnimationFrame(() => {
    const barWidth = bar.offsetWidth;
    const textWidth = span1.offsetWidth;

    if (textWidth <= barWidth) {
      // Text fits — static, centred
      inner.classList.add('is-static');
    } else {
      // Text overflows — duplicate and animate
      const span2 = document.createElement('span');
      span2.className = 'announcement-bar-text';
      span2.textContent = text;
      track.appendChild(span2);

      const totalWidth = textWidth + GAP_PX; // one cycle width
      const duration = totalWidth / PX_PER_SEC;
      const durationSlow = duration * SLOW_MULTIPLIER;

      track.style.animation = `announcement-scroll ${duration}s linear infinite`;
      bar.style.setProperty('--scroll-duration-slow', durationSlow + 's');

      attachTouchScroll(inner, track, totalWidth, duration);
    }
  });
}

// Allow finger-drag on mobile to manually scroll the track.
// Detects horizontal vs vertical swipe before committing, so vertical
// page scroll still works normally. On release, applies momentum so the
// track coasts to a stop before handing back to the CSS animation.
function attachTouchScroll(inner, track, totalWidth, duration) {
  let startX = 0;
  let startY = 0;
  let baseOffset = 0;
  let dragOffset = 0;
  let isDragging = false;
  let directionLocked = null; // 'h' | 'v' | null
  let resumeTimer = null;
  let lastVelocityX = 0; // px/ms, sampled each touchmove
  let lastMoveX = 0;
  let lastMoveTime = 0;

  function getTranslateX() {
    const t = window.getComputedStyle(track).transform;
    if (!t || t === 'none') return 0;
    return new DOMMatrix(t).m41;
  }

  function resumeAnimation(fromOffset) {
    track.style.transition = '';
    track.style.transform = '';
    const delay = (fromOffset / totalWidth) * duration;
    track.style.animation = `announcement-scroll ${duration}s ${delay}s linear infinite`;
  }

  inner.addEventListener('touchstart', e => {
    clearTimeout(resumeTimer);
    track.style.transition = ''; // interrupt any coast in progress
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    baseOffset = getTranslateX();
    dragOffset = baseOffset;
    isDragging = false;
    directionLocked = null;
    lastVelocityX = 0;
    lastMoveX = startX;
    lastMoveTime = Date.now();
  }, { passive: true });

  inner.addEventListener('touchmove', e => {
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;

    // Wait for movement to exceed threshold before locking direction
    if (!directionLocked) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      directionLocked = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
    }

    if (directionLocked === 'v') return; // let browser handle vertical scroll

    e.preventDefault(); // prevent page scroll during horizontal drag

    if (!isDragging) {
      isDragging = true;
      // Stop the CSS animation and lock to current position
      track.style.animation = 'none';
      track.style.transform = `translateX(${baseOffset}px)`;
    }

    // Track instantaneous velocity for momentum on release
    const now = Date.now();
    const dt = now - lastMoveTime;
    if (dt > 0) lastVelocityX = (e.touches[0].clientX - lastMoveX) / dt;
    lastMoveX = e.touches[0].clientX;
    lastMoveTime = now;

    dragOffset = Math.min(0, Math.max(-totalWidth, baseOffset + dx));
    track.style.transform = `translateX(${dragOffset}px)`;
  }, { passive: false }); // passive:false required to call preventDefault

  function finishDrag() {
    if (!isDragging) return;
    isDragging = false;
    directionLocked = null;

    // Discard velocity if finger was held still before lifting (>80 ms gap)
    const velocity = Date.now() - lastMoveTime > 80 ? 0 : lastVelocityX;

    if (Math.abs(velocity) > 0.05) {
      // Coast: animate to a momentum-projected position, then resume auto-scroll
      const targetOffset = Math.min(0, Math.max(-totalWidth, dragOffset + velocity * 250));
      track.style.transition = 'transform 350ms cubic-bezier(0, 0, 0.2, 1)';
      track.style.transform = `translateX(${targetOffset}px)`;
      resumeTimer = setTimeout(() => resumeAnimation(targetOffset), 380);
    } else {
      // No meaningful velocity — short pause then resume
      resumeTimer = setTimeout(() => resumeAnimation(dragOffset), 300);
    }
  }

  inner.addEventListener('touchend', finishDrag);
  inner.addEventListener('touchcancel', finishDrag);
}

// Auto-init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAnnouncementBar);
} else {
  initAnnouncementBar();
}
