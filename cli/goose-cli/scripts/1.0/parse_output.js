'use strict';
const detectStatus = require('./detect_status.js');
const parseApproval = require('./parse_approval.js');

function splitLines(text) {
    return String(text || '')
        .replace(/\u0007/g, '')
        .split(/\r\n|\n|\r/g)
        .map(line => line.replace(/\s+$/, ''));
}

function sanitize(line) {
    return String(line || '')
        .replace(/\u0007/g, '')
        .replace(/^\d+;/, '')
        .replace(/\s+$/, '');
}

function normalize(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
}

function tokenize(text) {
    return String(text || '')
        .toLowerCase()
        .split(/[^a-z0-9_./:-]+/)
        .map(token => token.trim())
        .filter(token => token.length >= 4);
}

function getLastUserPrompt(previousMessages) {
    return [...(Array.isArray(previousMessages) ? previousMessages : [])]
        .reverse()
        .find(message => message?.role === 'user' && typeof message.content === 'string')
        ?.content || '';
}

function promptTokenHits(line, promptText) {
    const tokens = tokenize(promptText);
    if (tokens.length === 0) return 0;
    const normalizedLine = normalize(line).toLowerCase();
    if (!normalizedLine) return 0;
    return tokens.filter(token => normalizedLine.includes(token)).length;
}

function looksLikePromptFragment(line, promptText) {
    const trimmed = sanitize(line).trim();
    if (!trimmed) return false;
    const normalizedPrompt = normalize(promptText).toLowerCase();
    const normalizedLine = normalize(trimmed).toLowerCase();
    if (!normalizedPrompt) return false;
    if (normalizedLine === normalizedPrompt) return true;
    if (normalizedPrompt.includes(normalizedLine) || normalizedLine.includes(normalizedPrompt)) return true;
    const hits = promptTokenHits(trimmed, promptText);
    return hits >= Math.min(3, tokenize(promptText).length);
}

function findPromptLineIndex(lines, promptText) {
    const normalizedPrompt = normalize(promptText).toLowerCase();
    if (!normalizedPrompt) return -1;
    let bestIndex = -1;
    let bestScore = 0;
    for (let index = 0; index < lines.length; index += 1) {
        const score = promptTokenHits(lines[index], promptText);
        if (score > bestScore) {
            bestIndex = index;
            bestScore = score;
        }
        const normalizedLine = normalize(lines[index]).toLowerCase();
        if (normalizedLine && (normalizedPrompt.includes(normalizedLine) || normalizedLine.includes(normalizedPrompt))) {
            bestIndex = index;
            bestScore = Math.max(bestScore, tokenize(promptText).length + 1);
        }
    }
    return bestScore > 0 ? bestIndex : -1;
}

function isHeaderLine(trimmed) {
    return /^__\s*\( O\)>/.test(trimmed)
        || /^\\____\)/.test(trimmed)
        || /^L\s+L\s+goose is ready/i.test(trimmed);
}

function isFooterLine(trimmed) {
    return /^🪿\s+Enter to send/i.test(trimmed)
        || /^⏱\s+/i.test(trimmed)
        || /^[━╌─╍╎╏╴╶╸╺╼╾]+\s+\d+%\s+\d+[kKmM]?\/\d+[kKmM]?/.test(trimmed)
        || /^\d+%\s+\d+[kKmM]?\/\d+[kKmM]?/.test(trimmed);
}

function isStatusLine(trimmed) {
    return !trimmed
        || /^[\u2800-\u28ff\s]+$/.test(trimmed)
        || /^[◐◑◒◓◔◕◴◷◶◵]+/.test(trimmed)
        || /Ctrl\+C to interrupt/i.test(trimmed)
        || /(thinking|processing|working|running|analyzing|planning|reading|searching|inspecting|initializing|growing|compiling)/i.test(trimmed);
}

function isApprovalLine(trimmed) {
    return (/approve|confirm/i.test(trimmed) && /deny|cancel/i.test(trimmed))
        || /\(y\/n\)/i.test(trimmed)
        || /Allow.*tool/i.test(trimmed);
}

function isNoiseLine(trimmed) {
    return isHeaderLine(trimmed)
        || isFooterLine(trimmed)
        || isStatusLine(trimmed)
        || isApprovalLine(trimmed)
        || /^Warning: Failed to update project tracker/i.test(trimmed);
}

function trimPromptEcho(lines, promptText) {
    const out = [...lines];
    while (out.length > 0) {
        const trimmed = sanitize(out[0]).trim();
        if (!trimmed) {
            out.shift();
            continue;
        }
        if (/^Warning: Failed to update project tracker/i.test(trimmed)) {
            out.shift();
            continue;
        }
        if (/^🪿\s+/.test(trimmed)) {
            out.shift();
            continue;
        }
        if (looksLikePromptFragment(trimmed, promptText)) {
            out.shift();
            continue;
        }
        break;
    }
    return out;
}

function trimTrailingNoise(lines) {
    const out = [...lines];
    while (out.length > 0) {
        const trimmed = sanitize(out[out.length - 1]).trim();
        if (!trimmed || isNoiseLine(trimmed)) {
            out.pop();
            continue;
        }
        break;
    }
    return out;
}

