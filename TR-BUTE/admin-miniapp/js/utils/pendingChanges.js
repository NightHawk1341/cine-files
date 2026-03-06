/**
 * utils/pendingChanges.js
 * Manages pending changes for modals (orders, products, etc.)
 * Tracks modifications before saving to API
 */

export class PendingChangesManager {
  constructor(entityType, entityId) {
    this.entityType = entityType; // 'order', 'product', etc.
    this.entityId = entityId;
    this.changes = {
      items: {
        modified: new Map(), // itemId -> { field -> newValue }
        added: [],
        removed: new Set()
      },
      fields: new Map(), // fieldName -> newValue
      hasChanges: false
    };
    this.originalData = null;
    this.originalFieldMap = {}; // HTML field id -> original value (for delivery fields etc.)
  }

  /**
   * Initialize with original data
   */
  setOriginalData(data) {
    this.originalData = JSON.parse(JSON.stringify(data));
  }

  /**
   * Register the original value for a named HTML field (e.g. 'delivery-cost-123')
   * Used so updateField can detect when a field reverts to its original value
   */
  setFieldOriginal(fieldName, originalValue) {
    this.originalFieldMap[fieldName] = originalValue;
  }

  /**
   * Track item quantity change
   */
  updateItemQuantity(itemId, newQuantity) {
    // Find original quantity
    const originalItem = this.originalData?.items?.find(item => item.id === itemId);
    const originalQuantity = originalItem?.quantity;

    if (!this.changes.items.modified.has(itemId)) {
      this.changes.items.modified.set(itemId, {});
    }

    // If new value matches original, remove this field from changes
    if (originalQuantity !== undefined && newQuantity === originalQuantity) {
      const modifications = this.changes.items.modified.get(itemId);
      delete modifications.quantity;

      // If no more modifications for this item, remove it entirely
      if (Object.keys(modifications).length === 0) {
        this.changes.items.modified.delete(itemId);
      }
    } else {
      this.changes.items.modified.get(itemId).quantity = newQuantity;
    }

    this.updateHasChanges();
  }

  /**
   * Track item property change
   */
  updateItemProperty(itemId, newProperty) {
    // Find original property
    const originalItem = this.originalData?.items?.find(item => item.id === itemId);
    const originalProperty = originalItem?.property;

    if (!this.changes.items.modified.has(itemId)) {
      this.changes.items.modified.set(itemId, {});
    }

    // If new value matches original, remove this field from changes
    if (originalProperty !== undefined && newProperty === originalProperty) {
      const modifications = this.changes.items.modified.get(itemId);
      delete modifications.property;

      // If no more modifications for this item, remove it entirely
      if (Object.keys(modifications).length === 0) {
        this.changes.items.modified.delete(itemId);
      }
    } else {
      this.changes.items.modified.get(itemId).property = newProperty;
    }

    this.updateHasChanges();
  }

  /**
   * Track item price change
   */
  updateItemPrice(itemId, newPrice) {
    // Find original price
    const originalItem = this.originalData?.items?.find(item => item.id === itemId);
    const originalPrice = originalItem?.price_at_purchase;

    if (!this.changes.items.modified.has(itemId)) {
      this.changes.items.modified.set(itemId, {});
    }

    // If new value matches original, remove this field from changes
    if (originalPrice !== undefined && newPrice === originalPrice) {
      const modifications = this.changes.items.modified.get(itemId);
      delete modifications.price_at_purchase;

      // If no more modifications for this item, remove it entirely
      if (Object.keys(modifications).length === 0) {
        this.changes.items.modified.delete(itemId);
      }
    } else {
      this.changes.items.modified.get(itemId).price_at_purchase = newPrice;
    }

    this.updateHasChanges();
  }

  /**
   * Track item custom URL change
   */
  updateItemCustomUrl(itemId, newUrl) {
    // Find original custom URL
    const originalItem = this.originalData?.items?.find(item => item.id === itemId);
    const originalUrl = originalItem?.custom_url;

    if (!this.changes.items.modified.has(itemId)) {
      this.changes.items.modified.set(itemId, {});
    }

    // If new value matches original, remove this field from changes
    if (originalUrl !== undefined && newUrl === originalUrl) {
      const modifications = this.changes.items.modified.get(itemId);
      delete modifications.custom_url;

      // If no more modifications for this item, remove it entirely
      if (Object.keys(modifications).length === 0) {
        this.changes.items.modified.delete(itemId);
      }
    } else {
      this.changes.items.modified.get(itemId).custom_url = newUrl;
    }

    this.updateHasChanges();
  }

  /**
   * Get items array (helper for managing item data)
   */
  getItems() {
    return this.originalData?.items || [];
  }

  /**
   * Update hasChanges flag based on actual changes
   */
  updateHasChanges() {
    this.changes.hasChanges =
      this.changes.items.modified.size > 0 ||
      this.changes.items.added.length > 0 ||
      this.changes.items.removed.size > 0 ||
      this.changes.fields.size > 0;
  }

  /**
   * Track item addition
   */
  addItem(itemData) {
    this.changes.items.added.push(itemData);
    this.updateHasChanges();
  }

