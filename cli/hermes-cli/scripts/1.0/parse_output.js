'use strict';

const detectStatus = require('./detect_status.js');
const parseApproval = require('./parse_approval.js');
const {
  extractCurrentModel,
  extractProviderSessionId,
} = require('./helpers.js');
const {
  normalize,
  extractHistoryState,
  stripAssistantFooterNoise,
  restoreAssistantCodeFences,
  stripTransientPromptSuffix,
  stripActivityTransientSuffix,
  stripRepeatedStandardActivityPrefixBlocks,
  shouldReflowAssistantLines,
  joinWrappedAssistantLines,
  parseMessages,
} = require('./terminal_tokenizer.js');
const {
  toCandidates,
  candidatesToLegacyMessages,
} = require('./source_classifier.js');

const normalizedMessageCache = new WeakMap();
const comparableContentCache = new WeakMap();
const compactComparableContentCache = new WeakMap();

function stripUserPromptTransientSuffix(text) {
  const source = String(text || '').trim();
  if (!source) return '';

  let stripped = source
    .replace(/\s+[⚡✦✧*·•]?\s*Sending after interrupt:\s*(['"]).*?\1\s*$/iu, '')
    .replace(/\s+[^\r\n]{0,64}(?:synthesizing|ruminating|reasoning|thinking|processing|working|contemplating|brainstorming)(?:\.\.\.|…)?\s*$/iu, '')
    .trim();

  const normalized = stripTransientPromptSuffix(stripped);
  if (normalized) return normalized;
  if (stripped && /^[^\p{L}\p{N}]+$/u.test(stripped)) return stripped;
  return normalized;
}

function normalizeMessage(message) {
  if (message && typeof message === 'object') {
    const cached = normalizedMessageCache.get(message);
    if (cached
      && cached.role === message.role
      && cached.kind === message.kind
      && cached.senderName === message.senderName
      && cached.content === message.content
      && cached.id === message.id
      && cached.bubbleId === message.bubbleId
      && cached.providerUnitKey === message.providerUnitKey
      && cached._turnKey === message._turnKey
      && cached.bubbleState === message.bubbleState
      && cached.meta === message.meta) {
      return cached.normalized;
    }
  }
  const role = message?.role === 'user' ? 'user' : 'assistant';
  const kind = typeof message?.kind === 'string' && message.kind ? message.kind : 'standard';
  const rawContent = String(message?.content || '').trim();
  const normalizedContent = role === 'user'
    ? stripUserPromptTransientSuffix(rawContent)
    : (role === 'assistant' && (kind === 'tool' || kind === 'terminal')
        ? stripActivityTransientSuffix(rawContent)
        : rawContent);
  const normalized = {
    role,
    kind,
    senderName: typeof message?.senderName === 'string' && message.senderName ? message.senderName : undefined,
    content: role === 'assistant' && kind === 'standard'
      ? restoreAssistantCodeFences(stripAssistantFooterNoise(stripRepeatedStandardActivityPrefixBlocks(normalizedContent)))
      : normalizedContent,
  };
  if (typeof message?.id === 'string' && message.id) normalized.id = message.id;
  if (typeof message?.bubbleId === 'string' && message.bubbleId) normalized.bubbleId = message.bubbleId;
  if (typeof message?.providerUnitKey === 'string' && message.providerUnitKey) normalized.providerUnitKey = message.providerUnitKey;
  if (typeof message?._turnKey === 'string' && message._turnKey) normalized._turnKey = message._turnKey;
  if (typeof message?.bubbleState === 'string' && message.bubbleState) normalized.bubbleState = message.bubbleState;
  if (message?.meta && typeof message.meta === 'object' && !Array.isArray(message.meta)) {
    normalized.meta = { ...message.meta };
  }
  if (message && typeof message === 'object') {
    normalizedMessageCache.set(message, {
      role: message.role,
      kind: message.kind,
      senderName: message.senderName,
      content: message.content,
      id: message.id,
      bubbleId: message.bubbleId,
      providerUnitKey: message.providerUnitKey,
      _turnKey: message._turnKey,
      bubbleState: message.bubbleState,
      meta: message.meta,
      normalized,
    });
  }
  return normalized;
}

function isLikelyTruncatedDuplicate(longer, shorter, options = {}) {
  if (!longer || !shorter) return false;
  if (longer.length <= shorter.length) return false;
  const minLength = typeof options.minLength === 'number' ? options.minLength : 48;
  if (shorter.length < minLength) return false;
  return longer.startsWith(shorter) || longer.includes(shorter);
}

function getComparableContent(message) {
  if (message && typeof message === 'object') {
    const cached = comparableContentCache.get(message);
    if (cached
      && cached.role === message.role
      && cached.kind === message.kind
      && cached.senderName === message.senderName
      && cached.content === message.content) {
      return cached.comparable;
    }
  }
  const normalized = normalizeMessage(message);
  const rawContent = String(normalized.content || '').trim();
  if (!rawContent) return '';

  let comparable;
  if (normalized.role === 'assistant' && normalized.kind === 'standard') {
    const contentLines = rawContent
      .split(/\r?\n/)
      .map(normalize)
      .filter(Boolean);
    const prose = shouldReflowAssistantLines(contentLines)
      ? joinWrappedAssistantLines(contentLines)
      : contentLines.join('\n');
    comparable = prose.replace(/\s+/g, ' ').trim();
  } else {
    comparable = rawContent.replace(/\s+/g, ' ').trim();
  }

  if (message && typeof message === 'object') {
    comparableContentCache.set(message, {
      role: message.role,
      kind: message.kind,
      senderName: message.senderName,
      content: message.content,
      comparable,
    });
  }
  return comparable;
}

function getCompactComparableContent(message) {
  if (message && typeof message === 'object') {
    const cached = compactComparableContentCache.get(message);
    if (cached
      && cached.role === message.role
      && cached.kind === message.kind
      && cached.senderName === message.senderName
      && cached.content === message.content) {
      return cached.compactComparable;
    }
  }
  const compactComparable = getComparableContent(message).replace(/\s+/g, '');
  if (message && typeof message === 'object') {
    compactComparableContentCache.set(message, {
      role: message.role,
      kind: message.kind,
      senderName: message.senderName,
      content: message.content,
      compactComparable,
    });
  }
  return compactComparable;
}

const LINE_ELISION_MARKER_RE = /\s*\.{3}\s*\(\+\d+\s*more\s*lines\)\s*/iu;

function isLikelyLineElidedDuplicate(longer, shorter, options = {}) {
  if (!longer || !shorter) return false;
  if (longer.length <= shorter.length) return false;
  const minLength = typeof options.minLength === 'number' ? options.minLength : 48;
  if (shorter.length < minLength) return false;

  const parts = String(shorter).split(LINE_ELISION_MARKER_RE);
  if (parts.length < 2) return false;
  const prefix = parts[0].trim();
  const suffix = parts.slice(1).join(' ').trim();
  const edgeMinLength = Math.min(32, Math.max(12, Math.floor(minLength / 2)));
  if (prefix.length < edgeMinLength || suffix.length < edgeMinLength) return false;

  const prefixIndex = String(longer).indexOf(prefix);
  if (prefixIndex < 0) return false;
  const suffixIndex = String(longer).indexOf(suffix, prefixIndex + prefix.length);
  return suffixIndex >= 0;
}

function comparableContentsMatch(left, right, minLength) {
  return left === right
    || isLikelyTruncatedDuplicate(left, right, { minLength })
    || isLikelyTruncatedDuplicate(right, left, { minLength })
    || isLikelyLineElidedDuplicate(left, right, { minLength })
    || isLikelyLineElidedDuplicate(right, left, { minLength });
}

// Compatibility fallback only: source/turn scoping should prevent most replayed
// final answers from reaching content comparison. Keep this narrow for terminal
// redraw residue variants until the reconciler owns source boundaries.
const SMALL_RESIDUE_RE = /^[\p{N}\p{P}\p{S}smhd]*$/iu;
const DURATION_RESIDUE_RE = /\d+(?:\.\d+)?[smhd]/iu;

function analyzeSmallResidueDuplicate(left, right) {
  const a = String(left || '').replace(/\s+/g, '');
  const b = String(right || '').replace(/\s+/g, '');
  const shorterLength = Math.min(a.length, b.length);
  const longerLength = Math.max(a.length, b.length);
  if (shorterLength < 160 || longerLength === 0) return null;

  let indexA = 0;
  let indexB = 0;
  let commonLength = 0;
  let residueA = '';
  let residueB = '';
  const maxTotalResidue = 24;
  const maxResidueRun = 8;

  const appendResidue = (side, fragment) => {
    if (!fragment || !SMALL_RESIDUE_RE.test(fragment)) return false;
    if (side === 'a') residueA += fragment;
    else residueB += fragment;
    return residueA.length + residueB.length <= maxTotalResidue;
  };

  while (indexA < a.length && indexB < b.length) {
    if (a[indexA] === b[indexB]) {
      indexA += 1;
      indexB += 1;
      commonLength += 1;
      continue;
    }

    let aligned = false;
    for (let skip = 1; skip <= maxResidueRun && indexA + skip <= a.length; skip += 1) {
      const fragment = a.slice(indexA, indexA + skip);
      if (!SMALL_RESIDUE_RE.test(fragment)) break;
      if (a[indexA + skip] === b[indexB] && appendResidue('a', fragment)) {
        indexA += skip;
        aligned = true;
        break;
      }
    }
    if (aligned) continue;

    for (let skip = 1; skip <= maxResidueRun && indexB + skip <= b.length; skip += 1) {
      const fragment = b.slice(indexB, indexB + skip);
      if (!SMALL_RESIDUE_RE.test(fragment)) break;
      if (a[indexA] === b[indexB + skip] && appendResidue('b', fragment)) {
        indexB += skip;
        aligned = true;
        break;
      }
    }
    if (!aligned) return null;
  }

  if (indexA < a.length && !appendResidue('a', a.slice(indexA))) return null;
  if (indexB < b.length && !appendResidue('b', b.slice(indexB))) return null;

  const residueLength = residueA.length + residueB.length;
  if (residueLength === 0) return { prefer: 'shorter' };
  if (residueLength > maxTotalResidue || commonLength / longerLength < 0.985) return null;

  const onlyLeftHasResidue = Boolean(residueA) && !residueB;
  const onlyRightHasResidue = Boolean(residueB) && !residueA;
  const durationResidueSide = DURATION_RESIDUE_RE.test(residueA)
    ? 'left'
    : (DURATION_RESIDUE_RE.test(residueB) ? 'right' : '');
  if (durationResidueSide === 'left' && onlyLeftHasResidue) return { prefer: 'left' };
  if (durationResidueSide === 'right' && onlyRightHasResidue) return { prefer: 'right' };
  return { prefer: 'shorter' };
}

function assistantStandardLooseMatchPreference(left, right) {
  const aComparable = getComparableContent(left);
  const bComparable = getComparableContent(right);
  const comparableMatch = analyzeSmallResidueDuplicate(aComparable, bComparable);
  if (comparableMatch) return comparableMatch.prefer;
  const compactMatch = analyzeSmallResidueDuplicate(getCompactComparableContent(left), getCompactComparableContent(right));
  return compactMatch ? compactMatch.prefer : '';
}

function assistantStandardContentsLooselyMatch(left, right) {
  return Boolean(assistantStandardLooseMatchPreference(left, right));
}

function messagesMatch(left, right) {
  const a = normalizeMessage(left);
  const b = normalizeMessage(right);
  if (!a.content || !b.content || a.role !== b.role || a.kind !== b.kind) return false;
  // Hermes can expose the same submitted prompt through three sources at once:
  // committed adapter history, truncated terminal scrollback, and a fuller visible
  // screen prompt. Use the same short-prefix tolerance as assistant prose for
  // standard user prompts so those variants merge into the most complete prompt.
  const duplicateMinLength = a.kind === 'standard'
    ? (a.role === 'assistant' || a.role === 'user' ? 8 : 48)
    : 48;
  const aComparable = getComparableContent(a);
  const bComparable = getComparableContent(b);
  if (comparableContentsMatch(aComparable, bComparable, duplicateMinLength)) return true;
  if (a.role === 'assistant' && a.kind === 'standard' && assistantStandardContentsLooselyMatch(a, b)) return true;
  if (a.kind !== 'standard' || b.kind !== 'standard') return false;
  const aCompactComparable = getCompactComparableContent(a);
  const bCompactComparable = getCompactComparableContent(b);
  return comparableContentsMatch(aCompactComparable, bCompactComparable, duplicateMinLength);
}

function withMergedMessageIdentity(preferred, fallback) {
  const result = {
    role: preferred.role,
    kind: preferred.kind || fallback.kind,
    senderName: preferred.senderName || fallback.senderName,
    content: preferred.content,
  };
  for (const key of ['id', 'bubbleId', 'providerUnitKey', '_turnKey', 'bubbleState']) {
    if (preferred[key]) result[key] = preferred[key];
    else if (fallback[key]) result[key] = fallback[key];
  }
  if (preferred.meta && typeof preferred.meta === 'object') result.meta = { ...preferred.meta };
  else if (fallback.meta && typeof fallback.meta === 'object') result.meta = { ...fallback.meta };
  return result;
}

function chooseMoreCompleteMessage(left, right) {
  const a = normalizeMessage(left);
  const b = normalizeMessage(right);
  const aComparable = getComparableContent(a);
  const bComparable = getComparableContent(b);
  const aCompactComparable = getCompactComparableContent(a);
  const bCompactComparable = getCompactComparableContent(b);

  if ((aComparable && aComparable === bComparable) || (aCompactComparable && aCompactComparable === bCompactComparable)) {
    const aNewlines = (a.content.match(/\n/g) || []).length;
    const bNewlines = (b.content.match(/\n/g) || []).length;
    const aParagraphBreaks = (a.content.match(/\n\s*\n/g) || []).length;
    const bParagraphBreaks = (b.content.match(/\n\s*\n/g) || []).length;
    const preferred = aParagraphBreaks !== bParagraphBreaks
      ? (aParagraphBreaks > bParagraphBreaks ? a : b)
      : (bNewlines < aNewlines ? b : a);
    const fallback = preferred === a ? b : a;
    return withMergedMessageIdentity(preferred, fallback);
  }

  const loosePreference = a.role === 'assistant' && a.kind === 'standard'
    ? assistantStandardLooseMatchPreference(a, b)
    : '';
  if (loosePreference) {
    let preferred;
    if (loosePreference === 'left') preferred = a;
    else if (loosePreference === 'right') preferred = b;
    else preferred = aComparable.length <= bComparable.length ? a : b;
    const fallback = preferred === a ? b : a;
    return withMergedMessageIdentity(preferred, fallback);
  }

  const preferred = bComparable.length > aComparable.length ? b : a;
  const fallback = preferred === a ? b : a;
  return withMergedMessageIdentity(preferred, fallback);
}

function createApprovalMessage(activeModal) {
  const message = String(activeModal?.message || '').trim();
  const buttons = Array.isArray(activeModal?.buttons)
    ? activeModal.buttons.map((button) => String(button || '').trim()).filter(Boolean)
    : [];
  const lines = ['Approval requested'];
  if (message) lines.push(message);
  if (buttons.length > 0) lines.push(buttons.map((label) => `[${label}]`).join(' '));
  return {
    role: 'assistant',
    kind: 'system',
    senderName: 'System',
    content: lines.join('\n'),
  };
}

function isStreamLikeStatus(status) {
  return status === 'generating' || status === 'streaming' || status === 'long_generating';
}

function isActivityTranscriptMessage(message) {
  const normalized = normalizeMessage(message);
  const kind = normalized.kind || 'standard';
  return normalized.role === 'assistant' && (kind === 'tool' || kind === 'terminal') && Boolean(normalized.content);
}

function dedupeMessages(messages) {
  const next = [];
  for (const rawMessage of messages) {
    const message = normalizeMessage(rawMessage);
    if (!message.content) continue;
    const prev = next[next.length - 1];
    if (prev && messagesMatch(prev, message)) {
      next[next.length - 1] = chooseMoreCompleteMessage(prev, message);
      continue;
    }
    next.push(message);
  }
  return next.map((message, index) => ({
    ...(message.id ? { id: message.id } : { id: `msg_${index}` }),
    role: message.role,
    content: message.content,
    index,
    kind: message.kind || 'standard',
    ...(message.senderName ? { senderName: message.senderName } : {}),
    ...(message.bubbleId ? { bubbleId: message.bubbleId } : {}),
    ...(message.providerUnitKey ? { providerUnitKey: message.providerUnitKey } : {}),
    ...(message._turnKey ? { _turnKey: message._turnKey } : {}),
    ...(message.bubbleState ? { bubbleState: message.bubbleState } : {}),
    ...(message.meta && typeof message.meta === 'object' ? { meta: { ...message.meta } } : {}),
  }));
}

function isStableAssistantAnswer(message) {
  const normalized = normalizeMessage(message);
  return normalized.role === 'assistant'
    && normalized.kind === 'standard'
    && String(normalized.content || '').length >= 80;
}

function stableAssistantAnswerKey(message) {
  if (!isStableAssistantAnswer(message)) return '';
  const normalized = normalizeMessage(message);
  return getCompactComparableContent(normalized) || getComparableContent(normalized);
}

function compactIndexToRawIndex(rawText, compactIndex) {
  const source = String(rawText || '');
  let compactCursor = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (/\s/u.test(source[index])) continue;
    if (compactCursor === compactIndex) return index;
    compactCursor += 1;
  }
  return -1;
}

function trimStableAssistantTextFromActivityMessage(message, stableAssistant) {
  const normalized = normalizeMessage(message);
  const kind = normalized.kind || 'standard';
  if (normalized.role !== 'assistant' || (kind !== 'terminal' && kind !== 'tool') || !isStableAssistantAnswer(stableAssistant)) {
    return normalized;
  }

  const stableCompact = getCompactComparableContent(stableAssistant);
  if (stableCompact.length < 16) return normalized;

  const rawContent = String(normalized.content || '');
  const rawCompact = rawContent.replace(/\s+/g, '');
  const compactIndex = rawCompact.indexOf(stableCompact);
  if (compactIndex <= 0) return normalized;

  const rawIndex = compactIndexToRawIndex(rawContent, compactIndex);
  if (rawIndex <= 0) return normalized;

  const trimmedContent = stripActivityTransientSuffix(rawContent.slice(0, rawIndex));
  if (!trimmedContent) return normalized;
  return {
    ...normalized,
    content: trimmedContent,
  };
}

function buildReplayMessageSignature(message) {
  const normalized = normalizeMessage(message);
  const content = getComparableContent(normalized) || getCompactComparableContent(normalized);
  if (!content) return '';
  return [
    normalized.role || '',
    normalized.kind || 'standard',
    normalized.senderName || '',
    content,
  ].join('\u0000');
}

function buildTurnPromptFingerprint(message) {
  const normalized = normalizeMessage(message);
  const compact = getCompactComparableContent(normalized) || getComparableContent(normalized);
  if (!compact) return '';
  return compact.slice(0, 24);
}

function replayComparableContentsMatch(left, right, minLength) {
  if (!left || !right) return false;
  if (left === right) return true;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length > right.length ? left : right;
  return shorter.length >= minLength && longer.startsWith(shorter);
}

function replayTurnMessagesMatch(leftTurnMessages, rightTurnMessages) {
  if (!Array.isArray(leftTurnMessages) || !Array.isArray(rightTurnMessages)) return false;
  let compareLength = leftTurnMessages.length;
  if (leftTurnMessages.length !== rightTurnMessages.length) {
    // A current-turn replay pass may already have dropped the repeated final
    // assistant answer after activity rows. Treat the remaining user/activity
    // prefix as the same replayed turn when the only missing tail is standard
    // assistant prose from the already-seen turn.
    if (rightTurnMessages.length >= leftTurnMessages.length) return false;
    const missingTail = leftTurnMessages.slice(rightTurnMessages.length);
    const onlyMissingStandardAssistantTail = missingTail.length > 0
      && missingTail.every((message) => {
        const normalized = normalizeMessage(message);
        return normalized.role === 'assistant' && (normalized.kind || 'standard') === 'standard';
      });
    if (!onlyMissingStandardAssistantTail) return false;
    compareLength = rightTurnMessages.length;
  }

  for (let index = 0; index < compareLength; index += 1) {
    const left = normalizeMessage(leftTurnMessages[index]);
    const right = normalizeMessage(rightTurnMessages[index]);
    const leftKind = left.kind || 'standard';
    const rightKind = right.kind || 'standard';
    if (left.role !== right.role || leftKind !== rightKind || (left.senderName || '') !== (right.senderName || '')) {
      return false;
    }

    const leftComparable = getCompactComparableContent(left) || getComparableContent(left);
    const rightComparable = getCompactComparableContent(right) || getComparableContent(right);
    if (!leftComparable || !rightComparable) return false;

    if (left.role === 'user') {
      if (!replayComparableContentsMatch(leftComparable, rightComparable, 24)) return false;
      continue;
    }

    if (left.role === 'assistant' && leftKind === 'standard') {
      if (!replayComparableContentsMatch(leftComparable, rightComparable, 80)) return false;
      continue;
    }

    if (leftComparable !== rightComparable) return false;
  }

  return true;
}

function isReplayedAssistantAnswerAfterStableAssistant(message, stableAnswer) {
  const normalized = normalizeMessage(message);
  const stable = normalizeMessage(stableAnswer);
  if (normalized.role !== 'assistant' || stable.role !== 'assistant') return false;
  if ((normalized.kind || 'standard') !== 'standard' || (stable.kind || 'standard') !== 'standard') return false;

  const content = getComparableContent(normalized);
  const stableContent = getComparableContent(stable);
  const compactContent = getCompactComparableContent(normalized);
  const stableCompactContent = getCompactComparableContent(stable);
  if (!content || !stableContent) return false;
  if (content === stableContent) return true;
  if (compactContent && stableCompactContent && compactContent === stableCompactContent) return true;
  if (assistantStandardContentsLooselyMatch(normalized, stable)) return true;

  const shorterLength = Math.min(content.length, stableContent.length);
  if (shorterLength >= 80 && (content.startsWith(stableContent) || stableContent.startsWith(content))) return true;

  const compactShorterLength = Math.min(compactContent.length, stableCompactContent.length);
  return compactShorterLength >= 80
    && (compactContent.startsWith(stableCompactContent) || stableCompactContent.startsWith(compactContent));
}

function isAssistantReplayAfterStableAssistant(merged, cursor, message) {
  if (!Array.isArray(merged) || cursor <= 0) return false;
  const stable = merged[cursor - 1];
  if (!isStableAssistantAnswer(stable)) return false;
  return isReplayedAssistantAnswerAfterStableAssistant(message, stable);
}

function collapseReplayedAssistantHistory(messages, options = {}) {
  const source = dedupeMessages(Array.isArray(messages) ? messages : [])
    .map(normalizeMessage)
    .filter((message) => message.content);
  const dropPriorStableAfterActivity = options.dropPriorStableAfterActivity !== false;
  const hasUserOrStandardAssistant = source.some((message) => (
    message.role === 'user' || (message.kind || 'standard') === 'standard'
  ));
  if (source.length >= 1000 && !hasUserOrStandardAssistant) {
    return source;
  }
  const collapsed = [];
  let stableAssistant = null;
  // Compatibility fallback only: this protects existing sessions where viewport
  // scrollback replays the prior final answer after a follow-up prompt. The
  // structural replacement is current-turn scoping before reconciliation.
  let stableAssistantBeforeCurrentUser = null;
  let currentTurnHasStandardAssistant = false;
  let currentTurnHasActivity = false;
  const seenStableAssistantAnswerKeys = new Set();
  const seenAssistantSignatures = new Set();
  const canUseReplaySignatureSet = source.length < 1000
    || hasUserOrStandardAssistant;

  for (let index = 0; index < source.length; index += 1) {
    const message = source[index];
    let normalized = normalizeMessage(message);
    if (normalized.role === 'user') {
      if (isStableAssistantAnswer(stableAssistant)) {
        stableAssistantBeforeCurrentUser = stableAssistant;
      }
      collapsed.push(normalized);
      stableAssistant = null;
      currentTurnHasStandardAssistant = false;
      currentTurnHasActivity = false;
      seenAssistantSignatures.clear();
      continue;
    }

    normalized = trimStableAssistantTextFromActivityMessage(normalized, stableAssistant);
    const stableReplayKey = stableAssistantAnswerKey(normalized);
    if (
      !currentTurnHasStandardAssistant
      && currentTurnHasActivity
      && dropPriorStableAfterActivity
      && stableReplayKey
      && seenStableAssistantAnswerKeys.has(stableReplayKey)
    ) {
      continue;
    }
    if (
      !currentTurnHasStandardAssistant
      && (!currentTurnHasActivity || dropPriorStableAfterActivity)
      && stableAssistantBeforeCurrentUser
      && isReplayedAssistantAnswerAfterStableAssistant(normalized, stableAssistantBeforeCurrentUser)
    ) {
      continue;
    }
    const replaySignature = canUseReplaySignatureSet && normalized.role === 'assistant'
      ? buildReplayMessageSignature(normalized)
      : '';
    if (replaySignature && seenAssistantSignatures.has(replaySignature)) {
      continue;
    }

    if (stableAssistant && isReplayedAssistantAnswerAfterStableAssistant(normalized, stableAssistant)) {
      continue;
    }

    collapsed.push(normalized);
    if (normalized.role === 'assistant' && (normalized.kind || 'standard') === 'standard') {
      currentTurnHasStandardAssistant = true;
      if (stableReplayKey) seenStableAssistantAnswerKeys.add(stableReplayKey);
    } else if (normalized.role === 'assistant') {
      currentTurnHasActivity = true;
    }
    if (replaySignature) seenAssistantSignatures.add(replaySignature);
    if (isStableAssistantAnswer(normalized)) {
      stableAssistant = normalized;
    }
  }

  return collapseRepeatedTurnReplays(dedupeMessages(collapsed));
}

function collapseRepeatedTurnReplays(messages) {
  const source = (Array.isArray(messages) ? messages : [])
    .map(normalizeMessage)
    .filter((message) => message.content);
  if (source.length < 2) return dedupeMessages(source);

  const collapsed = [];
  const seenReplayTurns = [];
  let index = 0;

  while (index < source.length) {
    const message = source[index];
    if (message.role !== 'user') {
      collapsed.push(message);
      index += 1;
      continue;
    }

    let nextIndex = index + 1;
    while (nextIndex < source.length && source[nextIndex].role !== 'user') {
      nextIndex += 1;
    }

    const turnMessages = source.slice(index, nextIndex);
    const hasReplayProneActivity = turnMessages.some((turnMessage) => (
      turnMessage.role === 'assistant'
      && turnMessage.kind
      && turnMessage.kind !== 'standard'
    ));
    const isReplayDuplicate = hasReplayProneActivity
      && seenReplayTurns.some((seenTurnMessages) => replayTurnMessagesMatch(seenTurnMessages, turnMessages));

    if (!isReplayDuplicate) {
      collapsed.push(...turnMessages);
      if (hasReplayProneActivity) seenReplayTurns.push(turnMessages);
    }

    index = nextIndex;
  }

  return dedupeMessages(collapsed);
}

function findActivityInsertionBeforeFinalAssistant(messages, cursor) {
  if (!Array.isArray(messages) || cursor < 0) return -1;
  for (let index = Math.max(0, cursor); index < messages.length; index += 1) {
    const message = normalizeMessage(messages[index]);
    if (message.role === 'user') return -1;
    if (message.role === 'assistant' && (message.kind || 'standard') === 'standard') return index;
  }
  return -1;
}

function mergeMessageHistories(baseMessages, currentMessages) {
  const merged = dedupeMessages(Array.isArray(baseMessages) ? baseMessages : [])
    .map(normalizeMessage)
    .filter((message) => message.content);
  const current = dedupeMessages(Array.isArray(currentMessages) ? currentMessages : [])
    .map(normalizeMessage)
    .filter((message) => message.content);
  if (merged.length === 0) return current;
  if (current.length === 0) return merged;

  let cursor = 0;
  for (const message of current) {
    let matchIndex = -1;
    for (let i = cursor; i < merged.length; i += 1) {
      if (messagesMatch(merged[i], message)) {
        matchIndex = i;
        break;
      }
    }

    if (matchIndex >= 0) {
      merged[matchIndex] = chooseMoreCompleteMessage(merged[matchIndex], message);
      cursor = matchIndex + 1;
      continue;
    }

    if (isAssistantReplayAfterStableAssistant(merged, cursor, message)) {
      continue;
    }

    if (isActivityTranscriptMessage(message)) {
      const insertionIndex = findActivityInsertionBeforeFinalAssistant(merged, cursor);
      if (insertionIndex >= 0) {
        merged.splice(insertionIndex, 0, message);
        cursor = insertionIndex + 1;
        continue;
      }
    }

    merged.push(message);
    cursor = merged.length;
  }

  return collapseRepeatedTurnReplays(dedupeMessages(merged));
}

function stableHash(value) {
  const input = String(value || '');
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function identityComparableContent(message) {
  const normalized = normalizeMessage(message);
  const compact = getCompactComparableContent(normalized);
  return compact || getComparableContent(normalized) || String(normalized.content || '').trim();
}

function buildProviderMessageId(providerUnitKey) {
  return `hermes_${stableHash(providerUnitKey)}`;
}

function assignProviderOwnedTranscriptIdentity(messages, status) {
  const source = (Array.isArray(messages) ? messages : [])
    .map(normalizeMessage)
    .filter((message) => message.content);
  const result = [];
  const turnCounts = new Map();
  let currentTurnKey = '';
  let currentTurnAssistantStandardOrdinal = 0;
  let currentTurnUserPrompt = '';
  const unitCountsByTurn = new Map();

  const ensureFallbackTurn = () => {
    if (currentTurnKey) return currentTurnKey;
    currentTurnKey = 'turn_orphan';
    currentTurnAssistantStandardOrdinal = 0;
    currentTurnUserPrompt = '';
    if (!unitCountsByTurn.has(currentTurnKey)) unitCountsByTurn.set(currentTurnKey, new Map());
    return currentTurnKey;
  };

  for (const message of source) {
    if (message.role === 'user') {
      const promptComparable = buildTurnPromptFingerprint(message) || identityComparableContent(message);
      const promptHash = stableHash(promptComparable).slice(0, 12);
      const promptCount = (turnCounts.get(promptHash) || 0) + 1;
      turnCounts.set(promptHash, promptCount);
      currentTurnKey = `turn_${promptCount}_${promptHash}`;
      currentTurnAssistantStandardOrdinal = 0;
      currentTurnUserPrompt = promptComparable;
      if (!unitCountsByTurn.has(currentTurnKey)) unitCountsByTurn.set(currentTurnKey, new Map());
    } else {
      ensureFallbackTurn();
    }

    const turnKey = ensureFallbackTurn();
    const unitCounts = unitCountsByTurn.get(turnKey) || new Map();
    let unitStem;
    if (message.role === 'user') {
      unitStem = `user:${stableHash(currentTurnUserPrompt).slice(0, 12)}`;
    } else if ((message.kind || 'standard') === 'standard') {
      const ordinal = currentTurnAssistantStandardOrdinal;
      currentTurnAssistantStandardOrdinal += 1;
      unitStem = `assistant:standard:${ordinal}`;
    } else {
      const kind = message.kind || 'standard';
      const contentHash = stableHash(identityComparableContent(message)).slice(0, 12);
      const baseStem = `assistant:${kind}:${contentHash}`;
      const occurrence = (unitCounts.get(baseStem) || 0) + 1;
      unitCounts.set(baseStem, occurrence);
      unitStem = occurrence > 1 ? `${baseStem}:${occurrence}` : baseStem;
    }
    unitCountsByTurn.set(turnKey, unitCounts);

    const providerUnitKey = `hermes-cli:${turnKey}:${unitStem}`;
    const id = buildProviderMessageId(providerUnitKey);
    const next = {
      ...message,
      id,
      bubbleId: id,
      providerUnitKey,
      _turnKey: turnKey,
      bubbleState: 'final',
    };
    result.push(next);
  }

  const streamLikeStatus = isStreamLikeStatus(status);
  if (streamLikeStatus) {
    for (let index = result.length - 1; index >= 0; index -= 1) {
      const message = result[index];
      if (message.role === 'assistant' && (message.kind || 'standard') === 'standard') {
        result[index] = {
          ...message,
          bubbleState: 'streaming',
          meta: {
            ...(message.meta && typeof message.meta === 'object' ? message.meta : {}),
            streaming: true,
          },
        };
        break;
      }
    }
  }

  return result;
}

function trimMessagesForHistoryState(messages, historyState) {
  const normalized = (Array.isArray(messages) ? messages : [])
    .map(normalizeMessage)
    .filter((message) => message.content);

  const historyMessageCount = Number.isFinite(historyState?.historyMessageCount)
    ? Math.max(0, Number(historyState.historyMessageCount))
    : null;

  if (historyState?.sessionEvent === 'new_session' || historyMessageCount === 0) {
    return [];
  }

  if (historyState?.sessionEvent === 'undo' && historyMessageCount !== null) {
    return normalized.slice(0, historyMessageCount);
  }

  return normalized;
}

function hasMessageOverlap(baseMessages, currentMessages) {
  const base = (Array.isArray(baseMessages) ? baseMessages : []).map(normalizeMessage).filter((message) => message.content);
  const current = (Array.isArray(currentMessages) ? currentMessages : []).map(normalizeMessage).filter((message) => message.content);
  if (base.length === 0 || current.length === 0) return false;
  return current.some((message) => base.some((candidate) => messagesMatch(candidate, message)));
}

function mergeCoveredTranscript(baseMessages, rawMessages) {
  const base = dedupeMessages(Array.isArray(baseMessages) ? baseMessages : [])
    .map(normalizeMessage)
    .filter((message) => message.content);
  const raw = dedupeMessages(Array.isArray(rawMessages) ? rawMessages : [])
    .map(normalizeMessage)
    .filter((message) => message.content);
  if (base.length <= raw.length || raw.length < 2) return null;

  const matchedIndices = [];
  let cursor = 0;
  for (const message of raw) {
    let matchIndex = -1;
    for (let i = cursor; i < base.length; i += 1) {
      if (messagesMatch(base[i], message)) {
        matchIndex = i;
        break;
      }
    }
    if (matchIndex < 0) return null;
    matchedIndices.push(matchIndex);
    cursor = matchIndex + 1;
  }

  const firstMatch = matchedIndices[0];
  const lastMatch = matchedIndices[matchedIndices.length - 1];
  const hasInterleavedBaseNoise = matchedIndices.some((matchIndex, index) => index > 0 && matchIndex - matchedIndices[index - 1] > 1);
  if (!(firstMatch === 0 && lastMatch === base.length - 1 && hasInterleavedBaseNoise)) return null;

  return dedupeMessages(raw.map((message, index) => chooseMoreCompleteMessage(base[matchedIndices[index]], message)));
}

function shouldDropOrphanActivityOnlyMessages(messages) {
  const source = (Array.isArray(messages) ? messages : [])
    .map(normalizeMessage)
    .filter((message) => message.content);
  if (source.length === 0) return false;
  return source.every(isActivityTranscriptMessage);
}

function dropOrphanActivityOnlyMessages(messages) {
  return shouldDropOrphanActivityOnlyMessages(messages) ? [] : messages;
}

function shouldPreferRawMessages({
  baseMessages,
  rawMessages,
  transcriptMessages,
  screenMessages,
}) {
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) return false;
  if (!hasMessageOverlap(baseMessages, rawMessages)) {
    const transcriptCount = Array.isArray(transcriptMessages) ? transcriptMessages.length : 0;
    const screenCount = Array.isArray(screenMessages) ? screenMessages.length : 0;
    return transcriptCount > screenCount || rawMessages.length >= 4;
  }
  return Boolean(mergeCoveredTranscript(baseMessages, rawMessages));
}

module.exports = function parseOutput(input) {
  const transcript = String(input?.buffer || input?.screenText || input?.rawBuffer || '');
  const screenText = String(input?.screenText || '');
  const status = detectStatus({
    screenText,
    tail: input?.recentBuffer || input?.tail || '',
    buffer: transcript,
    isWaitingForResponse: input?.isWaitingForResponse,
  });

  const parsedApproval = parseApproval({
    screenText,
    buffer: transcript,
    tail: input?.recentBuffer || input?.tail || '',
  });

  const historyState = extractHistoryState(transcript || screenText);
  const committedCandidates = toCandidates('committed', Array.isArray(input?.messages)
    ? input.messages
        .filter((message) => message && (message.role === 'user' || message.role === 'assistant'))
        .map((message) => normalizeMessage({
          role: message.role,
          kind: message.kind,
          senderName: message.senderName,
          content: String(message.content || ''),
          id: message.id,
          bubbleId: message.bubbleId,
          providerUnitKey: message.providerUnitKey,
          _turnKey: message._turnKey,
          bubbleState: message.bubbleState,
          meta: message.meta,
        }))
    : []);
  const baseMessages = collapseReplayedAssistantHistory(trimMessagesForHistoryState(
    candidatesToLegacyMessages(committedCandidates),
    historyState,
  ));
  const tokenizerOptions = { dedupeMessages };
  const parsedTranscriptMessages = dropOrphanActivityOnlyMessages(parseMessages(transcript || '', tokenizerOptions)
    .map((message) => ({
      role: message.role,
      kind: message.kind,
      senderName: message.senderName,
      content: String(message.content || ''),
    })));
  const transcriptCandidates = toCandidates('buffer', parsedTranscriptMessages);
  const transcriptMessages = collapseReplayedAssistantHistory(trimMessagesForHistoryState(
    candidatesToLegacyMessages(transcriptCandidates),
    historyState,
  ));
  const parsedScreenMessages = dropOrphanActivityOnlyMessages(parseMessages(screenText || '', tokenizerOptions)
    .map((message) => ({
      role: message.role,
      kind: message.kind,
      senderName: message.senderName,
      content: String(message.content || ''),
    })));
  const screenCandidates = toCandidates('screen', parsedScreenMessages);
  const screenMessages = collapseReplayedAssistantHistory(trimMessagesForHistoryState(
    candidatesToLegacyMessages(screenCandidates),
    historyState,
  ));
  const transcriptCurrentTurnMessages = collapseReplayedAssistantHistory(
    candidatesToLegacyMessages(transcriptCandidates, { scope: 'current-turn' }),
  );
  const screenCurrentTurnMessages = collapseReplayedAssistantHistory(
    candidatesToLegacyMessages(screenCandidates, { scope: 'current-turn' }),
  );
  const primaryRawMessages = transcriptMessages.length >= screenMessages.length
    ? transcriptMessages
    : screenMessages;
  const secondaryRawMessages = primaryRawMessages === transcriptMessages
    ? screenMessages
    : transcriptMessages;
  const rawMessages = mergeMessageHistories(primaryRawMessages, secondaryRawMessages);
  const primaryCurrentTurnMessages = primaryRawMessages === transcriptMessages
    ? transcriptCurrentTurnMessages
    : screenCurrentTurnMessages;
  const secondaryCurrentTurnMessages = primaryRawMessages === transcriptMessages
    ? screenCurrentTurnMessages
    : transcriptCurrentTurnMessages;
  const rawCurrentTurnMessages = mergeMessageHistories(primaryCurrentTurnMessages, secondaryCurrentTurnMessages);
  const coveredRawMessages = mergeCoveredTranscript(baseMessages, rawMessages);
  const preferredRawMessages = coveredRawMessages || rawMessages;
  const messages = trimMessagesForHistoryState(
    shouldPreferRawMessages({
      baseMessages,
      rawMessages,
      transcriptMessages,
      screenMessages,
    })
      ? preferredRawMessages
      : mergeMessageHistories(baseMessages, rawCurrentTurnMessages),
    historyState,
  );
  const activeModal = parsedApproval || null;
  const effectiveStatus = activeModal ? 'waiting_approval' : status;
  const replayCollapseOptions = {
    dropPriorStableAfterActivity: isStreamLikeStatus(effectiveStatus),
  };
  const finalMessages = activeModal
    ? dedupeMessages([...collapseReplayedAssistantHistory(messages, replayCollapseOptions), createApprovalMessage(activeModal)])
    : collapseReplayedAssistantHistory(messages, replayCollapseOptions);
  const displayMessages = finalMessages;
  const identifiedMessages = assignProviderOwnedTranscriptIdentity(displayMessages, effectiveStatus);
  const model = extractCurrentModel(screenText || transcript);
  const providerSessionId = extractProviderSessionId(transcript || screenText);

  return {
    id: 'cli_session',
    title: 'Hermes Agent',
    status: effectiveStatus,
    model,
    messages: identifiedMessages,
    activeModal,
    providerSessionId,
    currentTurnId: identifiedMessages.length > 0 ? identifiedMessages[identifiedMessages.length - 1]._turnKey : undefined,
    ...historyState,
  };
};
