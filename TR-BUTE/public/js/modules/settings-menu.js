// ============================================================
// SETTINGS MENU MODULE
// Side panel (desktop) / mobile modal for site settings
// ============================================================

const SETTINGS_MOBILE_BREAKPOINT = 1024;
let settingsPanelElement = null;
let settingsBackdropElement = null;
let settingsIsOpen = false;

/**
 * Build the sun/moon SVG icon for theme toggle
 */
function buildThemeIconSVG(idSuffix) {
  return `
    <svg class="sun-and-moon" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24">
      <mask id="moon-mask-${idSuffix}">
        <rect x="0" y="0" width="100%" height="100%" style="fill: white" />
        <circle class="moon-cutout" cx="0" cy="12" r="6" style="fill: black" />
      </mask>
      <circle class="sun-core" cx="12" cy="12" r="6" mask="url(#moon-mask-${idSuffix})" fill="currentColor" />
      <g class="sun-rays" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </g>
    </svg>
  `;
}

/**
 * Build the settings panel content HTML
 */
function buildSettingsHTML(idSuffix) {
  const currentTheme = window.ThemeManager ? window.ThemeManager.get() : 'dark';
  const isLight = currentTheme === 'light';
  return `
    <div class="settings-menu-section">
      <div class="settings-menu-item">
        <div class="settings-menu-item-info">
          ${buildThemeIconSVG(idSuffix)}
          <span>Светлая тема</span>
        </div>
        <button class="toggle-button settings-theme-toggle" data-state="${isLight}">
          <span class="toggle-knob"></span>
        </button>
      </div>
    </div>
  `;
}

/**
 * Attach theme toggle handler to a container
 */
function attachThemeToggle(container) {
  const toggleBtn = container.querySelector('.settings-theme-toggle');
  if (!toggleBtn) return;

  const themeIcon = container.querySelector('.sun-and-moon');
  const currentTheme = window.ThemeManager ? window.ThemeManager.get() : 'dark';
  if (themeIcon) themeIcon.classList.toggle('dark-mode', currentTheme === 'dark');

  toggleBtn.addEventListener('click', () => {
    const newTheme = window.toggleTheme ? window.toggleTheme() : 'dark';
    toggleBtn.setAttribute('data-state', newTheme === 'light' ? 'true' : 'false');
  });

  // Listen for external theme changes
  const themeHandler = (e) => {
    toggleBtn.setAttribute('data-state', e.detail.theme === 'light' ? 'true' : 'false');
    if (themeIcon) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        themeIcon.classList.toggle('dark-mode', e.detail.theme === 'dark');
      }));
    }
  };
  window.addEventListener('themechange', themeHandler);

  // Store handler for cleanup
  container._themeHandler = themeHandler;
}

/**
 * Create the desktop side panel (injected once)
 */
function createSettingsPanel() {
  if (settingsPanelElement) return;

  settingsBackdropElement = document.createElement('div');
  settingsBackdropElement.className = 'settings-menu-backdrop';
  settingsBackdropElement.addEventListener('click', closeSettingsPanel);

  settingsPanelElement = document.createElement('div');
  settingsPanelElement.className = 'settings-menu-panel';
  settingsPanelElement.innerHTML = `
    <div class="settings-menu-header">
      <span class="settings-menu-title">Настройки</span>
    </div>
    <div class="settings-menu-content">${buildSettingsHTML('panel')}</div>
  `;

  document.body.appendChild(settingsBackdropElement);
  document.body.appendChild(settingsPanelElement);

  attachThemeToggle(settingsPanelElement);
}

/**
 * Open the desktop side panel
 */
function openSettingsPanel() {
  createSettingsPanel();

  // Refresh toggle state in case theme changed while panel was closed
  const toggleBtn = settingsPanelElement.querySelector('.settings-theme-toggle');
  if (toggleBtn) {
    const currentTheme = window.ThemeManager ? window.ThemeManager.get() : 'dark';
    toggleBtn.setAttribute('data-state', currentTheme === 'light' ? 'true' : 'false');
    const themeIcon = settingsPanelElement.querySelector('.sun-and-moon');
    if (themeIcon) themeIcon.classList.toggle('dark-mode', currentTheme === 'dark');
  }

  requestAnimationFrame(() => {
    settingsBackdropElement.classList.add('active');
    settingsPanelElement.classList.add('active');
    if (typeof window.addBackdropGrain === 'function') {
      window.addBackdropGrain(settingsBackdropElement);
    }
  });

  settingsIsOpen = true;
  updateGearActive(true);
  document.addEventListener('keydown', handleSettingsEsc);
}

/**
 * Close the desktop side panel
 */
function closeSettingsPanel() {
  if (!settingsPanelElement) return;

  if (typeof window.removeBackdropGrain === 'function') {
    window.removeBackdropGrain(settingsBackdropElement);
  }

  settingsBackdropElement.classList.remove('active');
  settingsPanelElement.classList.remove('active');
  settingsIsOpen = false;
  updateGearActive(false);
  document.removeEventListener('keydown', handleSettingsEsc);
}

function handleSettingsEsc(e) {
  if (e.key === 'Escape') closeSettingsPanel();
}

/**
 * Open via mobile modal
 */
function openSettingsMobileModal() {
  const content = buildSettingsHTML('modal');

  updateGearActive(true);

  window.showMobileModal({
    type: 'content',
    title: 'Настройки',
    content: content,
    onClose: () => {
      updateGearActive(false);
    }
  });

  // Attach theme toggle after modal renders
  setTimeout(() => {
    const overlay = document.querySelector('.mobile-modal-overlay');
    if (overlay) attachThemeToggle(overlay);
  }, 50);
}

/**
 * Update gear button active state
 */
function updateGearActive(active) {
  const btn = document.getElementById('header-gear-btn');
  if (btn) btn.classList.toggle('active', active);
}

/**
 * Toggle the settings menu
 */
function toggleSettingsMenu() {
  if (window.innerWidth <= SETTINGS_MOBILE_BREAKPOINT) {
    openSettingsMobileModal();
  } else {
    if (settingsIsOpen) {
      closeSettingsPanel();
    } else {
      openSettingsPanel();
    }
  }
}

// Expose globally
window.toggleSettingsMenu = toggleSettingsMenu;
window.closeSettingsMenu = closeSettingsPanel;
