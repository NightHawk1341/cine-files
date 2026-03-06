/**
 * Parcel Calculator Service
 *
 * Calculates optimal parcel packaging based on order items.
 * Follows business rules for poster packaging (tubes vs cartons).
 *
 * Key Rules:
 * - A3 frameless can fit inside cartons with framed items
 * - A2/A1 frameless are too large for cartons, require tubes
 * - When order has both large frameless AND framed items, split into 2 parcels
 *
 * Capacity Limits:
 * - tube_a3: max 5 A3 frameless
 * - tube_a2: max 5 A2 + 5 A3 frameless (10 total)
 * - tube_a1: max 5 A1 + 5 A2/A3 frameless (10 total)
 * - half_carton: max 2 A3 framed
 * - full_carton: max 5 A2 framed (or ~3 A2 + 2 A3 equivalent)
 */

// Capacity limits per packaging type
const CAPACITY_LIMITS = {
  tube_a3: { a3: 5, a2: 0, a1: 0 },
  tube_a2: { a3: 5, a2: 5, a1: 0 },  // Can hold 5 A2 + 5 A3
  tube_a1: { a3: 5, a2: 5, a1: 5 },  // Can hold 5 A1 + 5 smaller
  half_carton: { a3Framed: 2, a2Framed: 0 },
  full_carton: { a3Framed: 5, a2Framed: 5 }  // ~5 A2 or mix
};

// Default packaging configuration (can be overridden from database)
const DEFAULT_PACKAGING_CONFIG = {
  tube_a3: {
    code: 'tube_a3',
    displayName: 'Тубус А3',
    cost: 50,
    weightGrams: 70,
    maxFramelessFormat: 'A3',
    isCarton: false,
    dimensions: { length: 35, width: 8, height: 8 }
  },
  tube_a2: {
    code: 'tube_a2',
    displayName: 'Тубус А2',
    cost: 70,
    weightGrams: 100,
    maxFramelessFormat: 'A2',
    isCarton: false,
    dimensions: { length: 50, width: 8, height: 8 }
  },
  tube_a1: {
    code: 'tube_a1',
    displayName: 'Тубус А1',
    cost: 140,
    weightGrams: 180,
    maxFramelessFormat: 'A1',
    isCarton: false,
    dimensions: { length: 70, width: 10, height: 10 }
  },
  half_carton: {
    code: 'half_carton',
    displayName: 'Полукартон',
    cost: 30,
    weightGrams: 100,
    isCarton: true,
    cartonSize: 'half',
    dimensions: { length: 45, width: 35, height: 5 }
  },
  full_carton: {
    code: 'full_carton',
    displayName: 'Картон',
    cost: 60,
    weightGrams: 200,
    isCarton: true,
    cartonSize: 'full',
    dimensions: { length: 62, width: 45, height: 8 }
  }
};

// Default product weights by format and frame type
const DEFAULT_PRODUCT_WEIGHTS = {
  'A3_no_frame': 30,
  'A2_no_frame': 50,
  'A1_no_frame': 100,
  'A3_with_frame': 600,
  'A2_with_frame': 1100
};

/**
 * Parse item property string to extract format and frame type
 * @param {string} property - e.g., "A2 без рамки" or "A3 в белой рамке"
 * @returns {{ format: string, hasFrame: boolean, frameType: string | null }}
 */
function parseItemProperty(property) {
  const normalizedProperty = property.toLowerCase();

  // Extract format (A3, A2, A1)
  const formatMatch = normalizedProperty.match(/a([123])/i);
  const format = formatMatch ? `A${formatMatch[1]}` : 'A2';

  // Check for frame
  const hasFrame = normalizedProperty.includes('рамк');
  const isFrameless = normalizedProperty.includes('без рамк') || !hasFrame;

  let frameType = null;
  if (hasFrame && !isFrameless) {
    if (normalizedProperty.includes('бел')) frameType = 'white_frame';
    else if (normalizedProperty.includes('черн')) frameType = 'black_frame';
    else if (normalizedProperty.includes('натур') || normalizedProperty.includes('дерев')) frameType = 'natural_frame';
    else frameType = 'white_frame'; // default
  }

  return {
    format,
    hasFrame: !isFrameless,
    frameType
  };
}

