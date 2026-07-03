// ─────────────────────────────────────────────────────────────────
// routes/readingRoutes.js
// All routes for the Smart Reading Assistant feature.
// Mounted at /api/reading in server.js.
// ─────────────────────────────────────────────────────────────────

const express                = require('express');
const router                 = express.Router();
const readingController      = require('../controllers/readingController');
const validateReadingRequest = require('../middleware/validateReadingRequest');

// ── GET /api/reading ──────────────────────────────────────────────
// Module health check
router.get('/', (req, res) => {
  res.status(200).json({
    module:    'reading',
    status:    'ready',
    endpoints: {
      'GET  /api/reading':          'Module info',
      'POST /api/reading/extract':  'Extract text from image',
    },
  });
});

// ── POST /api/reading/extract ─────────────────────────────────────
// Accepts a base64-encoded image and returns extracted text.
//
// Request body (JSON):
//   {
//     imageBase64: string   // raw base64, no "data:image/..." prefix
//     mimeType:    string   // "image/jpeg" | "image/png" | "image/webp" | "image/gif"
//   }
//
// Success response (200):
//   {
//     success: true,
//     data: {
//       extractedText: string | null
//       message?:      string        // present when extractedText is null
//     }
//   }
//
// Error responses:
//   400  — missing/invalid fields (from validateReadingRequest)
//   413  — payload too large     (from validateReadingRequest)
//   500  — unexpected server error
//
router.post(
  '/extract',
  validateReadingRequest,   // ← validates body, attaches req.readingData
  readingController.extractText
);

module.exports = router;
