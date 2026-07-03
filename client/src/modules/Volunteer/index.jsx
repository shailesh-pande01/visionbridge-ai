import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import UserView from './UserView';
import VolunteerView from './VolunteerView';
import './VolunteerAssistant.css';

function VolunteerModule() {
  // 'user' | 'volunteer'
  const [activeTab, setActiveTab] = useState('user');

  return (
    <div className="volunteer-page">
      {/* Back nav */}
      <div className="volunteer-back container">
        <Link to="/" className="back-link" aria-label="Back to home">
          ← Home
        </Link>
      </div>

      {/* Page header */}
      <header className="volunteer-header">
        <span className="volunteer-header__icon" aria-hidden="true">🤝</span>
        <h1 className="volunteer-header__title">Volunteer Help Network</h1>
        <p className="volunteer-header__desc">
          Connecting low-vision users with nearby trusted volunteers for real-time guidance and physical assistance.
        </p>
      </header>

      {/* Mode Selection Toggle */}
      <div className="volunteer-mode-toggle" role="tablist" aria-label="Select View Mode">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'user'}
          className={`volunteer-mode-btn ${activeTab === 'user' ? 'volunteer-mode-btn--active' : ''}`}
          onClick={() => setActiveTab('user')}
        >
          <span aria-hidden="true">🧑‍🦯</span> I Need Help
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'volunteer'}
          className={`volunteer-mode-btn ${activeTab === 'volunteer' ? 'volunteer-mode-btn--active' : ''}`}
          onClick={() => setActiveTab('volunteer')}
        >
          <span aria-hidden="true">🤝</span> I am a Volunteer
        </button>
      </div>

      {/* Main Content Container */}
      <div className="volunteer-container container">
        {activeTab === 'user' ? <UserView /> : <VolunteerView />}
      </div>
    </div>
  );
}

export default VolunteerModule;
