/**
 * Depth Estimation Module for AR Wall Detection
 * Uses MiDaS model via TensorFlow.js for monocular depth estimation
 */

// Model configuration
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/1/deeplab_v3.tflite';
// Alternative: Use a hosted MiDaS model or self-host
const MIDAS_MODEL_URL = '/models/midas_v21_small_256.tflite';
const MODEL_INPUT_SIZE = 256;
const DEPTH_CACHE_KEY = 'ar-depth-model-v1';

// State
let depthModel = null;
let isModelLoading = false;
let isModelReady = false;
let depthCanvas = null;
let depthCtx = null;
let inputCanvas = null;
let inputCtx = null;

// Callbacks
let onLoadProgress = null;
let onLoadComplete = null;
let onLoadError = null;

/**
 * Initialize the depth estimation system
 */
export async function initDepthEstimation(callbacks = {}) {
  onLoadProgress = callbacks.onProgress || (() => {});
  onLoadComplete = callbacks.onComplete || (() => {});
  onLoadError = callbacks.onError || (() => {});

  // Create canvases for processing
  depthCanvas = document.createElement('canvas');
  depthCanvas.width = MODEL_INPUT_SIZE;
  depthCanvas.height = MODEL_INPUT_SIZE;
  depthCtx = depthCanvas.getContext('2d');

  inputCanvas = document.createElement('canvas');
  inputCanvas.width = MODEL_INPUT_SIZE;
  inputCanvas.height = MODEL_INPUT_SIZE;
  inputCtx = inputCanvas.getContext('2d');

  // Load the model
  await loadModel();
}

/**
 * Load the depth estimation model with caching
 */
async function loadModel() {
  if (isModelLoading || isModelReady) return;
  isModelLoading = true;

  try {
    onLoadProgress(0, 'Инициализация TensorFlow.js...');

    // Wait for TensorFlow.js to be ready - may fail if TF not loaded or WASM issues
    try {
      if (typeof tf !== 'undefined' && tf.ready) {
        await tf.ready();
        console.log('[Depth] TensorFlow.js ready, backend:', tf.getBackend());
      } else {
        console.log('[Depth] TensorFlow.js not available, using fallback');
        depthModel = null;
        isModelReady = true;
        isModelLoading = false;
        onLoadProgress(100, 'Готово (упрощённый режим)');
        onLoadComplete(false);
        return;
      }
    } catch (tfInitError) {
      console.warn('[Depth] TensorFlow.js init failed:', tfInitError.message);
      depthModel = null;
      isModelReady = true;
      isModelLoading = false;
      onLoadProgress(100, 'Готово (упрощённый режим)');
      onLoadComplete(false);
      return;
    }

    onLoadProgress(10, 'Проверка кэша модели...');

    // Check if model is cached in IndexedDB
    const cachedModel = await getCachedModel();

    if (cachedModel) {
      onLoadProgress(50, 'Загрузка модели из кэша...');
      depthModel = cachedModel;
    } else {
      onLoadProgress(20, 'Загрузка модели глубины...');

      // For now, we'll use a simpler approach with tf.loadGraphModel
      // since TFLite support can be tricky
      // We'll use a pre-converted model or fall back to simulated depth

      try {
        // Try to load TFLite model - wrap in extra try-catch for WASM init errors
        let tfliteAvailable = false;
        try {
          tfliteAvailable = typeof tflite !== 'undefined' && tflite && typeof tflite.loadTFLiteModel === 'function';
        } catch (wasmErr) {
          console.warn('[Depth] TFLite WASM check failed:', wasmErr.message);
          tfliteAvailable = false;
        }

        if (tfliteAvailable) {
          depthModel = await tflite.loadTFLiteModel(MIDAS_MODEL_URL, {
            onProgress: (fraction) => {
              onLoadProgress(20 + fraction * 60, 'Загрузка модели глубины...');
            }
          });
          await cacheModel(depthModel);
        } else {
          console.log('[Depth] TFLite not available, using fallback edge detection');
          depthModel = null;
        }
      } catch (e) {
        console.warn('[Depth] TFLite model loading failed, using fallback:', e.message);
        // Fall back to simulated depth estimation
        depthModel = null;
      }
    }

    onLoadProgress(90, 'Инициализация завершена');

    isModelReady = true;
    isModelLoading = false;

    onLoadProgress(100, 'Готово');
    onLoadComplete(depthModel !== null);

    console.log('[Depth] Model loaded successfully:', depthModel !== null ? 'ML model' : 'fallback mode');
  } catch (error) {
    console.error('[Depth] Model loading failed:', error);
    isModelLoading = false;
    isModelReady = true; // Mark as ready to use fallback
    onLoadError(error);
    onLoadComplete(false);
  }
}

/**
 * Get cached model from IndexedDB
 */
async function getCachedModel() {
  try {
    // Check if model files exist in cache
    const cache = await caches.open('ar-depth-models');
    const response = await cache.match(MIDAS_MODEL_URL);
    if (response) {
      console.log('[Depth] Found cached model');
      // Model exists in cache, TFLite will use it
      return null; // Let TFLite load it
    }
  } catch (e) {
    console.log('[Depth] Cache check failed:', e.message);
  }
  return null;
}

/**
 * Cache model in browser storage
 */
async function cacheModel(model) {
  try {
    // The model is already cached by the fetch request
    console.log('[Depth] Model cached');
  } catch (e) {
    console.warn('[Depth] Failed to cache model:', e);
  }
}

/**
 * Process a video frame and return depth information
 * @param {HTMLVideoElement|HTMLImageElement} source - Image source
 * @returns {Object} Depth analysis result
 */
export function estimateDepth(source) {
  if (!isModelReady) {
    return {
      success: false,
      error: 'Model not ready',
      wallDistance: 1.5, // Default fallback
      wallDetected: false
    };
  }

  try {
    // Draw source to input canvas (resize to model input size)
    inputCtx.drawImage(source, 0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);

    if (depthModel) {
      // Use ML model for depth estimation
      return estimateDepthML(inputCanvas);
    } else {
      // Use fallback algorithm (edge detection + assumptions)
      return estimateDepthFallback(inputCanvas);
    }
  } catch (error) {
    console.error('[Depth] Estimation error:', error);
    return {
      success: false,
      error: error.message,
      wallDistance: 1.5,
      wallDetected: false
    };
  }
}

