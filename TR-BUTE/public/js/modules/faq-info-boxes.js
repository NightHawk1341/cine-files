// ============================================================
// FAQ Info Boxes Module
// Reusable accordion FAQ items for embedding on any page.
// Fetches page-specific FAQ items from API and renders them
// as collapsible dropdowns, with a link to the full FAQ page.
// ============================================================

const FAQ_CACHE = {};

/**
 * Load and render FAQ info boxes into a container element.
 * @param {string} pageName - Page identifier (cart, picker, profile, order, checkout)
 * @param {HTMLElement} container - DOM element to render into
 */
export async function renderFaqInfoBoxes(pageName, container) {
  if (!container) return;

  // Show loading skeleton
  container.innerHTML = `
    <div class="faq-info-boxes">
      <div class="faq-info-boxes-header">Частые вопросы</div>
      <div class="faq-info-boxes-loading">
        <div class="faq-info-box skeleton" style="height: 48px;"></div>
        <div class="faq-info-box skeleton" style="height: 48px;"></div>
        <div class="faq-info-box skeleton" style="height: 48px;"></div>
      </div>
    </div>
  `;

  try {
    let items = FAQ_CACHE[pageName];

    if (!items) {
      const response = await fetch(`/api/faq/get-page-items?page=${pageName}`);
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      items = data.data?.items || data.items || [];
      FAQ_CACHE[pageName] = items;
    }

    if (items.length === 0) {
      container.innerHTML = '';
      return;
    }

    renderItems(items, container);
  } catch (err) {
    console.error('[FAQ Info Boxes] Error:', err);
    container.innerHTML = '';
  }
}

function renderItems(items, container) {
  const wrapper = document.createElement('div');
  wrapper.className = 'faq-info-boxes';

  const header = document.createElement('div');
  header.className = 'faq-info-boxes-header';
  header.textContent = 'Частые вопросы';
  wrapper.appendChild(header);

  const list = document.createElement('div');
  list.className = 'faq-info-boxes-list';

  items.forEach(item => {
    const box = document.createElement('div');
    box.className = 'faq-item';

    const boxHeader = document.createElement('div');
    boxHeader.className = 'faq-item-header';

    const question = document.createElement('div');
    question.className = 'faq-item-question';
    question.textContent = item.question;

    const toggle = document.createElement('div');
    toggle.className = 'faq-item-toggle';
    toggle.innerHTML = `<svg viewBox="0 0 64 64"><use href="#chevron-down"></use></svg>`;

    boxHeader.appendChild(question);
    boxHeader.appendChild(toggle);

    const content = document.createElement('div');
    content.className = 'faq-item-content';

    const inner = document.createElement('div');
    inner.className = 'faq-item-content-inner';

    const answer = document.createElement('p');
    answer.className = 'faq-item-answer';
    answer.textContent = item.answer;
    inner.appendChild(answer);

    if (item.image_url) {
      const imageDiv = document.createElement('div');
      imageDiv.className = 'faq-item-image';
      const img = document.createElement('img');
      img.src = item.image_url;
      img.alt = item.question;
      img.loading = 'lazy';
      imageDiv.appendChild(img);
      inner.appendChild(imageDiv);
    }

    content.appendChild(inner);

    boxHeader.addEventListener('click', () => {
      const isExpanding = !box.classList.contains('active');
      if (isExpanding) {
        const scrollHeight = content.scrollHeight;
        content.style.setProperty('--content-height', scrollHeight + 'px');
        box.classList.add('active');
      } else {
        const currentHeight = content.scrollHeight;
        content.style.setProperty('--content-height', currentHeight + 'px');
        content.offsetHeight; // force reflow
        box.classList.remove('active');
      }
    });

    box.appendChild(boxHeader);
    box.appendChild(content);
    list.appendChild(box);
  });

  wrapper.appendChild(list);

  // Link to full FAQ page
  const linkWrapper = document.createElement('div');
  linkWrapper.className = 'faq-info-boxes-footer';

  const link = document.createElement('a');
  link.href = '/faq';
  link.className = 'faq-info-boxes-link';
  link.textContent = 'Все вопросы и ответы';

  link.addEventListener('click', (e) => {
    if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      if (typeof window.smoothNavigate === 'function') {
        window.smoothNavigate('/faq');
      } else {
        window.location.href = '/faq';
      }
    }
  });

  linkWrapper.appendChild(link);
  wrapper.appendChild(linkWrapper);

  container.innerHTML = '';
  container.appendChild(wrapper);
}

/**
 * Clear the cache (call on cleanup/navigation)
 */
export function clearFaqInfoCache() {
  Object.keys(FAQ_CACHE).forEach(key => delete FAQ_CACHE[key]);
}
