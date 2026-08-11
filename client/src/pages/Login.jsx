import React, { useState, useContext, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import './Auth.css';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, user, loading } = useContext(AuthContext);
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      if (user.role === 'volunteer') navigate('/volunteer/dashboard');
      else navigate('/user/home');
    }
  }, [user, loading, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!username || !password) {
      setError('Please enter both username and password.');
      return;
    }

    const result = await login(username, password);
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
      <div className="auth-box">
        <h2>Login to VisionBridge</h2>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              aria-required="true"
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              aria-required="true"
            />
          </div>
          <button type="submit" className="btn-primary auth-btn">Login</button>
        </form>
        <p className="auth-link">
          Don't have an account? <Link to="/register">Register here</Link>
        </p>
      </div>
    </div>
  );
}

export default Login;
