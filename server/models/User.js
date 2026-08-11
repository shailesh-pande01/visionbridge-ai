const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  username: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['lowVisionUser', 'volunteer'],
    required: true,
  },
  // Keep original fields for backward compatibility if needed
  userId: {
    type: String,
  },
  emergencyWhatsappNumber: {
    type: String,
    default: null,
  },
  // Volunteer-specific fields
  phone: {
    type: String,
  },
  location: {
    latitude: { type: Number },
    longitude: { type: Number },
  },
  availability: {
    type: Boolean,
    default: false,
  },
  socketId: {
    type: String,
    default: null,
  },
}, { timestamps: true });

// Optional: Automatically set userId to username before saving if not provided
userSchema.pre('save', function(next) {
  if (!this.userId) {
    this.userId = this.username;
  }
  next();
});

module.exports = mongoose.model('User', userSchema);
