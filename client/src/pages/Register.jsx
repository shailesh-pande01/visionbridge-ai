import React, { useState, useContext, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import './Auth.css';

function Register() {
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    password: '',
    confirmPassword: '',
    role: 'lowVisionUser',
  });
  const [error, setError] = useState('');
  const { register, user, loading } = useContext(AuthContext);
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      if (user.role === 'volunteer') navigate('/volunteer/dashboard');
      else navigate('/user/home');
    }
  }, [user, loading, navigate]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleRoleSelect = (role) => {
    setFormData({ ...formData, role });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    const result = await register({
      name: formData.name,
      username: formData.username,
      password: formData.password,
      role: formData.role,
    });

    if (result.success) {
      if (result.role === 'volunteer') {
        navigate('/volunteer/dashboard');
      } else {
        navigate('/user/home');
      }
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-box auth-box-large">
        <h2>Join VisionBridge</h2>
        {error && <div className="auth-error" role="alert">{error}</div>}
        
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="role-selection">
            <p className="role-label">I am a...</p>
            <div className="role-cards">
              <button
                type="button"
                className={`role-card ${formData.role === 'lowVisionUser' ? 'selected' : ''}`}
                onClick={() => handleRoleSelect('lowVisionUser')}
                aria-pressed={formData.role === 'lowVisionUser'}
              >
                <h3>Low-Vision User</h3>
                <p>Get AI assistance, accessibility tools, emergency help, and volunteer support.</p>
              </button>
              <button
                type="button"
                className={`role-card ${formData.role === 'volunteer' ? 'selected' : ''}`}
                onClick={() => handleRoleSelect('volunteer')}
                aria-pressed={formData.role === 'volunteer'}
              >
                <h3>Volunteer</h3>
                <p>Help people who need assistance through the VisionBridge community.</p>
              </button>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="name">Full Name</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              aria-required="true"
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              name="username"
              value={formData.username}
              onChange={handleChange}
              required
              aria-required="true"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              aria-required="true"
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              aria-required="true"
            />
          </div>

          <button type="submit" className="btn-primary auth-btn">Register</button>
        </form>
        <p className="auth-link">
          Already have an account? <Link to="/login">Login here</Link>
        </p>
      </div>
    </div>
  );
}

export default Register;
