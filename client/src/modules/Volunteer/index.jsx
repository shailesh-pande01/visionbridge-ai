import React from 'react';
import { Link } from 'react-router-dom';
import UserView from './UserView';
import './VolunteerAssistant.css';

function VolunteerModule() {
  return (
    <div className="volunteer-page">
      {/* Back nav */}
      <div className="volunteer-back container">
        <Link to="/user/home" className="back-link" aria-label="Back to home">
          ← Home
        </Link>
      </div>

      {/* Page header */}
      <header className="volunteer-header">
        <span className="volunteer-header__icon" aria-hidden="true">🤝</span>
        <h1 className="volunteer-header__title">Volunteer Help</h1>
        <p className="volunteer-header__desc">
          Request real-time guidance and physical assistance from nearby trusted volunteers.
        </p>
      </header>

      {/* Main Content Container */}
      <div className="volunteer-container container">
        <UserView />
      </div>
    </div>
  );
}

export default VolunteerModule;