/**
 * Get weight for an item based on its format and frame type
 * @param {string} format - A3, A2, or A1
 * @param {boolean} hasFrame - Whether item has a frame
 * @param {object} weightConfig - Weight configuration from database
 * @returns {number} Weight in grams
 */
function getItemWeight(format, hasFrame, weightConfig = DEFAULT_PRODUCT_WEIGHTS) {
  const key = `${format}_${hasFrame ? 'with' : 'no'}_frame`;
  return weightConfig[key] || DEFAULT_PRODUCT_WEIGHTS['A2_no_frame'];
}

/**
 * Categorize order items into packaging groups
 * @param {Array} items - Order items with property and quantity
 * @returns {{ a3Frameless: Array, a2Frameless: Array, a1Frameless: Array, a3Framed: Array, a2Framed: Array }}
 */
function categorizeItems(items) {
  const categories = {
    a3Frameless: [],
    a2Frameless: [],
    a1Frameless: [],
    a3Framed: [],
    a2Framed: []
  };

  for (const item of items) {
    const { format, hasFrame } = parseItemProperty(item.property || '');
    const quantity = item.quantity || 1;

    // Create expanded items for each quantity
    for (let i = 0; i < quantity; i++) {
      const itemCopy = { ...item, quantity: 1 };

      if (!hasFrame) {
        // Frameless items
        if (format === 'A3') categories.a3Frameless.push(itemCopy);
        else if (format === 'A2') categories.a2Frameless.push(itemCopy);
        else if (format === 'A1') categories.a1Frameless.push(itemCopy);
      } else {
        // Framed items
        if (format === 'A3') categories.a3Framed.push(itemCopy);
        else if (format === 'A2') categories.a2Framed.push(itemCopy);
        // Note: A1 framed is not typically offered
      }
    }
  }

  return categories;
}

/**
 * Split frameless items into tube parcels respecting capacity limits
 * @param {Array} a1Items - A1 frameless items
 * @param {Array} a2Items - A2 frameless items
 * @param {Array} a3Items - A3 frameless items
 * @param {Object} capacityLimits - Capacity limits configuration
 * @returns {Array} Array of { tubeType, items }
 */
function splitFramelessIntoTubes(a1Items, a2Items, a3Items, capacityLimits = CAPACITY_LIMITS) {
  const tubes = [];

  // Copy arrays to avoid mutation
  let remaining1 = [...a1Items];
  let remaining2 = [...a2Items];
  let remaining3 = [...a3Items];

  // First, handle A1 items (need tube_a1)
  while (remaining1.length > 0) {
    const tubeItems = [];
    const limits = capacityLimits.tube_a1 || CAPACITY_LIMITS.tube_a1;

    // Take up to 5 A1
    const a1Take = remaining1.splice(0, limits.a1);
    tubeItems.push(...a1Take);

    // Fill remaining space with A2 (up to 5)
    const a2Space = limits.a2;
    const a2Take = remaining2.splice(0, a2Space);
    tubeItems.push(...a2Take);

    // Fill remaining space with A3 (up to 5)
    const a3Space = limits.a3;
    const a3Take = remaining3.splice(0, a3Space);
    tubeItems.push(...a3Take);

    tubes.push({ tubeType: 'tube_a1', items: tubeItems });
  }

  // Then, handle A2 items (need tube_a2)
  while (remaining2.length > 0) {
    const tubeItems = [];
    const limits = capacityLimits.tube_a2 || CAPACITY_LIMITS.tube_a2;

    // Take up to 5 A2
    const a2Take = remaining2.splice(0, limits.a2);
    tubeItems.push(...a2Take);

    // Fill remaining space with A3 (up to 5)
    const a3Space = limits.a3;
    const a3Take = remaining3.splice(0, a3Space);
    tubeItems.push(...a3Take);

    tubes.push({ tubeType: 'tube_a2', items: tubeItems });
  }

  // Finally, handle remaining A3 items (tube_a3)
  while (remaining3.length > 0) {
    const limits = capacityLimits.tube_a3 || CAPACITY_LIMITS.tube_a3;
    const a3Take = remaining3.splice(0, limits.a3);
    tubes.push({ tubeType: 'tube_a3', items: a3Take });
  }

  return tubes;
}

