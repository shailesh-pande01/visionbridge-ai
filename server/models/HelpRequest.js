const mongoose = require('mongoose');

const helpRequestSchema = new mongoose.Schema({
  requester: {
    // Stores username or identifier
    type: String,
    required: true,
  },
  requesterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  requesterName: {
    type: String,
    default: '',
  },
  volunteer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
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
  description: {
    type: String,
    default: '',
  },
  requestType: {
    type: String,
    default: 'general',
  },
  status: {
    type: String,
    enum: [
      'PENDING', 'ACCEPTED', 'ACTIVE', 'COMPLETED', 'REJECTED',
      'searching', 'accepted', 'active', 'completed', 'rejected'
    ],
    default: 'PENDING',
  },
}, { timestamps: true });

module.exports = mongoose.model('HelpRequest', helpRequestSchema);
