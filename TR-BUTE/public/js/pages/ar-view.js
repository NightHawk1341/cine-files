// ============================================================
// AR VIEW MODULE - WebXR + Three.js Implementation
// Proper AR with surface detection and hit testing
// Falls back to device orientation for unsupported browsers
// ============================================================

import { DataStore } from '../core/data-store.js';
import * as DepthEstimation from '../modules/depth-estimation.js';
import * as ARTracking from '../modules/ar-tracking.js';

// ============ DEPENDENCY LOADING ============

/**
 * Load external CDN scripts required for AR
 * These may not be present when navigating via SPA
 */
async function loadARDependencies() {
  const dependencies = [
    {
      name: 'THREE',
      check: () => typeof THREE !== 'undefined',
      src: 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.min.js',
      critical: true // Three.js is required for AR rendering
    },
    {
      name: 'tf',
      check: () => typeof tf !== 'undefined',
      src: 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.17.0/dist/tf.min.js',
      critical: false // TensorFlow.js is optional - AR works without depth estimation
    },
    {
      name: 'tflite',
      check: () => typeof tflite !== 'undefined',
      src: 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-tflite@0.0.1-alpha.10/dist/tf-tflite.min.js',
      critical: false // TFLite is optional, fallback depth estimation works without it
    }
  ];

  let criticalFailure = false;
  const loadedDeps = [];
  const failedDeps = [];

  for (const dep of dependencies) {
    if (dep.check()) {
      console.log(`[AR View] ${dep.name} already loaded`);
      loadedDeps.push(dep.name);
      continue;
    }

    console.log(`[AR View] Loading ${dep.name}...`);
    try {
      await loadScript(dep.src);
      // Verify the dependency actually loaded correctly
      if (dep.check()) {
        console.log(`[AR View] ${dep.name} loaded successfully`);
        loadedDeps.push(dep.name);
      } else {
        throw new Error(`${dep.name} script loaded but global not available`);
      }
    } catch (err) {
      console.warn(`[AR View] ${dep.name} failed to load:`, err.message);
      failedDeps.push(dep.name);
      if (dep.critical) {
        criticalFailure = true;
      }
    }
  }

  console.log(`[AR View] Dependency loading complete:`, {
    loaded: loadedDeps,
    failed: failedDeps
  });

  if (criticalFailure) {
    throw new Error(`Critical dependencies failed to load: ${failedDeps.join(', ')}`);
  }
}

/**
 * Load a script dynamically with timeout
 */
function loadScript(src, timeout = 15000) {
  return new Promise((resolve, reject) => {
    // Check if script is already in DOM
    if (document.querySelector(`script[src="${src}"]`)) {
      console.log('[AR View] Script already in DOM:', src);
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = src;

    // Timeout to prevent indefinite hanging
    const timeoutId = setTimeout(() => {
      script.onload = null;
      script.onerror = null;
      reject(new Error(`Script load timeout after ${timeout}ms: ${src}`));
    }, timeout);

    script.onload = () => {
      clearTimeout(timeoutId);
      resolve();
    };
    script.onerror = () => {
      clearTimeout(timeoutId);
      reject(new Error(`Script load failed: ${src}`));
    };
    document.head.appendChild(script);
  });
}

// ============ STATE ============

// Depth estimation state
let isDepthSystemReady = false;
let depthUpdateInterval = null;
const DEPTH_UPDATE_FREQUENCY = 500; // ms between depth updates

let currentProduct = null;
let currentVariantImages = [];
let isTriptych = false;
let currentSize = 'A2';
let currentFrame = 'none';
let triptychGap = 2; // cm
let allProducts = [];

// Camera state
let cameraStream = null;
let mainCameraId = null;

// Three.js state
let scene = null;
let camera = null;
let renderer = null;
let posterGroup = null;
let posterTextures = [];
let animationFrameId = null;

// WebXR state
let xrSession = null;
let xrRefSpace = null;
let xrHitTestSource = null;
let xrHitTestSourceRequested = false;
let reticle = null;
let isWebXRSupported = false;
let isWebXRActive = false;

// WebXR auto-placement state
let xrAutoPlacementEnabled = true;    // Auto-place on first stable surface
let xrStableHitCount = 0;             // Track consecutive stable hits
let xrLastHitPose = null;             // Last detected hit pose
let xrAutoPlaceThreshold = 10;        // Frames of stable hits before auto-place (~0.3s at 30fps)
let xrPlacementHintTimeout = null;    // Timeout for hiding placement hint

// AR tracking state (fallback mode)
let isPlaced = false;
let placementPosition = { x: 0, y: 0, z: -2 };
let deviceOrientation = { alpha: 0, beta: 0, gamma: 0 };
let smoothedOrientation = { alpha: 0, beta: 0, gamma: 0 }; // Low-pass filtered orientation
let orientationVelocity = { alpha: 0, beta: 0, gamma: 0 }; // For velocity-based smoothing
let lastOrientationTime = 0;
let initialOrientation = null;
let orientationSupported = false;
let hasValidOrientation = false; // Track if we've received actual device orientation data

// Tracking stabilization constants
// Higher values = more responsive but potentially jittery
// Lower values = smoother but more laggy
const ORIENTATION_SMOOTH_FACTOR = 0.5; // Responsive gyroscope tracking
const ORIENTATION_VELOCITY_DECAY = 0.7; // Velocity decay for momentum
const DEPTH_SMOOTH_FACTOR = 0.15; // Smooth depth changes
const ANGLE_SMOOTH_FACTOR = 0.2; // More responsive wall angle changes for better perspective matching
const SCALE_SMOOTH_FACTOR = 0.15; // Smooth scale changes
const JITTER_THRESHOLD = 0.5; // Ignore small orientation changes (degrees)
const POSITION_DEAD_ZONE = 0.005; // Small dead zone for responsive tracking

// Automatic perspective transform state
// The poster is placed on a virtual wall - perspective adjusts automatically
// based on wall detection and how the user is holding their device
let virtualWallDistance = 1.5;     // Distance to virtual wall in meters
let wallPlacementOrientation = null; // Device orientation when poster was placed

// Detected wall orientation from depth/edge analysis (radians)
let detectedWallAngleY = 0;  // Horizontal rotation of wall (left/right perspective)
let detectedWallAngleX = 0;  // Vertical rotation of wall (up/down perspective)
let detectedCameraRoll = 0;  // Camera tilt - counter-rotate poster to keep it vertical
let wallOrientationConfidence = 0;

// Smoothed target values from depth estimation (raw values before smoothing)
let targetWallAngleY = 0;
let targetWallAngleX = 0;
let targetCameraRoll = 0;
let targetWallConfidence = 0;

// Smoothed position offset for world-anchored tracking
let smoothedOffsetX = 0;
let smoothedOffsetY = 0;

// Wall plane detection (lines, corners, vanishing point)
let detectedWallPlane = null;

// Environment lighting
let ambientLight = null;
let directionalLight = null;
let environmentBrightness = 0.5;

// Source mode: 'camera', 'image', or 'webxr'
let sourceMode = null;

// Interaction state
let isDragging = false;
let hasDragged = false; // Track if actual drag movement occurred
let dragStart = { x: 0, y: 0 };
let initialPinchDistance = 0;
let pinchStartScale = 1; // Scale at the start of pinch gesture
let posterScale = 1;

// Controls collapsed state
let isControlsCollapsed = true;

// Corner placement mode state
let isCornerModeActive = false;
let cornerPoints = []; // Array of {x, y, normalizedX, normalizedY, anchorOrientation} for tracking
const CORNER_COUNT = 4;

// Initialization guard
let isInitialized = false;

// Event listener references for cleanup
let eventListeners = [];

// Size definitions in cm (width x height for portrait)
const SIZE_DEFINITIONS = {
  'A3': { width: 29.7, height: 42.0 },
  'A2': { width: 42.0, height: 59.4 },
  'A1': { width: 59.4, height: 84.1 }
};

// Camera FOV (typical smartphone camera - most have 70-80° FOV)
const CAMERA_FOV = 75;
const ESTIMATED_WALL_DISTANCE = 1.5; // meters

// Camera permission storage key
const CAMERA_PERMISSION_KEY = 'ar-camera-permission-granted';

// ============ WEBXR DETECTION ============

async function checkWebXRSupport() {
  if (!navigator.xr) {
    console.log('[AR View] WebXR not available');
    return false;
  }

  try {
    // Check for immersive-ar with hit-test support
    const supported = await navigator.xr.isSessionSupported('immersive-ar');
    if (supported) {
      console.log('[AR View] WebXR immersive-ar supported');
      isWebXRSupported = true;
      return true;
    }
  } catch (e) {
    console.log('[AR View] WebXR check failed:', e);
  }

  return false;
}

// ============ THREE.JS INITIALIZATION ============

function initThreeJS(forWebXR = false) {
  console.log('[AR View] initThreeJS called, forWebXR:', forWebXR);

  const canvas = document.getElementById('ar-three-canvas');
  if (!canvas) {
    console.error('[AR View] Canvas element not found');
    return false;
  }

  try {
    // Check WebGL support
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) {
      console.error('[AR View] WebGL not supported');
      return false;
    }

    // Create scene
    scene = new THREE.Scene();

    if (forWebXR) {
      // For WebXR, camera is managed by the XR system
      camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
    } else {
      // For fallback mode, create our own camera
      const aspect = window.innerWidth / window.innerHeight;
      camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, 0.1, 100);
      camera.position.set(0, 0, 0);
    }

    // Create renderer
    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    if (forWebXR) {
      renderer.xr.enabled = true;
    }

    // Create poster group
    posterGroup = new THREE.Group();
    posterGroup.visible = false; // Hidden until placed
    scene.add(posterGroup);

    // Setup lighting
    setupLighting();

    // Create reticle for WebXR
    if (forWebXR) {
      createReticle();
    }

    // Handle resize
    window.addEventListener('resize', handleResize);

    console.log('[AR View] Three.js initialized successfully', forWebXR ? '(WebXR mode)' : '(fallback mode)');
    return true;
  } catch (error) {
    console.error('[AR View] Three.js initialization failed:', error);
    return false;
  }
}

function createReticle() {
  // Create a ring reticle to show where surfaces are detected
  const ringGeometry = new THREE.RingGeometry(0.1, 0.12, 32);
  ringGeometry.rotateX(-Math.PI / 2); // Lay flat

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide
  });

  reticle = new THREE.Mesh(ringGeometry, ringMaterial);
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // Add crosshair lines
  const lineGeometry = new THREE.BufferGeometry();
  const linePositions = new Float32Array([
    -0.15, 0, 0,
    0.15, 0, 0,
    0, 0, -0.15,
    0, 0, 0.15
  ]);
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));

  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0x00ff00,
    transparent: true,
    opacity: 0.6
  });

  const crosshair = new THREE.LineSegments(lineGeometry, lineMaterial);
  reticle.add(crosshair);
}

// Additional lights for better 3D effect
let fillLight = null;
let rimLight = null;

function setupLighting() {
  // Ambient light - provides base illumination
  ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambientLight);

  // Main directional light (simulates room light from above-front)
  directionalLight = new THREE.DirectionalLight(0xffffff, 0.7);
  directionalLight.position.set(1, 2, 3);
  scene.add(directionalLight);

  // Fill light (softer, from the side)
  fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
  fillLight.position.set(-2, 0, 2);
  scene.add(fillLight);

  // Rim light (from behind, creates edge highlight on frame)
  rimLight = new THREE.DirectionalLight(0xffffff, 0.15);
  rimLight.position.set(0, 1, -2);
  scene.add(rimLight);

  // Hemisphere light for more natural ambient
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
  hemiLight.position.set(0, 20, 0);
  scene.add(hemiLight);

  // Create simple environment map for metallic reflections
  createEnvironmentMap();
}

// Create a simple procedural environment map for reflections
function createEnvironmentMap() {
  if (!renderer) return;

  // Create a simple gradient environment using a small render target
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  // Create a simple scene with gradient lighting for reflections
  const envScene = new THREE.Scene();

  // Gradient background - simulates room lighting
  const gradientCanvas = document.createElement('canvas');
  gradientCanvas.width = 256;
  gradientCanvas.height = 256;
  const ctx = gradientCanvas.getContext('2d');

  // Create radial gradient (bright center fading to dark edges)
  const gradient = ctx.createRadialGradient(128, 100, 0, 128, 128, 200);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.3, '#aabbcc');
  gradient.addColorStop(0.7, '#445566');
  gradient.addColorStop(1, '#1a1a2e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);

  const envTexture = new THREE.CanvasTexture(gradientCanvas);
  envTexture.mapping = THREE.EquirectangularReflectionMapping;

  // Set scene environment for PBR materials
  scene.environment = pmremGenerator.fromEquirectangular(envTexture).texture;

  envTexture.dispose();
  pmremGenerator.dispose();
}

// ============ DEPTH ESTIMATION INTEGRATION ============

/**
 * Initialize the depth estimation system for wall detection
 */
async function initDepthSystem() {
  console.log('[AR View] Initializing depth estimation system...');

  const loadingOverlay = document.getElementById('ar-depth-loading');
  const loadingText = document.getElementById('ar-depth-loading-text');
  const loadingBar = document.getElementById('ar-depth-loading-bar');
  const loadingPercent = document.getElementById('ar-depth-loading-percent');

  // Only show loading UI for camera mode (not image upload)
  // For images, we load depth in background without blocking UI
  if (loadingOverlay && sourceMode === 'camera') {
    loadingOverlay.style.display = 'flex';
  } else if (loadingOverlay) {
    loadingOverlay.style.display = 'none';
  }

  try {
    await DepthEstimation.initDepthEstimation({
      onProgress: (percent, message) => {
        console.log(`[AR View] Depth model: ${percent}% - ${message}`);
        if (loadingText) loadingText.textContent = message;
        if (loadingBar) loadingBar.style.width = `${percent}%`;
        if (loadingPercent) loadingPercent.textContent = `${Math.round(percent)}%`;
      },
      onComplete: (hasMLModel) => {
        console.log('[AR View] Depth system ready, ML model:', hasMLModel);
        isDepthSystemReady = true;
        // Hide loading UI after a short delay
        setTimeout(() => {
          if (loadingOverlay) {
            loadingOverlay.style.opacity = '0';
            setTimeout(() => {
              loadingOverlay.style.display = 'none';
              loadingOverlay.style.opacity = '1';
            }, 300);
          }
        }, 500);
      },
      onError: (error) => {
        console.warn('[AR View] Depth system error (using fallback):', error.message);
        isDepthSystemReady = true; // Still ready with fallback
        if (loadingOverlay) {
          loadingOverlay.style.display = 'none';
        }
      }
    });
  } catch (error) {
    console.warn('[AR View] Failed to init depth system:', error);
    isDepthSystemReady = true; // Fall back to basic mode
    if (loadingOverlay) {
      loadingOverlay.style.display = 'none';
    }
  }
}

// Target values for smooth interpolation
let targetWallDistance = 1.5;
let targetPosterScale = 1.0;

/**
 * Start continuous depth estimation from camera feed
 */
