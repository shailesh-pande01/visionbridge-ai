const mongoose = require('mongoose');

const emergencyEventSchema = new mongoose.Schema({
  userId: {
    type: String,
    default: 'default_user',
  },
  currentLocation: {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    address: { type: String, default: '' },
  },
  googleMapsLink: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['Active', 'Ended'],
    default: 'Active',
  },
  endedAt: {
    type: Date,
    default: null,
  },
}, { timestamps: true });

module.exports = mongoose.model('EmergencyEvent', emergencyEventSchema);
