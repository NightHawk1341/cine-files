/**
 * FAQ Popup Module
 * Mobile: uses showMobileModal (shared modal infrastructure)
 * Desktop: carousel showing all FAQ cards with current page centered
 */

import {
  initStories,
  getStoriesCount,
  createStoriesPreviewCircle,
  openStoriesPopup,
} from './stories-popup.js';

import { showMobileModal } from './mobile-modal.js';
import { MOBILE_BREAKPOINT } from '../core/constants.js';

// Current page type for carousel focus
let currentPageType = 'catalog';
let currentProductId = null;

/**
 * FAQ content for different pages
 */
const FAQ_CONTENT = {
  main: {
    title: 'Как пользоваться сайтом',
    text: `
      <p><strong>Добро пожаловать в TR/BUTE!</strong></p>
      <p>На главной странице вы можете:</p>
      <ul style="margin: 10px 0; padding-left: 20px; line-height: 1.6;">
        <li><strong>Искать</strong> постеры по названию через поиск</li>
        <li><strong>Фильтровать</strong> по жанрам (игры, фильмы, сериалы, аниме) и типам (фирменные, оригинальные)</li>
        <li><strong>Сортировать</strong> по названию, новизне или дате выхода</li>
        <li><strong>Просматривать каталоги</strong> — коллекции постеров по тематикам</li>
        <li><strong>Использовать подборщик</strong> — смахивайте постеры влево/вправо, чтобы быстро найти то, что нравится</li>
        <li><strong>Добавлять в избранное</strong> понравившиеся постеры</li>
        <li><strong>Формировать корзину</strong> с выбором формата и рамки</li>
      </ul>
      <p>Войдите в аккаунт, чтобы синхронизировать избранное и корзину на всех устройствах. Подробнее о постерах, доставке и оплате в FAQ:</p>
    `
  },
  catalog: {
    title: 'Как пользоваться каталогом',
    text: `
      <p><strong>Добро пожаловать в каталог!</strong></p>
      <p>В каталоге вы можете:</p>
      <ul style="margin: 10px 0; padding-left: 20px; line-height: 1.6;">
        <li><strong>Просматривать все постеры</strong> в виде сетки</li>
        <li><strong>Фильтровать</strong> по жанрам (игры, фильмы, сериалы, аниме) и типам (фирменные, оригинальные)</li>
        <li><strong>Сортировать</strong> по названию, новизне или дате выхода</li>
        <li><strong>Искать</strong> постеры по названию через поиск</li>
        <li><strong>Добавлять в избранное</strong> понравившиеся постеры</li>
        <li><strong>Выбирать формат и рамку</strong> перед добавлением в корзину</li>
      </ul>
      <p>Кликните на постер, чтобы увидеть подробную информацию. Подробнее о постерах, доставке и оплате в FAQ:</p>
    `
  },
  product: {
    title: 'Как заказать постер',
    text: `
      <p><strong>Страница товара</strong></p>
      <p>Здесь вы можете:</p>
      <ul style="margin: 10px 0; padding-left: 20px; line-height: 1.6;">
        <li><strong>Просмотреть все изображения</strong> постера (обложка, варианты, приближение)</li>
        <li><strong>Выбрать формат</strong> (A3, A2, A1) и наличие рамки</li>
        <li><strong>Увидеть цену</strong> в зависимости от выбранного формата</li>
        <li><strong>Добавить в избранное</strong> для быстрого доступа</li>
        <li><strong>Добавить в корзину</strong> для оформления заказа</li>
      </ul>
      <p>После добавления в корзину перейдите в корзину для оформления заказа. Подробнее о доставке и оплате в FAQ:</p>
    `
  },
  cart: {
    title: 'Как оформить заказ',
    text: `
      <p><strong>Корзина</strong></p>
      <p>В корзине вы можете:</p>
      <ul style="margin: 10px 0; padding-left: 20px; line-height: 1.6;">
        <li><strong>Просмотреть выбранные товары</strong> с форматами и ценами</li>
        <li><strong>Изменить количество</strong> каждого товара</li>
        <li><strong>Удалить товары</strong> из корзины</li>
        <li><strong>Использовать сертификаты</strong> для оплаты</li>
        <li><strong>Оформить заказ</strong> с указанием адреса доставки</li>
      </ul>
      <p>После оформления заказа мы рассчитаем стоимость доставки и отправим вам уведомление с итоговой суммой и ссылкой на оплату. Подробнее в FAQ:</p>
    `
  },
  favorites: {
    title: 'Как пользоваться избранным',
    text: `
      <p><strong>Избранное</strong></p>
      <p>В избранном хранятся постеры, которые вам понравились:</p>
      <ul style="margin: 10px 0; padding-left: 20px; line-height: 1.6;">
        <li><strong>Быстрый доступ</strong> к понравившимся постерам</li>
        <li><strong>Синхронизация</strong> на всех устройствах при входе в аккаунт</li>
        <li><strong>Добавление в корзину</strong> прямо из избранного</li>
        <li><strong>Удаление</strong> ненужных постеров</li>
      </ul>
      <p>Войдите в аккаунт, чтобы избранное сохранялось на всех ваших устройствах. Подробнее в FAQ:</p>
    `
  },
  picker: {
    title: 'Как пользоваться подборщиком',
    text: `
      <p><strong>Подборщик постеров</strong></p>
      <p>Подборщик помогает быстро найти постеры, которые вам нравятся:</p>
      <ul style="margin: 10px 0; padding-left: 20px; line-height: 1.6;">
        <li><strong>Свайпайте вправо</strong> (или нажмите кнопку «Нравится»), чтобы добавить в избранное</li>
        <li><strong>Свайпайте влево</strong> (или нажмите кнопку «Пропустить»), чтобы пропустить</li>
        <li><strong>Кликните на постер</strong>, чтобы увеличить изображение</li>
        <li><strong>Используйте "Отменить"</strong>, чтобы вернуться к предыдущему постеру</li>
        <li><strong>Перемешайте</strong> постеры для нового порядка</li>
      </ul>
      <p>Прогресс сохраняется автоматически. Подробнее в FAQ:</p>
    `
  },
  profile: {
    title: 'Личный кабинет',
    text: `
      <p><strong>Профиль пользователя</strong></p>
      <p>В личном кабинете вы можете:</p>
      <ul style="margin: 10px 0; padding-left: 20px; line-height: 1.6;">
        <li><strong>Просмотреть свои заказы</strong> и их статусы</li>
        <li><strong>Отслеживать доставку</strong> по трек-номеру</li>
        <li><strong>Управлять сертификатами</strong> (приобретенные и использованные)</li>
        <li><strong>Просмотреть историю покупок</strong></li>
        <li><strong>Выйти из аккаунта</strong></li>
      </ul>
      <p>Войдите в аккаунт через Telegram, чтобы синхронизировать данные на всех устройствах. Подробнее в FAQ:</p>
    `
  },
  certificate: {
    title: 'Подарочные сертификаты',
    text: `
      <p><strong>Сертификаты TR/BUTE</strong></p>
      <p>На этой странице вы можете:</p>
      <ul style="margin: 10px 0; padding-left: 20px; line-height: 1.6;">
        <li><strong>Создать сертификат</strong> на любую сумму (от 10₽ до 50000₽)</li>
        <li><strong>Выбрать дизайн</strong> из доступных шаблонов</li>
        <li><strong>Указать имя получателя</strong></li>
        <li><strong>Использовать сертификат</strong> для оплаты заказа (введите код)</li>
        <li><strong>Выбрать доставку</strong> (изображение сертификата на email или физический в конверте)</li>
      </ul>
      <p>После оплаты заказа сертификат станет активным. Подробнее в FAQ:</p>
    `
  },
  customers: {
    title: 'Галерея покупателей',
    text: `
      <p><strong>Постеры наших покупателей</strong></p>
      <p>В галерее покупателей:</p>
      <ul style="margin: 10px 0; padding-left: 20px; line-height: 1.6;">
        <li><strong>Фотографии постеров</strong> от реальных покупателей</li>
        <li><strong>Примеры оформления</strong> в интерьере</li>
        <li><strong>Отзывы о качестве</strong> печати и доставки</li>
        <li><strong>Вдохновение</strong> для вашего выбора</li>
      </ul>
      <p>Хотите попасть в галерею? Отправьте фото вашего постера нам в Telegram после получения заказа! Подробнее в FAQ:</p>
    `
  },
  order: {
    title: 'Страница заказа',
    text: `
      <p><strong>Информация о заказе</strong></p>
      <p>На странице заказа вы можете:</p>
      <ul style="margin: 10px 0; padding-left: 20px; line-height: 1.6;">
        <li><strong>Просмотреть состав заказа</strong> и цены</li>
        <li><strong>Увидеть статус</strong> обработки заказа</li>
        <li><strong>Получить трек-номер</strong> для отслеживания доставки</li>
        <li><strong>Оплатить заказ</strong> по ссылке (после расчета доставки)</li>
        <li><strong>Связаться с поддержкой</strong> по вопросам заказа</li>
      </ul>
      <p>Мы уведомим вас обо всех изменениях статуса заказа. Подробнее в FAQ:</p>
    `
  },
  custom_product: {
    title: 'Как заказать постер на выбор',
    text: `
      <p><strong>Постер на ваш выбор</strong></p>
      <p>Здесь вы можете заказать постер по любому фильму, сериалу или игре — мы подберём и распечатаем изображение за вас:</p>
      <ul style="margin: 10px 0; padding-left: 20px; line-height: 1.6;">
        <li><strong>Загрузите изображение</strong> — вставьте ссылку на понравившийся постер</li>
        <li><strong>Или напишите название</strong> — укажите фильм, сериал или игру, и мы найдём лучший вариант</li>
        <li><strong>Выберите формат и рамку</strong>, добавьте в корзину</li>
        <li><strong>Каждый вариант</strong> — отдельная позиция в корзине, можно собрать несколько</li>
      </ul>
      <p><strong>После добавления в корзину</strong> мы уточним детали и согласуем финальное изображение перед печатью. Подробнее о доставке и оплате в FAQ:</p>
    `
  }
};

