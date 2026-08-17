const mongoose = require('mongoose');

const emergencyEventSchema = new mongoose.Schema({
  userId: {
    type: String,
    default: 'default_user',
  },
  latitude: {
    type: Number,
    required: true,
  },
  longitude: {
    type: Number,
    required: true,
  },
  locationUrl: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'ENDED'],
    default: 'ACTIVE',
  },
  whatsappSent: {
    type: Boolean,
    default: false,
  },
  // Why the alert did not go out, kept so a failed SOS can be
  // diagnosed after the fact instead of only in the console.
  whatsappError: {
    type: String,
    default: null,
  },
  endedAt: {
    type: Date,
    default: null,
  },
}, { timestamps: true });

module.exports = mongoose.model('EmergencyEvent', emergencyEventSchema);
