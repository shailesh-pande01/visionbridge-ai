// ─────────────────────────────────────────────────────────────────
// controllers/assistantController.js
// The natural-language command engine behind the "Vision" wake word.
//
// POST /api/assistant/command  — spoken command → validated action
// POST /api/assistant/ask      — follow-up question → answer from context
//
// Gemini only ever returns a symbolic action from the whitelist in
// services/assistantActions.js. It never returns a route, a URL, or
// anything the client executes directly.
// ─────────────────────────────────────────────────────────────────

const gemini  = require('../services/geminiService');
const actions = require('../services/assistantActions');
const prompts = require('../services/assistantPrompts');

const { ACTIONS } = actions;

// ── Context limits — token efficiency ─────────────────────────────
// Only the active feature's latest information reaches Gemini, and
// even that is capped. Long menus are truncated rather than streamed
// in full on every follow-up question.
const MAX_COMMAND_LENGTH  = 400;
const MAX_CONTEXT_SUMMARY = 1500;
const MAX_RECENT_TURNS    = 3;
const MAX_TURN_LENGTH     = 200;

// The current Gemini models spend part of the output budget on internal
// reasoning before the JSON is emitted. A tight cap truncates the object
// mid-key, so the budget is generous even though the answer is tiny.
const GENERATION_CONFIG = {
  temperature:     0.1,
  topP:            0.9,
  maxOutputTokens: 2048,
};

// ── Spoken fallbacks ──────────────────────────────────────────────
const DEFAULT_SPEECH = {
  [ACTIONS.CAPTURE_IMAGE]:        'Capturing now.',
  [ACTIONS.GO_HOME]:              'Going home.',
  [ACTIONS.START_VOLUNTEER_HELP]: 'Connecting you with a volunteer.',
  [ACTIONS.EMERGENCY_SOS]:        'Starting emergency alert.',
  [ACTIONS.CONFIRM]:              '',
  [ACTIONS.REPEAT_LAST]:          '',
  [ACTIONS.STOP_SPEAKING]:        '',
  [ACTIONS.CANCEL]:               'Cancelled.',
  [ACTIONS.UNKNOWN]:              "I didn't understand that. Please try again.",
};

const FEATURE_SPEECH = {
  surroundings: 'Opening Camera Assistant.',
  hazard:       'Opening hazard scanning.',
  reading:      'Opening Reading Assistant.',
  transport:    'Opening Transport Assistant.',
  objectFinder: 'Opening Object Finder.',
  location:     'Checking your location.',
  volunteer:    'Opening Volunteer Help.',
  emergency:    'Opening Emergency SOS.',
  home:         'Going home.',
};

// What to say when a question needs visual context we do not have yet.
const NEEDS_CAPTURE_SPEECH = {
  reading:      'I need to see the text first. Say Vision, capture, when it is in front of the camera.',
  surroundings: 'I need to see your surroundings first. Say Vision, capture.',
  hazard:       'I need to see your surroundings first. Say Vision, capture.',
  transport:    'I need to see the sign first. Say Vision, capture.',
  objectFinder: 'I need to scan the area first. Say Vision, capture.',
  location:     "I don't have your location yet. Say Vision, where am I.",
};

// On the home screen there is nothing captured to fall back on, so say
// what the assistant can actually do instead of asking for a photo.
const HOME_CAPABILITIES =
  'I can read text, describe your surroundings, read transport signs, find an object, tell you where you are, ' +
  'call a volunteer, or start an emergency alert. What would you like?';

const DEFAULT_NEEDS_CAPTURE =
  'I need to see it first. Say Vision, followed by the feature you want, then Vision, capture.';

// ── sanitizeContext ───────────────────────────────────────────────
// The client decides which slice of session memory is relevant; this
// enforces the size limits regardless of what was sent.
function sanitizeContext(raw) {
  const ctx = raw && typeof raw === 'object' ? raw : {};

  const activeFeature = actions.clean(ctx.activeFeature, 40) || 'home';
  const contextLabel  = actions.clean(ctx.contextLabel, 60);
  const contextSummary = typeof ctx.contextSummary === 'string'
    ? ctx.contextSummary.trim().slice(0, MAX_CONTEXT_SUMMARY)
    : '';

  const recentTurns = Array.isArray(ctx.recentTurns)
    ? ctx.recentTurns
        .slice(-MAX_RECENT_TURNS)
        .map((t) => ({
          user:      actions.clean(t?.user, MAX_TURN_LENGTH),
          assistant: actions.clean(t?.assistant, MAX_TURN_LENGTH),
        }))
        .filter((t) => t.user || t.assistant)
    : [];

  const contextAgeSeconds = Number.isFinite(Number(ctx.contextAgeSeconds))
    ? Math.max(0, Number(ctx.contextAgeSeconds))
    : undefined;

  return { activeFeature, contextLabel, contextSummary, contextAgeSeconds, recentTurns };
}

// ── answerFromContext ─────────────────────────────────────────────
// Runs the contextual-QA prompt. Returns null when there is nothing
// stored to answer from.
async function answerFromContext(question, context) {
  if (!context.contextSummary) return null;

  const parsed = await gemini.generateJson(
    prompts.buildAnswerPrompt(question, context),
    GENERATION_CONFIG
  );

  if (!parsed) return null;

  const answer = actions.clean(parsed.answer, actions.LIMITS.answer);
  const needsNewImage = parsed.needsNewImage === true || !answer;

  return {
    answer,
    needsNewImage,
    confidence: Math.min(1, Math.max(0, Number(parsed.confidence ?? 0.8))),
  };
}

