const express = require('express');
const router = express.Router();
const sosController = require('../controllers/sosController');

// ── Emergency SOS Features ────────────────────────────────────────
router.post('/sos', sosController.triggerEmergency);
router.patch('/sos/:id/end', sosController.endEmergencyRequest);

// Read-only check that the WhatsApp credentials still work. Sends nothing.
router.get('/whatsapp/status', sosController.whatsappStatus);

module.exports = router;
