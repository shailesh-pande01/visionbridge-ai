const express = require('express');
const router = express.Router();
const sosController = require('../controllers/sosController');

// ── Emergency Contacts ──────────────────────────────────────────
router.post('/contact',      sosController.addContact);
router.put('/contact/:id',   sosController.updateContact);
router.delete('/contact/:id', sosController.deleteContact);
router.get('/contacts',      sosController.getContacts);

// ── Emergency SOS Events ────────────────────────────────────────
router.post('/trigger',              sosController.triggerSOS);
router.post('/event/:id/location',   sosController.updateLiveLocation);
router.post('/event/:id/end',        sosController.endEmergency);

module.exports = router;
