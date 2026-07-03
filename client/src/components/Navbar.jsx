import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Navbar.css';

const NAV_LINKS = [
  { to: '/',         label: 'Home' },
  { to: '/features', label: 'Features' },
  { to: '/about',    label: 'About' },
  { to: '/contact',  label: 'Contact' },
];

function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

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

  return (
    <header
      className={`navbar${scrolled ? ' navbar--scrolled' : ''}`}
      role="banner"
    >
      <div className="container navbar__inner">

        {/* Logo */}
        <Link to="/" className="navbar__logo" aria-label="VisionBridge — Home">
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
              <li key={to}>
                <Link
                  to={to}
                  className={`navbar__link${location.pathname === to ? ' navbar__link--active' : ''}`}
                  aria-current={location.pathname === to ? 'page' : undefined}
                >
                  {label}
                </Link>
              </li>
            ))}
            <li>
              <Link to="/features" className="btn-primary navbar__cta">
                Get Help
              </Link>
            </li>
          </ul>
        </nav>

      </div>
    </header>
  );
}

export default Navbar;
