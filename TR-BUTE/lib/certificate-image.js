/**
 * Certificate Image Generator
 *
 * Generates certificate images by compositing dynamic text (recipient name,
 * amount, certificate code) onto template background images.
 *
 * Two renderers with automatic fallback:
 *   1. @napi-rs/canvas  — Canvas API: loadImage → drawImage → fillText → toBuffer
 *   2. sharp + SVG      — SVG text overlay composited via sharp
 *
 * Background images are stored in assets/certificate-backgrounds/ as {template_id}.jpg (or .png).
 * The "КОМУ:", "НА СУММУ:" labels, decorative elements, and logo are baked into
 * the background — this module overlays white rounded boxes + dynamic values.
 *
 * Text positions are defined as proportional coordinates (0-1) relative to
 * the image dimensions. Adjust LAYOUT constants to match your template.
 *
 * Font: Montserrat Bold subsets (Latin + Cyrillic TTF files in assets/fonts/).
 */

const path = require('path');
const fs = require('fs');
const axios = require('axios');
const config = require('./config');
const { recordUpload } = require('./storage-manager');

// ---------- LAYOUT CONFIGURATION ----------
// Proportional coordinates (0-1) for text placement on the certificate.
// x/y = center point of the text box. Calibrated to template 1 (2480x1748).
const LAYOUT = {
  recipientName: { x: 0.75, y: 0.246 },
  amount:        { x: 0.75, y: 0.418 },
  code:          { x: 0.75, y: 0.68 }
};

// Font sizes as proportion of image height
const FONT = {
  nameSize:     0.038,
  amountSize:   0.038,
  codeSize:     0.032,
  nameShrink:   15,    // shrink font when name exceeds this many chars
  charWidth:    0.68,  // avg advance width per uppercase char as fraction of em (SVG fallback only)
  hPad:         0.70,  // horizontal padding on each side (× fontSize)
  vPad:         0.31,  // vertical padding on each side (× fontSize)
  cornerRadius: 12,    // px — fixed rounding for 2480px-wide image
  color:        '#1a1a1a'
};

const BACKGROUNDS_DIR = path.join(__dirname, '..', 'assets', 'certificate-backgrounds');
const FONTS_DIR = path.join(__dirname, '..', 'assets', 'fonts');

// ---------- RENDERER DETECTION ----------
// Try to load @napi-rs/canvas at startup. If unavailable, fall back to sharp+SVG.

let canvasModule = null;
let sharpModule = null;
let activeRenderer = null; // 'canvas' | 'sharp-svg'

try {
  canvasModule = require('@napi-rs/canvas');

  // Register Montserrat Bold TTF fonts
  for (const name of ['Montserrat-Bold-Cyrillic', 'Montserrat-Bold-Latin']) {
    const ttfPath = path.join(FONTS_DIR, `${name}.ttf`);
    if (fs.existsSync(ttfPath)) {
      canvasModule.GlobalFonts.registerFromPath(ttfPath, 'Montserrat');
      console.log(`[certificate-image] Canvas font registered: ${name}.ttf`);
    }
  }

  activeRenderer = 'canvas';
  console.log('[certificate-image] Using renderer: @napi-rs/canvas');
} catch {
  console.log('[certificate-image] @napi-rs/canvas not available, using sharp+SVG fallback');
}

try {
  sharpModule = require('sharp');
  if (!activeRenderer) {
    activeRenderer = 'sharp-svg';
    console.log('[certificate-image] Using renderer: sharp+SVG');
  }
} catch {
  if (!activeRenderer) {
    throw new Error('[certificate-image] Neither @napi-rs/canvas nor sharp is available — cannot generate certificates');
  }
}

/**
 * Format a number as a price string: 3500 → "3 500"
 */
