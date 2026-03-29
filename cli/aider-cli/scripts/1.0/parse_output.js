'use strict';
const detectStatus  = require('./detect_status.js');
const parseApproval = require('./parse_approval.js');

function splitTurns(buffer) {
    const messages = [];
    if (!buffer || buffer.length < 5) return messages;
    const lines = buffer.split('\n');
    let currentRole = null, currentContent = [], msgIndex = 0, started = false;
    for (const line of lines) {
        const trimmed = line.trim();
        // Aider prompt is just '>' at start of line
        const userMatch = trimmed.match(/^[❯›>]\s+(.+)$/);
        if (userMatch && userMatch[1].length > 1) {
            started = true;
            if (currentRole && currentContent.length > 0) {
                const text = currentContent.join('\n').trim();
                if (text.length > 1) { messages.push({ id: `msg_${msgIndex}`, role: currentRole, content: text.slice(0, 6000), index: msgIndex, kind: 'standard' }); msgIndex++; }
            }
            currentRole = 'user'; currentContent = [userMatch[1]]; continue;
        }
        if (!started) continue;
        if (currentRole === 'user' && trimmed && !userMatch) {
            const text = currentContent.join('\n').trim();
            if (text.length > 1) { messages.push({ id: `msg_${msgIndex}`, role: 'user', content: text, index: msgIndex, kind: 'standard' }); msgIndex++; }
            currentRole = 'assistant'; currentContent = [];
        }
        if (!trimmed || /^[\u2800-\u28ff]+$/.test(trimmed)) continue;
        if (currentRole) currentContent.push(trimmed);
    }
    if (currentRole && currentContent.length > 0) {
        const text = currentContent.join('\n').trim();
        if (text.length > 1) messages.push({ id: `msg_${msgIndex}`, role: currentRole, content: text.slice(0, 6000), index: msgIndex, kind: 'standard' });
    }
    return messages.length > 50 ? messages.slice(-50) : messages;
}

function mergeMessages(priorMessages, parsedMessages, status) {
    const base = Array.isArray(priorMessages)
        ? priorMessages
            .filter(message => message && (message.role === 'user' || message.role === 'assistant'))
            .map(message => ({
                role: message.role,
                content: typeof message.content === 'string' ? message.content : String(message.content || ''),
                timestamp: message.timestamp,
            }))
        : [];
    if (!parsedMessages.length) return base.map((message, index) => ({
        id: `msg_${index}`,
        role: message.role,
        content: message.content,
        index,
        kind: 'standard',
    }));

    const latestAssistant = [...parsedMessages].reverse().find(message => message.role === 'assistant' && message.content);
    if (!latestAssistant) {
        return base.map((message, index) => ({
            id: `msg_${index}`,
            role: message.role,
            content: message.content,
            index,
            kind: 'standard',
        }));
    }

    const last = base[base.length - 1];
    if (last && last.role === 'assistant') {
        last.content = latestAssistant.content;
    } else {
        base.push({ role: 'assistant', content: latestAssistant.content });
    }

    return base.slice(-50).map((message, index, slice) => ({
        id: `msg_${index}`,
        role: message.role,
        content: typeof message.content === 'string' ? message.content.slice(0, 6000) : '',
        index,
        kind: 'standard',
        ...(status === 'generating' && index === slice.length - 1 && message.role === 'assistant'
            ? { meta: { streaming: true } }
            : {}),
    }));
}

module.exports = function parseOutput(input) {
    const { buffer, recentBuffer, partialResponse, screenText, messages: priorMessages } = input;
    const transcript = buffer || screenText;
    const tail = recentBuffer || (transcript || '').slice(-500);
    const status = detectStatus({ tail });
    const activeModal = status === 'waiting_approval' ? parseApproval({ buffer: transcript, tail }) : null;
    const messages = mergeMessages(priorMessages, splitTurns(transcript), status);
    if (status === 'generating' && partialResponse && partialResponse.trim().length > 2) {
        messages.push({ id: 'msg_partial', role: 'assistant', content: partialResponse.trim().slice(0, 6000), index: messages.length, kind: 'standard', meta: { streaming: true } });
    }
    return { id: 'cli_session', status, title: 'Aider', messages, activeModal };
};
