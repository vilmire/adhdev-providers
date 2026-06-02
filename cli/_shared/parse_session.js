'use strict';

const crypto = require('node:crypto');

function stableHash(value) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 12);
}

function normalizeMessageIdentity(messages, status) {
  const list = Array.isArray(messages) ? messages : [];
  let turnIndex = -1;
  return list.map((message, index) => {
    const role = message?.role || 'assistant';
    const kind = message?.kind || 'standard';
    const content = typeof message?.content === 'string' ? message.content : '';
    const senderName = message?.senderName || '';

    if (role === 'user' || turnIndex < 0) {
      turnIndex += 1;
    }

    // v2 identity emission. providerUnitKey is a SHA1 of stable content
    // attributes so it does not change across re-reads of the same parsed
    // line. v1 producers that already attached a providerUnitKey win
    // (chat-history reads them via existing fields).
    const seed = [role, kind, senderName, index, content].join('\n');
    const providerUnitKey = typeof message?.providerUnitKey === 'string' && message.providerUnitKey
      ? message.providerUnitKey
      : `v2-pty:${role}:${kind}:${index}:${stableHash(seed)}`;
    const bubbleId = typeof message?.bubbleId === 'string' && message.bubbleId
      ? message.bubbleId
      : `bubble:${providerUnitKey}`;
    const turnKey = typeof message?._turnKey === 'string' && message._turnKey
      ? message._turnKey
      : `turn:${turnIndex}`;
    // sequence: producer-supplied wins; otherwise monotonic per parse from
    // the message's receivedAt/timestamp; otherwise positional.
    const existingSeq = typeof message?.sequence === 'number' && Number.isFinite(message.sequence)
      ? message.sequence
      : null;
    const tsCandidate = Number(message?.receivedAt || message?.timestamp || 0);
    const sequence = existingSeq !== null
      ? existingSeq
      : (tsCandidate > 0 ? tsCandidate : index);
    const isStreamingTail = status === 'generating' && role === 'assistant' && index === list.length - 1;
    const bubbleState = typeof message?.bubbleState === 'string' && message.bubbleState
      ? message.bubbleState
      : (isStreamingTail ? 'streaming' : 'final');

    return {
      ...message,
      providerUnitKey,
      bubbleId,
      sequence,
      _turnKey: turnKey,
      bubbleState,
    };
  });
}

function normalizeParseOutputSession(output, options = {}) {
  const status = typeof output?.status === 'string' ? output.status : 'idle';
  return {
    ...(typeof output?.id === 'string' ? { id: output.id } : {}),
    status,
    ...(typeof output?.title === 'string' ? { title: output.title } : {}),
    messages: normalizeMessageIdentity(output?.messages, status),
    modal: output?.activeModal || output?.modal || null,
    activeModal: output?.activeModal || output?.modal || null,
    parsedStatus: status || null,
    ...(typeof output?.providerSessionId === 'string' ? { providerSessionId: output.providerSessionId } : {}),
    ...(output?.transcriptAuthority === 'provider' || output?.transcriptAuthority === 'daemon'
      ? { transcriptAuthority: output.transcriptAuthority }
      : {}),
    ...(output?.coverage === 'full' || output?.coverage === 'tail' || output?.coverage === 'current-turn'
      ? { coverage: output.coverage }
      : {}),
    ...(options.resultFields || {}),
  };
}

function wrapParseOutputAsSession(parseOutput, options = {}) {
  if (typeof parseOutput !== 'function') {
    throw new TypeError('wrapParseOutputAsSession requires a parseOutput function');
  }
  return function parseSession(input) {
    return normalizeParseOutputSession(parseOutput(input || {}), options);
  };
}

module.exports = {
  stableHash,
  normalizeMessageIdentity,
  normalizeParseOutputSession,
  wrapParseOutputAsSession,
};
