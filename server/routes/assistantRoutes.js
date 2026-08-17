const express = require('express');
const router = express.Router();
const assistantController = require('../controllers/assistantController');

// POST /api/assistant/command — spoken command → validated action
router.post('/command', assistantController.handleCommand);

// POST /api/assistant/ask — follow-up question answered from session context
router.post('/ask', assistantController.handleQuestion);

// GET /api/assistant/actions — the action + feature whitelist
router.get('/actions', assistantController.listActions);

module.exports = router;
