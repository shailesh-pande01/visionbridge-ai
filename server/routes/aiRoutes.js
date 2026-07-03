const express = require('express');
const router = express.Router();
// TODO: import controller when implemented
// const aiController = require('../controllers/aiController');

// Placeholder routes — implement in next steps
router.get('/', (req, res) => {
  res.json({ module: 'ai', status: 'ready for implementation' });
});

module.exports = router;