/**
 * ML-based depth estimation using MiDaS
 */
function estimateDepthML(canvas) {
  // Get image data
  const imageData = inputCtx.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);

  // Prepare input tensor
  const inputTensor = tf.tidy(() => {
    let tensor = tf.browser.fromPixels(canvas);
    // Normalize to [0, 1]
    tensor = tensor.toFloat().div(255.0);
    // Add batch dimension
    tensor = tensor.expandDims(0);
    return tensor;
  });

  // Run inference
  const outputTensor = depthModel.predict(inputTensor);

  // Get depth values
  const depthData = outputTensor.dataSync();

  // Clean up tensors
  inputTensor.dispose();
  outputTensor.dispose();

  // Analyze depth map
  return analyzeDepthMap(depthData, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
}

/**
 * Fallback depth estimation using image analysis
 * Uses edge detection, line detection, and assumptions about typical room geometry
 */
function estimateDepthFallback(canvas) {
  const imageData = inputCtx.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
  const data = imageData.data;

  // Calculate average brightness in center region (likely wall area)
  const centerSize = MODEL_INPUT_SIZE / 4;
  const centerStart = (MODEL_INPUT_SIZE - centerSize) / 2;
  let centerBrightness = 0;
  let centerPixels = 0;

  // Calculate edge density (more edges = closer/more detail)
  // Lower threshold for better sensitivity to room lines and edges
  let edgeCount = 0;
  const edgeThreshold = 20;

  // Track gradient directions for line/perspective detection
  let horizontalGradSum = 0;
  let verticalGradSum = 0;
  let gradientAngles = [];

  for (let y = 1; y < MODEL_INPUT_SIZE - 1; y++) {
    for (let x = 1; x < MODEL_INPUT_SIZE - 1; x++) {
      const idx = (y * MODEL_INPUT_SIZE + x) * 4;
      const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;

      // Center brightness
      if (x >= centerStart && x < centerStart + centerSize &&
          y >= centerStart && y < centerStart + centerSize) {
        centerBrightness += gray;
        centerPixels++;
      }

      // Edge detection (Sobel-like)
      const leftIdx = (y * MODEL_INPUT_SIZE + (x - 1)) * 4;
      const rightIdx = (y * MODEL_INPUT_SIZE + (x + 1)) * 4;
      const topIdx = ((y - 1) * MODEL_INPUT_SIZE + x) * 4;
      const bottomIdx = ((y + 1) * MODEL_INPUT_SIZE + x) * 4;

      const grayLeft = (data[leftIdx] + data[leftIdx + 1] + data[leftIdx + 2]) / 3;
      const grayRight = (data[rightIdx] + data[rightIdx + 1] + data[rightIdx + 2]) / 3;
      const grayTop = (data[topIdx] + data[topIdx + 1] + data[topIdx + 2]) / 3;
      const grayBottom = (data[bottomIdx] + data[bottomIdx + 1] + data[bottomIdx + 2]) / 3;

      const gradX = grayRight - grayLeft;  // Keep sign for direction
      const gradY = grayBottom - grayTop;
      const gradient = Math.sqrt(gradX * gradX + gradY * gradY);

      if (gradient > edgeThreshold) {
        edgeCount++;
        // Track gradient direction for perspective estimation
        horizontalGradSum += Math.abs(gradX);
        verticalGradSum += Math.abs(gradY);

        // Store edge angles for line detection
        if (gradient > edgeThreshold * 1.5) {
          const angle = Math.atan2(gradY, gradX);
          gradientAngles.push({ x, y, angle, strength: gradient });
        }
      }
    }
  }

  centerBrightness /= centerPixels;
  const edgeDensity = edgeCount / (MODEL_INPUT_SIZE * MODEL_INPUT_SIZE);

  // ============ WALL ORIENTATION DETECTION ============
  // Analyze perspective lines to estimate wall angle

  // Detect dominant line directions using histogram of angles
  const angleHistogram = new Array(18).fill(0); // 10-degree bins
  for (const edge of gradientAngles) {
    // Normalize angle to 0-180 (lines are bidirectional)
    let angleDeg = ((edge.angle * 180 / Math.PI) + 180) % 180;
    const bin = Math.floor(angleDeg / 10);
    angleHistogram[bin] += edge.strength;
  }

  // Find dominant horizontal-ish (80-100°) and vertical-ish (0-10° or 170-180°) lines
  const horizontalStrength = angleHistogram[8] + angleHistogram[9]; // 80-100°
  const verticalStrength = angleHistogram[0] + angleHistogram[17]; // 0-10° and 170-180°

  // Estimate wall tilt from perspective convergence
  // If left side has more vertical edges than right, wall angles away to the right
  let leftVerticalCount = 0;
  let rightVerticalCount = 0;
  let topHorizontalCount = 0;
  let bottomHorizontalCount = 0;

  const midX = MODEL_INPUT_SIZE / 2;
  const midY = MODEL_INPUT_SIZE / 2;

  for (const edge of gradientAngles) {
    const angleDeg = ((edge.angle * 180 / Math.PI) + 180) % 180;
    const isVertical = angleDeg < 20 || angleDeg > 160;
    const isHorizontal = angleDeg > 70 && angleDeg < 110;

    if (isVertical) {
      if (edge.x < midX) leftVerticalCount++;
      else rightVerticalCount++;
    }
    if (isHorizontal) {
      if (edge.y < midY) topHorizontalCount++;
      else bottomHorizontalCount++;
    }
  }

  // Calculate wall orientation angles (in radians)
  // wallAngleY: rotation around vertical axis (left/right tilt of wall)
  // wallAngleX: rotation around horizontal axis (forward/back tilt)
  const totalVertical = leftVerticalCount + rightVerticalCount || 1;
  const totalHorizontal = topHorizontalCount + bottomHorizontalCount || 1;

  // Asymmetry in edge distribution indicates perspective/wall angle
  const horizontalAsymmetry = (rightVerticalCount - leftVerticalCount) / totalVertical;
  const verticalAsymmetry = (bottomHorizontalCount - topHorizontalCount) / totalHorizontal;

  // Convert asymmetry to estimated wall angle (max ~50 degrees for angled surfaces like doors)
  const maxWallAngle = Math.PI * 0.28; // ~50 degrees

  // Analyze lean of vertical edges to detect wall surface rotation.
  // Vertical edges have approximately horizontal gradients (atan2 near 0 or ±PI).
  // The gradient's deviation from exactly horizontal indicates the edge's lean.
  let verticalEdgeAngleSum = 0;
  let verticalEdgeCount = 0;
  for (const edge of gradientAngles) {
    const absAngle = Math.abs(edge.angle);
    // Select edges where gradient is within 30° of horizontal (= vertical edges)
    if (absAngle < Math.PI / 6) {
      // Gradient near 0°: deviation is the angle itself
      verticalEdgeAngleSum += edge.angle;
      verticalEdgeCount++;
    } else if (absAngle > 5 * Math.PI / 6) {
      // Gradient near ±180°: measure deviation from ±PI
      const deviation = edge.angle > 0 ? edge.angle - Math.PI : edge.angle + Math.PI;
      verticalEdgeAngleSum += deviation;
      verticalEdgeCount++;
    }
  }

  // Average vertical edge lean indicates wall rotation
  const avgVerticalLean = verticalEdgeCount > 5 ? verticalEdgeAngleSum / verticalEdgeCount : 0;

  // Combine asymmetry and edge lean for wall angle detection
  const asymmetryContribution = horizontalAsymmetry * maxWallAngle;
  const edgeLeanContribution = avgVerticalLean * 2; // Edge lean is strong indicator

  const wallAngleY = asymmetryContribution * 0.4 + edgeLeanContribution * 0.6; // Combined
  const wallAngleX = verticalAsymmetry * maxWallAngle * 0.3; // Up/down (less range)

  // ============ IMPROVED DEPTH ESTIMATION ============
  // Use multiple cues: edge density, line convergence, and uniformity

  const minDistance = 0.5;
  const maxDistance = 3.0;

  // 1. Edge density cue (more edges = closer, more detail visible)
  const normalizedEdges = Math.min(1, edgeDensity / 0.15);
  const edgeBasedDistance = maxDistance - normalizedEdges * (maxDistance - minDistance) * 0.85;

  // 2. Line convergence cue (stronger convergence = closer to angled surface)
  // Use the edge lean to estimate convergence
  const convergenceStrength = Math.abs(avgVerticalLean) * 2; // 0 = parallel lines, higher = converging
  const convergenceDistance = convergenceStrength > 0.1
    ? Math.max(minDistance, 2.0 - convergenceStrength * 3) // Strong convergence = closer
    : 2.0; // Parallel lines = medium distance

  // 3. Wall angle cue (steep angles suggest we're close to corner/edge)
  const wallAngleMagnitude = Math.abs(wallAngleY);
  const angleBasedDistance = wallAngleMagnitude > 0.3
    ? Math.max(minDistance, 1.5 - wallAngleMagnitude) // Strong angle = closer
    : 2.0;

  // Combine estimates with weights based on confidence
  const hasStrongLines = gradientAngles.length > 20;
  const hasConvergence = convergenceStrength > 0.05;

  let estimatedDistance;
  if (hasStrongLines && hasConvergence) {
    // Strong visual cues - trust line-based estimates more
    estimatedDistance = edgeBasedDistance * 0.3 + convergenceDistance * 0.4 + angleBasedDistance * 0.3;
  } else if (hasStrongLines) {
    // Lines but no clear convergence - use edge and angle
    estimatedDistance = edgeBasedDistance * 0.5 + angleBasedDistance * 0.5;
  } else {
    // Weak visual cues - rely on edge density
    estimatedDistance = edgeBasedDistance;
  }

  // Clamp to valid range
  estimatedDistance = Math.max(minDistance, Math.min(maxDistance, estimatedDistance));

  // Check for wall-like uniformity in center
  let variance = 0;
  for (let y = centerStart; y < centerStart + centerSize; y++) {
    for (let x = centerStart; x < centerStart + centerSize; x++) {
      const idx = (y * MODEL_INPUT_SIZE + x) * 4;
      const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      variance += (gray - centerBrightness) * (gray - centerBrightness);
    }
  }
  variance /= centerPixels;
  const stdDev = Math.sqrt(variance);

  // Low standard deviation = more uniform = likely wall
  const isLikelyWall = stdDev < 40;

  // Wall orientation confidence based on edge detection quality
  // Lower threshold (30 edges) for faster response to wall orientation
  const orientationConfidence = Math.min(1, gradientAngles.length / 30);

  return {
    success: true,
    wallDistance: estimatedDistance,
    wallDetected: isLikelyWall,
    wallAngleY: wallAngleY,  // Horizontal rotation (radians)
    wallAngleX: wallAngleX,  // Vertical rotation (radians)
    orientationConfidence: orientationConfidence,
    confidence: isLikelyWall ? 0.7 : 0.4,
    edgeDensity: edgeDensity,
    uniformity: 1 - (stdDev / 128),
    method: 'fallback'
  };
}

