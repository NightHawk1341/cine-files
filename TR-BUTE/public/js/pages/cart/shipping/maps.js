// Yandex Maps widget and PVZ selection UI for CDEK / Pochta shipping
//
// Dep injected via initMapsDeps():
//   triggerShippingCalculation - trigger debounced shipping calculation after PVZ select

import { getState } from './state.js';
import {
  showPostalAddressHint,
  updatePvzSummary, hidePvzSummary,
  showPochtaPvzSection, hidePochaPvzSection,
  hideSuggestions, hidePvzSuggestions,
} from './ui.js';
import { escapeHtml, cleanDuplicateAddressParts, getPostalCode } from './utils.js';

const shippingState = getState();

let _triggerShippingCalculation;

export function initMapsDeps({ triggerShippingCalculation }) {
  _triggerShippingCalculation = triggerShippingCalculation;
}

export function showPvzSelection() {
  const pvzSection = document.getElementById('pvz-selection-section');
  if (!pvzSection) return;

  pvzSection.style.display = 'block';
  shippingState.mapOpen = true;

  // Toggle active state on PVZ button
  const pvzBtn = document.getElementById('open-pvz-btn');
  if (pvzBtn) pvzBtn.classList.add('active');

  // Use unified map widget for both CDEK and Pochta
  showCdekWidget(); // This now shows the unified Yandex Maps widget
  hidePochaPvzSection(); // Hide the old Pochta-specific section
}

export function hidePvzSelection() {
  const pvzSection = document.getElementById('pvz-selection-section');
  if (pvzSection) {
    pvzSection.style.display = 'none';
  }

  shippingState.mapOpen = false;

  // Toggle active state on PVZ button
  const pvzBtn = document.getElementById('open-pvz-btn');
  if (pvzBtn) pvzBtn.classList.remove('active');

  hideCdekWidget();
  hidePochaPvzSection();
}


function showCdekWidget() {
  const widgetContainer = document.getElementById('cdek-widget-container');
  if (!widgetContainer) return;

  widgetContainer.style.display = 'block';

  // Initialize CDEK widget if not already done
  initCdekWidget();
}

function hideCdekWidget() {
  const widgetContainer = document.getElementById('cdek-widget-container');
  if (widgetContainer) {
    widgetContainer.style.display = 'none';
  }
}

function initCdekWidget() {
  // Replaced by unified Yandex Maps widget
  // See initUnifiedMapWidget() below
  console.log('[Shipping] Using unified Yandex Maps widget for PVZ lookup');
  initUnifiedMapWidget();
}

/**
 * Show text-based CDEK PVZ search as fallback when map fails
 */
function showCdekTextSearch(container) {
  container.innerHTML = `
    <div class="cdek-text-search">
      <p style="margin-bottom: 12px; color: var(--text-secondary); font-size: 13px;">
        Карта недоступна. Введите город для поиска пунктов СДЭК:
      </p>
      <div class="cdek-search-input-wrapper">
        <input type="text" id="cdek-city-search" placeholder="Введите город (например: Москва)"
               style="width: 100%; padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; font-size: 14px; background: var(--card-bg); color: var(--text-primary);">
        <button type="button" id="cdek-search-btn"
                style="margin-top: 8px; padding: 10px 20px; background: var(--accent-primary); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px;">
          Найти пункты СДЭК
        </button>
      </div>
      <div id="cdek-pvz-results" style="margin-top: 12px; max-height: 300px; overflow-y: auto;"></div>
    </div>
  `;

  const searchInput = container.querySelector('#cdek-city-search');
  const searchBtn = container.querySelector('#cdek-search-btn');
  const resultsContainer = container.querySelector('#cdek-pvz-results');

  // Pre-fill with city from selected address if available
  if (shippingState.selectedAddress?.city) {
    searchInput.value = shippingState.selectedAddress.city;
  }

  searchBtn.addEventListener('click', () => {
    searchCdekPvzByCity(searchInput.value, resultsContainer);
  });

  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchCdekPvzByCity(searchInput.value, resultsContainer);
    }
  });
}

/**
 * Initialize unified Yandex Maps widget for both CDEK and Pochta
 * Shows PVZ/office locations on the map (read-only, for lookup purposes)
 */
export async function initUnifiedMapWidget() {
  const mapContainer = document.getElementById('cdek-widget-map');
  if (!mapContainer) return;

  // Load Yandex Maps API if not loaded
  if (typeof ymaps === 'undefined') {
    try {
      await loadYandexMapsApi();
    } catch (err) {
      console.error('[Shipping] Failed to load Yandex Maps:', err);
      mapContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-tertiary);">Не удалось загрузить карту</div>';
      return;
    }
  }

  // Wait for ymaps to be ready
  ymaps.ready(() => {
    createUnifiedMap();
  });
}

/**
 * Create unified map showing CDEK PVZ or Pochta offices
 */
