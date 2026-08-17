// ─────────────────────────────────────────────────────────────────
// client/src/services/session.js
// Single source of truth for the signed-in session.
//
// The volunteer dashboard and the low-vision app are normally open at
// the same time — that is the whole point of the handoff — and every
// tab of a browser shares one localStorage. Keeping the session only
// there meant the second login silently took over the first tab: the
// low-vision user's help request went out carrying the volunteer's
// token, the API rejected it with 403, and the request was never
// stored, so it could never reach the dashboard.
//
// A tab therefore pins its own identity in sessionStorage, while
// localStorage still remembers the last session so a returning user
// stays signed in and newly opened tabs inherit it.
// ─────────────────────────────────────────────────────────────────

const KEY = 'user';

export function getStoredUser() {
  try {
    const pinned = sessionStorage.getItem(KEY);
    if (pinned) return JSON.parse(pinned);

    // First load of this tab: adopt the remembered session and pin it,
    // so a later login in another tab cannot repurpose this one.
    const remembered = localStorage.getItem(KEY);
    if (remembered) {
      sessionStorage.setItem(KEY, remembered);
      return JSON.parse(remembered);
    }
  } catch (e) {
    // Corrupt or unavailable storage — treat as signed out.
  }
  return null;
}

export function setStoredUser(user) {
  try {
    const raw = JSON.stringify(user);
    sessionStorage.setItem(KEY, raw);
    localStorage.setItem(KEY, raw);
  } catch (e) {}
}

export function clearStoredUser() {
  try {
    sessionStorage.removeItem(KEY);
    localStorage.removeItem(KEY);
  } catch (e) {}
}

// Every authenticated call goes through this, so a request can never
// be signed with a different role's token than the tab is using.
export function getAuthHeaders() {
  const user = getStoredUser();
  return user && user.token ? { Authorization: `Bearer ${user.token}` } : {};
}