// ============ ENHANCED WALL/CORNER DETECTION ============

/**
 * Detect lines in the image using a simplified Hough-like approach
 * Returns arrays of vertical and horizontal lines
 */
function detectLines(imageData, width, height) {
  const data = imageData.data;
  const lines = { vertical: [], horizontal: [] };

  // Edge detection with Sobel
  const edges = [];
  const edgeThreshold = 40;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;

      // Sobel operators
      const gx =
        -1 * getGray(data, x-1, y-1, width) + 1 * getGray(data, x+1, y-1, width) +
        -2 * getGray(data, x-1, y, width)   + 2 * getGray(data, x+1, y, width) +
        -1 * getGray(data, x-1, y+1, width) + 1 * getGray(data, x+1, y+1, width);

      const gy =
        -1 * getGray(data, x-1, y-1, width) - 2 * getGray(data, x, y-1, width) - 1 * getGray(data, x+1, y-1, width) +
         1 * getGray(data, x-1, y+1, width) + 2 * getGray(data, x, y+1, width) + 1 * getGray(data, x+1, y+1, width);

      const magnitude = Math.sqrt(gx * gx + gy * gy);

      if (magnitude > edgeThreshold) {
        const angle = Math.atan2(gy, gx);
        edges.push({ x, y, angle, magnitude });
      }
    }
  }

  // Group edges into lines using gradient direction.
  // Gradient is perpendicular to the edge, so:
  //   Vertical edges (line runs up/down) → gradient is horizontal → angle near 0° or ±180°
  //   Horizontal edges (line runs left/right) → gradient is vertical → angle near ±90°

  const verticalEdges = edges.filter(e => {
    const absAngle = Math.abs(e.angle);
    return absAngle < Math.PI * 0.15 || absAngle > Math.PI * 0.85;
  });

  const horizontalEdges = edges.filter(e => {
    const absAngle = Math.abs(e.angle);
    return absAngle > Math.PI * 0.35 && absAngle < Math.PI * 0.65;
  });

  // Find vertical line segments by grouping nearby vertical edges in columns
  const columnBuckets = new Map();
  for (const edge of verticalEdges) {
    const col = Math.floor(edge.x / 8) * 8; // 8-pixel buckets
    if (!columnBuckets.has(col)) columnBuckets.set(col, []);
    columnBuckets.get(col).push(edge);
  }

  // Find strong vertical lines
  for (const [col, colEdges] of columnBuckets) {
    if (colEdges.length > 10) { // Enough edges to be a line
      const minY = Math.min(...colEdges.map(e => e.y));
      const maxY = Math.max(...colEdges.map(e => e.y));
      const avgX = colEdges.reduce((s, e) => s + e.x, 0) / colEdges.length;
      const avgAngle = colEdges.reduce((s, e) => s + e.angle, 0) / colEdges.length;

      lines.vertical.push({
        x: avgX,
        y1: minY,
        y2: maxY,
        length: maxY - minY,
        angle: avgAngle, // Deviation from vertical
        strength: colEdges.length
      });
    }
  }

  // Find horizontal line segments
  const rowBuckets = new Map();
  for (const edge of horizontalEdges) {
    const row = Math.floor(edge.y / 8) * 8;
    if (!rowBuckets.has(row)) rowBuckets.set(row, []);
    rowBuckets.get(row).push(edge);
  }

  for (const [row, rowEdges] of rowBuckets) {
    if (rowEdges.length > 10) {
      const minX = Math.min(...rowEdges.map(e => e.x));
      const maxX = Math.max(...rowEdges.map(e => e.x));
      const avgY = rowEdges.reduce((s, e) => s + e.y, 0) / rowEdges.length;

      lines.horizontal.push({
        y: avgY,
        x1: minX,
        x2: maxX,
        length: maxX - minX,
        strength: rowEdges.length
      });
    }
  }

  // Sort by strength
  lines.vertical.sort((a, b) => b.strength - a.strength);
  lines.horizontal.sort((a, b) => b.strength - a.strength);

  return lines;
}