export function createUnifiedMap() {
  const mapContainer = document.getElementById('cdek-widget-map');
  if (!mapContainer) return;

  // Get center coordinates from selected address or default to Moscow
  let centerCoords = [55.751574, 37.573856]; // Moscow default
  let zoomLevel = 11;

  // Try to get coordinates from selected address
  if (shippingState.selectedAddress) {
    const addr = shippingState.selectedAddress;
    const lat = addr.data?.geo_lat || addr.geo_lat;
    const lng = addr.data?.geo_lon || addr.geo_lon;
    if (lat && lng) {
      centerCoords = [parseFloat(lat), parseFloat(lng)];
      zoomLevel = 13;
    }
  }

  // Destroy existing map if any
  if (window.unifiedPvzMap) {
    window.unifiedPvzMap.destroy();
    window.unifiedPvzMap = null;
  }

  // Clear container
  mapContainer.innerHTML = '';

  // Create map
  window.unifiedPvzMap = new ymaps.Map(mapContainer, {
    center: centerCoords,
    zoom: zoomLevel,
    controls: ['zoomControl', 'geolocationControl']
  });

  // Store point placemarks for zoom-based visibility
  window.pvzPlacemarks = [];
  // Track loaded areas to avoid duplicate requests
  window.loadedMapAreas = new Set();
  let mapBoundsTimer = null;

  // Add zoom/pan change listener
  window.unifiedPvzMap.events.add('boundschange', (e) => {
    const zoom = window.unifiedPvzMap.getZoom();
    updateMarkerVisibility(zoom);

    // For Pochta: dynamically load more offices as user pans/zooms
    if (shippingState.provider === 'pochta' && zoom >= 12) {
      clearTimeout(mapBoundsTimer);
      mapBoundsTimer = setTimeout(() => {
        loadPochtaOfficesInView();
      }, 500);
    }
  });

  console.log('[Shipping] Unified map created, loading points for provider:', shippingState.provider);

  // Add user's address marker (home icon)
  if (shippingState.selectedAddress) {
    const addr = shippingState.selectedAddress;
    const lat = addr.data?.geo_lat || addr.geo_lat;
    const lng = addr.data?.geo_lon || addr.geo_lon;
    if (lat && lng) {
      const userPlacemark = new ymaps.Placemark(
        [parseFloat(lat), parseFloat(lng)],
        {
          balloonContentHeader: '<strong>Ваш адрес</strong>',
          balloonContentBody: `
            <div style="font-size: 13px; line-height: 1.5;">
              ${escapeHtml(addr.value || addr.unrestricted_value || '')}
            </div>
          `,
          hintContent: 'Ваш адрес доставки'
        },
        {
          preset: 'islands#redHomeIcon',
          iconColor: '#FF0000'
        }
      );
      window.unifiedPvzMap.geoObjects.add(userPlacemark);
      console.log('[Shipping] Added user address marker at:', [lat, lng]);
    }
  }

  // Load points based on provider
  if (shippingState.provider === 'cdek') {
    loadCdekPointsOnMap(centerCoords);
  } else if (shippingState.provider === 'pochta') {
    loadPochtaPointsOnMap(centerCoords);
  }
}

/**
 * Update marker visibility based on zoom level
 * At low zoom (zoomed out), hide far-away markers to reduce clutter
 * At high zoom (zoomed in), show all markers in view
 */
function updateMarkerVisibility(zoom) {
  if (!window.pvzPlacemarks || window.pvzPlacemarks.length === 0) return;

  // At zoom < 10, show only nearest 5 markers
  // At zoom 10-12, show nearest 15
  // At zoom 13+, show all (up to 30)
  let maxVisible;
  if (zoom < 10) {
    maxVisible = 5;
  } else if (zoom < 12) {
    maxVisible = 15;
  } else {
    maxVisible = window.pvzPlacemarks.length; // Show all
  }

  window.pvzPlacemarks.forEach((pm, index) => {
    if (index < maxVisible) {
      pm.placemark.options.set('visible', true);
    } else {
      pm.placemark.options.set('visible', false);
    }
  });
}

/**
 * Dynamically load Pochta offices in the current map view
 * Called on map pan/zoom when Pochta is selected
 */
