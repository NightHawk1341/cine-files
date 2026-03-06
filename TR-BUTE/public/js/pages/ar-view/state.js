// ============================================================
// AR VIEW - Shared State Module
// All module-level state variables used across sub-modules
// ============================================================

// Size definitions in cm (width x height for portrait)
export const SIZE_DEFINITIONS = {
  'A3': { width: 29.7, height: 42.0 },
  'A2': { width: 42.0, height: 59.4 },
  'A1': { width: 59.4, height: 84.1 }
};

// Camera FOV (typical smartphone camera - most have 70-80 FOV)
export const CAMERA_FOV = 75;
export const ESTIMATED_WALL_DISTANCE = 1.5; // meters

// Camera permission storage key
export const CAMERA_PERMISSION_KEY = 'ar-camera-permission-granted';

// Corner count constant
export const CORNER_COUNT = 4;

// Tracking stabilization constants
export const ORIENTATION_SMOOTH_FACTOR = 0.5;
export const ORIENTATION_VELOCITY_DECAY = 0.7;
export const DEPTH_SMOOTH_FACTOR = 0.15;
export const ANGLE_SMOOTH_FACTOR = 0.2;
export const SCALE_SMOOTH_FACTOR = 0.15;
export const JITTER_THRESHOLD = 0.5;
export const POSITION_DEAD_ZONE = 0.005;

// Depth update frequency
export const DEPTH_UPDATE_FREQUENCY = 500;

// Mutable shared state object
// All sub-modules read/write to this object
const state = {
  // Depth estimation state
  isDepthSystemReady: false,
  depthUpdateInterval: null,

  // Product state
  currentProduct: null,
  currentVariantImages: [],
  isTriptych: false,
  currentSize: 'A2',
  currentFrame: 'none',
  triptychGap: 2, // cm
  allProducts: [],

  // Camera state
  cameraStream: null,
  mainCameraId: null,

  // Three.js state
  scene: null,
  camera: null,
  renderer: null,
  posterGroup: null,
  posterTextures: [],
  animationFrameId: null,

  // Additional lights
  fillLight: null,
  rimLight: null,
  ambientLight: null,
  directionalLight: null,
  environmentBrightness: 0.5,

  // WebXR state
  xrSession: null,
  xrRefSpace: null,
  xrHitTestSource: null,
  xrHitTestSourceRequested: false,
  reticle: null,
  isWebXRSupported: false,
  isWebXRActive: false,

  // WebXR auto-placement state
  xrAutoPlacementEnabled: true,
  xrStableHitCount: 0,
  xrLastHitPose: null,
  xrAutoPlaceThreshold: 10,
  xrPlacementHintTimeout: null,

  // AR tracking state (fallback mode)
  isPlaced: false,
  placementPosition: { x: 0, y: 0, z: -2 },
  deviceOrientation: { alpha: 0, beta: 0, gamma: 0 },
  smoothedOrientation: { alpha: 0, beta: 0, gamma: 0 },
  orientationVelocity: { alpha: 0, beta: 0, gamma: 0 },
  lastOrientationTime: 0,
  initialOrientation: null,
  orientationSupported: false,
  hasValidOrientation: false,

  // Automatic perspective transform state
  virtualWallDistance: 1.5,
  wallPlacementOrientation: null,

  // Detected wall orientation from depth/edge analysis (radians)
  detectedWallAngleY: 0,
  detectedWallAngleX: 0,
  detectedCameraRoll: 0,
  wallOrientationConfidence: 0,

  // Smoothed target values from depth estimation
  targetWallAngleY: 0,
  targetWallAngleX: 0,
  targetCameraRoll: 0,
  targetWallConfidence: 0,

  // Smoothed position offset for world-anchored tracking
  smoothedOffsetX: 0,
  smoothedOffsetY: 0,

  // Wall plane detection
  detectedWallPlane: null,

  // Source mode: 'camera', 'image', or 'webxr'
  sourceMode: null,

  // Interaction state
  isDragging: false,
  hasDragged: false,
  dragStart: { x: 0, y: 0 },
  initialPinchDistance: 0,
  pinchStartScale: 1,
  posterScale: 1,

  // Controls collapsed state
  isControlsCollapsed: true,

  // Corner placement mode state
  isCornerModeActive: false,
  cornerPoints: [],

  // Initialization guard
  isInitialized: false,

  // Event listener references for cleanup
  eventListeners: [],

  // World-anchored poster position
  anchoredWorldPosition: { x: 0.5, y: 0.5 },

  // Locked wall distance at time of placement
  anchoredWallDistance: 1.5,

  // Locked poster scale at time of placement
  anchoredPosterScale: 1.0,

  // Camera state tracking (accumulated from gyro)
  cameraState: {
    panX: 0,
    panY: 0,
    roll: 0
  },

  // Environment calibration state
  isEnvironmentCalibrated: false,
  calibrationData: {
    baseGamma: 0,
    baseBeta: 90,
    baseAlpha: 0,
    detectedFOV: 75,
    wallAngleY: 0,
    wallAngleX: 0
  },

  // Tracking results from optical flow (legacy, kept for compatibility)
  visualTrackingResult: null,

  // Offset from tracked features to user's tap point
  trackingOffset: { x: 0, y: 0 },

  // Last known good tracking position
  lastGoodTrackPosition: null,
  trackingLostFrames: 0,

  // Target values for smooth interpolation
  targetWallDistance: 1.5,
  targetPosterScale: 1.0,

  // Cached canvas for environment sampling
  envSampleCanvas: null,
  envSampleCtx: null,
  lastEnvUpdate: 0,

  // Custom poster image (user uploaded)
  customPosterImage: null,

  // Flag to prevent double processing
  isProcessingUpload: false,

  // Search timeout
  searchTimeout: null
};

export const TRACKING_RECOVERY_FRAMES = 30;
export const ENV_UPDATE_INTERVAL = 200;

export default state;