function startDepthTracking() {
  if (depthUpdateInterval) return;

  console.log('[AR View] Starting depth tracking');

  depthUpdateInterval = setInterval(() => {
    if (!isDepthSystemReady) return;
    // Run depth estimation BEFORE and after placement
    // Before: to get accurate distance for poster scale
    // After: to track wall angles (though distance is locked)

    const video = document.getElementById('ar-camera-video');
    if (!video || video.readyState < 2) return;

    try {
      const depthResult = DepthEstimation.estimateDepth(video);

      if (depthResult.success) {
        // Set target distance (will be smoothed in render loop)
        targetWallDistance = Math.max(0.5, Math.min(4.0, depthResult.wallDistance));

        // IMPORTANT: Also update virtualWallDistance for camera mode
        // This ensures proper scale when poster is placed
        if (!isPlaced) {
          virtualWallDistance = targetWallDistance;
        }

        // Calculate target scale based on depth and size
        targetPosterScale = DepthEstimation.calculatePosterScale(
          targetWallDistance,
          currentSize,
          CAMERA_FOV
        );

        // Store raw target wall angles (smoothing happens in render loop)
        if (depthResult.wallAngleY !== undefined) {
          targetWallAngleY = depthResult.wallAngleY;
          targetWallAngleX = depthResult.wallAngleX || 0;
          // Ensure minimum confidence when wall is detected for visible effect
          const minConfidence = depthResult.wallDetected ? 0.6 : 0.3;
          targetWallConfidence = Math.max(minConfidence, depthResult.orientationConfidence || 0);

          // Compute wall corners for perspective transformation
          // Only update when confidence is reasonable
          if (targetWallConfidence > 0.2) {
            const wallCorners = DepthEstimation.computeWallCorners(
              targetWallAngleY,
              targetWallAngleX,
              0.15 // 15% margin from edges
            );
            ARTracking.setWallCorners(wallCorners);
          }
        }

        // Log occasionally for debugging
        if (Math.random() < 0.05) {
          console.log(`[AR View] Depth: ${targetWallDistance.toFixed(2)}m, Scale: ${targetPosterScale.toFixed(3)}, ` +
            `WallAngle: Y=${(detectedWallAngleY * 180 / Math.PI).toFixed(1)}° X=${(detectedWallAngleX * 180 / Math.PI).toFixed(1)}°, ` +
            `Conf: ${(wallOrientationConfidence * 100).toFixed(0)}%`);
        }
      }
    } catch (error) {
      console.warn('[AR View] Depth update error:', error.message);
    }
  }, DEPTH_UPDATE_FREQUENCY);
}

/**
 * Smoothly interpolate ALL tracking values in render loop
 * Called every frame for smooth animation
 * Uses unified smoothing factors to prevent phase mismatch and wobbling
 */
function smoothDepthValues() {
  // Smooth distance with consistent factor (only before placement)
  if (!isPlaced) {
    const distanceDiff = targetWallDistance - virtualWallDistance;
    if (Math.abs(distanceDiff) > 0.001) {
      virtualWallDistance += distanceDiff * DEPTH_SMOOTH_FACTOR;
    }

    // Smooth scale only before placement
    const scaleDiff = targetPosterScale - posterScale;
    if (Math.abs(scaleDiff) > 0.001) {
      posterScale += scaleDiff * SCALE_SMOOTH_FACTOR;
    }
  }
  // After placement: use anchored values (set in captureWallPlacementOrientation)

  // Smooth wall angles with same factor to prevent phase mismatch
  const angleYDiff = targetWallAngleY - detectedWallAngleY;
  const angleXDiff = targetWallAngleX - detectedWallAngleX;
  const rollDiff = targetCameraRoll - detectedCameraRoll;
  if (Math.abs(angleYDiff) > 0.001) {
    detectedWallAngleY += angleYDiff * ANGLE_SMOOTH_FACTOR;
  }
  if (Math.abs(angleXDiff) > 0.001) {
    detectedWallAngleX += angleXDiff * ANGLE_SMOOTH_FACTOR;
  }
  if (Math.abs(rollDiff) > 0.001) {
    detectedCameraRoll += rollDiff * ANGLE_SMOOTH_FACTOR;
  }

  // Smooth wall confidence
  const confDiff = targetWallConfidence - wallOrientationConfidence;
  if (Math.abs(confDiff) > 0.01) {
    wallOrientationConfidence += confDiff * ANGLE_SMOOTH_FACTOR;
  }
}

/**
 * Apply low-pass filter to device orientation.
 * Simple EMA (exponential moving average) — no velocity/momentum to prevent overshoot.
 * Higher ORIENTATION_SMOOTH_FACTOR = more responsive; lower = smoother but laggier.
 */
function smoothDeviceOrientation() {
  lastOrientationTime = performance.now();

  // Alpha: handle 0–360 wraparound
  let alphaDiff = deviceOrientation.alpha - smoothedOrientation.alpha;
  if (alphaDiff > 180) alphaDiff -= 360;
  if (alphaDiff < -180) alphaDiff += 360;

  const betaDiff = deviceOrientation.beta - smoothedOrientation.beta;
  const gammaDiff = deviceOrientation.gamma - smoothedOrientation.gamma;

  // Simple EMA — moves toward raw value each frame with no momentum
  smoothedOrientation.alpha += alphaDiff * ORIENTATION_SMOOTH_FACTOR;
  smoothedOrientation.beta += betaDiff * ORIENTATION_SMOOTH_FACTOR;
  smoothedOrientation.gamma += gammaDiff * ORIENTATION_SMOOTH_FACTOR;

  // Normalize alpha to 0-360
  if (smoothedOrientation.alpha < 0) smoothedOrientation.alpha += 360;
  if (smoothedOrientation.alpha >= 360) smoothedOrientation.alpha -= 360;
}

/**
 * Stop depth tracking
 */
function stopDepthTracking() {
  if (depthUpdateInterval) {
    clearInterval(depthUpdateInterval);
    depthUpdateInterval = null;
    console.log('[AR View] Depth tracking stopped');
  }
}

/**
 * One-time depth estimation from a static image
 */
function estimateDepthFromImage(imageElement) {
  console.log('[AR View] estimateDepthFromImage called, isDepthSystemReady:', isDepthSystemReady);
  if (!isDepthSystemReady) {
    console.log('[AR View] Depth system not ready for image estimation');
    return;
  }

  try {
    const depthResult = DepthEstimation.estimateDepth(imageElement);
    console.log('[AR View] Depth estimation result:', depthResult);

    if (depthResult.success) {
      virtualWallDistance = depthResult.wallDistance;
      virtualWallDistance = Math.max(0.5, Math.min(4.0, virtualWallDistance));

      // Calculate initial poster scale based on detected depth
      const newScale = DepthEstimation.calculatePosterScale(
        virtualWallDistance,
        currentSize,
        CAMERA_FOV
      );
      console.log('[AR View] Calculated scale:', newScale, 'for distance:', virtualWallDistance);
      posterScale = newScale;

      // For image mode: also update anchored values since poster is already placed
      // This ensures the scale from depth estimation is actually used
      if (sourceMode === 'image' && isPlaced) {
        anchoredPosterScale = newScale;
        anchoredWallDistance = virtualWallDistance;
      }

      // Capture wall orientation from the image
      if (depthResult.wallAngleY !== undefined) {
        detectedWallAngleY = depthResult.wallAngleY;
        detectedWallAngleX = depthResult.wallAngleX || 0;
        wallOrientationConfidence = depthResult.orientationConfidence || 0.5;
      }

      // Run enhanced wall plane detection (lines, corners, vanishing points)
      try {
        detectedWallPlane = DepthEstimation.estimateWallPlane(imageElement);
        console.log('[AR View] Wall plane detected:', detectedWallPlane);

        // Use enhanced detection if confidence is higher
        if (detectedWallPlane.confidence > wallOrientationConfidence) {
          detectedWallAngleY = detectedWallPlane.wallAngleY;
          detectedWallAngleX = detectedWallPlane.wallAngleX;
          wallOrientationConfidence = detectedWallPlane.confidence;
        }

        // Capture camera roll (from vertical line tilt)
        if (detectedWallPlane.cameraRoll !== undefined) {
          detectedCameraRoll = detectedWallPlane.cameraRoll;
          targetCameraRoll = detectedWallPlane.cameraRoll;
        }
      } catch (e) {
        console.warn('[AR View] Wall plane detection failed:', e);
      }

      console.log(`[AR View] Image depth result:
        - Distance: ${virtualWallDistance.toFixed(2)}m
        - Scale: ${posterScale.toFixed(3)}
        - WallAngle Y: ${(detectedWallAngleY * 180 / Math.PI).toFixed(1)}°
        - WallAngle X: ${(detectedWallAngleX * 180 / Math.PI).toFixed(1)}°
        - Camera Roll: ${(detectedCameraRoll * 180 / Math.PI).toFixed(1)}°
        - Confidence: ${(wallOrientationConfidence * 100).toFixed(0)}%
        - Wall detected: ${depthResult.wallDetected ? 'yes' : 'no'}
        - Lines: V=${detectedWallPlane?.lines?.vertical?.length || 0} H=${detectedWallPlane?.lines?.horizontal?.length || 0}
        - Corners: ${detectedWallPlane?.roomStructure?.corners?.length || 0}`);

      // Force immediate update - render loop will maintain these values
      if (posterGroup) {
        updatePosterPosition();
      }
    } else {
      console.warn('[AR View] Depth estimation returned no success');
    }
  } catch (error) {
    console.warn('[AR View] Image depth estimation error:', error.message);
  }
}

// ============ CAMERA-DRIVEN AR PERSPECTIVE SYSTEM ============
// Architecture:
// 1. Poster is placed at a FIXED position in 3D world space (on the wall)
// 2. The THREE.JS CAMERA moves/rotates based on device gyroscope
// 3. Three.js perspective projection automatically creates:
//    - Size changes (closer = bigger)
//    - Trapezoid distortion (off-center viewing = perspective skew)
//    - Correct parallax
// 4. Roll stabilization: camera Z-rotation cancels phone tilt → poster stays vertical
// 5. Wall angles from line detection are applied as static poster rotation (wall isn't moving)

// World-anchored poster position (where it was placed in "world space")
let anchoredWorldPosition = { x: 0.5, y: 0.5 }; // Normalized 0-1

// Locked wall distance at time of placement (prevents depth estimation from moving the poster)
let anchoredWallDistance = 1.5;

// Locked poster scale at time of placement
let anchoredPosterScale = 1.0;

// Camera state tracking (accumulated from gyro)
let cameraState = {
  panX: 0,  // Horizontal pan (radians) - from alpha delta
  panY: 0,  // Vertical pan (radians) - from beta delta
  roll: 0   // Roll/tilt (radians) - from gamma delta
};

// Environment calibration state
let isEnvironmentCalibrated = false;
let calibrationData = {
  baseGamma: 0,
  baseBeta: 90,
  baseAlpha: 0,
  detectedFOV: 75,
  wallAngleY: 0,
  wallAngleX: 0
};

// Tracking results from optical flow (legacy, kept for compatibility)
let visualTrackingResult = null;

// Offset from tracked features to user's tap point (for proper anchoring)
let trackingOffset = { x: 0, y: 0 };

// Last known good tracking position (for recovery when tracking fails)
let lastGoodTrackPosition = null;
let trackingLostFrames = 0;
const TRACKING_RECOVERY_FRAMES = 30;

/**
 * Calibrate environment before poster placement
 * Analyzes video feed to understand wall angles and camera characteristics
 */
function calibrateEnvironment() {
  if (!orientationSupported || !hasValidOrientation) {
    console.log('[AR View] Waiting for orientation data for calibration...');
    return false;
  }

  // Capture baseline orientation
  calibrationData.baseGamma = deviceOrientation.gamma ?? 0;
  calibrationData.baseBeta = deviceOrientation.beta ?? 90;
  calibrationData.baseAlpha = deviceOrientation.alpha ?? 0;

  // Get wall angle from depth estimation if available
  if (wallOrientationConfidence > 0.1) {
    calibrationData.wallAngleY = detectedWallAngleY;
    calibrationData.wallAngleX = detectedWallAngleX;
  }

  isEnvironmentCalibrated = true;
  console.log('[AR View] Environment calibrated:', calibrationData);
  return true;
}

// ============ POSTER-CENTERED AR PERSPECTIVE ============
// Architecture:
// 1. Poster is placed at a fixed world position
// 2. Camera stays at origin, looking down -Z axis (no camera rotation!)
// 3. Poster ROTATION cancels out camera/phone rotation to keep it vertical
// 4. Poster rotation also includes wall perspective angles (static)
//
// Transform order (applied to poster):
// 1. SCALE - size of poster
// 2. ROTATION Z - cancel phone roll (gamma) to keep poster vertical
// 3. ROTATION X/Y - wall perspective from line detection (static)
//
// Three.js rotation direction:
// - Positive rotZ = counter-clockwise = top of poster goes LEFT
// - Negative rotZ = clockwise = top of poster goes RIGHT
//
// When phone tilts RIGHT (+gamma):
// - Vertical objects appear to lean LEFT on screen
// - To keep poster vertical, rotate its top RIGHT → NEGATIVE rotZ

function updateAutoPerspective() {
  if (!posterGroup || !camera || isWebXRActive || !isPlaced) return;

  const distance = anchoredWallDistance || virtualWallDistance;

  // ============ 1. POSTER POSITION (fixed in world space after placement) ============
  // The poster stays where it was placed. The CAMERA rotates to track phone movement.
  // Three.js perspective projection then naturally handles:
  // - Apparent position change on screen (tracking)
  // - Perspective distortion from off-angle viewing
  // - Correct parallax
  // - Size consistency

  if (sourceMode === 'camera') {
    // Poster is placed at a fixed world position, computed at placement time.
    // anchoredWorldPosition (0-1 normalized) → world coordinates
    const vFov = camera.fov * Math.PI / 180;
    const visibleHeight = 2 * Math.tan(vFov / 2) * distance;
    const visibleWidth = visibleHeight * camera.aspect;

    const posterX = (anchoredWorldPosition.x - 0.5) * visibleWidth;
    const posterY = -(anchoredWorldPosition.y - 0.5) * visibleHeight;
    posterGroup.position.set(posterX, posterY, -distance);

  } else if (sourceMode === 'image') {
    // Image mode: fixed position from tap
    const vFov = camera.fov * Math.PI / 180;
    const visibleHeight = 2 * Math.tan(vFov / 2) * distance;
    const visibleWidth = visibleHeight * camera.aspect;

    const anchorX = placementPosition.x / window.innerWidth;
    const anchorY = placementPosition.y / window.innerHeight;
    posterGroup.position.set(
      (anchorX - 0.5) * visibleWidth,
      -(anchorY - 0.5) * visibleHeight,
      -distance
    );
  }

  // ============ 2. SCALE ============
  // The mesh is already in real-world meters (PlaneGeometry(widthM, heightM)).
  // At scale 1.0, Three.js projection renders the correct apparent size for
  // an object of that metric size at the given distance. No extra scaling needed
  // for distance — only apply user's pinch-zoom adjustment.
  posterGroup.scale.setScalar(anchoredPosterScale);

  // ============ 3. POSTER ROTATION (static wall angles only) ============
  // Wall perspective from line/edge detection — these are properties of the
  // wall surface itself and don't change when the camera moves.
  let posterRotX = 0;
  let posterRotY = 0;
  let posterRotZ = 0;

  if (wallOrientationConfidence > 0.1) {
    posterRotY = detectedWallAngleY * 1.0;
    posterRotX = detectedWallAngleX * 0.8;

    const maxPerspective = Math.PI / 3;
    posterRotY = Math.max(-maxPerspective, Math.min(maxPerspective, posterRotY));
    posterRotX = Math.max(-maxPerspective * 0.5, Math.min(maxPerspective * 0.5, posterRotX));
  }

  // Image mode: apply detected camera roll from vertical lines
  if (sourceMode === 'image' && detectedCameraRoll) {
    posterRotZ = -detectedCameraRoll;
    const maxImageRoll = Math.PI / 6;
    posterRotZ = Math.max(-maxImageRoll, Math.min(maxImageRoll, posterRotZ));
  }

  posterGroup.rotation.set(posterRotX, posterRotY, posterRotZ);

  // ============ 4. CAMERA ROTATION (tracks phone orientation) ============
  // Camera rotates based on gyroscope deltas from the placement anchor.
  // This is the key: rotating the camera instead of moving the poster gives us
  // correct perspective, parallax, and tracking for free via Three.js projection.
  if (sourceMode === 'camera' && orientationSupported && wallPlacementOrientation && hasValidOrientation) {
    const anchorAlpha = wallPlacementOrientation.alpha ?? 0;
    const anchorBeta = wallPlacementOrientation.beta ?? 90;
    const anchorGamma = wallPlacementOrientation.gamma ?? 0;

    const currentAlpha = smoothedOrientation.alpha ?? 0;
    const currentBeta = smoothedOrientation.beta ?? 90;
    const currentGamma = smoothedOrientation.gamma ?? 0;

    // Alpha delta (yaw) — handle 0–360 wraparound
    let deltaAlpha = currentAlpha - anchorAlpha;
    if (deltaAlpha > 180) deltaAlpha -= 360;
    if (deltaAlpha < -180) deltaAlpha += 360;

    // Beta delta (pitch)
    const deltaBeta = currentBeta - anchorBeta;

    // Gamma delta (roll)
    const deltaGamma = currentGamma - anchorGamma;

    // Convert to radians
    const yawRad = deltaAlpha * Math.PI / 180;
    const pitchRad = deltaBeta * Math.PI / 180;
    const rollRad = deltaGamma * Math.PI / 180;

    // Apply camera rotation using YXZ order (standard for FPS/device orientation):
    // Y (yaw) first, then X (pitch), then Z (roll).
    // Signs: phone yaws right (+alpha) → camera looks right → positive Y rotation
    //        phone tilts up (+beta)    → camera looks up    → negative X rotation
    //        phone rolls right (+gamma) → camera rolls right → positive Z rotation
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yawRad;
    camera.rotation.x = -pitchRad;
    camera.rotation.z = rollRad;
  } else {
    // No orientation data — camera stays at default
    camera.rotation.set(0, 0, 0);
  }

  // Camera stays at origin (user's eye position)
  camera.position.set(0, 0, 0);

  // Keep light direction fixed relative to camera (attached to camera space)
  if (directionalLight) {
    directionalLight.position.set(1, 2, 3);
  }

  // Debug logging (sparse)
  if (Math.random() < 0.01) {
    const camRot = camera.rotation;
    console.log('[AR View] Camera rot:',
      (camRot.y * 180 / Math.PI).toFixed(1) + '° yaw,',
      (camRot.x * 180 / Math.PI).toFixed(1) + '° pitch,',
      (camRot.z * 180 / Math.PI).toFixed(1) + '° roll',
      '| Poster wall:',
      (posterRotY * 180 / Math.PI).toFixed(1) + '°Y',
      '| scale:', anchoredPosterScale.toFixed(3));
  }
}

