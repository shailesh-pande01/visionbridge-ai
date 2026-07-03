import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import VoiceNavigation from '../components/VoiceNavigation';
import './Home.css';

// Each entry maps a spoken command to a feature route
const COMMANDS = [
  {
    id: 'camera',
    icon: '🎙️',
    label: 'Describe Surroundings',
    voiceHint: 'Say "Describe surroundings"',
    route: '/camera',
    variant: '',
  },
  {
    id: 'reading',
    icon: '📖',
    label: 'Read Text',
    voiceHint: 'Say "Read text"',
    route: '/reading',
    variant: '',
  },
  {
    id: 'location',
    icon: '📍',
    label: 'Where Am I?',
    voiceHint: 'Say "Where am I"',
    route: '/location',
    variant: '',
  },
  {
    id: 'volunteer',
    icon: '🤝',
    label: 'Find Volunteer',
    voiceHint: 'Say "Find volunteer"',
    route: '/volunteer',
    variant: '',
  },
  {
    id: 'sos',
    icon: '🚨',
    label: 'Emergency SOS',
    voiceHint: 'Say "Emergency SOS"',
    route: '/sos',
    variant: 'cmd-tile--sos',
  },
];

function Home() {
  const navigate = useNavigate();

  // ── Voice button handler ──────────────────────────
  // TODO (next step): start SpeechRecognition here,
  //   match transcript to COMMANDS, then call navigate(match.route)
  const handleVoiceStart = () => {
    // Placeholder — voice recognition logic added in next step
    alert('Voice recognition will be wired up in the next step.');
  };

  const handleCommandClick = (route) => {
    navigate(route);
  };

  return (
    <div className="home">

      {/* ── Page Header ─────────────────────────────
           Compact — voice button is the real hero     */}
      <section className="home-header" aria-labelledby="home-heading">
        <div className="container home-header__inner">
          <h1 id="home-heading" className="home-header__title">
            Your AI Vision Companion
          </h1>
          <p className="home-header__sub">
            Tap the button and speak — or choose a feature below.
          </p>
        </div>
      </section>

      {/* ── Central Voice Button ──────────────────── */}
      <section
        className="voice-section"
        aria-labelledby="voice-label"
      >
        <div className="container voice-section__inner">

          <p id="voice-label" className="voice-section__label" aria-live="polite">
            Speak a Command
          </p>

          <VoiceNavigation />

          <p className="voice-examples" aria-hidden="true">
            Try: <em>"Read text"</em> · <em>"Where am I?"</em> · <em>"Emergency SOS"</em>
          </p>

        </div>
      </section>

      <div className="divider" />

      {/* ── Command Tiles ─────────────────────────────
           Tap-friendly fallback for non-voice navigation */}
      <section
        className="commands-section"
        aria-labelledby="commands-heading"
      >
        <div className="container">
          <h2 id="commands-heading" className="section-title">
            Or Tap a Feature
          </h2>
          <p className="section-sub">
            Every feature opens directly — no menus to navigate.
          </p>

          <div className="commands-grid" role="list">
            {COMMANDS.map(({ id, icon, label, voiceHint, route, variant }) => (
              <button
                key={id}
                role="listitem"
                className={`cmd-tile${variant ? ` ${variant}` : ''}`}
                type="button"
                onClick={() => handleCommandClick(route)}
                aria-label={`${label} — ${voiceHint}`}
              >
                <span className="cmd-tile__icon" aria-hidden="true">{icon}</span>
                <span className="cmd-tile__label">{label}</span>
                <span className="cmd-tile__hint">{voiceHint}</span>
              </button>
            ))}
          </div>

          <div className="commands-more">
            <Link to="/features" className="btn-outline">
              View All Features →
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}

export default Home;