/**
 * Get grayscale value at pixel
 */
function getGray(data, x, y, width) {
  const idx = (y * width + x) * 4;
  return (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
}

/**
 * Find vanishing points from detected lines
 * Returns estimated vanishing point for perspective
 */
function findVanishingPoints(lines, width, height) {
  const vp = { x: width / 2, y: height / 2, confidence: 0 };

  // Use vertical lines to estimate horizontal vanishing point
  // Lines that aren't perfectly vertical converge at a vanishing point
  if (lines.vertical.length >= 2) {
    const leftLines = lines.vertical.filter(l => l.x < width / 2);
    const rightLines = lines.vertical.filter(l => l.x >= width / 2);

    if (leftLines.length > 0 && rightLines.length > 0) {
      // Average angle deviation from vertical
      const leftAngle = leftLines.reduce((s, l) => s + (l.angle - Math.PI/2), 0) / leftLines.length;
      const rightAngle = rightLines.reduce((s, l) => s + (l.angle - Math.PI/2), 0) / rightLines.length;

      // If left lines lean right and right lines lean left, they converge
      if (leftAngle > 0 && rightAngle < 0) {
        // Estimate convergence point (simplified)
        const convergenceAngle = (leftAngle - rightAngle) / 2;
        vp.y = height / 2 - Math.tan(convergenceAngle) * width / 2;
        vp.confidence = Math.min(1, Math.abs(convergenceAngle) * 5);
      }
    }
  }

  return vp;
}

/**
 * Detect corners where walls meet (wall/floor/ceiling intersections)
 * Uses Harris-like corner detection
 */
function detectCorners(imageData, width, height) {
  const data = imageData.data;
  const corners = [];
  const windowSize = 5;
  const threshold = 1000;

  // Calculate gradients
  const gradX = new Float32Array(width * height);
  const gradY = new Float32Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      gradX[idx] = getGray(data, x + 1, y, width) - getGray(data, x - 1, y, width);
      gradY[idx] = getGray(data, x, y + 1, width) - getGray(data, x, y - 1, width);
    }
  }

  // Harris corner response
  const cornerResponse = new Float32Array(width * height);
  const k = 0.04; // Harris constant

  for (let y = windowSize; y < height - windowSize; y++) {
    for (let x = windowSize; x < width - windowSize; x++) {
      let Ixx = 0, Iyy = 0, Ixy = 0;

      // Sum over window
      for (let wy = -windowSize; wy <= windowSize; wy++) {
        for (let wx = -windowSize; wx <= windowSize; wx++) {
          const idx = (y + wy) * width + (x + wx);
          const gx = gradX[idx];
          const gy = gradY[idx];
          Ixx += gx * gx;
          Iyy += gy * gy;
          Ixy += gx * gy;
        }
      }

      // Harris response: det(M) - k * trace(M)^2
      const det = Ixx * Iyy - Ixy * Ixy;
      const trace = Ixx + Iyy;
      const R = det - k * trace * trace;

      cornerResponse[y * width + x] = R;
    }
  }

  // Non-maximum suppression to find corner peaks
  const suppressionSize = 15;
  for (let y = suppressionSize; y < height - suppressionSize; y++) {
    for (let x = suppressionSize; x < width - suppressionSize; x++) {
      const idx = y * width + x;
      const R = cornerResponse[idx];

      if (R > threshold) {
        let isMax = true;

        // Check if local maximum
        for (let wy = -suppressionSize; wy <= suppressionSize && isMax; wy++) {
          for (let wx = -suppressionSize; wx <= suppressionSize && isMax; wx++) {
            if (wx === 0 && wy === 0) continue;
            const nIdx = (y + wy) * width + (x + wx);
            if (cornerResponse[nIdx] > R) {
              isMax = false;
            }
          }
        }

        if (isMax) {
          corners.push({
            x,
            y,
            strength: R,
            // Classify corner position
            region: classifyCornerRegion(x, y, width, height)
          });
        }
      }
    }
  }

  // Sort by strength
  corners.sort((a, b) => b.strength - a.strength);

  // Return top corners
  return corners.slice(0, 10);
}