function formatAmount(amount) {
  return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Find the background image file for a given template ID.
 */
function findBackgroundPath(templateId) {
  for (const ext of ['.jpg', '.jpeg', '.png']) {
    const filePath = path.join(BACKGROUNDS_DIR, `${templateId}${ext}`);
    if (fs.existsSync(filePath)) return filePath;
  }
  return null;
}

// ---------- REMOTE BACKGROUND RESOLUTION ----------

const _bgBufferCache = new Map();
const _bgSyncedSet   = new Set();

const BG_STORAGE_KEY = (templateId, ext) => `certificate-backgrounds/${templateId}${ext}`;

function ensureBackgroundInStorage(templateId, buffer, ext) {
  if (_bgSyncedSet.has(templateId)) return;
  _bgSyncedSet.add(templateId);

  const key = BG_STORAGE_KEY(templateId, ext);
  const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';

  (async () => {
    for (const provider of UPLOAD_PROVIDER_CHAIN) {
      if (!isProviderEnabled(provider)) continue;
      try {
        if (provider === 'vercel-blob') {
          const { put } = await import('@vercel/blob');
          await put(key, buffer, { access: 'public', contentType, token: config.vercelBlob.token });
        } else if (provider === 'supabase') {
          const { createClient } = require('@supabase/supabase-js');
          const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);
          await supabase.storage.from('user-uploads')
            .upload(key, buffer, { contentType, cacheControl: '31536000', upsert: true });
        } else if (provider === 'yandex-s3') {
          const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
          const s3 = new S3Client({
            endpoint: config.yandexS3.endpoint, region: config.yandexS3.region,
            forcePathStyle: true,
            credentials: { accessKeyId: config.yandexS3.accessKeyId, secretAccessKey: config.yandexS3.secretAccessKey }
          });
          await s3.send(new PutObjectCommand({
            Bucket: config.yandexS3.bucket, Key: key, Body: buffer, ContentType: contentType, ACL: 'public-read'
          }));
        }
        console.log(`[certificate-image] Background ${templateId} synced to ${provider}`);
        return;
      } catch (err) {
        console.error(`[certificate-image] Background sync to ${provider} failed:`, err.message);
      }
    }
  })().catch(() => {});
}

async function downloadBackgroundFromStorage(templateId) {
  for (const ext of ['.jpg', '.png']) {
    const key = BG_STORAGE_KEY(templateId, ext);

    if (config.yandexS3.enabled) {
      try {
        const url = `${config.yandexS3.endpoint}/${config.yandexS3.bucket}/${key}`;
        const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
        if (resp.status === 200 && resp.data.length > 1000) {
          console.log(`[certificate-image] Downloaded background ${templateId} from yandex-s3 (${resp.data.length} bytes)`);
          return Buffer.from(resp.data);
        }
      } catch {}
    }

    if (config.supabase.enabled) {
      try {
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);
        const publicUrl = supabase.storage.from('user-uploads').getPublicUrl(key).data.publicUrl;
        const resp = await axios.get(publicUrl, { responseType: 'arraybuffer', timeout: 15000 });
        if (resp.status === 200 && resp.data.length > 1000) {
          console.log(`[certificate-image] Downloaded background ${templateId} from supabase (${resp.data.length} bytes)`);
          return Buffer.from(resp.data);
        }
      } catch {}
    }

    if (config.vercelBlob.enabled) {
      try {
        const { list } = await import('@vercel/blob');
        const result = await list({ prefix: key, token: config.vercelBlob.token, limit: 1 });
        if (result.blobs.length > 0) {
          const resp = await axios.get(result.blobs[0].url, { responseType: 'arraybuffer', timeout: 15000 });
          if (resp.status === 200 && resp.data.length > 1000) {
            console.log(`[certificate-image] Downloaded background ${templateId} from vercel-blob (${resp.data.length} bytes)`);
            return Buffer.from(resp.data);
          }
        }
      } catch {}
    }
  }

  return null;
}

