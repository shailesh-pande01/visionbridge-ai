const express = require('express');
const router = express.Router();
const volunteerController = require('../controllers/volunteerController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

// ── Volunteer Management (Utility / Seeding) ─────────────────────
router.post('/register', volunteerController.registerVolunteer);
router.get('/list',      volunteerController.getVolunteers);

// ── Help Requests (Low-Vision User & Volunteer views) ────────────
router.get('/debug/requests', volunteerController.getDebugRequests);
router.post('/request',       protect, authorizeRoles('lowVisionUser'), volunteerController.createHelpRequest);
router.get('/requests',       protect, authorizeRoles('volunteer'), volunteerController.getNearbyRequests);
router.get('/request/:id',    protect, authorizeRoles('volunteer', 'lowVisionUser'), volunteerController.getRequestStatus);

// ── Request Actions ─────────────────────────────────────────────
router.post('/request/:id/accept',   protect, authorizeRoles('volunteer'), volunteerController.acceptRequest);
router.post('/request/:id/reject',   protect, authorizeRoles('volunteer'), volunteerController.rejectRequest);
router.post('/request/:id/complete', protect, authorizeRoles('volunteer', 'lowVisionUser'), volunteerController.completeRequest);

// ── Real-Time Chat & Location ───────────────────────────────────
router.post('/request/:id/message',  protect, authorizeRoles('volunteer', 'lowVisionUser'), volunteerController.sendMessage);
router.get('/request/:id/messages',  protect, authorizeRoles('volunteer', 'lowVisionUser'), volunteerController.getMessages);
router.post('/request/:id/location', protect, authorizeRoles('volunteer', 'lowVisionUser'), volunteerController.updateLocation);

module.exports = router;
