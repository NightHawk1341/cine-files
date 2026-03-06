/**
 * Custom Sticker/Emoji Data for TR-BUTE
 * Uses image URLs (from VK CDN) instead of Unicode emojis
 * Admin can upload custom sticker images to VK CDN
 */

// Base URL for sticker images (will be VK CDN in production)
// For testing, using placeholder images
const STICKER_BASE_URL = 'https://sun9-80.userapi.com/impg';

// Sticker definitions with keywords and image URLs
// In production, admin uploads images to VK CDN and adds URLs here
export const stickerData = [
  // Example stickers - replace with actual VK CDN URLs uploaded by admin
  {
    id: 'heart',
    url: 'https://sun9-59.userapi.com/impg/c858520/v858520163/1e1b8e/BqLQFWxZkQM.jpg?size=128x128&quality=96&sign=1',
    keywords: ['люб', 'любов', 'обож', 'нрав', 'сердц', 'красив'],
    alt: 'Сердце'
  },
  {
    id: 'fire',
    url: 'https://sun9-59.userapi.com/impg/c858520/v858520163/1e1b8e/BqLQFWxZkQM.jpg?size=128x128&quality=96&sign=2',
    keywords: ['огонь', 'жар', 'горяч', 'пламя', 'крут', 'топ'],
    alt: 'Огонь'
  },
  {
    id: 'star',
    url: 'https://sun9-59.userapi.com/impg/c858520/v858520163/1e1b8e/BqLQFWxZkQM.jpg?size=128x128&quality=96&sign=3',
    keywords: ['звезд', 'рейтинг', 'оценк', 'лучш', 'супер'],
    alt: 'Звезда'
  },
  {
    id: 'thumbsup',
    url: 'https://sun9-59.userapi.com/impg/c858520/v858520163/1e1b8e/BqLQFWxZkQM.jpg?size=128x128&quality=96&sign=4',
    keywords: ['хорош', 'одобр', 'норм', 'годно', 'ок', 'круто', 'класс'],
    alt: 'Палец вверх'
  },
  {
    id: 'gift',
    url: 'https://sun9-59.userapi.com/impg/c858520/v858520163/1e1b8e/BqLQFWxZkQM.jpg?size=128x128&quality=96&sign=5',
    keywords: ['подарок', 'подар', 'сюрприз', 'презент'],
    alt: 'Подарок'
  },
  {
    id: 'package',
    url: 'https://sun9-59.userapi.com/impg/c858520/v858520163/1e1b8e/BqLQFWxZkQM.jpg?size=128x128&quality=96&sign=6',
    keywords: ['посылк', 'доставк', 'заказ', 'упаков', 'коробк'],
    alt: 'Посылка'
  },
  {
    id: 'art',
    url: 'https://sun9-59.userapi.com/impg/c858520/v858520163/1e1b8e/BqLQFWxZkQM.jpg?size=128x128&quality=96&sign=7',
    keywords: ['искусств', 'художник', 'картин', 'рисун', 'творч', 'креатив'],
    alt: 'Искусство'
  },
  {
    id: 'frame',
    url: 'https://sun9-59.userapi.com/impg/c858520/v858520163/1e1b8e/BqLQFWxZkQM.jpg?size=128x128&quality=96&sign=8',
    keywords: ['постер', 'картин', 'рамк', 'декор', 'интерьер'],
    alt: 'Рамка'
  }
];

// Frequently used stickers (shown in quick picker)
// These are sticker IDs that reference items in stickerData
export const frequentStickerIds = [
  'heart', 'fire', 'star', 'thumbsup', 'gift', 'package', 'art', 'frame'
];

// Category groupings for sticker picker
export const stickerCategories = {
  'Эмоции': ['heart', 'fire', 'star', 'thumbsup'],
  'Покупки': ['gift', 'package'],
  'Искусство': ['art', 'frame']
};

// Get sticker by ID
export function getStickerById(id) {
  return stickerData.find(s => s.id === id);
}

// Get frequent stickers
export function getFrequentStickers() {
  return frequentStickerIds.map(id => getStickerById(id)).filter(Boolean);
}

// Get stickers by category
export function getStickersByCategory(category) {
  const ids = stickerCategories[category] || [];
  return ids.map(id => getStickerById(id)).filter(Boolean);
}

/**
 * Find stickers matching the given word
 * @param {string} word - Word to match
 * @returns {Array} - Array of matching sticker objects
 */
export function findMatchingStickers(word) {
  if (!word || word.length < 2) return [];

  const lowerWord = word.toLowerCase();
  const matches = [];

  for (const sticker of stickerData) {
    for (const keyword of sticker.keywords) {
      if (lowerWord.includes(keyword) || keyword.includes(lowerWord)) {
        matches.push(sticker);
        break;
      }
    }
  }

  // Return unique stickers, limit to 5
  return matches.slice(0, 5);
}

/**
 * Get the current word being typed at cursor position
 * @param {string} text - Full text
 * @param {number} cursorPos - Cursor position
 * @returns {Object} - { word, startPos, endPos }
 */
export function getCurrentWord(text, cursorPos) {
  if (!text) return { word: '', startPos: 0, endPos: 0 };

  // Find word boundaries
  let startPos = cursorPos;
  let endPos = cursorPos;

  // Go backwards to find word start
  while (startPos > 0 && !/\s/.test(text[startPos - 1])) {
    startPos--;
  }

  // Go forwards to find word end
  while (endPos < text.length && !/\s/.test(text[endPos])) {
    endPos++;
  }

  return {
    word: text.substring(startPos, endPos),
    startPos,
    endPos
  };
}

// Legacy exports for backward compatibility
// These will be removed once all code is updated
export const emojiData = stickerData.map(s => ({ emoji: s.id, keywords: s.keywords }));
export const frequentEmojis = frequentStickerIds;
export const emojiCategories = stickerCategories;
export const findMatchingEmojis = (word) => findMatchingStickers(word).map(s => s.id);
