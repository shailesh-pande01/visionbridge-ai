const express = require('express');
const router = express.Router();
const volunteerController = require('../controllers/volunteerController');

// ── Volunteer Management ────────────────────────────────────────
router.post('/register', volunteerController.registerVolunteer);
router.get('/list',      volunteerController.getVolunteers);

// ── Help Requests (User & Volunteer views) ──────────────────────
router.post('/request',       volunteerController.createHelpRequest);
router.get('/requests',       volunteerController.getNearbyRequests);
router.get('/request/:id',    volunteerController.getRequestStatus);

// ── Request Actions ─────────────────────────────────────────────
router.post('/request/:id/accept',   volunteerController.acceptRequest);
router.post('/request/:id/reject',   volunteerController.rejectRequest);
router.post('/request/:id/complete', volunteerController.completeRequest);

// ── Real-Time Chat & Location ───────────────────────────────────
router.post('/request/:id/message',  volunteerController.sendMessage);
router.get('/request/:id/messages',  volunteerController.getMessages);
router.post('/request/:id/location', volunteerController.updateLocation);

module.exports = router;
