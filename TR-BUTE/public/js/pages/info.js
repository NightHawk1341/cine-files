import { SMALL_MOBILE_BREAKPOINT } from '../core/constants.js';
import { isVkCdnUrl, proxyVkCdnUrl } from '../core/formatters.js';

// Aspect ratio matches picker card (849 × 1200 px — portrait)
const DROP_ASPECT    = 1200 / 849; // ≈ 1.414 (height = width × DROP_ASPECT)
const MIN_ZONE_WIDTH = 80;
const AVOID_RADIUS   = 140;  // px cursor proximity
const MAX_OFFSET     = 65;   // px max horizontal avoidance shift
const LERP           = 0.07;
const CURSOR_ACTIVE_MS = 400; // ms after last move that cursor is considered "active"

// Parallax layers — zIndex interleaves with star-backdrop: close=5, mid=3, far=1
// Far layer: small, blurry, slow, near content edge
// Close layer: large, sharp, fast, near screen edge
const RAIN_LAYERS = [
  { durMin: 36, durMax: 48, wMin: 80,  wMax: 110, filter: 'brightness(0.60) blur(1.6px)', zIndex: 1 }, // far
  { durMin: 26, durMax: 36, wMin: 105, wMax: 135, filter: 'brightness(0.75) blur(0.7px)', zIndex: 3 }, // mid
  { durMin: 18, durMax: 26, wMin: 132, wMax: 170, filter: 'brightness(0.90)',              zIndex: 5 }, // close
];

class ImageRain {
  constructor() {
    this.container      = null;
    this.ownContainer   = null; // only set if we created our own container
    this.drops          = [];
    this.isActive       = false;
    this.imageCount     = 32;
    this.rafId          = null;
    this.mouseX         = -9999;
    this.mouseY         = -9999;
    this.lastMovedAt    = -Infinity;
    this.mouseMoveHandler  = null;
    this.mouseLeaveHandler = null;
  }

  getZones() {
    const vpW = window.innerWidth;

    // Measure actual content width from the narrowest visible page element.
    // The info page content (info-team) is max 900px — much narrower than the
    // fallback 1300px estimate, which would produce zones too thin to spawn drops.
    let contentW = null;
    for (const sel of ['.info-team', '.info-page > *']) {
      const el = document.querySelector(sel);
      if (el) {
        const w = el.getBoundingClientRect().width;
        if (w > 100 && w < vpW * 0.97) { contentW = w; break; }
      }
    }
    if (!contentW) contentW = Math.min(1300, vpW * 0.92);

    const sideGap = (vpW - contentW) / 2;
    const margin  = 20;

    let L = { x1: 0, x2: Math.max(sideGap - margin, 50) };
    let R = { x1: Math.min(vpW - sideGap + margin, vpW - 50), x2: vpW };

    if (L.x2 < 50) {
      L = { x1: 0, x2: vpW * 0.20 };
      R = { x1: vpW * 0.80, x2: vpW };
    }
    return [L, R];
  }

  async init() {
    if (window.innerWidth <= SMALL_MOBILE_BREAKPOINT) return;

    const zones = this.getZones();
    const totalZoneWidth = zones.reduce((s, z) => s + (z.x2 - z.x1), 0);
    if (totalZoneWidth < MIN_ZONE_WIDTH * 2) return;

    try {
      this.createContainer();
      this.fetchVariationImages().then(imageUrls => {
        if (!imageUrls || imageUrls.length === 0) return;
        this.startRain(imageUrls);
      }).catch(err => {
        console.error('Failed to fetch variation images for rain:', err);
      });
    } catch (err) {
      console.error('Image rain initialization failed:', err);
    }
  }

  async fetchVariationImages() {
    const [imagesResponse, productsResponse] = await Promise.all([
      fetch('/api/all-images'),
      fetch('/products'),
    ]);

    if (!imagesResponse.ok) throw new Error('Failed to fetch images');
    if (!productsResponse.ok) throw new Error('Failed to fetch products');

    const [allImages, allProducts] = await Promise.all([
      imagesResponse.json(),
      productsResponse.json(),
    ]);

    const eligibleIds = new Set(
      allProducts
        .filter(p => p.type === 'фирменный' && p.status === 'available' && !p.triptych && p.id !== 1)
        .map(p => p.id)
    );

    const urls = allImages
      .filter(img => img.extra === 'варианты' && eligibleIds.has(img.product_id))
      .map(img => img.url)
      .sort(() => Math.random() - 0.5)
      .slice(0, this.imageCount);

    return urls;
  }

  createContainer() {
    // Share the star-backdrop container for correct z-index interleaving with stars.
    if (window._backdropContainer && document.body.contains(window._backdropContainer)) {
      this.container = window._backdropContainer;
    } else {
      this.ownContainer = document.createElement('div');
      this.ownContainer.className = 'image-rain-container';
      document.body.appendChild(this.ownContainer);
      this.container = this.ownContainer;
    }
  }