// Store orientation and position when poster is placed (anchor point in world)
function captureWallPlacementOrientation() {
  // Capture device orientation as the anchor reference
  wallPlacementOrientation = {
    alpha: deviceOrientation.alpha,
    beta: deviceOrientation.beta,
    gamma: deviceOrientation.gamma
  };

  // Initialize smoothed orientation to match current raw orientation
  // This prevents jump when starting to track
  smoothedOrientation = {
    alpha: deviceOrientation.alpha,
    beta: deviceOrientation.beta,
    gamma: deviceOrientation.gamma
  };

  // Reset all tracking state for clean placement
  orientationVelocity = { alpha: 0, beta: 0, gamma: 0 };
  smoothedOffsetX = 0;
  smoothedOffsetY = 0;
  lastOrientationTime = performance.now();
  lastGoodTrackPosition = null; // Reset tracking memory
  trackingLostFrames = 0;

  // Capture the screen position as the anchored world position (normalized 0-1)
  anchoredWorldPosition = {
    x: placementPosition.x / window.innerWidth,
    y: placementPosition.y / window.innerHeight
  };

  // Lock the wall distance at time of placement
  // This prevents depth estimation changes from moving the poster after placement
  anchoredWallDistance = virtualWallDistance;

  // Lock the poster scale at time of placement
  // This prevents scale changes when user moves closer/farther after anchoring
  anchoredPosterScale = posterScale;

  // Reset tracking offset for new placement
  trackingOffset = { x: 0, y: 0 };

  // Set anchor in ARTracking module (gyro-based)
  ARTracking.setAnchor(
    anchoredWorldPosition.x,
    anchoredWorldPosition.y,
    wallPlacementOrientation
  );

  console.log('[AR View] Poster anchored:',
    'pos:', placementPosition.x.toFixed(0) + ',' + placementPosition.y.toFixed(0),
    'norm:', anchoredWorldPosition.x.toFixed(2) + ',' + anchoredWorldPosition.y.toFixed(2),
    'DISTANCE:', anchoredWallDistance.toFixed(2) + 'm',
    'scale:', anchoredPosterScale.toFixed(3));
}

// Reset perspective to current orientation (re-anchor)
function resetAutoPerspective() {
  wallPlacementOrientation = {
    alpha: deviceOrientation.alpha,
    beta: deviceOrientation.beta,
    gamma: deviceOrientation.gamma
  };
  smoothedOrientation = {
    alpha: deviceOrientation.alpha,
    beta: deviceOrientation.beta,
    gamma: deviceOrientation.gamma
  };
  smoothedOffsetX = 0;
  smoothedOffsetY = 0;
  lastOrientationTime = performance.now();
  anchoredWallDistance = virtualWallDistance;
  // Reset camera rotation to zero (new anchor = current orientation)
  if (camera) {
    camera.rotation.set(0, 0, 0);
  }
}

function handleResize() {
  if (!camera || !renderer) return;

  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
}

function disposeThreeJS() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  if (posterGroup) {
    posterGroup.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach(m => m.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
  }

  posterTextures.forEach(texture => texture.dispose());
  posterTextures = [];

  if (renderer) {
    renderer.dispose();
    renderer = null;
  }

  scene = null;
  camera = null;
  posterGroup = null;
  reticle = null;

  // Reset WebXR auto-placement state
  xrAutoPlacementEnabled = true;
  xrStableHitCount = 0;
  xrLastHitPose = null;
}

// ============ WEBXR AR SESSION ============

async function startWebXRSession() {
  if (!isWebXRSupported) {
    console.warn('[AR View] WebXR not supported, using fallback');
    return false;
  }

  try {
    // Initialize Three.js for WebXR
    disposeThreeJS();
    if (!initThreeJS(true)) {
      return false;
    }

    // Request AR session with hit-test
    const sessionInit = {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay', 'light-estimation'],
      domOverlay: { root: document.getElementById('ar-controls-panel') }
    };

    xrSession = await navigator.xr.requestSession('immersive-ar', sessionInit);

    // Set up session
    xrSession.addEventListener('end', onXRSessionEnd);

    // Set up renderer for XR
    await renderer.xr.setSession(xrSession);

    // Get reference space
    xrRefSpace = await xrSession.requestReferenceSpace('local');

    // Set up controller for tap-to-place (and repositioning)
    const controller = renderer.xr.getController(0);
    controller.addEventListener('select', onXRSelect);
    scene.add(controller);

    sourceMode = 'webxr';
    isWebXRActive = true;
    xrHitTestSourceRequested = false;

    // Reset auto-placement state
    xrAutoPlacementEnabled = true;
    xrStableHitCount = 0;
    xrLastHitPose = null;
    isPlaced = false;

    // Render poster (hidden until placed)
    await renderPoster3D();
    if (posterGroup) {
      posterGroup.visible = false;
    }

    // Show surface detection overlay
    showSurfaceDetectionOverlay();

    // Start XR render loop
    renderer.setAnimationLoop(renderWebXR);

    // Update UI
    showARView();
    updateARModeIndicator(true);

    console.log('[AR View] WebXR session started');
    return true;
  } catch (error) {
    console.error('[AR View] Failed to start WebXR session:', error);
    // Clean up Three.js so fallback can reinitialize properly
    disposeThreeJS();
    hideSurfaceDetectionOverlay();
    isWebXRActive = false;
    return false;
  }
}

function onXRSessionEnd() {
  console.log('[AR View] WebXR session ended');
  isWebXRActive = false;
  xrSession = null;
  xrRefSpace = null;
  xrHitTestSource = null;
  xrHitTestSourceRequested = false;

  // Reset auto-placement state
  xrAutoPlacementEnabled = true;
  xrStableHitCount = 0;
  xrLastHitPose = null;

  if (reticle) {
    reticle.visible = false;
  }

  // Hide overlays
  hideSurfaceDetectionOverlay();
  hidePlacementHint();
}

function onXRSelect() {
  // Place or reposition poster at reticle position when user taps
  if (reticle && reticle.visible) {
    const wasPlaced = isPlaced; // Check before placement
    placePosterAtReticle();

    // Show hint for repositioning (only if it was already placed)
    if (wasPlaced) {
      showPlacementHint('Постер перемещён');
    } else {
      showPlacementHint();
    }
  }
}

// Place poster at current reticle position
function placePosterAtReticle() {
  if (!reticle || !posterGroup) return;

  // Get reticle world position
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  reticle.matrix.decompose(position, quaternion, scale);

  // Position poster at hit point, but facing camera
  posterGroup.position.copy(position);

  // Make poster face the camera (vertical wall placement)
  const cameraPosition = new THREE.Vector3();
  camera.getWorldPosition(cameraPosition);

  // Calculate direction from poster to camera (on XZ plane for vertical poster)
  const direction = new THREE.Vector3(
    cameraPosition.x - position.x,
    0, // Keep vertical
    cameraPosition.z - position.z
  ).normalize();

  // Create rotation to face camera
  posterGroup.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    direction
  );

  // Apply user scale
  posterGroup.scale.setScalar(posterScale);

  // Show the poster
  posterGroup.visible = true;
  isPlaced = true;

  // Disable auto-placement after first placement
  xrAutoPlacementEnabled = false;

  // Hide surface detection overlay
  hideSurfaceDetectionOverlay();

  // Haptic feedback
  if (typeof window.triggerHaptic === 'function') {
    window.triggerHaptic();
  }

  console.log('[AR View] Poster placed at:', position);
}

function renderWebXR(timestamp, frame) {
  if (!frame || !xrSession) return;

  // Request hit test source if needed
  if (!xrHitTestSourceRequested) {
    xrSession.requestReferenceSpace('viewer').then((viewerSpace) => {
      xrSession.requestHitTestSource({ space: viewerSpace }).then((source) => {
        xrHitTestSource = source;
      });
    });
    xrHitTestSourceRequested = true;
  }

  // Process hit test results
  if (xrHitTestSource) {
    const hitTestResults = frame.getHitTestResults(xrHitTestSource);

    if (hitTestResults.length > 0) {
      const hit = hitTestResults[0];
      const pose = hit.getPose(xrRefSpace);

      if (pose && reticle) {
        // Always show reticle when surface detected (for repositioning)
        reticle.visible = true;
        reticle.matrix.fromArray(pose.transform.matrix);

        // Auto-placement: detect stable surface and place poster automatically
        if (xrAutoPlacementEnabled && !isPlaced) {
          const currentPos = new THREE.Vector3();
          const currentQuat = new THREE.Quaternion();
          const currentScale = new THREE.Vector3();
          reticle.matrix.decompose(currentPos, currentQuat, currentScale);

          // Check if hit is stable (similar position to last frame)
          if (xrLastHitPose) {
            const distance = currentPos.distanceTo(xrLastHitPose);

            // If position is stable (within 5cm)
            if (distance < 0.05) {
              xrStableHitCount++;

              // Update surface detection overlay with progress
              updateSurfaceDetectionProgress(xrStableHitCount / xrAutoPlaceThreshold);

              // Auto-place after threshold of stable frames
              if (xrStableHitCount >= xrAutoPlaceThreshold) {
                console.log('[AR View] Stable surface detected, auto-placing poster');
                placePosterAtReticle();
                showPlacementHint();
              }
            } else {
              // Reset if position jumped
              xrStableHitCount = Math.max(0, xrStableHitCount - 2);
            }
          }

          xrLastHitPose = currentPos.clone();
        }
      }
    } else {
      if (reticle) {
        reticle.visible = false;
      }
      // Reset stable count when no surface detected
      xrStableHitCount = Math.max(0, xrStableHitCount - 1);
    }
  }

  // Render scene
  renderer.render(scene, camera);
}

async function stopWebXRSession() {
  if (xrSession) {
    try {
      await xrSession.end();
    } catch (e) {
      console.warn('[AR View] Error ending XR session:', e);
    }
  }
  isWebXRActive = false;
  xrSession = null;
  xrRefSpace = null;
  xrHitTestSource = null;
}

function updateARModeIndicator(isRealAR) {
  const indicator = document.getElementById('ar-mode-indicator');
  if (indicator) {
    if (isRealAR) {
      indicator.textContent = 'AR';
      indicator.classList.add('real-ar');
      indicator.classList.remove('preview-mode');
      indicator.title = 'Полноценный AR с обнаружением поверхностей - постер остаётся на месте при ходьбе';
    } else {
      indicator.textContent = 'Превью';
      indicator.classList.remove('real-ar');
      indicator.classList.add('preview-mode');
      indicator.title = 'Режим превью с отслеживанием поворотов - при ходьбе постер может дрейфовать';
    }
  }
}

// ============ WEBXR UI HELPERS ============

function showSurfaceDetectionOverlay() {
  const overlay = document.getElementById('ar-surface-detection');
  if (overlay) {
    overlay.style.display = 'flex';
    overlay.classList.remove('surface-found');
    const textEl = document.getElementById('ar-surface-text');
    if (textEl) {
      textEl.textContent = 'Ищем поверхность...';
    }
  }
}

