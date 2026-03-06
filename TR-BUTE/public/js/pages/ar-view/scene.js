// ============================================================
// AR VIEW - Three.js Scene Module
// Scene initialization, lighting, environment map, dispose
// ============================================================

import state, { CAMERA_FOV } from './state.js';

// ============ THREE.JS INITIALIZATION ============

export function initThreeJS(forWebXR = false) {
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
    state.scene = new THREE.Scene();

    if (forWebXR) {
      // For WebXR, camera is managed by the XR system
      state.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
    } else {
      // For fallback mode, create our own camera
      const aspect = window.innerWidth / window.innerHeight;
      state.camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, 0.1, 100);
      state.camera.position.set(0, 0, 0);
    }

    // Create renderer
    state.renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    state.renderer.setSize(window.innerWidth, window.innerHeight);
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    state.renderer.outputColorSpace = THREE.SRGBColorSpace;
    state.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    state.renderer.toneMappingExposure = 1.0;

    if (forWebXR) {
      state.renderer.xr.enabled = true;
    }

    // Create poster group
    state.posterGroup = new THREE.Group();
    state.posterGroup.visible = false; // Hidden until placed
    state.scene.add(state.posterGroup);

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

export function createReticle() {
  // Create a ring reticle to show where surfaces are detected
  const ringGeometry = new THREE.RingGeometry(0.1, 0.12, 32);
  ringGeometry.rotateX(-Math.PI / 2); // Lay flat

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide
  });

  state.reticle = new THREE.Mesh(ringGeometry, ringMaterial);
  state.reticle.matrixAutoUpdate = false;
  state.reticle.visible = false;
  state.scene.add(state.reticle);

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
  state.reticle.add(crosshair);
}

function setupLighting() {
  // Ambient light - provides base illumination
  state.ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  state.scene.add(state.ambientLight);

  // Main directional light (simulates room light from above-front)
  state.directionalLight = new THREE.DirectionalLight(0xffffff, 0.7);
  state.directionalLight.position.set(1, 2, 3);
  state.scene.add(state.directionalLight);

  // Fill light (softer, from the side)
  state.fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
  state.fillLight.position.set(-2, 0, 2);
  state.scene.add(state.fillLight);

  // Rim light (from behind, creates edge highlight on frame)
  state.rimLight = new THREE.DirectionalLight(0xffffff, 0.15);
  state.rimLight.position.set(0, 1, -2);
  state.scene.add(state.rimLight);

  // Hemisphere light for more natural ambient
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
  hemiLight.position.set(0, 20, 0);
  state.scene.add(hemiLight);

  // Create simple environment map for metallic reflections
  createEnvironmentMap();
}

// Create a simple procedural environment map for reflections
function createEnvironmentMap() {
  if (!state.renderer) return;

  // Create a simple gradient environment using a small render target
  const pmremGenerator = new THREE.PMREMGenerator(state.renderer);
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
  state.scene.environment = pmremGenerator.fromEquirectangular(envTexture).texture;

  envTexture.dispose();
  pmremGenerator.dispose();
}

export function handleResize() {
  if (!state.camera || !state.renderer) return;

  const width = window.innerWidth;
  const height = window.innerHeight;

  state.camera.aspect = width / height;
  state.camera.updateProjectionMatrix();

  state.renderer.setSize(width, height);
}

export function disposeThreeJS() {
  if (state.animationFrameId) {
    cancelAnimationFrame(state.animationFrameId);
    state.animationFrameId = null;
  }

  if (state.posterGroup) {
    state.posterGroup.traverse((object) => {
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

  state.posterTextures.forEach(texture => texture.dispose());
  state.posterTextures = [];

  if (state.renderer) {
    state.renderer.dispose();
    state.renderer = null;
  }

  state.scene = null;
  state.camera = null;
  state.posterGroup = null;
  state.reticle = null;

  // Reset WebXR auto-placement state
  state.xrAutoPlacementEnabled = true;
  state.xrStableHitCount = 0;
  state.xrLastHitPose = null;
}

// ============ ENVIRONMENT LIGHTING ============

export function updateEnvironmentLighting() {
  const video = document.getElementById('ar-camera-video');
  if (!video || video.readyState < 2) return;

  // Throttle updates
  const now = Date.now();
  if (now - state.lastEnvUpdate < 200) return;
  state.lastEnvUpdate = now;

  // Create cached canvas if needed
  if (!state.envSampleCanvas) {
    state.envSampleCanvas = document.createElement('canvas');
    state.envSampleCanvas.width = 16;
    state.envSampleCanvas.height = 16;
    state.envSampleCtx = state.envSampleCanvas.getContext('2d', { willReadFrequently: true });
  }

  try {
    state.envSampleCtx.drawImage(video, 0, 0, 16, 16);
    const imageData = state.envSampleCtx.getImageData(0, 0, 16, 16);
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
    state.environmentBrightness = (totalBrightness / sampleCount) / 255;

    // Calculate color temperature (warm vs cool)
    const warmth = (avgR - avgB) / 255;
    const tint = (avgG - (avgR + avgB) / 2) / 255;

    // Normalize environment color for tinting
    const envColorIntensity = Math.max(avgR, avgG, avgB) || 1;
    const normalizedR = avgR / envColorIntensity;
    const normalizedG = avgG / envColorIntensity;
    const normalizedB = avgB / envColorIntensity;

    // Create environment-matched colors with stronger response
    const baseIntensity = 0.25 + state.environmentBrightness * 0.75;

    // Adjust ambient light
    if (state.ambientLight) {
      state.ambientLight.intensity = baseIntensity * 0.65;
      const envBlend = 0.25;
      const r = Math.min(1, (1 - envBlend) + normalizedR * envBlend + warmth * 0.15);
      const g = Math.min(1, (1 - envBlend) + normalizedG * envBlend + tint * 0.1);
      const b = Math.min(1, (1 - envBlend) + normalizedB * envBlend - warmth * 0.15);
      state.ambientLight.color.setRGB(r, g, b);
    }

    // Adjust main light
    if (state.directionalLight) {
      state.directionalLight.intensity = baseIntensity * 0.85;
      const r = Math.min(1, 1 + warmth * 0.2);
      const g = 0.98 + tint * 0.05;
      const b = Math.min(1, 1 - warmth * 0.2);
      state.directionalLight.color.setRGB(r, g, b);
    }

    // Adjust fill light
    if (state.fillLight) {
      state.fillLight.intensity = baseIntensity * 0.4;
      const r = Math.min(1, 0.9 + warmth * 0.1);
      const b = Math.min(1, 0.9 - warmth * 0.1);
      state.fillLight.color.setRGB(r, 0.95, b);
    }

    // Adjust rim light
    if (state.rimLight) {
      state.rimLight.intensity = 0.12 + (1 - state.environmentBrightness) * 0.18;
    }

  } catch (e) {
    // Canvas security error - silent fail
  }
}
