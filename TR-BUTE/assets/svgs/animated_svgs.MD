==================================================
THEME TOGGLE ANIMATED SVG
==================================================

<button class="theme-toggle" aria-label="Toggle theme" onclick="this.classList.toggle('dark-theme')">
  <svg class="sun-and-moon" aria-hidden="true" width="48" height="48" viewBox="0 0 24 24">
    <mask class="moon" id="moon-mask">
      <rect x="0" y="0" width="100%" height="100%" fill="white" />
      <circle class="moon-cutout" cx="12" cy="12" r="8" fill="black" />
    </mask>

    <circle class="sun-core" cx="12" cy="12" r="6" mask="url(#moon-mask)" fill="currentColor" />

    <g class="sun-rays" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </g>
  </svg>
</button>

.theme-toggle {
  background: none;
  border: none;
  cursor: pointer;
  color: #000;
  padding: 0;
}

.sun-and-moon {
  transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

/* --- LIGHT MODE (BASE) --- */
.sun-rays {
  transform: rotate(0) scale(1);
  transform-origin: center;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1) 0.2s; /* Sprouts after delay */
}

.moon-cutout {
  /* Rests far off-canvas to the top-right */
  transform: translate(20px, -10px);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); /* Leaves immediately */
}

/* --- DARK MODE --- */
.theme-toggle.dark-theme .sun-and-moon {
  /* Scales up and tilts slightly to match your screenshot perfectly */
  transform: scale(1.2) rotate(-15deg); 
}

.theme-toggle.dark-theme .sun-rays {
  /* Shrinks and spins immediately */
  transform: rotate(90deg) scale(0);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.theme-toggle.dark-theme .moon-cutout {
  /* Slides in from top-right to carve the thick crescent, after rays vanish */
  transform: translate(5px, -1px);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1) 0.2s;
}

==================================================
HIDE PROFILE IMAGE ANIMATED SVG
==================================================

<button class="toggle-btn hide-toggle" aria-label="Toggle visibility" onclick="this.classList.toggle('is-hidden')">
  <svg viewBox="0 0 64 64" width="48" height="48" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <mask id="slash-mask">
        <rect x="0" y="0" width="100%" height="100%" fill="white" />
        <path class="slash-element" d="M6,8.83l49.17,49.17,2.83-2.83L8.83,6l-2.83,2.83Z" fill="black" stroke="black" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
      </mask>
    </defs>

    <path class="eye" mask="url(#slash-mask)" fill-rule="evenodd" clip-rule="evenodd" fill="currentColor" d="M32 12C49.07 12 60 32 60 32C60 32 49.07 52 32 52C14.93 52 4 32 4 32C4 32 14.93 12 32 12ZM32 46C39.73 46 46 39.73 46 32C46 24.27 39.73 18 32 18C24.27 18 18 24.27 18 32C18 39.73 24.27 46 32 46Z" />

    <path class="slash-element" fill="currentColor" d="M6,8.83l49.17,49.17,2.83-2.83L8.83,6l-2.83,2.83Z" />
  </svg>
</button>

.toggle-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #000;
  padding: 10px;
  margin: 10px;
}

/* We target BOTH the visible slash and the invisible mask cutout */
.slash-element {
  /* This polygon shrinks the visible area to a tiny point at the top left (X:0, Y:0) */
  clip-path: polygon(0 0, 0 0, 0 0, 0 0);
  transition: clip-path 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* When toggled, the polygon expands downward and rightward, "drawing" the slash */
.hide-toggle.is-hidden .slash-element {
  clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%);
}

/* Note: The .eye class has NO transitions here. 
   It stays 100% solid, full size, and full opacity the entire time! */

==================================================
HOME ANIMATED SVG
==================================================