// All FAQ page types in carousel order
const FAQ_PAGE_ORDER = [
  'main', 'catalog', 'product', 'custom_product', 'cart', 'favorites',
  'picker', 'profile', 'certificate', 'customers', 'order'
];

const isDesktop = () => window.innerWidth > MOBILE_BREAKPOINT;

// ============================================================
// MOBILE: Uses shared showMobileModal infrastructure
// ============================================================

let mobileFAQIsOpen = false;

function getEffectivePageType() {
  if (currentPageType === 'product' && currentProductId === 1) return 'custom_product';
  return currentPageType;
}

function getCurrentFAQContent() {
  const effectiveType = getEffectivePageType();
  return FAQ_CONTENT[effectiveType] || FAQ_CONTENT.catalog;
}

function openMobileFAQ(content) {
  mobileFAQIsOpen = true;
  const contentHTML = `
    <div class="faq-textbox">${content.text}</div>
    <button type="button" class="faq-open-button" id="faq-mobile-faq-link">Открыть FAQ</button>
  `;

  const modalResult = showMobileModal({
    type: 'content',
    title: content.title,
    content: contentHTML
  });

  if (modalResult && typeof modalResult.then === 'function') {
    modalResult.then(() => { mobileFAQIsOpen = false; });
  }

  // Populate stories circle and FAQ link handler after render
  requestAnimationFrame(() => {
    const modal = document.querySelector('.mobile-modal-overlay .mobile-modal');
    if (!modal) return;

    // Add stories circle to header if stories exist (guard against duplicate rAF callbacks)
    const header = modal.querySelector('.mobile-modal-header');
    if (header && getStoriesCount() > 0 && !header.querySelector('.stories-preview-circle')) {
      const circle = createStoriesPreviewCircle({
        size: 32,
        onClick: () => {
          if (window.mobileModal) window.mobileModal.close();
          openStoriesPopup();
        }
      });
      if (circle) header.prepend(circle);
    }

    // FAQ button navigation handler
    const faqBtn = document.getElementById('faq-mobile-faq-link');
    if (faqBtn) {
      faqBtn.addEventListener('click', () => {
        if (window.mobileModal) window.mobileModal.close();
        if (typeof smoothNavigate === 'function') {
          smoothNavigate('/faq');
        } else {
          window.location.href = '/faq';
        }
      });
    }
  });
}