async function loadPochtaOfficesInView() {
  if (!window.unifiedPvzMap || shippingState.provider !== 'pochta') return;

  try {
    const center = window.unifiedPvzMap.getCenter();
    // Create a grid key to avoid reloading the same area
    const areaKey = `${center[0].toFixed(2)}_${center[1].toFixed(2)}`;
    if (window.loadedMapAreas.has(areaKey)) return;
    window.loadedMapAreas.add(areaKey);

    // Use Yandex geocode to find post offices near the map center
    const result = await ymaps.geocode('почта отделение', {
      ll: [center[1], center[0]], // Yandex expects [lng, lat]
      spn: [0.05, 0.05],
      results: 20
    });

    const geoObjects = result.geoObjects;
    if (geoObjects.getLength() === 0) return;

    console.log('[Shipping] Dynamic load: found', geoObjects.getLength(), 'offices near', areaKey);

    let addedCount = 0;
    geoObjects.each(obj => {
      const objCoords = obj.geometry.getCoordinates();
      const props = obj.properties;
      const name = props.get('name') || 'Почтовое отделение';
      const address = props.get('description') || '';

      const combined = `${name} ${address}`;
      const postalCodeMatch = combined.match(/\b(\d{6})\b/);
      const extractedPostalCode = postalCodeMatch ? postalCodeMatch[1] : '';

      // Check if this office is already on the map (by checking proximity)
      const isDuplicate = window.pvzPlacemarks.some(pm => {
        const coords = pm.placemark.geometry.getCoordinates();
        return Math.abs(coords[0] - objCoords[0]) < 0.0005 &&
               Math.abs(coords[1] - objCoords[1]) < 0.0005;
      });
      if (isDuplicate) return;

      const selectBtnId = `select-pochta-dyn-${window.pvzPlacemarks.length}`;
      const placemark = new ymaps.Placemark(
        objCoords,
        {
          balloonContentHeader: `<strong>${escapeHtml(name)}</strong>`,
          balloonContentBody: `
            <div style="font-size: 13px; line-height: 1.5;">
              <div style="margin-bottom: 8px;">${escapeHtml(address)}</div>
              ${extractedPostalCode ? `<div style="color: #0066cc; font-weight: 600;">Индекс: ${extractedPostalCode}</div>` : ''}
              ${extractedPostalCode ? `<div style="margin-top: 10px;"><button type="button" id="${selectBtnId}" style="background: #0066cc; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; width: 100%;">Выбрать это отделение</button></div>` : ''}
            </div>
          `,
          hintContent: name
        },
        {
          preset: 'islands#dotIcon',
          iconColor: '#0066cc'
        }
      );

      if (extractedPostalCode) {
        const pointData = { name, address, postalCode: extractedPostalCode, code: extractedPostalCode };
        placemark.events.add('balloonopen', () => {
          setTimeout(() => {
            const btn = document.getElementById(selectBtnId);
            if (btn) {
              btn.addEventListener('click', () => {
                selectPochtaOfficeFromMap(pointData);
              });
            }
          }, 100);
        });
      }

      window.pvzPlacemarks.push({ placemark, distance: 0 });
      window.unifiedPvzMap.geoObjects.add(placemark);
      addedCount++;
    });

    if (addedCount > 0) {
      console.log('[Shipping] Added', addedCount, 'new Pochta offices to map');
    }
  } catch (error) {
    console.warn('[Shipping] Dynamic Pochta load error:', error.message);
  }
}

/**
 * Load CDEK PVZ points on the map
 */
async function loadCdekPointsOnMap(userCoords) {
  if (!window.unifiedPvzMap) return;

  const city = shippingState.selectedAddress?.data?.city ||
               shippingState.selectedAddress?.data?.settlement ||
               shippingState.selectedAddress?.city || '';

  // Get postal code for better filtering
  const postalCode = shippingState.selectedAddress?.postal_code ||
                     shippingState.selectedAddress?.data?.postal_code ||
                     shippingState.suggestedPostalCode;

  if (!city && !postalCode) {
    console.warn('[Shipping] No city or postal code available for CDEK PVZ search');
    return;
  }

  try {
    const lat = userCoords[0];
    const lng = userCoords[1];

    // Build URL - prefer postal code for filtering
    let apiUrl = `/api/shipping/points?provider=cdek&limit=50`;
    if (postalCode) {
      apiUrl += `&postalCode=${encodeURIComponent(postalCode)}`;
    } else {
      apiUrl += `&city=${encodeURIComponent(city)}`;
    }
    apiUrl += `&lat=${lat}&lng=${lng}`;

    const response = await fetch(apiUrl);
    const data = await response.json();

    if (!data.success || !data.data?.points?.length) {
      console.warn('[Shipping] No CDEK PVZ found');
      return;
    }

    let points = data.data.points;
    console.log('[Shipping] Loaded', points.length, 'CDEK PVZ points');

    // Calculate distance and sort by nearest (Haversine)
    const calculateDistance = (lat1, lon1, lat2, lon2) => {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    };

    points = points
      .map(p => {
        const pvzLat = p.location?.lat;
        const pvzLng = p.location?.lng;
        if (pvzLat && pvzLng) {
          p.distance = calculateDistance(lat, lng, pvzLat, pvzLng);
        } else {
          p.distance = Infinity;
        }
        return p;
      })
      .filter(p => p.distance !== Infinity)
      .sort((a, b) => a.distance - b.distance);

    // Add markers for each point (limit to 30 nearest to avoid clutter)
    const displayPoints = points.slice(0, 30);
    displayPoints.forEach((point, index) => {
      const selectBtnId = `select-cdek-pvz-${index}`;
      const placemark = new ymaps.Placemark(
        [point.location.lat, point.location.lng],
        {
          balloonContentHeader: `<strong>${escapeHtml(point.name)}</strong>`,
          balloonContentBody: `
            <div style="font-size: 13px; line-height: 1.5;">
              <div style="margin-bottom: 8px;">${escapeHtml(point.address)}</div>
              ${point.workTime ? `<div style="color: #666; margin-bottom: 8px;">Режим работы: ${escapeHtml(point.workTime)}</div>` : ''}
              <div style="color: #1eb700; font-weight: 600;">Код ПВЗ: ${escapeHtml(point.code)}</div>
              <div style="color: #666; font-size: 12px; margin-top: 4px;">${point.distance.toFixed(1)} км от вас</div>
              <div style="margin-top: 10px;">
                <button type="button" id="${selectBtnId}" style="background: #1eb700; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; width: 100%;">Выбрать это ПВЗ</button>
              </div>
            </div>
          `,
          hintContent: `${point.name} (${point.distance.toFixed(1)} км)`
        },
        {
          preset: 'islands#dotIcon',
          iconColor: '#1eb700'
        }
      );

      // When balloon opens, attach the select button click handler
      placemark.events.add('balloonopen', () => {
        setTimeout(() => {
          const btn = document.getElementById(selectBtnId);
          if (btn) {
            btn.addEventListener('click', () => {
              handleCdekPvzSelect('office', null, {
                code: point.code,
                name: point.name,
                address: point.address,
                postal_code: point.postalCode,
                work_time: point.workTime
              });
            });
          }
        }, 100);
      });

      // Register for zoom-based visibility and add to map
      window.pvzPlacemarks.push({ placemark, distance: point.distance });
      window.unifiedPvzMap.geoObjects.add(placemark);
    });

    // Apply initial zoom-based visibility
    updateMarkerVisibility(window.unifiedPvzMap.getZoom());

    // Center on user's address (not nearest PVZ)
    if (userCoords && userCoords[0] && userCoords[1]) {
      window.unifiedPvzMap.setCenter(userCoords, 14);
      console.log('[Shipping] Map centered on user address:', userCoords);
    } else if (displayPoints.length > 0) {
      const nearest = displayPoints[0];
      window.unifiedPvzMap.setCenter([nearest.location.lat, nearest.location.lng], 14);
      console.log('[Shipping] Map centered on nearest PVZ (no user coords):', nearest.name);
    }
  } catch (error) {
    console.error('[Shipping] Failed to load CDEK PVZ on map:', error);
  }
}

