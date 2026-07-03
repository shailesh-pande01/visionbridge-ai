// ─────────────────────────────────────────────────────────────────
// client/src/services/sosService.js
// API calls for Emergency SOS feature.
// ─────────────────────────────────────────────────────────────────

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export async function getContacts(userId = 'default_user') {
  const resp = await fetch(`${API_BASE}/api/sos/contacts?userId=${userId}`);
  const data = await resp.json();
  if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to fetch contacts');
  return data.data;
}

export async function addContact(name, phone, relationship, userId = 'default_user') {
  const resp = await fetch(`${API_BASE}/api/sos/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, phone, relationship, userId }),
  });
  const data = await resp.json();
  if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to add contact');
  return data.data;
}

export async function updateContact(id, name, phone, relationship) {
  const resp = await fetch(`${API_BASE}/api/sos/contact/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, phone, relationship }),
  });
  const data = await resp.json();
  if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to update contact');
  return data.data;
}

export async function deleteContact(id) {
  const resp = await fetch(`${API_BASE}/api/sos/contact/${id}`, {
    method: 'DELETE',
  });
  const data = await resp.json();
  if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to delete contact');
  return data.success;
}

export async function triggerSOS(latitude, longitude, address = '', userId = 'default_user') {
  const resp = await fetch(`${API_BASE}/api/sos/trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude, longitude, address, userId }),
  });
  const data = await resp.json();
  if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to trigger SOS');
  return data.data;
}

export async function updateLiveLocation(eventId, latitude, longitude, address = '') {
  const resp = await fetch(`${API_BASE}/api/sos/event/${eventId}/location`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude, longitude, address }),
  });
  const data = await resp.json();
  if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to update live location');
  return data.data;
}

export async function endEmergency(eventId) {
  const resp = await fetch(`${API_BASE}/api/sos/event/${eventId}/end`, {
    method: 'POST',
  });
  const data = await resp.json();
  if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to end emergency');
  return data.data;
}
