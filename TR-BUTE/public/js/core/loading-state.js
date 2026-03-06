/**
 * Loading State Manager
 * Coordinates loading states between dependent elements
 * Ensures skeletons remain visible until all dependencies are loaded
 *
 * Usage:
 *   // Register a module as loading
 *   LoadingState.startLoading('products-grid');
 *
 *   // Mark module as loaded
 *   LoadingState.finishLoading('products-grid');
 *
 *   // Wait for dependencies before showing content
 *   await LoadingState.waitFor(['products-grid']);
 *
 *   // Define module dependencies
 *   LoadingState.setDependencies('products-header', ['products-grid']);
 */

class LoadingStateManager {
  constructor() {
    // Map of module name -> { loading: boolean, loaded: boolean, error: boolean }
    this.states = new Map();

    // Map of module name -> array of dependency module names
    this.dependencies = new Map();

    // Map of module name -> array of callbacks waiting for module to load
    this.waiters = new Map();

    // Global loading state
    this.globalLoading = false;
  }

  /**
   * Register a module and mark it as loading
   * @param {string} moduleName - Name of the module
   */
  startLoading(moduleName) {
    this.states.set(moduleName, {
      loading: true,
      loaded: false,
      error: false,
      startTime: Date.now()
    });
    this._updateGlobalState();
  }

  /**
   * Mark a module as finished loading successfully
   * @param {string} moduleName - Name of the module
   */
  finishLoading(moduleName) {
    const state = this.states.get(moduleName) || {};
    this.states.set(moduleName, {
      ...state,
      loading: false,
      loaded: true,
      error: false,
      loadTime: Date.now() - (state.startTime || Date.now())
    });

    this._notifyWaiters(moduleName);
    this._updateGlobalState();
  }

  /**
   * Mark a module as failed to load
   * @param {string} moduleName - Name of the module
   * @param {Error} error - The error that occurred
   */
  failLoading(moduleName, error) {
    const state = this.states.get(moduleName) || {};
    this.states.set(moduleName, {
      ...state,
      loading: false,
      loaded: false,
      error: true,
      errorMessage: error?.message
    });

    this._notifyWaiters(moduleName, error);
    this._updateGlobalState();
  }

  /**
   * Check if a module is currently loading
   * @param {string} moduleName - Name of the module
   * @returns {boolean}
   */
  isLoading(moduleName) {
    return this.states.get(moduleName)?.loading || false;
  }

  /**
   * Check if a module has finished loading
   * @param {string} moduleName - Name of the module
   * @returns {boolean}
   */
  isLoaded(moduleName) {
    return this.states.get(moduleName)?.loaded || false;
  }

  /**
   * Check if any module is still loading
   * @returns {boolean}
   */
  isAnyLoading() {
    return this.globalLoading;
  }

  /**
   * Set dependencies for a module
   * The module's content won't be shown until all dependencies are loaded
   * @param {string} moduleName - Name of the module
   * @param {string[]} deps - Array of dependency module names
   */
  setDependencies(moduleName, deps) {
    this.dependencies.set(moduleName, deps);
  }

  /**
   * Wait for a module to finish loading
   * @param {string} moduleName - Name of the module
   * @param {number} timeout - Maximum time to wait in ms (default: 10000)
   * @returns {Promise<void>}
   */
  waitForModule(moduleName, timeout = 10000) {
    return new Promise((resolve, reject) => {
      // Already loaded
      if (this.isLoaded(moduleName)) {
        resolve();
        return;
      }

      // Not registered - resolve immediately (might not exist)
      if (!this.states.has(moduleName)) {
        resolve();
        return;
      }

      // Set up timeout
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timeout waiting for module: ${moduleName}`));
      }, timeout);

      // Add to waiters
      if (!this.waiters.has(moduleName)) {
        this.waiters.set(moduleName, []);
      }
      this.waiters.get(moduleName).push({ resolve, reject, timeoutId });
    });
  }

  /**
   * Wait for multiple modules to finish loading
   * @param {string[]} moduleNames - Array of module names
   * @param {number} timeout - Maximum time to wait in ms
   * @returns {Promise<void>}
   */
  async waitFor(moduleNames, timeout = 10000) {
    await Promise.all(moduleNames.map(name => this.waitForModule(name, timeout)));
  }

  /**
   * Wait for all dependencies of a module to load
   * @param {string} moduleName - Name of the module
   * @param {number} timeout - Maximum time to wait in ms
   * @returns {Promise<void>}
   */
  async waitForDependencies(moduleName, timeout = 10000) {
    const deps = this.dependencies.get(moduleName) || [];
    if (deps.length > 0) {
      await this.waitFor(deps, timeout);
    }
  }

  /**
   * Check if all dependencies of a module are loaded
   * @param {string} moduleName - Name of the module
   * @returns {boolean}
   */
  areDependenciesLoaded(moduleName) {
    const deps = this.dependencies.get(moduleName) || [];
    return deps.every(dep => this.isLoaded(dep));
  }

  /**
   * Reset all loading states
   */
  reset() {
    this.states.clear();
    this.waiters.clear();
    this.globalLoading = false;
  }

  /**
   * Get debug info about current loading states
   * @returns {Object}
   */
  getDebugInfo() {
    const info = {};
    this.states.forEach((state, name) => {
      info[name] = { ...state };
    });
    return info;
  }

  // Private methods

  _notifyWaiters(moduleName, error = null) {
    const waiters = this.waiters.get(moduleName) || [];
    waiters.forEach(({ resolve, reject, timeoutId }) => {
      clearTimeout(timeoutId);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
    this.waiters.delete(moduleName);
  }

  _updateGlobalState() {
    let anyLoading = false;
    this.states.forEach(state => {
      if (state.loading) anyLoading = true;
    });
    this.globalLoading = anyLoading;

    // Update body class for CSS-based loading states
    if (anyLoading) {
      document.body.classList.add('page-loading');
    } else {
      document.body.classList.remove('page-loading');
    }
  }
}

// Export singleton instance
export const LoadingState = new LoadingStateManager();

// Also attach to window for non-module scripts
if (typeof window !== 'undefined') {
  window.LoadingState = LoadingState;
}
