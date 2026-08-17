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

    const uId = userId || (req.user && (req.user.username || req.user.id)) || 'default_user';

    const contact = new EmergencyContact({
      userId: uId,
      name: name.trim(),
      phone: phone.trim(),
      relationship: relationship.trim(),
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
    const targetUserId = req.query.userId || (req.user && (req.user.username || req.user.id)) || 'default_user';
    const query = targetUserId === 'default_user' 
      ? { userId: 'default_user' }
      : { $or: [{ userId: targetUserId }, { userId: 'default_user' }] };

    const contacts = await EmergencyContact.find(query).sort({ createdAt: -1 });
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

    const uId = userId || (req.user && (req.user.username || req.user.id)) || 'default_user';
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
    const contacts = await EmergencyContact.find({ $or: [{ userId: uId }, { userId: 'default_user' }] });

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

    if (event.status === 'Ended' || event.status === 'ENDED') {
      return res.status(400).json({ success: false, error: 'Emergency event has already ended.' });
    }

    const googleMapsLink = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
    event.currentLocation = { latitude: Number(latitude), longitude: Number(longitude), address: address || (event.currentLocation && event.currentLocation.address) || '' };
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

const whatsappService = require('../services/whatsappService');

// ── 8 · New Functional Emergency Flow ──────────────────────────────
exports.triggerEmergency = async (req, res, next) => {
  try {
    const { userId, latitude, longitude } = req.body;
    
    // Validate coordinates
    if (latitude == null || longitude == null || isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({ success: false, error: 'Valid latitude and longitude are required.' });
    }

    const uId = userId || (req.user && (req.user.username || req.user.id)) || 'default_user';
    const locationUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;

    const event = new EmergencyEvent({
      userId: uId,
      latitude: Number(latitude),
      longitude: Number(longitude),
      locationUrl,
      status: 'ACTIVE',
      whatsappSent: false,
    });
    
    await event.save();

    console.log(`\n🚨 [NEW EMERGENCY SOS] Event ID: ${event._id}`);
    console.log(`📍 Location: ${latitude}, ${longitude}`);
    console.log(`🔗 Link: ${locationUrl}`);

    // Call WhatsApp Service
    const alert = await whatsappService.sendEmergencyAlert(
      uId,
      event.latitude,
      event.longitude,
      event.locationUrl,
      event.createdAt
    );

    // Record the outcome either way — a silent false is what made this
    // failure impossible to diagnose from the SOS screen.
    event.whatsappSent = !!alert.sent;
    event.whatsappError = alert.sent ? null : (alert.reason || 'Unknown WhatsApp failure.');
    await event.save();

    if (!alert.sent) {
      console.error(`⚠️ [SOS] Event ${event._id} saved, but the WhatsApp alert failed: ${event.whatsappError}`);
    }

    if (req.io) {
      req.io.emit('sos_triggered_v2', { event });
    }

    res.status(201).json({
      success: true,
      data: {
        id: event._id,
        status: event.status,
        whatsappSent: !!event.whatsappSent,
        whatsappError: event.whatsappError,
        coordinates: { latitude: event.latitude, longitude: event.longitude },
        timestamp: event.createdAt,
        locationUrl: event.locationUrl
      }
    });
  } catch (err) {
    next(err);
  }
};

// ── 8.1 · WhatsApp Credential Check (read-only) ────────────────────
// Confirms the Cloud API accepts the configured credentials without
// sending a message to anyone, so the alert path can be verified
// without staging a real emergency. Never returns the token.
exports.whatsappStatus = async (req, res, next) => {
  try {
    const result = await whatsappService.verifyCredentials();
    res.status(result.ok ? 200 : 503).json({
      success: result.ok,
      configured: {
        accessToken: !!process.env.WHATSAPP_ACCESS_TOKEN,
        phoneNumberId: !!process.env.WHATSAPP_PHONE_NUMBER_ID,
        apiVersion: process.env.WHATSAPP_API_VERSION || 'v18.0',
        template: process.env.WHATSAPP_EMERGENCY_TEMPLATE || null,
        templateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en',
      },
      detail: result.detail,
    });
  } catch (err) {
    next(err);
  }
};

exports.endEmergencyRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const event = await EmergencyEvent.findById(id);
    
    if (!event) {
      return res.status(404).json({ success: false, error: 'Emergency event not found.' });
    }

    event.status = 'ENDED';
    event.endedAt = new Date();
    await event.save();

    console.log(`\n🛑 [EMERGENCY SOS ENDED] Event ID: ${event._id}`);

    if (req.io) {
      req.io.emit('sos_ended_v2', { eventId: event._id });
    }

    res.status(200).json({
      success: true,
      data: {
        id: event._id,
        status: event.status,
        timestamp: event.endedAt
      }
    });
  } catch (err) {
    next(err);
  }
};

