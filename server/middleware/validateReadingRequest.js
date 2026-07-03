// ─────────────────────────────────────────────────────────────────
// middleware/validateReadingRequest.js
// Validates POST /api/reading/extract before it reaches the controller.
// On success it attaches req.readingData so the controller doesn't
// have to re-read or re-validate req.body.
// ─────────────────────────────────────────────────────────────────

const ACCEPTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

// 10 MB raw ≈ 13.3 MB base64 — add a small buffer
const MAX_BASE64_LENGTH = 14_000_000;

function validateReadingRequest(req, res, next) {
  const { imageBase64, mimeType } = req.body;

  // ── 1 · imageBase64 presence ──────────────────────────────────
  if (!imageBase64) {
    return res.status(400).json({
      success: false,
      error: 'Missing field: imageBase64 is required.',
    });
  }

  // ── 2 · imageBase64 type ──────────────────────────────────────
  if (typeof imageBase64 !== 'string' || imageBase64.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Invalid value: imageBase64 must be a non-empty base64 string.',
    });
  }

  // ── 3 · Size guard (base64 string length) ─────────────────────
  if (imageBase64.length > MAX_BASE64_LENGTH) {
    return res.status(413).json({
      success: false,
      error: 'Payload too large: image must be under 10 MB.',
    });
  }

  // ── 4 · mimeType presence ─────────────────────────────────────
  if (!mimeType) {
    return res.status(400).json({
      success: false,
      error: 'Missing field: mimeType is required (e.g. "image/jpeg").',
    });
  }

  // ── 5 · mimeType allowed list ─────────────────────────────────
  if (!ACCEPTED_MIME_TYPES.includes(mimeType)) {
    return res.status(400).json({
      success: false,
      error: `Unsupported mimeType "${mimeType}". Accepted: ${ACCEPTED_MIME_TYPES.join(', ')}.`,
    });
  }

  // ── All checks passed — attach to req for the controller ──────
  req.readingData = {
    imageBase64: imageBase64.trim(),
    mimeType,
  };

  next();
}

module.exports = validateReadingRequest;
