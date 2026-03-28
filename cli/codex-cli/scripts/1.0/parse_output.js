/**
 * Codex CLI — parse_output
 */
'use strict';

const detectStatus = require('./detect_status.js');
const parseApproval = require('./parse_approval.js');

function splitLines(text) {
    return String(text || '')
        .replace(/\u0007/g, '')
        .split(/\r\n|\n|\r/g)
        .map(line => line.replace(/\s+$/, ''));
}

function normalize(line) {
    return String(line || '')
        .replace(/\u0007/g, '')
        .replace(/^\d+;/, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function isBoxLine(line) {
    return /^[─═╭╮╰╯│┌┐└┘├┤┬┴┼]+$/.test(line);
}

function isHeaderLine(line) {
    return /^OpenAI Codex\b/i.test(line)
        || /^>_ OpenAI Codex\b/i.test(line)
        || /(?:^|[│\s])model:\s+/i.test(line)
        || /(?:^|[│\s])directory:\s+/i.test(line);
}

function isFooterLine(line) {
    return /⏎\s+send/i.test(line)
        || /⌃J\s+newline/i.test(line)
        || /⌃T\s+transcript/i.test(line)
        || /⌃C\s+quit/i.test(line)
        || /\b\d+(?:\.\d+)?[KM]?\s+tokens used\b/i.test(line)
        || /\b\d+% context left\b/i.test(line);
}

function isWelcomeLine(line) {
    return /To get started, describe a task/i.test(line)
        || /^\/(?:init|status|approvals|model)\b/.test(line)
        || /create an AGENTS\.md file/i.test(line)
        || /show current session configuration/i.test(line)
        || /choose what Codex can do without approval/i.test(line)
        || /choose what model and reasoning effort to use/i.test(line)
        || /Update available!/i.test(line)
        || /npm install -g @openai\/codex@latest/i.test(line);
}

function isStatusLine(line) {
    return /Esc to interrupt/i.test(line)
        || /(?:Thinking|Planning|Searching|Reading|Working|Analyzing|Inspecting|Responding|Following instructions clearly)[^\n]*\(\d+s\b/i.test(line)
        || /^[⠁-⣿]+$/.test(line);
}

function isApprovalLine(line) {
    return /You are running Codex in/i.test(line)
        || /Allow Codex to (?:run|apply)/i.test(line)
        || /Press Enter to continue/i.test(line)
        || /^(?:[>▌]\s*)?\d+\.\s+/.test(line);
}

function isInputLine(line) {
    return /^▌\s*/.test(line) || /^>\s*$/.test(line);
}

function isPlaceholderLine(line) {
    return /^(?:Write tests for @filename|Explain this codebase|Summarize recent commits|Implement \{feature\})$/i.test(line);
}

function isAssistantLeadLine(line) {
    return /^>\s+/.test(line) || /^•\s+/.test(line);
}

function stripAssistantLead(line) {
    return String(line || '').replace(/^(?:>\s+|•\s+)/, '').trim();
}

function isTranscriptNoise(line) {
    return !line
        || isBoxLine(line)
        || isHeaderLine(line)
        || isFooterLine(line)
        || isWelcomeLine(line)
        || isStatusLine(line)
        || isApprovalLine(line)
        || isInputLine(line)
        || isPlaceholderLine(line);
}

function cleanContentLine(rawLine) {
    const normalized = normalize(rawLine);
    if (!normalized || isTranscriptNoise(normalized)) return '';

    return normalized
        .replace(/^✔\s+/, '')
        .replace(/^\s*│\s*/, '')
        .trim();
}

function isWelcomeScreen(text) {
    return /OpenAI Codex/i.test(text)
        && /To get started, describe a task/i.test(text);
}

function collectAssistantLines(lines) {
    const result = [];
    let collecting = false;
    let sawAssistantLead = false;

    for (const rawLine of lines) {
        const line = normalize(rawLine);

        if (!line) {
            if (collecting && result.length > 0 && result[result.length - 1] !== '') {
                result.push('');
            }
            continue;
        }

        if (isInputLine(line)) {
            collecting = false;
            continue;
        }

        if (isAssistantLeadLine(line)) {
            const stripped = stripAssistantLead(line);
            collecting = true;
            sawAssistantLead = true;
            if (stripped && result[result.length - 1] !== stripped) result.push(stripped);
            continue;
        }

        if (!collecting) continue;

        const cleaned = cleanContentLine(rawLine);
        if (!cleaned) continue;
        if (result[result.length - 1] !== cleaned) result.push(cleaned);
    }

    while (result[0] === '') result.shift();
    while (result[result.length - 1] === '') result.pop();

    return sawAssistantLead ? result : [];
}

function cleanFallbackLines(lines) {
    const result = [];
    for (const rawLine of lines) {
        const line = normalize(rawLine);
        if (!isAssistantLeadLine(line)) continue;
        const stripped = stripAssistantLead(line);
        if (stripped && result[result.length - 1] !== stripped) result.push(stripped);
    }
    return result;
}

function extractAssistantText(text) {
    return collectAssistantLines(splitLines(text)).join('\n').trim();
}

function extractFallbackText(text) {
    return cleanFallbackLines(splitLines(text)).join('\n').trim();
}

function buildMessages(previousMessages, assistantText, partialText) {
    const base = Array.isArray(previousMessages)
        ? previousMessages
            .filter(message => message && (message.role === 'user' || message.role === 'assistant'))
            .map(message => ({
                role: message.role,
                content: typeof message.content === 'string' ? message.content : String(message.content || ''),
                timestamp: message.timestamp,
            }))
        : [];

    const candidate = assistantText || partialText;
    if (!candidate) return base;

    const last = base[base.length - 1];
    if (last && last.role === 'assistant') {
        if (last.content !== candidate) last.content = candidate;
    } else {
        base.push({ role: 'assistant', content: candidate });
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
    const transcript = screenText || buffer;
    const tail = String(input?.recentBuffer || transcript.slice(-500));
    const previousMessages = Array.isArray(input?.messages) ? input.messages : [];

    const status = detectStatus({
        tail,
        screenText,
        rawBuffer: input?.rawBuffer || '',
    });

    const activeModal = status === 'waiting_approval'
        ? parseApproval({ buffer: transcript, rawBuffer: input?.rawBuffer || '', tail })
        : null;

    if (status === 'waiting_approval' || (status === 'idle' && isWelcomeScreen(transcript))) {
        return {
            id: 'cli_session',
            status,
            title: 'Codex CLI',
            messages: toMessageObjects(previousMessages, status),
            activeModal,
        };
    }

    const assistantText = extractAssistantText(transcript);
    const partialText = status === 'generating'
        ? extractFallbackText(String(input?.partialResponse || ''))
        : '';
    const messages = buildMessages(previousMessages, assistantText, partialText);

    return {
        id: 'cli_session',
        status,
        title: 'Codex CLI',
        messages: toMessageObjects(messages, status),
        activeModal,
    };
};