<button class="nav-btn home-btn" aria-label="Home">
  <svg viewBox="0 0 64 64" width="48" height="48" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <clipPath id="grid-window">
        <rect x="10" y="10" width="44" height="44" />
      </clipPath>
    </defs>

    <g clip-path="url(#grid-window)">
      <g class="scroll-group">
        <rect class="grid-square sq-tl" x="10" y="10" width="20" height="20" fill="currentColor" />
        <rect class="grid-square sq-tr" x="34" y="10" width="20" height="20" fill="currentColor" />
        
        <rect class="grid-square sq-bl" x="10" y="34" width="20" height="20" fill="currentColor" />
        <rect class="grid-square sq-br" x="34" y="34" width="20" height="20" fill="currentColor" />
        
        <rect class="grid-square sq-hl" x="10" y="58" width="20" height="20" fill="currentColor" />
        <rect class="grid-square sq-hr" x="34" y="58" width="20" height="20" fill="currentColor" />
      </g>
    </g>
  </svg>
</button>

.nav-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #000;
  padding: 10px;
  margin: 10px;
}

/* =========================================
   1. THE SHAPE MORPH
   ========================================= */

.grid-square {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.sq-tl, .sq-hl { transform-origin: 30px 30px; } 
.sq-tr, .sq-hr { transform-origin: 34px 30px; } 
.sq-bl { transform-origin: 30px 34px; } 
.sq-br { transform-origin: 34px 34px; } 

.home-btn:hover .grid-square {
  transform: scale(0.75, 0.9);
}

/* =========================================
   2. THE QUICK SCROLL
   ========================================= */

/* =========================================
   HOME: MECHANICAL SNAP FEEDBACK
   ========================================= */

@keyframes physical-scroll-snap {
  0% { 
    transform: translateY(0); 
  }
  /* The Momentum Phase:
     We push slightly past the target (-28px) to create the "impact" 
     and then let it settle into the final locked position (-24px).
  */
  60% { 
    transform: translateY(-28px); 
    animation-timing-function: cubic-bezier(0.175, 0.885, 0.32, 1.275); /* The "Bouncy" Ease */
  }
  100% { 
    transform: translateY(-24px); 
  }
}

.home-btn:hover .scroll-group {
  /* Using 'forwards' keeps the grid locked in the -24px position 
     while the mouse is hovered. */
  animation: physical-scroll-snap 0.4s forwards;
}

/* Remove the old transition so it doesn't fight the keyframes */
.scroll-group {
  transition: none;
}

==================================================
PICKER ANIMATED SVG
==================================================

<button class="nav-btn dating-btn" aria-label="Dating">
  <svg viewBox="0 0 64 64" width="48" height="48" style="overflow: visible;" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <path id="card-shape" d="M50,16h-18c-3.7,0-6,2.3-6,6v28c0,3.7,2.3,6,6,6h18c3.7,0,6-2.3,6-6v-28c0-3.7-2.3-6-6-6Z" />

      <mask id="front-mask" maskUnits="userSpaceOnUse">
        <rect x="-100" y="-100" width="300" height="300" fill="white" />
        <g class="front-transform">
          <use href="#card-shape" fill="black" stroke="black" stroke-width="6" stroke-linejoin="round" />
        </g>
      </mask>
    </defs>

    <g mask="url(#front-mask)">
      <g class="back-transform">
        <use href="#card-shape" fill="currentColor" />
      </g>
    </g>

    <g class="front-transform">
      <use href="#card-shape" fill="currentColor" />
    </g>
  </svg>
</button>

.nav-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #000;
  padding: 10px;
  margin: 10px;
}

/* =========================================
   DATING CARDS: THE TACTILE SNAP
   ========================================= */

.front-transform, .back-transform {
  /* This transition catches the cards smoothly when you mouse-out and drop the deck */
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  transform-origin: 41px 44px; 
}

/* --- DEFAULT STATES --- */
.back-transform {
  transform: translate(-14.9px, -10.4px) rotate(-14deg);
}

.front-transform {
  transform: translate(0, 0) rotate(0deg);
}

/* --- PHYSICAL HOVER KEYFRAMES --- */