function normalizeBlankRuns(lines) {
    const out = [];
    for (const line of lines) {
        const cleaned = sanitize(line);
        if (!cleaned.trim()) {
            if (out.length > 0 && out[out.length - 1] !== '') out.push('');
            continue;
        }
        out.push(cleaned);
    }
    while (out[0] === '') out.shift();
    while (out[out.length - 1] === '') out.pop();
    return out;
}

function extractAssistantText(screenText, previousMessages) {
    const lines = splitLines(screenText);
    const promptText = getLastUserPrompt(previousMessages);
    const promptIndex = findPromptLineIndex(lines, promptText);
    const scoped = promptIndex >= 0 ? lines.slice(promptIndex + 1) : lines;
    const trimmed = trimPromptEcho(scoped, promptText);
    const kept = [];
    for (const rawLine of trimmed) {
        const cleaned = sanitize(rawLine);
        const text = cleaned.trim();
        if (isHeaderLine(text)) continue;
        if (isFooterLine(text)) break;
        if (isStatusLine(text) || isApprovalLine(text) || /^🪿\s+/.test(text)) continue;
        kept.push(cleaned);
    }
    return normalizeBlankRuns(trimTrailingNoise(kept)).join('\n').trim();
}

function splitBlocks(text) {
    return String(text || '')
        .split(/\n{2,}/)
        .map(block => block.trim())
        .filter(Boolean);
}

function mergeAssistantContent(existing, incoming) {
    const current = String(existing || '').trim();
    const next = String(incoming || '').trim();
    if (!current) return next;
    if (!next) return current;
    const normalizedCurrent = normalize(current);
    const normalizedNext = normalize(next);
    if (normalizedCurrent === normalizedNext) return current.length >= next.length ? current : next;
    if (normalizedCurrent.includes(normalizedNext)) return current;
    if (normalizedNext.includes(normalizedCurrent)) return next;

    const merged = splitBlocks(current);
    for (const block of splitBlocks(next)) {
        const normalizedBlock = normalize(block);
        const existingIndex = merged.findIndex(candidate => {
            const normalizedCandidate = normalize(candidate);
            return normalizedCandidate === normalizedBlock
                || normalizedCandidate.includes(normalizedBlock)
                || normalizedBlock.includes(normalizedCandidate);
        });
        if (existingIndex >= 0) {
            if (block.length > merged[existingIndex].length) merged[existingIndex] = block;
            continue;
        }
        merged.push(block);
    }
    return merged.join('\n\n').trim();
}

function buildMessages(previousMessages, assistantText) {
    const base = Array.isArray(previousMessages)
        ? previousMessages
            .filter(message => message && (message.role === 'user' || message.role === 'assistant'))
            .map(message => ({
                role: message.role,
                content: typeof message.content === 'string' ? message.content : String(message.content || ''),
                timestamp: message.timestamp,
            }))
        : [];

    if (!assistantText) return base;

    const last = base[base.length - 1];
    if (last && last.role === 'assistant') {
        last.content = mergeAssistantContent(last.content, assistantText);
    } else {
        base.push({ role: 'assistant', content: assistantText });
    }
    return base;
}

function toMessageObjects(messages, status) {
    return messages.slice(-50).map((message, index, slice) => ({
        id: `msg_${index}`,
        role: message.role,
        content: typeof message.content === 'string' && message.content.length > 6000
            ? `${message.content.slice(0, 6000)}\n[... truncated]`
            : message.content,
        index,
        kind: 'standard',
        ...(status === 'generating' && index === slice.length - 1 && message.role === 'assistant'
            ? { meta: { streaming: true } }
            : {}),
    }));
}

function extractProviderSessionId(rawBuffer, buffer, screenText) {
    const source = [rawBuffer, buffer, screenText]
        .map(value => String(value || ''))
        .join('\n');
    const match = source.match(/\b(\d{8}_\d+)\s+·\s+\/[^\s]+/);
    return match ? match[1] : '';
}

module.exports = function parseOutput(input) {
    const screenText = String(input?.screenText || '');
    const buffer = String(input?.buffer || '');
    const tail = String(input?.recentBuffer || screenText.slice(-500) || buffer.slice(-500));
    const previousMessages = Array.isArray(input?.messages) ? input.messages : [];
    const status = detectStatus({ tail, screenText, rawBuffer: input?.rawBuffer || '' });
    const activeModal = status === 'waiting_approval'
        ? parseApproval({ buffer: buffer || screenText, tail, screenText, rawBuffer: input?.rawBuffer || '' })
        : null;

    const assistantText = status === 'waiting_approval'
        ? ''
        : extractAssistantText(screenText || buffer, previousMessages);
    const partialText = status === 'generating' ? extractAssistantText(String(input?.partialResponse || ''), previousMessages) : '';
    const candidateAssistant = mergeAssistantContent(assistantText, partialText);

    return {
        id: 'cli_session',
        status,
        title: 'Goose',
        messages: toMessageObjects(buildMessages(previousMessages, candidateAssistant), status),
        activeModal,
        providerSessionId: extractProviderSessionId(input?.rawBuffer, buffer, screenText) || undefined,
    };
};
