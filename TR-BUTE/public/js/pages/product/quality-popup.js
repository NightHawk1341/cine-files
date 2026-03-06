// Product quality popup and product info display

// Quality labels and explanations
const qualityLabels = {
  best: 'лучшее',
  good: 'хорошее',
  medium: 'среднее'
};

const qualityExplanations = {
  best: 'За основу был взят фон в идеальном исходном качестве или фон был воссоздан нами с нуля или отреставрирован',
  good: 'За основу был взят фон в хорошем качестве, но недостаточном разрешении, поэтому была применена постобработка для улучшения качества - или фон собран из нескольких частей неравноценных по качеству',
  medium: 'За основу был взят фон в единственном доступном не очень высоком качестве и разрешении, поэтому была применена значительная постобработка - либо у исходного фона есть специфичная текстура, постобработка которой исказит изначальную фактуру'
};

export const renderProductInfo = (product) => {
  // Find or create the product info container
  let productInfoContainer = document.getElementById('product-info-container');
  const productDescription = document.getElementById('description-text');

  if (!productInfoContainer) {
    productInfoContainer = document.createElement('div');
    productInfoContainer.id = 'product-info-container';
    productInfoContainer.className = 'product-info-container';
    productInfoContainer.style.cssText = `
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      margin-bottom: 16px;
      padding: 12px 16px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 8px;
      font-size: 14px;
    `;
    // Insert before the description
    if (productDescription && productDescription.parentNode) {
      productDescription.parentNode.insertBefore(productInfoContainer, productDescription);
    }
  }

  productInfoContainer.innerHTML = '';

  // Only show container if there's content
  let hasContent = false;

  // Quality display
  if (product.quality && qualityLabels[product.quality]) {
    hasContent = true;
    const qualityWrapper = document.createElement('div');
    qualityWrapper.className = 'product-info-item';
    qualityWrapper.style.cssText = 'display: flex; align-items: center; gap: 6px;';

    const qualityLabel = document.createElement('span');
    qualityLabel.style.cssText = 'color: #818181;';
    qualityLabel.textContent = 'Качество фона:';

    const qualityValue = document.createElement('span');
    qualityValue.style.cssText = 'color: #E0E0E0; font-weight: 500;';
    qualityValue.textContent = qualityLabels[product.quality];

    const qualityInfoBtn = document.createElement('button');
    qualityInfoBtn.className = 'quality-info-btn';
    qualityInfoBtn.style.cssText = `
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #818181;
      font-size: 11px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      margin-left: 4px;
    `;
    qualityInfoBtn.textContent = '?';
    qualityInfoBtn.addEventListener('click', () => {
      showQualityPopup(product.quality);
    });

    qualityWrapper.appendChild(qualityLabel);
    qualityWrapper.appendChild(qualityValue);
    qualityWrapper.appendChild(qualityInfoBtn);
    productInfoContainer.appendChild(qualityWrapper);
  }

  // Hide container if no content
  productInfoContainer.style.display = hasContent ? 'flex' : 'none';
};

export const showQualityPopup = (quality) => {
  const explanation = qualityExplanations[quality] || '';
  const label = qualityLabels[quality] || '';

  // Create popup overlay
  const overlay = document.createElement('div');
  overlay.className = 'quality-popup-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10005;
    padding: 20px;
  `;

  // Create popup content
  const popup = document.createElement('div');
  popup.className = 'quality-popup';
  popup.style.cssText = `
    background: #1a1a1a;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    padding: 24px;
    max-width: 400px;
    width: 100%;
    position: relative;
  `;

  popup.innerHTML = `
    <button class="quality-popup-close" style="
      position: absolute;
      top: 12px;
      right: 12px;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.1);
      border: none;
      color: #818181;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
    ">×</button>
    <h3 style="margin: 0 0 8px 0; color: #E0E0E0; font-size: 18px;">Качество фона: ${label}</h3>
    <p style="margin: 0; color: #818181; line-height: 1.6; font-size: 14px;">${explanation}</p>
  `;

  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  // Close handlers
  const closePopup = () => {
    overlay.remove();
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closePopup();
    }
  });

  popup.querySelector('.quality-popup-close').addEventListener('click', closePopup);

  // Escape key handler
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closePopup();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
};