/**
 * Split framed items into carton parcels respecting capacity limits
 * A3 frameless can also go into cartons with framed items
 * @param {Array} a2FramedItems - A2 framed items
 * @param {Array} a3FramedItems - A3 framed items
 * @param {Array} a3FramelessItems - A3 frameless items (can fit in carton)
 * @param {Object} capacityLimits - Capacity limits configuration
 * @returns {Array} Array of { cartonType, items }
 */
function splitFramedIntoCartons(a2FramedItems, a3FramedItems, a3FramelessItems, capacityLimits = CAPACITY_LIMITS) {
  const cartons = [];

  // Copy arrays to avoid mutation
  let remaining2Framed = [...a2FramedItems];
  let remaining3Framed = [...a3FramedItems];
  let remaining3Frameless = [...a3FramelessItems];

  // Handle A2 framed first (needs full_carton)
  while (remaining2Framed.length > 0) {
    const cartonItems = [];
    const limits = capacityLimits.full_carton || CAPACITY_LIMITS.full_carton;

    // Take up to 5 A2 framed
    const a2Take = remaining2Framed.splice(0, limits.a2Framed);
    cartonItems.push(...a2Take);

    // Fill remaining space with A3 framed if we have room
    // Approximate: each A2 framed takes ~2 A3 framed slots
    const a3FramedSpace = Math.max(0, limits.a3Framed - a2Take.length * 2);
    const a3FramedTake = remaining3Framed.splice(0, a3FramedSpace);
    cartonItems.push(...a3FramedTake);

    // Add A3 frameless (they fit easily)
    const a3FramelessLimit = limits.a3Frameless || 5;
    const a3FramelessTake = remaining3Frameless.splice(0, a3FramelessLimit);
    cartonItems.push(...a3FramelessTake);

    cartons.push({ cartonType: 'full_carton', items: cartonItems });
  }

  // Handle remaining A3 framed
  while (remaining3Framed.length > 0) {
    const cartonItems = [];

    // Determine carton type based on count
    const halfLimits = capacityLimits.half_carton || CAPACITY_LIMITS.half_carton;
    if (remaining3Framed.length <= (halfLimits.a3Framed || 2) && remaining2Framed.length === 0) {
      // Half carton for 1-2 A3 framed
      const a3Take = remaining3Framed.splice(0, halfLimits.a3Framed);
      cartonItems.push(...a3Take);

      // Add some A3 frameless
      const a3FramelessLimit = halfLimits.a3Frameless || 3;
      const a3FramelessTake = remaining3Frameless.splice(0, a3FramelessLimit);
      cartonItems.push(...a3FramelessTake);

      cartons.push({ cartonType: 'half_carton', items: cartonItems });
    } else {
      // Full carton for more A3 framed
      const limits = capacityLimits.full_carton || CAPACITY_LIMITS.full_carton;
      const a3Take = remaining3Framed.splice(0, limits.a3Framed);
      cartonItems.push(...a3Take);

      // Add A3 frameless
      const a3FramelessLimit = limits.a3Frameless || 5;
      const a3FramelessTake = remaining3Frameless.splice(0, a3FramelessLimit);
      cartonItems.push(...a3FramelessTake);

      cartons.push({ cartonType: 'full_carton', items: cartonItems });
    }
  }

  // Handle remaining A3 frameless that didn't fit in cartons
  // These should go to tubes instead (handled by caller)
  return { cartons, remainingA3Frameless: remaining3Frameless };
}

/**
 * Calculate optimal parcel packaging for order items
 *
 * @param {Array} orderItems - Array of order items with { id, product_id, title, property, quantity, price_at_purchase }
 * @param {object} options - Optional configuration
 * @param {object} options.packagingConfig - Custom packaging configuration
 * @param {object} options.weightConfig - Custom weight configuration
 * @param {object} options.capacityLimits - Custom capacity limits
 * @returns {Array} Array of parcel objects with items, packaging type, weight, cost, dimensions
 */
