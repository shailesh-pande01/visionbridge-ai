import React from 'react';
import { Link } from 'react-router-dom';
import './About.css';

const VALUES = [
  {
    icon: '🌍',
    title: 'Accessibility First',
    desc: 'Every design decision follows WCAG 2.1 AA — high contrast, large fonts, full keyboard navigation, and screen-reader compatibility.',
  },
  {
    icon: '🤖',
    title: 'AI-Powered Clarity',
    desc: 'Gemini Vision + Google Maps API deliver intelligent, real-world responses — not just static data.',
  },
  {
    icon: '🛡️',
    title: 'Safety by Design',
    desc: 'SOS alerts and a volunteer network ensure no user is ever truly alone, no matter where they are.',
  },
];

function About() {
  return (
    <div className="about-page">

      {/* Page Header */}
      <section className="section about-header">
        <div className="container">
          <p className="hero__eyebrow">Our Mission</p>
          <h1 className="section-title">Built for Independence</h1>
          <p className="section-sub">
            VisionBridge closes the gap between low-vision individuals and the modern world —
            using AI as the bridge.
          </p>
        </div>
      </section>

      <div className="divider" />

      {/* Core Values */}
      <section className="section about-values" aria-labelledby="values-heading">
        <div className="container">
          <h2 id="values-heading" className="section-title">Why We Built This</h2>
          <div className="values-grid">
            {VALUES.map(({ icon, title, desc }) => (
              <div key={title} className="card value-card">
                <span className="value-card__icon" aria-hidden="true">{icon}</span>
                <h3 className="value-card__title">{title}</h3>
                <p className="value-card__desc">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* Team placeholder */}
      <section className="section about-team" aria-labelledby="team-heading">
        <div className="container">
          <h2 id="team-heading" className="section-title">The Team</h2>
          <p className="section-sub">A group of students building tech for social good.</p>
          <div className="card team-placeholder">
            <p>👥 Team details coming soon.</p>
          </div>
          <Link to="/contact" className="btn-primary about-cta">Contact Us</Link>
        </div>
      </section>

    </div>
  );
}

export default About;
