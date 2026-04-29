'use strict';

function normalizeSource(source) {
  const value = String(source || '').trim();
  if (value === 'committed' || value === 'buffer' || value === 'screen') return value;
  return 'unknown';
}

function normalizeKind(message) {
  const kind = String(message?.kind || '').trim();
  return kind || 'standard';
}

function normalizeCandidateMessage(message) {
  return {
    role: message?.role,
    kind: normalizeKind(message),
    senderName: message?.senderName,
    content: String(message?.content || ''),
    ...(message?.id ? { id: message.id } : {}),
    ...(message?.bubbleId ? { bubbleId: message.bubbleId } : {}),
    ...(message?.providerUnitKey ? { providerUnitKey: message.providerUnitKey } : {}),
    ...(message?._turnKey ? { _turnKey: message._turnKey } : {}),
    ...(message?.bubbleState ? { bubbleState: message.bubbleState } : {}),
    ...(message?.meta ? { meta: message.meta } : {}),
  };
}

function findCurrentUserIndex(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') return index;
  }
  return -1;
}

function classifySourcePosition(source, message, index, currentUserIndex) {
  if (source === 'committed') {
    return {
      confidence: 'canonical',
      provenance: 'history',
      turnBoundary: 'before-current-user',
    };
  }

  if (source === 'screen') {
    if (currentUserIndex >= 0) {
      if (index < currentUserIndex) {
        return {
          confidence: 'artifact',
          provenance: 'viewport',
          turnBoundary: 'before-current-user',
        };
      }
      if (index === currentUserIndex && message?.role === 'user') {
        return {
          confidence: 'candidate',
          provenance: 'current-turn',
          turnBoundary: 'current-user',
        };
      }
      return {
        confidence: 'candidate',
        provenance: 'current-turn',
        turnBoundary: 'after-current-user',
      };
    }
    return {
      confidence: 'candidate',
      provenance: 'viewport',
      turnBoundary: 'orphan',
    };
  }

  if (source === 'buffer') {
    if (currentUserIndex >= 0) {
      if (index < currentUserIndex) {
        return {
          confidence: 'candidate',
          provenance: 'history',
          turnBoundary: 'before-current-user',
        };
      }
      if (index === currentUserIndex && message?.role === 'user') {
        return {
          confidence: 'candidate',
          provenance: 'current-turn',
          turnBoundary: 'current-user',
        };
      }
      return {
        confidence: 'candidate',
        provenance: 'current-turn',
        turnBoundary: 'after-current-user',
      };
    }
    return {
      confidence: 'candidate',
      provenance: 'history',
      turnBoundary: 'orphan',
    };
  }

  return {
    confidence: 'candidate',
    provenance: 'unknown',
    turnBoundary: 'orphan',
  };
}

function toCandidates(source, messages, context = {}) {
  const normalizedSource = normalizeSource(source);
  const list = Array.isArray(messages) ? messages : [];
  const currentUserIndex = Number.isInteger(context.currentUserIndex)
    ? context.currentUserIndex
    : findCurrentUserIndex(list);

  return list.map((message, index) => {
    const normalizedMessage = normalizeCandidateMessage(message);
    const classification = classifySourcePosition(normalizedSource, normalizedMessage, index, currentUserIndex);
    return {
      ...normalizedMessage,
      source: normalizedSource,
      sourceIndex: index,
      sourceRange: message?.sourceRange || null,
      ...classification,
    };
  });
}

function candidatesToLegacyMessages(candidates, options = {}) {
  const includeArtifacts = options.includeArtifacts !== false;
  const scope = String(options.scope || 'all');
  return (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => includeArtifacts || candidate.confidence !== 'artifact')
    .filter((candidate) => scope !== 'current-turn' || candidate.turnBoundary !== 'before-current-user')
    .map((candidate) => ({
      role: candidate.role,
      kind: candidate.kind || 'standard',
      senderName: candidate.senderName,
      content: String(candidate.content || ''),
      ...(candidate.id ? { id: candidate.id } : {}),
      ...(candidate.bubbleId ? { bubbleId: candidate.bubbleId } : {}),
      ...(candidate.providerUnitKey ? { providerUnitKey: candidate.providerUnitKey } : {}),
      ...(candidate._turnKey ? { _turnKey: candidate._turnKey } : {}),
      ...(candidate.bubbleState ? { bubbleState: candidate.bubbleState } : {}),
      ...(candidate.meta ? { meta: candidate.meta } : {}),
    }));
}

module.exports = {
  toCandidates,
  candidatesToLegacyMessages,
};
