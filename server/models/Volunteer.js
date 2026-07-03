const mongoose = require('mongoose');

const volunteerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
    required: true,
  },
  location: {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
  },
  availability: {
    type: Boolean,
    default: true,
  },
  socketId: {
    type: String,
    default: null,
  },
}, { timestamps: true });

module.exports = mongoose.model('Volunteer', volunteerSchema);