// ============================================================
// DESKTOP: FAQ Carousel (clone-based infinite loop)
// ============================================================

const CARD_WIDTH = 440;
const CARD_GAP = 24;
const CARD_STEP = CARD_WIDTH + CARD_GAP;
const CLONE_COUNT = 3;
const TOTAL_CARDS = FAQ_PAGE_ORDER.length;

let carouselOverlay = null;
let carouselTrackIndex = 0; // index into the full track (includes clones)
let carouselEscHandler = null;
let carouselKeyNavHandler = null;
let wrapTimeout = null;
let isNavigating = false;

function getRealIndex(trackIndex) {
  return ((trackIndex - CLONE_COUNT) % TOTAL_CARDS + TOTAL_CARDS) % TOTAL_CARDS;
}

function buildCard(realIndex, isClone) {
  const content = FAQ_CONTENT[FAQ_PAGE_ORDER[realIndex]];
  const card = document.createElement('div');
  card.className = 'faq-carousel-card';
  if (isClone) card.classList.add('faq-clone');
  card.dataset.realIndex = realIndex;

  card.innerHTML = `
    <div class="faq-carousel-card-header">
      <div class="faq-carousel-card-title">${content.title}</div>
    </div>
    <div class="faq-textbox">${content.text}</div>
  `;

  card.addEventListener('click', (e) => {
    const activeReal = getRealIndex(carouselTrackIndex);
    if (parseInt(card.dataset.realIndex) !== activeReal) {
      e.stopPropagation();
      navigateToReal(parseInt(card.dataset.realIndex));
    }
  });

  return card;
}