/**
 * Classify which region of the image a corner is in
 */
function classifyCornerRegion(x, y, width, height) {
  const xRegion = x < width / 3 ? 'left' : x > width * 2/3 ? 'right' : 'center';
  const yRegion = y < height / 3 ? 'top' : y > height * 2/3 ? 'bottom' : 'middle';
  return `${yRegion}-${xRegion}`;
}

/**
 * Estimate wall plane from detected features
 * Combines line detection, vanishing points, and corners
 */
export function estimateWallPlane(imageElement) {
  // Prepare canvas for analysis
  if (!inputCanvas) {
    inputCanvas = document.createElement('canvas');
    inputCanvas.width = MODEL_INPUT_SIZE;
    inputCanvas.height = MODEL_INPUT_SIZE;
    inputCtx = inputCanvas.getContext('2d');
  }

  // Draw image to canvas
  inputCtx.drawImage(imageElement, 0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
  const imageData = inputCtx.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);

  // Detect features
  const lines = detectLines(imageData, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
  const vanishingPoint = findVanishingPoints(lines, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
  const corners = detectCorners(imageData, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);

  // Estimate wall orientation from lines
  let wallAngleY = 0;  // Wall facing left/right (perspective)
  let wallAngleX = 0;  // Wall tilting forward/back
  let cameraRoll = 0;  // Camera tilt - needs counter-rotation
  let confidence = 0;

  // Use vertical lines to detect:
  // 1. Camera roll - average tilt of vertical lines from true vertical
  // 2. Wall perspective - convergence pattern (left side vs right side line positions)
  if (lines.vertical.length >= 2) {
    const strongLines = lines.vertical.slice(0, 6);

    // Camera roll: lean of vertical lines from true vertical.
    // Vertical edges have gradient near 0° or ±180°. Normalize to near 0°
    // so both polarities can be averaged, then the mean is the lean angle.
    const avgLean = strongLines.reduce((s, l) => {
      let a = l.angle;
      if (a > Math.PI / 2) a -= Math.PI;
      if (a < -Math.PI / 2) a += Math.PI;
      return s + a;
    }, 0) / strongLines.length;
    cameraRoll = avgLean;
    cameraRoll = Math.max(-Math.PI / 6, Math.min(Math.PI / 6, cameraRoll)); // Max 30°

    // Wall perspective: check if left-side lines converge differently than right-side
    // If vanishing point is to the left, wall faces left
    if (vanishingPoint.confidence > 0.3) {
      // Vanishing point x position indicates wall angle
      // x < 0.5 = VP on left = wall faces left = positive Y rotation
      const vpOffset = (vanishingPoint.x / MODEL_INPUT_SIZE) - 0.5;
      wallAngleY = -vpOffset * Math.PI / 2; // Scale to radians
      wallAngleY = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, wallAngleY));
    }

    confidence = Math.min(1, strongLines.length / 4 * 0.5 + vanishingPoint.confidence * 0.5);
  }

  // Use horizontal lines for vertical angle
  if (lines.horizontal.length >= 2) {
    const topLines = lines.horizontal.filter(l => l.y < MODEL_INPUT_SIZE / 2);
    const bottomLines = lines.horizontal.filter(l => l.y >= MODEL_INPUT_SIZE / 2);

    if (topLines.length > 0 && bottomLines.length > 0) {
      // If top lines are longer, wall tilts back
      const topStrength = topLines.reduce((s, l) => s + l.length, 0);
      const bottomStrength = bottomLines.reduce((s, l) => s + l.length, 0);
      wallAngleX = (bottomStrength - topStrength) / (topStrength + bottomStrength) * 0.3;
    }
  }

  // Identify room structure from corners
  const roomStructure = {
    hasLeftWall: corners.some(c => c.region.includes('left')),
    hasRightWall: corners.some(c => c.region.includes('right')),
    hasFloor: corners.some(c => c.region.includes('bottom')),
    hasCeiling: corners.some(c => c.region.includes('top')),
    corners: corners.map(c => ({ x: c.x / MODEL_INPUT_SIZE, y: c.y / MODEL_INPUT_SIZE, region: c.region }))
  };

  return {
    wallAngleY,      // Wall perspective - horizontal rotation
    wallAngleX,      // Wall perspective - vertical tilt
    cameraRoll,      // Camera tilt - needs counter-rotation to keep poster vertical
    confidence,
    lines: {
      vertical: lines.vertical.slice(0, 5).map(l => ({
        x: l.x / MODEL_INPUT_SIZE,
        y1: l.y1 / MODEL_INPUT_SIZE,
        y2: l.y2 / MODEL_INPUT_SIZE,
        angle: l.angle
      })),
      horizontal: lines.horizontal.slice(0, 5).map(l => ({
        y: l.y / MODEL_INPUT_SIZE,
        x1: l.x1 / MODEL_INPUT_SIZE,
        x2: l.x2 / MODEL_INPUT_SIZE
      }))
    },
    vanishingPoint: {
      x: vanishingPoint.x / MODEL_INPUT_SIZE,
      y: vanishingPoint.y / MODEL_INPUT_SIZE,
      confidence: vanishingPoint.confidence
    },
    roomStructure
  };
}

/**
 * Compute wall corners from wall angles for perspective transformation
 * Returns 4 corners in normalized coordinates (0-1)
 * Order: top-left, top-right, bottom-right, bottom-left
 *
 * @param {number} wallAngleY - Horizontal wall angle (radians)
 * @param {number} wallAngleX - Vertical wall angle (radians)
 * @param {number} margin - Margin from edge (0-0.5)
 * @returns {Array} Array of 4 corner objects with x, y
 */
