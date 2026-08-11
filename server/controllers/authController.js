const User = require('../models/User');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'fallback_secret_key', {
    expiresIn: '30d',
  });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res, next) => {
  try {
    const { name, username, password, role } = req.body;

    if (!name || !username || !password || !role) {
      return res.status(400).json({ success: false, error: 'Please add all fields' });
    }

    if (role !== 'lowVisionUser' && role !== 'volunteer') {
      return res.status(400).json({ success: false, error: 'Invalid role' });
    }

    // Check if user exists
    const userExists = await User.findOne({ username });

    if (userExists) {
      return res.status(400).json({ success: false, error: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const userData = {
      name,
      username,
      password: hashedPassword,
      role,
      userId: username,
    };

    if (role === 'volunteer') {
      userData.availability = true; // default available
    }

    const user = await User.create(userData);

    if (user) {
      res.status(201).json({
        success: true,
        data: {
          _id: user.id,
          name: user.name,
          username: user.username,
          role: user.role,
          token: generateToken(user._id),
        },
      });
    } else {
      res.status(400).json({ success: false, error: 'Invalid user data' });
    }
  } catch (err) {
    next(err);
  }
};

// @desc    Authenticate a user
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Please add username and password' });
    }

    // Check for user email/username
    const user = await User.findOne({ username });

    if (user && (await bcrypt.compare(password, user.password))) {
      res.json({
        success: true,
        data: {
          _id: user.id,
          name: user.name,
          username: user.username,
          role: user.role,
          token: generateToken(user._id),
        },
      });
    } else {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
  } catch (err) {
    next(err);
  }
};

// @desc    Get user data
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res, next) => {
  res.status(200).json({
    success: true,
    data: {
      _id: req.user.id,
      name: req.user.name,
      username: req.user.username,
      role: req.user.role,
    },
  });
};

module.exports = {
  registerUser,
  loginUser,
  getMe,
};
