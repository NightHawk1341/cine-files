const { uploadToS3 } = require('../lib/storage');

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];

/**
 * POST /api/media/upload
 * Expects multipart form data with 'file', optional 'alt' and 'credit'.
 */
function upload({ pool }) {
  return async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      if (!ALLOWED_TYPES.includes(req.file.mimetype)) {
        return res.status(400).json({ error: `Invalid file type. Allowed: ${ALLOWED_TYPES.join(', ')}` });
      }

      if (req.file.size > MAX_FILE_SIZE) {
        return res.status(400).json({ error: 'File too large. Max 5MB' });
      }

      const url = await uploadToS3(req.file.buffer, req.file.originalname, req.file.mimetype, 'uploads');

      const { rows } = await pool.query(
        `INSERT INTO media (uploaded_by, url, filename, mime_type, file_size, alt_text, credit)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [req.user.userId, url, req.file.originalname, req.file.mimetype,
         req.file.size, req.body.alt || null, req.body.credit || null]
      );

      res.status(201).json({
        media: {
          id: rows[0].id,
          url: rows[0].url,
          filename: rows[0].filename,
          mimeType: rows[0].mime_type,
          fileSize: Number(rows[0].file_size),
          altText: rows[0].alt_text,
          credit: rows[0].credit,
          createdAt: rows[0].created_at,
        },
      });
    } catch (err) {
      console.error('Upload error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

module.exports = { upload };