export function computeWallCorners(wallAngleY, wallAngleX, margin = 0.1) {
  // Start with a rectangle
  const left = margin;
  const right = 1 - margin;
  const top = margin;
  const bottom = 1 - margin;

  // Apply perspective based on wall angles
  // wallAngleY > 0: wall faces left, right side closer (appears larger)
  // wallAngleY < 0: wall faces right, left side closer (appears larger)
  const hPerspective = Math.tan(wallAngleY) * 0.3; // Scale factor for visible effect

  // wallAngleX > 0: wall tilts back, top appears closer
  // wallAngleX < 0: wall tilts forward, bottom appears closer
  const vPerspective = Math.tan(wallAngleX) * 0.2;

  // Compute corners with perspective distortion
  // Positive hPerspective = right side closer = right side expands vertically
  const topLeftX = left + hPerspective * 0.5;
  const topLeftY = top + vPerspective * 0.5;

  const topRightX = right + hPerspective * 0.5;
  const topRightY = top - vPerspective * 0.5;

  const bottomRightX = right - hPerspective * 0.5;
  const bottomRightY = bottom - vPerspective * 0.5;

  const bottomLeftX = left - hPerspective * 0.5;
  const bottomLeftY = bottom + vPerspective * 0.5;

  // Clamp to valid range
  const clamp = (v) => Math.max(0, Math.min(1, v));

  return [
    { x: clamp(topLeftX), y: clamp(topLeftY) },
    { x: clamp(topRightX), y: clamp(topRightY) },
    { x: clamp(bottomRightX), y: clamp(bottomRightY) },
    { x: clamp(bottomLeftX), y: clamp(bottomLeftY) }
  ];
}

/**
 * Analyze a depth map to extract wall information
 */
function analyzeDepthMap(depthData, width, height) {
  // Sample center region of depth map
  const centerSize = width / 4;
  const centerStart = (width - centerSize) / 2;

  let centerDepthSum = 0;
  let centerPixels = 0;
  let minDepth = Infinity;
  let maxDepth = -Infinity;

  for (let y = centerStart; y < centerStart + centerSize; y++) {
    for (let x = centerStart; x < centerStart + centerSize; x++) {
      const idx = y * width + x;
      const depth = depthData[idx];

      centerDepthSum += depth;
      centerPixels++;
      minDepth = Math.min(minDepth, depth);
      maxDepth = Math.max(maxDepth, depth);
    }
  }

  const avgCenterDepth = centerDepthSum / centerPixels;
  const depthRange = maxDepth - minDepth;

  // MiDaS outputs relative inverse depth (higher = closer)
  // Convert to approximate distance (this is a rough calibration)
  // Typical MiDaS output range: 0-1 normalized
  const normalizedDepth = (avgCenterDepth - minDepth) / (depthRange || 1);

  // Map to real-world distance (rough approximation)
  // Closer (high depth value) = 0.5m, Far (low depth value) = 4m
  const estimatedDistance = 0.5 + (1 - normalizedDepth) * 3.5;

  // Check if center region is relatively uniform (indicates flat wall)
  let variance = 0;
  for (let y = centerStart; y < centerStart + centerSize; y++) {
    for (let x = centerStart; x < centerStart + centerSize; x++) {
      const idx = y * width + x;
      const diff = depthData[idx] - avgCenterDepth;
      variance += diff * diff;
    }
  }
  variance /= centerPixels;

  const isUniform = variance < 0.01; // Low variance = flat surface

  return {
    success: true,
    wallDistance: estimatedDistance,
    wallDetected: isUniform,
    confidence: isUniform ? 0.85 : 0.5,
    depthVariance: variance,
    method: 'ml'
  };
}

/**
 * Calculate poster scale based on wall distance and poster size
 * The poster mesh is created with real-world dimensions (in meters),
 * so scale = 1.0 means the poster appears at its actual size in the 3D scene.
 *
 * However, Three.js perspective already handles the apparent size based on distance,
 * so we only need to adjust the scale if we want to compensate for depth estimation
 * inaccuracies or for specific visual effects.
 *
 * This function returns a scale that makes the poster appear reasonably sized
 * relative to typical viewing conditions.
 *
 * @param {number} wallDistance - Distance to wall in meters
 * @param {string} posterSize - 'A1', 'A2', or 'A3'
 * @param {number} cameraFov - Camera field of view in degrees
 * @returns {number} Scale factor for poster (1.0 = actual size)
 */
export function calculatePosterScale(wallDistance, posterSize, cameraFov = 75) {
  // The poster mesh is already sized in real-world meters (PlaneGeometry(widthM, heightM)).
  // Three.js perspective projection naturally renders the correct apparent size
  // for an object at a given distance — no manual scale correction needed.
  //
  // Scale 1.0 = real-world size. If the poster is an A2 (0.42m × 0.594m) placed
  // 1.5m away, Three.js will render it at the correct angular size automatically.
  //
  // We only clamp to prevent degenerate values from bad depth estimates.
  return 1.0;
}

/**
 * Get depth map as visual data (for debugging)
 */
export function getDepthMapVisual(source) {
  if (!inputCtx) return null;

  inputCtx.drawImage(source, 0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);

  const result = estimateDepthFallback(inputCanvas);

  // Create a visual representation
  const imageData = inputCtx.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);

  // Convert to grayscale edge-based visualization
  return {
    canvas: inputCanvas,
    result: result
  };
}

/**
 * Check if depth estimation is ready
 */
export function isReady() {
  return isModelReady;
}

/**
 * Check if ML model is available (vs fallback)
 */
export function hasMLModel() {
  return depthModel !== null;
}

/**
 * Dispose of resources
 */
export function dispose() {
  if (depthModel && typeof depthModel.dispose === 'function') {
    depthModel.dispose();
  }
  depthModel = null;
  isModelReady = false;
  depthCanvas = null;
  depthCtx = null;
  inputCanvas = null;
  inputCtx = null;
  // Reset tracking state
  trackingState = null;
  previousFrame = null;
}

// ============ OPTICAL FLOW TRACKING SYSTEM ============
// Tracks visual features to properly anchor poster to wall

// Tracking state
let trackingState = null;
let previousFrame = null;
const TRACKING_SIZE = 128; // Lower res for faster tracking
const FEATURE_COUNT = 25; // Number of features to track
const SEARCH_WINDOW = 15; // Search window for optical flow
const MIN_FEATURES = 8; // Minimum features needed for valid tracking

// Create tracking canvas
let trackingCanvas = null;
let trackingCtx = null;

/**
 * Initialize tracking for a new poster placement
 * Captures reference features around the placement point
 * @param {HTMLVideoElement|HTMLImageElement} source - Video/image source
 * @param {number} centerX - Normalized placement X (0-1)
 * @param {number} centerY - Normalized placement Y (0-1)
 */
