const express               = require('express');
const router                = express.Router();
const finderController      = require('../controllers/finderController');
const validateVisionRequest = require('../middleware/validateVisionRequest');

// POST /api/object-finder/search
router.post(
  '/search',
  validateVisionRequest,
  finderController.analyzeFinder
);

module.exports = router;