  /**
   * Track item removal
   */
  removeItem(itemId) {
    // Check if this is a temp item (just added, not yet saved)
    const isTempItem = String(itemId).startsWith('temp-');

    if (isTempItem) {
      // Remove from added array instead of marking for deletion
      const index = this.changes.items.added.findIndex(item => item.id === itemId);
      if (index !== -1) {
        this.changes.items.added.splice(index, 1);
      }
    } else {
      // Mark existing item for removal
      this.changes.items.removed.add(itemId);
    }

    this.updateHasChanges();
  }

  /**
   * Track field change (delivery info, etc.)
   */
  updateField(fieldName, newValue) {
    // Check HTML-keyed original first (e.g. 'delivery-cost-123' -> 0)
    if (fieldName in this.originalFieldMap) {
      const orig = this.originalFieldMap[fieldName];
      // Use loose string comparison to handle number/string mismatches (e.g. 0 vs '0')
      if (String(orig) === String(newValue)) {
        this.changes.fields.delete(fieldName);
        this.updateHasChanges();
        return;
      }
    } else if (this.originalData && fieldName in this.originalData) {
      // Fall back to DB-keyed original data
      if (this.originalData[fieldName] === newValue) {
        this.changes.fields.delete(fieldName);
        this.updateHasChanges();
        return;
      }
    }

    this.changes.fields.set(fieldName, newValue);
    this.updateHasChanges();
  }

  /**
   * Check if specific item has changes
   */
  isItemModified(itemId) {
    return this.changes.items.modified.has(itemId) ||
           this.changes.items.removed.has(itemId);
  }

  /**
   * Check if specific field has changes
   */
  isFieldModified(fieldName) {
    return this.changes.fields.has(fieldName);
  }

  /**
   * Get current value for item (with pending changes applied)
   */
  getItemValue(itemId, field, originalValue) {
    if (this.changes.items.removed.has(itemId)) {
      return null; // Item marked for deletion
    }

    if (this.changes.items.modified.has(itemId)) {
      const modifications = this.changes.items.modified.get(itemId);
      if (field in modifications) {
        return modifications[field];
      }
    }

    return originalValue;
  }

  /**
   * Get current value for field (with pending changes applied)
   */
  getFieldValue(fieldName, originalValue) {
    if (this.changes.fields.has(fieldName)) {
      return this.changes.fields.get(fieldName);
    }
    return originalValue;
  }

  /**
   * Get all pending changes (for API submission)
   */
  getAllChanges() {
    return {
      itemModifications: Array.from(this.changes.items.modified.entries()).map(([itemId, mods]) => ({
        itemId,
        ...mods
      })),
      itemAdditions: this.changes.items.added,
      itemRemovals: Array.from(this.changes.items.removed),
      fieldUpdates: Object.fromEntries(this.changes.fields)
    };
  }

  /**
   * Check if there are any pending changes
   */
  hasUnsavedChanges() {
    return this.changes.hasChanges;
  }

  /**
   * Clear all pending changes
   */
  reset() {
    this.changes = {
      items: {
        modified: new Map(),
        added: [],
        removed: new Set()
      },
      fields: new Map(),
      hasChanges: false
    };
  }

  /**
   * Get summary of changes (for display)
   */
  getChangesSummary() {
    const summary = [];

    const modifiedCount = this.changes.items.modified.size;
    if (modifiedCount > 0) {
      summary.push(`${modifiedCount} товар(ов) изменено`);
    }

    const addedCount = this.changes.items.added.length;
    if (addedCount > 0) {
      summary.push(`${addedCount} товар(ов) добавлено`);
    }

    const removedCount = this.changes.items.removed.size;
    if (removedCount > 0) {
      summary.push(`${removedCount} товар(ов) удалено`);
    }

    const fieldsCount = this.changes.fields.size;
    if (fieldsCount > 0) {
      summary.push(`${fieldsCount} полей изменено`);
    }

    return summary.length > 0 ? summary.join(', ') : 'Нет изменений';
  }
}

/**
 * Global registry of pending changes managers
 */
const managersRegistry = new Map();

/**
 * Get or create a pending changes manager
 */
export function getPendingChangesManager(entityType, entityId) {
  const key = `${entityType}-${entityId}`;
  if (!managersRegistry.has(key)) {
    managersRegistry.set(key, new PendingChangesManager(entityType, entityId));
  }
  return managersRegistry.get(key);
}

/**
 * Remove a pending changes manager
 */
export function removePendingChangesManager(entityType, entityId) {
  const key = `${entityType}-${entityId}`;
  managersRegistry.delete(key);
}

/**
 * Show warning if unsaved changes exist
 */
export async function warnUnsavedChanges(manager) {
  if (manager && manager.hasUnsavedChanges()) {
    // Import showConfirmModal dynamically to avoid circular dependency
    const { showConfirmModal } = await import('../utils.js');
    return await showConfirmModal(
      `У вас есть несохраненные изменения:\n${manager.getChangesSummary()}\n\nВы уверены, что хотите закрыть без сохранения?`,
      'Несохраненные изменения'
    );
  }
  return true;
}