function hideSurfaceDetectionOverlay() {
  const overlay = document.getElementById('ar-surface-detection');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

function updateSurfaceDetectionProgress(progress) {
  const overlay = document.getElementById('ar-surface-detection');
  const textEl = document.getElementById('ar-surface-text');

  if (overlay && textEl) {
    if (progress > 0.3) {
      overlay.classList.add('surface-found');
      textEl.textContent = 'Поверхность найдена!';
    } else {
      overlay.classList.remove('surface-found');
      textEl.textContent = 'Ищем поверхность...';
    }
  }
}

function showPlacementHint(message) {
  const hint = document.getElementById('ar-placement-hint');
  if (!hint) return;

  // Update message if provided
  const span = hint.querySelector('span');
  if (span && message) {
    span.textContent = message;
  } else if (span) {
    span.textContent = 'Нажмите на экран, чтобы переместить постер';
  }

  hint.classList.remove('hiding');
  hint.style.display = 'block';

  // Clear existing timeout
  if (xrPlacementHintTimeout) {
    clearTimeout(xrPlacementHintTimeout);
  }

  // Auto-hide after 4 seconds
  xrPlacementHintTimeout = setTimeout(() => {
    hint.classList.add('hiding');
    setTimeout(() => {
      hint.style.display = 'none';
      hint.classList.remove('hiding');
    }, 300);
  }, 4000);
}

function hidePlacementHint() {
  const hint = document.getElementById('ar-placement-hint');
  if (hint) {
    hint.style.display = 'none';
    hint.classList.remove('hiding');
  }
  if (xrPlacementHintTimeout) {
    clearTimeout(xrPlacementHintTimeout);
    xrPlacementHintTimeout = null;
  }
}

function showTapToPlaceHint() {
  const hint = document.getElementById('ar-tap-to-place-hint');
  if (hint) {
    hint.style.display = 'block';
  }
}

function hideTapToPlaceHint() {
  const hint = document.getElementById('ar-tap-to-place-hint');
  if (hint) {
    hint.style.display = 'none';
  }
}

// ============ FALLBACK MODE (Device Orientation) ============

function startRenderLoop() {
  console.log('[AR View] startRenderLoop called, animationFrameId:', animationFrameId, 'isWebXRActive:', isWebXRActive);
  if (animationFrameId || isWebXRActive) {
    console.log('[AR View] startRenderLoop: already running or WebXR active, skipping');
    return;
  }

  let frameCount = 0;
  function animate() {
    animationFrameId = requestAnimationFrame(animate);

    if (sourceMode === 'camera') {
      updateEnvironmentLighting();
      // Smoothly interpolate depth values every frame
      if (isDepthSystemReady) {
        smoothDepthValues();
      }

      // Apply low-pass filter to orientation data before using it
      if (orientationSupported && hasValidOrientation) {
        smoothDeviceOrientation();
      }

      // Feed smoothed orientation to gyro-based tracking module
      if (isPlaced && orientationSupported && hasValidOrientation) {
        ARTracking.updateWithOrientation(smoothedOrientation);
      }
    }

    // Update automatic perspective transform continuously
    if (isPlaced) {
      updatePosterPerspective();
    }

    // Update corner markers when in corner mode (world-anchored tracking)
    if (isCornerModeActive) {
      updateCornerMarkers();
    }

    renderer.render(scene, camera);

    // Log first few frames with position and rotation info
    if (frameCount < 5) {
      const pos = posterGroup?.position;
      const rot = posterGroup?.rotation;
      console.log('[AR View] Frame', frameCount,
        '- visible:', posterGroup?.visible,
        'pos:', pos ? `(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})` : 'null',
        'rot:', rot ? `(${(rot.x * 180/Math.PI).toFixed(1)}°, ${(rot.y * 180/Math.PI).toFixed(1)}°, ${(rot.z * 180/Math.PI).toFixed(1)}°)` : 'null');
      frameCount++;
    }
  }

  console.log('[AR View] Starting animation loop');
  animate();
}

function stopRenderLoop() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

// Cached canvas for environment sampling
let envSampleCanvas = null;
let envSampleCtx = null;
let lastEnvUpdate = 0;
const ENV_UPDATE_INTERVAL = 200; // ms between updates

function updateEnvironmentLighting() {
  const video = document.getElementById('ar-camera-video');
  if (!video || video.readyState < 2) return;

  // Throttle updates
  const now = Date.now();
  if (now - lastEnvUpdate < ENV_UPDATE_INTERVAL) return;
  lastEnvUpdate = now;

  // Create cached canvas if needed
  if (!envSampleCanvas) {
    envSampleCanvas = document.createElement('canvas');
    envSampleCanvas.width = 16;
    envSampleCanvas.height = 16;
    envSampleCtx = envSampleCanvas.getContext('2d', { willReadFrequently: true });
  }

  try {
    envSampleCtx.drawImage(video, 0, 0, 16, 16);
    const imageData = envSampleCtx.getImageData(0, 0, 16, 16);
    const data = imageData.data;

    let totalR = 0, totalG = 0, totalB = 0;
    let totalBrightness = 0;
    let sampleCount = 0;

    // Sample every 4th pixel for performance
    for (let i = 0; i < data.length; i += 16) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      totalR += r;
      totalG += g;
      totalB += b;
      totalBrightness += (0.299 * r + 0.587 * g + 0.114 * b);
      sampleCount++;
    }

    // Calculate averages
    const avgR = totalR / sampleCount;
    const avgG = totalG / sampleCount;
    const avgB = totalB / sampleCount;
    environmentBrightness = (totalBrightness / sampleCount) / 255;

    // Calculate color temperature (warm vs cool) - more aggressive for visible effect
    const warmth = (avgR - avgB) / 255;
    const tint = (avgG - (avgR + avgB) / 2) / 255;

    // Normalize environment color for tinting
    const envColorIntensity = Math.max(avgR, avgG, avgB) || 1;
    const normalizedR = avgR / envColorIntensity;
    const normalizedG = avgG / envColorIntensity;
    const normalizedB = avgB / envColorIntensity;

    // Create environment-matched colors with stronger response
    const baseIntensity = 0.25 + environmentBrightness * 0.75;

    // Adjust ambient light - picks up more environment color
    if (ambientLight) {
      ambientLight.intensity = baseIntensity * 0.65;
      // Blend white with environment color for natural tinting
      const envBlend = 0.25; // How much environment color to mix in
      const r = Math.min(1, (1 - envBlend) + normalizedR * envBlend + warmth * 0.15);
      const g = Math.min(1, (1 - envBlend) + normalizedG * envBlend + tint * 0.1);
      const b = Math.min(1, (1 - envBlend) + normalizedB * envBlend - warmth * 0.15);
      ambientLight.color.setRGB(r, g, b);
    }

    // Adjust main light - responds to warmth more aggressively
    if (directionalLight) {
      directionalLight.intensity = baseIntensity * 0.85;
      const r = Math.min(1, 1 + warmth * 0.2);
      const g = 0.98 + tint * 0.05;
      const b = Math.min(1, 1 - warmth * 0.2);
      directionalLight.color.setRGB(r, g, b);
    }

    // Adjust fill light - also tinted by environment
    if (fillLight) {
      fillLight.intensity = baseIntensity * 0.4;
      // Fill light picks up ambient color
      const r = Math.min(1, 0.9 + warmth * 0.1);
      const b = Math.min(1, 0.9 - warmth * 0.1);
      fillLight.color.setRGB(r, 0.95, b);
    }

    // Adjust rim light (slightly brighter in dark environments for visibility)
    if (rimLight) {
      rimLight.intensity = 0.12 + (1 - environmentBrightness) * 0.18;
    }

  } catch (e) {
    // Canvas security error - silent fail
  }
}

// ============ 3D POSTER CREATION ============

function createPosterMesh(imageUrl, widthM, heightM) {
  console.log('[AR View] createPosterMesh called, imageUrl type:', typeof imageUrl, 'length:', imageUrl?.length || 0);
  return new Promise((resolve) => {
    const loader = new THREE.TextureLoader();

    // Don't modify data URLs, use high resolution for textures
    const finalUrl = imageUrl.startsWith('data:') ? imageUrl : addImageSize(imageUrl, '1600x0');
    console.log('[AR View] Loading texture from:', finalUrl?.substring(0, 50) + '...');

    loader.load(
      finalUrl,
      (texture) => {
        console.log('[AR View] Texture loaded successfully');
        texture.colorSpace = THREE.SRGBColorSpace;

        // High quality texture filtering for smooth appearance at any scale
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter; // Trilinear filtering
        texture.magFilter = THREE.LinearFilter;

        // Maximum anisotropic filtering for sharp textures at angles
        if (renderer) {
          texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        }

        // Ensure no pixelation at edges
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;

        const geometry = new THREE.PlaneGeometry(widthM, heightM);
        const material = new THREE.MeshStandardMaterial({
          map: texture,
          roughness: 0.1,
          metalness: 0
        });

        const mesh = new THREE.Mesh(geometry, material);
        posterTextures.push(texture);
        resolve(mesh);
      },
      undefined,
      (error) => {
        console.error('[AR View] Texture load failed, using fallback gray mesh:', error);
        const geometry = new THREE.PlaneGeometry(widthM, heightM);
        const material = new THREE.MeshStandardMaterial({
          color: 0x333333,
          roughness: 0.5
        });
        resolve(new THREE.Mesh(geometry, material));
      }
    );
  });
}

// Create a sample poster data URL when no product is loaded
function createSamplePosterDataUrl() {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 848; // A2 aspect ratio (42x59.4)
  const ctx = canvas.getContext('2d');

  // Gradient background
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#1a1a2e');
  gradient.addColorStop(0.5, '#16213e');
  gradient.addColorStop(1, '#0f3460');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Decorative elements
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 2;

  // Border
  ctx.strokeRect(30, 30, canvas.width - 60, canvas.height - 60);

  // Inner frame
  ctx.strokeRect(50, 50, canvas.width - 100, canvas.height - 100);

  // Text
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.font = 'bold 36px Montserrat, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('TR/BUTE', canvas.width / 2, canvas.height / 2 - 40);

  ctx.font = '18px Montserrat, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.fillText('Выберите постер', canvas.width / 2, canvas.height / 2 + 20);
  ctx.fillText('из каталога', canvas.width / 2, canvas.height / 2 + 50);

  return canvas.toDataURL('image/jpeg', 0.9);
}

function createGlossyBlackFrame(widthM, heightM) {
  const frameGroup = new THREE.Group();
  const frameWidth = 0.005; // Thin elegant frame (5mm)
  const frameDepth = 0.012; // Moderate depth for 3D presence

  // Highly reflective black metal frame material
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0x080808,
    roughness: 0.08, // Very smooth for high gloss
    metalness: 0.95, // High metalness for reflections
    envMapIntensity: 1.5
  });

  // Create beveled edges by using multiple boxes
  const createFramePart = (width, height, depth, x, y, z) => {
    const geo = new THREE.BoxGeometry(width, height, depth);
    const mesh = new THREE.Mesh(geo, frameMaterial);
    mesh.position.set(x, y, z);
    return mesh;
  };

  // Main frame parts
  // Top
  frameGroup.add(createFramePart(
    widthM + frameWidth * 2, frameWidth, frameDepth,
    0, heightM / 2 + frameWidth / 2, frameDepth / 2
  ));

  // Bottom
  frameGroup.add(createFramePart(
    widthM + frameWidth * 2, frameWidth, frameDepth,
    0, -heightM / 2 - frameWidth / 2, frameDepth / 2
  ));

  // Left
  frameGroup.add(createFramePart(
    frameWidth, heightM, frameDepth,
    -widthM / 2 - frameWidth / 2, 0, frameDepth / 2
  ));

  // Right
  frameGroup.add(createFramePart(
    frameWidth, heightM, frameDepth,
    widthM / 2 + frameWidth / 2, 0, frameDepth / 2
  ));

  // Inner edge (recessed lip) - gives depth
  const lipWidth = 0.004;
  const lipMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a,
    roughness: 0.3,
    metalness: 0.7
  });

  const createLip = (width, height, x, y) => {
    const geo = new THREE.PlaneGeometry(width, height);
    const mesh = new THREE.Mesh(geo, lipMaterial);
    mesh.position.set(x, y, 0.001);
    return mesh;
  };

  // Inner lips
  frameGroup.add(createLip(widthM, lipWidth, 0, heightM / 2 - lipWidth / 2));
  frameGroup.add(createLip(widthM, lipWidth, 0, -heightM / 2 + lipWidth / 2));
  frameGroup.add(createLip(lipWidth, heightM - lipWidth * 2, -widthM / 2 + lipWidth / 2, 0));
  frameGroup.add(createLip(lipWidth, heightM - lipWidth * 2, widthM / 2 - lipWidth / 2, 0));

  // Glass overlay with subtle reflection
  const glassGeo = new THREE.PlaneGeometry(widthM, heightM);
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.05,
    roughness: 0.0,
    metalness: 0.0,
    transmission: 0.95, // Glass-like transmission
    thickness: 0.002,
    clearcoat: 1.0, // Adds surface reflection
    clearcoatRoughness: 0.0
  });
  const glassMesh = new THREE.Mesh(glassGeo, glassMaterial);
  glassMesh.position.set(0, 0, 0.002);
  frameGroup.add(glassMesh);

  // Highlight strip (simulates light reflection on frame edge)
  const highlightMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.15
  });
  const highlightGeo = new THREE.PlaneGeometry(widthM + frameWidth * 2, 0.002);
  const highlightMesh = new THREE.Mesh(highlightGeo, highlightMaterial);
  highlightMesh.position.set(0, heightM / 2 + frameWidth - 0.002, frameDepth + 0.001);
  frameGroup.add(highlightMesh);

  return frameGroup;
}

async function renderPoster3D() {
  console.log('[AR View] renderPoster3D called, posterGroup:', !!posterGroup, 'scene:', !!scene);
  if (!posterGroup) {
    console.error('[AR View] renderPoster3D: posterGroup is null, cannot render');
    return;
  }

  // If no product images, use a sample/placeholder
  if (currentVariantImages.length === 0) {
    console.log('[AR View] No product loaded, using sample poster');
    // Use a sample gradient as placeholder
    currentVariantImages = [createSamplePosterDataUrl()];
  }

  // Clear existing
  while (posterGroup.children.length > 0) {
    const child = posterGroup.children[0];
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach(m => m.dispose());
      } else {
        child.material.dispose();
      }
    }
    posterGroup.remove(child);
  }

  const sizeInfo = SIZE_DEFINITIONS[currentSize];
  const isFramed = currentFrame === 'black';
  const widthM = sizeInfo.width / 100;
  const heightM = sizeInfo.height / 100;

  if (isTriptych) {
    const gapM = triptychGap / 100;

    for (let i = 0; i < 3; i++) {
      const imageUrl = currentVariantImages[i] || currentVariantImages[0];
      const posterMesh = await createPosterMesh(imageUrl, widthM, heightM);
      const offsetX = (i - 1) * (widthM + gapM);
      posterMesh.position.set(offsetX, 0, 0);

      const panelGroup = new THREE.Group();
      panelGroup.add(posterMesh);

      if (isFramed) {
        const frame = createGlossyBlackFrame(widthM, heightM);
        frame.position.set(offsetX, 0, 0);
        panelGroup.add(frame);
      }

      posterGroup.add(panelGroup);
    }
  } else {
    const imageUrl = currentVariantImages[0];
    console.log('[AR View] Creating poster mesh, imageUrl length:', imageUrl?.length || 0);
    const posterMesh = await createPosterMesh(imageUrl, widthM, heightM);
    console.log('[AR View] Poster mesh created:', !!posterMesh);
    posterGroup.add(posterMesh);

    if (isFramed) {
      const frame = createGlossyBlackFrame(widthM, heightM);
      posterGroup.add(frame);
    }
  }

  console.log('[AR View] renderPoster3D complete, posterGroup children:', posterGroup.children.length);

  // For fallback mode, update position
  if (!isWebXRActive) {
    updatePosterPosition();
  }
}

function updatePosterPosition() {
  console.log('[AR View] updatePosterPosition called, posterGroup:', !!posterGroup, 'isWebXRActive:', isWebXRActive);
  if (!posterGroup || isWebXRActive) {
    console.warn('[AR View] updatePosterPosition: skipping (posterGroup:', !!posterGroup, 'isWebXRActive:', isWebXRActive, ')');
    return;
  }

  // Make poster visible
  posterGroup.visible = true;
  console.log('[AR View] Poster visibility set to true, children:', posterGroup.children.length);

  // Always use updateAutoPerspective when placed - it handles both camera and image modes
  // Image mode doesn't need device orientation, it uses position-based perspective
  if (isPlaced) {
    updateAutoPerspective();
    return;
  }

  // Fallback for initial render before placement
  const distance = virtualWallDistance;
  const vFov = camera.fov * Math.PI / 180;
  const visibleHeight = 2 * Math.tan(vFov / 2) * distance;
  const visibleWidth = visibleHeight * camera.aspect;

  const worldX = (placementPosition.x / window.innerWidth - 0.5) * visibleWidth;
  const worldY = -(placementPosition.y / window.innerHeight - 0.5) * visibleHeight;

  posterGroup.position.set(worldX, worldY, -distance);
  posterGroup.rotation.set(0, 0, 0);
  posterGroup.scale.setScalar(posterScale);
}

function updatePosterPerspective() {
  // Use the new automatic perspective system
  updateAutoPerspective();
}

// ============ CAMERA MANAGEMENT ============

// Find main (wide) camera from already-enumerated devices
function findMainCameraFromDevices(devices) {
  const cameras = devices.filter(device => device.kind === 'videoinput');

  console.log('[AR View] Found cameras:', cameras.length);
  cameras.forEach((cam, i) => {
    console.log(`  ${i}: ${cam.label || 'Camera ' + (i + 1)}`);
  });

  // If there's only one camera or no labels, don't try to be smart
  if (cameras.length <= 1 || cameras.every(cam => !cam.label)) {
    console.log('[AR View] Not enough info to select camera, using default');
    return null;
  }

  // Patterns for cameras to AVOID (telephoto, macro, depth)
  const avoidPatterns = [
    'tele', 'zoom', '2x', '3x', '5x', '10x', 'periscope',
    'macro', 'depth', 'ir ', 'infrared', 'monochrome'
  ];

  // Patterns for ultra-wide cameras (avoid unless no other option)
  const ultraWidePatterns = ['ultra', 'ultrawide', 'ultra-wide', 'superwide', '0.5x', '0.6x'];

  // Score cameras to find the best main camera
  const scoredCameras = cameras.map(cam => {
    const label = cam.label.toLowerCase();
    let score = 0;

    // Heavily penalize front cameras
    if (label.includes('front') || label.includes('selfie') || label.includes('user')) {
      return { cam, score: -1000 };
    }

    // Penalize cameras to avoid
    if (avoidPatterns.some(p => label.includes(p))) {
      console.log('[AR View] Low score for telephoto/macro/depth:', cam.label);
      score -= 500;
    }

    // Slightly penalize ultra-wide
    if (ultraWidePatterns.some(p => label.includes(p))) {
      console.log('[AR View] Lower score for ultra-wide:', cam.label);
      score -= 100;
    }

    // Boost for "main" or "wide" labels
    if (label.includes('main') || label.includes('wide')) {
      if (!ultraWidePatterns.some(p => label.includes(p))) {
        score += 200;
      }
    }

    // Boost for back/rear/environment
    if (label.includes('back') || label.includes('rear') || label.includes('environment')) {
      score += 100;
    }

    // Prefer lower camera numbers (usually main camera)
    // Look for patterns like "camera 0", "camera0", "back 0", "camera2 0"
    const numberMatch = label.match(/camera\s*(\d)/i) || label.match(/(\d),?\s*facing/);
    if (numberMatch) {
      const camNum = parseInt(numberMatch[1]);
      // Lower number = higher priority (camera 0 is usually main)
      score += (5 - camNum) * 30;
    }

    // Also check for "facing back" without high numbers
    if (label.includes('facing back') && !label.includes('2') && !label.includes('3')) {
      score += 50;
    }

    return { cam, score };
  });

  // Sort by score descending
  scoredCameras.sort((a, b) => b.score - a.score);

  // Log the scoring
  console.log('[AR View] Camera scores:');
  scoredCameras.forEach(({ cam, score }) => {
    console.log(`  ${score}: ${cam.label}`);
  });

  // Return the best non-front camera
  const best = scoredCameras.find(({ score }) => score > -1000);
  if (best) {
    console.log('[AR View] Selected camera:', best.cam.label, 'score:', best.score);
    return best.cam.deviceId;
  }

  return null;
}

