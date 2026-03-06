/**
 * CRON: Check IP rights on FIPS (Роспатент)
 *
 * Extracts candidate IP names from product titles, searches FIPS trademark
 * database, and stores matches for admin review.
 *
 * GET /api/cron/check-ip-rights
 * Authorization: Bearer <CRON_SECRET>
 *
 * Schedule: weekly — "0 3 * * 1" (Monday 03:00 UTC)
 *
 * Responds immediately with { ok: true, status: 'started' } and runs the
 * scrape in the background. Progress is stored in app_settings under key
 * 'ip_rights_scan_status' so the admin UI can poll for updates.
 *
 * Designed to run on Yandex Cloud (Russian IP) to avoid FIPS access issues.
 * Can also be triggered manually via admin UI "Запустить проверку" button.
 */

const axios = require('axios');
const { getPool } = require('../../lib/db');
const config = require('../../lib/config');

const pool = getPool();
const TELEGRAM_API = `https://api.telegram.org/bot${config.telegram.adminBotToken}`;

// --- Term extraction ---

// Words to strip from product titles before extracting IP candidate names.
// These are common poster/print shop descriptors, not IP names.
const STOPWORDS = new Set([
  // Product type words
  'постер', 'арт', 'принт', 'арт-принт', 'стикер', 'открытка', 'плакат',
  'фотопостер', 'постеры', 'картина', 'репродукция', 'иллюстрация',
  // Size descriptors (standard paper sizes)
  'a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6',
  // Common qualifiers
  'матовый', 'глянцевый', 'матовая', 'глянцевая', 'горизонтальный',
  'вертикальный', 'горизонтальная', 'вертикальная', 'черно-белый',
  'цветной', 'цветная', 'новый', 'новая', 'большой', 'большая',
  // Prepositions / conjunctions (Russian)
  'в', 'и', 'на', 'от', 'до', 'для', 'из', 'с', 'к', 'по', 'за', 'при',
  'без', 'над', 'под', 'о', 'об', 'со', 'но', 'или', 'то', 'что', 'как',
  'не', 'ни', 'да', 'же', 'бы', 'ли', 'а', 'у', 'во',
  // Numbers and common non-IP tokens
  'set', 'pack', 'kit',
]);

// Strip dimension tokens like "30x40", "50х70" (Cyrillic х), numeric sizes
const DIMENSION_RE = /^\d+[xхXХ]\d+$|^\d+$/;

/**
 * Extract candidate IP names from a product title.
 * Returns an array of lowercase deduplicated candidate strings.
 */
function extractTerms(title) {
  if (!title) return [];

  let text = title
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[«»"'.,!?;:/|\\+<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = text.split(' ').filter(w => {
    if (!w || w.length < 2) return false;
    if (STOPWORDS.has(w)) return false;
    if (DIMENSION_RE.test(w)) return false;
    return true;
  });

  if (!words.length) return [];

  const candidates = new Set();

  // Build n-grams (1 to 4 words) from the remaining meaningful words
  for (let n = 1; n <= Math.min(4, words.length); n++) {
    for (let i = 0; i <= words.length - n; i++) {
      const phrase = words.slice(i, i + n).join(' ');
      if (phrase.length >= 3) candidates.add(phrase);
    }
  }

  return [...candidates];
}

// --- Progress tracking ---