function clarification(context, speechOverride) {
  const isHomeLike = !NEEDS_CAPTURE_SPEECH[context.activeFeature];

  const speech =
    speechOverride ||
    NEEDS_CAPTURE_SPEECH[context.activeFeature] ||
    (isHomeLike ? HOME_CAPABILITIES : DEFAULT_NEEDS_CAPTURE);

  return { type: 'clarification', action: ACTIONS.UNKNOWN, speech };
}

// ─────────────────────────────────────────────────────────────────
// POST /api/assistant/command
// ─────────────────────────────────────────────────────────────────
exports.handleCommand = async (req, res) => {
  try {
    const command = actions.clean(req.body?.command, MAX_COMMAND_LENGTH);

    if (!command) {
      return res.status(400).json({ success: false, error: 'Command is required.', code: 'MISSING_COMMAND' });
    }

    const context = sanitizeContext(req.body?.context);

    console.log(`[Assistant] command="${command}" | screen=${context.activeFeature} | context=${context.contextSummary.length} chars`);

    const parsed    = await gemini.generateJson(prompts.buildIntentPrompt(command, context), GENERATION_CONFIG);
    const validated = actions.validateAction(parsed);

    // ── Follow-up question: answer it from stored context ─────────
    if (validated.action === ACTIONS.ASK_CONTEXTUAL_QUESTION) {
      const question = validated.question || command;

      if (!context.contextSummary) {
        return res.status(200).json({ success: true, data: clarification(context) });
      }

      const answered = await answerFromContext(question, context);

      if (!answered || answered.needsNewImage) {
        return res.status(200).json({
          success: true,
          data: clarification(
            context,
            NEEDS_CAPTURE_SPEECH[context.activeFeature]
              ? `I can't answer that from what I have. ${NEEDS_CAPTURE_SPEECH[context.activeFeature]}`
              : undefined
          ),
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          type:       'answer',
          action:     ACTIONS.ASK_CONTEXTUAL_QUESTION,
          question,
          answer:     answered.answer,
          speech:     answered.answer,
          confidence: answered.confidence,
        },
      });
    }

    // ── Unknown command ───────────────────────────────────────────
    if (validated.action === ACTIONS.UNKNOWN) {
      return res.status(200).json({
        success: true,
        data: {
          type:   'clarification',
          action: ACTIONS.UNKNOWN,
          speech: validated.speech || DEFAULT_SPEECH[ACTIONS.UNKNOWN],
        },
      });
    }

    // ── Everything else: a validated, executable action ───────────
    const isNavigation =
      validated.action === ACTIONS.OPEN_FEATURE ||
      validated.action === ACTIONS.GO_HOME ||
      validated.action === ACTIONS.FIND_OBJECT ||
      validated.action === ACTIONS.START_VOLUNTEER_HELP ||
      validated.action === ACTIONS.EMERGENCY_SOS;

    const speech =
      validated.speech ||
      (validated.action === ACTIONS.OPEN_FEATURE ? FEATURE_SPEECH[validated.target] : '') ||
      DEFAULT_SPEECH[validated.action] ||
      '';

    return res.status(200).json({
      success: true,
      data: { ...validated, type: isNavigation ? 'navigation' : 'action', speech },
    });

  } catch (err) {
    const { status, code, message } = gemini.classifyGeminiError(err);
    console.error(`[Assistant] command error [${code}] ${message}`);
    if (status === 500) console.error(err.stack);

    return res.status(status).json({
      success: false,
      error:   message,
      code,
      data: {
        type:   'error',
        action: ACTIONS.UNKNOWN,
        speech: code === 'RATE_LIMIT'
          ? 'I am getting too many requests right now. Please wait a moment and try again.'
          : 'I could not reach the assistant service. Please try again.',
      },
    });
  }
};

// ─────────────────────────────────────────────────────────────────
// POST /api/assistant/ask
// Direct contextual question answering — used when the client already
// knows the utterance is a follow-up and skips intent detection.
// ─────────────────────────────────────────────────────────────────
exports.handleQuestion = async (req, res) => {
  try {
    const question = actions.clean(req.body?.question, MAX_COMMAND_LENGTH);

    if (!question) {
      return res.status(400).json({ success: false, error: 'Question is required.', code: 'MISSING_QUESTION' });
    }

    const context = sanitizeContext(req.body?.context);
    const answered = await answerFromContext(question, context);

    if (!answered || answered.needsNewImage) {
      return res.status(200).json({ success: true, data: clarification(context) });
    }

    return res.status(200).json({
      success: true,
      data: {
        type:       'answer',
        action:     ACTIONS.ASK_CONTEXTUAL_QUESTION,
        question,
        answer:     answered.answer,
        speech:     answered.answer,
        confidence: answered.confidence,
      },
    });

  } catch (err) {
    const { status, code, message } = gemini.classifyGeminiError(err);
    console.error(`[Assistant] ask error [${code}] ${message}`);

    return res.status(status).json({
      success: false,
      error:   message,
      code,
      data: {
        type:   'error',
        action: ACTIONS.UNKNOWN,
        speech: 'I could not answer that right now. Please try again.',
      },
    });
  }
};

// ─────────────────────────────────────────────────────────────────
// GET /api/assistant/actions
// Lets the client verify it shares the same whitelist as the server.
// ─────────────────────────────────────────────────────────────────
exports.listActions = (req, res) => {
  res.json({
    success: true,
    data: {
      actions:  actions.ALLOWED_ACTIONS,
      features: actions.FEATURE_TARGETS,
    },
  });
};
