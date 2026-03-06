// ============================================================
// AR TRACKING MODULE
// Gyroscope-based position tracking for world-anchored poster placement
//
// Previous approach used optical flow (oflow library) which produced a single
// global average motion vector — this mixed rotation and translation, causing
// drift and wrong-direction movement.
//
// New approach: Pure gyroscope tracking.
// - Device orientation gives us rotation deltas (alpha/beta/gamma)
// - We convert angular deltas to screen-space pixel offsets using camera FOV
// - The poster position on screen = anchor position + gyro-based offset
// - No optical flow, no feature tracking, no drift
// ============================================================

// State
let isTracking = false;

// Placement anchor (normalized screen coordinates 0-1)
let anchorPosition = { x: 0.5, y: 0.5 };
let anchorOrientation = null; // Device orientation at placement time

// Camera FOV for angle-to-pixel conversion
let cameraHFov = 75; // Horizontal FOV in degrees (default, updated from camera)
let cameraVFov = 55; // Vertical FOV (calculated from horizontal + aspect)

// Smoothed tracking offset
let smoothedOffset = { x: 0, y: 0 };
const TRACKING_SMOOTH_FACTOR = 0.4; // Balance between responsive and smooth

// Legacy compatibility: accumulated flow (now driven by gyro)
let accumulatedFlow = { x: 0, y: 0 };

/**
 * Initialize tracking (simplified - no video needed for gyro tracking)
 * @param {HTMLVideoElement} videoElement - Kept for API compatibility
 * @returns {boolean} Success status
 */
export function initTracking(videoElement) {
  console.log('[AR Tracking] Gyro-based tracking initialized (no optical flow)');
  isTracking = true;
  return true;
}

/**
 * Start tracking
 */
export function startTracking() {
  isTracking = true;
  console.log('[AR Tracking] Tracking started (gyro-based)');
  return true;
}

/**
 * Stop tracking
 */
export function stopTracking() {
  isTracking = false;
  console.log('[AR Tracking] Tracking stopped');
}

/**
 * Set camera FOV for accurate angle-to-pixel conversion
 * @param {number} hFov - Horizontal field of view in degrees
 * @param {number} aspectRatio - Width / Height
 */
export function setCameraFOV(hFov, aspectRatio = 1.0) {
  cameraHFov = hFov;
  // Vertical FOV from horizontal FOV and aspect ratio
  cameraVFov = 2 * Math.atan(Math.tan(hFov * Math.PI / 360) / aspectRatio) * 180 / Math.PI;
  console.log('[AR Tracking] Camera FOV set:', hFov.toFixed(1) + '° H,', cameraVFov.toFixed(1) + '° V');
}

/**
 * Set the anchor position and orientation (when poster is placed)
 * @param {number} x - Normalized X position (0-1)
 * @param {number} y - Normalized Y position (0-1)
 * @param {Object} orientation - Device orientation at placement {alpha, beta, gamma}
 */
export function setAnchor(x, y, orientation = null) {
  anchorPosition = { x, y };
  anchorOrientation = orientation ? { ...orientation } : null;

  // Reset tracking offsets
  accumulatedFlow = { x: 0, y: 0 };
  smoothedOffset = { x: 0, y: 0 };

  console.log('[AR Tracking] Anchor set at', x.toFixed(3), y.toFixed(3),
    orientation ? `orient: α=${orientation.alpha?.toFixed(1)} β=${orientation.beta?.toFixed(1)} γ=${orientation.gamma?.toFixed(1)}` : '(no orientation)');
}

/**
 * Update tracking with current device orientation
 * Converts gyro deltas to screen-space position offset
 * @param {Object} currentOrientation - Current {alpha, beta, gamma}
 * @returns {Object} Updated position
 */
export function updateWithOrientation(currentOrientation) {
  if (!isTracking || !anchorOrientation || !currentOrientation) {
    return getTrackedPosition();
  }

  const currentAlpha = currentOrientation.alpha ?? 0;
  const currentBeta = currentOrientation.beta ?? 90;
  const anchorAlpha = anchorOrientation.alpha ?? 0;
  const anchorBeta = anchorOrientation.beta ?? 90;

  // Calculate angular deltas
  let deltaAlpha = currentAlpha - anchorAlpha;
  // Handle alpha wraparound (0-360°)
  if (deltaAlpha > 180) deltaAlpha -= 360;
  if (deltaAlpha < -180) deltaAlpha += 360;

  const deltaBeta = currentBeta - anchorBeta;

  // Convert angular deltas to normalized screen offsets
  // degreesPerScreenWidth = cameraHFov
  // So 1° of rotation = 1/cameraHFov of the screen width
  //
  // When phone yaws RIGHT (+deltaAlpha), things in the real world appear
  // to move LEFT on screen. To keep the poster anchored to its world position,
  // we need to move it LEFT on screen → NEGATIVE offset.
  const offsetX = -(deltaAlpha / cameraHFov);

  // When phone tilts UP (+deltaBeta from 90°), things appear to move DOWN.
  // To keep poster anchored, move it DOWN → POSITIVE Y offset (screen Y is inverted).
  const offsetY = (deltaBeta / cameraVFov);

  // Apply smoothing to prevent jitter
  smoothedOffset.x += (offsetX - smoothedOffset.x) * TRACKING_SMOOTH_FACTOR;
  smoothedOffset.y += (offsetY - smoothedOffset.y) * TRACKING_SMOOTH_FACTOR;

  // Update legacy flow values for compatibility
  accumulatedFlow.x = smoothedOffset.x;
  accumulatedFlow.y = smoothedOffset.y;

  return {
    x: anchorPosition.x + smoothedOffset.x,
    y: anchorPosition.y + smoothedOffset.y
  };
}

