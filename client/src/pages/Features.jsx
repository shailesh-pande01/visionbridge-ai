import React from 'react';
import { Link } from 'react-router-dom';
import './Features.css';

const FEATURES = [
  {
    id: 'camera',
    icon: '🎙️',
    title: 'AI Camera Assistant',
    badge: 'Core Feature',
    badgeClass: 'badge--cyan',
    desc: 'Point your device camera and receive a clear, spoken description of your surroundings — objects, people, signage, and scenes — powered by Gemini Vision API.',
    route: '/camera',
  },
  {
    id: 'reading',
    icon: '📖',
    title: 'Text Reader',
    badge: 'Core Feature',
    badgeClass: 'badge--cyan',
    desc: 'Capture any text — street signs, menus, labels, or documents — and hear it read aloud instantly with natural voice output. Supports multiple languages.',
    route: '/reading',
  },
  {
    id: 'location',
    icon: '📍',
    title: 'Where Am I?',
    badge: 'Core Feature',
    badgeClass: 'badge--cyan',
    desc: 'Get a spoken description of your current location including street name, nearby landmarks, and points of interest — powered by Google Maps API.',
    route: '/location',
  },
  {
    id: 'volunteer',
    icon: '🤝',
    title: 'Volunteer Help Request',
    badge: 'Community Feature',
    badgeClass: 'badge--green',
    desc: 'Send a real-time help request to nearby verified volunteers who can provide remote or in-person assistance when you need it most.',
    route: '/volunteer',
  },
  {
    id: 'sos',
    icon: '🚨',
    title: 'Emergency SOS',
    badge: 'Safety Feature',
    badgeClass: 'badge--red',
    emergency: true,
    desc: 'One tap sends your live GPS location and a distress message to your saved emergency contacts via Firebase. Works even in low-connectivity areas.',
    route: '/sos',
  },
];

function Features() {
  return (
    <div className="features-page">

      {/* Page Header */}
      <section className="section features-header">
        <div className="container">
          <p className="hero__eyebrow">What We Offer</p>
          <h1 className="section-title">VisionBridge Features</h1>
          <p className="section-sub">
            Five tools designed to give you independence, safety, and confidence every day.
          </p>
        </div>
      </section>

      <div className="divider" />

      {/* Feature Cards */}
      <section className="section features-grid-section">
        <div className="container">
          <div className="features-grid">
            {FEATURES.map(({ id, icon, title, badge, badgeClass, desc, emergency, route }) => (
              <article
                key={id}
                id={id}
                className={`card feature-item${emergency ? ' feature-item--sos' : ''}`}
                aria-label={title}
              >
                <div className="feature-item__top">
                  <span className="feature-item__icon" aria-hidden="true">{icon}</span>
                  <span className={`badge ${badgeClass}`}>{badge}</span>
                </div>
                <h2 className="feature-item__title">{title}</h2>
                <p className="feature-item__desc">{desc}</p>
                <div className="feature-item__footer">
                  {route ? (
                    <Link to={route} className="btn-primary feature-item__link">
                      Try it →
                    </Link>
                  ) : (
                    <span className="feature-item__status" aria-label="Status">
                      🔧 Coming soon
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}

export default Features;