@keyframes card-snap-front {
  0%   { transform: translate(0, 0) rotate(0deg); }
  20%  { transform: translate(2px, 0) rotate(2deg); animation-timing-function: ease-in; } 
  /* The front card now swings much further to the RIGHT (+14px) */
  55%  { transform: translate(14px, 0) rotate(16deg); animation-timing-function: ease-out; } 
  75%  { transform: translate(8px, 0) rotate(8deg); animation-timing-function: ease-in-out; } 
  /* Settles at a wider, right-leaning spread */
  100% { transform: translate(10px, 0) rotate(10deg); } 
}

@keyframes card-snap-back {
  0%   { transform: translate(-14.9px, -10.4px) rotate(-14deg); }
  20%  { transform: translate(-15px, -10.4px) rotate(-14deg); animation-timing-function: ease-in; } 
  /* The back card is restrained, swinging only slightly further left (-19px max) 
     keeping it entirely safe from the SVG's left edge! */
  55%  { transform: translate(-19px, -10.4px) rotate(-22deg); animation-timing-function: ease-out; } 
  75%  { transform: translate(-16px, -10.4px) rotate(-16deg); animation-timing-function: ease-in-out; } 
  /* Settles securely inside the box */
  100% { transform: translate(-17px, -10.4px) rotate(-18deg); } 
}

/* --- TRIGGER THE PHYSICS --- */
.dating-btn:hover .front-transform {
  /* 0.6s gives enough time for the eye to catch the complex micro-movements */
  animation: card-snap-front 0.6s forwards;
}

.dating-btn:hover .back-transform {
  animation: card-snap-back 0.6s forwards;
}

==================================================
CART ANIMATED SVG
==================================================

<button class="nav-btn cart-btn" aria-label="Cart">
  <svg viewBox="0 0 64 64" width="48" height="48" style="overflow: visible;" xmlns="http://www.w3.org/2000/svg">
    
    <g class="cart-pivot">
      
      <path class="handle-left" fill="currentColor" d="M 12.63 32 L 24.63 8 L 30 10.68 L 19.34 32 Z" />
      <path class="handle-right" fill="currentColor" d="M 44.66 32 L 34 10.68 L 39.37 8 L 51.37 32 Z" />

      <path class="basket-body" fill="currentColor" d="M 6 28 L 6 34 L 10 34 L 13.33 54 L 50.67 54 L 54 34 L 58 34 L 58 28 Z" />
      
    </g>
  </svg>
</button>

.nav-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #000;
  padding: 10px;
  margin: 10px;
}

/* =========================================
   CART: THE HEAVY CORNER DROP
   ========================================= */

/* 1. Pin the origins strictly to their visual joints */
.cart-pivot { transform-origin: 13.33px 54px; } /* The exact bottom-left angle */
.handle-left { transform-origin: 16px 30px; }
.handle-right { transform-origin: 48px 30px; }

/* =========================================
   CART: THE PHYSICAL SWIVEL (UPDATED)
   ========================================= */

/* The basket now settles at 1deg instead of 0deg to satisfy "initial and final differ" */
@keyframes heavy-basket-drop {
  0% { transform: rotate(0deg); }
  25% { transform: rotate(-16deg); animation-timing-function: ease-in; }
  50% { transform: rotate(4deg); animation-timing-function: ease-out; }
  75% { transform: rotate(-2deg); animation-timing-function: ease-in-out; }
  100% { transform: rotate(1deg); } 
}

/* Handles now end at -20deg and +20deg, creating a much clearer 'V' splay */
@keyframes wiper-swing-left {
  0% { transform: rotate(0deg); }
  30% { transform: rotate(-26deg); animation-timing-function: ease-in-out; } 
  55% { transform: rotate(18deg); animation-timing-function: ease-in-out; } 
  80% { transform: rotate(-6deg); animation-timing-function: ease-in-out; }
  100% { transform: rotate(-10deg); } /* Wider outward splay */
}

