'use strict';
const detectStatus  = require('./detect_status.js');
const parseApproval = require('./parse_approval.js');

/**
 * Strip ANSI escape sequences and normalize PTY control characters.
 */
function cleanPty(text) {
    if (!text) return '';
    return text
        // Remove ANSI escape sequences
        .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
        .replace(/\x1b\][^\x07]*\x07/g, '')
        .replace(/\x1b[^[\]]/g, '')
        // Normalize \r\r\n and \r\n to \n
        .replace(/\r\r\n/g, '\n')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        // Remove backspace sequences
        .replace(/.\x08/g, '')
        // Remove other control chars except \n and \t
        .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
}

/**
 * Extract conversation turns from the accumulated buffer.
 * Aider uses '>' as the input prompt. After user input, assistant response follows.
 * Input buffer is already turn-scoped by the adapter.
 */
function splitTurns(buffer) {
    const cleaned = cleanPty(buffer);
    if (!cleaned || cleaned.length < 5) return [];

    const lines = cleaned.split('\n');
    const messages = [];
    let currentRole = null;
    let currentContent = [];
    let msgIndex = 0;
    let started = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Aider user prompt line: starts with '>' followed by user text
        // Pattern: "> <user text>" — the prompt echo
        const userMatch = trimmed.match(/^[>❯›]\s+(.+)$/);
        if (userMatch && userMatch[1].trim().length > 1) {
            // Don't pick up system lines like "> Using model..." or info lines
            const userText = userMatch[1].trim();
            // Skip if this looks like aider info output (starts with lowercase keywords)
            if (/^(Using|Aider|Main|Weak|Git|Repo|Model|Warning|Error)\s/i.test(userText)) {
                if (currentRole) currentContent.push(trimmed);
                continue;
            }
            started = true;
            if (currentRole && currentContent.length > 0) {
                const text = currentContent.join('\n').trim();
                if (text.length > 1) {
                    messages.push({ id: `msg_${msgIndex}`, role: currentRole, content: text.slice(0, 8000), index: msgIndex, kind: 'standard' });
                    msgIndex++;
                }
            }
            currentRole = 'user';
            currentContent = [userText];
            continue;
        }

        if (!started) continue;

        // Transition from user to assistant when we see non-prompt content
        if (currentRole === 'user' && trimmed && !userMatch) {
            const text = currentContent.join('\n').trim();
            if (text.length > 1) {
                messages.push({ id: `msg_${msgIndex}`, role: 'user', content: text.slice(0, 8000), index: msgIndex, kind: 'standard' });
                msgIndex++;
            }
            currentRole = 'assistant';
            currentContent = [];
        }

        // Skip blank lines and pure braille spinner lines
        if (!trimmed || /^[\u2800-\u28ff\s]+$/.test(trimmed)) continue;
        // Skip aider system/status lines that aren't part of the response
        if (/^Tokens:\s+\d/i.test(trimmed)) {
            // End of assistant turn
            if (currentRole === 'assistant' && currentContent.length > 0) {
                const text = currentContent.join('\n').trim();
                if (text.length > 1) {
                    messages.push({ id: `msg_${msgIndex}`, role: 'assistant', content: text.slice(0, 8000), index: msgIndex, kind: 'standard' });
                    msgIndex++;
                }
                currentRole = null;
                currentContent = [];
            }
            continue;
        }

        if (currentRole) currentContent.push(trimmed);
    }

    // Push final open turn
    if (currentRole && currentContent.length > 0) {
        const text = currentContent.join('\n').trim();
        if (text.length > 1) {
            messages.push({ id: `msg_${msgIndex}`, role: currentRole, content: text.slice(0, 8000), index: msgIndex, kind: 'standard' });
        }
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
    if (!parsedMessages.length) return base;

    const latestAssistant = [...parsedMessages].reverse().find(message => message.role === 'assistant' && message.content);
    if (!latestAssistant) return base;

    const last = base[base.length - 1];
    if (last && last.role === 'assistant') {
        last.content = latestAssistant.content;
    } else {
        base.push({ role: 'assistant', content: latestAssistant.content });
    }
    return base.map((message, index, slice) => ({
        id: `msg_${index}`,
        role: message.role,
        content: typeof message.content === 'string' ? message.content.slice(0, 8000) : '',
        index,
        kind: 'standard',
        ...(status === 'generating' && index === slice.length - 1 && message.role === 'assistant'
            ? { meta: { streaming: true } }
            : {}),
    }));
}

module.exports = function parseOutput(input) {
    const { buffer, recentBuffer, screenText, messages: priorMessages, partialResponse } = input;
    const transcript = buffer || screenText || '';
    const tail = (screenText || '').trim() || cleanPty(recentBuffer || transcript.slice(-800));

    const status = detectStatus({ tail, screenText, rawBuffer: input?.rawBuffer || '' });
    const activeModal = status === 'waiting_approval'
        ? parseApproval({ buffer: transcript, tail, screenText, rawBuffer: input?.rawBuffer || '' })
        : null;

    const parsedMessages = splitTurns(transcript);
    const messages = mergeMessages(priorMessages, parsedMessages, status);

    if (status === 'generating' && partialResponse && partialResponse.trim().length > 2 && messages.length === 0) {
        return {
            id: 'cli_session',
            status,
            title: 'Aider',
            messages: [{
                id: 'msg_partial',
                role: 'assistant',
                content: cleanPty(partialResponse).trim().slice(0, 8000),
                index: 0,
                kind: 'standard',
                meta: { streaming: true }
            }],
            activeModal
        };
    }

    return { id: 'cli_session', status, title: 'Aider', messages, activeModal };
};
