'use strict';

const crypto = require('node:crypto');
const parseOutput = require('./parse_output.js');

function stableHash(value) {
    return crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 12);
}

function normalizeMessageIdentity(messages, status) {
    let turnIndex = -1;
    return messages.map((message, index) => {
        const role = message?.role || 'assistant';
        const kind = message?.kind || 'standard';
        const content = typeof message?.content === 'string' ? message.content : '';
        const senderName = message?.senderName || '';

        if (role === 'user' || turnIndex < 0) {
            turnIndex += 1;
        }

        const seed = [role, kind, senderName, index, content].join('\n');
        const providerUnitKey = typeof message?.providerUnitKey === 'string' && message.providerUnitKey
            ? message.providerUnitKey
            : `cli-unit:${role}:${kind}:${index}:${stableHash(seed)}`;
        const bubbleId = typeof message?.bubbleId === 'string' && message.bubbleId
            ? message.bubbleId
            : `cli-bubble:${providerUnitKey}`;
        const turnKey = typeof message?._turnKey === 'string' && message._turnKey
            ? message._turnKey
            : `cli-turn:${turnIndex}`;
        const isStreamingTail = status === 'generating' && role === 'assistant' && index === messages.length - 1;
        const bubbleState = typeof message?.bubbleState === 'string' && message.bubbleState
            ? message.bubbleState
            : (isStreamingTail ? 'streaming' : 'complete');

        return {
            ...message,
            providerUnitKey,
            bubbleId,
            _turnKey: turnKey,
            bubbleState,
        };
    });
}

module.exports = function parseSession(input) {
    const output = parseOutput(input || {});
    const status = typeof output?.status === 'string' ? output.status : 'idle';
    const messages = normalizeMessageIdentity(
        Array.isArray(output?.messages) ? output.messages : [],
        status,
    );
    return {
        status,
        messages,
        modal: output?.activeModal || output?.modal || null,
        parsedStatus: status || null,
        transcriptAuthority: 'provider',
        coverage: 'tail',
    };
};
