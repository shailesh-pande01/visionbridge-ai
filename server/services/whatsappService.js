const mongoose = require('mongoose');
const User = require('../models/User');
const EmergencyContact = require('../models/EmergencyContact');

const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || 'v18.0';

/**
 * Normalizes a phone number for the WhatsApp API.
 * Removes all non-digit characters.
 * If the resulting number is exactly 10 digits, prepends '91' (India country code) by default.
 */
function normalizePhoneNumber(phone) {
  if (!phone) return null;
  let digits = phone.toString().replace(/\D/g, '');
  if (digits.length === 10) {
    digits = '91' + digits;
  }
  return digits.length >= 10 ? digits : null;
}

/**
 * Turns a WhatsApp Cloud API error into an operator-readable reason.
 * Meta's own message is safe to surface — it never contains the token —
 * but on its own it does not say what to change, so each known code is
 * paired with the fix. Unknown codes fall back to Meta's wording.
 */
function describeApiError(status, error) {
  const code = error && error.code;
  const detail = (error && error.message) || `HTTP ${status}`;

  switch (code) {
    case 190:
      return `WhatsApp access token is expired or invalid — set a new WHATSAPP_ACCESS_TOKEN (Meta: ${detail})`;
    case 131047:
    case 131051:
      return `Free-form text is outside the 24-hour customer service window — configure WHATSAPP_EMERGENCY_TEMPLATE with an approved template (Meta: ${detail})`;
    case 131030:
      return `Recipient is not in the allowed test-number list for this WhatsApp app (Meta: ${detail})`;
    case 131026:
      return `Recipient number is not a reachable WhatsApp account (Meta: ${detail})`;
    case 132000:
    case 132001:
    case 132012:
    case 132015:
      return `Template rejected — check WHATSAPP_EMERGENCY_TEMPLATE name, WHATSAPP_TEMPLATE_LANGUAGE and its parameter count (Meta: ${detail})`;
    case 100:
      return `WhatsApp request was malformed or WHATSAPP_PHONE_NUMBER_ID is wrong (Meta: ${detail})`;
    default:
      return `WhatsApp API error${code ? ` [code ${code}]` : ''}: ${detail}`;
  }
}

/**
 * Read-only credential check. Confirms the token and phone number id are
 * accepted by the Cloud API without sending a message to anybody.
 * Returns { ok, detail } — never the token itself.
 */
