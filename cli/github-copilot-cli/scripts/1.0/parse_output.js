'use strict';
const detectStatus  = require('./detect_status.js');
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

function parsePromptLine(line) {
    const trimmed = sanitize(line).trim();
    const match = trimmed.match(/^[❯›>$?]\s*(.*)$/);
    if (!match) return null;
    const body = match[1].trim();
    if (/^\d+[.)]\s+/.test(body)) return null;
    return body;
}

function isBoxLine(trimmed) {
    return /^[─═╭╮╰╯│┌┐└┘├┤┬┴┼]+$/.test(trimmed);
}

function isFooterLine(trimmed) {
    return /^➜\s+\S+/.test(trimmed)
        || /Update available!/i.test(trimmed)
        || /\b\d+(?:\.\d+)?[KM]?\s+tokens used\b/i.test(trimmed)
        || /\b\d+% context left\b/i.test(trimmed)
        || /Type your message/i.test(trimmed);
}

function isStatusLine(trimmed) {
    return !trimmed
        || /^[\u2800-\u28ff\s]+$/.test(trimmed)
        || /esc to (cancel|interrupt|stop)/i.test(trimmed)
        || /(thinking|processing|generating|working|analyzing|planning|reading|searching|inspecting)/i.test(trimmed);
}

function isApprovalLine(trimmed) {
    return /execute\s*command/i.test(trimmed)
        || /\(y\/n\)|\[Y\/n\]/i.test(trimmed)
        || (/approve|confirm/i.test(trimmed) && /deny|cancel|no/i.test(trimmed));
}

function cleanContentLine(line) {
    const trimmed = sanitize(line).trim();
    if (!trimmed || isBoxLine(trimmed) || isFooterLine(trimmed) || isStatusLine(trimmed) || isApprovalLine(trimmed)) return '';
    return trimmed.replace(/^[⏺•]\s+/, '').trim();
}

function collectMeaningfulLines(lines) {
    const out = [];
    for (const rawLine of lines) {
        if (parsePromptLine(rawLine) !== null) continue;
        const cleaned = cleanContentLine(rawLine);
        if (!cleaned) continue;
        if (out[out.length - 1] !== cleaned) out.push(cleaned);
    }
    return out;
}

function extractVisibleTurn(text, previousMessages) {
    const lines = splitLines(text);
    let emptyPromptIndex = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
        if (parsePromptLine(lines[i]) === '') {
            emptyPromptIndex = i;
            break;
        }
    }

    const userPrompt = (() => {
        const upperBound = emptyPromptIndex >= 0 ? emptyPromptIndex - 1 : lines.length - 1;
        for (let i = upperBound; i >= 0; i--) {
            const parsed = parsePromptLine(lines[i]);
            if (parsed) return { index: i, text: parsed };
        }
        return { index: -1, text: '' };
    })();

    const promptLines = [];
    let assistantStart = userPrompt.index >= 0 ? userPrompt.index + 1 : 0;
    if (userPrompt.index >= 0) {
        promptLines.push(userPrompt.text);
        for (let i = userPrompt.index + 1; i < lines.length; i++) {
            const trimmed = sanitize(lines[i]).trim();
            if (!trimmed) {
                assistantStart = i + 1;
                break;
            }
            if (/^[⏺•]/.test(trimmed) || isBoxLine(trimmed) || isFooterLine(trimmed) || isStatusLine(trimmed) || isApprovalLine(trimmed)) {
                assistantStart = i;
                break;
            }
            promptLines.push(trimmed);
            assistantStart = i + 1;
        }
    }

    const end = emptyPromptIndex >= 0 ? emptyPromptIndex : lines.length;
    const assistantLines = collectMeaningfulLines(lines.slice(assistantStart, end));

    return {
        promptText: promptLines.join(' ').trim(),
        assistantText: assistantLines.join('\n').trim(),
    };
}

function buildMessages(previousMessages, promptText, assistantText, partialText) {
    const base = Array.isArray(previousMessages)
        ? previousMessages
            .filter(message => message && (message.role === 'user' || message.role === 'assistant'))
            .map(message => ({
                role: message.role,
                content: typeof message.content === 'string' ? message.content : String(message.content || ''),
                timestamp: message.timestamp,
            }))
        : [];

    if (promptText) {
        const normalizedPrompt = normalize(promptText);
        const last = base[base.length - 1];
        if (!last || last.role !== 'user' || normalize(last.content) !== normalizedPrompt) {
            base.push({ role: 'user', content: promptText });
        }
    }

    const candidateAssistant = assistantText || partialText;
    if (!candidateAssistant) return base;

    const normalizedAssistant = normalize(candidateAssistant);
    if (!normalizedAssistant) return base;

    const last = base[base.length - 1];
    if (last && last.role === 'assistant') {
        if (normalize(last.content) !== normalizedAssistant) last.content = candidateAssistant;
    } else {
        base.push({ role: 'assistant', content: candidateAssistant });
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

module.exports = function parseOutput(input) {
    const screenText = String(input?.screenText || '');
    const buffer = String(input?.buffer || '');
    const transcript = buffer || screenText;
    const tail = String(input?.recentBuffer || transcript.slice(-500));
    const previousMessages = Array.isArray(input?.messages) ? input.messages : [];
    const status = detectStatus({ tail, screenText, rawBuffer: input?.rawBuffer || '' });
    const activeModal = status === 'waiting_approval'
        ? parseApproval({ buffer: transcript, tail, screenText, rawBuffer: input?.rawBuffer || '' })
        : null;

    const { promptText, assistantText } = status === 'waiting_approval'
        ? { promptText: '', assistantText: '' }
        : extractVisibleTurn(transcript, previousMessages);
    const partialText = status === 'generating'
        ? collectMeaningfulLines(splitLines(String(input?.partialResponse || ''))).join('\n').trim()
        : '';

    return {
        id: 'cli_session',
        status,
        title: 'GitHub Copilot CLI',
        messages: toMessageObjects(buildMessages(previousMessages, promptText, assistantText, partialText), status),
        activeModal,
    };
};
