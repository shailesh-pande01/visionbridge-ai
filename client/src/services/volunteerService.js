// ─────────────────────────────────────────────────────────────────
// client/src/services/volunteerService.js
// API calls for Volunteer Help Network.
// ─────────────────────────────────────────────────────────────────

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export async function registerVolunteer(name, phone, latitude, longitude) {
  const resp = await fetch(`${API_BASE}/api/volunteer/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, phone, latitude, longitude }),
  });
  const data = await resp.json();
  if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to register volunteer');
  return data.data;
}

export async function getVolunteers() {
  const resp = await fetch(`${API_BASE}/api/volunteer/list`);
  const data = await resp.json();
  if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to fetch volunteers');
  return data.data;
}

export async function createHelpRequest(requester, latitude, longitude, address, destination, helpDescription) {
  const resp = await fetch(`${API_BASE}/api/volunteer/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requester, latitude, longitude, address, destination, helpDescription }),
  });
  const data = await resp.json();
  if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to create help request');
  return data.data;
}

export async function getNearbyRequests(volunteerId = '') {
  const resp = await fetch(`${API_BASE}/api/volunteer/requests?volunteerId=${volunteerId}`);
  const data = await resp.json();
  if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to fetch nearby requests');
  return data.data;
}

export async function getRequestStatus(id) {
  const resp = await fetch(`${API_BASE}/api/volunteer/request/${id}`);
  const data = await resp.json();
  if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to fetch request status');
  return data.data;
}

export async function acceptRequest(id, volunteerId) {
  const resp = await fetch(`${API_BASE}/api/volunteer/request/${id}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ volunteerId }),
  });
  const data = await resp.json();
  if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to accept request');
  return data.data;
}

export async function rejectRequest(id) {
  const resp = await fetch(`${API_BASE}/api/volunteer/request/${id}/reject`, {
    method: 'POST',
  });
  const data = await resp.json();
  if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to reject request');
  return data.data;
}

export async function completeRequest(id) {
  const resp = await fetch(`${API_BASE}/api/volunteer/request/${id}/complete`, {
    method: 'POST',
  });
  const data = await resp.json();
  if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to complete request');
  return data.data;
}

export async function sendMessage(id, sender, receiver, message) {
  const resp = await fetch(`${API_BASE}/api/volunteer/request/${id}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender, receiver, message }),
  });
  const data = await resp.json();
  if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to send message');
  return data.data;
}

export async function getMessages(id) {
  const resp = await fetch(`${API_BASE}/api/volunteer/request/${id}/messages`);
  const data = await resp.json();
  if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to fetch messages');
  return data.data;
}

export async function updateLocation(id, role, latitude, longitude, volunteerId = null) {
  const resp = await fetch(`${API_BASE}/api/volunteer/request/${id}/location`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, latitude, longitude, volunteerId }),
  });
  const data = await resp.json();
  if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to update location');
  return data.success;
}
