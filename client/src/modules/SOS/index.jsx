import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import EmergencySOSView from './EmergencySOSView';
import EmergencyContactsView from './EmergencyContactsView';
import './SOSAssistant.css';

function SOSModule() {
  // 'sos' | 'contacts'
  const [activeTab, setActiveTab] = useState('sos');

  return (
    <div className="sos-page">
      {/* Back nav */}
      <div className="sos-back container">
        <Link to="/" className="back-link" aria-label="Back to home">
          ← Home
        </Link>
      </div>

      {/* Page header */}
      <header className="sos-header">
        <span className="sos-header__icon" aria-hidden="true">🚨</span>
        <h1 className="sos-header__title">Emergency SOS</h1>
        <p className="sos-header__desc">
          One tap or voice command alerts your trusted contacts and shares your live GPS location instantly.
        </p>
      </header>

      {/* Mode Selection Toggle */}
      <div className="sos-mode-toggle" role="tablist" aria-label="Select View Mode">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'sos'}
          className={`sos-mode-btn ${activeTab === 'sos' ? 'sos-mode-btn--active' : ''}`}
          onClick={() => setActiveTab('sos')}
        >
          <span aria-hidden="true">🚨</span> Emergency SOS
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'contacts'}
          className={`sos-mode-btn ${activeTab === 'contacts' ? 'sos-mode-btn--active' : ''}`}
          onClick={() => setActiveTab('contacts')}
        >
          <span aria-hidden="true">👥</span> Trusted Contacts
        </button>
      </div>

      {/* Main Content Container */}
      <div className="sos-container container">
        {activeTab === 'sos' ? <EmergencySOSView /> : <EmergencyContactsView />}
      </div>
    </div>
  );
}

export default SOSModule;
