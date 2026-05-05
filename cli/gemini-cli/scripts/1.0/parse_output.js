/**
 * Gemini CLI — parse_output
 * Input:  CliScriptInput
 * Output: ReadChatResult
 */
'use strict';
const detectStatus  = require('./detect_status.js');
const parseApproval = require('./parse_approval.js');

function stripAnsi(value) {
    return String(value || '').replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

function normalizeText(value) {
    return stripAnsi(value).replace(/\r\n/g, '\n').trim();
}

function comparableText(value) {
    return normalizeText(value).replace(/\s+/g, ' ');
}

function isDividerLine(line) {
    const value = String(line || '').trim();
    return /^[─═━╭╮╰╯│┌┐└┘├┤┬┴┼▀▄_\-=\s]+$/.test(value);
}

function isGeminiChromeLine(line) {
    const value = stripAnsi(line).trim();
    if (!value) return false;
    if (isDividerLine(value)) return true;
    if (/^[\u2800-\u28ff]+(?:\s+.*)?$/.test(value) && /Thinking|Generating|esc to/i.test(value)) return true;
    if (/^workspace\s*\(\/directory\)/i.test(value)) return true;
    if (/^\/[^\s]+.*\bsandbox\b.*\bmodel\b/i.test(value)) return true;
    if (/\bsandbox\b.*\/model.*\bquota\b/i.test(value)) return true;
    if (/\?\s*for\s*shortcuts/i.test(value)) return true;
    if (/\bGEMINI\.md\b/i.test(value)) return true;
    if (/^YOLO\b/i.test(value)) return true;
    if (/Type your message(?:\s+or\s+@path\/to\/file)?/i.test(value)) return true;
    if (/^(Thinking|Generating|Waiting for authentication)\b/i.test(value)) return true;
    if (/\bThinking\.\.\.\s*\(esc to cancel/i.test(value)) return true;
    if (/^No changes detected\.?$/i.test(value)) return true;
    if (/^Verification Complete:/i.test(value)) return true;
    return false;
}

function stripPromptMarker(line) {
    const trimmed = stripAnsi(line).trim();
    const match = trimmed.match(/^(?:[*>›❯]\s*)(.+)$/u);
    if (!match) return '';
    const content = normalizeText(match[1]);
    if (!content || /Type your message/i.test(content)) return '';
    return content;
}

function stripAssistantMarker(line) {
    const trimmed = stripAnsi(line).trim();
    const match = trimmed.match(/^✦\s*(.*)$/u);
    if (!match) return null;
    return normalizeText(match[1]);
}

function cleanContentLine(line) {
    return stripAnsi(line).replace(/[ \t]+$/g, '').trim();
}

function pushDedup(list, message) {
    const content = normalizeText(message?.content);
    if (!content) return;
    const candidate = { ...message, content, kind: message.kind || 'standard' };
    const previous = list[list.length - 1];
    if (previous && previous.role === candidate.role && comparableText(previous.content) === comparableText(candidate.content)) {
        return;
    }
    list.push(candidate);
}

function parseMarkedGeminiTurns(input, transcript) {
    const lines = String(transcript || '').split(/\r\n|\n|\r/g);
    const messages = [];
    let current = null;

    function flush() {
        if (!current) return;
        pushDedup(messages, {
            role: current.role,
            content: current.lines.join('\n'),
            kind: 'standard',
        });
        current = null;
    }

    for (const rawLine of lines) {
        const assistantStart = stripAssistantMarker(rawLine);
        if (assistantStart !== null) {
            flush();
            current = { role: 'assistant', lines: [] };
            if (assistantStart) current.lines.push(assistantStart);
            continue;
        }

        const promptStart = stripPromptMarker(rawLine);
        if (promptStart) {
            flush();
            current = { role: 'user', lines: [promptStart] };
            continue;
        }

        if (!current) continue;
        if (isGeminiChromeLine(rawLine)) {
            flush();
            continue;
        }

        const line = cleanContentLine(rawLine);
        if (!line) {
            current.lines.push('');
            continue;
        }
        current.lines.push(line);
    }
    flush();

    const explicitPrompt = normalizeText(input?.promptText);
    const hasUser = messages.some(message => message.role === 'user');
    if (explicitPrompt && !hasUser) {
        messages.unshift({ role: 'user', content: explicitPrompt, kind: 'standard' });
    }

    return messages;
}

function toMessageObjects(messages, status) {
    return messages.map((message, index, slice) => ({
        id: typeof message.id === 'string' && message.id ? message.id : `msg_${index}`,
        role: message.role,
        content: String(message.content || ''),
        index,
        kind: message.kind || 'standard',
        ...(message.timestamp ? { timestamp: message.timestamp } : {}),
        ...(status === 'generating' && index === slice.length - 1 && message.role === 'assistant'
            ? { meta: { ...(message.meta || {}), streaming: true } }
            : (message.meta ? { meta: message.meta } : {})),
    }));
}

function normalizePriorMessages(priorMessages) {
    return Array.isArray(priorMessages)
        ? priorMessages
            .filter(message => message && (message.role === 'user' || message.role === 'assistant') && normalizeText(message.content))
            .map(message => ({
                role: message.role,
                content: normalizeText(message.content),
                kind: message.kind || 'standard',
                timestamp: message.timestamp,
                id: message.id,
                meta: message.meta,
            }))
        : [];
}

function mergeMessages(priorMessages, parsedMessages, status) {
    const parsed = [];
    for (const message of Array.isArray(parsedMessages) ? parsedMessages : []) {
        if (!message || (message.role !== 'user' && message.role !== 'assistant')) continue;
        pushDedup(parsed, message);
    }
    if (parsed.length > 0) return toMessageObjects(parsed, status);

    const prior = normalizePriorMessages(priorMessages);
    return toMessageObjects(prior, status);
}

module.exports = function parseOutput(input) {
    const safeInput = input || {};
    const { buffer, recentBuffer, partialResponse } = safeInput;
    const screenText = String(safeInput.screenText || '');
    const rawBuffer = String(safeInput.rawBuffer || '');
    const transcript = screenText.trim() ? screenText : (String(buffer || '') || rawBuffer || String(recentBuffer || ''));
    const statusSource = screenText || transcript;
    const tail = recentBuffer || statusSource.slice(-1000);
    const status = detectStatus({ tail, screenText: statusSource, rawBuffer });
    const activeModal = status === 'waiting_approval'
        ? parseApproval({ buffer: transcript, screenText: statusSource, tail, rawBuffer })
        : null;

    const parsedMessages = parseMarkedGeminiTurns(safeInput, transcript || statusSource);
    const messages = mergeMessages(safeInput.messages, parsedMessages, status);
    if (status === 'generating' && partialResponse && partialResponse.trim().length > 2 && messages.length === 0) {
        messages.push({ id: 'msg_partial', role: 'assistant', content: partialResponse.trim(), index: messages.length, kind: 'standard', meta: { streaming: true } });
    }
    return { id: 'cli_session', status, title: 'Gemini CLI', messages, activeModal };
};