async function requestCameraAccess() {
  console.log('[AR View] requestCameraAccess called, isWebXRSupported:', isWebXRSupported);

  // First try WebXR if supported
  if (isWebXRSupported) {
    const webxrStarted = await startWebXRSession();
    if (webxrStarted) {
      return true;
    }
    console.log('[AR View] WebXR failed, falling back to camera mode');
  } else {
    console.log('[AR View] WebXR not supported, using camera mode directly');
  }

  // Fall back to regular camera - single permission request
  console.log('[AR View] Starting camera fallback mode setup');
  try {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
    }

    // Show the main container BEFORE initializing Three.js
    // WebGL context creation can fail on hidden canvases
    const mainContainer = document.getElementById('ar-main-container');
    const permissionScreen = document.getElementById('ar-permission-screen');
    if (mainContainer) {
      mainContainer.style.display = 'flex';
    }
    if (permissionScreen) {
      permissionScreen.style.display = 'none';
    }

    // Initialize Three.js for fallback mode
    // Always reinitialize if posterGroup is missing (can happen after failed WebXR attempt)
    if (!renderer || !posterGroup) {
      console.log('[AR View] Initializing Three.js for camera mode...', 'renderer:', !!renderer, 'posterGroup:', !!posterGroup);
      if (renderer && !posterGroup) {
        // Partial state - dispose and reinit
        console.log('[AR View] Partial Three.js state detected, reinitializing...');
        disposeThreeJS();
      }
      const initResult = initThreeJS(false);
      console.log('[AR View] Three.js init result:', initResult, 'renderer:', !!renderer, 'posterGroup:', !!posterGroup);
      if (!initResult || !renderer || !posterGroup) {
        throw new Error('Three.js initialization failed');
      }
    }

    // First attempt: environment-facing camera with optimizations to reduce cropping
    // Firefox handles constraints differently - use minimal constraints to avoid cropping
    const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
    console.log('[AR View] Browser detected:', isFirefox ? 'Firefox' : 'Other');

    try {
      // Firefox tends to crop when given specific resolution constraints
      // Use minimal constraints for Firefox, more specific for other browsers
      const videoConstraints = isFirefox
        ? { facingMode: { ideal: 'environment' } }
        : {
            facingMode: { ideal: 'environment' },
            // Request moderate resolution - some devices crop heavily at higher res
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 }
          };

      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false
      });

      // Log actual video dimensions for debugging
      const videoTrack = cameraStream.getVideoTracks()[0];
      const videoTrackSettings = videoTrack?.getSettings?.() || {};
      console.log('[AR View] Video stream dimensions:', videoTrackSettings.width, 'x', videoTrackSettings.height);

      // Check if we got a problematic camera (telephoto, macro, etc.)
      // Only switch if the current camera label indicates it's not the main camera
      const currentLabel = videoTrack?.label?.toLowerCase() || '';

      // Patterns that indicate we're on the WRONG camera
      const problematicPatterns = ['tele', 'zoom', '2x', '3x', '5x', '10x', 'periscope', 'macro'];
      const isOnProblematicCamera = problematicPatterns.some(p => currentLabel.includes(p));

      if (isOnProblematicCamera) {
        console.log('[AR View] Detected problematic camera:', currentLabel, '- switching...');

        // Enumerate devices and find a better camera
        const devices = await navigator.mediaDevices.enumerateDevices();
        const preferredCameraId = findMainCameraFromDevices(devices);

        if (preferredCameraId) {
          cameraStream.getTracks().forEach(track => track.stop());

          cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { exact: preferredCameraId }
            },
            audio: false
          });
          console.log('[AR View] Switched to:', cameraStream.getVideoTracks()[0]?.label);
        }
      } else {
        console.log('[AR View] Camera looks good:', currentLabel || '(no label)');
      }

      // Try to apply minimum zoom and disable stabilization (helps with cropped cameras)
      const finalTrack = cameraStream.getVideoTracks()[0];
      if (finalTrack) {
        try {
          const capabilities = finalTrack.getCapabilities?.();
          const settings = finalTrack.getSettings?.() || {};
          console.log('[AR View] Camera settings:', JSON.stringify(settings, null, 2));
          console.log('[AR View] Camera capabilities:', capabilities ? Object.keys(capabilities) : 'none');

          const constraintsToApply = [];

          // Apply minimum zoom if supported (1x = no crop from zoom)
          if (capabilities?.zoom && capabilities.zoom.min < capabilities.zoom.max) {
            console.log('[AR View] Zoom range:', capabilities.zoom.min, '-', capabilities.zoom.max);
            constraintsToApply.push({ zoom: capabilities.zoom.min });
          }

          // Disable video stabilization if supported (stabilization causes cropping)
          if (capabilities?.videoStabilizationMode) {
            console.log('[AR View] Stabilization modes:', capabilities.videoStabilizationMode);
            if (capabilities.videoStabilizationMode.includes('off')) {
              constraintsToApply.push({ videoStabilizationMode: 'off' });
              console.log('[AR View] Will disable video stabilization');
            }
          }

          // Apply all constraints
          if (constraintsToApply.length > 0) {
            await finalTrack.applyConstraints({ advanced: constraintsToApply });
            console.log('[AR View] Applied camera optimizations:', constraintsToApply);
          }
        } catch (constraintErr) {
          console.log('[AR View] Could not apply camera optimizations:', constraintErr.message);
        }
      }
    } catch (e) {
      console.log('[AR View] Environment camera failed, trying fallback:', e.name);
      // Fallback - still prefer rear camera but accept any
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false
        });
      } catch (e2) {
        console.log('[AR View] Rear camera fallback failed, using any camera:', e2.name);
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
      }
    }

    const video = document.getElementById('ar-camera-video');
    if (video) {
      video.srcObject = cameraStream;
      video.style.display = 'block';
      await new Promise((resolve, reject) => {
        let resolved = false;
        const cleanup = () => {
          video.onloadedmetadata = null;
          video.onerror = null;
        };
        video.onloadedmetadata = () => {
          console.log('[AR View] Video metadata loaded');
          if (resolved) return;
          resolved = true;
          cleanup();
          video.play().then(() => {
            console.log('[AR View] Video playing successfully');
            resolve();
          }).catch(reject);
        };
        video.onerror = (e) => {
          if (resolved) return;
          resolved = true;
          cleanup();
          reject(new Error('Video element error'));
        };
        setTimeout(() => {
          if (resolved) return;
          resolved = true;
          cleanup();
          reject(new Error('Video loading timeout'));
        }, 5000);
      });
    }

    const wallImage = document.getElementById('ar-wall-image');
    if (wallImage) {
      wallImage.style.display = 'none';
    }

    sourceMode = 'camera';
    updateCameraButtonVisibility();

    try {
      localStorage.setItem(CAMERA_PERMISSION_KEY, 'true');
    } catch (e) {}

    if (orientationSupported) {
      await requestOrientationPermission();
    }

    // Initialize depth estimation system for wall detection
    // This happens in parallel with showing the AR view
    initDepthSystem().then(() => {
      // Start depth tracking once the system is ready
      startDepthTracking();
    });

    // Initialize gyro-based ARTracking (no video/optical flow needed)
    ARTracking.initTracking(null);
    ARTracking.setCameraFOV(CAMERA_FOV, window.innerWidth / window.innerHeight);
    ARTracking.startTracking();
    console.log('[AR View] ARTracking initialized (gyro-based)');

    console.log('[AR View] Camera setup complete, calling showARView. posterGroup:', !!posterGroup, 'renderer:', !!renderer);
    showARView();
    updateARModeIndicator(false);

    console.log('[AR View] Camera access granted (fallback mode)');
    return true;
  } catch (error) {
    console.error('[AR View] Camera access failed:', error.name, error.message);

    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      showError('Доступ к камере запрещён. Разрешите доступ в настройках браузера.');
    } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      showError('Камера не найдена на этом устройстве.');
    } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      showError('Камера занята другим приложением. Закройте другие приложения и попробуйте снова.');
    } else if (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
      showError('Камера не поддерживает запрашиваемые настройки. Попробуйте загрузить фото стены.');
    } else if (error.name === 'AbortError') {
      showError('Операция была прервана. Попробуйте снова.');
    } else if (error.name === 'SecurityError') {
      showError('Доступ к камере заблокирован. Используйте HTTPS или загрузите фото стены.');
    } else if (error.name === 'TypeError') {
      showError('Браузер не поддерживает доступ к камере. Попробуйте загрузить фото стены.');
    } else {
      showError('Не удалось получить доступ к камере. Попробуйте загрузить фото стены.');
    }

    return false;
  }
}

function stopCamera() {
  console.log('[AR View] Stopping camera...');
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => {
      track.stop();
      console.log('[AR View] Stopped track:', track.kind, track.label);
    });
    cameraStream = null;
  }
  // Also clear video element to ensure browser releases camera
  const video = document.getElementById('ar-camera-video');
  if (video) {
    video.srcObject = null;
    video.load(); // Force release
  }
  stopOrientationTracking();
}

function pauseCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => {
      track.enabled = false;
    });
  }
}

function resumeCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => {
      track.enabled = true;
    });
  }
}

/**
 * Restart camera stream only - preserves all other state (placement, depth system, etc.)
 * Used when returning to tab after it was hidden
 */
async function restartCameraStream() {
  console.log('[AR View] Restarting camera stream only...');

  try {
    // Stop existing stream if any
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
    }

    // Get new camera stream with same constraints as initial setup
    const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
    const videoConstraints = isFirefox
      ? { facingMode: { ideal: 'environment' } }
      : {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 }
        };

    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: false
    });

    // Connect to video element
    const video = document.getElementById('ar-camera-video');
    if (video) {
      video.srcObject = cameraStream;
      await video.play();
    }

    // Resume orientation tracking if supported
    if (orientationSupported) {
      startOrientationTracking();
    }

    console.log('[AR View] Camera stream restarted successfully');
    return true;
  } catch (error) {
    console.error('[AR View] Failed to restart camera stream:', error);
    throw error;
  }
}

// ============ VISIBILITY CHANGE HANDLER ============

function handleVisibilityChange() {
  if (document.hidden) {
    // Fully stop camera to release the notification indicator
    // (just pausing keeps the notification visible)
    if (sourceMode === 'camera' && cameraStream) {
      console.log('[AR View] Page hidden, stopping camera to release notification');
      stopCamera();
    }
    if (!isWebXRActive) {
      stopRenderLoop();
    }
  } else {
    // Page became visible - restart camera if we were using it
    if (sourceMode === 'camera' && !cameraStream) {
      console.log('[AR View] Page visible, restarting camera (preserving placement state)');
      // Restart camera stream only - don't reinitialize everything
      restartCameraStream().then(() => {
        startRenderLoop();
        hideCameraRestartPrompt();
        // Resume depth tracking if it was running
        if (isDepthSystemReady && isPlaced) {
          startDepthTracking();
        }
      }).catch(err => {
        console.error('[AR View] Failed to restart camera:', err);
        showCameraRestartPrompt();
      });
      return;
    }
    if (sourceMode === 'camera' && cameraStream) {
      // Check if camera stream is still valid
      const tracks = cameraStream.getVideoTracks();
      if (tracks.length === 0 || tracks.every(t => t.readyState === 'ended')) {
        console.log('[AR View] Camera stream ended, restarting...');
        restartCameraStream();
        return;
      }
      // Resume tracks and video
      resumeCamera();
      const video = document.getElementById('ar-camera-video');
      if (video && video.paused) {
        video.play().catch(e => console.warn('[AR View] Video play failed:', e));
      }
    } else {
      resumeCamera();
    }
    if (sourceMode && !isWebXRActive) {
      startRenderLoop();
    }
  }
}

// ============ DEVICE ORIENTATION ============

async function checkOrientationSupport() {
  if (typeof DeviceOrientationEvent !== 'undefined') {
    orientationSupported = true;
  }
}

async function requestOrientationPermission() {
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission === 'granted') {
        startOrientationTracking();
        return true;
      }
    } catch (e) {
      console.warn('[AR View] Orientation permission denied:', e);
    }
    return false;
  }
  startOrientationTracking();
  return true;
}

function startOrientationTracking() {
  window.addEventListener('deviceorientation', handleDeviceOrientation);
  console.log('[AR View] Orientation tracking started');
}

function stopOrientationTracking() {
  window.removeEventListener('deviceorientation', handleDeviceOrientation);
  initialOrientation = null;
  hasValidOrientation = false;
}

function handleDeviceOrientation(event) {
  deviceOrientation = {
    alpha: event.alpha || 0,
    beta: event.beta || 0,
    gamma: event.gamma || 0
  };

  // Check if this is the first valid orientation event
  // Valid means we actually have real data (not all zeros from initialization)
  const hasRealData = event.beta !== null && event.beta !== undefined;

  if (!hasValidOrientation && hasRealData) {
    hasValidOrientation = true;
    console.log('[AR View] First valid orientation received - beta:', event.beta, 'gamma:', event.gamma);

    // If poster is already placed with stale orientation data, re-anchor it
    // This fixes the issue where poster drops to floor because initial anchor was zeros
    if (isPlaced && wallPlacementOrientation) {
      console.log('[AR View] Re-anchoring poster with valid orientation data');
      captureWallPlacementOrientation();
    }
  }

  if (initialOrientation === null && isPlaced) {
    initialOrientation = { ...deviceOrientation };
  }
}

// ============ INITIALIZATION ============

async function init() {
  // Prevent multiple initializations
  if (isInitialized) {
    console.log('[AR View] Already initialized, skipping');
    return;
  }
  isInitialized = true;

  console.log('[AR View] Initializing...');

  // Add body class for AR-specific styles (fallback for browsers without :has() support)
  document.body.classList.add('ar-page-active');

  // CRITICAL: Set up event listeners FIRST to ensure buttons work
  // even if AR dependencies fail to load (e.g., CDN blocked, network error)
  setupEventListeners();
  console.log('[AR View] Event listeners attached');

  // Load required dependencies (Three.js, TensorFlow.js)
  // These may not be present when navigating via SPA
  try {
    await loadARDependencies();
  } catch (err) {
    console.error('[AR View] Failed to load dependencies:', err);
    showError('Не удалось загрузить необходимые библиотеки. Попробуйте перезагрузить страницу.');
    // Don't return - keep going so upload functionality still works
  }

  // Check WebXR support first
  await checkWebXRSupport();

  // Load product data
  await loadProductData();

  // Get product ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  const productId = urlParams.get('id') || urlParams.get('product');
  const productSlug = urlParams.get('slug');

  if (productId || productSlug) {
    await loadProduct(productId || productSlug);
  }

  // Add visibility change handler for camera resume
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Check device orientation support
  await checkOrientationSupport();

  // Initialize controls state
  initControlsState();

  // Update collapsed view display
  updateCollapsedView();

  // Update AR mode indicator
  updateARModeIndicator(false);

  // Mark page as ready
  document.documentElement.classList.remove('page-loading');
  document.documentElement.classList.add('page-ready');

  console.log('[AR View] Initialized, WebXR supported:', isWebXRSupported);
}