export function initTracking(source, centerX, centerY) {
  if (!trackingCanvas) {
    trackingCanvas = document.createElement('canvas');
    trackingCanvas.width = TRACKING_SIZE;
    trackingCanvas.height = TRACKING_SIZE;
    trackingCtx = trackingCanvas.getContext('2d', { willReadFrequently: true });
  }

  // Capture the reference frame
  trackingCtx.drawImage(source, 0, 0, TRACKING_SIZE, TRACKING_SIZE);
  const frameData = trackingCtx.getImageData(0, 0, TRACKING_SIZE, TRACKING_SIZE);
  const grayFrame = toGrayscale(frameData);

  // Detect features around the placement area
  const features = detectGoodFeatures(grayFrame, TRACKING_SIZE, TRACKING_SIZE, centerX, centerY);

  if (features.length < MIN_FEATURES) {
    console.warn('[Depth] Not enough features detected for tracking:', features.length);
  }

  // Store tracking state
  trackingState = {
    referenceFeatures: features,
    currentFeatures: features.slice(),
    centerX: centerX,
    centerY: centerY,
    lastTransform: { tx: 0, ty: 0, rotation: 0, scale: 1 },
    frameCount: 0,
    lostFeatures: 0
  };

  previousFrame = grayFrame;

  console.log('[Depth] Tracking initialized with', features.length, 'features at', centerX.toFixed(2), centerY.toFixed(2));

  return { success: true, featureCount: features.length };
}

/**
 * Update tracking with a new video frame
 * Returns the estimated transform since placement
 * @param {HTMLVideoElement|HTMLImageElement} source - Video/image source
 */
export function updateTracking(source) {
  if (!trackingState || !previousFrame) {
    return { success: false, error: 'Tracking not initialized' };
  }

  // Capture current frame
  trackingCtx.drawImage(source, 0, 0, TRACKING_SIZE, TRACKING_SIZE);
  const frameData = trackingCtx.getImageData(0, 0, TRACKING_SIZE, TRACKING_SIZE);
  const currentFrame = toGrayscale(frameData);

  // Track features using Lucas-Kanade optical flow
  const trackedFeatures = [];
  const originalFeatures = [];

  for (let i = 0; i < trackingState.currentFeatures.length; i++) {
    const feature = trackingState.currentFeatures[i];
    const newPos = trackFeatureLK(previousFrame, currentFrame, feature, TRACKING_SIZE, TRACKING_SIZE);

    if (newPos && isFeatureValid(newPos, TRACKING_SIZE, TRACKING_SIZE)) {
      trackedFeatures.push(newPos);
      originalFeatures.push(trackingState.referenceFeatures[i] || feature);
    }
  }

  trackingState.frameCount++;

  // Check if we have enough features
  if (trackedFeatures.length < MIN_FEATURES) {
    trackingState.lostFeatures++;

    // If we've lost tracking for too many frames, try to re-detect
    if (trackingState.lostFeatures > 10) {
      console.log('[Depth] Re-detecting features due to tracking loss');
      const newFeatures = detectGoodFeatures(currentFrame, TRACKING_SIZE, TRACKING_SIZE,
        trackingState.centerX, trackingState.centerY);

      if (newFeatures.length >= MIN_FEATURES) {
        trackingState.currentFeatures = newFeatures;
        trackingState.referenceFeatures = newFeatures.slice();
        trackingState.lostFeatures = 0;
      }
    }

    previousFrame = currentFrame;
    return {
      success: false,
      error: 'Insufficient features tracked',
      featureCount: trackedFeatures.length,
      transform: trackingState.lastTransform
    };
  }

  trackingState.lostFeatures = 0;
  trackingState.currentFeatures = trackedFeatures;

  // Calculate transform from feature displacement
  const transform = calculateTransformFromFeatures(originalFeatures, trackedFeatures, TRACKING_SIZE);

  // Apply smoothing to reduce jitter
  const smooth = 0.3;
  trackingState.lastTransform = {
    tx: trackingState.lastTransform.tx * (1 - smooth) + transform.tx * smooth,
    ty: trackingState.lastTransform.ty * (1 - smooth) + transform.ty * smooth,
    rotation: trackingState.lastTransform.rotation * (1 - smooth) + transform.rotation * smooth,
    scale: trackingState.lastTransform.scale * (1 - smooth) + transform.scale * smooth
  };

  previousFrame = currentFrame;

  return {
    success: true,
    featureCount: trackedFeatures.length,
    transform: trackingState.lastTransform,
    // Convert to normalized screen coordinates
    offsetX: trackingState.lastTransform.tx / TRACKING_SIZE,
    offsetY: trackingState.lastTransform.ty / TRACKING_SIZE,
    rotation: trackingState.lastTransform.rotation,
    scale: trackingState.lastTransform.scale
  };
}

/**
 * Check if tracking is active
 */
export function isTrackingActive() {
  return trackingState !== null && previousFrame !== null;
}

/**
 * Reset tracking state
 */
export function resetTracking() {
  trackingState = null;
  previousFrame = null;
}

/**
 * Convert RGBA image data to grayscale array
 */
function toGrayscale(imageData) {
  const data = imageData.data;
  const gray = new Float32Array(imageData.width * imageData.height);

  for (let i = 0; i < gray.length; i++) {
    const idx = i * 4;
    gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
  }

  return gray;
}

/**
 * Detect good features to track using Harris corner detector
 * Focuses on the area around the placement point
 */
