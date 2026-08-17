// ─────────────────────────────────────────────────────────────────
// client/src/voice/LowVisionLayout.jsx
// Wraps every authenticated low-vision route.
//
// Mounting the provider and the controller here — above <Outlet /> —
// is what makes the assistant global: React Router swaps the feature
// screen underneath while the voice controller and its session memory
// stay mounted. Navigation, feature switches and the browser back
// button never restart the microphone.
//
// Volunteer routes and public pages are outside this layout, so the
// volunteer dashboard is untouched by the conversational system.
// ─────────────────────────────────────────────────────────────────

import React from 'react';
import { Outlet } from 'react-router-dom';

import { AssistantProvider } from './AssistantContext';
import VoiceController from './VoiceController';

function LowVisionLayout() {
  return (
    <AssistantProvider>
      <Outlet />
      {/* Keeps the last of the page scrollable above the fixed status bar */}
      <div className="vb-voice-spacer" aria-hidden="true" />
      <VoiceController />
    </AssistantProvider>
  );
}

export default LowVisionLayout;