function calculateParcels(orderItems, options = {}) {
  const packagingConfig = options.packagingConfig || DEFAULT_PACKAGING_CONFIG;
  const weightConfig = options.weightConfig || DEFAULT_PRODUCT_WEIGHTS;
  const capacityLimits = options.capacityLimits || CAPACITY_LIMITS;

  // Filter out certificates and custom items that don't need physical shipping
  const physicalItems = orderItems.filter(item => {
    // Certificates are digital or handled separately
    if (item.certificate_id) return false;
    return true;
  });

  if (physicalItems.length === 0) {
    return [];
  }

  const categories = categorizeItems(physicalItems);
  const { a3Frameless, a2Frameless, a1Frameless, a3Framed, a2Framed } = categories;

  const hasLargeFrameless = a2Frameless.length > 0 || a1Frameless.length > 0;
  const hasFramed = a3Framed.length > 0 || a2Framed.length > 0;

  const parcels = [];
  let parcelNumber = 1;

  // CASE 1: Large frameless (A2/A1) + any framed → SPLIT into tubes + cartons
  if (hasLargeFrameless && hasFramed) {
    // Tubes for large frameless items
    const tubes = splitFramelessIntoTubes(a1Frameless, a2Frameless, [], capacityLimits);
    for (const tube of tubes) {
      parcels.push(createParcel({
        items: tube.items,
        packagingType: tube.tubeType,
        packagingConfig,
        weightConfig,
        parcelNumber: parcelNumber++
      }));
    }

    // Cartons for framed + A3 frameless (A3 frameless fits in carton!)
    const { cartons, remainingA3Frameless } = splitFramedIntoCartons(a2Framed, a3Framed, a3Frameless, capacityLimits);
    for (const carton of cartons) {
      parcels.push(createParcel({
        items: carton.items,
        packagingType: carton.cartonType,
        packagingConfig,
        weightConfig,
        parcelNumber: parcelNumber++
      }));
    }

    // Any remaining A3 frameless go to tubes
    if (remainingA3Frameless.length > 0) {
      const a3Tubes = splitFramelessIntoTubes([], [], remainingA3Frameless, capacityLimits);
      for (const tube of a3Tubes) {
        parcels.push(createParcel({
          items: tube.items,
          packagingType: tube.tubeType,
          packagingConfig,
          weightConfig,
          parcelNumber: parcelNumber++
        }));
      }
    }
  }
  // CASE 2: Only large frameless (no framed) → tubes
  else if (hasLargeFrameless && !hasFramed) {
    const tubes = splitFramelessIntoTubes(a1Frameless, a2Frameless, a3Frameless, capacityLimits);
    for (const tube of tubes) {
      parcels.push(createParcel({
        items: tube.items,
        packagingType: tube.tubeType,
        packagingConfig,
        weightConfig,
        parcelNumber: parcelNumber++
      }));
    }
  }
  // CASE 3: Framed items (may include A3 frameless) → cartons
  else if (hasFramed) {
    const { cartons, remainingA3Frameless } = splitFramedIntoCartons(a2Framed, a3Framed, a3Frameless, capacityLimits);
    for (const carton of cartons) {
      parcels.push(createParcel({
        items: carton.items,
        packagingType: carton.cartonType,
        packagingConfig,
        weightConfig,
        parcelNumber: parcelNumber++
      }));
    }

    // Any remaining A3 frameless go to tubes
    if (remainingA3Frameless.length > 0) {
      const a3Tubes = splitFramelessIntoTubes([], [], remainingA3Frameless, capacityLimits);
      for (const tube of a3Tubes) {
        parcels.push(createParcel({
          items: tube.items,
          packagingType: tube.tubeType,
          packagingConfig,
          weightConfig,
          parcelNumber: parcelNumber++
        }));
      }
    }
  }
  // CASE 4: Only A3 frameless → tubes
  else if (a3Frameless.length > 0) {
    const tubes = splitFramelessIntoTubes([], [], a3Frameless, capacityLimits);
    for (const tube of tubes) {
      parcels.push(createParcel({
        items: tube.items,
        packagingType: tube.tubeType,
        packagingConfig,
        weightConfig,
        parcelNumber: parcelNumber++
      }));
    }
  }

  return parcels;
}

/**
 * Create a parcel object with calculated weight and cost
 */
