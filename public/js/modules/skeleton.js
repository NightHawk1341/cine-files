/**
 * Skeleton loading placeholders.
 */

var Skeleton = (function () {
  /**
   * Create a skeleton element.
   * @param {number} [width]
   * @param {number} [height]
   * @param {string} [className]
   * @returns {HTMLElement}
   */
  function create(width, height, className) {
    var el = document.createElement('div');
    el.className = 'skeleton' + (className ? ' ' + className : '');
    if (width) el.style.width = width + 'px';
    if (height) el.style.height = height + 'px';
    return el;
  }

  /**
   * Create an article card skeleton.
   * @returns {HTMLElement}
   */
  function articleCard() {
    var card = document.createElement('div');
    card.className = 'article-card skeleton-card';
    card.innerHTML =
      '<div class="skeleton article-card-image-skeleton" style="aspect-ratio:16/9;border-radius:12px 12px 0 0"></div>' +
      '<div style="padding:15px">' +
      '<div class="skeleton" style="height:20px;width:80%;margin-bottom:8px"></div>' +
      '<div class="skeleton" style="height:14px;width:60%;margin-bottom:12px"></div>' +
      '<div class="skeleton" style="height:12px;width:40%"></div>' +
      '</div>';
    return card;
  }

  /**
   * Create a grid of skeleton cards.
   * @param {number} [count=6]
   * @returns {HTMLElement}
   */
  function grid(count) {
    count = count || 6;
    var container = document.createElement('div');
    container.className = 'article-grid';
    for (var i = 0; i < count; i++) {
      container.appendChild(articleCard());
    }
    return container;
  }

  return {
    create: create,
    articleCard: articleCard,
    grid: grid,
  };
})();
