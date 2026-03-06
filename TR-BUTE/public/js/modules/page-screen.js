// ============================================================
// PAGE SCREEN MODULE
// Renders centered status/error/empty screens inside a container.
// Used for: navigation errors, empty states, login-required screens.
// CSS: /css/page-screen.css (imported via global.css)
// ============================================================

/**
 * Render a full-area status screen inside a container element.
 *
 * @param {Element} container - Element whose innerHTML gets replaced
 * @param {Object} opts
 * @param {string} [opts.icon]      - Raw SVG HTML for the icon
 * @param {string} [opts.iconType]  - 'error' | 'neutral' (default: 'neutral')
 * @param {string}  opts.title      - Main heading (required)
 * @param {string} [opts.text]      - Subtext paragraph
 * @param {Array}  [opts.buttons]   - Action buttons/links:
 *   { label, href?, onClick?, primary? }
 *   primary defaults to true for the first button, false for the rest
 */
export function showPageScreen(container, { icon, iconType = 'neutral', title, text, buttons = [] }) {
  const iconCls = iconType === 'error'
    ? 'page-screen-icon page-screen-icon--error'
    : 'page-screen-icon';

  const iconHtml = icon
    ? `<div class="${iconCls}">${icon}</div>`
    : '';

  const textHtml = text
    ? `<p class="page-screen-text">${text}</p>`
    : '';

  const btnsHtml = buttons.length
    ? `<div class="page-screen-actions">
        ${buttons.map((b, i) => {
          const isPrimary = b.primary !== undefined ? b.primary : i === 0;
          const cls = isPrimary
            ? 'page-screen-btn page-screen-btn--primary'
            : 'page-screen-btn page-screen-btn--secondary';
          if (b.href) {
            return `<a href="${b.href}" class="${cls}" data-screen-btn="${i}">${b.label}</a>`;
          }
          return `<button type="button" class="${cls}" data-screen-btn="${i}">${b.label}</button>`;
        }).join('')}
      </div>`
    : '';

  container.innerHTML = `
    <div class="page-screen">
      ${iconHtml}
      <h2 class="page-screen-title">${title}</h2>
      ${textHtml}
      ${btnsHtml}
    </div>
  `;

  buttons.forEach((b, i) => {
    const el = container.querySelector(`[data-screen-btn="${i}"]`);
    if (!el) return;
    if (b.onClick) {
      el.addEventListener('click', b.onClick);
    }
    // Use SPA router for internal href buttons when available
    if (b.href && el.tagName === 'A') {
      el.addEventListener('click', (e) => {
        if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
          e.preventDefault();
          if (typeof smoothNavigate === 'function') {
            smoothNavigate(b.href);
          } else {
            window.location.href = b.href;
          }
        }
      });
    }
  });
}
