/**
 * utils/modalManager.js
 * Global modal manager for tracking unsaved changes across different modal types
 */

/**
 * Global registry of modal state
 */
let currentModalState = {
  type: null, // 'order', 'product', null
  entityId: null,
  hasUnsavedChanges: false,
  getPendingChangesManager: null // Function to get the pending changes manager
};

/**
 * Set current modal state
 */
export function setModalState(type, entityId, getPendingChangesManagerFn) {
  currentModalState = {
    type,
    entityId,
    hasUnsavedChanges: false,
    getPendingChangesManager: getPendingChangesManagerFn
  };
}

/**
 * Clear modal state
 */
export function clearModalState() {
  currentModalState = {
    type: null,
    entityId: null,
    hasUnsavedChanges: false,
    getPendingChangesManager: null
  };
}

/**
 * Mark modal as having unsaved changes
 */
export function markModalAsModified() {
  currentModalState.hasUnsavedChanges = true;
}

/**
 * Check if current modal has unsaved changes
 */
export function hasUnsavedChanges() {
  if (!currentModalState.type) return false;

  // For modals using PendingChangesManager
  if (currentModalState.getPendingChangesManager) {
    const manager = currentModalState.getPendingChangesManager();
    if (manager && manager.hasUnsavedChanges) {
      return manager.hasUnsavedChanges();
    }
  }

  // Fallback to simple flag
  return currentModalState.hasUnsavedChanges;
}

/**
 * Show discard confirmation dialog
 * Returns true if user wants to discard, false if they want to return
 */
export async function confirmDiscard() {
  const { showModal } = await import('../utils.js');

  return new Promise((resolve) => {
    showModal('Несохраненные изменения', `
      <div style="padding: var(--spacing-md) 0;">
        <p>У вас есть несохраненные изменения. Вы уверены, что хотите выйти без сохранения?</p>
      </div>
    `, [
      {
        text: 'Вернуться',
        className: 'btn btn-secondary',
        onClick: () => {
          // Pop the discard modal from stack and return to editing modal
          // Since confirmDiscard is shown via showModal, it's in the modal stack
          // We need to manually remove it from stack and restore previous modal
          import('../utils.js').then(({ hideModalWithoutConfirm }) => hideModalWithoutConfirm());
          resolve(false);
        }
      },
      {
        text: 'Выйти без сохранения',
        className: 'btn btn-danger',
        onClick: () => {
          // Pop the discard modal and let parent hideModal complete
          import('../utils.js').then(({ hideModalWithoutConfirm }) => hideModalWithoutConfirm());
          resolve(true);
        }
      }
    ]);
  });
}
