const express = require('express');
const router = express.Router();
const sosController = require('../controllers/sosController');

// ── Emergency SOS Features ────────────────────────────────────────
router.post('/sos', sosController.triggerEmergency);
router.patch('/sos/:id/end', sosController.endEmergencyRequest);

module.exports = router;