/**
 * Load Pochta office points on the map
 */
async function loadPochtaPointsOnMap(userCoords) {
  if (!window.unifiedPvzMap) return;

  // First try APIShip for Pochta offices, fallback to Yandex geocode
  const postalCode = shippingState.selectedAddress?.postal_code ||
                     shippingState.selectedAddress?.data?.postal_code ||
                     shippingState.suggestedPostalCode;

  const city = shippingState.selectedAddress?.data?.city ||
               shippingState.selectedAddress?.city || '';

  // Use the current postal input value — user may have changed it manually
  const postalInput = document.getElementById('postal-index-input');
  const currentIndex = postalInput?.value?.trim() || postalCode;

  try {
    // Postal index is the primary filter (district-level, unambiguous, user-editable)
    // City is a fallback for broader results when index yields too few
    let apiUrl = `/api/shipping/points?provider=pochta`;
    if (city) {
      apiUrl += `&city=${encodeURIComponent(city)}`;
    }
    if (currentIndex) {
      apiUrl += `&postalCode=${encodeURIComponent(currentIndex)}`;
    }
    apiUrl += `&lat=${userCoords[0]}&lng=${userCoords[1]}`;

    const response = await fetch(apiUrl);
    const data = await response.json();

    if (data.success && data.data?.points?.length > 0) {
      let points = data.data.points;
      console.log('[Shipping] Loaded', points.length, 'Pochta offices from APIShip');

      // Calculate distance and sort
      const calculateDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
      };

      points = points
        .map(p => {
          const pvzLat = p.location?.lat;
          const pvzLng = p.location?.lng;
          if (pvzLat && pvzLng) {
            p.distance = calculateDistance(userCoords[0], userCoords[1], pvzLat, pvzLng);
          } else {
            p.distance = Infinity;
          }
          return p;
        })
        .filter(p => p.distance !== Infinity)
        .sort((a, b) => a.distance - b.distance);

      // Filter to offices within reasonable proximity, then cap at 50
      // For large cities use 15km radius, for settlements use 30km
      const isLargeCity = shippingState.selectedAddress?.data?.city_type === 'г' ||
                          (shippingState.selectedAddress?.data?.city && !shippingState.selectedAddress?.data?.settlement);
      const maxRadius = isLargeCity ? 15 : 30;
      let displayPoints = points.filter(p => p.distance <= maxRadius);
      // Ensure at least 5 offices are shown even if outside radius
      if (displayPoints.length < 5) {
        displayPoints = points.slice(0, Math.max(5, displayPoints.length));
      }
      // Cap at 50 to avoid performance issues
      displayPoints = displayPoints.slice(0, 50);
      console.log('[Shipping] Displaying', displayPoints.length, 'Pochta offices within', maxRadius, 'km (of', points.length, 'total)');
      displayPoints.forEach((point, index) => {
        const selectBtnId = `select-pochta-office-${index}`;
        const placemark = new ymaps.Placemark(
          [point.location.lat, point.location.lng],
          {
            balloonContentHeader: `<strong>${escapeHtml(point.name)}</strong>`,
            balloonContentBody: `
              <div style="font-size: 13px; line-height: 1.5;">
                <div style="margin-bottom: 8px;">${escapeHtml(point.address)}</div>
                ${point.postalCode ? `<div style="color: #0066cc; font-weight: 600;">Индекс: ${point.postalCode}</div>` : ''}
                <div style="color: #666; font-size: 12px; margin-top: 4px;">${point.distance.toFixed(1)} км от вас</div>
                <div style="margin-top: 10px;">
                  <button type="button" id="${selectBtnId}" style="background: #0066cc; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; width: 100%;">Выбрать это отделение</button>
                </div>
              </div>
            `,
            hintContent: `${point.name} (${point.distance.toFixed(1)} км)`
          },
          {
            preset: 'islands#dotIcon',
            iconColor: '#0066cc'
          }
        );

        // When balloon opens, attach the select button click handler
        placemark.events.add('balloonopen', () => {
          setTimeout(() => {
            const btn = document.getElementById(selectBtnId);
            if (btn) {
              btn.addEventListener('click', () => {
                selectPochtaOfficeFromMap(point);
              });
            }
          }, 100);
        });

        // Register for zoom-based visibility and add to map
        window.pvzPlacemarks.push({ placemark, distance: point.distance });
        window.unifiedPvzMap.geoObjects.add(placemark);
      });

      // Apply initial zoom-based visibility
      updateMarkerVisibility(window.unifiedPvzMap.getZoom());

      // Use adaptive radius: 3km for large cities (population centers), 10km for smaller settlements
      const isLargeCityNearby = shippingState.selectedAddress?.data?.city_type === 'г' ||
                          shippingState.selectedAddress?.data?.fias_level === '4' ||
                          (shippingState.selectedAddress?.data?.city && !shippingState.selectedAddress?.data?.settlement);
      const nearbyRadius = isLargeCityNearby ? 3 : 10;
      const nearbyCount = displayPoints.filter(p => p.distance < nearbyRadius).length;
      console.log(`[Shipping] Nearby Pochta offices (<${nearbyRadius}km, ${isLargeCityNearby ? 'city' : 'settlement'}):`, nearbyCount, 'of', displayPoints.length);

      // Center on user's address (not nearest office)
      if (userCoords && userCoords[0] && userCoords[1]) {
        window.unifiedPvzMap.setCenter(userCoords, 14);
        console.log('[Shipping] Map centered on user address:', userCoords);
      } else if (displayPoints.length > 0) {
        const nearest = displayPoints[0];
        window.unifiedPvzMap.setCenter([nearest.location.lat, nearest.location.lng], 14);
        console.log('[Shipping] Map centered on nearest Pochta (no user coords):', nearest.name);
      }

      // If we have enough nearby results, we're done
      if (nearbyCount >= 3) {
        return;
      }

      // Not enough nearby results from APIShip, supplement with Yandex geocode
      console.log('[Shipping] Few nearby offices from APIShip, supplementing with Yandex geocode');
    }
  } catch (error) {
    console.warn('[Shipping] APIShip Pochta failed, falling back to Yandex geocode:', error);
  }

  // Yandex geocode search for nearby post offices
  try {
    const result = await ymaps.geocode('почта отделение', {
      ll: [userCoords[1], userCoords[0]], // Yandex expects [lng, lat]
      spn: [0.1, 0.1], // Search area ~10km around user
      results: 30
    });

    const geoObjects = result.geoObjects;
    console.log('[Shipping] Found', geoObjects.getLength(), 'Pochta offices via Yandex geocode');

    let firstCoords = null;
    let geocodeIndex = 0;
    geoObjects.each(obj => {
      const objCoords = obj.geometry.getCoordinates();
      const props = obj.properties;
      const name = props.get('name') || 'Почтовое отделение';
      const address = props.get('description') || '';

      if (!firstCoords) firstCoords = objCoords;

      // Extract postal code from name or address
      const combined = `${name} ${address}`;
      const postalCodeMatch = combined.match(/\b(\d{6})\b/);
      const extractedPostalCode = postalCodeMatch ? postalCodeMatch[1] : '';

      const selectBtnId = `select-pochta-geo-${geocodeIndex++}`;
      const placemark = new ymaps.Placemark(
        objCoords,
        {
          balloonContentHeader: `<strong>${escapeHtml(name)}</strong>`,
          balloonContentBody: `
            <div style="font-size: 13px; line-height: 1.5;">
              <div style="margin-bottom: 8px;">${escapeHtml(address)}</div>
              ${extractedPostalCode ? `<div style="color: #0066cc; font-weight: 600;">Индекс: ${extractedPostalCode}</div>` : ''}
              ${extractedPostalCode ? `<div style="margin-top: 10px;"><button type="button" id="${selectBtnId}" style="background: #0066cc; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; width: 100%;">Выбрать это отделение</button></div>` : ''}
            </div>
          `,
          hintContent: name
        },
        {
          preset: 'islands#dotIcon',
          iconColor: '#0066cc'
        }
      );

      // When balloon opens, attach the select button click handler
      if (extractedPostalCode) {
        const pointData = { name, address, postalCode: extractedPostalCode, code: extractedPostalCode };
        placemark.events.add('balloonopen', () => {
          setTimeout(() => {
            const btn = document.getElementById(selectBtnId);
            if (btn) {
              btn.addEventListener('click', () => {
                selectPochtaOfficeFromMap(pointData);
              });
            }
          }, 100);
        });
      }

      // Register for zoom-based visibility
      // Calculate approximate distance for ordering
      const dist = userCoords ? Math.sqrt(
        Math.pow(objCoords[0] - userCoords[0], 2) + Math.pow(objCoords[1] - userCoords[1], 2)
      ) * 111 : 0; // rough km
      window.pvzPlacemarks.push({ placemark, distance: dist });

      window.unifiedPvzMap.geoObjects.add(placemark);
    });

    // Re-sort placemarks by distance after adding Yandex results
    window.pvzPlacemarks.sort((a, b) => a.distance - b.distance);

    // Apply zoom-based visibility
    updateMarkerVisibility(window.unifiedPvzMap.getZoom());

    // Center on user's address
    if (userCoords && userCoords[0] && userCoords[1]) {
      window.unifiedPvzMap.setCenter(userCoords, 14);
    } else if (firstCoords) {
      window.unifiedPvzMap.setCenter(firstCoords, 14);
    }

  } catch (error) {
    console.error('[Shipping] Failed to load Pochta offices on map:', error);
  }
}

