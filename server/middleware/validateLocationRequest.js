// ─────────────────────────────────────────────────────────────────
// middleware/validateLocationRequest.js
// Validates POST /api/location/current before it reaches the controller.
// On success it attaches req.locationData.
// ─────────────────────────────────────────────────────────────────

function validateLocationRequest(req, res, next) {
  const { latitude, longitude } = req.body;

  // ── 1 · latitude presence & type ──────────────────────────────
  if (latitude === undefined || latitude === null) {
    return res.status(400).json({
      success: false,
      error: 'Missing field: latitude is required.',
    });
  }
  const lat = Number(latitude);
  if (isNaN(lat) || lat < -90 || lat > 90) {
    return res.status(400).json({
      success: false,
      error: 'Invalid latitude: must be a number between -90 and 90.',
    });
  }

  // ── 2 · longitude presence & type ─────────────────────────────
  if (longitude === undefined || longitude === null) {
    return res.status(400).json({
      success: false,
      error: 'Missing field: longitude is required.',
    });
  }
  const lng = Number(longitude);
  if (isNaN(lng) || lng < -180 || lng > 180) {
    return res.status(400).json({
      success: false,
      error: 'Invalid longitude: must be a number between -180 and 180.',
    });
  }

  // ── All checks passed ─────────────────────────────────────────
  req.locationData = { latitude: lat, longitude: lng };
  next();
}

module.exports = validateLocationRequest;