function detectGoodFeatures(grayFrame, width, height, centerX, centerY) {
  const features = [];
  const cornerResponse = new Float32Array(width * height);

  // Calculate Harris corner response
  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      // Calculate gradients in 3x3 window
      let Ixx = 0, Iyy = 0, Ixy = 0;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const idx = (y + dy) * width + (x + dx);
          const idxR = (y + dy) * width + (x + dx + 1);
          const idxD = (y + dy + 1) * width + (x + dx);

          const Ix = (idxR < grayFrame.length) ? grayFrame[idxR] - grayFrame[idx] : 0;
          const Iy = (idxD < grayFrame.length) ? grayFrame[idxD] - grayFrame[idx] : 0;

          Ixx += Ix * Ix;
          Iyy += Iy * Iy;
          Ixy += Ix * Iy;
        }
      }

      // Harris corner response: det(M) - k * trace(M)^2
      const det = Ixx * Iyy - Ixy * Ixy;
      const trace = Ixx + Iyy;
      const k = 0.04;
      cornerResponse[y * width + x] = det - k * trace * trace;
    }
  }

  // Find local maxima around the center point
  const cx = Math.floor(centerX * width);
  const cy = Math.floor(centerY * height);
  const searchRadius = Math.floor(Math.min(width, height) * 0.4);

  const candidates = [];

  for (let y = Math.max(3, cy - searchRadius); y < Math.min(height - 3, cy + searchRadius); y++) {
    for (let x = Math.max(3, cx - searchRadius); x < Math.min(width - 3, cx + searchRadius); x++) {
      const response = cornerResponse[y * width + x];

      // Check if local maximum
      if (response > 100) {
        let isMax = true;
        for (let dy = -2; dy <= 2 && isMax; dy++) {
          for (let dx = -2; dx <= 2 && isMax; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (cornerResponse[(y + dy) * width + (x + dx)] >= response) {
              isMax = false;
            }
          }
        }

        if (isMax) {
          // Weight by distance from center (prefer central features)
          const distFromCenter = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
          const weight = 1 - (distFromCenter / searchRadius) * 0.5;
          candidates.push({ x, y, response: response * weight });
        }
      }
    }
  }

  // Sort by response and take top features
  candidates.sort((a, b) => b.response - a.response);

  // Take features with minimum spacing
  const minSpacing = 8;
  for (const candidate of candidates) {
    if (features.length >= FEATURE_COUNT) break;

    // Check spacing from existing features
    let tooClose = false;
    for (const f of features) {
      const dist = Math.sqrt((f.x - candidate.x) ** 2 + (f.y - candidate.y) ** 2);
      if (dist < minSpacing) {
        tooClose = true;
        break;
      }
    }

    if (!tooClose) {
      features.push({ x: candidate.x, y: candidate.y });
    }
  }

  return features;
}

/**
 * Track a single feature using Lucas-Kanade optical flow
 */
function trackFeatureLK(prevFrame, currFrame, feature, width, height) {
  const px = Math.round(feature.x);
  const py = Math.round(feature.y);

  // Skip if too close to edge
  if (px < SEARCH_WINDOW || px >= width - SEARCH_WINDOW ||
      py < SEARCH_WINDOW || py >= height - SEARCH_WINDOW) {
    return null;
  }

  // Build the gradient matrices for Lucas-Kanade
  let sumIxx = 0, sumIyy = 0, sumIxy = 0;
  let sumIxIt = 0, sumIyIt = 0;

  const windowSize = 5;

  for (let dy = -windowSize; dy <= windowSize; dy++) {
    for (let dx = -windowSize; dx <= windowSize; dx++) {
      const x = px + dx;
      const y = py + dy;
      const idx = y * width + x;

      // Spatial gradients (from previous frame)
      const Ix = (prevFrame[idx + 1] || 0) - (prevFrame[idx - 1] || 0);
      const Iy = (prevFrame[idx + width] || 0) - (prevFrame[idx - width] || 0);

      // Temporal gradient
      const It = (currFrame[idx] || 0) - (prevFrame[idx] || 0);

      sumIxx += Ix * Ix;
      sumIyy += Iy * Iy;
      sumIxy += Ix * Iy;
      sumIxIt += Ix * It;
      sumIyIt += Iy * It;
    }
  }

  // Solve the 2x2 system: [Ixx Ixy; Ixy Iyy] * [vx; vy] = -[IxIt; IyIt]
  const det = sumIxx * sumIyy - sumIxy * sumIxy;

  if (Math.abs(det) < 0.001) {
    // Singular matrix - can't track this feature
    return null;
  }

  const vx = -(sumIyy * sumIxIt - sumIxy * sumIyIt) / det;
  const vy = -(sumIxx * sumIyIt - sumIxy * sumIxIt) / det;

  // Limit maximum displacement
  const maxDisp = SEARCH_WINDOW;
  if (Math.abs(vx) > maxDisp || Math.abs(vy) > maxDisp) {
    return null;
  }

  return { x: feature.x + vx, y: feature.y + vy };
}

/**
 * Check if a feature position is valid
 */
function isFeatureValid(feature, width, height) {
  const margin = 5;
  return feature.x >= margin && feature.x < width - margin &&
         feature.y >= margin && feature.y < height - margin;
}

/**
 * Calculate transform (translation, rotation, scale) from matched feature pairs
 * Uses a simplified rigid transform estimation
 */
function calculateTransformFromFeatures(originalFeatures, trackedFeatures, frameSize) {
  const n = Math.min(originalFeatures.length, trackedFeatures.length);
  if (n < 2) {
    return { tx: 0, ty: 0, rotation: 0, scale: 1 };
  }

  // Calculate centroids
  let origCx = 0, origCy = 0, trackCx = 0, trackCy = 0;
  for (let i = 0; i < n; i++) {
    origCx += originalFeatures[i].x;
    origCy += originalFeatures[i].y;
    trackCx += trackedFeatures[i].x;
    trackCy += trackedFeatures[i].y;
  }
  origCx /= n; origCy /= n;
  trackCx /= n; trackCy /= n;

  // Translation
  const tx = trackCx - origCx;
  const ty = trackCy - origCy;

  // Calculate scale and rotation using the Procrustes method
  let sumOrigDist = 0, sumTrackDist = 0;
  let sumCross = 0, sumDot = 0;

  for (let i = 0; i < n; i++) {
    const ox = originalFeatures[i].x - origCx;
    const oy = originalFeatures[i].y - origCy;
    const nx = trackedFeatures[i].x - trackCx;
    const ny = trackedFeatures[i].y - trackCy;

    sumOrigDist += Math.sqrt(ox * ox + oy * oy);
    sumTrackDist += Math.sqrt(nx * nx + ny * ny);

    // For rotation calculation
    sumDot += ox * nx + oy * ny;
    sumCross += ox * ny - oy * nx;
  }

  // Scale
  const scale = sumOrigDist > 0 ? sumTrackDist / sumOrigDist : 1;

  // Rotation (in radians)
  const rotation = Math.atan2(sumCross, sumDot);

  return {
    tx: tx,
    ty: ty,
    rotation: rotation,
    scale: Math.max(0.5, Math.min(2.0, scale)) // Clamp scale
  };
}