/**
 * Handle Pochta office selection from map click
 */
function selectPochtaOfficeFromMap(point) {
  const postalInput = document.getElementById('order-postal-index');

  // Fill postal code
  if (postalInput && point.postalCode) {
    postalInput.value = point.postalCode;
  }

  // Store selected PVZ data
  shippingState.selectedPvz = {
    code: point.postalCode || point.code,
    name: point.name,
    address: point.address,
    postalCode: point.postalCode,
    workTime: point.workTime
  };

  // Update hidden inputs
  const pvzCodeInput = document.getElementById('selected-pvz-code');
  const pvzAddressInput = document.getElementById('selected-pvz-address');
  if (pvzCodeInput) pvzCodeInput.value = point.postalCode || point.code || '';
  if (pvzAddressInput) pvzAddressInput.value = point.address || '';

  // Show inline address hint
  showPostalAddressHint(point.address);

  // Save for provider switching
  shippingState.savedPochtaPvz = shippingState.selectedPvz;
  shippingState.savedPochtaIndex = point.postalCode || '';

  // Hide map
  hidePvzSelection();

  // Trigger calculation
  _triggerShippingCalculation();
}

/**
 * Auto-fetch CDEK PVZs when user selects an address
 * Uses coordinates (from DaData) for finding nearest PVZs
 * Automatically selects the closest PVZ
 *
 * @param {string} city - City name
 * @param {string|number} lat - Latitude from DaData
 * @param {string|number} lng - Longitude from DaData
 */
