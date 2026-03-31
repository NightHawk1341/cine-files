/**
 * utils/modalManager.js
 * Global modal manager for tracking unsaved changes
 */

let currentModalState = {
  type: null,
  entityId: null,
  hasUnsavedChanges: false
};

export function setModalState(type, entityId) {
  currentModalState = { type, entityId, hasUnsavedChanges: false };
}

export function clearModalState() {
  currentModalState = { type: null, entityId: null, hasUnsavedChanges: false };
}

export function markModalAsModified() {
  currentModalState.hasUnsavedChanges = true;
}

export function hasUnsavedChanges() {
  if (!currentModalState.type) return false;
  return currentModalState.hasUnsavedChanges;
}

export async function confirmDiscard() {
  const { showModal, hideModal } = await import('../utils.js');

  return new Promise((resolve) => {
    showModal('Несохраненные изменения', `
      <div style="padding: var(--spacing-md) 0;">
        <p>Есть несохраненные изменения. Закрыть без сохранения?</p>
      </div>
    `, [
      {
        text: 'Назад',
        className: 'btn btn-secondary',
        onClick: () => { hideModal(); resolve(false); }
      },
      {
        text: 'Закрыть без сохранения',
        className: 'btn btn-danger',
        onClick: () => { hideModal(); resolve(true); }
      }
    ]);
  });
}
