import React, { useEffect, useRef, useState } from 'react';

// Haversine distance helper for robust backup display
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const d = R * c; // in metres
  return Math.round(d);
}

function LiveMap({ requesterLoc, volunteerLoc }) {
  const mapRef = useRef(null);
  const [mapError, setMapError] = useState(false);
  const googleMapInstance = useRef(null);
  const requesterMarker = useRef(null);
  const volunteerMarker = useRef(null);

  useEffect(() => {
    const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
    if (!apiKey || apiKey === 'your_google_maps_api_key_here') {
      setMapError(true);
      return;
    }

    // Load Google Maps script if not loaded
    if (!window.google) {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = initMap;
      script.onerror = () => setMapError(true);
      document.head.appendChild(script);
    } else {
      initMap();
    }

    function initMap() {
      if (!mapRef.current || !window.google) return;

      const center = requesterLoc ? { lat: requesterLoc.latitude, lng: requesterLoc.longitude } : { lat: 18.5204, lng: 73.8567 };

      googleMapInstance.current = new window.google.maps.Map(mapRef.current, {
        center,
        zoom: 16,
        styles: [
          { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
          { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
          { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
        ],
      });

      if (requesterLoc) {
        requesterMarker.current = new window.google.maps.Marker({
          position: { lat: requesterLoc.latitude, lng: requesterLoc.longitude },
          map: googleMapInstance.current,
          label: '🧑‍🦯',
          title: 'Requester Location',
        });
      }

      if (volunteerLoc) {
        volunteerMarker.current = new window.google.maps.Marker({
          position: { lat: volunteerLoc.latitude, lng: volunteerLoc.longitude },
          map: googleMapInstance.current,
          label: '🤝',
          title: 'Volunteer Location',
        });
      }
    }
  }, [requesterLoc, volunteerLoc]);

  // Update marker positions dynamically when props change
  useEffect(() => {
    if (!window.google || !googleMapInstance.current) return;

    if (requesterLoc && requesterMarker.current) {
      requesterMarker.current.setPosition({ lat: requesterLoc.latitude, lng: requesterLoc.longitude });
    }

    if (volunteerLoc && volunteerMarker.current) {
      volunteerMarker.current.setPosition({ lat: volunteerLoc.latitude, lng: volunteerLoc.longitude });
    }

    // Auto fit bounds if both exist
    if (requesterLoc && volunteerLoc && window.google) {
      const bounds = new window.google.maps.LatLngBounds();
      bounds.extend({ lat: requesterLoc.latitude, lng: requesterLoc.longitude });
      bounds.extend({ lat: volunteerLoc.latitude, lng: volunteerLoc.longitude });
      googleMapInstance.current.fitBounds(bounds);
    }
  }, [requesterLoc, volunteerLoc]);

  // If map fails or API key not set, show high contrast simulated live view
  if (mapError) {
    const distance = (requesterLoc && volunteerLoc) 
      ? calculateDistance(requesterLoc.latitude, requesterLoc.longitude, volunteerLoc.latitude, volunteerLoc.longitude)
      : null;

    return (
      <div className="volunteer-map-container">
        <div className="volunteer-map-placeholder">
          <div className="volunteer-map-radar" />
          <h3 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.5rem' }}>
            Live Tracking Radar
          </h3>
          <p style={{ fontSize: '1.15rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Requester GPS: {requesterLoc ? `${requesterLoc.latitude.toFixed(4)}, ${requesterLoc.longitude.toFixed(4)}` : 'Locating...'}
            {volunteerLoc && ` | Volunteer GPS: ${volunteerLoc.latitude.toFixed(4)}, ${volunteerLoc.longitude.toFixed(4)}`}
          </p>
          {distance !== null && (
            <div style={{ padding: '0.75rem 1.5rem', background: 'var(--accent)', color: 'var(--bg-primary)', borderRadius: '99px', fontSize: '1.3rem', fontWeight: 900 }}>
              Volunteer is ~{distance} meters away
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="volunteer-map-container">
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

export default LiveMap;
