import React from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';

function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="footer" role="contentinfo">
      <div className="container footer__inner">

        {/* Brand */}
        <div className="footer__brand">
          <Link to="/" className="footer__logo" aria-label="VisionBridge Home">
            <span aria-hidden="true">👁️</span>
            <span>VisionBridge</span>
          </Link>
          <p className="footer__tagline">AI-powered sight for everyone.</p>
        </div>

        {/* Nav Links */}
        <nav aria-label="Footer navigation">
          <ul className="footer__links" role="list">
            <li><Link to="/"         className="footer__link">Home</Link></li>
            <li><Link to="/features" className="footer__link">Features</Link></li>
            <li><Link to="/about"    className="footer__link">About</Link></li>
            <li><Link to="/contact"  className="footer__link">Contact</Link></li>
          </ul>
        </nav>

        {/* Accessibility badge */}
        <div className="footer__badge-wrap">
          <span className="badge badge--cyan" aria-label="Accessibility-first design">
            ♿ Accessibility First
          </span>
        </div>

      </div>

      <div className="footer__bottom">
        <p>© {year} VisionBridge — Built for Hack4Humanity 2026</p>
      </div>
    </footer>
  );
}

export default Footer;
