import React, { useState, useEffect, useContext } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import './Navbar.css';

function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useContext(AuthContext);

  const NAV_LINKS = user && user.role === 'lowVisionUser'
    ? [
        { to: '/user/home', label: 'Home' },
        { to: '/about', label: 'About' },
        { to: '/contact', label: 'Contact' },
      ]
    : user && user.role === 'volunteer'
    ? [
        { to: '/volunteer/dashboard', label: 'Dashboard' },
        { to: '/about', label: 'About' },
        { to: '/contact', label: 'Contact' },
      ]
    : [
        { to: '/', label: 'Home' },
        { to: '/features', label: 'Features' },
        { to: '/about', label: 'About' },
        { to: '/contact', label: 'Contact' },
      ];

  // Shrink/border navbar on scroll
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    setMenuOpen(false);
  };

  return (
    <header
      className={`navbar${scrolled ? ' navbar--scrolled' : ''}`}
      role="banner"
    >
      <div className="container navbar__inner">

        {/* Logo */}
        <Link to={user ? (user.role === 'volunteer' ? '/volunteer/dashboard' : '/user/home') : '/'} className="navbar__logo" aria-label="VisionBridge — Home">
          <span className="navbar__logo-icon" aria-hidden="true">👁️</span>
          <span>Vision<span className="navbar__logo-accent">Bridge</span></span>
        </Link>

        {/* Desktop + Mobile Nav */}
        <nav aria-label="Main navigation">
          {/* Hamburger (mobile only) */}
          <button
            className="navbar__toggle"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-expanded={menuOpen}
            aria-controls="nav-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            <span className={`navbar__ham${menuOpen ? ' navbar__ham--open' : ''}`} aria-hidden="true">
              <span /><span /><span />
            </span>
          </button>

          {/* Link list */}
          <ul
            id="nav-menu"
            className={`navbar__links${menuOpen ? ' navbar__links--open' : ''}`}
            role="list"
          >
            {NAV_LINKS.map(({ to, label }) => (
              <li key={label}>
                <Link
                  to={to}
                  className={`navbar__link${location.pathname === to ? ' navbar__link--active' : ''}`}
                  aria-current={location.pathname === to ? 'page' : undefined}
                >
                  {label}
                </Link>
              </li>
            ))}
            
            {!user ? (
              <>
                <li>
                  <Link to="/login" className="navbar__link">Login</Link>
                </li>
                <li>
                  <Link to="/register" className="btn-primary navbar__cta">Register</Link>
                </li>
              </>
            ) : (
              <>
                <li className="navbar__user-greeting">
                  Hello, {user.name}
                </li>
                <li>
                  <button onClick={handleLogout} className="btn-outline navbar__cta">Logout</button>
                </li>
              </>
            )}
          </ul>
        </nav>

      </div>
    </header>
  );
}

export default Navbar;
