// ─────────────────────────────────────────────────────────────────
// controllers/volunteerController.js
// Handles all APIs for Volunteer Help Network.
// Integrates Socket.io via req.io and mock Firebase notifications.
// ─────────────────────────────────────────────────────────────────

const mongoose    = require('mongoose');
const User        = require('../models/User');
const HelpRequest = require('../models/HelpRequest');
const Message     = require('../models/Message');

// ── 1 · Volunteer Registration / Seeding ──────────────────────────
// Note: This is mostly replaced by /api/auth/register for real auth,
// but kept for backward compatibility if needed.
exports.registerVolunteer = async (req, res, next) => {
  try {
    const { name, phone, latitude, longitude } = req.body;
    if (!name || !phone || !latitude || !longitude) {
      return res.status(400).json({ success: false, error: 'Name, phone, latitude, and longitude are required.' });
    }

    // Creating a mock user for this legacy endpoint
    const username = `vol_${Date.now()}`;
    const volunteer = new User({
      name,
      username,
      password: 'mockpassword', // should use auth/register
      role: 'volunteer',
      phone,
      location: { latitude: Number(latitude), longitude: Number(longitude) },
      availability: true,
    });
    await volunteer.save();

    res.status(200).json({ success: true, data: volunteer });
  } catch (err) {
    next(err);
  }
};

// ── 2 · Get Available Volunteers (Utility) ────────────────────────
exports.getVolunteers = async (req, res, next) => {
  try {
    const volunteers = await User.find({ role: 'volunteer', availability: true }).select('-password');
    res.status(200).json({ success: true, data: volunteers });
  } catch (err) {
    next(err);
  }
};

// ── 3 · Create Help Request (User Side) ───────────────────────────
exports.createHelpRequest = async (req, res, next) => {
  try {
    const { requester, requesterName, requestType, latitude, longitude, address, destination, helpDescription, description } = req.body;
    const desc = (helpDescription || description || '').trim();
    
    if (!latitude || !longitude || !desc) {
      return res.status(400).json({ success: false, error: 'Latitude, longitude, and helpDescription are required.' });
    }

    const requesterIdentifier = (req.user && (req.user.username || req.user.name || req.user._id)) || requester;
    if (!requesterIdentifier) {
      return res.status(400).json({ success: false, error: 'Requester identifier is required.' });
    }

    const newRequest = new HelpRequest({
      requester: requesterIdentifier,
      requesterId: req.user ? req.user._id : null,
      requesterName: (req.user && req.user.name) || requesterName || requesterIdentifier,
      requestType: requestType || 'general',
      currentLocation: { latitude: Number(latitude), longitude: Number(longitude), address: address || '' },
      destination: destination || '',
      helpDescription: desc,
      description: desc,
      status: 'PENDING',
    });

    await newRequest.save();

    console.log('\n--- [Volunteer Request Creation Started] ---');
    console.log('Request Payload:', {
      requester: req.body.requester,
      requesterName: req.body.requesterName,
      latitude: req.body.latitude,
      longitude: req.body.longitude,
      address: req.body.address,
      destination: req.body.destination,
      helpDescription: desc
    });
    console.log('Authenticated user ID:', req.user ? req.user._id : 'N/A');
    console.log('Authenticated user role:', req.user ? req.user.role : 'N/A');
    console.log('Generated request ID:', newRequest._id);
    console.log('Status:', newRequest.status);
    console.log('Location:', newRequest.currentLocation);

    if (req.io) {
      req.io.to('volunteers').emit('new_help_request', newRequest);
      req.io.emit('new_help_request', newRequest);
    }

    res.status(201).json({ success: true, data: newRequest });
  } catch (err) {
    next(err);
  }
};

// ── 4 · Get Nearby Requests (Volunteer Dashboard) ─────────────────
exports.getNearbyRequests = async (req, res, next) => {
  try {
    console.log('\n--- [Volunteer Dashboard Request Started] ---');
    console.log('Authenticated user:', req.user ? req.user._id : 'N/A');
    console.log('Authenticated role:', req.user ? req.user.role : 'N/A');

    const volunteerId = req.query.volunteerId || (req.user && req.user._id);

    // Filter: All pending requests (no volunteer assigned yet)
    // PLUS any accepted/active requests assigned to the current volunteer
    const orConditions = [
      { status: { $in: ['PENDING', 'searching'] } }
    ];

    if (volunteerId && mongoose.Types.ObjectId.isValid(volunteerId.toString())) {
      orConditions.push({
        volunteer: volunteerId,
        status: { $in: ['ACCEPTED', 'accepted', 'ACTIVE', 'active'] }
      });
    }

    const query = { $or: orConditions };
    console.log('MongoDB Query Filter:', JSON.stringify(query));

    const requests = await HelpRequest.find(query)
      .populate({ path: 'volunteer', select: '-password' })
      .populate({ path: 'requesterId', select: '-password' })
      .sort({ createdAt: -1 });

    console.log('Pending requests found:', requests.length);

    res.status(200).json({ success: true, data: requests, requests: requests });
  } catch (err) {
    next(err);
  }
};

// ── 4.1 · Diagnostic Endpoint (Debug Mode) ────────────────────────
exports.getDebugRequests = async (req, res, next) => {
  try {
    const allPending = await HelpRequest.find({ status: { $in: ['PENDING', 'searching'] } }).sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      diagnostic: {
        authenticatedUser: req.user ? req.user._id : null,
        authenticatedRole: req.user ? req.user.role : null,
        totalPendingRequests: allPending.length,
        pendingRequestIds: allPending.map(r => r._id),
        requesterIds: allPending.map(r => r.requesterId || r.requester),
        pendingRequests: allPending
      }
    });
  } catch (err) {
    next(err);
  }
};