function openCarousel(focusPageType) {
  if (carouselOverlay) {
    carouselOverlay.remove();
    carouselOverlay = null;
  }

  const focusReal = Math.max(0, FAQ_PAGE_ORDER.indexOf(focusPageType));
  carouselTrackIndex = focusReal + CLONE_COUNT;
  isNavigating = false;

  carouselOverlay = document.createElement('div');
  carouselOverlay.className = 'faq-carousel-overlay';

  // Backdrop (visual layer behind scene)
  const backdrop = document.createElement('div');
  backdrop.className = 'faq-carousel-backdrop';
  carouselOverlay.appendChild(backdrop);

  // Close when clicking the overlay background (not on cards, arrows, or stories)
  carouselOverlay.addEventListener('click', (e) => {
    if (!e.target.closest('.faq-carousel-card') &&
        !e.target.closest('.faq-carousel-arrow') &&
        !e.target.closest('.faq-carousel-stories-outer')) {
      closeCarousel();
    }
  });

  // Stories button — in flex flow above scene, always visible
  const storiesOuter = document.createElement('div');
  storiesOuter.className = 'faq-carousel-stories-outer';
  carouselOverlay.appendChild(storiesOuter);
  addStoriesToCarouselOverlay(storiesOuter);

  // Scene: full-width container for the card row + arrows
  const scene = document.createElement('div');
  scene.className = 'faq-carousel-scene';
  carouselOverlay.appendChild(scene);

  // Track
  const track = document.createElement('div');
  track.className = 'faq-carousel-track';
  scene.appendChild(track);

  // Clones before (last CLONE_COUNT real cards)
  for (let i = TOTAL_CARDS - CLONE_COUNT; i < TOTAL_CARDS; i++) {
    track.appendChild(buildCard(i, true));
  }
  // Real cards
  for (let i = 0; i < TOTAL_CARDS; i++) {
    track.appendChild(buildCard(i, false));
  }
  // Clones after (first CLONE_COUNT real cards)
  for (let i = 0; i < CLONE_COUNT; i++) {
    track.appendChild(buildCard(i, true));
  }

  // Arrow buttons inside scene
  const prevBtn = document.createElement('button');
  prevBtn.className = 'faq-carousel-arrow prev';
  prevBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>';
  prevBtn.addEventListener('click', (e) => { e.stopPropagation(); navigateCarousel(-1); });
  scene.appendChild(prevBtn);

  const nextBtn = document.createElement('button');
  nextBtn.className = 'faq-carousel-arrow next';
  nextBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>';
  nextBtn.addEventListener('click', (e) => { e.stopPropagation(); navigateCarousel(1); });
  scene.appendChild(nextBtn);

  // FAQ button below carousel
  const faqBtnBelow = document.createElement('a');
  faqBtnBelow.href = '/faq';
  faqBtnBelow.className = 'faq-open-button';
  faqBtnBelow.style.textDecoration = 'none';
  faqBtnBelow.style.color = 'inherit';
  faqBtnBelow.style.display = 'block';
  faqBtnBelow.style.textAlign = 'center';
  faqBtnBelow.textContent = 'Открыть FAQ';
  faqBtnBelow.addEventListener('click', (e) => {
    if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      closeCarousel();
      if (typeof smoothNavigate === 'function') {
        smoothNavigate('/faq');
      } else {
        window.location.href = '/faq';
      }
    }
  });
  carouselOverlay.appendChild(faqBtnBelow);

  // Keyboard handlers
  carouselEscHandler = (e) => { if (e.key === 'Escape') closeCarousel(); };
  carouselKeyNavHandler = (e) => {
    if (e.key === 'ArrowLeft') navigateCarousel(-1);
    if (e.key === 'ArrowRight') navigateCarousel(1);
  };
  document.addEventListener('keydown', carouselEscHandler);
  document.addEventListener('keydown', carouselKeyNavHandler);

  document.body.appendChild(carouselOverlay);
  document.body.style.overflow = 'hidden';
  document.body.classList.add('modal-backdrop-active');

  if (typeof window.addBackdropGrain === 'function') {
    window.addBackdropGrain(carouselOverlay);
  }

  // Measure equal heights, then show
  setTimeout(() => {
    const allCards = Array.from(track.querySelectorAll('.faq-carousel-card'));
    // Temporarily expand for measurement
    allCards.forEach(c => {
      c.style.height = 'auto';
      c.style.maxHeight = 'none';
      c.style.overflow = 'visible';
    });

    const maxH = Math.min(
      Math.max(...allCards.map(c => c.offsetHeight)),
      Math.floor(window.innerHeight * 0.68)
    );

    allCards.forEach(c => {
      c.style.height = `${maxH}px`;
      c.style.maxHeight = '';
      c.style.overflow = '';
    });

    scene.style.height = `${maxH + 80}px`;

    updateCarouselPosition(true);

    requestAnimationFrame(() => {
      carouselOverlay.classList.add('active');
    });
  }, 0);
}

