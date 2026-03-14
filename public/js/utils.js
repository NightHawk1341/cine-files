/**
 * Shared utilities for the CineFiles SPA.
 */

var Utils = (function () {
  /**
   * Format a date in Russian locale.
   * @param {string|Date} date
   * @returns {string}
   */
  function formatDate(date) {
    if (!date) return '';
    var d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);
  }

  /**
   * Format a short date (day + month).
   * @param {string|Date} date
   * @returns {string}
   */
  function formatDateShort(date) {
    if (!date) return '';
    var d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'short',
    }).format(d);
  }

  /**
   * Escape HTML to prevent XSS.
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Sanitize inline HTML — allow only basic formatting tags.
   * @param {string} html
   * @returns {string}
   */
  function sanitizeInlineHtml(html) {
    if (!html) return '';
    return html.replace(/<(?!\/?(?:b|i|em|strong|a|s|u|code|br)\b)[^>]*>/gi, '');
  }

  /**
   * Fetch JSON from API with error handling.
   * @param {string} url
   * @param {RequestInit} [options]
   * @returns {Promise<any>}
   */
  async function apiFetch(url, options) {
    var res = await fetch(url, options || {});
    if (!res.ok) {
      var err = new Error('API error: ' + res.status);
      err.status = res.status;
      try {
        err.data = await res.json();
      } catch (_) {}
      throw err;
    }
    return res.json();
  }

  /**
   * Debounce a function.
   * @param {Function} fn
   * @param {number} delay
   * @returns {Function}
   */
  function debounce(fn, delay) {
    var timer = null;
    return function () {
      var ctx = this;
      var args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(ctx, args);
      }, delay);
    };
  }

  /**
   * Pluralize Russian count words.
   * @param {number} count
   * @param {string[]} forms — [one, few, many], e.g. ['просмотр', 'просмотра', 'просмотров']
   * @returns {string}
   */
  function pluralize(count, forms) {
    var n = Math.abs(count) % 100;
    var n1 = n % 10;
    if (n > 10 && n < 20) return count + ' ' + forms[2];
    if (n1 > 1 && n1 < 5) return count + ' ' + forms[1];
    if (n1 === 1) return count + ' ' + forms[0];
    return count + ' ' + forms[2];
  }

  /**
   * Get URL query parameter.
   * @param {string} name
   * @returns {string|null}
   */
  function getQueryParam(name) {
    var params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  /**
   * Set innerHTML safely (basic XSS prevention already done via sanitizeInlineHtml).
   * @param {HTMLElement} el
   * @param {string} html
   */
  function setHtml(el, html) {
    el.innerHTML = html;
  }

  /**
   * Create an element with optional attributes and children.
   * @param {string} tag
   * @param {Record<string, string>} [attrs]
   * @param {(HTMLElement|string)[]} [children]
   * @returns {HTMLElement}
   */
  function createElement(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (key === 'className') {
          el.className = attrs[key];
        } else if (key === 'textContent') {
          el.textContent = attrs[key];
        } else if (key === 'innerHTML') {
          el.innerHTML = attrs[key];
        } else {
          el.setAttribute(key, attrs[key]);
        }
      });
    }
    if (children) {
      children.forEach(function (child) {
        if (typeof child === 'string') {
          el.appendChild(document.createTextNode(child));
        } else if (child) {
          el.appendChild(child);
        }
      });
    }
    return el;
  }

  return {
    formatDate: formatDate,
    formatDateShort: formatDateShort,
    escapeHtml: escapeHtml,
    sanitizeInlineHtml: sanitizeInlineHtml,
    apiFetch: apiFetch,
    debounce: debounce,
    pluralize: pluralize,
    getQueryParam: getQueryParam,
    setHtml: setHtml,
    createElement: createElement,
  };
})();