export async function fetchCdekPvzForAddress(city, lat, lng) {
  if (!city || city.trim().length < 2) return;

  // Find or create the CDEK PVZ suggestions container (below postal-index-group, like suggested index)
  let suggestionsSection = document.getElementById('cdek-pvz-suggestions');
  if (!suggestionsSection) {
    // Create a suggestions section below the postal-index-group (same placement as suggested-postal)
    const postalGroup = document.getElementById('postal-index-group');
    if (!postalGroup) return;

    suggestionsSection = document.createElement('div');
    suggestionsSection.id = 'cdek-pvz-suggestions';
    suggestionsSection.className = 'cdek-pvz-suggestions';
    // Insert after postal-index-group
    postalGroup.parentNode.insertBefore(suggestionsSection, postalGroup.nextSibling);
  }

  suggestionsSection.style.display = 'block';
  suggestionsSection.innerHTML = `
    <div class="suggested-pvz" style="margin: 8px 0;">
      Поиск ближайшего ПВЗ СДЭК...
    </div>
  `;

  try {
    // Parse coordinates to numbers
    const latitude = lat ? parseFloat(lat) : null;
    const longitude = lng ? parseFloat(lng) : null;

    // Get postal code from selected address
    const postalCode = shippingState.selectedAddress?.postal_code ||
                      shippingState.selectedAddress?.data?.postal_code ||
                      shippingState.suggestedPostalCode;

    console.log('[Shipping] Fetching CDEK PVZ for:', {
      city,
      postalCode,
      hasCoordinates: !!(latitude && longitude),
      latitude,
      longitude
    });

    // Build API URL - CRITICAL: use postal code, not city name
    // CDEK API filters by postal_code, not city name. Without postal code, it returns ALL 5375 PVZs!
    let apiUrl = `/api/shipping/points?provider=cdek&limit=20`;

    if (postalCode) {
      apiUrl += `&postalCode=${encodeURIComponent(postalCode)}`;
      console.log('[Shipping] Using postal code for CDEK PVZ filtering:', postalCode);
    } else {
      console.warn('[Shipping] No postal code - CDEK will return ALL PVZs in country! Falling back to city name.');
      // Fallback to city (which won't actually filter, but coordinates might help)
      apiUrl += `&city=${encodeURIComponent(city.trim())}`;
    }

    if (latitude && longitude && !isNaN(latitude) && !isNaN(longitude)) {
      apiUrl += `&lat=${latitude}&lng=${longitude}`;
      console.log('[Shipping] Including coordinates in CDEK PVZ search - API will sort by distance');
    } else {
      console.warn('[Shipping] No valid coordinates available - CDEK API will not sort by distance');
    }

    const response = await fetch(apiUrl);
    const data = await response.json();

    if (!data.success || !data.data?.points?.length) {
      suggestionsSection.innerHTML = `
        <div style="margin: 8px 0; font-size: 13px; color: var(--text-secondary);">
          ПВЗ не найдены.
          <a href="#" id="open-cdek-map-link" style="color: var(--accent-primary); text-decoration: underline;">Открыть карту</a>
        </div>
      `;
      document.getElementById('open-cdek-map-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        showPvzSelection();
      });
      return;
    }

    let points = data.data.points;

    // Calculate distance for each PVZ if we have user coordinates
    const hasValidCoordinates = latitude && longitude && !isNaN(latitude) && !isNaN(longitude);

    if (hasValidCoordinates) {
      // Calculate Haversine distance for accurate sorting
      const calculateDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
      };

      // Add distance to each point and sort by distance
      points = points
        .map(p => {
          const pvzLat = p.location?.lat || p.latitude;
          const pvzLng = p.location?.lng || p.longitude;
          if (pvzLat && pvzLng) {
            p.distance = calculateDistance(latitude, longitude, pvzLat, pvzLng);
          } else {
            p.distance = Infinity;
          }
          return p;
        })
        .sort((a, b) => a.distance - b.distance);

      console.log('[Shipping] Sorted PVZs by distance:', points.slice(0, 5).map(p => ({
        code: p.code,
        name: p.name,
        distance: p.distance ? `${p.distance.toFixed(2)} km` : 'unknown'
      })));
    }

    // Select the nearest PVZ (first after sorting)
    const closestPoint = points[0];
    console.log('[Shipping] Selected nearest PVZ:', closestPoint.code, closestPoint.name,
                closestPoint.distance ? `(${closestPoint.distance.toFixed(2)} km away)` : '');

    // Show ONLY the closest PVZ as a simple hyperlink-styled suggestion (like Pochta postal code suggestion)
    // Format: "Предложен: [Short Address]" where clicking fills the field
    // Use cleanDuplicateAddressParts to avoid "Москва, Москва" type duplicates
    const cleanedAddress = cleanDuplicateAddressParts(closestPoint.address);
    const displayAddress = formatSuggestedAddress(closestPoint.address);

    suggestionsSection.innerHTML = `
      <div class="suggested-pvz" style="margin: 8px 0;">
        Предложен:
        <span id="suggested-pvz-value"
              data-code="${closestPoint.code}"
              data-name="${escapeHtml(closestPoint.name)}"
              data-address="${escapeHtml(cleanedAddress)}"
              data-postalcode="${closestPoint.postalCode || ''}"
              data-worktime="${escapeHtml(closestPoint.workTime || '')}">
          ${escapeHtml(displayAddress || closestPoint.name)}
        </span>
      </div>
    `;

    // Add click handler to fill PVZ field (like postal index suggestion)
    const suggestedValue = document.getElementById('suggested-pvz-value');
    if (suggestedValue) {
      suggestedValue.addEventListener('click', () => {
        const postalInput = document.getElementById('order-postal-index');
        if (postalInput) {
          // Fill the PVZ field with the cleaned PVZ address
          postalInput.value = suggestedValue.dataset.address;
        }

        // Store selected PVZ data
        shippingState.selectedPvz = {
          code: suggestedValue.dataset.code,
          name: suggestedValue.dataset.name,
          address: suggestedValue.dataset.address,
          postalCode: suggestedValue.dataset.postalcode,
          workTime: suggestedValue.dataset.worktime
        };

        // Update hidden inputs for form submission
        const pvzCodeInput = document.getElementById('selected-pvz-code');
        const pvzAddressInput = document.getElementById('selected-pvz-address');
        if (pvzCodeInput) pvzCodeInput.value = suggestedValue.dataset.code || '';
        if (pvzAddressInput) pvzAddressInput.value = suggestedValue.dataset.address || '';

        // Show as applied (grey) - add class instead of inline style
        suggestedValue.classList.add('applied');
        suggestedValue.innerHTML = `${escapeHtml(suggestedValue.dataset.address)}`;

        // Show address hint in brackets below postal input
        showPostalAddressHint(suggestedValue.dataset.address);

        // Trigger shipping calculation
        _triggerShippingCalculation();
      });
    }

    // Don't auto-select - just show the suggestion
    // User can click on it to select it, or click "Выбрать другой ПВЗ" to see more options

  } catch (error) {
    console.error('[Shipping] CDEK PVZ fetch error:', error);
    suggestionsSection.innerHTML = `
      <div style="margin: 8px 0; font-size: 13px; color: var(--text-secondary);">
        <a href="#" id="open-cdek-map-link" style="color: var(--accent-primary); text-decoration: underline;">Выбрать пункт на карте</a>
      </div>
    `;
    document.getElementById('open-cdek-map-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      showPvzSelection();
    });
  }
}

