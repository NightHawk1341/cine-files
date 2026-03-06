/**
 * Star Backdrop
 * Decorative stars fixed to the viewport. Desktop only (>= 1025px).
 * Excluded on /ar-view. Exposes window._backdropContainer for info.js z-index interleaving.
 */

(function () {
  'use strict';

  const MIN_STARS_PER_ZONE = 5;
  const MAX_STARS_PER_ZONE = 12;
  const HOVER_RADIUS       = 130;   // px — cursor influence radius
  const MAX_HOVER_OFFSET   = 55;    // px — max displacement for close layer (scaled by hoverScale)
  const MAX_HOVER_ROT      = 22;    // deg — max extra rotation for close layer
  const LERP_HOVER         = 0.07;
  const LERP_PARALLAX      = 0.06;
  const LERP_REPOSITION    = 0.018; // slow drift when zones change on SPA navigation
  const DESKTOP_MIN        = 1025;

  const EXCLUDED_PATHS = ['/ar-view', '/ar-view.html'];

  // Cutout ellipse [rx, ry] per layer.
  // Far layer has a higher ry/rx ratio — blur makes stars look rounder, so deeper
  // cutouts compensate. ryMin guard in buildStarSVG prevents gear-like appearance.
  const DEPTHS = [
    [62, 80],  // close: ratio 1.29 — shallow cutouts
    [57, 84],  // mid:   ratio 1.47 — medium
    [52, 88],  // far:   ratio 1.69 — deep (compensates for blur)
  ];

  // Layers: 0=close (large, near screen edge), 1=mid, 2=far (small, near content edge).
  // hoverScale: smaller/farther stars react less to cursor.
  // xRange: [edgeDist_min, edgeDist_max] — 0=screen edge, 1=content edge.
  //   Slight overlap between ranges is intentional (adds realism).
  //   Negative edgeDist = star extends off the screen edge (clipped by overflow:hidden).
  // zIndex interleaves with rain drops: close=6, mid=4, far=2.
  const LAYERS = [
    { parallax: 0.06,  blurBase: 0.0, sizeMin: 88, sizeMax: 138, zIndex: 6, hoverScale: 1.00, xRange: [-0.15, 0.50] },
    { parallax: 0.025, blurBase: 0.8, sizeMin: 62, sizeMax:  98, zIndex: 4, hoverScale: 0.55, xRange: [ 0.22, 0.78] },
    { parallax: 0.005, blurBase: 1.6, sizeMin: 44, sizeMax:  70, zIndex: 2, hoverScale: 0.20, xRange: [ 0.50, 1.05] },
  ];

  const NO_MOUSE = -9999;

  let container   = null;
  let stars       = [];
  let mouseX      = NO_MOUSE;
  let mouseY      = NO_MOUSE;
  let rafId       = null;
  let lastTime    = 0;
  let initialized = false;
  let uidCounter  = 0;
  let resizeTimer = null;
  let prevVpW     = 0; // viewport width at last buildStars/zone-based reposition
  let prevVpH     = 0; // viewport height at last buildStars/zone-based reposition

  // Cached header height for partial-visibility dimming (updated every ~2 s)
  let cachedHeaderH    = 0;
  let lastHeaderMeasure = -Infinity;

  function isExcluded() {
    const p = window.location.pathname;
    return EXCLUDED_PATHS.some(ep => p === ep || p.endsWith(ep));
  }

  function computeZones(overrideContentW) {
    const vpW      = window.innerWidth;
    const vpH      = window.innerHeight;
    const contentW = overrideContentW || Math.min(1300, vpW * 0.92);
    const sideGap  = (vpW - contentW) / 2;
    const margin   = 30;

    let L = { x1: 10,          x2: Math.max(sideGap - margin, 60), y1: 50, y2: vpH - 60 };
    let R = { x1: Math.min(vpW - sideGap + margin, vpW - 60), x2: vpW - 10, y1: 50, y2: vpH - 60 };

    if (L.x2 - L.x1 < 60) {
      L = { x1: 10,          x2: vpW * 0.22, y1: 50, y2: vpH - 60 };
      R = { x1: vpW * 0.78,  x2: vpW - 10,   y1: 50, y2: vpH - 60 };
    }
    return [L, R];
  }

  // edgeDist → star-centre X. 0 = screen edge, 1 = content edge (both zones).
  function edgeDistToX(edgeDist, zone, zoneIdx) {
    const zoneW = zone.x2 - zone.x1;
    return zoneIdx === 0
      ? zone.x1 + edgeDist * zoneW   // left zone: left=screen, right=content
      : zone.x2 - edgeDist * zoneW;  // right zone: right=screen, left=content
  }

  function buildStarSVG(uid, layerIdx, isRightZone) {
    const [rx, ry] = DEPTHS[layerIdx];
    const ryMax = ry + 4;
    const ryMin = Math.max(ry - 5, Math.ceil(rx * 1.25)); // ry/rx ≥ 1.25 at all times → no gear look

    const ellipses = [0, 60, 120, 180, 240, 300].map(a => {
      const dur = (4 + Math.random() * 7).toFixed(1);
      return (
        `<ellipse cx="150" cy="0" rx="${rx}" ry="${ry}" transform="rotate(${a} 150 150)">` +
        `<animate attributeName="ry" values="${ry};${ryMax};${ryMin};${ry}" dur="${dur}s" repeatCount="indefinite"/>` +
        `</ellipse>`
      );
    }).join('');

    // Default highlight: left-zone stars face right, right-zone stars face left.
    // fx/fy are updated each frame to point toward the cursor (cursor acts as light source).
    const defFx = isRightZone ? 0.25 : 0.75;

    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">` +
        `<defs>` +
          `<mask id="sbm-${uid}">` +
            `<rect width="300" height="300" fill="white"/>` +
            `<g fill="black" transform="rotate(30 150 150)">${ellipses}</g>` +
          `</mask>` +
          `<radialGradient id="sbg-${uid}" cx="0.5" cy="0.5" fx="${defFx}" fy="0.5" r="0.5" gradientUnits="objectBoundingBox">` +
            `<stop offset="0%"   stop-color="white" stop-opacity="0.60"/>` +
            `<stop offset="38%"  stop-color="white" stop-opacity="0.04"/>` +
            `<stop offset="100%" stop-color="white" stop-opacity="0"/>` +
          `</radialGradient>` +
        `</defs>` +
        `<circle class="star-shape"     cx="150" cy="150" r="120" mask="url(#sbm-${uid})"/>` +
        `<circle class="star-highlight" cx="150" cy="150" r="120" mask="url(#sbm-${uid})" fill="url(#sbg-${uid})"/>` +
      `</svg>`
    );
  }

  function buildStars(zones) {
    prevVpW = window.innerWidth;
    prevVpH = window.innerHeight;
    const vpH = window.innerHeight;
    const vpCenterY = vpH / 2;

    zones.forEach((zone, zoneIdx) => {
      const isRightZone = zoneIdx === 1;
      const zoneW = zone.x2 - zone.x1;
      const zoneH = zone.y2 - zone.y1;
      if (zoneW < 60) return;

      const starsInZone = Math.max(MIN_STARS_PER_ZONE, Math.min(MAX_STARS_PER_ZONE,
        Math.round(zoneW * zoneH / 36000)));

      const cellH  = zoneH / starsInZone;
      const jitter = cellH * 0.18;

      for (let i = 0; i < starsInZone; i++) {
        const uid = ++uidCounter;

        // Round-robin layer assignment — no two adjacent Y-cells share a layer,
        // preventing visual density clusters within a zone.
        const layerIdx = i % LAYERS.length;
        const layer    = LAYERS[layerIdx];

        const effectiveSizeMax = Math.min(layer.sizeMax, zoneW * 1.8);
        const effectiveSizeMin = Math.min(layer.sizeMin, effectiveSizeMax - 10);
        if (effectiveSizeMin >= effectiveSizeMax) continue;

        // edgeDist: random within this layer's X zone (screen-edge stars get close layer,
        // content-edge stars get far layer — see LAYERS[*].xRange).
        const [xrMin, xrMax] = layer.xRange;
        const edgeDist = xrMin + Math.random() * (xrMax - xrMin);

        // Size driven primarily by X position (near screen edge = larger) plus Y distance from
        // viewport centre (top/bottom edges = larger). Combines to create a depth-field look.
        const rowCenterY   = zone.y1 + i * cellH + cellH / 2;
        const normDistY    = Math.abs(rowCenterY - vpCenterY) / (vpH / 2);
        const sRange       = effectiveSizeMax - effectiveSizeMin;
        const sizeFromEdge = effectiveSizeMax - edgeDist * sRange;        // large at screen edge
        const sizeFromY    = effectiveSizeMin + normDistY * sRange;       // large at top/bottom
        const size = Math.max(effectiveSizeMin,
          sizeFromEdge * 0.65 + sizeFromY * 0.35 + (Math.random() - 0.5) * sRange * 0.10);

        // Y: one star per jittered vertical cell so stars are evenly spread
        const y = zone.y1 + i * cellH + jitter + Math.random() * (cellH - 2 * jitter);
        const x = edgeDistToX(edgeDist, zone, zoneIdx);

        const spinSpd   = (8 + Math.random() * 24) * (Math.random() < 0.5 ? 1 : -1);
        const initAngle = Math.random() * 360;

        // Brightness: smaller (far) stars are noticeably darker
        const sizeNorm   = Math.max(0, Math.min(1, (size - 40) / 100));
        const brightness = 0.16 + sizeNorm * 0.12 + Math.random() * 0.05; // 0.16–0.33
        const blur       = Math.max(0, layer.blurBase + (1 - sizeNorm) * 0.8);

        // Glow scales with star size — close (large) stars get more glow than far (small) ones
        const glowPx = 12 - layerIdx * 3;
        const defFx  = isRightZone ? 0.25 : 0.75;

        const el = document.createElement('div');
        el.className = 'star-item';
        el.style.cssText = [
          `width:${size.toFixed(1)}px`,
          `height:${size.toFixed(1)}px`,
          `left:${(x - size / 2).toFixed(1)}px`,
          `top:${(y - size / 2).toFixed(1)}px`,
          `filter:blur(${blur.toFixed(1)}px) drop-shadow(0 0 ${glowPx}px color-mix(in srgb, var(--brand-primary) 22%, transparent)) brightness(${brightness.toFixed(2)})`,
          `opacity:1`,
          `z-index:${layer.zIndex}`,
        ].join(';');
        el.innerHTML = buildStarSVG(uid, layerIdx, isRightZone);
        container.appendChild(el);

        const gradEl = el.querySelector(`#sbg-${uid}`);

        stars.push({
          el, gradEl,
          x, y,
          targetX: x,    // lerped toward on SPA navigation zone changes
          targetY: y,    // lerped toward on viewport height changes
          size,
          angle: initAngle,
          spinSpd,
          hx: 0, hy: 0, hr: 0,
          thx: 0, thy: 0, thr: 0,
          parallax:   layer.parallax,
          hoverScale: layer.hoverScale,
          parallaxY:  0,
          edgeDist,
          zoneIdx,
          defFx,
          gfx: defFx,
          gfy: 0.5,
          lastOpacity: 1, // tracks last written opacity to avoid redundant style writes
        });
      }
    });
  }

  function repositionStars(zones, fromResize) {
    if (fromResize && prevVpW > 0) {
      // Viewport resize: scale positions from the viewport center for symmetric
      // movement on both sides rather than anchoring to the left screen edge.
      const newVpW    = window.innerWidth;
      const newVpH    = window.innerHeight;
      const prevHalfW = prevVpW / 2;
      const newHalfW  = newVpW / 2;
      const prevHalfH = prevVpH / 2;
      const newHalfH  = newVpH / 2;
      stars.forEach(s => {
        const zone = zones[s.zoneIdx];
        // X: scale from viewport center
        const cfX  = (s.x - prevHalfW) / prevHalfW;
        const rawX = newHalfW + cfX * newHalfW;
        s.targetX  = zone ? Math.max(zone.x1, Math.min(zone.x2, rawX)) : rawX;
        // Y: scale from viewport center when height changed
        if (prevHalfH > 0 && Math.abs(newVpH - prevVpH) > 1) {
          const cfY  = (s.y - prevHalfH) / prevHalfH;
          const rawY = newHalfH + cfY * newHalfH;
          s.targetY  = zone ? Math.max(zone.y1, Math.min(zone.y2, rawY)) : rawY;
        }
      });
      prevVpW = newVpW;
      prevVpH = newVpH;
      return;
    }
    // SPA navigation or fresh build: use zone-based positioning.
    prevVpW = window.innerWidth;
    prevVpH = window.innerHeight;
    stars.forEach(s => {
      const zone = zones[s.zoneIdx];
      if (!zone) return;
      s.targetX = edgeDistToX(s.edgeDist, zone, s.zoneIdx);
    });
  }

  function clearStars() {
    stars.forEach(s => s.el.remove());
    stars = [];
  }

  function tick(ts) {
    if (!initialized) return;

    const dt      = Math.min((ts - lastTime) / 1000, 0.1);
    lastTime      = ts;
    const scrollY  = window.scrollY || window.pageYOffset;
    const hasCursor = mouseX !== NO_MOUSE;

    // Refresh header height every ~2 s to avoid a DOM query each frame
    if (ts - lastHeaderMeasure > 2000) {
      const hEl = document.querySelector('.header');
      cachedHeaderH = hEl ? hEl.offsetHeight : 60;
      lastHeaderMeasure = ts;
    }
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;

    stars.forEach(s => {
      s.angle += s.spinSpd * dt;

      // Smooth drift toward repositioned X (e.g. after SPA navigation or resize)
      if (Math.abs(s.x - s.targetX) > 0.5) {
        s.x += (s.targetX - s.x) * LERP_REPOSITION;
        s.el.style.left = `${(s.x - s.size / 2).toFixed(1)}px`;
      }

      // Smooth drift toward repositioned Y (e.g. after viewport height change)
      if (Math.abs(s.y - s.targetY) > 0.5) {
        s.y += (s.targetY - s.y) * LERP_REPOSITION;
        s.el.style.top = `${(s.y - s.size / 2).toFixed(1)}px`;
      }

      // Parallax: close stars drift up more as user scrolls
      const targetPY = -scrollY * s.parallax;
      s.parallaxY += (targetPY - s.parallaxY) * LERP_PARALLAX;

      // Cursor repulsion — magnitude scaled by layer (far stars barely move)
      const hoverOffMax = MAX_HOVER_OFFSET * s.hoverScale;
      const hoverRotMax = MAX_HOVER_ROT    * s.hoverScale;

      const dx   = s.x - mouseX;
      const dy   = s.y - mouseY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < HOVER_RADIUS && dist > 0) {
        const f   = (HOVER_RADIUS - dist) / HOVER_RADIUS;
        s.thx = (dx / dist) * f * hoverOffMax;
        s.thy = (dy / dist) * f * hoverOffMax;
        s.thr = (dx / dist) * f * hoverRotMax;
      } else {
        s.thx = 0; s.thy = 0; s.thr = 0;
      }

      s.hx += (s.thx - s.hx) * LERP_HOVER;
      s.hy += (s.thy - s.hy) * LERP_HOVER;
      s.hr += (s.thr - s.hr) * LERP_HOVER;

      s.el.style.transform =
        `translate(${s.hx.toFixed(1)}px,${(s.hy + s.parallaxY).toFixed(1)}px) ` +
        `rotate(${(s.angle + s.hr).toFixed(1)}deg)`;

      // Partial-visibility dimming.
      // Stars that are mostly hidden behind the header, or clipped at a viewport
      // edge, get their opacity reduced so their visible bright edge doesn't distract.
      const visX = s.x + s.hx;
      const visY = s.y + s.hy + s.parallaxY;
      const r    = s.size / 2;
      const visibleW = Math.min(visX + r, vpW)  - Math.max(visX - r, 0);
      const visibleH = Math.min(visY + r, vpH)  - Math.max(visY - r, cachedHeaderH);
      const visRatio  = Math.max(0, visibleW) * Math.max(0, visibleH) / (s.size * s.size);
      // Stars < 25 % visible: ramp opacity down (power curve for smooth feel)
      const targetOp = visRatio < 0.25 ? Math.pow(visRatio / 0.25, 0.65) : 1;
      if (Math.abs(s.lastOpacity - targetOp) > 0.015) {
        s.lastOpacity = targetOp;
        s.el.style.opacity = targetOp.toFixed(3);
      }

      // Radial highlight — cursor is the light source.
      // When cursor is to the right of the star, the bright focal point is on the right side.
      // Use the star's actual visual position (base + parallax + hover offset) so the
      // angle calculation stays accurate regardless of scroll or cursor repulsion.
      if (s.gradEl) {
        let targetFx, targetFy;
        if (hasCursor) {
          const visualX   = s.x + s.hx;
          const visualY   = s.y + s.hy + s.parallaxY;
          const worldAngle = Math.atan2(mouseY - visualY, mouseX - visualX);
          // Subtract the star's current rotation so the focal point is in local SVG space
          const localAngle = worldAngle - (s.angle + s.hr) * Math.PI / 180;
          targetFx = 0.5 + 0.45 * Math.cos(localAngle);
          targetFy = 0.5 + 0.45 * Math.sin(localAngle);
        } else {
          targetFx = s.defFx;
          targetFy = 0.5;
        }
        s.gfx += (targetFx - s.gfx) * 0.09;
        s.gfy += (targetFy - s.gfy) * 0.09;
        s.gradEl.setAttribute('fx', s.gfx.toFixed(3));
        s.gradEl.setAttribute('fy', s.gfy.toFixed(3));
      }
    });

    rafId = requestAnimationFrame(tick);
  }

  function startLoop() {
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  function createContainer() {
    container = document.createElement('div');
    container.className = 'star-backdrop-container';
    document.body.insertBefore(container, document.body.firstChild);
    window._backdropContainer = container;
  }

  function measureContentWidth() {
    // Pages can declare their actual (narrow) content width via data-star-content-width
    // so that star zones are computed relative to the visible content, not the full overlay.
    const declared = document.querySelector('[data-star-content-width]');
    if (declared) {
      const w = parseInt(declared.dataset.starContentWidth, 10);
      if (w > 0) return w;
    }
    // Fallback: measure the page overlay/container element.
    const el = document.querySelector('[class*="-page-overlay"],[class*="-page-container"]');
    if (el) {
      const w = el.getBoundingClientRect().width;
      if (w > 200) return w;
    }
    return null;
  }

  function init() {
    if (initialized) return;
    if (window.innerWidth < DESKTOP_MIN) return;
    if (isExcluded()) return;

    initialized = true;
    createContainer();
    buildStars(computeZones());

    document.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });
    document.addEventListener('mouseleave', () => { mouseX = NO_MOUSE; mouseY = NO_MOUSE; });

    window.addEventListener('resize', () => {
      if (!initialized || isExcluded()) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const newW = window.innerWidth;
        if (newW < DESKTOP_MIN) {
          // Crossed into mobile — hide stars until we come back to desktop
          clearStars();
          return;
        }
        if (stars.length === 0) {
          // Stars were previously cleared (e.g. went mobile and came back)
          if (!container || !document.body.contains(container)) createContainer();
          buildStars(computeZones());
          return;
        }
        // Minor resize (DevTools panel open/close, browser chrome): smoothly
        // reposition stars to fit new zones instead of destroying and recreating.
        requestAnimationFrame(() => {
          const zones = computeZones(measureContentWidth());
          repositionStars(zones, true);
        });
      }, 400);
    });

    startLoop();
  }

  function handleNavigation() {
    if (window.innerWidth < DESKTOP_MIN) return;

    if (isExcluded()) {
      if (container) container.style.display = 'none';
      stopLoop();
      return;
    }

    if (!initialized) {
      init();
      return;
    }

    // Recreate if SPA router removed the container from the DOM
    if (!document.body.contains(container)) {
      createContainer();
      buildStars(computeZones());
    }

    container.style.display = '';
    if (!rafId) startLoop();

    // After one frame the new page's DOM is ready — measure content width and
    // smoothly reposition stars so they respect the current page's layout zones.
    requestAnimationFrame(() => {
      const zones = computeZones(measureContentWidth());
      repositionStars(zones);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('spa:pageenter', handleNavigation);
  window.addEventListener('popstate', handleNavigation);
})();
