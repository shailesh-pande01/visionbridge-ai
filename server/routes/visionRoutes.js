// ─────────────────────────────────────────────────────────────────
// routes/visionRoutes.js
// All routes for the AI Camera Assistant feature.
// Mounted at /api/vision in server.js.
// ─────────────────────────────────────────────────────────────────

const express               = require('express');
const router                = express.Router();
const visionController      = require('../controllers/visionController');
const validateVisionRequest = require('../middleware/validateVisionRequest');

// ── GET /api/vision ───────────────────────────────────────────────
// Module health check
router.get('/', (req, res) => {
  res.status(200).json({
    module:    'vision',
    status:    'ready',
    endpoints: {
      'GET  /api/vision':          'Module info',
      'GET  /api/vision/test':     'Verify Gemini API key (no image needed)',
      'POST /api/vision/analyze':  'Analyze image → scene description',
    },
  });
});

// ── GET /api/vision/test ──────────────────────────────────────────
// Open this in a browser to verify your Gemini API key is working.
// Returns { success, model, reply } or { success: false, error, hint }
router.get('/test', visionController.testConnection);

// ── POST /api/vision/analyze ──────────────────────────────────────
// Accepts a base64-encoded image and returns a structured description.
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
//       scene:       string
//       confidence:  number   (0–100)
//       description: string
//       objects:     string[]
//       lighting:    string
//       timeOfDay:   string
//     }
//   }
//
// Error responses:
//   400  — missing/invalid fields (from validateVisionRequest)
//   413  — payload too large     (from validateVisionRequest)
//   500  — unexpected server error
//
router.post(
  '/analyze',
  validateVisionRequest,   // ← validates body, attaches req.visionData
  visionController.analyzeImage
);

// ── POST /api/vision/hazard ───────────────────────────────────────
// Continuous background scanning loop.
router.post(
  '/hazard',
  validateVisionRequest,
  visionController.analyzeHazard
);

module.exports = router;
