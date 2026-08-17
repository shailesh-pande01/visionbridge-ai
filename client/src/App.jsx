import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LowVisionLayout from './voice/LowVisionLayout';

import Navbar from './components/Navbar';
import Footer from './components/Footer';

import Login from './pages/Login';
import Register from './pages/Register';

import Home from './pages/Home';
import VolunteerDashboard from './pages/VolunteerDashboard';

import Features from './pages/Features';
import About from './pages/About';
import Contact from './pages/Contact';

// Feature modules
import AIAssistant from './modules/AIAssistant';
import ReadingAssistant from './modules/Reading';
import LocationAssistant from './modules/Location';
import VolunteerModule from './modules/Volunteer';
import SOSModule from './modules/SOS';
import TransportAssistant from './modules/Transport';
import FinderAssistant from './modules/Finder';

import './App.css';

function App() {
  return (
    <Router>
      <AuthProvider>
        {/* Accessibility: skip to content link */}
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>

        <div className="app">
          <Navbar />

          <main id="main-content" tabIndex="-1">
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              
              <Route path="/features" element={<Features />} />
              <Route path="/about" element={<About />} />
              <Route path="/contact" element={<Contact />} />

              {/* Protected Routes for Low-Vision User.
                  LowVisionLayout mounts the global voice assistant once,
                  so it survives every navigation between these screens. */}
              <Route element={<ProtectedRoute allowedRoles={['lowVisionUser']} />}>
                <Route element={<LowVisionLayout />}>
                  <Route path="/user/home" element={<Home />} />

                  {/* Feature module routes */}
                  <Route path="/camera"    element={<AIAssistant />} />
                  <Route path="/reading"   element={<ReadingAssistant />} />
                  <Route path="/location"  element={<LocationAssistant />} />
                  <Route path="/volunteer" element={<VolunteerModule />} />
                  <Route path="/sos"       element={<SOSModule />} />
                  <Route path="/transport" element={<TransportAssistant />} />
                  <Route path="/finder"    element={<FinderAssistant />} />

                  {/* Alias routes for Voice Command Navigation */}
                  <Route path="/camera-assistant"  element={<Navigate to="/camera" replace />} />
                  <Route path="/reading-assistant" element={<Navigate to="/reading" replace />} />
                  <Route path="/location-assistant" element={<Navigate to="/location" replace />} />
                  <Route path="/volunteer-help"    element={<Navigate to="/volunteer" replace />} />
                  <Route path="/emergency-sos"     element={<Navigate to="/sos" replace />} />
                  <Route path="/public-transport"  element={<Navigate to="/transport" replace />} />
                  <Route path="/transport-assistant" element={<Navigate to="/transport" replace />} />
                  <Route path="/object-finder"     element={<Navigate to="/finder" replace />} />
                  <Route path="/where-am-i"        element={<Navigate to="/location" replace />} />
                  <Route path="/hazard-mode"       element={<Navigate to="/camera" replace />} />
                </Route>
              </Route>

              {/* Protected Routes for Volunteer */}
              <Route element={<ProtectedRoute allowedRoles={['volunteer']} />}>
                <Route path="/volunteer/dashboard" element={<VolunteerDashboard />} />
              </Route>
            </Routes>
          </main>

          <Footer />
        </div>
      </AuthProvider>
    </Router>
  );
}

export default App;
