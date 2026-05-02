/**
 * Gemini CLI — parse_output
 * Input:  CliScriptInput
 * Output: ReadChatResult
 */
'use strict';
const detectStatus  = require('./detect_status.js');
const parseApproval = require('./parse_approval.js');

function splitTurns(buffer) {
    const messages = [];
    if (!buffer || buffer.length < 5) return messages;
    const lines = buffer.split('\n');
    let currentRole = null;
    let currentContent = [];
    let msgIndex = 0;
    let started = false;

    for (const line of lines) {
        const trimmed = line.trim();
        const userMatch = trimmed.match(/^[❯›>]\s+(.+)$/);
        if (userMatch && userMatch[1].length > 1) {
            started = true;
            if (currentRole && currentContent.length > 0) {
                const text = currentContent.join('\n').trim();
                if (text.length > 1) {
                    messages.push({ id: `msg_${msgIndex}`, role: currentRole, content: text, index: msgIndex, kind: 'standard' });
                    msgIndex++;
                }
            }
            currentRole = 'user';
            currentContent = [userMatch[1]];
            continue;
        }
        if (!started) continue;
        if (currentRole === 'user' && trimmed && !userMatch) {
            const text = currentContent.join('\n').trim();
            if (text.length > 1) {
                messages.push({ id: `msg_${msgIndex}`, role: 'user', content: text, index: msgIndex, kind: 'standard' });
                msgIndex++;
            }
            currentRole = 'assistant';
            currentContent = [];
        }
        if (!trimmed) continue;
        if (/^[─═╭╮╰╯│┌┐└┘├┤┬┴┼]+$/.test(trimmed)) continue;
        if (/^[\u2800-\u28ff]+$/.test(trimmed)) continue;
        if (/^sandbox/i.test(trimmed)) continue;
        if (currentRole) currentContent.push(trimmed);
    }
    if (currentRole && currentContent.length > 0) {
        const text = currentContent.join('\n').trim();
        if (text.length > 1) {
            messages.push({ id: `msg_${msgIndex}`, role: currentRole, content: text, index: msgIndex, kind: 'standard' });
        }
    }
    return messages;
}

function toMessageObjects(messages, status) {
    return messages.map((message, index, slice) => ({
        id: `msg_${index}`,
        role: message.role,
        content: String(message.content || ''),
        index,
        kind: message.kind || 'standard',
        ...(status === 'generating' && index === slice.length - 1 && message.role === 'assistant'
            ? { meta: { streaming: true } }
            : {}),
    }));
}

function mergeMessages(priorMessages, parsedMessages, status) {
    const base = Array.isArray(priorMessages)
        ? priorMessages
            .filter(message => message && (message.role === 'user' || message.role === 'assistant'))
            .map(message => ({
                role: message.role,
                content: typeof message.content === 'string' ? message.content : String(message.content || ''),
                kind: message.kind || 'standard',
                timestamp: message.timestamp,
            }))
        : [];
    const parsed = Array.isArray(parsedMessages) ? parsedMessages : [];
    if (parsed.length === 0) return toMessageObjects(base, status);
    if (base.length === 0) return toMessageObjects(parsed, status);

    const latestAssistant = [...parsed].reverse().find(message => message.role === 'assistant' && message.content);
    if (!latestAssistant) return toMessageObjects(base, status);
    const last = base[base.length - 1];
    if (last && last.role === 'assistant') {
        last.content = latestAssistant.content;
    } else {
        base.push({ role: 'assistant', content: latestAssistant.content, kind: 'standard' });
    }
    return toMessageObjects(base, status);
}

module.exports = function parseOutput(input) {
    const { buffer, recentBuffer, partialResponse } = input;
    const screenText = String(input?.screenText || '');
    const transcript = screenText || String(buffer || '');
    const tail = recentBuffer || transcript.slice(-500);
    const status = detectStatus({ tail, screenText, rawBuffer: input?.rawBuffer || '' });
    const activeModal = status === 'waiting_approval'
        ? parseApproval({ buffer: transcript, screenText, tail, rawBuffer: input?.rawBuffer || '' })
        : null;
    const parsedMessages = splitTurns(buffer);
    const messages = mergeMessages(input?.messages, parsedMessages, status);
    if (status === 'generating' && partialResponse && partialResponse.trim().length > 2 && messages.length === 0) {
        messages.push({ id: 'msg_partial', role: 'assistant', content: partialResponse.trim(), index: messages.length, kind: 'standard', meta: { streaming: true } });
    }
    return { id: 'cli_session', status, title: 'Gemini CLI', messages, activeModal };
};
