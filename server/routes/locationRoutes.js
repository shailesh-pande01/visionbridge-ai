// ─────────────────────────────────────────────────────────────────
// routes/locationRoutes.js
// All routes for the "Where Am I?" Location Assistant feature.
// Mounted at /api/location in server.js.
// ─────────────────────────────────────────────────────────────────

const express                 = require('express');
const router                  = express.Router();
const locationController      = require('../controllers/locationController');
const validateLocationRequest = require('../middleware/validateLocationRequest');

// ── GET /api/location ─────────────────────────────────────────────
// Module health check
router.get('/', (req, res) => {
  res.status(200).json({
    module:    'location',
    status:    'ready',
    endpoints: {
      'GET  /api/location':          'Module info',
      'POST /api/location/current':  'Get location description from GPS coordinates',
    },
  });
});

// ── POST /api/location/current ────────────────────────────────────
// Accepts GPS coordinates and returns a spoken location summary.
//
// Request body (JSON):
//   {
//     latitude:  number   // -90 to 90
//     longitude: number   // -180 to 180
//   }
//
// Success response (200):
//   {
//     success: true,
//     data: {
//       summary:     string      // Natural-language spoken description
//       address:     string|null // Formatted address (if Maps key is set)
//       landmarks:   string[]    // Nearby place names
//       coordinates: { latitude, longitude }
//     }
//   }
//
router.post(
  '/current',
  validateLocationRequest,
  locationController.getCurrentLocation
);

module.exports = router;