@keyframes wiper-swing-right {
  0% { transform: rotate(0deg); }
  30% { transform: rotate(-26deg); animation-timing-function: ease-in-out; } 
  55% { transform: rotate(20deg); animation-timing-function: ease-in-out; }
  80% { transform: rotate(-8deg); animation-timing-function: ease-in-out; }
  100% { transform: rotate(10deg); } /* Wider outward splay */
}

/* 4. Trigger the incredibly smooth 0.85s timeline */
.cart-btn:hover .cart-pivot { animation: heavy-basket-drop 0.85s forwards; }
.cart-btn:hover .handle-left { animation: wiper-swing-left 0.85s forwards; }
.cart-btn:hover .handle-right { animation: wiper-swing-right 0.85s forwards; }

==================================================
LOGIN/LOGOUT DOOR ANIMATED SVG
==================================================

<button class="auth-btn login-btn" aria-label="Login">
  <svg viewBox="0 0 64 64" width="48" height="48" xmlns="http://www.w3.org/2000/svg">
    <path class="login-door" fill="currentColor" />
    <path class="arrow login-arrow" fill="currentColor" d="M19.24,19l-4.24,4.24,5.76,5.76H4v6h16.76l-5.76,5.76,4.24,4.24,13-13-13-13Z" />
  </svg>
</button>

<button class="auth-btn logout-btn" aria-label="Logout">
  <svg viewBox="0 0 64 64" width="48" height="48" xmlns="http://www.w3.org/2000/svg">
    <path class="logout-door" fill="currentColor" />
    <path class="arrow logout-arrow" fill="currentColor" d="M62.24,32l-13,13-4.24-4.24,5.76-5.76h-16.76v-6h16.76l-5.76-5.76,4.24-4.24,13,13Z" />
  </svg>
</button>

.auth-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #000;
  padding: 10px;
  margin: 10px;
}

.arrow {
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  transform-origin: center; 
}

.login-door, .logout-door {
  transition: d 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

/* =========================================
   LOGIN: DOOR OPENS, ARROW ENTERS
   ========================================= */

.login-door {
  d: path('M 58 10 L 58 54 L 42 58 L 38 58 L 38 54 L 24 54 L 24 44 L 30 44 L 30 48 L 38 48 L 38 16 L 30 16 L 30 20 L 24 20 L 24 10 L 38 10 L 38 6 L 42 6 Z');
}

.login-btn:hover .login-door {
  d: path('M 54 8 L 54 56 L 48 56 L 38 56 L 30 56 L 24 56 L 24 44 L 30 44 L 30 50 L 48 50 L 48 14 L 30 14 L 30 20 L 24 20 L 24 8 L 30 8 L 38 8 L 48 8 Z');
}

/* 1. LOGIN ARROW ADJUSTMENT: 
   Changed from -8px to -2px so it rests much closer to the doorway */
.login-arrow {
  transform: translateX(-2px) scale(0.85); 
}

.login-btn:hover .login-arrow {
  transform: translateX(10px) scale(0.85); /* Shoots cleanly through */
}

/* =========================================
   LOGOUT: DOOR CLOSES, ARROW LEAVES
   ========================================= */

.logout-door {
  d: path('M 34 50 L 16 50 L 16 14 L 34 14 L 34 20 L 40 20 L 40 8 L 34 8 L 26 8 L 16 8 L 10 8 L 10 56 L 16 56 L 26 56 L 34 56 L 40 56 L 40 44 L 34 44 Z');
}

.logout-btn:hover .logout-door {
  d: path('M 34 48 L 26 48 L 26 16 L 34 16 L 34 20 L 40 20 L 40 10 L 26 10 L 26 6 L 22 6 L 6 10 L 6 54 L 22 58 L 26 58 L 26 54 L 40 54 L 40 44 L 34 44 Z');
}

/* 2. LOGOUT ARROW ADJUSTMENT: 
   Changed from -16px to -8px so it starts further to the right */
.logout-arrow {
  transform: translateX(-8px) scale(0.85);
}

.logout-btn:hover .logout-arrow {
  transform: translateX(6px) scale(0.85); /* Clears the closing door */
}

==================================================
ANIMATED SVG
==================================================

