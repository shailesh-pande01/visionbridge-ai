const express               = require('express');
const router                = express.Router();
const transportController   = require('../controllers/transportController');
const validateVisionRequest = require('../middleware/validateVisionRequest');

// POST /api/transport/analyze
router.post(
  '/analyze',
  validateVisionRequest,
  transportController.analyzeTransport
);

module.exports = router;