function createParcel({ items, packagingType, packagingConfig, weightConfig, parcelNumber }) {
  const packaging = packagingConfig[packagingType];

  // Calculate items weight
  let itemsWeight = 0;
  for (const item of items) {
    const { format, hasFrame } = parseItemProperty(item.property || '');
    const itemWeight = getItemWeight(format, hasFrame, weightConfig);
    console.log('[ParcelCalc] Item weight:', {
      property: item.property,
      parsedFormat: format,
      parsedHasFrame: hasFrame,
      weight: itemWeight
    });
    itemsWeight += itemWeight;
  }

  const totalWeight = itemsWeight + packaging.weightGrams;
  console.log('[ParcelCalc] Parcel weight:', {
    itemsWeight,
    packagingWeight: packaging.weightGrams,
    totalWeight
  });

  return {
    parcelNumber,
    packagingType: packaging.code,
    packagingDisplayName: packaging.displayName,
    items: items.map(item => ({
      orderItemId: item.id,
      productId: item.product_id,
      title: item.title,
      property: item.property,
      quantity: 1 // Already expanded
    })),
    itemsWeight,
    packagingWeight: packaging.weightGrams,
    totalWeightGrams: totalWeight,
    packagingCost: packaging.cost,
    dimensions: packaging.dimensions
  };
}

/**
 * Calculate total packaging cost for an order
 * @param {Array} orderItems - Order items
 * @param {object} options - Configuration options
 * @returns {{ parcels: Array, totalPackagingCost: number, totalWeight: number }}
 */
function calculatePackagingCost(orderItems, options = {}) {
  const parcels = calculateParcels(orderItems, options);

  const totalPackagingCost = parcels.reduce((sum, p) => sum + p.packagingCost, 0);
  const totalWeight = parcels.reduce((sum, p) => sum + p.totalWeightGrams, 0);

  return {
    parcels,
    totalPackagingCost,
    totalWeight
  };
}

/**
 * Load packaging configuration from database
 * @param {object} pool - Database connection pool
 * @returns {object} Packaging configuration
 */
async function loadPackagingConfig(pool) {
  try {
    const result = await pool.query(`
      SELECT code, display_name, cost, weight_grams, max_frameless_format,
             is_carton, carton_size, dimensions_length_cm, dimensions_width_cm, dimensions_height_cm
      FROM packaging_config
      WHERE is_active = true
    `);

    const config = {};
    for (const row of result.rows) {
      config[row.code] = {
        code: row.code,
        displayName: row.display_name,
        cost: parseFloat(row.cost),
        weightGrams: row.weight_grams,
        maxFramelessFormat: row.max_frameless_format,
        isCarton: row.is_carton,
        cartonSize: row.carton_size,
        dimensions: {
          length: row.dimensions_length_cm,
          width: row.dimensions_width_cm,
          height: row.dimensions_height_cm
        }
      };
    }

    return Object.keys(config).length > 0 ? config : DEFAULT_PACKAGING_CONFIG;
  } catch (error) {
    console.error('Failed to load packaging config:', error);
    return DEFAULT_PACKAGING_CONFIG;
  }
}

/**
 * Load product weights from database
 * @param {object} pool - Database connection pool
 * @returns {object} Weight configuration
 */
async function loadProductWeights(pool) {
  try {
    const result = await pool.query(`
      SELECT format, frame_type, weight_grams
      FROM product_prices
      WHERE weight_grams IS NOT NULL
    `);

    const config = {};
    for (const row of result.rows) {
      const hasFrame = row.frame_type && row.frame_type !== 'no_frame';
      const key = `${row.format}_${hasFrame ? 'with' : 'no'}_frame`;
      config[key] = row.weight_grams;
    }

    return Object.keys(config).length > 0 ? config : DEFAULT_PRODUCT_WEIGHTS;
  } catch (error) {
    console.error('Failed to load product weights:', error);
    return DEFAULT_PRODUCT_WEIGHTS;
  }
}

/**
 * Load capacity limits from database
 * @param {object} pool - Database connection pool
 * @returns {object} Capacity limits configuration
 */
async function loadCapacityLimits(pool) {
  try {
    const result = await pool.query(`
      SELECT value FROM app_settings WHERE key = 'capacity_limits'
    `);

    if (result.rows.length > 0 && result.rows[0].value) {
      return result.rows[0].value;
    }

    return CAPACITY_LIMITS;
  } catch (error) {
    console.error('Failed to load capacity limits:', error);
    return CAPACITY_LIMITS;
  }
}

module.exports = {
  calculateParcels,
  calculatePackagingCost,
  loadPackagingConfig,
  loadProductWeights,
  loadCapacityLimits,
  parseItemProperty,
  getItemWeight,
  categorizeItems,
  CAPACITY_LIMITS,
  DEFAULT_PACKAGING_CONFIG,
  DEFAULT_PRODUCT_WEIGHTS
};
