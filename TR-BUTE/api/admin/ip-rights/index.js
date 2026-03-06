/**
 * IP Rights Monitoring — admin API handlers
 *
 * Routes (all require admin auth):
 *   GET    /api/admin/ip-rights              — list checks + manual list
 *   POST   /api/admin/ip-rights/dismiss      — dismiss check, add to false positives
 *   POST   /api/admin/ip-rights/confirm      — mark check as confirmed risk
 *   POST   /api/admin/ip-rights/manual       — add/update manual IP entry
 *   DELETE /api/admin/ip-rights/manual       — delete manual entry
 */

const { getPool } = require('../../../lib/db');

const pool = getPool();

async function listIpRights(req, res) {
  try {
    const [checks, fps, manual] = await Promise.all([
      pool.query('SELECT * FROM ip_rights_checks ORDER BY checked_at DESC'),
      pool.query('SELECT * FROM ip_rights_false_positives ORDER BY dismissed_at DESC'),
      pool.query('SELECT * FROM ip_rights_manual ORDER BY ip_name'),
    ]);

    const pending = checks.rows.filter(r => r.status === 'pending');
    const confirmed = checks.rows.filter(r => r.status === 'confirmed');
    const dismissed = checks.rows.filter(r => r.status === 'dismissed');

    // Fetch scan status separately so it can never crash the main response
    let scanStatus = null;
    try {
      const { rows } = await pool.query(
        `SELECT value FROM app_settings WHERE key = 'ip_rights_scan_status'`
      );
      if (rows.length) {
        const raw = rows[0].value;
        scanStatus = typeof raw === 'string' ? JSON.parse(raw) : raw;
      }
    } catch (scanErr) {
      console.error('listIpRights scanStatus fetch error:', scanErr);
    }

    res.json({
      checks: checks.rows,
      pending,
      confirmed,
      dismissed,
      falsePositives: fps.rows,
      manual: manual.rows,
      scanStatus,
    });
  } catch (err) {
    console.error('listIpRights error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function dismissCheck(req, res) {
  const { id, notes } = req.body;
  if (!id) return res.status(400).json({ error: 'id required' });

  try {
    const { rows } = await pool.query(
      'SELECT * FROM ip_rights_checks WHERE id = $1',
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Check not found' });

    const check = rows[0];
    const dismissedBy = req.user?.username || req.user?.id || 'admin';

    await pool.query(
      `UPDATE ip_rights_checks
         SET status = 'dismissed', dismissed_at = now(), dismissed_by = $1, notes = $2
       WHERE id = $3`,
      [dismissedBy, notes || null, id]
    );

    // Remember this as a false positive so it won't be re-created on next scrape
    if (check.trademark_name) {
      await pool.query(
        `INSERT INTO ip_rights_false_positives (search_term, trademark_name, holder_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (search_term, trademark_name) DO NOTHING`,
        [check.search_term, check.trademark_name, check.holder_name || null]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('dismissCheck error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function confirmCheck(req, res) {
  const { id, notes } = req.body;
  if (!id) return res.status(400).json({ error: 'id required' });

  try {
    await pool.query(
      `UPDATE ip_rights_checks SET status = 'confirmed', notes = $1 WHERE id = $2`,
      [notes || null, id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('confirmCheck error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function saveManualEntry(req, res) {
  const { ip_name, holder_name, source_url, notes } = req.body;
  if (!ip_name || !holder_name) {
    return res.status(400).json({ error: 'ip_name and holder_name required' });
  }

  try {
    await pool.query(
      `INSERT INTO ip_rights_manual (ip_name, holder_name, source_url, notes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (ip_name) DO UPDATE SET
         holder_name = EXCLUDED.holder_name,
         source_url  = EXCLUDED.source_url,
         notes       = EXCLUDED.notes,
         updated_at  = now()`,
      [ip_name.trim(), holder_name.trim(), source_url || null, notes || null]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('saveManualEntry error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function deleteManualEntry(req, res) {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'id required' });

  try {
    await pool.query('DELETE FROM ip_rights_manual WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('deleteManualEntry error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function cancelScan(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT value FROM app_settings WHERE key = 'ip_rights_scan_status'`
    );
    const raw = rows.length ? rows[0].value : null;
    const current = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};

    // Mark not running immediately so UI unblocks; background process will stop at next 5-term check
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('ip_rights_scan_status', $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = NOW()`,
      [JSON.stringify({
        ...current,
        running: false,
        cancel_requested: true,
        last_completed: new Date().toISOString(),
      })]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('cancelScan error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { listIpRights, dismissCheck, confirmCheck, saveManualEntry, deleteManualEntry, cancelScan };
