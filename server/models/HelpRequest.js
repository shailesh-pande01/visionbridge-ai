const mongoose = require('mongoose');

const helpRequestSchema = new mongoose.Schema({
  requester: {
    // Can store a user ID or socket ID / session ID for guest/low-vision requester
    type: String,
    required: true,
  },
  volunteer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Volunteer',
    default: null,
  },
  currentLocation: {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    address: { type: String, default: '' },
  },
  destination: {
    type: String,
    default: '',
  },
  helpDescription: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['searching', 'accepted', 'completed', 'rejected'],
    default: 'searching',
  },
}, { timestamps: true });

module.exports = mongoose.model('HelpRequest', helpRequestSchema);