async function resolveBackgroundBuffer(templateId) {
  const localPath = findBackgroundPath(templateId);
  if (localPath) {
    const buffer = fs.readFileSync(localPath);
    ensureBackgroundInStorage(templateId, buffer, path.extname(localPath));
    return buffer;
  }

  if (_bgBufferCache.has(templateId)) {
    return _bgBufferCache.get(templateId);
  }

  console.log(`[certificate-image] Local background not found for template ${templateId}, trying remote storage...`);
  const buffer = await downloadBackgroundFromStorage(templateId);
  if (buffer) {
    _bgBufferCache.set(templateId, buffer);
    return buffer;
  }

  return null;
}

// ---------- CANVAS RENDERER (primary) ----------

/**
 * Draw a rounded rectangle on the canvas context.
 */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/**
 * Draw a text field (white rounded box + centered text) on the canvas.
 */
function drawTextField(ctx, text, fontSize, cx, cy) {
  ctx.font = `bold ${fontSize}px Montserrat, DejaVu Sans, sans-serif`;
  const metrics = ctx.measureText(text);
  const textW = metrics.width;
  const padH = fontSize * FONT.hPad;
  const padV = fontSize * FONT.vPad;
  const boxW = textW + padH * 2;
  const boxH = fontSize + padV * 2;
  const r = FONT.cornerRadius;

  // White background box
  roundRect(ctx, cx - boxW / 2, cy - boxH / 2, boxW, boxH, r);
  ctx.fillStyle = 'white';
  ctx.fill();

  // Text
  ctx.fillStyle = FONT.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy);
}

async function generateWithCanvas({ bgBuffer, width, height, recipientName, amount, certificateCode }) {
  const { createCanvas, loadImage } = canvasModule;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Draw background
  const bgImage = await loadImage(bgBuffer);
  ctx.drawImage(bgImage, 0, 0, width, height);

  // Calculate font sizes
  const nameSize   = Math.round(height * FONT.nameSize);
  const amountSize = Math.round(height * FONT.amountSize);
  const codeSize   = Math.round(height * FONT.codeSize);
  const adjustedNameSize = recipientName.length > FONT.nameShrink
    ? Math.round(nameSize * (FONT.nameShrink / recipientName.length))
    : nameSize;

  const nameText   = recipientName.toUpperCase();
  const amountText = formatAmount(amount) + ' РУБ';

  // Draw text fields at proportional positions
  drawTextField(ctx, nameText,        adjustedNameSize, width * LAYOUT.recipientName.x, height * LAYOUT.recipientName.y);
  drawTextField(ctx, amountText,      amountSize,       width * LAYOUT.amount.x,        height * LAYOUT.amount.y);
  drawTextField(ctx, certificateCode, codeSize,         width * LAYOUT.code.x,          height * LAYOUT.code.y);

  return canvas.toBuffer('image/jpeg');
}

// ---------- SHARP + SVG RENDERER (fallback) ----------

let _svgFontFaceDefs = null;
let _svgFontFamily = "'DejaVu Sans', sans-serif";

