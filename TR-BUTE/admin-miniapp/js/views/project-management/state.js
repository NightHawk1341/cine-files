/**
 * Shared state and helpers for project-management sub-modules
 */

import { showModal, hideModal } from '../../utils.js';

// Giveaway state
export let giveawaysData = null;
export let giveawaysLoaded = false;
export let showGiveawayForm = false;
export function setGiveawaysData(val) { giveawaysData = val; }
export function setGiveawaysLoaded(val) { giveawaysLoaded = val; }
export function setShowGiveawayForm(val) { showGiveawayForm = val; }

// Channel post state
export let channelSectionExpanded = false;
export let channelShopButtonEnabled = true;
export let channelButtonCounter = 0;

export function setChannelSectionExpanded(val) { channelSectionExpanded = val; }
export function setChannelShopButtonEnabled(val) { channelShopButtonEnabled = val; }
export function setChannelButtonCounter(val) { channelButtonCounter = val; }

// Subtab state
export let currentSubtab = 'orders';
export function setCurrentSubtab(val) { currentSubtab = val; }

// Bot greetings state
export let botGreetingsData = null;
export let botGreetingsLoaded = false;
export function setBotGreetingsData(val) { botGreetingsData = val; }
export function setBotGreetingsLoaded(val) { botGreetingsLoaded = val; }

// VK product description community selection (1 = TR/BUTE, 2 = Cinema Critique)
export let vkProductDescCommunity = 1;
export function setVkProductDescCommunity(val) { vkProductDescCommunity = val; }

// Stories state
export let storiesData = [];
export let storiesLoaded = false;
export let editingStoryId = null;
export let storiesSortable = null;
export function setStoriesData(val) { storiesData = val; }
export function setStoriesLoaded(val) { storiesLoaded = val; }
export function setEditingStoryId(val) { editingStoryId = val; }
export function setStoriesSortable(val) { storiesSortable = val; }

// Estimates state
export let estimatesData = [];
export let estimatesStats = null;
export let estimatesCityAverages = [];
export let estimatesPagination = { page: 1, limit: 50, total: 0, totalPages: 0 };
export let estimatesLoaded = false;
export let estimatesProviderFilter = '';
export let estimatesSearchQuery = '';
export let estimatesSearchTimeout = null;
export function setEstimatesData(val) { estimatesData = val; }
export function setEstimatesStats(val) { estimatesStats = val; }
export function setEstimatesCityAverages(val) { estimatesCityAverages = val; }
export function setEstimatesPagination(val) { estimatesPagination = val; }
export function setEstimatesLoaded(val) { estimatesLoaded = val; }
export function setEstimatesProviderFilter(val) { estimatesProviderFilter = val; }
export function setEstimatesSearchQuery(val) { estimatesSearchQuery = val; }
export function setEstimatesSearchTimeout(val) { estimatesSearchTimeout = val; }

// Notification templates state
export let notificationTemplatesData = null;
export let notificationTemplatesLoaded = false;
export let notifActiveChannel = 'telegram';
export function setNotificationTemplatesData(val) { notificationTemplatesData = val; }
export function setNotificationTemplatesLoaded(val) { notificationTemplatesLoaded = val; }
export function setNotifActiveChannel(val) { notifActiveChannel = val; }

// Local state for settings
export let settings = {
  emergency_mode: {
    enabled: false,
    hide_images: true,
    replace_titles: true,
    activated_at: null
  },
  order_submission: {
    enabled: true,
    disabled_message: 'Оформление заказов временно недоступно'
  },
  delivery_methods: {
    pochta: { enabled: true, name: 'Почта России', manual_mode: false },
    courier_ems: { enabled: true, name: 'Курьер EMS' },
    cdek: { enabled: true, name: 'СДЭК' },
    international: { enabled: true, name: 'Международная доставка' }
  },
  delivery_rounding: {
    small_order_threshold: 1500,
    small_order_step: 50,
    big_order_step: 50,
    high_ratio_threshold: 0.5,
    high_ratio_step: 100,
    very_high_ratio_threshold: 0.7,
    very_high_ratio_step: 200
  },
  next_shipment_date: null
};

