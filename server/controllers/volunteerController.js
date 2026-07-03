// ─────────────────────────────────────────────────────────────────
// controllers/volunteerController.js
// Handles all APIs for Volunteer Help Network.
// Integrates Socket.io via req.io and mock Firebase notifications.
// ─────────────────────────────────────────────────────────────────

const Volunteer   = require('../models/Volunteer');
const HelpRequest = require('../models/HelpRequest');
const Message     = require('../models/Message');

// ── 1 · Volunteer Registration / Seeding ──────────────────────────
exports.registerVolunteer = async (req, res, next) => {
  try {
    const { name, phone, latitude, longitude } = req.body;
    if (!name || !phone || !latitude || !longitude) {
      return res.status(400).json({ success: false, error: 'Name, phone, latitude, and longitude are required.' });
    }

    let volunteer = await Volunteer.findOne({ phone });
    if (volunteer) {
      volunteer.name = name;
      volunteer.location = { latitude: Number(latitude), longitude: Number(longitude) };
      volunteer.availability = true;
      await volunteer.save();
    } else {
      volunteer = new Volunteer({
        name,
        phone,
        location: { latitude: Number(latitude), longitude: Number(longitude) },
        availability: true,
      });
      await volunteer.save();
    }

    res.status(200).json({ success: true, data: volunteer });
  } catch (err) {
    next(err);
  }
};

// ── 2 · Get Available Volunteers (Utility) ────────────────────────
exports.getVolunteers = async (req, res, next) => {
  try {
    const volunteers = await Volunteer.find({ availability: true });
    res.status(200).json({ success: true, data: volunteers });
  } catch (err) {
    next(err);
  }
};

// ── 3 · Create Help Request (User Side) ───────────────────────────
exports.createHelpRequest = async (req, res, next) => {
  try {
    const { requester, latitude, longitude, address, destination, helpDescription } = req.body;
    if (!requester || !latitude || !longitude || !helpDescription) {
      return res.status(400).json({ success: false, error: 'Requester, latitude, longitude, and helpDescription are required.' });
    }

    const newRequest = new HelpRequest({
      requester,
      currentLocation: { latitude: Number(latitude), longitude: Number(longitude), address: address || '' },
      destination: destination || '',
      helpDescription,
      status: 'searching',
    });

    await newRequest.save();

    // Mock Firebase Cloud Messaging Notification & Socket.io broadcast to volunteers
    console.log(`[Notification] FCM Mock: Broadcasting new help request to nearby volunteers for request ${newRequest._id}`);
    if (req.io) {
      req.io.to('volunteers').emit('new_help_request', newRequest);
    }

    res.status(201).json({ success: true, data: newRequest });
  } catch (err) {
    next(err);
  }
};

// ── 4 · Get Nearby Requests (Volunteer Dashboard) ─────────────────
exports.getNearbyRequests = async (req, res, next) => {
  try {
    // Return all active searching requests, plus any accepted requests for this volunteer
    const { volunteerId } = req.query;

    const query = {
      $or: [
        { status: 'searching' },
      ]
    };

    if (volunteerId) {
      query.$or.push({ volunteer: volunteerId, status: 'accepted' });
    }

    const requests = await HelpRequest.find(query)
      .populate('volunteer')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: requests });
  } catch (err) {
    next(err);
  }
};

// ── 5 · Get Request Status ────────────────────────────────────────
exports.getRequestStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const helpRequest = await HelpRequest.findById(id).populate('volunteer');
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
    const { volunteerId } = req.body;

    if (!volunteerId) {
      return res.status(400).json({ success: false, error: 'Volunteer ID is required.' });
    }

    const volunteer = await Volunteer.findById(volunteerId);
    if (!volunteer) {
      return res.status(404).json({ success: false, error: 'Volunteer not found.' });
    }

    const helpRequest = await HelpRequest.findById(id);
    if (!helpRequest) {
      return res.status(404).json({ success: false, error: 'Help request not found.' });
    }

    if (helpRequest.status !== 'searching') {
      return res.status(400).json({ success: false, error: `Request has already been ${helpRequest.status}.` });
    }

    helpRequest.status = 'accepted';
    helpRequest.volunteer = volunteer._id;
    await helpRequest.save();

    // Mark volunteer as busy
    volunteer.availability = false;
    await volunteer.save();

    const updatedRequest = await HelpRequest.findById(id).populate('volunteer');

    // Notify user via Socket.io
    if (req.io) {
      req.io.to(id).emit('request_accepted', updatedRequest);
      req.io.to('volunteers').emit('request_updated', updatedRequest);
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
    // Rejecting simply dismisses it for the volunteer or marks it rejected if no volunteers left
    // For simplicity, we can leave it as searching so other volunteers can accept, or mark rejected
    const helpRequest = await HelpRequest.findById(id);
    if (!helpRequest) {
      return res.status(404).json({ success: false, error: 'Help request not found.' });
    }

    helpRequest.status = 'rejected';
    await helpRequest.save();

    if (req.io) {
      req.io.to(id).emit('request_rejected', helpRequest);
      req.io.to('volunteers').emit('request_updated', helpRequest);
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

    helpRequest.status = 'completed';
    await helpRequest.save();

    if (helpRequest.volunteer) {
      await Volunteer.findByIdAndUpdate(helpRequest.volunteer, { availability: true });
    }

    const updatedRequest = await HelpRequest.findById(id).populate('volunteer');

    if (req.io) {
      req.io.to(id).emit('request_completed', updatedRequest);
      req.io.to('volunteers').emit('request_updated', updatedRequest);
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
    const { role, latitude, longitude, volunteerId } = req.body; // role: 'requester' | 'volunteer'

    if (!role || !latitude || !longitude) {
      return res.status(400).json({ success: false, error: 'Role, latitude, and longitude are required.' });
    }

    if (role === 'volunteer' && volunteerId) {
      await Volunteer.findByIdAndUpdate(volunteerId, { location: { latitude: Number(latitude), longitude: Number(longitude) } });
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
