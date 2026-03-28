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
                    messages.push({ id: `msg_${msgIndex}`, role: currentRole, content: text.slice(0, 6000), index: msgIndex, kind: 'standard' });
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
            messages.push({ id: `msg_${msgIndex}`, role: currentRole, content: text.slice(0, 6000), index: msgIndex, kind: 'standard' });
        }
    }
    return messages.length > 50 ? messages.slice(-50) : messages;
}

module.exports = function parseOutput(input) {
    const { buffer, recentBuffer, partialResponse, screenText } = input;
    const transcript = screenText || buffer;
    const tail = recentBuffer || (transcript || '').slice(-500);
    const status = detectStatus({ tail });
    const activeModal = status === 'waiting_approval' ? parseApproval({ buffer: transcript, tail }) : null;
    const messages = splitTurns(transcript);
    if (status === 'generating' && partialResponse && partialResponse.trim().length > 2) {
        messages.push({ id: 'msg_partial', role: 'assistant', content: partialResponse.trim().slice(0, 6000), index: messages.length, kind: 'standard', meta: { streaming: true } });
    }
    return { id: 'cli_session', status, title: 'Gemini CLI', messages, activeModal };
};