async function loadProductData() {
  try {
    allProducts = await DataStore.loadProducts();
    allProducts = allProducts.filter(p =>
      p.status === 'available' || p.status === 'coming_soon'
    );
    console.log('[AR View] Loaded', allProducts.length, 'products');
  } catch (error) {
    console.error('[AR View] Failed to load products:', error);
    allProducts = [];
  }
}

async function loadProduct(idOrSlug) {
  const id = parseInt(idOrSlug);
  currentProduct = allProducts.find(p => p.id === id) || allProducts.find(p => p.slug === idOrSlug);

  if (!currentProduct) {
    console.warn('[AR View] Product not found:', idOrSlug);
    showError('Товар не найден');
    return;
  }

  console.log('[AR View] Loading product:', currentProduct.title);

  const titleEl = document.getElementById('ar-product-title');
  if (titleEl) {
    titleEl.textContent = currentProduct.title;
  }

  isTriptych = currentProduct.triptych === true || currentProduct.triptych === 1;

  const triptychControls = document.getElementById('ar-triptych-controls');
  if (triptychControls) {
    triptychControls.style.display = isTriptych ? 'flex' : 'none';
  }

  await loadVariantImages(currentProduct.id);

  const newUrl = new URL(window.location);
  newUrl.searchParams.set('id', currentProduct.id);
  window.history.replaceState({}, '', newUrl);
}

async function loadVariantImages(productId) {
  try {
    const response = await fetch(`/products/${productId}/images`);
    if (!response.ok) throw new Error('Failed to load images');

    const images = await response.json();

    currentVariantImages = images
      .filter(img => img.extra === 'варианты')
      .map(img => img.url || img)
      .filter(Boolean);

    if (currentVariantImages.length === 0) {
      currentVariantImages = images
        .map(img => img.url || img)
        .filter(Boolean);
    }

    if (isTriptych && currentVariantImages.length < 3) {
      while (currentVariantImages.length < 3) {
        currentVariantImages.push(currentVariantImages[0] || '');
      }
    }

    console.log('[AR View] Loaded variant images:', currentVariantImages.length);

    if (sourceMode) {
      await renderPoster3D();
    }
  } catch (error) {
    console.error('[AR View] Failed to load variant images:', error);
    currentVariantImages = [];
  }
}

// ============ AR VIEW DISPLAY ============

function showARView() {
  console.log('[AR View] showARView called, isWebXRActive:', isWebXRActive, 'sourceMode:', sourceMode);

  const permissionScreen = document.getElementById('ar-permission-screen');
  const mainContainer = document.getElementById('ar-main-container');

  console.log('[AR View] Elements found - permission:', !!permissionScreen, 'main:', !!mainContainer);

  if (permissionScreen) {
    permissionScreen.style.display = 'none';
    console.log('[AR View] Permission screen hidden');
  }

  if (mainContainer) {
    mainContainer.style.display = 'flex';
    console.log('[AR View] Main container shown');
  }

  // Reset placement state for fallback mode
  if (!isWebXRActive) {
    console.log('[AR View] Setting up fallback mode, sourceMode:', sourceMode);
    posterScale = 1;

    // Default position (center of screen)
    placementPosition = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      z: -ESTIMATED_WALL_DISTANCE
    };

    // Camera mode: wait for user to tap where they want the poster
    // Image mode: auto-place in center (perspective from depth estimation)
    const requiresTapToPlace = sourceMode === 'camera';
    isPlaced = !requiresTapToPlace;

    console.log('[AR View] Rendering poster, requiresTapToPlace:', requiresTapToPlace);
    renderPoster3D().then(() => {
      console.log('[AR View] Poster rendered, starting render loop');

      if (requiresTapToPlace) {
        // Camera mode: hide poster until user taps
        if (posterGroup) {
          posterGroup.visible = false;
        }
        showTapToPlaceHint();
      } else {
        // Image mode: show poster immediately with detected perspective
        if (posterGroup) {
          posterGroup.visible = true;
        }
        captureWallPlacementOrientation();
      }

      startRenderLoop();
    }).catch(err => {
      console.error('[AR View] Poster render error:', err);
    });
  }
}

// ============ CONTROLS COLLAPSE ============

function initControlsState() {
  isControlsCollapsed = true;
  updateControlsDisplay();
}

function toggleControls() {
  isControlsCollapsed = !isControlsCollapsed;
  updateControlsDisplay();
  updateCollapsedView();
}

function updateControlsDisplay() {
  const expandedContent = document.getElementById('ar-expanded-controls');
  const collapseArrowIcon = document.querySelector('.ar-collapse-arrow-icon');

  if (expandedContent) {
    if (isControlsCollapsed) {
      expandedContent.style.maxHeight = '0';
      expandedContent.style.opacity = '0';
      expandedContent.style.pointerEvents = 'none';
    } else {
      expandedContent.style.maxHeight = expandedContent.scrollHeight + 'px';
      expandedContent.style.opacity = '1';
      expandedContent.style.pointerEvents = 'auto';
    }
  }

  if (collapseArrowIcon) {
    if (isControlsCollapsed) {
      collapseArrowIcon.classList.remove('up');
      collapseArrowIcon.classList.add('down');
    } else {
      collapseArrowIcon.classList.add('up');
      collapseArrowIcon.classList.remove('down');
    }
  }
}

function updateCollapsedView() {
  const sizeDisplay = document.getElementById('ar-size-display');
  const frameDisplay = document.getElementById('ar-frame-display');

  if (sizeDisplay) {
    sizeDisplay.textContent = currentSize;
  }

  if (frameDisplay) {
    frameDisplay.textContent = currentFrame === 'black' ? 'В рамке' : 'Без рамки';
  }
}

// ============ IMAGE UPLOAD ============

// Custom poster image (user uploaded)
let customPosterImage = null;

// Flag to prevent double processing
let isProcessingUpload = false;

function handleImageUpload(event) {
  console.log('[AR View] handleImageUpload called');

  // Prevent double processing
  if (isProcessingUpload) {
    console.log('[AR View] Already processing upload, ignoring');
    return;
  }

  const file = event.target.files?.[0];
  if (!file) {
    console.log('[AR View] No file selected');
    return;
  }

  isProcessingUpload = true;
  console.log('[AR View] Processing file:', file.name, file.type, file.size);

  // Clear the input so the same file can be selected again
  event.target.value = '';

  if (!file.type.startsWith('image/')) {
    showError('Пожалуйста, выберите изображение');
    isProcessingUpload = false;
    return;
  }

  // Stop WebXR if active
  if (isWebXRActive) {
    stopWebXRSession();
  }

  // Show the main container BEFORE initializing Three.js
  // WebGL context creation can fail on hidden canvases
  const mainContainer = document.getElementById('ar-main-container');
  const permissionScreen = document.getElementById('ar-permission-screen');
  if (mainContainer) {
    mainContainer.style.display = 'flex';
  }
  if (permissionScreen) {
    permissionScreen.style.display = 'none';
  }

  // Initialize Three.js for fallback mode if needed
  if (!renderer) {
    console.log('[AR View] Initializing Three.js...');
    const initResult = initThreeJS(false);
    console.log('[AR View] Three.js init result:', initResult, 'renderer:', !!renderer);
    if (!initResult || !renderer) {
      showError('Не удалось инициализировать 3D. Попробуйте перезагрузить страницу.');
      isProcessingUpload = false;
      return;
    }
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    console.log('[AR View] File read complete');

    const wallImage = document.getElementById('ar-wall-image');
    const video = document.getElementById('ar-camera-video');

    if (wallImage) {
      wallImage.src = e.target.result;
      wallImage.style.display = 'block';
      console.log('[AR View] Wall image set');
    } else {
      console.error('[AR View] Wall image element not found');
    }

    if (video) {
      video.style.display = 'none';
      stopCamera();
    }

    sourceMode = 'image';
    updateCameraButtonVisibility();

    // RESET PLACEMENT STATE for new image
    // This prevents the poster from retaining camera mode position
    isPlaced = false;
    placementPosition = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      z: -ESTIMATED_WALL_DISTANCE
    };
    anchoredWorldPosition = { x: 0.5, y: 0.5 };
    anchoredWallDistance = ESTIMATED_WALL_DISTANCE;
    anchoredPosterScale = 1.0;
    posterScale = 1.0;
    smoothedOffsetX = 0;
    smoothedOffsetY = 0;
    trackingOffset = { x: 0, y: 0 };
    wallPlacementOrientation = null;

    // Reset wall detection state for fresh analysis
    detectedWallAngleY = 0;
    detectedWallAngleX = 0;
    detectedCameraRoll = 0;
    wallOrientationConfidence = 0;
    targetWallAngleY = 0;
    targetWallAngleX = 0;
    targetCameraRoll = 0;
    targetWallConfidence = 0;

    // Keep orientation tracking active - user can tilt phone to adjust perspective
    // to match the uploaded image's perspective
    if (!orientationSupported) {
      await checkOrientationSupport();
    }
    if (orientationSupported && !initialOrientation) {
      await requestOrientationPermission();
    }

    // Show AR view immediately - don't wait for depth estimation
    showARView();
    updateARModeIndicator(false);

    console.log('[AR View] Wall image loaded successfully');
    isProcessingUpload = false;

    // Run depth estimation after image is fully loaded
    // Wait for image to be ready before running depth estimation
    const runDepthEstimation = async () => {
      try {
        await initDepthSystem();

        // Ensure image is fully loaded and has dimensions
        if (wallImage && wallImage.complete && wallImage.naturalWidth > 0) {
          console.log('[AR View] Running depth estimation on image:', wallImage.naturalWidth, 'x', wallImage.naturalHeight);
          estimateDepthFromImage(wallImage);
        } else {
          console.warn('[AR View] Image not ready for depth estimation');
        }
      } catch (err) {
        console.warn('[AR View] Depth estimation failed (using defaults):', err);
      }
    };

    // Wait for image to load first
    if (wallImage.complete && wallImage.naturalWidth > 0) {
      runDepthEstimation();
    } else {
      wallImage.onload = runDepthEstimation;
    }
  };

  reader.onerror = (e) => {
    console.error('[AR View] File read error:', e);
    showError('Не удалось прочитать файл. Попробуйте другое изображение.');
    isProcessingUpload = false;
  };

  reader.readAsDataURL(file);
}

function handlePosterUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  // Clear the input so the same file can be selected again
  event.target.value = '';

  if (!file.type.startsWith('image/')) {
    showError('Пожалуйста, выберите изображение');
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    customPosterImage = e.target.result;
    currentVariantImages = [customPosterImage];
    isTriptych = false;

    // Update title to show custom poster
    const titleEl = document.getElementById('ar-product-title');
    if (titleEl) {
      titleEl.textContent = 'Ваш постер';
    }

    // Clear current product reference
    currentProduct = null;

    console.log('[AR View] Custom poster loaded');

    // If AR is already active, re-render the poster
    if (sourceMode) {
      await renderPoster3D();
    }
  };

  reader.readAsDataURL(file);
}

// ============ SIZE & FRAME CONTROLS ============

function handleSizeChange(event) {
  const btn = event.target.closest('.ar-control-btn');
  if (!btn) return;

  const size = btn.dataset.size;
  if (!size || size === currentSize) return;

  document.querySelectorAll('#ar-size-buttons .ar-control-btn').forEach(b => {
    b.classList.toggle('active', b === btn);
  });

  currentSize = size;

  // Recalculate scale based on current depth and new size
  if (isDepthSystemReady && DepthEstimation.isReady()) {
    posterScale = DepthEstimation.calculatePosterScale(
      virtualWallDistance,
      currentSize,
      CAMERA_FOV
    );
    console.log(`[AR View] Updated scale for size ${size}: ${posterScale.toFixed(3)}`);
  }

  renderPoster3D();
  updateCollapsedView();

  console.log('[AR View] Size changed to:', size);
}

function handleFrameChange(event) {
  const btn = event.target.closest('.ar-control-btn');
  if (!btn) return;

  const frame = btn.dataset.frame;
  if (frame === undefined || frame === currentFrame) return;

  document.querySelectorAll('#ar-frame-buttons .ar-control-btn').forEach(b => {
    b.classList.toggle('active', b === btn);
  });

  currentFrame = frame;
  renderPoster3D();
  updateCollapsedView();

  console.log('[AR View] Frame changed to:', frame);
}

function handleGapChange(event) {
  triptychGap = parseFloat(event.target.value);

  const gapValue = document.getElementById('ar-gap-value');
  if (gapValue) {
    gapValue.textContent = `${triptychGap} см`;
  }

  renderPoster3D();
}

// ============ INTERACTION (DRAG & PINCH - Fallback Mode) ============

function setupPosterInteraction() {
  const canvas = document.getElementById('ar-three-canvas');
  if (!canvas) return;

  addListener(canvas, 'mousedown', handleDragStart);
  addListener(document, 'mousemove', handleDragMove);
  addListener(document, 'mouseup', handleDragEnd);

  addListener(canvas, 'touchstart', handleTouchStart, { passive: false });
  addListener(document, 'touchmove', handleTouchMove, { passive: false });
  addListener(document, 'touchend', handleTouchEnd);

  addListener(canvas, 'click', handleCanvasClick);
}

function handleDragStart(e) {
  if (isWebXRActive) return;
  isDragging = true;
  hasDragged = false;
  dragStart = {
    x: e.clientX - placementPosition.x,
    y: e.clientY - placementPosition.y
  };
  e.preventDefault();
}

function handleDragMove(e) {
  if (!isDragging || isWebXRActive) return;
  const newX = e.clientX - dragStart.x;
  const newY = e.clientY - dragStart.y;
  // Check if actually moved (more than 5px)
  if (Math.abs(newX - placementPosition.x) > 5 || Math.abs(newY - placementPosition.y) > 5) {
    hasDragged = true;
  }
  placementPosition.x = newX;
  placementPosition.y = newY;
  updatePosterPosition();
}

function handleDragEnd() {
  isDragging = false;
  // hasDragged is reset on next drag start
}

function handleTouchStart(e) {
  if (isWebXRActive) return;

  if (e.touches.length === 1) {
    isDragging = true;
    hasDragged = false;
    dragStart = {
      x: e.touches[0].clientX - placementPosition.x,
      y: e.touches[0].clientY - placementPosition.y
    };
  } else if (e.touches.length === 2) {
    isDragging = false;
    hasDragged = true; // Pinch counts as interaction, not a tap
    initialPinchDistance = getPinchDistance(e.touches);
    pinchStartScale = isPlaced ? anchoredPosterScale : posterScale; // Save current scale
  }
  e.preventDefault();
}

function handleTouchMove(e) {
  if (isWebXRActive) return;

  if (e.touches.length === 1 && isDragging) {
    const newX = e.touches[0].clientX - dragStart.x;
    const newY = e.touches[0].clientY - dragStart.y;
    // Check if actually moved (more than 5px)
    if (Math.abs(newX - placementPosition.x) > 5 || Math.abs(newY - placementPosition.y) > 5) {
      hasDragged = true;
    }
    placementPosition.x = newX;
    placementPosition.y = newY;
    // Keep anchored world position in sync and re-anchor orientation
    // so the poster lands where the finger is, regardless of camera rotation
    if (isPlaced) {
      anchoredWorldPosition.x = newX / window.innerWidth;
      anchoredWorldPosition.y = newY / window.innerHeight;
      captureWallPlacementOrientation();
    }
    updatePosterPosition();
  } else if (e.touches.length === 2) {
    hasDragged = true;
    const currentDistance = getPinchDistance(e.touches);
    // Scale relative to the start of this pinch gesture
    const scaleFactor = currentDistance / initialPinchDistance;
    const newScale = Math.max(0.3, Math.min(3, pinchStartScale * scaleFactor));

    posterScale = newScale;

    // Also update anchoredPosterScale so it persists and is used in updateAutoPerspective
    if (isPlaced) {
      anchoredPosterScale = newScale;
    }

    if (posterGroup) {
      posterGroup.scale.setScalar(newScale);
    }
    // Note: Don't update initialPinchDistance here - keep it as the start distance
  }
  e.preventDefault();
}

