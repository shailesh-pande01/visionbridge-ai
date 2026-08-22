import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import VoiceController from './VoiceController';
import { AssistantProvider } from './AssistantContext';
import { splitOnWakeWord, matchFastPath, ACTIONS } from './actions';

global.IS_REACT_ACT_ENVIRONMENT = true;

describe('Actions & Wake-word logic', () => {
  test('splitOnWakeWord correctly detects wake words and extracts commands', () => {
    expect(splitOnWakeWord('hey vision read this menu')).toEqual({ command: 'read this menu' });
    expect(splitOnWakeWord('vision go home')).toEqual({ command: 'go home' });
    expect(splitOnWakeWord('vision')).toEqual({ command: '' });
    expect(splitOnWakeWord('okay vision describe my surroundings')).toEqual({ command: 'describe my surroundings' });
    expect(splitOnWakeWord('just talking about something')).toBeNull();
  });

  test('matchFastPath correctly matches fast-path actions', () => {
    expect(matchFastPath('go home')?.action).toBe(ACTIONS.GO_HOME);
    expect(matchFastPath('emergency')?.action).toBe(ACTIONS.EMERGENCY_SOS);
    expect(matchFastPath('capture')?.action).toBe(ACTIONS.CAPTURE_IMAGE);
    expect(matchFastPath('say again')?.action).toBe(ACTIONS.REPEAT_LAST);
  });
});

describe('VoiceController Right-Click Trigger & Voice Recognition Flow', () => {
  let mockRecognitionInstance;
  let recognitionConstructorCount;
  let container;
  let root;
  let activeUtterance = null;

  beforeEach(() => {
    jest.useFakeTimers();

    activeUtterance = null;
    window.speechSynthesis = {
      speak: jest.fn().mockImplementation((utterance) => {
        activeUtterance = utterance;
        if (utterance.onstart) utterance.onstart();
        setTimeout(() => {
          if (utterance.onend) utterance.onend();
        }, 50);
      }),
      cancel: jest.fn().mockImplementation(() => {
        if (activeUtterance && activeUtterance.onend) {
          activeUtterance.onend();
        }
      }),
    };

    global.SpeechSynthesisUtterance = jest.fn().mockImplementation((text) => ({
      text,
      rate: 1,
      pitch: 1,
      onstart: null,
      onend: null,
      onerror: null,
    }));

    recognitionConstructorCount = 0;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    mockRecognitionInstance = {
      continuous: false,
      interimResults: false,
      lang: '',
      start: jest.fn(function () {
        if (this.onstart) this.onstart();
      }),
      abort: jest.fn(),
      stop: jest.fn(),
      onstart: null,
      onend: null,
      onerror: null,
      onresult: null,
    };

    window.SpeechRecognition = jest.fn().mockImplementation(() => {
      recognitionConstructorCount += 1;
      return mockRecognitionInstance;
    });
    window.webkitSpeechRecognition = window.SpeechRecognition;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  test('Right-click triggers preventDefault and activates voice recognition prompt', () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <AssistantProvider>
            <div>
              <div id="target-area">Click target</div>
              <VoiceController />
            </div>
          </AssistantProvider>
        </MemoryRouter>
      );
    });

    act(() => {
      jest.advanceTimersByTime(600);
    });

    const initialConstructors = recognitionConstructorCount;

    const contextMenuEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
    });
    const preventDefaultSpy = jest.spyOn(contextMenuEvent, 'preventDefault');

    act(() => {
      window.dispatchEvent(contextMenuEvent);
    });

    // 1. Context menu must be prevented
    expect(preventDefaultSpy).toHaveBeenCalled();
    // 2. Wake-word prompt "Yes?" should be spoken
    expect(window.speechSynthesis.speak).toHaveBeenCalled();
    // 3. No duplicate recognition instance created if already running
    expect(recognitionConstructorCount).toBe(initialConstructors);
  });

  test('Right-click followed by speech without "Vision" captures the command', () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <AssistantProvider>
            <VoiceController />
          </AssistantProvider>
        </MemoryRouter>
      );
    });

    act(() => {
      jest.advanceTimersByTime(600);
    });

    // Simulate right-click
    act(() => {
      const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      window.dispatchEvent(e);
    });

    // Advance time for TTS "Yes?" to finish speaking
    act(() => {
      jest.advanceTimersByTime(100);
    });

    // Simulate speaking "read this menu" directly without "Vision"
    act(() => {
      if (mockRecognitionInstance.onresult) {
        mockRecognitionInstance.onresult({
          results: [
            [{ transcript: 'read this menu' }]
          ]
        });
      }
    });

    // Verify transcript appears in DOM
    expect(container.textContent).toContain('read this menu');
  });

  test('Spoken "Vision, read this" wake-word still works as expected', () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <AssistantProvider>
            <VoiceController />
          </AssistantProvider>
        </MemoryRouter>
      );
    });

    act(() => {
      jest.advanceTimersByTime(600);
    });

    act(() => {
      if (mockRecognitionInstance.onresult) {
        mockRecognitionInstance.onresult({
          results: [
            [{ transcript: 'vision read this menu' }]
          ]
        });
      }
    });

    expect(container.textContent).toContain('read this menu');
  });

  test('Unmounting VoiceController removes global contextmenu listener', () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <AssistantProvider>
            <VoiceController />
          </AssistantProvider>
        </MemoryRouter>
      );
    });

    act(() => {
      jest.advanceTimersByTime(600);
    });

    act(() => {
      root.unmount();
    });

    const contextMenuEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
    });
    const preventDefaultSpy = jest.spyOn(contextMenuEvent, 'preventDefault');

    window.dispatchEvent(contextMenuEvent);

    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });
});
