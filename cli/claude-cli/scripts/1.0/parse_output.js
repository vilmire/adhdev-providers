/**
 * Claude Code — parse_output
 *
 * Reference implementation for CLI PTY parsing:
 * - prefer the visible screen snapshot (`screenText`)
 * - keep transcript state incrementally via `messages`
 * - fall back to noisy rolling buffers when older runtimes do not provide screenText
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

function sanitizeLine(line) {
    return String(line || '')
        .replace(/\u0007/g, '')
        .replace(/^\d+;/, '')
        .replace(/\s+$/, '');
}

function normalizeText(text) {
    return String(text || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function looksLikeSamePrompt(left, right) {
    const a = normalizeText(left);
    const b = normalizeText(right);
    if (!a || !b) return false;
    if (a === b) return true;
    const minLength = Math.min(a.length, b.length);
    if (minLength < 24) return false;
    return a.startsWith(b) || b.startsWith(a);
}

function parsePromptLine(line) {
    const trimmed = sanitizeLine(line).trim();
    const match = trimmed.match(/^[❯›>]\s*(.*)$/);
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
        || /^Update available!/i.test(trimmed)
        || /^Claude Code v\d/i.test(trimmed)
        || /^(Sonnet|Opus|Haiku)\b/i.test(trimmed)
        || /^[◐◑◒◓◴◵◶◷◸◹◺◿].*\/effort/i.test(trimmed)
        || /^✳\s*Claude Code/i.test(trimmed);
}

function isStatusLine(trimmed) {
    if (!trimmed) return true;
    if (/^[✻✶✳✢✽⠂⠐⠒⠓⠦⠴⠶⠷⠿]+$/.test(trimmed)) return true;
    if (/^[⠂⠐⠒⠓⠦⠴⠶⠷⠿]\s+/.test(trimmed)) return true;
    if (/esc to (cancel|interrupt|stop)/i.test(trimmed)) return true;
    if (/(?:Finagling|Scurrying|Bloviating|Whatchamacallit(?:ing)?|Thinking|Processing|Working|Analyzing|Planning|Drafting|Synthesizing|Inspecting|Reading|Searching)\u2026?$/i.test(trimmed)) return true;
    if (/Allow\s*once|Always\s*allow|\(y\/n\)|\[Y\/n\]/i.test(trimmed)) return true;
    return false;
}

function isNoiseLine(line) {
    const trimmed = sanitizeLine(line).trim();
    if (!trimmed) return true;
    if (isBoxLine(trimmed)) return true;
    if (isFooterLine(trimmed)) return true;
    if (isStatusLine(trimmed)) return true;
    if (/^Type your message/i.test(trimmed)) return true;
    if (/^for\s*shortcuts/i.test(trimmed)) return true;
    if (/^\? for help/i.test(trimmed)) return true;
    if (/^Press enter/i.test(trimmed)) return true;
    return false;
}

function stripAssistantPrefix(trimmed) {
    return trimmed
        .replace(/^[⏺•]\s+/, '')
        .replace(/^[✻✶✳✢✽]\s+/, '')
        .trim();
}

function collectMeaningfulLines(lines) {
    const bulletLines = [];
    const out = [];
    for (const rawLine of lines) {
        const promptText = parsePromptLine(rawLine);
        if (promptText !== null) continue;

        const trimmed = sanitizeLine(rawLine).trim();
        if (isNoiseLine(trimmed)) continue;

        const cleaned = stripAssistantPrefix(trimmed);
        if (!cleaned) continue;
        if (/^⏺\s+/.test(trimmed)) {
            if (bulletLines[bulletLines.length - 1] !== cleaned) bulletLines.push(cleaned);
            continue;
        }
        if (cleaned.length === 1 && /^[A-Za-z]$/.test(cleaned)) continue;
        if (out[out.length - 1] !== cleaned) out.push(cleaned);
    }
    return bulletLines.length > 0 ? bulletLines : out;
}

function extractVisibleTurn(text, previousMessages) {
    const lines = splitLines(text);
    const emptyPromptIndex = (() => {
        for (let i = lines.length - 1; i >= 0; i--) {
            if (parsePromptLine(lines[i]) === '') return i;
        }
        return -1;
    })();

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
            const trimmed = sanitizeLine(lines[i]).trim();
            if (!trimmed) {
                assistantStart = i + 1;
                break;
            }
            if (/^[⏺•]/.test(trimmed) || isBoxLine(trimmed) || isFooterLine(trimmed) || isStatusLine(trimmed) || /^([❯›>]\s*)?\d+[.)]\s+/.test(trimmed)) {
                assistantStart = i;
                break;
            }
            promptLines.push(trimmed);
            assistantStart = i + 1;
        }
    }

    const end = emptyPromptIndex >= 0 ? emptyPromptIndex : lines.length;
    let assistantLines = collectMeaningfulLines(lines.slice(assistantStart, end));

    if (assistantLines.length === 0 && Array.isArray(previousMessages) && previousMessages.length > 0) {
        assistantLines = collectMeaningfulLines(lines);
    }

    return {
        promptText: promptLines.join(' ').trim(),
        assistantText: assistantLines.join('\n').trim(),
    };
}

function extractPartialAssistant(text) {
    const meaningful = collectMeaningfulLines(splitLines(text));
    return meaningful.join('\n').trim();
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

    if (!promptText && base.length === 0) {
        return base;
    }

    if (promptText) {
        const normalizedPrompt = normalizeText(promptText);
        const last = base[base.length - 1];
        const previousUser = last?.role === 'assistant' ? base[base.length - 2] : last;
        if (!previousUser || previousUser.role !== 'user' || !looksLikeSamePrompt(previousUser.content, normalizedPrompt)) {
            base.push({ role: 'user', content: promptText });
        }
    }

    const candidateAssistant = assistantText || partialText;
    if (!candidateAssistant) return base;

    const normalizedAssistant = normalizeText(candidateAssistant);
    if (!normalizedAssistant) return base;

    const last = base[base.length - 1];
    if (last && last.role === 'assistant') {
        if (normalizeText(last.content) !== normalizedAssistant) {
            last.content = candidateAssistant;
        }
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
            ? message.content.slice(0, 6000) + '\n[... truncated]'
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
    const tail = String(input?.recentBuffer || (screenText || buffer).slice(-500));
    const previousMessages = Array.isArray(input?.messages) ? input.messages : [];
    const transcriptSource = screenText || buffer;

    const status = detectStatus({
        tail,
        screenText,
        rawBuffer: input?.rawBuffer || '',
    });

    const activeModal = status === 'waiting_approval'
        ? parseApproval({ buffer: screenText || buffer, rawBuffer: input?.rawBuffer || '', tail })
        : null;

    const { promptText, assistantText } = status === 'waiting_approval'
        ? { promptText: '', assistantText: '' }
        : extractVisibleTurn(transcriptSource, previousMessages);
    const partialText = status === 'generating'
        ? extractPartialAssistant(input?.partialResponse || '')
        : '';
    const messages = toMessageObjects(
        buildMessages(previousMessages, promptText, assistantText, partialText),
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