function handleTouchEnd(e) {
  if (e.touches.length === 0) {
    const wasDragging = isDragging;
    const wasDragged = hasDragged;
    isDragging = false;

    // If it was a simple tap (no drag), trigger placement
    // This is needed because e.preventDefault() on touchstart blocks the 'click' event
    if (wasDragging && !wasDragged && !isWebXRActive) {
      // Get the last touch position from changedTouches
      const touch = e.changedTouches?.[0];
      if (touch) {
        handleCanvasClick({ clientX: touch.clientX, clientY: touch.clientY });
      }
    }
  }
}

function getPinchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function handleCanvasClick(e) {
  // Ignore clicks if we just finished dragging or pinching
  if (hasDragged || isWebXRActive) {
    hasDragged = false; // Reset for next interaction
    return;
  }

  // Handle corner mode clicks
  if (isCornerModeActive) {
    handleCornerClick(e);
    return;
  }

  const isFirstPlacement = !isPlaced;

  // Update poster position to where user tapped
  placementPosition.x = e.clientX;
  placementPosition.y = e.clientY;

  // Place or reposition poster
  if (sourceMode === 'camera' || sourceMode === 'image') {
    isPlaced = true;
    initialOrientation = { ...deviceOrientation };
    captureWallPlacementOrientation();

    // Initialize optical flow tracking for camera mode
    if (sourceMode === 'camera') {
      initializeVisualTracking();
    }

    // Show poster on first placement
    if (posterGroup) {
      posterGroup.visible = true;
    }

    // Hide hint on first placement
    if (isFirstPlacement) {
      hideTapToPlaceHint();
    }
  }

  updatePosterPosition();
}

/**
 * Initialize gyro-based tracking when poster is placed
 * The tracking module uses device orientation deltas to keep the poster anchored
 */
function initializeVisualTracking() {
  // Initialize gyro-based tracking (no video needed)
  ARTracking.initTracking(null);

  // Set camera FOV for accurate angle-to-pixel conversion
  const aspect = window.innerWidth / window.innerHeight;
  ARTracking.setCameraFOV(CAMERA_FOV, aspect);

  console.log('[AR View] Gyro-based tracking initialized, FOV:', CAMERA_FOV, 'aspect:', aspect.toFixed(2));
}

// ============ CORNER PLACEMENT MODE ============

/**
 * Enter corner placement mode - user marks 4 wall corners
 */
function enterCornerMode() {
  if (isCornerModeActive) return;

  console.log('[AR View] Entering corner placement mode');
  isCornerModeActive = true;
  cornerPoints = [];

  // Show overlay
  const overlay = document.getElementById('ar-corner-mode-overlay');
  if (overlay) {
    overlay.style.display = 'block';
  }

  // Highlight button
  const btn = document.getElementById('ar-corner-mode-btn');
  if (btn) {
    btn.classList.add('active');
  }

  // Hide poster while placing corners
  if (posterGroup) {
    posterGroup.visible = false;
  }

  // Update UI state
  updateCornerModeUI();
}

/**
 * Exit corner placement mode without applying changes
 */
function exitCornerMode() {
  console.log('[AR View] Exiting corner placement mode');
  isCornerModeActive = false;
  cornerPoints = [];

  // Hide overlay
  const overlay = document.getElementById('ar-corner-mode-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }

  // Remove button highlight
  const btn = document.getElementById('ar-corner-mode-btn');
  if (btn) {
    btn.classList.remove('active');
  }

  // Clear markers
  clearCornerMarkers();

  // Show poster again
  if (posterGroup && isPlaced) {
    posterGroup.visible = true;
  }
}

/**
 * Handle click during corner mode - place a corner point
 * Stores tracking data so marker can be world-anchored
 */
function handleCornerClick(e) {
  if (!isCornerModeActive) return;
  if (cornerPoints.length >= CORNER_COUNT) return;

  // Store point with tracking data for world-anchoring
  // Capture all 3 orientation axes for proper gyro-based tracking
  const point = {
    x: e.clientX,
    y: e.clientY,
    // Normalized screen position (0-1)
    normalizedX: e.clientX / window.innerWidth,
    normalizedY: e.clientY / window.innerHeight,
    // Anchor device orientation at placement time (all axes for gyro tracking)
    anchorOrientation: {
      alpha: deviceOrientation.alpha ?? 0,
      beta: deviceOrientation.beta ?? 90,
      gamma: deviceOrientation.gamma ?? 0
    }
  };
  cornerPoints.push(point);

  console.log(`[AR View] Corner ${cornerPoints.length} placed at (${point.x}, ${point.y}) - normalized: (${point.normalizedX.toFixed(2)}, ${point.normalizedY.toFixed(2)})`);

  // Add visual marker
  addCornerMarker(point, cornerPoints.length);

  // Update UI state
  updateCornerModeUI();

  // Draw connecting lines
  if (cornerPoints.length > 1) {
    drawCornerLines();
  }
}

/**
 * Add a visual marker for a corner point
 */
function addCornerMarker(point, number) {
  const container = document.getElementById('ar-corner-markers');
  if (!container) return;

  const marker = document.createElement('div');
  marker.className = 'ar-corner-marker';
  marker.id = `ar-corner-marker-${number}`;
  marker.style.left = `${point.x}px`;
  marker.style.top = `${point.y}px`;

  const label = document.createElement('div');
  label.className = 'ar-corner-marker-label';
  label.textContent = number;
  marker.appendChild(label);

  container.appendChild(marker);
}

/**
 * Update corner marker positions based on camera movement
 * Uses the same gyro-based tracking as the poster — angular deltas converted
 * to screen-space offsets using camera FOV for accurate world-anchoring.
 *
 * The key formula: when the phone yaws by Δα degrees, a point on screen
 * moves by (Δα / cameraHFov) * screenWidth pixels in the opposite direction.
 */
function updateCornerMarkers() {
  if (!isCornerModeActive || cornerPoints.length === 0) return;
  if (!orientationSupported || !hasValidOrientation) return;

  const currentAlpha = deviceOrientation.alpha ?? 0;
  const currentBeta = deviceOrientation.beta ?? 90;
  const currentGamma = deviceOrientation.gamma ?? 0;

  let markersUpdated = false;

  for (let i = 0; i < cornerPoints.length; i++) {
    const point = cornerPoints[i];
    const marker = document.getElementById(`ar-corner-marker-${i + 1}`);
    if (!point.anchorOrientation) continue;

    // Calculate angular deltas from when this corner was placed
    let deltaAlpha = currentAlpha - point.anchorOrientation.alpha;
    if (deltaAlpha > 180) deltaAlpha -= 360;
    if (deltaAlpha < -180) deltaAlpha += 360;

    const deltaBeta = currentBeta - point.anchorOrientation.beta;
    const deltaGamma = currentGamma - point.anchorOrientation.gamma;

    // Convert angular deltas to normalized screen offsets using camera FOV
    // This is physically correct: 1° of rotation = 1/FOV of the screen
    const hFov = CAMERA_FOV; // Horizontal FOV
    const aspect = window.innerWidth / window.innerHeight;
    const vFov = 2 * Math.atan(Math.tan(hFov * Math.PI / 360) / aspect) * 180 / Math.PI;

    // Phone yaws right (+alpha) → things move left on screen → negative X offset
    let targetOffsetX = -(deltaAlpha / hFov);
    // Phone tilts up (+beta) → things move down on screen → positive Y offset
    let targetOffsetY = (deltaBeta / vFov);

    // Initialize smoothed offset if not present
    if (point.smoothedOffsetX === undefined) {
      point.smoothedOffsetX = 0;
      point.smoothedOffsetY = 0;
    }

    // Responsive smoothing (0.35 = good balance for corner placement)
    const smoothFactor = 0.35;
    point.smoothedOffsetX += (targetOffsetX - point.smoothedOffsetX) * smoothFactor;
    point.smoothedOffsetY += (targetOffsetY - point.smoothedOffsetY) * smoothFactor;

    // Calculate new position (NO clamping — corners can go off-screen, which is correct
    // when you turn the phone away from where you placed the corner)
    const newX = (point.normalizedX + point.smoothedOffsetX) * window.innerWidth;
    const newY = (point.normalizedY + point.smoothedOffsetY) * window.innerHeight;

    // Update stored position for line drawing and corner calculation
    point.x = newX;
    point.y = newY;

    // Update marker position
    if (marker) {
      marker.style.left = `${newX}px`;
      marker.style.top = `${newY}px`;

      // Indicate if marker is off-screen
      const isOffScreen = newX < -20 || newX > window.innerWidth + 20 ||
                          newY < -20 || newY > window.innerHeight + 20;
      marker.classList.toggle('off-screen', isOffScreen);
    }

    markersUpdated = true;
  }

  // Redraw lines if markers moved
  if (markersUpdated && cornerPoints.length > 1) {
    drawCornerLines();
  }
}

/**
 * Draw lines connecting corner points
 */
function drawCornerLines() {
  const container = document.getElementById('ar-corner-markers');
  if (!container) return;

  // Remove existing lines
  container.querySelectorAll('.ar-corner-line').forEach(l => l.remove());

  // Draw lines between consecutive points (and close the shape if 4 points)
  for (let i = 0; i < cornerPoints.length; i++) {
    const p1 = cornerPoints[i];
    const p2 = cornerPoints[(i + 1) % cornerPoints.length];

    // Only draw if we have a next point
    if (i < cornerPoints.length - 1 || cornerPoints.length === CORNER_COUNT) {
      const line = document.createElement('div');
      line.className = 'ar-corner-line';

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);

      line.style.left = `${p1.x}px`;
      line.style.top = `${p1.y}px`;
      line.style.width = `${length}px`;
      line.style.transform = `rotate(${angle}deg)`;

      container.appendChild(line);
    }
  }
}

/**
 * Clear all corner markers and lines
 */
function clearCornerMarkers() {
  const container = document.getElementById('ar-corner-markers');
  if (container) {
    container.innerHTML = '';
  }
}

/**
 * Reset corner points and start over
 */
function resetCornerPoints() {
  console.log('[AR View] Resetting corner points');
  cornerPoints = [];
  clearCornerMarkers();
  updateCornerModeUI();
}

/**
 * Update the corner mode UI based on current state
 */
function updateCornerModeUI() {
  const textEl = document.getElementById('ar-corner-mode-text');
  const doneBtn = document.getElementById('ar-corner-done-btn');
  const dots = document.querySelectorAll('.ar-corner-dot');

  // Update hint text
  if (textEl) {
    const remaining = CORNER_COUNT - cornerPoints.length;
    if (remaining > 0) {
      textEl.textContent = remaining === 4
        ? 'Отметьте 4 угла стены (в любом порядке)'
        : remaining === 1
          ? 'Последний угол...'
          : `Осталось ${remaining} угла`;
    } else {
      textEl.textContent = 'Углы отмечены — нажмите "Готово"';
    }
  }

  // Update done button
  if (doneBtn) {
    doneBtn.disabled = cornerPoints.length < CORNER_COUNT;
  }

  // Update progress dots
  dots.forEach((dot, i) => {
    dot.classList.remove('placed', 'active');
    if (i < cornerPoints.length) {
      dot.classList.add('placed');
    } else if (i === cornerPoints.length) {
      dot.classList.add('active');
    }
  });
}

/**
 * Sort 4 corner points into consistent order: top-left, top-right, bottom-right, bottom-left
 * This allows users to place corners in any order
 */
function sortCornerPoints(points) {
  if (points.length !== 4) return points;

  // Make a copy to avoid modifying original during sorting
  const pts = points.map((p, i) => ({ ...p, originalIndex: i }));

  // Find centroid
  const cx = pts.reduce((sum, p) => sum + p.x, 0) / 4;
  const cy = pts.reduce((sum, p) => sum + p.y, 0) / 4;

  // Calculate angle from centroid for each point
  pts.forEach(p => {
    p.angle = Math.atan2(p.y - cy, p.x - cx);
  });

  // Sort by angle (clockwise from top-left which is at ~-135°)
  pts.sort((a, b) => a.angle - b.angle);

  // Find the point closest to top-left position (smallest x+y or most negative angle)
  // Top-left has negative x and negative y relative to center
  let topLeftIndex = 0;
  let minSum = Infinity;
  pts.forEach((p, i) => {
    const sum = p.x + p.y; // Top-left will have smallest sum
    if (sum < minSum) {
      minSum = sum;
      topLeftIndex = i;
    }
  });

  // Rotate array so top-left is first, maintaining clockwise order
  const sorted = [];
  for (let i = 0; i < 4; i++) {
    sorted.push(pts[(topLeftIndex + i) % 4]);
  }

  // Order should now be: top-left, bottom-left, bottom-right, top-right (clockwise from TL)
  // But we want: top-left, top-right, bottom-right, bottom-left
  // So swap indices 1 and 3
  return [sorted[0], sorted[3], sorted[2], sorted[1]];
}

/**
 * Apply perspective transformation from 4 corner points
 * Uses homography to calculate wall plane orientation and scale
 * Corners can be placed in any order - they are auto-sorted
 */
function applyCornerPerspective() {
  if (cornerPoints.length !== CORNER_COUNT) {
    console.warn('[AR View] Need exactly 4 corners');
    return;
  }

  // Auto-sort corners into correct order (TL, TR, BR, BL)
  const sortedCorners = sortCornerPoints(cornerPoints);

  console.log('[AR View] Applying corner perspective from sorted points:', sortedCorners);

  // Calculate centroid (center of wall)
  const centerX = sortedCorners.reduce((sum, p) => sum + p.x, 0) / CORNER_COUNT;
  const centerY = sortedCorners.reduce((sum, p) => sum + p.y, 0) / CORNER_COUNT;

  // Use sorted corners: top-left, top-right, bottom-right, bottom-left
  const topLeft = sortedCorners[0];
  const topRight = sortedCorners[1];
  const bottomRight = sortedCorners[2];
  const bottomLeft = sortedCorners[3];

  // Calculate perspective from trapezoid shape
  // Horizontal vanishing point: where left and right edges converge
  const leftEdgeDx = bottomLeft.x - topLeft.x;
  const leftEdgeDy = bottomLeft.y - topLeft.y;
  const rightEdgeDx = bottomRight.x - topRight.x;
  const rightEdgeDy = bottomRight.y - topRight.y;

  // Calculate wall angle from edge convergence
  // If right edge tilts inward more than left, wall faces left
  const topWidth = topRight.x - topLeft.x;
  const bottomWidth = bottomRight.x - bottomLeft.x;
  const avgWidth = (topWidth + bottomWidth) / 2;
  const widthRatio = topWidth / Math.max(bottomWidth, 1);

  // Convert ratio to angle (approximate)
  // widthRatio > 1 means top is wider = looking from below
  // widthRatio < 1 means bottom is wider = looking from above
  const verticalAngle = Math.atan2(widthRatio - 1, 2) * 0.7; // Scale for better visual match

  // Calculate horizontal perspective
  const leftHeight = Math.sqrt(leftEdgeDx * leftEdgeDx + leftEdgeDy * leftEdgeDy);
  const rightHeight = Math.sqrt(rightEdgeDx * rightEdgeDx + rightEdgeDy * rightEdgeDy);
  const avgHeight = (leftHeight + rightHeight) / 2;
  const heightRatio = leftHeight / Math.max(rightHeight, 1);

  // heightRatio > 1 means left side is longer = wall faces right
  // heightRatio < 1 means right side is longer = wall faces left
  const horizontalAngle = Math.atan2(heightRatio - 1, 2) * 0.7;

  // Estimate wall distance based on the quadrilateral size
  // Assume the marked area represents approximately 1-2 meters of real wall
  const screenDiagonal = Math.sqrt(window.innerWidth ** 2 + window.innerHeight ** 2);
  const quadDiagonal = Math.sqrt(avgWidth ** 2 + avgHeight ** 2);
  const sizeRatio = quadDiagonal / screenDiagonal;

  // Map size ratio to distance (larger quad = closer wall)
  // sizeRatio 0.3 -> 3m, sizeRatio 0.8 -> 0.8m
  const estimatedDistance = Math.max(0.8, Math.min(3.0, 2.5 / Math.max(sizeRatio, 0.2)));

  console.log('[AR View] Calculated wall angles:', {
    horizontal: (horizontalAngle * 180 / Math.PI).toFixed(1) + '°',
    vertical: (verticalAngle * 180 / Math.PI).toFixed(1) + '°',
    distance: estimatedDistance.toFixed(2) + 'm'
  });

  // Store detected wall plane info using sorted corners
  detectedWallPlane = {
    corners: sortedCorners.slice(),
    center: { x: centerX, y: centerY },
    horizontalAngle: horizontalAngle,
    verticalAngle: verticalAngle,
    estimatedDistance: estimatedDistance,
    confidence: 1.0 // Manual placement = high confidence
  };

  // Apply the wall orientation (both target and current for immediate effect)
  targetWallAngleY = horizontalAngle;
  targetWallAngleX = verticalAngle;
  targetWallConfidence = 1.0;
  detectedWallAngleY = horizontalAngle;
  detectedWallAngleX = verticalAngle;
  wallOrientationConfidence = 1.0;

  // Set wall distance
  targetWallDistance = estimatedDistance;
  virtualWallDistance = estimatedDistance;
  anchoredWallDistance = estimatedDistance;

  // Calculate poster scale based on distance
  if (isDepthSystemReady && DepthEstimation.isReady()) {
    targetPosterScale = DepthEstimation.calculatePosterScale(estimatedDistance, currentSize, CAMERA_FOV);
    posterScale = targetPosterScale;
  }

  // Place poster at center of defined wall area
  placementPosition.x = centerX;
  placementPosition.y = centerY;
  isPlaced = true;

  // Capture placement orientation for world-anchored tracking
  captureWallPlacementOrientation();

  // Update poster with new perspective
  if (posterGroup) {
    posterGroup.visible = true;
  }
  updatePosterPosition();
  updateAutoPerspective();

  // Exit corner mode
  exitCornerMode();

  // Hide tap to place hint since we've placed
  hideTapToPlaceHint();
}

