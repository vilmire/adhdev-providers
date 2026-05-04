'use strict';

const parseApproval = require('./parse_approval.js');
const { cleanAnsi } = require('./helpers.js');
const { getScreen, getBufferScreen, getTailScreen, isPromptLineAt } = require('./screen_helpers.js');

function compactStatusText(text) {
  const source = cleanAnsi(text || '');
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return lines.slice(-20).join('\n');
}

function isPromptAdjacentStatusLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return false;
  if (!/(?:\.\.\.|…)/.test(trimmed)) return false;
  if (/^(?:❯|⚕\s*❯|●|╭─|╰─|[┊│])/.test(trimmed)) return false;
  if (/Type your message|Resume this session with:|Session:/i.test(trimmed)) return false;
  if (!/ing(?:\.\.\.|…)/i.test(trimmed)) return false;
  if (trimmed.length <= 64 && /(?:\.\.\.|…)\s*$/.test(trimmed)) return true;
  return /(?:\.\.\.|…)\s+.*(?:\b\d+(?:\.\d+)?[sm]\b|[↑↓]|tokens?|recall:|gpt-[\w.-]+|\[[^\]]+\]|%)/i.test(trimmed);
}

function hasPromptAdjacentEllipsisStatus(screen) {
  const linesAbovePrompt = Array.isArray(screen?.linesAbovePrompt) ? screen.linesAbovePrompt : [];
  return linesAbovePrompt
    .map((line) => String(line?.trimmed || line?.text || line || '').trim())
    .filter(Boolean)
    .slice(-5)
    .some(isPromptAdjacentStatusLine);
}

function getPromptLineText(screen) {
  const index = Number.isInteger(screen?.promptLineIndex) ? screen.promptLineIndex : -1;
  if (index < 0 || !Array.isArray(screen?.lines)) return '';
  return String(screen.lines[index]?.trimmed || screen.lines[index]?.text || '').trim();
}

function hasPromptLine(screen) {
  const index = Number.isInteger(screen?.promptLineIndex) ? screen.promptLineIndex : -1;
  return index >= 0 && Array.isArray(screen?.lines) && isPromptLineAt(screen.lines, index);
}

function isInterruptInputPromptText(line) {
  const text = String(line || '').replace(/\s+/g, ' ').trim();
  if (!text) return false;
  return /type a message\b.*Enter to interrupt, Ctrl\+C to cancel/i.test(text)
    || /Enter to interrupt, Ctrl\+C to cancel/i.test(text)
    || /\bmsg\s*=\s*interrupt\b.*\bCtrl\+C\s+cancel\b/i.test(text);
}

function hasInterruptInputPromptLine(screen) {
  const index = Number.isInteger(screen?.promptLineIndex) ? screen.promptLineIndex : -1;
  if (index < 0 || !Array.isArray(screen?.lines) || !isPromptLineAt(screen.lines, index)) return false;
  const promptText = String(screen.lines[index]?.trimmed || screen.lines[index]?.text || '').trim();
  return isInterruptInputPromptText(promptText);
}

function hasPromptReadyRegion(screen) {
  if (!hasPromptLine(screen)) return false;
  const lines = Array.isArray(screen?.lines) ? screen.lines : [];
  const promptIndex = screen.promptLineIndex;
  const below = lines.slice(promptIndex + 1)
    .map((line) => String(line?.trimmed || line?.text || '').trim())
    .filter(Boolean);
  return below.every((line) => /^[-─━═╭╮╰╯│┌┐└┘├┤┬┴┼]+$/.test(line)
    || /Type your message|Resume this session with:|Session:|Enter to interrupt, Ctrl\+C to cancel/i.test(line)
    || isInterruptInputPromptText(line));
}