async function setScanStatus(status) {
  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ('ip_rights_scan_status', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = NOW()`,
    [JSON.stringify(status)]
  );
}

// --- FIPS scraping ---

const FIPS_BASE = 'https://fips.ru/fips_servl/fips_servlet';
const REQUEST_DELAY_MS = 5000; // 5 s between requests — be polite

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Search FIPS for a single term.
 * Returns an array of result objects or an empty array if nothing found.
 *
 * Each result: { trademarkName, holderName, goodsClasses, fipsUrl }
 */
async function searchFips(term) {
  const params = new URLSearchParams({
    DB: 'RUTM',
    rn: '7038',
    ProcSearch: '1',
    HITS_PER_PAGE: '20',
    FIRSTRECORD: '1',
    QUERY: term,
  });

  const url = `${FIPS_BASE}?${params.toString()}`;

  let html;
  try {
    const resp = await axios.get(url, {
      timeout: 20000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; IP-rights-checker/1.0)',
        'Accept-Language': 'ru-RU,ru;q=0.9',
      },
      responseType: 'arraybuffer',
    });

    // FIPS uses windows-1251 encoding
    const decoder = new TextDecoder('windows-1251');
    html = decoder.decode(resp.data);
  } catch (err) {
    console.error(`FIPS fetch error for "${term}":`, err.message);
    return [];
  }

  if (/Ничего не найдено|0 записей|нет записей|found 0/i.test(html)) {
    return [];
  }

  const rowLinks = [...new Set((html.match(/DocNumber=(\d+)/g) || []))];
  if (!rowLinks.length) return [];

  const results = [];

  for (const docToken of rowLinks) {
    const docNum = docToken.replace('DocNumber=', '');
    const detailUrl = `${FIPS_BASE}?DB=RUTM&DocNumber=${docNum}&TypeFile=html`;

    const idx = html.indexOf(docToken);
    const block = html.substring(Math.max(0, idx - 200), idx + 1800);

    results.push({
      trademarkName: extractTrademarkName(block) || term,
      holderName: extractHolder(block),
      goodsClasses: extractClasses(block),
      fipsUrl: detailUrl,
    });
  }

  return results;
}

function extractHolder(block) {
  const patterns = [
    /Правообладатель[:\s]*<[^>]+>([^<]{3,100})/i,
    /Правообладатель[:\s]+([^\n<]{3,100})/i,
    /<TD[^>]*>([А-ЯA-Z][^<]{5,80}(?:ООО|ЗАО|ОАО|АО|ИП|LLC|Ltd|Inc|Corp|GmbH)[^<]*)<\/TD>/i,
    /(ООО|ЗАО|ОАО|АО|ИП)\s+[«"]?([А-ЯA-Zа-яa-z\s]{3,50})[»"]?/,
  ];
  for (const re of patterns) {
    const m = block.match(re);
    if (m) {
      const candidate = (m[1] || m[0]).replace(/<[^>]+>/g, '').trim();
      if (candidate.length >= 3) return candidate;
    }
  }
  return null;
}

function extractClasses(block) {
  const classes = new Set();
  const mctuMatch = block.match(/МКТУ[:\s]+([0-9,\s]+)/i);
  if (mctuMatch) {
    mctuMatch[1].split(/[,\s]+/).forEach(n => {
      const num = n.trim();
      if (/^\d{1,2}$/.test(num)) classes.add(num);
    });
  }
  const classMatches = block.match(/<TD[^>]*>\s*(\d{1,2})\s*<\/TD>/gi) || [];
  classMatches.forEach(td => {
    const num = td.replace(/<[^>]+>/g, '').trim();
    if (/^\d{1,2}$/.test(num) && parseInt(num) <= 45) classes.add(num);
  });
  return [...classes];
}

function extractTrademarkName(block) {
  const patterns = [
    /Товарный знак[:\s]*<[^>]+>([^<]{2,100})/i,
    /alt="([^"]{2,80})"/i,
    /title="([^"]{2,80})"/i,
  ];
  for (const re of patterns) {
    const m = block.match(re);
    if (m) {
      const name = m[1].replace(/<[^>]+>/g, '').trim();
      if (name.length >= 2) return name;
    }
  }
  return null;
}

// --- Notification ---

async function notifyAdmin(newCount) {
  if (!config.telegram.adminBotToken || !process.env.ADMIN_CHAT_ID) return;
  try {
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: process.env.ADMIN_CHAT_ID,
      text: `⚠ Найдено ${newCount} новых совпадений по правам на IP.\nПроверьте в разделе "IP-права" панели управления.`,
    });
  } catch (err) {
    console.error('notifyAdmin error:', err.message);
  }
}

// Hard timeout wrapper: axios timeout can fail to fire on hung TCP connections
function searchFipsWithTimeout(term) {
  const hardTimeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('FIPS hard timeout (30s)')), 30000)
  );
  return Promise.race([searchFips(term), hardTimeout]);
}

// --- Background scrape job ---

async function runScrape(partial = false) {
  const startedAt = new Date().toISOString();

  try {
    const { rows: products } = await pool.query(
      `SELECT DISTINCT title, ip_names FROM products WHERE status != 'deleted' AND title IS NOT NULL`
    );

    const allTerms = new Map();
    for (const { title, ip_names } of products) {
      if (ip_names) {
        // Explicit names set — use them directly instead of auto-extraction
        for (const name of ip_names.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)) {
          if (!allTerms.has(name)) allTerms.set(name, title);
        }
      } else {
        for (const term of extractTerms(title)) {
          if (!allTerms.has(term)) allTerms.set(term, title);
        }
      }
    }

    const { rows: fpRows } = await pool.query(
      `SELECT search_term, trademark_name FROM ip_rights_false_positives`
    );
    const fpMap = new Map();
    for (const { search_term, trademark_name } of fpRows) {
      if (!fpMap.has(search_term)) fpMap.set(search_term, new Set());
      fpMap.get(search_term).add(trademark_name.toLowerCase());
    }

    const { rows: recentChecks } = await pool.query(
      `SELECT DISTINCT search_term FROM ip_rights_checks WHERE checked_at > now() - interval '6 days'`
    );
    const recentTerms = new Set(recentChecks.map(r => r.search_term));

    // Partial mode: additionally skip terms already covered in the last scan
    let lastSearchedTerms = new Set();
    if (partial) {
      try {
        const { rows: statusRows } = await pool.query(
          `SELECT value FROM app_settings WHERE key = 'ip_rights_scan_status'`
        );
        if (statusRows.length) {
          const raw = statusRows[0].value;
          const prev = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (Array.isArray(prev?.searched_terms)) {
            lastSearchedTerms = new Set(prev.searched_terms.map(t => String(t).toLowerCase()));
          }
        }
      } catch (_) { /* ignore, fall through */ }
    }

    const terms = [...allTerms.keys()].filter(t => !recentTerms.has(t) && !lastSearchedTerms.has(t));
    const total = terms.length;

    let done = 0;
    let newFindings = 0;
    let errors = 0;
    const searchedTerms = [];
    const termResults = [];

    await setScanStatus({
      running: true,
      started_at: startedAt,
      last_update: new Date().toISOString(),
      terms_total: total,
      terms_done: 0,
      new_findings: 0,
    });

    for (const term of terms) {
      searchedTerms.push(term);
      try {
        const fipsResults = await searchFipsWithTimeout(term);
        let termNew = 0;
        let termSkipped = 0;

        for (const hit of fipsResults) {
          const fpSet = fpMap.get(term);
          if (fpSet && fpSet.has((hit.trademarkName || '').toLowerCase())) {
            termSkipped++;
            continue;
          }

          const existing = await pool.query(
            `SELECT id FROM ip_rights_checks
             WHERE search_term = $1 AND trademark_name = $2 AND status != 'dismissed'`,
            [term, hit.trademarkName || term]
          );
          if (existing.rows.length > 0) {
            termSkipped++;
            continue;
          }

          await pool.query(
            `INSERT INTO ip_rights_checks
               (search_term, fips_url, holder_name, trademark_name, goods_classes)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              term,
              hit.fipsUrl,
              hit.holderName || null,
              hit.trademarkName || term,
              hit.goodsClasses.length ? hit.goodsClasses : null,
            ]
          );
          termNew++;
          newFindings++;
        }
        termResults.push({ term, hits: fipsResults.length, new: termNew, skipped: termSkipped });
      } catch (err) {
        console.error(`Error processing term "${term}":`, err.message);
        termResults.push({ term, error: err.message });
        errors++;
      }

      done++;

      if (done % 5 === 0 || done === total) {
        // Check for cancellation before writing progress
        let cancelled = false;
        try {
          const { rows } = await pool.query(
            `SELECT value FROM app_settings WHERE key = 'ip_rights_scan_status'`
          );
          if (rows.length) {
            const cur = rows[0].value;
            if ((typeof cur === 'string' ? JSON.parse(cur) : cur).cancel_requested) {
              cancelled = true;
            }
          }
        } catch (_) {}

        if (cancelled) {
          await setScanStatus({
            running: false,
            cancelled: true,
            last_completed: new Date().toISOString(),
            started_at: startedAt,
            terms_total: total,
            terms_done: done,
            new_findings: newFindings,
            searched_terms: searchedTerms,
            term_results: termResults,
          });
          return;
        }

        await setScanStatus({
          running: true,
          started_at: startedAt,
          last_update: new Date().toISOString(),
          terms_total: total,
          terms_done: done,
          new_findings: newFindings,
          current_term: terms[done] || null,
          searched_terms: searchedTerms,
          term_results: termResults,
        });
      }

      await sleep(REQUEST_DELAY_MS);
    }

    if (newFindings > 0) {
      await notifyAdmin(newFindings);
    }

    await setScanStatus({
      running: false,
      last_completed: new Date().toISOString(),
      started_at: startedAt,
      terms_total: total,
      terms_done: done,
      new_findings: newFindings,
      errors,
      searched_terms: searchedTerms,
      term_results: termResults,
    });
  } catch (err) {
    console.error('runScrape error:', err);
    await setScanStatus({
      running: false,
      error: err.message,
      last_completed: new Date().toISOString(),
      started_at: startedAt,
    });
  }
}

// --- HTTP handler ---

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];
  const isVercelCron = req.headers['x-vercel-cron'];

  if (!isVercelCron && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Check if scan already running (skip if stale — last_update older than 35 min)
  const STALE_MS = 35 * 60 * 1000;
  try {
    const { rows } = await pool.query(
      `SELECT value FROM app_settings WHERE key = 'ip_rights_scan_status'`
    );
    if (rows.length) {
      const raw = rows[0].value;
      const current = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (current && current.running) {
        const lastUpdate = current.last_update || current.started_at;
        const stale = !lastUpdate || (Date.now() - new Date(lastUpdate).getTime()) > STALE_MS;
        if (!stale) {
          return res.json({ ok: false, status: 'already_running', progress: current });
        }
        // Stale — fall through and allow restart
        console.warn('ip-rights scan appears stale, allowing restart');
      }
    }
  } catch (_) { /* ignore, proceed */ }

  const partial = req.query.partial === 'true' || req.query.partial === '1';

  // Respond immediately — scrape runs in background
  res.json({ ok: true, status: 'started', partial });

  // Fire and forget (works on persistent servers like Yandex Cloud)
  runScrape(partial).catch(err => console.error('runScrape unhandled:', err));
};
