<div align="center">
  
# 👁️ VisionBridge

**An intelligent, accessibility-first AI companion designed to empower low-vision and blind users to navigate the physical world independently.**

[![React](https://img.shields.io/badge/React-18.0-blue.svg?logo=react)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-Express-green.svg?logo=node.js)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-brightgreen.svg?logo=mongodb)](https://www.mongodb.com/)
[![Socket.io](https://img.shields.io/badge/Socket.io-Realtime-black.svg?logo=socket.io)](https://socket.io/)
[![Google Gemini](https://img.shields.io/badge/AI-Google_Gemini-orange.svg)](https://deepmind.google/technologies/gemini/)
[![Accessibility](https://img.shields.io/badge/A11y-Voice_First-purple.svg)]()

</div>

---

## 🌟 Overview

VisionBridge is a comprehensive, voice-first web application built on the MERN stack. It harnesses the power of the **Google Gemini AI**, the **Web Speech API**, and **Real-Time Geolocation** to bridge the gap between low-vision users and their surroundings. 

Instead of relying on tiny text and complex menus, VisionBridge uses massive touch targets, extreme high-contrast colors, and continuous voice feedback to deliver an entirely seamless experience.

## ✨ Core Features

### 🎙️ 1. Voice Command Navigation
The entire application can be navigated hands-free. A giant animated microphone on the homepage listens for natural language commands (e.g., *"Describe my surroundings"*, *"I want to read this label"*, *"Help me"*). The system intelligently maps spoken intent to the correct feature using the browser `SpeechRecognition` API.

### 📷 2. AI Camera Assistant
A practical, camera-first experience. By pointing their device's rear camera and tapping a giant capture button, users receive an instant auditory description of their surroundings. 
- **Obstacle Detection:** Immediately warns users of stairs, objects, or hazards.
- **Scene Analysis:** Powered by Gemini Vision API to describe lighting, time of day, and objects.

### 📖 3. Smart Reading Assistant
Point the camera at signs, medicine labels, restaurant menus, or documents. VisionBridge captures the frame, extracts the text using intelligent OCR, and automatically reads the contents aloud via the `SpeechSynthesis` API.

### 📍 4. "Where Am I?" Location Assistant
Replaces complex visual maps with simple, auditory geographical awareness. Using OpenStreetMap (Nominatim & Overpass) and Gemini AI, it translates coordinates into natural language context: *"You are near the City Library. A bus stop is on your left."*

### 🤝 5. Volunteer Help Network
When AI isn't enough, humans step in. Users can broadcast a help request to nearby registered volunteers. 
- **Real-Time Tracking:** Live interactive radar maps powered by `Socket.io`.
- **Instant Connections:** Volunteers can view the user's location and guide them to their destination safely.

### 🚨 6. Emergency SOS
Speed and reliability for critical moments.
- **Voice Activation:** Shouting *"Emergency"* or *"SOS"* instantly starts a 5-second countdown.
- **Live Broadcasting:** Automatically sends live GPS tracking links and distress messages to pre-configured trusted emergency contacts.

---

## 🏗️ Architecture & Tech Stack

### Frontend (Client)
- **Framework:** React.js + React Router
- **Styling:** Vanilla CSS (Tailored high-contrast, scalable fluid typography, custom CSS animations)
- **Browser APIs:** `Web Speech API` (SpeechRecognition, SpeechSynthesis), `MediaDevices` (getUserMedia), `Geolocation API`
- **State & Networking:** React Hooks, native `fetch`, `socket.io-client`

### Backend (Server)
- **Environment:** Node.js, Express.js
- **Database:** MongoDB (Mongoose ODMs for Volunteers, Emergency Contacts, and Events)
- **Real-Time Engine:** Socket.io (for live SOS tracking and Volunteer dispatching)
- **AI Integration:** `@google/generative-ai` (Gemini 2.5 Flash / Pro)
- **Geocoding:** OpenStreetMap APIs

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/en/) (v16 or higher)
- [MongoDB](https://www.mongodb.com/) (Local instance or MongoDB Atlas)
- Google Gemini API Key

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/visionbridge.git
cd visionbridge
```

### 2. Backend Setup
```bash
cd server
npm install
```
Create a `.env` file in the `server` directory:
```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/visionbridge
GEMINI_API_KEY=your_google_gemini_api_key_here
```
Start the backend server:
```bash
npm start
```

### 3. Frontend Setup
Open a new terminal window:
```bash
cd client
npm install
```
Start the React development server:
```bash
npm start
```
*Note: The frontend runs on `http://localhost:3001` to avoid conflicting with the backend on `5000`.*

---

## 📱 Usage & Testing Tips
- **Microphone & Camera Permissions:** Because VisionBridge heavily relies on hardware APIs (`getUserMedia`, `SpeechRecognition`), you **must** run the app on `localhost` or serve it over `https://` for modern browsers to grant hardware access.
- **Desktop Testing:** Use the "Upload from Device" fallback buttons inside the camera modules if your desktop lacks a webcam.
- **Voice Navigation:** Click the large central mic button on the home page and speak *"Describe surroundings"* to see the routing engine in action.

---

## 🤝 Contributing
Contributions are highly welcome! Whether it's improving accessibility patterns, adding new languages for Speech Synthesis, or optimizing the Gemini prompts—please feel free to submit a Pull Request.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License
Distributed under the MIT License. See `LICENSE` for more information.

---

<div align="center">
  <b>Built with ❤️ to make the world more accessible for everyone.</b>
</div>