function buildStatusSignals(screen) {
  const text = compactStatusText(screen?.text || '');
  const lines = text.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const lastMatchingIndex = (predicate) => {
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      if (predicate(lines[index])) return index;
    }
    return -1;
  };

  const hasEllipsisStatusAbovePrompt = hasPromptAdjacentEllipsisStatus(screen);
  const promptLineText = getPromptLineText(screen);
  const hasBarePrompt = /^❯\s*$/.test(promptLineText);
  const hasPrompt = /Type your message or \/help for commands/i.test(text)
    || /Resume this session with:/i.test(text);
  const hasPromptReady = hasPromptReadyRegion(screen);
  const hasInitializing = /Initializing agent/i.test(text);
  const hasInterruptInputPrompt = hasInterruptInputPromptLine(screen);
  const hasLiveUserTurn = /(?:^|\n)●\s+/.test(text);
  const hasLiveToolActivity = /(?:^|\n)[┊│]\s*(?:\p{Emoji}\uFE0F?|\$)/u.test(text);
  const hasLiveTurnMarkers = hasLiveUserTurn || hasLiveToolActivity;
  const lastPromptIndex = lastMatchingIndex((line) => /^❯\s*$/.test(line));
  const lastAssistantStartIndex = lastMatchingIndex((line) => /^╭─\s*⚕\s*Hermes/i.test(line));
  const lastAssistantEndIndex = lastMatchingIndex((line) => /^╰─/.test(line));
  const lastGeneratingIndex = lastMatchingIndex((line) => /Initializing agent|Enter to interrupt, Ctrl\+C to cancel/i.test(line)
    || isInterruptInputPromptText(line));
  const finishedAssistantVisible = lastAssistantEndIndex >= 0
    && lastPromptIndex > lastAssistantEndIndex
    && (lastGeneratingIndex < 0 || lastGeneratingIndex <= lastAssistantEndIndex);
  const hasOpenAssistantBox = lastAssistantStartIndex >= 0
    && lastAssistantStartIndex > lastAssistantEndIndex;

  return {
    text,
    hasBarePrompt,
    hasPrompt,
    hasPromptReady,
    hasInitializing,
    hasInterruptInputPrompt,
    hasLiveTurnMarkers,
    hasEllipsisStatusAbovePrompt,
    finishedAssistantVisible,
    hasOpenAssistantBox,
  };
}

module.exports = function detectStatus(input) {
  const currentScreen = getScreen(input);
  const bufferScreen = getBufferScreen(input);
  const tailScreen = getTailScreen(input);
  const current = buildStatusSignals(currentScreen);
  if (!current.text.trim()) return 'idle';

  const approvalModal = parseApproval({
    screenText: currentScreen?.text || input?.screenText || '',
    buffer: bufferScreen?.text || input?.buffer || '',
    tail: tailScreen?.text || input?.tail || input?.recentBuffer || '',
    screen: currentScreen,
    bufferScreen,
    tailScreen,
  });
  if (approvalModal) {
    return 'waiting_approval';
  }

  if (current.hasInterruptInputPrompt) {
    return 'generating';
  }

  if (current.finishedAssistantVisible) {
    return 'idle';
  }

  // When the current viewport shows a bare ❯ prompt with no active "Enter to interrupt",
  // stale interrupt signals in the recent tail/buffer are scroll artifacts from the
  // completed turn and must not keep the status in 'generating' indefinitely.
  const currentConfirmsNoInterrupt = current.hasBarePrompt && !current.hasInterruptInputPrompt;
  const recentRawSignals = [tailScreen, bufferScreen]
    .map(buildStatusSignals)
    .some((signals) => signals.hasInitializing
      || (signals.hasInterruptInputPrompt && !currentConfirmsNoInterrupt)
      || signals.hasLiveTurnMarkers
      || signals.hasEllipsisStatusAbovePrompt
      || signals.hasOpenAssistantBox);

  if (current.hasOpenAssistantBox) {
    return 'generating';
  }

  if (current.hasEllipsisStatusAbovePrompt) {
    return 'generating';
  }

  if ((current.hasBarePrompt || current.hasPromptReady || current.hasPrompt)
      && !current.hasInitializing
      && !current.hasInterruptInputPrompt
      && !current.hasLiveTurnMarkers
      && !current.hasEllipsisStatusAbovePrompt) {
    if (recentRawSignals) {
      return 'generating';
    }
    return 'idle';
  }

  if (current.hasInitializing || current.hasInterruptInputPrompt || current.hasLiveTurnMarkers || current.hasEllipsisStatusAbovePrompt) {
    return 'generating';
  }

  return 'generating';
};
