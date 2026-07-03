const mongoose = require('mongoose');

const emergencyContactSchema = new mongoose.Schema({
  userId: {
    type: String,
    default: 'default_user',
  },
  name: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
    required: true,
  },
  relationship: {
    type: String,
    required: true,
  },
}, { timestamps: true });

module.exports = mongoose.model('EmergencyContact', emergencyContactSchema);