  startRain(imageUrls) {
    if (imageUrls.length === 0) return;

    const zones   = this.getZones();
    const vpH     = window.innerHeight;
    const nowSec  = performance.now() / 1000;
    let   imgIdx  = 0;
    const pool    = [...imageUrls].sort(() => Math.random() - 0.5);

    zones.forEach((zone, zoneIdx) => {
      const zoneW = zone.x2 - zone.x1;
      if (zoneW < MIN_ZONE_WIDTH) return;

      const dropsInZone = Math.max(3, Math.min(12, Math.round(zoneW / 45)));

      for (let i = 0; i < dropsInZone; i++) {
        const imageUrl = pool[imgIdx % pool.length];
        imgIdx++;

        // posT: 0=screen edge side (close layer), 1=content edge side (far layer)
        const posT         = (i + 0.5 + (Math.random() - 0.5) * 0.8) / dropsInZone;
        const clampedPosT  = Math.max(0, Math.min(1, posT));
        const distFromEdge = zoneIdx === 0 ? clampedPosT : 1 - clampedPosT; // 0=screen, 1=content
        const layerIdx     = distFromEdge < 0.38 ? 2 : (distFromEdge < 0.70 ? 1 : 0);
        const layer        = RAIN_LAYERS[layerIdx];

        const width    = layer.wMin + Math.random() * (layer.wMax - layer.wMin);
        const height   = width * DROP_ASPECT;
        const duration = layer.durMin + Math.random() * (layer.durMax - layer.durMin);
        const delay    = Math.random() * duration;
        const rotation = -12 + Math.random() * 24;

        // X position: screen-edge side may overflow off screen; content-edge stays in zone
        let leftPx;
        if (zoneIdx === 0) { // left zone
          const xContent = zone.x2 - width;
          const xScreen  = zone.x1 - width * clampedPosT * 0.5;
          leftPx = xScreen + clampedPosT * Math.max(0, xContent - xScreen);
          leftPx += (Math.random() - 0.5) * zoneW * 0.15;
          leftPx = Math.min(leftPx, zone.x2 - width); // never into content
        } else { // right zone
          const xContent = zone.x1;
          const xScreen  = zone.x2 - width + width * clampedPosT * 0.5;
          leftPx = xContent + clampedPosT * Math.max(0, xScreen - xContent);
          leftPx += (Math.random() - 0.5) * zoneW * 0.15;
          leftPx = Math.max(leftPx, zone.x1); // never into content
        }

        const topPx    = -height - Math.random() * 20;
        const animStart = nowSec + delay;

        // Outer div: handles position, filter, opacity, z-index
        const el = document.createElement('div');
        el.className = 'rain-drop placeholder';
        el.style.cssText = [
          `width:${width.toFixed(1)}px`,
          `height:${height.toFixed(1)}px`,
          `left:${leftPx.toFixed(1)}px`,
          `top:${topPx.toFixed(1)}px`,
          `filter:${layer.filter}`,
          `z-index:${layer.zIndex}`,
        ].join(';');

        // Inner div: handles fall animation.
        // Keeping the animation on a child element means its transform-origin (center of
        // inner bbox) is never displaced by the parent's position changes, which would
        // otherwise cause the visual rotation pivot to appear above the image.
        const inner = document.createElement('div');
        inner.className = 'rain-drop-inner';
        inner.style.animationDuration = `${duration.toFixed(2)}s`;
        inner.style.animationDelay    = `${delay.toFixed(2)}s`;
        inner.style.setProperty('--drop-rotation', `${rotation}deg`);
        el.appendChild(inner);

        const img = document.createElement('img');
        img.alt = '';
        img.onload = () => {
          el.classList.remove('placeholder');
          inner.appendChild(img);
          requestAnimationFrame(() => el.classList.add('loaded'));
        };
        img.onerror = () => {
          if (isVkCdnUrl(imageUrl) && !img.src.includes('/api/img')) {
            img.src = proxyVkCdnUrl(imageUrl);
          }
        };
        img.src = imageUrl;
        this.container.appendChild(el);

        const dropData = {
          el,
          leftPx,
          topPx,
          width,
          height,
          animStartTime: animStart,
          duration,
          state: { ax: 0, tx: 0 }, // horizontal avoidance only (avoids rotation-pivot issue)
        };

        // Jitter horizontal position each animation loop
        inner.addEventListener('animationiteration', () => {
          const jitter = (Math.random() - 0.5) * 18;
          let newLeft  = dropData.leftPx + jitter;
          if (zoneIdx === 0) newLeft = Math.min(newLeft, zone.x2 - dropData.width);
          else               newLeft = Math.max(newLeft, zone.x1);
          dropData.leftPx = newLeft;
          // RAF loop updates el.style.left each frame — no direct set needed here
        });

        this.drops.push(dropData);
      }
    });

    this.isActive = true;
    this.startLoop();
  }

