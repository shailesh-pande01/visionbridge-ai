const User = require('../models/User');

const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || 'v18.0';

/**
 * Normalizes a phone number for the WhatsApp API.
 * Removes all non-digit characters.
 * If the resulting number is exactly 10 digits, prepends '91' (India country code) by default.
 */
function normalizePhoneNumber(phone) {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    digits = '91' + digits;
  }
  return digits;
}

/**
 * Sends an emergency alert via the WhatsApp Business Cloud API.
 * Uses a template if configured, otherwise sends a standard text message.
 */
exports.sendEmergencyAlert = async (userId, latitude, longitude, locationUrl, timestamp) => {
  try {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!accessToken || !phoneNumberId) {
      console.warn('⚠️ [WhatsApp Service] Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID. Skipping WhatsApp alert.');
      return false;
    }

    // Attempt to get user's configured emergency number
    let targetNumber = null;
    const user = await User.findOne({ userId });
    
    if (user && user.emergencyWhatsappNumber) {
      targetNumber = user.emergencyWhatsappNumber;
    } else {
      // Fallback default requested by user
      console.log(`[WhatsApp Service] No configured emergency number for user ${userId}. Using default number.`);
      targetNumber = '7264072702'; 
    }

    const normalizedNumber = normalizePhoneNumber(targetNumber);
    if (!normalizedNumber) {
      console.error('[WhatsApp Service] Invalid normalized phone number.');
      return false;
    }

    const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;
    
    const timeString = new Date(timestamp).toLocaleString();
    const templateName = process.env.WHATSAPP_EMERGENCY_TEMPLATE;
    const templateLanguage = process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en';

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
                { type: 'text', text: userId },
                { type: 'text', text: timeString },
                { type: 'text', text: `${latitude}, ${longitude}` },
                { type: 'text', text: locationUrl }
              ]
            }
          ]
        }
      };
    } else {
      // Send standard text message (works if inside 24h window or if testing)
      const messageBody = `🚨 VISIONBRIDGE EMERGENCY ALERT\n\nThe user has activated Emergency SOS.\n\nUser: ${userId}\nTime: ${timeString}\nLocation: ${latitude}, ${longitude}\n\nOpen location:\n${locationUrl}\n\nPlease contact/help the user immediately.`;
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

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`❌ [WhatsApp Service] Failed to send message: ${data.error?.message || JSON.stringify(data)}`);
      return false;
    }

    console.log(`✅ [WhatsApp Service] Alert sent successfully to ${normalizedNumber}. Message ID: ${data.messages?.[0]?.id}`);
    return true;

  } catch (error) {
    console.error('❌ [WhatsApp Service] Internal error sending alert:', error.message);
    return false;
  }
};
