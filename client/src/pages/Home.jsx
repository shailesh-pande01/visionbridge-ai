import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAssistant } from '../voice/AssistantContext';
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
  {
    id: 'transport',
    icon: '🚍',
    label: 'Public Transport',
    voiceHint: 'Say "Public transport"',
    route: '/transport',
    variant: '',
  },
  {
    id: 'finder',
    icon: '🔍',
    label: 'Object Finder',
    voiceHint: 'Say "Find my wallet"',
    route: '/finder',
    variant: '',
  },
];

// Spoken examples — these are natural phrasings, not fixed keywords.
const VOICE_EXAMPLES = [
  '“Vision, read this menu.”',
  '“Vision, what is around me?”',
  '“Vision, where is this bus going?”',
  '“Vision, find my wallet.”',
  '“Vision, where am I?”',
  '“Vision, I need a volunteer.”',
];

function Home() {
  const navigate = useNavigate();
  const { voiceState } = useAssistant();

  const isListening =
    voiceState.status === 'LISTENING' || voiceState.status === 'AWAITING_COMMAND';

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
            Just say “Vision” and speak — or choose a feature below.
          </p>
        </div>
      </section>

      {/* ── Always-listening panel ────────────────────
           The microphone is handled globally by the voice
           controller; this panel just tells the user what
           they can say and whether it is hearing them.     */}
      <section className="voice-section" aria-labelledby="voice-label">
        <div className="container voice-section__inner">

          <p id="voice-label" className="voice-section__label" aria-live="polite">
            {isListening ? 'Listening — say “Vision”' : 'Voice assistant'}
          </p>

          <div className={`home-voice-card${isListening ? ' home-voice-card--live' : ''}`}>
            <span className="home-voice-card__icon" aria-hidden="true">🎙️</span>
            <p className="home-voice-card__title">
              Say <strong>“Vision”</strong>, then ask for anything
            </p>
            <ul className="home-voice-examples" role="list">
              {VOICE_EXAMPLES.map((example) => (
                <li key={example} className="home-voice-example">{example}</li>
              ))}
            </ul>
            <p className="home-voice-card__hint">
              After a feature opens, keep talking — “Vision, capture”, then ask
              questions about what I saw.
            </p>
          </div>

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