function ensureSvgFontData() {
  if (_svgFontFaceDefs !== null) return;
  _svgFontFaceDefs = '';

  try {
    const faces = [];
    for (const name of ['Montserrat-Bold-Cyrillic', 'Montserrat-Bold-Latin']) {
      const ttfPath = path.join(FONTS_DIR, `${name}.ttf`);
      if (!fs.existsSync(ttfPath)) continue;
      const b64 = fs.readFileSync(ttfPath).toString('base64');
      faces.push(
        `@font-face { font-family: 'Montserrat'; font-weight: bold; ` +
        `src: url('data:font/truetype;base64,${b64}') format('truetype'); }`
      );
      console.log(`[certificate-image] SVG font loaded: ${name}.ttf (${b64.length} base64 chars)`);
    }

    if (faces.length > 0) {
      _svgFontFaceDefs = `<defs><style type="text/css">${faces.join(' ')}</style></defs>`;
      _svgFontFamily = "'Montserrat', 'DejaVu Sans', sans-serif";
    }
  } catch (err) {
    console.error('[certificate-image] SVG font setup failed:', err.message);
  }
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function createSvgOverlay({ width, height, recipientName, amount, certificateCode }) {
  ensureSvgFontData();

  const nameSize   = Math.round(height * FONT.nameSize);
  const amountSize = Math.round(height * FONT.amountSize);
  const codeSize   = Math.round(height * FONT.codeSize);
  const adjustedNameSize = recipientName.length > FONT.nameShrink
    ? Math.round(nameSize * (FONT.nameShrink / recipientName.length))
    : nameSize;

  const boxWidth = (text, fontSize) => {
    const textW = text.length * fontSize * FONT.charWidth;
    return Math.round(textW + fontSize * FONT.hPad * 2);
  };
  const boxHeight = (fontSize) => Math.round(fontSize + fontSize * FONT.vPad * 2);

  const nameText   = recipientName.toUpperCase();
  const amountText = formatAmount(amount) + ' РУБ';
  const r          = FONT.cornerRadius;

  const nameBW = boxWidth(nameText, adjustedNameSize), nameBH = boxHeight(adjustedNameSize);
  const amtBW  = boxWidth(amountText, amountSize),     amtBH  = boxHeight(amountSize);
  const codeBW = boxWidth(certificateCode, codeSize),   codeBH = boxHeight(codeSize);

  const nameCX = Math.round(width * LAYOUT.recipientName.x), nameCY = Math.round(height * LAYOUT.recipientName.y);
  const amtCX  = Math.round(width * LAYOUT.amount.x),        amtCY  = Math.round(height * LAYOUT.amount.y);
  const codeCX = Math.round(width * LAYOUT.code.x),           codeCY = Math.round(height * LAYOUT.code.y);

  const box = (cx, cy, bw, bh) =>
    `<rect x="${cx - bw / 2}" y="${cy - bh / 2}" width="${bw}" height="${bh}" rx="${r}" ry="${r}" fill="white"/>`;
  const txt = (cx, cy, size, content) =>
    `<text x="${cx}" y="${cy}" font-family="${_svgFontFamily}" font-size="${size}" font-weight="bold" fill="${FONT.color}" text-anchor="middle" dominant-baseline="central">${escapeXml(content)}</text>`;

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  ${_svgFontFaceDefs}
  ${box(nameCX, nameCY, nameBW, nameBH)}
  ${txt(nameCX, nameCY, adjustedNameSize, nameText)}
  ${box(amtCX, amtCY, amtBW, amtBH)}
  ${txt(amtCX, amtCY, amountSize, amountText)}
  ${box(codeCX, codeCY, codeBW, codeBH)}
  ${txt(codeCX, codeCY, codeSize, certificateCode)}
</svg>`;
}

async function generateWithSharpSvg({ bgBuffer, width, height, recipientName, amount, certificateCode }) {
  const svgOverlay = createSvgOverlay({ width, height, recipientName, amount, certificateCode });
  return sharpModule(bgBuffer)
    .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

// ---------- PUBLIC API ----------

/**
 * Generate a certificate image buffer.
 * Tries @napi-rs/canvas first, falls back to sharp+SVG.
 *
 * @param {Object} params
 * @param {number} params.templateId - Template ID (maps to background file)
 * @param {string} params.recipientName - Recipient name to display
 * @param {number} params.amount - Certificate amount in rubles
 * @param {string} params.certificateCode - Certificate code (e.g. "ABCD-EFGH")
 * @returns {Promise<Buffer>} JPEG image buffer
 */
async function generateCertificateImage({ templateId, recipientName, amount, certificateCode }) {
  console.log(`[certificate-image] Generating (renderer=${activeRenderer}) for template ${templateId}...`);

  const bgBuffer = await resolveBackgroundBuffer(templateId);
  if (!bgBuffer) {
    throw new Error(
      `Certificate background not found for template ${templateId} (checked local files and remote storage). ` +
      `Place a .jpg or .png file at: ${BACKGROUNDS_DIR}/${templateId}.jpg`
    );
  }

  // Get image dimensions — canvas needs them for createCanvas, sharp-svg needs them for the SVG viewport
  let width, height;
  if (sharpModule) {
    const metadata = await sharpModule(bgBuffer).metadata();
    width = metadata.width;
    height = metadata.height;
  } else {
    // @napi-rs/canvas loadImage can give us dimensions
    const img = await canvasModule.loadImage(bgBuffer);
    width = img.width;
    height = img.height;
  }

  console.log(`[certificate-image] Background: ${width}x${height}`);

  const params = { bgBuffer, width, height, recipientName, amount, certificateCode };

  // Try canvas first, fall back to sharp+SVG
  if (canvasModule) {
    try {
      const result = await generateWithCanvas(params);
      console.log(`[certificate-image] Canvas render OK (${result.length} bytes)`);
      return result;
    } catch (err) {
      console.error(`[certificate-image] Canvas render failed, trying sharp+SVG fallback:`, err.message);
      if (sharpModule) {
        const result = await generateWithSharpSvg(params);
        console.log(`[certificate-image] Sharp+SVG fallback OK (${result.length} bytes)`);
        return result;
      }
      throw err;
    }
  }

  // sharp+SVG only (no canvas available)
  const result = await generateWithSharpSvg(params);
  console.log(`[certificate-image] Sharp+SVG render OK (${result.length} bytes)`);
  return result;
}

// ---------- UPLOAD FUNCTIONS ----------

async function uploadToVercelBlob(buffer, fileName) {
  const { put } = await import('@vercel/blob');
  const blob = await put(fileName, buffer, {
    access: 'public',
    contentType: 'image/jpeg',
    token: config.vercelBlob.token
  });
  return blob.url;
}

async function uploadToYandexS3(buffer, fileName) {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  console.log(`[certificate-image] Uploading to Yandex S3: bucket=${config.yandexS3.bucket} key=${fileName}`);
  const s3Client = new S3Client({
    endpoint: config.yandexS3.endpoint,
    region: config.yandexS3.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.yandexS3.accessKeyId,
      secretAccessKey: config.yandexS3.secretAccessKey
    }
  });
  await s3Client.send(new PutObjectCommand({
    Bucket: config.yandexS3.bucket,
    Key: fileName,
    Body: buffer,
    ContentType: 'image/jpeg',
    ACL: 'public-read'
  }));
  const url = `${config.yandexS3.endpoint}/${config.yandexS3.bucket}/${fileName}`;
  console.log(`[certificate-image] Yandex S3 upload OK: ${url}`);
  return url;
}

async function uploadToSupabase(buffer, fileName) {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);
  const { error } = await supabase.storage
    .from('user-uploads')
    .upload(fileName, buffer, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false });
  if (error) throw new Error(`Supabase upload failed: ${error.message}`);
  return supabase.storage.from('user-uploads').getPublicUrl(fileName).data.publicUrl;
}

const UPLOAD_PROVIDER_CHAIN = ['vercel-blob', 'supabase', 'yandex-s3'];

function isProviderEnabled(provider) {
  if (provider === 'vercel-blob') return config.vercelBlob.enabled;
  if (provider === 'supabase') return config.supabase.enabled;
  if (provider === 'yandex-s3') return config.yandexS3.enabled;
  return false;
}

async function uploadWithFallback(buffer, fileName, contextLabel) {
  const errors = [];
  for (const provider of UPLOAD_PROVIDER_CHAIN) {
    if (!isProviderEnabled(provider)) continue;
    try {
      let url;
      if (provider === 'vercel-blob') url = await uploadToVercelBlob(buffer, fileName);
      else if (provider === 'supabase') url = await uploadToSupabase(buffer, fileName);
      else if (provider === 'yandex-s3') url = await uploadToYandexS3(buffer, fileName);
      return { url, provider };
    } catch (err) {
      console.error(`[certificate-image] ${contextLabel}: upload to ${provider} failed: ${err.message}`);
      errors.push(`${provider}: ${err.message}`);
    }
  }
  throw new Error(
    `[certificate-image] ${contextLabel}: all storage providers failed — ${errors.join('; ')}`
  );
}

async function uploadCertificateImage(buffer, certificateId) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const fileName = `certificates/${certificateId}/${timestamp}-${random}.jpg`;

  const { url, provider } = await uploadWithFallback(buffer, fileName, `cert #${certificateId}`);

  try {
    await recordUpload(provider, fileName, buffer.length, {
      fileType: 'image/jpeg',
      contextType: 'certificate',
      contextId: String(certificateId)
    });
  } catch (err) {
    console.error('[certificate-image] Error recording upload:', err);
  }

  console.log(`[certificate-image] Uploaded certificate #${certificateId} to ${provider}: ${url}`);
  return url;
}

async function generateAndUploadCertificateImage(certificate, pool) {
  console.log(`[certificate-image] Generating image for cert #${certificate.id} (template=${certificate.template_id})`);

  let buffer;
  try {
    buffer = await generateCertificateImage({
      templateId: certificate.template_id,
      recipientName: certificate.recipient_name,
      amount: certificate.amount,
      certificateCode: certificate.certificate_code
    });
    console.log(`[certificate-image] Render OK for cert #${certificate.id} (${buffer.length} bytes)`);
  } catch (err) {
    console.error(`[certificate-image] Render FAILED for cert #${certificate.id}:`, err);
    throw err;
  }

  let url;
  try {
    url = await uploadCertificateImage(buffer, certificate.id);
  } catch (err) {
    console.error(`[certificate-image] Upload FAILED for cert #${certificate.id}:`, err);
    throw err;
  }

  await pool.query(
    'UPDATE certificates SET cert_image_url = $1 WHERE id = $2',
    [url, certificate.id]
  );

  console.log(`[certificate-image] Cert #${certificate.id} image saved: ${url}`);
  return url;
}

async function generateTemplatePreview(templateId, pool) {
  const bgBuffer = await resolveBackgroundBuffer(templateId);

  if (!bgBuffer) {
    console.log(
      `[certificate-image] No background for template ${templateId} (local or remote), skipping preview generation. ` +
      `Add file: ${BACKGROUNDS_DIR}/${templateId}.jpg`
    );
    return null;
  }

  const buffer = await generateCertificateImage({
    templateId,
    recipientName: 'Анна',
    amount: 3500,
    certificateCode: 'XXXX-XXXX'
  });

  const url = await uploadTemplatePreview(buffer, templateId);

  await pool.query(
    'UPDATE certificate_templates SET image_url = $1 WHERE id = $2',
    [url, templateId]
  );

  console.log(`[certificate-image] Template #${templateId} preview generated: ${url}`);
  return url;
}

async function uploadTemplatePreview(buffer, templateId) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const fileName = `certificate-templates/${templateId}/preview-${timestamp}-${random}.jpg`;

  const { url, provider } = await uploadWithFallback(buffer, fileName, `template #${templateId} preview`);

  try {
    await recordUpload(provider, fileName, buffer.length, {
      fileType: 'image/jpeg',
      contextType: 'certificate-template',
      contextId: String(templateId)
    });
  } catch (err) {
    console.error('[certificate-image] Error recording template preview upload:', err);
  }

  return url;
}

module.exports = {
  generateCertificateImage,
  uploadCertificateImage,
  generateAndUploadCertificateImage,
  generateTemplatePreview,
  findBackgroundPath,
  BACKGROUNDS_DIR
};