  startLoop() {
    this.mouseMoveHandler = e => {
      this.mouseX      = e.clientX;
      this.mouseY      = e.clientY;
      this.lastMovedAt = performance.now();
    };
    this.mouseLeaveHandler = () => {
      this.mouseX      = -9999;
      this.mouseY      = -9999;
      this.lastMovedAt = -Infinity;
    };
    document.addEventListener('mousemove',  this.mouseMoveHandler);
    document.addEventListener('mouseleave', this.mouseLeaveHandler);

    const loop = ts => {
      if (!this.container) return;

      const cursorActive = (ts - this.lastMovedAt) < CURSOR_ACTIVE_MS && this.mouseX > -9000;
      const vpH = window.innerHeight;

      this.drops.forEach(d => {
        const s = d.state;

        if (cursorActive) {
          // Analytical drop-centre Y — no getBoundingClientRect needed each frame
          const elapsed = ts / 1000 - d.animStartTime;
          let cy;
          if (elapsed < 0) {
            cy = d.topPx + d.height / 2; // during delay: off-screen above
          } else {
            const progress = (elapsed % d.duration) / d.duration;
            cy = d.topPx + progress * (4 * vpH + 500) + d.height / 2;
          }

          if (cy >= -d.height && cy <= vpH + d.height) {
            const cx   = d.leftPx + d.width / 2;
            const dx   = cx - this.mouseX;
            const dy   = (d.topPx + d.height / 2) - this.mouseY; // use rest position for dx dir
            const dist = Math.sqrt(dx * dx + (cy - this.mouseY) ** 2);

            if (dist < AVOID_RADIUS && dist > 0) {
              const f  = (AVOID_RADIUS - dist) / AVOID_RADIUS;
              s.tx = (dx / dist) * f * MAX_OFFSET;
            } else {
              s.tx = 0;
            }
          } else {
            s.tx = 0;
          }
        } else {
          s.tx = 0;
        }

        s.ax += (s.tx - s.ax) * LERP;

        // Avoidance applied as a position shift on the outer element only.
        // The inner element's animation pivot (transform-origin: center center) is
        // always relative to the inner's own bbox, so shifting the parent left/right
        // does not displace the rotation anchor.
        d.el.style.left = `${(d.leftPx + s.ax).toFixed(1)}px`;
      });

      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  }

  destroy() {
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
    this.drops.forEach(d => d.el.remove());
    this.drops = [];
    if (this.ownContainer) { this.ownContainer.remove(); this.ownContainer = null; }
    this.container = null;
    if (this.mouseMoveHandler)  document.removeEventListener('mousemove',  this.mouseMoveHandler);
    if (this.mouseLeaveHandler) document.removeEventListener('mouseleave', this.mouseLeaveHandler);
    this.mouseMoveHandler  = null;
    this.mouseLeaveHandler = null;
    this.isActive = false;
  }
}

function initScrollAnimations() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('animate-in'); });
  }, { threshold: 0.1, rootMargin: '0px 0px -100px 0px' });

  document.querySelectorAll('.info-section').forEach(s => observer.observe(s));
}

let isInfoPageInitialized = false;
let infoPageRain          = null;
let infoPageResizeHandler = null;

function cleanupInfoPage() {
  isInfoPageInitialized = false;
  if (infoPageRain) { infoPageRain.destroy(); infoPageRain = null; }
  if (infoPageResizeHandler) { window.removeEventListener('resize', infoPageResizeHandler); infoPageResizeHandler = null; }
}

async function initInfoPage() {
  if (isInfoPageInitialized) return;
  isInfoPageInitialized = true;

  infoPageRain = new ImageRain();
  infoPageRain.init();
  initScrollAnimations();

  let resizeDebounce = null;
  let lastVpWidth    = window.innerWidth;

  infoPageResizeHandler = () => {
    const vpW     = window.innerWidth;
    const isNarrow = vpW <= SMALL_MOBILE_BREAKPOINT;

    if (isNarrow && infoPageRain && infoPageRain.isActive) {
      infoPageRain.destroy();
      infoPageRain = null;
      lastVpWidth  = vpW;
      return;
    }

    if (!isNarrow) {
      // Only rebuild on meaningful width changes — ignore browser chrome appearing/hiding
      if (Math.abs(vpW - lastVpWidth) <= 50) return;

      clearTimeout(resizeDebounce);
      resizeDebounce = setTimeout(() => {
        lastVpWidth = window.innerWidth;
        if (infoPageRain) infoPageRain.destroy();
        infoPageRain = new ImageRain();
        infoPageRain.init();
      }, 400);
    }
  };
  window.addEventListener('resize', infoPageResizeHandler);
}

if (typeof window.registerPage === 'function') {
  window.registerPage('/info', { init: initInfoPage, cleanup: cleanupInfoPage });
}

const isInfoPagePath = window.location.pathname === '/info' || window.location.pathname === '/info.html';
if (isInfoPagePath) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initInfoPage);
  } else {
    initInfoPage();
  }
}