/**
 * Get the current tracked position relative to anchor
 * @returns {Object} Position with x, y in normalized coordinates (0-1)
 */
export function getTrackedPosition() {
  return {
    x: anchorPosition.x + smoothedOffset.x,
    y: anchorPosition.y + smoothedOffset.y
  };
}

/**
 * Reset tracking state
 */
export function resetTracking() {
  accumulatedFlow = { x: 0, y: 0 };
  smoothedOffset = { x: 0, y: 0 };
  anchorPosition = { x: 0.5, y: 0.5 };
  anchorOrientation = null;
}

// ============================================================
// PERSPECTIVE TRANSFORMATION (kept for corner mode compatibility)
// ============================================================

let perspectiveTransform = null;
let wallCorners = null;

/**
 * Set the wall corners for perspective transformation
 * @param {Array} corners - Array of 4 corner points [{x, y}, ...]
 */
export function setWallCorners(corners) {
  if (!corners || corners.length !== 4) {
    console.error('[AR Tracking] Need exactly 4 corners');
    return false;
  }

  wallCorners = corners;
  updatePerspectiveTransform();
  return true;
}

function updatePerspectiveTransform() {
  if (!wallCorners) return;

  if (typeof PerspT === 'undefined') {
    console.warn('[AR Tracking] perspective-transform library not loaded');
    return;
  }

  try {
    const srcCorners = [0, 0, 1, 0, 1, 1, 0, 1];
    const dstCorners = [
      wallCorners[0].x, wallCorners[0].y,
      wallCorners[1].x, wallCorners[1].y,
      wallCorners[2].x, wallCorners[2].y,
      wallCorners[3].x, wallCorners[3].y
    ];
    perspectiveTransform = PerspT(srcCorners, dstCorners);
    console.log('[AR Tracking] Perspective transform computed');
  } catch (error) {
    console.error('[AR Tracking] Failed to compute perspective:', error);
  }
}

export function transformPoint(x, y) {
  if (!perspectiveTransform) return { x, y };
  try {
    const result = perspectiveTransform.transform(x, y);
    return { x: result[0], y: result[1] };
  } catch (error) {
    return { x, y };
  }
}

export function getPosterCorners(centerX, centerY, width, height) {
  const halfW = width / 2;
  const halfH = height / 2;
  const posterCorners = [
    { x: centerX - halfW, y: centerY - halfH },
    { x: centerX + halfW, y: centerY - halfH },
    { x: centerX + halfW, y: centerY + halfH },
    { x: centerX - halfW, y: centerY + halfH }
  ];
  if (!perspectiveTransform) return posterCorners;
  return posterCorners.map(corner => transformPoint(corner.x, corner.y));
}

export function getHomographyMatrix() {
  if (!perspectiveTransform) return null;
  try { return perspectiveTransform.coeffs; }
  catch (error) { return null; }
}

export function estimateWallFromLines(verticalLines, horizontalLines, width, height) {
  if (!verticalLines?.length && !horizontalLines?.length) {
    return {
      corners: [
        { x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 },
        { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }
      ],
      confidence: 0.1
    };
  }

  let leftX = 0.1, rightX = 0.9, topY = 0.1, bottomY = 0.9;

  if (verticalLines?.length >= 2) {
    const sorted = [...verticalLines].sort((a, b) => a.x - b.x);
    leftX = sorted[0].x / width;
    rightX = sorted[sorted.length - 1].x / width;
  }

  if (horizontalLines?.length >= 2) {
    const sorted = [...horizontalLines].sort((a, b) => a.y - b.y);
    topY = sorted[0].y / height;
    bottomY = sorted[sorted.length - 1].y / height;
  }

  let leftSkew = 0, rightSkew = 0;
  if (verticalLines?.length >= 2) {
    const leftLines = verticalLines.filter(l => l.x < width / 2);
    const rightLines = verticalLines.filter(l => l.x >= width / 2);
    if (leftLines.length && leftLines[0].angle !== undefined) {
      leftSkew = (leftLines[0].angle - Math.PI / 2) * 0.3;
    }
    if (rightLines.length && rightLines[rightLines.length - 1].angle !== undefined) {
      rightSkew = (rightLines[rightLines.length - 1].angle - Math.PI / 2) * 0.3;
    }
  }

  const corners = [
    { x: leftX - leftSkew * 0.1, y: topY },
    { x: rightX + rightSkew * 0.1, y: topY },
    { x: rightX - rightSkew * 0.1, y: bottomY },
    { x: leftX + leftSkew * 0.1, y: bottomY }
  ];

  const confidence = Math.min(1, (verticalLines?.length || 0) / 4 + (horizontalLines?.length || 0) / 4);
  return { corners, confidence };
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

export function isTrackingActive() {
  return isTracking;
}

export function getStats() {
  return {
    isTracking,
    hasVideoFlow: false, // No longer using optical flow
    hasPerspective: perspectiveTransform !== null,
    accumulatedFlow: { ...accumulatedFlow },
    anchorPosition: { ...anchorPosition },
    smoothedOffset: { ...smoothedOffset }
  };
}

export function dispose() {
  stopTracking();
  perspectiveTransform = null;
  wallCorners = null;
  console.log('[AR Tracking] Disposed');
}