/**
 * Search CDEK PVZs by city name using API
 */
async function searchCdekPvzByCity(city, resultsContainer) {
  if (!city || city.trim().length < 2) {
    resultsContainer.innerHTML = '<p style="color: var(--text-tertiary); font-size: 13px;">Введите название города</p>';
    return;
  }

  resultsContainer.innerHTML = '<p style="color: var(--text-tertiary); font-size: 13px;">Поиск...</p>';

  try {
    const response = await fetch(`/api/shipping/points?provider=cdek&city=${encodeURIComponent(city.trim())}&limit=20`);
    const data = await response.json();

    if (!data.success || !data.data?.points?.length) {
      resultsContainer.innerHTML = '<p style="color: var(--text-tertiary); font-size: 13px;">Пункты не найдены. Попробуйте другой город.</p>';
      return;
    }

    const points = data.data.points;
    resultsContainer.innerHTML = points.map(point => `
      <div class="cdek-pvz-item" data-code="${point.code}" data-name="${escapeHtml(point.name)}"
           data-address="${escapeHtml(point.address)}" data-postalcode="${point.postalCode || ''}"
           data-worktime="${escapeHtml(point.workTime || '')}"
           style="padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 8px; cursor: pointer; background: var(--card-bg); transition: background 0.2s;">
        <div style="font-weight: 600; color: var(--text-primary); font-size: 13px;">${escapeHtml(point.name)}</div>
        <div style="color: var(--text-secondary); font-size: 12px; margin-top: 4px;">${escapeHtml(point.address)}</div>
        ${point.workTime ? `<div style="color: var(--text-tertiary); font-size: 11px; margin-top: 4px;">Режим работы: ${escapeHtml(point.workTime)}</div>` : ''}
        <div style="color: var(--accent-primary); font-size: 12px; margin-top: 4px;">Код: ${escapeHtml(point.code)}</div>
      </div>
    `).join('');

    // Add click handlers
    resultsContainer.querySelectorAll('.cdek-pvz-item').forEach(item => {
      item.addEventListener('click', () => {
        const pvzData = {
          code: item.dataset.code,
          name: item.dataset.name,
          address: item.dataset.address,
          postal_code: item.dataset.postalcode,
          work_time: item.dataset.worktime
        };
        handleCdekPvzSelect('office', null, pvzData);

        // Highlight selected
        resultsContainer.querySelectorAll('.cdek-pvz-item').forEach(i => i.style.borderColor = 'var(--border-color)');
        item.style.borderColor = 'var(--accent-primary)';
      });

      // Hover effect
      item.addEventListener('mouseenter', () => item.style.background = 'var(--card-bg-hover)');
      item.addEventListener('mouseleave', () => item.style.background = 'var(--card-bg)');
    });

  } catch (error) {
    console.error('[Shipping] CDEK PVZ search error:', error);
    resultsContainer.innerHTML = '<p style="color: var(--error-color); font-size: 13px;">Ошибка поиска. Попробуйте позже.</p>';
  }
}

