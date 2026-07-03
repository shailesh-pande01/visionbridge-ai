import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import Navbar from './components/Navbar';
import Footer from './components/Footer';

import Home from './pages/Home';
import Features from './pages/Features';
import About from './pages/About';
import Contact from './pages/Contact';

// Feature modules
import AIAssistant from './modules/AIAssistant';
import ReadingAssistant from './modules/Reading';
import LocationAssistant from './modules/Location';
import VolunteerModule from './modules/Volunteer';
import SOSModule from './modules/SOS';

import './App.css';

function App() {
  return (
    <Router>
      {/* Accessibility: skip to content link */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <div className="app">
        <Navbar />

        <main id="main-content" tabIndex="-1">
          <Routes>
            <Route path="/"          element={<Home />} />
            <Route path="/features"  element={<Features />} />
            <Route path="/about"     element={<About />} />
            <Route path="/contact"   element={<Contact />} />

            {/* Feature module routes */}
            <Route path="/camera"    element={<AIAssistant />} />
            <Route path="/reading"   element={<ReadingAssistant />} />
            <Route path="/location"  element={<LocationAssistant />} />
            <Route path="/volunteer" element={<VolunteerModule />} />
            <Route path="/sos"       element={<SOSModule />} />

            {/* Alias routes for Voice Command Navigation */}
            <Route path="/camera-assistant"  element={<Navigate to="/camera" replace />} />
            <Route path="/reading-assistant" element={<Navigate to="/reading" replace />} />
            <Route path="/location-assistant" element={<Navigate to="/location" replace />} />
            <Route path="/volunteer-help"    element={<Navigate to="/volunteer" replace />} />
            <Route path="/emergency-sos"     element={<Navigate to="/sos" replace />} />
          </Routes>
        </main>

        <Footer />
      </div>
    </Router>
  );
}

export default App;
