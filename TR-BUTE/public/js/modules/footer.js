// ============================================================
// FOOTER MODULE
// Persistent element across all pages
// ============================================================

/**
 * Initialize and inject footer HTML into the page
 */
function initFooter() {
  // Check if footer already exists (e.g., from SPA navigation)
  const existingFooter = document.querySelector('footer.footer');
  if (existingFooter) {
    // Footer exists, just ensure event listeners are set up
    setupFooterFunctionality();
    return;
  }

  const isVK = new URLSearchParams(window.location.search).has('vk_app_id');

  const tributeSocialItems = isVK ? `
            <li>
              <a href="https://vk.com/buy_tribute" target="_blank" class="footer-social" title="VK">
                <svg width="17" height="17"><use href="#socials-vk"></use></svg>
              </a>
            </li>` : `
            <li>
              <a href="https://t.me/buy_tribute" target="_blank" class="footer-social" title="Telegram (TR/BUTE)">
                <svg width="17" height="17"><use href="#socials-telegram"></use></svg>
              </a>
            </li>
            <li>
              <a href="https://vk.com/buy_tribute" target="_blank" class="footer-social" title="VK">
                <svg width="17" height="17"><use href="#socials-vk"></use></svg>
              </a>
            </li>
            <li>
              <a href="https://x.com/buy_tribute" target="_blank" class="footer-social" title="X (Twitter)">
                <svg width="17" height="17"><use href="#socials-x"></use></svg>
              </a>
            </li>
            <li>
              <a href="https://ru.pinterest.com/buy_tribute/" target="_blank" class="footer-social" title="Pinterest">
                <svg width="17" height="17"><use href="#socials-pinterest"></use></svg>
              </a>
            </li>
            <li>
              <a href="https://www.tiktok.com/@buy_tribute" target="_blank" class="footer-social" title="TikTok">
                <svg width="17" height="17"><use href="#socials-tiktok"></use></svg>
              </a>
            </li>`;

  const cinefilesSocialItems = isVK ? `
            <li>
              <a href="https://vk.com/cinefiles_txt" target="_blank" class="footer-social" title="VK">
                <svg width="17" height="17"><use href="#socials-vk"></use></svg>
              </a>
            </li>` : `
            <li>
              <a href="https://t.me/cinefiles_txt" target="_blank" class="footer-social" title="Telegram (cine/files)">
                <svg width="17" height="17"><use href="#socials-telegram"></use></svg>
              </a>
            </li>
            <li>
              <a href="https://vk.com/cinefiles_txt" target="_blank" class="footer-social" title="VK">
                <svg width="17" height="17"><use href="#socials-vk"></use></svg>
              </a>
            </li>`;

  const footerHTML = `
  <footer class="footer">
    <div class="footer-content">
      <div class="footer-left">
        <div class="footer-left-group">
          <a href="/info" class="footer-left-link">О нас</a>
          <a href="/legal" class="footer-left-link">Правовая информация</a>
        </div>
      </div>

      <div class="footer-right">

        <div class="footer-right-group">

          <button class="footer-socials-button tribute-socials-button" title="TR/BUTE">
            <svg class="footer-logo-icon" width="20" height="20"><use href="#logo-compact"></use></svg>
          </button>

          <ul id="tribute-socials" class="footer-socials-list hidden">
            ${tributeSocialItems}
          </ul>
        </div>

        <div class="footer-right-group">

          <button class="footer-socials-button cinefiles-socials-button" title="cine/files">
            <svg class="footer-logo-icon" width="20" height="20"><use href="#logo-cinefiles"></use></svg>
          </button>

          <ul id="cinefiles-socials" class="footer-socials-list hidden">
            ${cinefilesSocialItems}
          </ul>
        </div>

      </div>
    </div>
  </footer>
  `;

  // Insert footer before the SVG symbols (which should be last in body)
  const svgElement = document.querySelector('svg[style*="display:none"]');
  if (svgElement) {
    svgElement.insertAdjacentHTML('beforebegin', footerHTML);
  } else {
    // Fallback: insert at end of body
    document.body.insertAdjacentHTML('beforeend', footerHTML);
  }

  // Add footer functionality
  setupFooterFunctionality();
}

/**
 * Setup footer button functionality
 */
function setupFooterFunctionality() {
  // Footer links - use smooth navigation for left-clicks
  const footerLinks = document.querySelectorAll('.footer-left-link');
  footerLinks.forEach(link => {
    // Check if listener already attached (prevent duplicates)
    if (link.dataset.listenerAttached) return;
    link.dataset.listenerAttached = 'true';

    link.addEventListener('click', (e) => {
      // Only prevent default for left-clicks without modifier keys
      if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        const href = link.getAttribute('href');
        if (typeof smoothNavigate === 'function') {
          smoothNavigate(href);
        } else {
          window.location.href = href;
        }
      }
    });
  });

  // Initialize footer right group collapse state
  updateFooterRightGroupState();

  // Social menu toggles - each button toggles its own list and closes others
  document.querySelectorAll('.footer-right-group button').forEach(btn => {
    if (btn.dataset.listenerAttached) return;
    btn.dataset.listenerAttached = 'true';

    btn.addEventListener('click', (e) => {
      const group = btn.closest('.footer-right-group');
      const list = group.querySelector('.footer-socials-list');

      // If group is collapsed, uncollapse it
      if (group.classList.contains('collapsed')) {
        group.classList.remove('collapsed');
        if (list) list.classList.remove('hidden');
      } else {
        // Close all other socials lists
        document.querySelectorAll('.footer-socials-list').forEach(ul => {
          if (ul !== list) ul.classList.add('hidden');
        });

        // Toggle this list
        if (list) list.classList.toggle('hidden');
      }
    });
  });

  // Click outside to close all socials lists
  if (!document._footerOutsideClickAttached) {
    document._footerOutsideClickAttached = true;
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.footer-right-group')) {
        document.querySelectorAll('.footer-socials-list').forEach(ul => ul.classList.add('hidden'));
      }
    });
  }
}

/**
 * Update footer right group collapse state based on screen size
 * Desktop (>1024px): expanded
 * Mobile (<=1024px): collapsed
 */
function updateFooterRightGroupState() {
  const groups = document.querySelectorAll('.footer-right-group');
  const isMobile = window.innerWidth <= 1024;

  groups.forEach(group => {
    if (isMobile) {
      group.classList.add('collapsed');
      const list = group.querySelector('.footer-socials-list');
      if (list) list.classList.add('hidden');
    } else {
      group.classList.remove('collapsed');
      const list = group.querySelector('.footer-socials-list');
      if (list) list.classList.remove('hidden');
    }
  });
}

// Handle window resize to update footer state
if (!document._footerResizeAttached) {
  document._footerResizeAttached = true;
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(updateFooterRightGroupState, 150);
  });
}

// Auto-initialize when script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFooter);
} else {
  initFooter();
}
