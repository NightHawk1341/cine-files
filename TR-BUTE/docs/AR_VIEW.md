# AR View Feature

> **Last Updated:** January 14, 2026

This document describes the Augmented Reality (AR) poster visualization feature of the TR-BUTE platform.

---

## Table of Contents

1. [Overview](#overview)
2. [Technology Stack](#technology-stack)
3. [Input Modes](#input-modes)
4. [Features](#features)
5. [User Flow](#user-flow)
6. [Technical Implementation](#technical-implementation)
7. [Files](#files)

---

## Overview

The AR View feature allows users to visualize posters on their walls before purchasing. Users can:
- Use their device camera to see posters in real-time on walls
- Upload a photo of their wall and place posters on it
- Upload custom poster images for visualization
- Adjust poster size (A3, A2, A1) and frame options
- Define wall perspective using corner markers

---

## Technology Stack

| Technology | Purpose |
|------------|---------|
| **Three.js** | 3D rendering and scene management |
| **TensorFlow.js** | Depth estimation for wall detection |
| **TensorFlow Lite** | Lightweight model inference |
| **Canvas API** | Image processing and manipulation |
| **MediaDevices API** | Camera access |

**CDN Dependencies:**
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.17.0/dist/tf.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-tflite@0.0.1-alpha.10/dist/tf-tflite.min.js"></script>
```

---

## Input Modes

### 1. Camera Mode (Live AR)
- Real-time camera feed as background
- Tap to place poster on detected wall surface
- Move poster by tapping new location
- Poster scale locked at placement to prevent size changes during movement

### 2. Image Upload Mode
- Upload photo of wall from device
- Place poster on static image
- Useful when camera access is unavailable

### 3. Custom Poster Upload
- Upload custom poster image
- Visualize any image on wall
- Supports standard image formats

---

## Features

### Poster Size Selection
| Size | Dimensions |
|------|------------|
| A3 | 29.7 x 42.0 cm |
| A2 | 42.0 x 59.4 cm (default) |
| A1 | 59.4 x 84.1 cm |

### Frame Options
- **Without frame** - Poster displayed as-is
- **With frame** - Black metal frame visualization

### Triptych Support
- Multi-panel artwork support
- Adjustable gap between panels (0-10 cm)
- Gap slider control when triptych product detected

### Corner Mode (Manual Perspective)
Users can manually define wall perspective by marking 4 corners:
1. Tap to place 4 corner markers on wall edges
2. System calculates perspective transform
3. Poster rendered with correct perspective
4. Reset/cancel options available

### Depth Estimation
- TensorFlow.js-based depth model
- Edge detection for wall surface identification
- Automatic perspective adjustment based on wall angle
- Loading progress indicator during model initialization

### Optical Flow Tracking
- Tracks poster placement across video frames
- Maintains position stability during camera movement
- Scale locked at initial placement

---

## User Flow

```
1. User clicks "AR Preview" on product page
         ↓
2. Permission screen displayed
   ├── Grant camera access → Camera mode
   ├── Upload wall photo → Image mode
   └── Upload custom poster → Custom mode
         ↓
3. Depth model loads (progress indicator)
         ↓
4. AR view active
   ├── Tap to place/move poster
   ├── Adjust size (A3/A2/A1)
   ├── Toggle frame option
   └── Use corner mode for manual perspective
         ↓
5. Navigate to product page when ready to purchase
```

---

## Technical Implementation

### 3D Scene Setup (Three.js)
```javascript
// Scene, camera, renderer initialization
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, aspectRatio, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
```

### Poster Placement
- Poster rendered as textured plane in 3D space
- Position calculated based on tap coordinates
- Perspective transform applied from depth/corner data
- Scale locked at placement moment

### Wall Detection
1. Camera frame captured
2. Edge detection identifies wall boundaries
3. Depth model estimates surface plane
4. Perspective matrix calculated
5. Poster aligned to detected plane

### Corner Mode Algorithm
1. User taps 4 corner points (clockwise from top-left)
2. Homography matrix computed from corner positions
3. Poster plane transformed to match wall perspective
4. Real-time preview as corners are placed

---

## Files

### HTML
| File | Description |
|------|-------------|
| `public/pages/ar-view.html` | AR view page template |

### JavaScript
| File | Description |
|------|-------------|
| `public/js/pages/ar-view.js` | Main AR view logic |
| `public/js/modules/ar-tracking.js` | Optical flow tracking for poster movement |
| `public/js/modules/depth-estimation.js` | TensorFlow.js depth model wrapper |

### CSS
| File | Description |
|------|-------------|
| `public/css/ar-view.css` | AR view styling |

---

## UI Components

### AR Header Bar
- Back button (returns to product page)
- Product title display

### Permission Screen
- Camera permission request
- Wall image upload option
- Custom poster upload option

### Controls Panel (Collapsible)
- **Collapsed view:** Size, frame info, quick actions
- **Expanded view:** Size buttons, frame options, triptych gap slider

### Corner Mode Overlay
- Corner placement instructions
- Progress dots (4 corners)
- Reset/Done/Cancel buttons
- Corner markers visualization

### Search Modal
- Search for different posters
- Quick product switching without leaving AR view

### Debug Console
- Toggle via DBG button
- Shows AR-related console logs
- Useful for troubleshooting

---

## Route

| Path | Description |
|------|-------------|
| `/ar-view` | AR visualization page |
| `/ar-view?slug=product-slug` | AR view with specific product |

---

## Browser Support

| Feature | Requirement |
|---------|-------------|
| Camera access | HTTPS required |
| WebGL | Required for Three.js |
| ES Modules | Modern browser support |

---

## Recent Updates

- **January 2026:** Lock poster scale at placement to prevent size changes when moving
- **January 2026:** Improved optical flow tracking
- **January 2026:** Corner mode for manual wall perspective definition
- **December 2025:** Initial AR view implementation with depth estimation

---

## Related Documentation

- **Product Page:** See product.js for AR preview button integration
- **Theming:** AR view supports dark/light themes