// ============ SEARCH MODAL ============

let searchTimeout = null;

function openSearchModal() {
  const modal = document.getElementById('ar-search-modal');
  if (modal) {
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    setTimeout(() => {
      document.getElementById('ar-search-input')?.focus();
    }, 100);

    clearSearchResults();
  }
}

function closeSearchModal() {
  const modal = document.getElementById('ar-search-modal');
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }

  const input = document.getElementById('ar-search-input');
  if (input) {
    input.value = '';
  }
}

function clearSearchResults() {
  const resultsContainer = document.getElementById('ar-search-results');
  if (resultsContainer) {
    resultsContainer.innerHTML = '<div class="ar-search-empty">Начните вводить для поиска</div>';
  }
}

function handleSearchInput(e) {
  const query = e.target.value.trim();

  const clearBtn = document.getElementById('ar-search-clear');
  if (clearBtn) {
    clearBtn.style.display = query.length > 0 ? 'flex' : 'none';
  }

  clearTimeout(searchTimeout);

  if (query.length < 2) {
    clearSearchResults();
    return;
  }

  searchTimeout = setTimeout(() => {
    performSearch(query);
  }, 300);
}

function performSearch(query) {
  const queryLower = query.toLowerCase();

  const results = allProducts.filter(product => {
    const title = product.title?.toLowerCase() || '';
    const alt = product.alt?.toLowerCase() || '';
    const keywords = product.key_word?.toLowerCase() || '';

    return title.includes(queryLower) ||
           alt.includes(queryLower) ||
           keywords.includes(queryLower);
  }).slice(0, 15);

  renderSearchResults(results);
}

function renderSearchResults(products) {
  const resultsContainer = document.getElementById('ar-search-results');
  if (!resultsContainer) return;

  if (products.length === 0) {
    resultsContainer.innerHTML = '<div class="ar-search-empty">Ничего не найдено</div>';
    return;
  }

  const html = products.map(product => {
    const imageUrl = product.images?.[0]?.url || product.image || '';
    const imageSrc = imageUrl ? addImageSize(imageUrl, '120x0') : '';

    return `
      <div class="ar-search-result-item" data-product-id="${product.id}">
        ${imageSrc ?
          `<img src="${imageSrc}" alt="" class="ar-search-result-image" loading="lazy">` :
          `<div class="ar-search-result-image"></div>`
        }
        <div class="ar-search-result-info">
          <div class="ar-search-result-title">${product.title}</div>
          <div class="ar-search-result-subtitle">${product.genre || ''}</div>
        </div>
      </div>
    `;
  }).join('');

  resultsContainer.innerHTML = html;

  resultsContainer.querySelectorAll('.ar-search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const productId = item.dataset.productId;
      selectProduct(productId);
    });
  });
}

async function selectProduct(productId) {
  closeSearchModal();

  // Temporarily hide poster while loading new one
  if (posterGroup) {
    posterGroup.visible = false;
  }

  await loadProduct(productId);

  // Re-place the poster to continue perspective tracking
  // Keep the same position and wall orientation
  isPlaced = true;
  if (posterGroup) {
    posterGroup.visible = true;
    updatePosterPosition();
  }
}

function clearSearch() {
  const input = document.getElementById('ar-search-input');
  if (input) {
    input.value = '';
    input.focus();
  }

  const clearBtn = document.getElementById('ar-search-clear');
  if (clearBtn) {
    clearBtn.style.display = 'none';
  }

  clearSearchResults();
}

// ============ NAVIGATION ============

function goBack() {
  cleanup();

  if (currentProduct) {
    // Use full page navigation - AR has different HTML structure than SPA pages
    const productUrl = `/product/${currentProduct.slug || currentProduct.id}`;
    window.location.href = productUrl;
  } else {
    window.history.back();
  }
}

function goToProduct() {
  if (!currentProduct) return;

  cleanup();

  // Use full page navigation - AR has different HTML structure than SPA pages
  const productUrl = `/product/${currentProduct.slug || currentProduct.id}`;
  window.location.href = productUrl;
}

async function cleanup() {
  console.log('[AR View] Cleaning up...');

  // Remove body class for AR-specific styles
  document.body.classList.remove('ar-page-active');

  // Remove visibility handler
  document.removeEventListener('visibilitychange', handleVisibilityChange);

  await stopWebXRSession();
  stopCamera();
  stopRenderLoop();
  stopDepthTracking();
  DepthEstimation.dispose();
  ARTracking.dispose();
  disposeThreeJS();

  // Remove all event listeners
  removeAllEventListeners();

  // Reset ALL state variables to defaults
  isInitialized = false;
  isDepthSystemReady = false;
  sourceMode = null;
  isPlaced = false;
  initialOrientation = null;
  customPosterImage = null;
  currentProduct = null;
  currentVariantImages = [];
  isTriptych = false;
  currentSize = 'A2';
  currentFrame = 'none';
  posterScale = 1;
  virtualWallDistance = 1.5;
  targetWallDistance = 1.5;
  targetPosterScale = 1.0;
  wallPlacementOrientation = null;
  detectedWallAngleY = 0;
  detectedWallAngleX = 0;
  wallOrientationConfidence = 0;
  targetWallAngleY = 0;
  targetWallAngleX = 0;
  targetWallConfidence = 0;
  detectedWallPlane = null;
  anchoredWorldPosition = { x: 0.5, y: 0.5 };
  anchoredWallDistance = 1.5;
  deviceOrientation = { alpha: 0, beta: 0, gamma: 0 };
  smoothedOrientation = { alpha: 0, beta: 0, gamma: 0 };
  orientationVelocity = { alpha: 0, beta: 0, gamma: 0 };
  smoothedOffsetX = 0;
  smoothedOffsetY = 0;
  lastOrientationTime = 0;
  hasValidOrientation = false;
  visualTrackingResult = null;

  // Reset optical flow tracking
  if (isDepthSystemReady) {
    DepthEstimation.resetTracking();
  }
  placementPosition = { x: 0, y: 0, z: -2 };
  isDragging = false;
  hasDragged = false;
  isControlsCollapsed = true;
  isWebXRActive = false;
  isWebXRSupported = false;

  // Reset UI elements
  const mainContainer = document.getElementById('ar-main-container');
  const permissionScreen = document.getElementById('ar-permission-screen');
  if (mainContainer) mainContainer.style.display = 'none';
  if (permissionScreen) permissionScreen.style.display = 'flex';

  console.log('[AR View] Cleanup complete');
}


// ============ UTILITIES ============

function addImageSize(url, size) {
  if (!url) return url;
  const urlStr = String(url);
  if (urlStr.includes('cs=')) {
    return urlStr.replace(/cs=\d+x\d+/, `cs=${size}`);
  }
  const separator = urlStr.includes('?') ? '&' : '?';
  return `${urlStr}${separator}cs=${size}`;
}

function showError(message) {
  if (typeof window.showToast === 'function') {
    window.showToast(message, 'error');
  } else {
    alert(message);
  }
}

// ============ CAMERA RESTART PROMPT ============

function showCameraRestartPrompt() {
  let prompt = document.getElementById('ar-camera-restart-prompt');
  if (!prompt) {
    prompt = document.createElement('div');
    prompt.id = 'ar-camera-restart-prompt';
    prompt.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 24px 32px;
      border-radius: 16px;
      text-align: center;
      z-index: 1000;
      backdrop-filter: blur(10px);
    `;
    prompt.innerHTML = `
      <p style="margin: 0 0 16px 0; font-size: 16px;">Камера отключена</p>
      <button id="ar-restart-camera-btn" style="
        background: #ff9500;
        color: black;
        border: none;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
      ">Включить камеру</button>
    `;
    document.body.appendChild(prompt);

    document.getElementById('ar-restart-camera-btn').addEventListener('click', () => {
      hideCameraRestartPrompt();
      requestCameraAccess().then(() => {
        startRenderLoop();
      }).catch(err => {
        console.error('[AR View] Failed to restart camera:', err);
        showError('Не удалось включить камеру');
      });
    });
  }
  prompt.style.display = 'block';
}

function hideCameraRestartPrompt() {
  const prompt = document.getElementById('ar-camera-restart-prompt');
  if (prompt) {
    prompt.style.display = 'none';
  }
}

// ============ EVENT LISTENERS ============

// Helper to add event listener and store reference for cleanup
function addListener(element, event, handler, options) {
  if (!element) return;
  element.addEventListener(event, handler, options);
  eventListeners.push({ element, event, handler, options });
}

// Named handlers for proper cleanup
function handleGrantCameraClick() {
  console.log('[AR View] Camera button clicked');
  requestCameraAccess().catch(error => {
    console.error('[AR View] Unhandled error in camera access:', error);
    showError('Ошибка при доступе к камере. Пожалуйста, попробуйте еще раз.');
  });
}

function handleUploadImageClick() {
  console.log('[AR View] Upload wall image button clicked');
  document.getElementById('ar-wall-image-input')?.click();
}

function handleUploadPosterClick() {
  console.log('[AR View] Upload poster button clicked');
  document.getElementById('ar-poster-image-input')?.click();
}

function handleSwitchToCameraClick() {
  console.log('[AR View] Switching from image to camera mode');

  // Hide the image
  const wallImage = document.getElementById('ar-wall-image');
  if (wallImage) {
    wallImage.style.display = 'none';
  }

  // Request camera access (this will show the video feed)
  requestCameraAccess().catch(error => {
    console.error('[AR View] Unhandled error switching to camera:', error);
    showError('Ошибка при доступе к камере. Пожалуйста, попробуйте еще раз.');
    // Show the image again if camera access failed
    if (wallImage) {
      wallImage.style.display = 'block';
    }
  });

  // Update button visibility
  updateCameraButtonVisibility();
}

function updateCameraButtonVisibility() {
  const cameraBtn = document.getElementById('ar-collapsed-camera-btn');
  const uploadBtn = document.getElementById('ar-collapsed-upload-btn');

  if (cameraBtn) {
    // Show camera button only in image mode
    cameraBtn.style.display = sourceMode === 'image' ? 'flex' : 'none';
  }
  if (uploadBtn) {
    // Show upload button in camera mode or when no source
    uploadBtn.style.display = sourceMode !== 'image' ? 'flex' : 'none';
  }
}

function handleKeydown(e) {
  if (e.key === 'Escape') {
    const modal = document.getElementById('ar-search-modal');
    if (modal && modal.style.display !== 'none') {
      closeSearchModal();
    } else {
      goBack();
    }
  }
}

function handleWindowResize() {
  handleResize();
  if (sourceMode && !isWebXRActive) {
    updatePosterPosition();
  }
}

function setupEventListeners() {
  // Clear any existing listeners first
  removeAllEventListeners();

  // Permission screen
  const grantBtn = document.getElementById('ar-grant-camera-btn');
  const uploadWallBtn = document.getElementById('ar-upload-image-btn');
  const uploadPosterBtn = document.getElementById('ar-upload-poster-btn');

  console.log('[AR View] Setting up event listeners - buttons found:', {
    grantBtn: !!grantBtn,
    uploadWallBtn: !!uploadWallBtn,
    uploadPosterBtn: !!uploadPosterBtn
  });

  addListener(grantBtn, 'click', handleGrantCameraClick);
  addListener(uploadWallBtn, 'click', handleUploadImageClick);
  addListener(uploadPosterBtn, 'click', handleUploadPosterClick);
  addListener(document.getElementById('ar-wall-image-input'), 'change', handleImageUpload);
  addListener(document.getElementById('ar-poster-image-input'), 'change', handlePosterUpload);

  // Top bar controls
  addListener(document.getElementById('ar-back-btn'), 'click', goBack);

  // Collapse toggle
  addListener(document.getElementById('ar-collapse-btn'), 'click', toggleControls);

  // Collapsed view buttons
  addListener(document.getElementById('ar-collapsed-search-btn'), 'click', openSearchModal);
  addListener(document.getElementById('ar-collapsed-product-btn'), 'click', goToProduct);
  addListener(document.getElementById('ar-collapsed-upload-btn'), 'click', handleUploadImageClick);
  addListener(document.getElementById('ar-collapsed-camera-btn'), 'click', handleSwitchToCameraClick);
  addListener(document.getElementById('ar-corner-mode-btn'), 'click', enterCornerMode);

  // Corner mode buttons
  addListener(document.getElementById('ar-corner-reset-btn'), 'click', resetCornerPoints);
  addListener(document.getElementById('ar-corner-done-btn'), 'click', applyCornerPerspective);
  addListener(document.getElementById('ar-corner-cancel-btn'), 'click', exitCornerMode);

  // Size and frame controls
  addListener(document.getElementById('ar-size-buttons'), 'click', handleSizeChange);
  addListener(document.getElementById('ar-frame-buttons'), 'click', handleFrameChange);
  addListener(document.getElementById('ar-gap-slider'), 'input', handleGapChange);

  // Action buttons in expanded view
  addListener(document.getElementById('ar-search-btn'), 'click', openSearchModal);
  addListener(document.getElementById('ar-go-to-product-btn'), 'click', goToProduct);

  // Search modal
  addListener(document.getElementById('ar-search-modal-backdrop'), 'click', closeSearchModal);
  addListener(document.getElementById('ar-search-modal-close'), 'click', closeSearchModal);
  addListener(document.getElementById('ar-search-input'), 'input', handleSearchInput);
  addListener(document.getElementById('ar-search-clear'), 'click', clearSearch);

  // Keyboard
  addListener(document, 'keydown', handleKeydown);

  // Poster interaction (fallback mode)
  setupPosterInteraction();

  // Window events
  addListener(window, 'resize', handleWindowResize);

  // Visibility change
  addListener(document, 'visibilitychange', handleVisibilityChange);

  // Page unload events - ensure camera is properly released
  addListener(window, 'beforeunload', cleanup);
  addListener(window, 'pagehide', handlePageHide);
  addListener(window, 'unload', stopCamera);
}

// Synchronous cleanup for page navigation
function handlePageHide(e) {
  console.log('[AR View] Page hide event, persisted:', e.persisted);
  // Always stop camera on pagehide to release it
  stopCamera();
}

function removeAllEventListeners() {
  for (const { element, event, handler, options } of eventListeners) {
    try {
      element?.removeEventListener(event, handler, options);
    } catch (e) {
      // Ignore errors during cleanup
    }
  }
  eventListeners = [];
}

// ============ PAGE REGISTRATION ============

if (typeof window.registerPage === 'function') {
  window.registerPage('/ar-view', {
    init: init,
    cleanup: cleanup
  });
}

// Auto-initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export default {
  init,
  loadProduct,
  openSearchModal
};