// ── 5 · Get Request Status ────────────────────────────────────────
exports.getRequestStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const helpRequest = await HelpRequest.findById(id)
      .populate({ path: 'volunteer', select: '-password' })
      .populate({ path: 'requesterId', select: '-password' });

    if (!helpRequest) {
      return res.status(404).json({ success: false, error: 'Help request not found.' });
    }

    res.status(200).json({ success: true, data: helpRequest });
  } catch (err) {
    next(err);
  }
};

// ── 6 · Accept Request (Volunteer Side) ───────────────────────────
exports.acceptRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const volunteerId = req.body.volunteerId || (req.user && req.user._id);

    if (!volunteerId) {
      return res.status(400).json({ success: false, error: 'Volunteer ID is required.' });
    }

    const volunteer = await User.findById(volunteerId);
    if (!volunteer || volunteer.role !== 'volunteer') {
      return res.status(404).json({ success: false, error: 'Volunteer not found.' });
    }

    const helpRequest = await HelpRequest.findById(id);
    if (!helpRequest) {
      return res.status(404).json({ success: false, error: 'Help request not found.' });
    }

    if (!['PENDING', 'searching'].includes(helpRequest.status)) {
      return res.status(400).json({ success: false, error: `Request has already been ${helpRequest.status}.` });
    }

    helpRequest.status = 'ACCEPTED';
    helpRequest.volunteer = volunteer._id;
    await helpRequest.save();

    volunteer.availability = false;
    await volunteer.save();

    const updatedRequest = await HelpRequest.findById(id)
      .populate({ path: 'volunteer', select: '-password' })
      .populate({ path: 'requesterId', select: '-password' });

    if (req.io) {
      req.io.to(id).emit('request_accepted', updatedRequest);
      req.io.to('volunteers').emit('request_updated', updatedRequest);
      req.io.emit('request_updated', updatedRequest);
    }

    res.status(200).json({ success: true, data: updatedRequest });
  } catch (err) {
    next(err);
  }
};

// ── 7 · Reject Request (Volunteer Side) ───────────────────────────
exports.rejectRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const helpRequest = await HelpRequest.findById(id);
    if (!helpRequest) {
      return res.status(404).json({ success: false, error: 'Help request not found.' });
    }

    helpRequest.status = 'REJECTED';
    await helpRequest.save();

    if (req.io) {
      req.io.to(id).emit('request_rejected', helpRequest);
      req.io.to('volunteers').emit('request_updated', helpRequest);
      req.io.emit('request_updated', helpRequest);
    }

    res.status(200).json({ success: true, data: helpRequest });
  } catch (err) {
    next(err);
  }
};

// ── 8 · Complete Request ──────────────────────────────────────────
exports.completeRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const helpRequest = await HelpRequest.findById(id);
    if (!helpRequest) {
      return res.status(404).json({ success: false, error: 'Help request not found.' });
    }

    helpRequest.status = 'COMPLETED';
    await helpRequest.save();

    if (helpRequest.volunteer) {
      await User.findByIdAndUpdate(helpRequest.volunteer, { availability: true });
    }

    const updatedRequest = await HelpRequest.findById(id)
      .populate({ path: 'volunteer', select: '-password' })
      .populate({ path: 'requesterId', select: '-password' });

    if (req.io) {
      req.io.to(id).emit('request_completed', updatedRequest);
      req.io.to('volunteers').emit('request_updated', updatedRequest);
      req.io.emit('request_updated', updatedRequest);
    }

    res.status(200).json({ success: true, data: updatedRequest });
  } catch (err) {
    next(err);
  }
};

// ── 9 · Send Message ──────────────────────────────────────────────
exports.sendMessage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { sender, receiver, message } = req.body;

    if (!sender || !receiver || !message) {
      return res.status(400).json({ success: false, error: 'Sender, receiver, and message are required.' });
    }

    const newMessage = new Message({
      helpRequestId: id,
      sender,
      receiver,
      message,
    });

    await newMessage.save();

    if (req.io) {
      req.io.to(id).emit('new_message', newMessage);
    }

    res.status(201).json({ success: true, data: newMessage });
  } catch (err) {
    next(err);
  }
};

// ── 10 · Get Messages ─────────────────────────────────────────────
exports.getMessages = async (req, res, next) => {
  try {
    const { id } = req.params;
    const messages = await Message.find({ helpRequestId: id }).sort({ timestamp: 1 });
    res.status(200).json({ success: true, data: messages });
  } catch (err) {
    next(err);
  }
};

// ── 11 · Update Live Location ─────────────────────────────────────
exports.updateLocation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role, latitude, longitude, volunteerId } = req.body;

    if (!role || !latitude || !longitude) {
      return res.status(400).json({ success: false, error: 'Role, latitude, and longitude are required.' });
    }

    if (role === 'volunteer' && volunteerId) {
      await User.findByIdAndUpdate(volunteerId, { location: { latitude: Number(latitude), longitude: Number(longitude) } });
    } else if (role === 'requester') {
      await HelpRequest.findByIdAndUpdate(id, { currentLocation: { latitude: Number(latitude), longitude: Number(longitude) } });
    }

    if (req.io) {
      req.io.to(id).emit('location_update', { role, latitude: Number(latitude), longitude: Number(longitude), timestamp: new Date() });
    }

    res.status(200).json({ success: true, message: 'Location updated successfully.' });
  } catch (err) {
    next(err);
  }
};