function handleCdekPvzSelect(type, tariff, address) {
  console.log('[Shipping] CDEK PVZ selected:', { type, tariff, address });

  if (!address) return;

  // Store selected PVZ (including its postal code for calculation)
  shippingState.selectedPvz = {
    code: address.code,
    name: address.name,
    address: address.address,
    postalCode: address.postal_code || address.postalCode,
    workTime: address.work_time
  };

  // Update hidden inputs
  const pvzCodeInput = document.getElementById('selected-pvz-code');
  const pvzAddressInput = document.getElementById('selected-pvz-address');

  if (pvzCodeInput) pvzCodeInput.value = address.code || '';
  if (pvzAddressInput) pvzAddressInput.value = address.address || '';

  // Fill the postal input field with PVZ address
  const postalInput = document.getElementById('order-postal-index');
  if (postalInput) {
    postalInput.value = address.address;
  }

  // Show inline address hint
  showPostalAddressHint(address.address);

  // Save for provider switching
  shippingState.savedCdekPvz = shippingState.selectedPvz;
  shippingState.savedCdekInputValue = address.address;

  // Hide the CDEK PVZ suggestions after selection
  const cdekSuggestions = document.getElementById('cdek-pvz-suggestions');
  if (cdekSuggestions) {
    cdekSuggestions.style.display = 'none';
  }

  // Hide map if it's open
  hidePvzSelection();

  // Trigger shipping calculation with selected PVZ
  _triggerShippingCalculation();
}

/**
 * Load Yandex Maps JavaScript API
 */
export async function loadYandexMapsApi() {
  if (typeof ymaps !== 'undefined') {
    return;
  }

  // Get API key from window config or fetch from server
  let apiKey = window.YANDEX_MAPS_API_KEY;
  if (!apiKey) {
    try {
      const configResponse = await fetch('/api/config/client');
      if (configResponse.ok) {
        const configData = await configResponse.json();
        apiKey = configData.config?.yandexMapsApiKey;
        if (apiKey) {
          window.YANDEX_MAPS_API_KEY = apiKey;
        }
      }
    } catch (err) {
      console.warn('[Shipping] Could not fetch client config for Yandex API key:', err);
    }
  }

  if (!apiKey) {
    throw new Error('Yandex Maps API key not configured');
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${apiKey}&lang=ru_RU&csp=202512`;
    script.async = true;
    script.onload = () => {
      console.log('[Shipping] Yandex Maps API loaded');
      ymapsLoaded = true;
      resolve();
    };
    script.onerror = (err) => {
      console.error('[Shipping] Failed to load Yandex Maps script:', err);
      reject(err);
    };
    document.head.appendChild(script);
  });
}

// Old Pochta map functions removed - using unified Yandex Maps widget

