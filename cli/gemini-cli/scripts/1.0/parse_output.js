/**
 * Gemini CLI — parse_output
 * Input:  CliScriptInput
 * Output: ReadChatResult
 */
'use strict';

const detectStatus = require('./detect_status.js');
const parseApproval = require('./parse_approval.js');
const {
    normalizeText,
    comparableText,
    parseGeminiMessages,
} = require('./gemini_transcript_parser.js');

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

function chooseTranscript(safeInput) {
    const screenText = String(safeInput.screenText || '');
    if (screenText.trim()) return screenText;
    const buffer = String(safeInput.buffer || '');
    if (buffer.trim()) return buffer;
    const rawBuffer = String(safeInput.rawBuffer || '');
    if (rawBuffer.trim()) return rawBuffer;
    return String(safeInput.recentBuffer || '');
}

module.exports = function parseOutput(input) {
    const safeInput = input || {};
    const { recentBuffer, partialResponse } = safeInput;
    const screenText = String(safeInput.screenText || '');
    const rawBuffer = String(safeInput.rawBuffer || '');
    const transcript = chooseTranscript(safeInput);
    const statusSource = screenText || transcript;
    const tail = recentBuffer || statusSource.slice(-1000);
    const status = detectStatus({
        tail,
        screenText: statusSource,
        rawBuffer,
        isWaitingForResponse: Boolean(safeInput.isWaitingForResponse),
    });
    const activeModal = status === 'waiting_approval'
        ? parseApproval({ buffer: transcript, screenText: statusSource, tail, rawBuffer })
        : null;

    const parsedMessages = parseGeminiMessages(safeInput, transcript || statusSource);
    const messages = mergeMessages(safeInput.messages, parsedMessages, status);
    if (status === 'generating' && partialResponse && partialResponse.trim().length > 2 && messages.length === 0) {
        messages.push({ id: 'msg_partial', role: 'assistant', content: partialResponse.trim(), index: messages.length, kind: 'standard', meta: { streaming: true } });
    }
    return { id: 'cli_session', status, title: 'Gemini CLI', messages, activeModal };
};