function navigateCarousel(direction) {
  if (isNavigating) return;
  isNavigating = true;

  carouselTrackIndex += direction;
  updateCarouselPosition();

  clearTimeout(wrapTimeout);
  wrapTimeout = setTimeout(() => {
    // After transition completes, silently jump if in clone zone
    if (carouselTrackIndex < CLONE_COUNT) {
      carouselTrackIndex += TOTAL_CARDS;
      updateCarouselPosition(true);
    } else if (carouselTrackIndex >= CLONE_COUNT + TOTAL_CARDS) {
      carouselTrackIndex -= TOTAL_CARDS;
      updateCarouselPosition(true);
    }
    isNavigating = false;
  }, 420);
}

function navigateToReal(targetReal) {
  if (isNavigating) return;
  const currentReal = getRealIndex(carouselTrackIndex);
  if (targetReal === currentReal) return;

  // Find shortest path
  let diff = targetReal - currentReal;
  if (diff > TOTAL_CARDS / 2) diff -= TOTAL_CARDS;
  if (diff < -TOTAL_CARDS / 2) diff += TOTAL_CARDS;

  isNavigating = true;
  carouselTrackIndex += diff;
  updateCarouselPosition();

  clearTimeout(wrapTimeout);
  wrapTimeout = setTimeout(() => {
    if (carouselTrackIndex < CLONE_COUNT) {
      carouselTrackIndex += TOTAL_CARDS;
      updateCarouselPosition(true);
    } else if (carouselTrackIndex >= CLONE_COUNT + TOTAL_CARDS) {
      carouselTrackIndex -= TOTAL_CARDS;
      updateCarouselPosition(true);
    }
    isNavigating = false;
  }, 420);
}

