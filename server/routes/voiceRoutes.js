const express = require('express');
const router = express.Router();
const voiceController = require('../controllers/voiceController');

// Route: POST /api/voice/intent
// Description: Receives a voice command and uses Gemini to route to a feature
router.post('/intent', voiceController.classifyIntent);

module.exports = router;