// Packaging configuration state
export let packagingConfig = {
  packaging: [],
  weights: [],
  capacityLimits: {
    tube_a3: { a3: 5, a2: 0, a1: 0 },
    tube_a2: { a3: 5, a2: 5, a1: 0 },
    tube_a1: { a3: 5, a2: 5, a1: 5 },
    half_carton: { a3Framed: 2, a2Framed: 0, a3Frameless: 3 },
    full_carton: { a3Framed: 5, a2Framed: 5, a3Frameless: 5 }
  }
};
export let packagingLoaded = false;
export let packagingSectionExpanded = false;
export function setPackagingLoaded(val) { packagingLoaded = val; }
export function setPackagingSectionExpanded(val) { packagingSectionExpanded = val; }

// Editor permissions state
export let editorPermissionsState = null;
export let editorPermissionsLoaded = false;
export function setEditorPermissionsState(val) { editorPermissionsState = val; }
export function setEditorPermissionsLoaded(val) { editorPermissionsLoaded = val; }

// Custom emoji settings state
export let emojiSettingsData = null;
export let emojiSettingsLoaded = false;
export function setEmojiSettingsData(val) { emojiSettingsData = val; }
export function setEmojiSettingsLoaded(val) { emojiSettingsLoaded = val; }

// Moderation state
export let moderationWords = [];
export let moderationConfig = null;
export let moderationLoaded = false;
export let moderationSearchQuery = '';
export function setModerationWords(val) { moderationWords = val; }
export function setModerationConfig(val) { moderationConfig = val; }
export function setModerationLoaded(val) { moderationLoaded = val; }
export function setModerationSearchQuery(val) { moderationSearchQuery = val; }

// FAQ Management state
export let faqCategories = [];
export let faqCategoryItems = {};
export let expandedCategories = new Set();
export let editingCategoryId = null;
export let editingItemId = null;
export let faqCategorySortable = null;
export let faqItemSortables = {};
export let faqSectionExpanded = false;
export let faqLoaded = false;
export function setFaqCategories(val) { faqCategories = val; }
export function setFaqCategoryItems(val) { faqCategoryItems = val; }
export function setExpandedCategories(val) { expandedCategories = val; }
export function setEditingCategoryId(val) { editingCategoryId = val; }
export function setEditingItemId(val) { editingItemId = val; }
export function setFaqCategorySortable(val) { faqCategorySortable = val; }
export function setFaqItemSortables(val) { faqItemSortables = val; }
export function setFaqSectionExpanded(val) { faqSectionExpanded = val; }
export function setFaqLoaded(val) { faqLoaded = val; }

// Helper function for Russian date formatting
export function formatDateRussian(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

export function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function escapeAttr(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function showConfirmDialog(title, message, confirmText = 'Подтвердить', isDanger = false) {
  return new Promise((resolve) => {
    showModal(title, `
      <p style="margin-bottom: var(--spacing-lg); color: var(--text-secondary);">${message}</p>
    `, [
      {
        text: 'Отмена',
        className: 'btn btn-secondary',
        onClick: () => {
          hideModal();
          resolve(false);
        }
      },
      {
        text: confirmText,
        className: isDanger ? 'btn btn-danger' : 'btn btn-primary',
        onClick: () => {
          hideModal();
          resolve(true);
        }
      }
    ]);
  });
}

export async function updateSetting(key, value) {
  // Lazy import to avoid circular deps
  const { apiPost } = await import('../../utils/apiClient.js');
  const { showToast } = await import('../../utils.js');
  try {
    const response = await apiPost('/api/settings/update', { key, value });

    if (!response.ok) {
      throw new Error('Failed to update setting');
    }

    return true;
  } catch (error) {
    console.error('Error updating setting:', error);
    showToast('Ошибка сохранения настройки', 'error');
    return false;
  }
}