function updateCarouselPosition(noTransition = false) {
  if (!carouselOverlay) return;

  const track = carouselOverlay.querySelector('.faq-carousel-track');
  // Track starts at left:0 in scene. Center active card at viewport center.
  const offset = window.innerWidth / 2 - carouselTrackIndex * CARD_STEP - CARD_WIDTH / 2;

  if (noTransition) {
    track.style.transition = 'none';
    track.style.transform = `translateY(-50%) translateX(${offset}px)`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (track) track.style.transition = '';
    }));
  } else {
    track.style.transform = `translateY(-50%) translateX(${offset}px)`;
  }

  // Update active class on all cards by real index
  const activeReal = getRealIndex(carouselTrackIndex);
  track.querySelectorAll('.faq-carousel-card').forEach(card => {
    const isActive = parseInt(card.dataset.realIndex) === activeReal;
    card.classList.toggle('active', isActive);
    if (!isActive) card.scrollTop = 0;
  });
}

function addStoriesToCarouselOverlay(container) {
  if (!container) return;
  container.innerHTML = '';

  if (getStoriesCount() > 0) {
    const btn = document.createElement('button');
    btn.className = 'faq-carousel-stories-btn';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeCarousel();
      openStoriesPopup();
    });

    const circle = createStoriesPreviewCircle({
      size: 40,
      onClick: () => {
        closeCarousel();
        openStoriesPopup();
      }
    });
    if (circle) btn.appendChild(circle);

    const label = document.createElement('span');
    label.className = 'faq-carousel-stories-label';
    label.textContent = 'Что нового';
    btn.appendChild(label);

    container.appendChild(btn);
  }
}

function closeCarousel() {
  if (!carouselOverlay) return;

  clearTimeout(wrapTimeout);
  isNavigating = false;

  if (typeof window.removeBackdropGrain === 'function') {
    window.removeBackdropGrain(carouselOverlay);
  }

  if (carouselEscHandler) {
    document.removeEventListener('keydown', carouselEscHandler);
    carouselEscHandler = null;
  }
  if (carouselKeyNavHandler) {
    document.removeEventListener('keydown', carouselKeyNavHandler);
    carouselKeyNavHandler = null;
  }

  carouselOverlay.classList.remove('active');
  document.body.style.overflow = '';
  document.body.classList.remove('modal-backdrop-active');

  setTimeout(() => {
    if (carouselOverlay) {
      carouselOverlay.remove();
      carouselOverlay = null;
    }
  }, 300);
}

// ============================================================
// RESIZE HANDLER: Switch between carousel and mobile modal
// ============================================================

let _faqLastWasDesktop = isDesktop();
let _faqResizeTimer = null;

window.addEventListener('resize', () => {
  clearTimeout(_faqResizeTimer);
  _faqResizeTimer = setTimeout(() => {
    const nowDesktop = isDesktop();
    if (nowDesktop === _faqLastWasDesktop) return;
    _faqLastWasDesktop = nowDesktop;

    if (!nowDesktop && carouselOverlay) {
      closeCarousel();
      setTimeout(() => openMobileFAQ(getCurrentFAQContent()), 320);
    } else if (nowDesktop && mobileFAQIsOpen) {
      if (window.mobileModal) window.mobileModal.close();
      setTimeout(() => openCarousel(currentPageType), 150);
    }
  }, 150);
});

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Initialize FAQ popup (called once per page, persists across SPA navigation)
 */
export async function initFAQPopup(pageType = 'catalog', productId = null) {
  currentPageType = pageType;
  currentProductId = productId;
  await initStories();
}

/**
 * Open FAQ popup - mobile (showMobileModal) or desktop carousel
 */
export function openFAQPopup() {
  if (isDesktop()) {
    openCarousel(getEffectivePageType());
  } else {
    openMobileFAQ(getCurrentFAQContent());
  }
}

/**
 * Close FAQ popup (mobile) or carousel (desktop)
 */
export function closeFAQPopup() {
  if (carouselOverlay) {
    closeCarousel();
    return;
  }

  // Close mobile modal if open
  if (window.mobileModal) {
    window.mobileModal.close();
  }
}

/**
 * Add FAQ button to page header/title
 */
export function addFAQButton(titleSelector) {
  const titleElement = document.querySelector(titleSelector);
  if (!titleElement) return;

  if (titleElement.querySelector('.page-faq-button')) return;

  const faqButton = document.createElement('button');
  faqButton.className = 'page-faq-button';
  faqButton.dataset.tooltip = 'Как пользоваться этой страницей';
  faqButton.innerHTML = '?';

  faqButton.addEventListener('click', (e) => {
    e.preventDefault();
    openFAQPopup();
  });

  titleElement.appendChild(faqButton);
}
