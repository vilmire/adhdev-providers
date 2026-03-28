/**
 * Claude Code — parse_output
 *
 * Full PTY buffer → ReadChatResult conversion.
 * Called less frequently than detectStatus (on demand, not polling).
 *
 * Input: {
 *   buffer: string,       // Full ANSI-stripped accumulated PTY output
 *   rawBuffer: string,    // Raw PTY output (with ANSI)
 *   recentBuffer: string, // Recent 1000 chars (ANSI-stripped)
 *   messages: Array,      // Previously parsed messages (for delta)
 *   partialResponse: string, // Current partial response being generated
 * }
 *
 * Output: ReadChatResult {
 *   messages: [{ id, role, content, index, kind?, meta? }],
 *   status: AgentStatus,
 *   activeModal?: ModalInfo | null,
 *   title?: string,
 * }
 */

'use strict';

const detectStatus  = require('./detect_status.js');
const parseApproval = require('./parse_approval.js');

function normalizeText(text) {
    return String(text || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function sanitizeLine(line) {
    return String(line || '').replace(/\s+$/, '');
}

function isNoiseLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return true;
    if (/^[─═╭╮╰╯│┌┐└┘├┤┬┴┼]+$/.test(trimmed)) return true;
    if (/^Type your message/i.test(trimmed)) return true;
    if (/^for\s*shortcuts/i.test(trimmed)) return true;
    if (/^\? for help/i.test(trimmed)) return true;
    if (/^Press enter/i.test(trimmed)) return true;
    if (/^[\u2800-\u28ff]+$/.test(trimmed)) return true;
    if (/^esc to (cancel|interrupt|stop)/i.test(trimmed)) return true;
    if (/^Allow\s*once/i.test(trimmed)) return true;
    if (/^Always\s*allow/i.test(trimmed)) return true;
    if (/^\[(Y\/n|y\/n)\]$/i.test(trimmed)) return true;
    return false;
}

function extractPromptLine(lines) {
    for (let i = lines.length - 1; i >= 0; i--) {
        const trimmed = lines[i].trim();
        const match = trimmed.match(/^[❯›>]\s+(.+)$/);
        if (match && match[1].trim().length > 0) {
            return { index: i, text: match[1].trim() };
        }
    }
    return { index: -1, text: '' };
}

function extractVisibleAssistant(screenText) {
    if (!screenText) return { promptText: '', assistantText: '' };
    const lines = screenText.split('\n').map(sanitizeLine);
    const prompt = extractPromptLine(lines);
    const afterPrompt = prompt.index >= 0 ? lines.slice(prompt.index + 1) : lines;
    const contentLines = afterPrompt.filter(line => !isNoiseLine(line));
    return {
        promptText: prompt.text,
        assistantText: contentLines.join('\n').trim(),
    };
}

function toMessageObjects(messages, status) {
    const max = 50;
    const slice = messages.slice(-max);
    return slice.map((message, index) => ({
        id: `msg_${index}`,
        role: message.role,
        content: typeof message.content === 'string' && message.content.length > 6000
            ? message.content.slice(0, 6000) + '\n[... truncated]'
            : message.content,
        index,
        kind: 'standard',
        ...(status === 'generating' && index === slice.length - 1 && message.role === 'assistant'
            ? { meta: { streaming: true } }
            : {}),
    }));
}

function buildMessages(previousMessages, promptText, assistantText, status, partialResponse) {
    const base = Array.isArray(previousMessages)
        ? previousMessages.map(m => ({
            role: m.role,
            content: typeof m.content === 'string' ? m.content : String(m.content || ''),
            timestamp: m.timestamp,
        }))
        : [];

    const last = base[base.length - 1];
    if (promptText) {
        const normalizedPrompt = normalizeText(promptText);
        if (!last || last.role !== 'user' || normalizeText(last.content) !== normalizedPrompt) {
            base.push({ role: 'user', content: promptText });
        }
    }

    const candidateAssistant = normalizeText(partialResponse || '') || assistantText;
    if (candidateAssistant) {
        const normalizedAssistant = normalizeText(candidateAssistant);
        const lastMsg = base[base.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') {
            const existing = normalizeText(lastMsg.content);
            if (normalizedAssistant !== existing) {
                lastMsg.content = candidateAssistant;
            }
        } else {
            base.push({ role: 'assistant', content: candidateAssistant });
        }
    }

    if (status !== 'generating') {
        const lastMsg = base[base.length - 1];
        if (lastMsg?.role === 'assistant') {
            const visible = normalizeText(assistantText);
            if (visible && visible !== normalizeText(lastMsg.content)) {
                lastMsg.content = assistantText;
            }
        }
    }

    return base;
}

module.exports = function parseOutput(input) {
    const { buffer, recentBuffer, partialResponse, screenText, messages: previousMessages } = input;
    const transcript = screenText || buffer || '';

    // Status
    const tail = (recentBuffer || (transcript || '').slice(-500));
    const status = detectStatus({ tail });

    // Modal
    const activeModal = status === 'waiting_approval'
        ? parseApproval({ buffer: transcript, tail })
        : null;

    const { promptText, assistantText } = extractVisibleAssistant(transcript);
    const messages = toMessageObjects(
        buildMessages(previousMessages, promptText, assistantText, status, partialResponse),
        status
    );

    return {
        id: 'cli_session',
        status,
        title: 'Claude Code',
        messages,
        activeModal,
    };
};
