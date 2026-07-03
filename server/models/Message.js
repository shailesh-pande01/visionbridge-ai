const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  helpRequestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'HelpRequest',
    required: true,
  },
  sender: {
    type: String, // 'requester' or volunteer ID / name
    required: true,
  },
  receiver: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

module.exports = mongoose.model('Message', messageSchema);