exports.verifyCredentials = async () => {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    return { ok: false, detail: 'WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID is not set in the server environment.' };
  }

  try {
    const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}?fields=id,display_phone_number,verified_name`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { ok: false, detail: describeApiError(response.status, data.error) };
    }
    return { ok: true, detail: `Credentials accepted for ${data.verified_name || 'sender'} (${data.display_phone_number || phoneNumberId}).` };
  } catch (error) {
    return { ok: false, detail: `Could not reach the WhatsApp API: ${error.message}` };
  }
};

/**
 * Sends an emergency alert via the WhatsApp Business Cloud API.
 * Uses a template if configured, otherwise sends a standard text message.
 * Resolves to { sent, reason, recipients } — `reason` is null on success
 * and carries a safe, secret-free explanation on failure.
 */
exports.sendEmergencyAlert = async (userId, latitude, longitude, locationUrl, timestamp) => {
  try {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!accessToken || !phoneNumberId) {
      const reason = 'WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID is missing from the server environment.';
      console.warn(`⚠️ [WhatsApp Service] ${reason}`);
      return { sent: false, reason, recipients: 0 };
    }

    // 1. Resolve User and Name
    let user = null;
    if (userId && userId !== 'default_user') {
      try {
        const queryOr = [{ username: userId }, { userId: userId }];
        if (mongoose.Types.ObjectId.isValid(userId)) {
          queryOr.push({ _id: userId });
        }
        user = await User.findOne({ $or: queryOr });
      } catch (err) {
        console.warn('[WhatsApp Service] Error querying user:', err.message);
      }
    }

    const userName = (user && user.name) ? user.name : (user && user.username ? user.username : (userId && userId !== 'default_user' ? userId : 'VisionBridge User'));

    // 2. Resolve target emergency numbers
    const targetNumbers = [];

    // Check emergency contacts collection
    const contactQuery = [{ userId: 'default_user' }];
    if (userId) contactQuery.push({ userId: userId.toString() });
    if (user && user._id) contactQuery.push({ userId: user._id.toString() });
    if (user && user.username) contactQuery.push({ userId: user.username });

    const savedContacts = await EmergencyContact.find({ $or: contactQuery }).sort({ createdAt: -1 });
    savedContacts.forEach((c) => {
      if (c.phone) targetNumbers.push(c.phone);
    });

    // Check User profile emergency number
    if (user && user.emergencyWhatsappNumber) {
      targetNumbers.push(user.emergencyWhatsappNumber);
    }

    // Default fallback number
    if (targetNumbers.length === 0) {
      console.log(`[WhatsApp Service] No configured emergency contact for user "${userId}". Using default number 7264072702.`);
      targetNumbers.push('7264072702');
    }

    // Deduplicate and normalize
    const uniqueNormalizedNumbers = [...new Set(targetNumbers.map(normalizePhoneNumber).filter(Boolean))];

    if (uniqueNormalizedNumbers.length === 0) {
      const reason = 'No valid emergency contact number could be resolved for this user.';
      console.error(`[WhatsApp Service] ${reason}`);
      return { sent: false, reason, recipients: 0 };
    }

    const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;
    const timeString = new Date(timestamp || Date.now()).toLocaleString();
    const templateName = process.env.WHATSAPP_EMERGENCY_TEMPLATE;
    const templateLanguage = process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en';

    let anySuccess = false;
    const failures = [];

    for (const normalizedNumber of uniqueNormalizedNumbers) {
      let payload = {};

      if (templateName) {
        // Send using approved template
        payload = {
          messaging_product: 'whatsapp',
          to: normalizedNumber,
          type: 'template',
          template: {
            name: templateName,
            language: { code: templateLanguage },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: userName },
                  { type: 'text', text: timeString },
                  { type: 'text', text: `${latitude}, ${longitude}` },
                  { type: 'text', text: locationUrl }
                ]
              }
            ]
          }
        };
      } else {
        // Standard emergency text message containing all required details:
        // User name, Emergency message, Timestamp, Location coordinates, Map link
        const messageBody = `🚨 VISIONBRIDGE EMERGENCY ALERT\n\nEmergency SOS activated by: ${userName}\n\nTime: ${timeString}\nCoordinates: ${latitude}, ${longitude}\n\nLive Map Location:\n${locationUrl}\n\nPlease contact or assist immediately.`;
        payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: normalizedNumber,
          type: 'text',
          text: {
            preview_url: true,
            body: messageBody
          }
        };
      }

      console.log(`[WhatsApp Service] Dispatching WhatsApp alert to ${normalizedNumber.slice(-4).padStart(normalizedNumber.length, '*')} via ${url}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const reason = describeApiError(response.status, data.error);
        failures.push(reason);
        console.error(`❌ [WhatsApp Service] HTTP ${response.status} — ${reason}`);
      } else {
        console.log(`✅ [WhatsApp Service] WhatsApp alert accepted for delivery. Message ID: ${data.messages?.[0]?.id}`);
        anySuccess = true;
      }
    }

    return {
      sent: anySuccess,
      reason: anySuccess ? null : (failures[0] || 'WhatsApp alert was not accepted.'),
      recipients: uniqueNormalizedNumbers.length,
    };

  } catch (error) {
    console.error('❌ [WhatsApp Service] Internal error sending alert:', error.message);
    return { sent: false, reason: `Internal error sending WhatsApp alert: ${error.message}`, recipients: 0 };
  }
};
