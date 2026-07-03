// ─────────────────────────────────────────────────────────────────
// controllers/sosController.js
// Handles Emergency SOS Contacts and Events.
// Integrates Socket.io via req.io and mock Firebase notifications.
// ─────────────────────────────────────────────────────────────────

const EmergencyContact = require('../models/EmergencyContact');
const EmergencyEvent   = require('../models/EmergencyEvent');

// ── 1 · Add Emergency Contact ─────────────────────────────────────
exports.addContact = async (req, res, next) => {
  try {
    const { userId, name, phone, relationship } = req.body;
    if (!name || !phone || !relationship) {
      return res.status(400).json({ success: false, error: 'Name, phone, and relationship are required.' });
    }

    const contact = new EmergencyContact({
      userId: userId || 'default_user',
      name,
      phone,
      relationship,
    });

    await contact.save();
    res.status(201).json({ success: true, data: contact });
  } catch (err) {
    next(err);
  }
};

// ── 2 · Update Emergency Contact ──────────────────────────────────
exports.updateContact = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, phone, relationship } = req.body;

    const contact = await EmergencyContact.findByIdAndUpdate(
      id,
      { name, phone, relationship },
      { new: true, runValidators: true }
    );

    if (!contact) {
      return res.status(404).json({ success: false, error: 'Emergency contact not found.' });
    }

    res.status(200).json({ success: true, data: contact });
  } catch (err) {
    next(err);
  }
};

// ── 3 · Delete Emergency Contact ──────────────────────────────────
exports.deleteContact = async (req, res, next) => {
  try {
    const { id } = req.params;
    const contact = await EmergencyContact.findByIdAndDelete(id);
    if (!contact) {
      return res.status(404).json({ success: false, error: 'Emergency contact not found.' });
    }

    res.status(200).json({ success: true, message: 'Emergency contact deleted successfully.' });
  } catch (err) {
    next(err);
  }
};

// ── 4 · Get All Contacts ──────────────────────────────────────────
exports.getContacts = async (req, res, next) => {
  try {
    const { userId } = req.query;
    const contacts = await EmergencyContact.find({ userId: userId || 'default_user' }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: contacts });
  } catch (err) {
    next(err);
  }
};

// ── 5 · Trigger SOS ───────────────────────────────────────────────
exports.triggerSOS = async (req, res, next) => {
  try {
    const { userId, latitude, longitude, address } = req.body;
    if (!latitude || !longitude) {
      return res.status(400).json({ success: false, error: 'Latitude and longitude are required to trigger SOS.' });
    }

    const uId = userId || 'default_user';
    const googleMapsLink = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;

    // Create and save emergency event
    const event = new EmergencyEvent({
      userId: uId,
      currentLocation: { latitude: Number(latitude), longitude: Number(longitude), address: address || '' },
      googleMapsLink,
      status: 'Active',
    });
    await event.save();

    // Fetch all trusted emergency contacts
    const contacts = await EmergencyContact.find({ userId: uId });

    // Mock Firebase Cloud Messaging Notification to every trusted contact
    console.log(`\n🚨 [EMERGENCY SOS TRIGGERED] Event ID: ${event._id}`);
    console.log(`📍 Location: ${latitude}, ${longitude} | ${address}`);
    console.log(`🔗 Google Maps Link: ${googleMapsLink}`);
    console.log(`📣 Broadcasting notifications to ${contacts.length} emergency contacts:`);
    
    contacts.forEach((c) => {
      console.log(`   ➔ [FCM MOCK] SMS/Push to ${c.name} (${c.relationship}) at ${c.phone}: "EMERGENCY: User needs immediate help! Location: ${googleMapsLink}"`);
    });

    if (req.io) {
      req.io.emit('sos_triggered', { event, contacts });
    }

    res.status(201).json({ success: true, data: { event, contactsNotified: contacts.length } });
  } catch (err) {
    next(err);
  }
};

// ── 6 · Update Live Location ──────────────────────────────────────
exports.updateLiveLocation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { latitude, longitude, address } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ success: false, error: 'Latitude and longitude are required.' });
    }

    const event = await EmergencyEvent.findById(id);
    if (!event) {
      return res.status(404).json({ success: false, error: 'Emergency event not found.' });
    }

    if (event.status === 'Ended') {
      return res.status(400).json({ success: false, error: 'Emergency event has already ended.' });
    }

    const googleMapsLink = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
    event.currentLocation = { latitude: Number(latitude), longitude: Number(longitude), address: address || event.currentLocation.address };
    event.googleMapsLink = googleMapsLink;
    await event.save();

    if (req.io) {
      req.io.emit('sos_location_update', { eventId: event._id, currentLocation: event.currentLocation, googleMapsLink });
    }

    res.status(200).json({ success: true, data: event });
  } catch (err) {
    next(err);
  }
};

// ── 7 · End Emergency ─────────────────────────────────────────────
exports.endEmergency = async (req, res, next) => {
  try {
    const { id } = req.params;
    const event = await EmergencyEvent.findById(id);
    if (!event) {
      return res.status(404).json({ success: false, error: 'Emergency event not found.' });
    }

    event.status = 'Ended';
    event.endedAt = new Date();
    await event.save();

    console.log(`\n🛑 [EMERGENCY SOS ENDED] Event ID: ${event._id}`);

    if (req.io) {
      req.io.emit('sos_ended', { eventId: event._id });
    }

    res.status(200).json({ success: true, data: event });
  } catch (err) {
    next(err);
  }
};
