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
    return a.startsWith(b) || b.startsWith(a) || a.includes(b) || b.includes(a);
}

function isSpinnerOnlyText(text) {
    const lines = splitLines(text)
        .map(line => stripAssistantPrefix(sanitizeLine(line).trim()))
        .filter(Boolean);
    if (lines.length === 0) return true;
    return lines.every(line => isStatusLine(line) || /^(?:[A-Z][a-z]+ing\u2026?|[✻✶✳✢✽⠂⠐⠒⠓⠦⠴⠶⠷⠿]+)$/.test(line));
}

function looksLikePromptEchoText(candidate, promptText, previousMessages) {
    const normalizedCandidate = normalizeText(candidate);
    if (!normalizedCandidate) return false;
    if (promptText && looksLikeSamePrompt(normalizedCandidate, promptText)) return true;

    const lastUser = [...(Array.isArray(previousMessages) ? previousMessages : [])]
        .reverse()
        .find(message => message?.role === 'user' && typeof message.content === 'string');
    return !!lastUser && looksLikeSamePrompt(normalizedCandidate, lastUser.content);
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
        || /Claude Code v\d/i.test(trimmed)
        || /^(Sonnet|Opus|Haiku)\b/i.test(trimmed)
        || /^[◐◑◒◓◴◵◶◷◸◹◺◿].*\/effort/i.test(trimmed)
        || /^⏵⏵\s+accept edits on/i.test(trimmed)
        || /^ctrl\+g to edit in VS Code/i.test(trimmed)
        || /^✳\s*Claude Code/i.test(trimmed)
        || /^[▗▖▘▝\s]+~\//.test(trimmed);
}

function isStatusLine(trimmed) {
    if (!trimmed) return true;
    if (/^[✻✶✳✢✽⠂⠐⠒⠓⠦⠴⠶⠷⠿]+$/.test(trimmed)) return true;
    if (/^[⠂⠐⠒⠓⠦⠴⠶⠷⠿]\s+/.test(trimmed)) return true;
    if (/esc to (cancel|interrupt|stop)/i.test(trimmed)) return true;
    if (/(?:Finagling|Scurrying|Bloviating|Whatchamacallit(?:ing)?|Hatching|Tinkering|Thinking|Processing|Working|Analyzing|Planning|Drafting|Synthesizing|Inspecting|Reading|Searching)\u2026?$/i.test(trimmed)) return true;
    if (/Allow\s*once|Always\s*allow|\(y\/n\)|\[Y\/n\]/i.test(trimmed)) return true;
    return false;
}

function isNoiseLine(line) {
    const trimmed = sanitizeLine(line).trim();
    if (!trimmed) return true;
    if (/^…\s+\+\d+\s+lines\b/i.test(trimmed)) return true;
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
        .replace(/^⎿\s+/, '')
        .replace(/^[✻✶✳✢✽]\s+/, '')
        .trim();
}

function collectMeaningfulLines(lines) {
    const out = [];
    let captureDetails = false;
    for (let index = 0; index < lines.length; index++) {
        const rawLine = lines[index];
        const promptText = parsePromptLine(rawLine);
        if (promptText !== null) continue;

        const sanitized = sanitizeLine(rawLine);
        const trimmed = sanitized.trim();
        if (isNoiseLine(trimmed)) continue;
        const nextTrimmed = sanitizeLine(lines[index + 1] || '').trim();
        if (/\u2026\)$/.test(trimmed) && /^⎿\s+/.test(nextTrimmed)) continue;

        const cleaned = stripAssistantPrefix(trimmed);
        if (!cleaned) continue;
        if (/^⏺\s+/.test(trimmed)) {
            captureDetails = /^(?:Bash|Read|Task)\(/.test(cleaned)
                || /^(?:Exact output|Output|Result):/i.test(cleaned);
            if (out[out.length - 1] !== cleaned) out.push(cleaned);
            continue;
        }

        if (/^⎿\s+/.test(trimmed)) {
            if (!captureDetails || /^…\s+\+\d+\s+lines\b/i.test(cleaned)) continue;
            if (out[out.length - 1] !== cleaned) out.push(cleaned);
            continue;
        }

        if (!captureDetails && /^\d+\s+/.test(trimmed)) continue;
        if (cleaned.length === 1 && /^[A-Za-z]$/.test(cleaned)) continue;
        if (out[out.length - 1] !== cleaned) out.push(cleaned);
    }
    return out;
}

function looksLikeStructuredDataLine(text) {
    const line = stripAssistantPrefix(sanitizeLine(text).trim());
    if (!line) return false;
    return /^[{\[]/.test(line)
        || /^[A-Z0-9_]+=/.test(line)
        || /^\/[A-Za-z0-9._/-]+$/.test(line)
        || /^\d+$/.test(line);
}

function extractDenseOutputBlock(text) {
    const lines = splitLines(text);
    const blocks = [];
    let current = [];

    for (const rawLine of lines) {
        const promptText = parsePromptLine(rawLine);
        const sanitized = sanitizeLine(rawLine).trim();
        if (promptText !== null || isNoiseLine(sanitized)) {
            if (current.length > 0) {
                blocks.push(current);
                current = [];
            }
            continue;
        }

        const cleaned = stripAssistantPrefix(sanitized);
        if (!cleaned) {
            if (current.length > 0) {
                blocks.push(current);
                current = [];
            }
            continue;
        }
        current.push(cleaned);
    }

    if (current.length > 0) blocks.push(current);

    const scored = blocks
        .map(block => ({
            block,
            structured: block.filter(looksLikeStructuredDataLine).length,
        }))
        .filter(entry => entry.block.length >= 5 && entry.structured >= Math.max(3, Math.floor(entry.block.length * 0.6)));

    const mergeBlocks = (existing, next) => {
        if (existing.length === 0) return [...next];
        const maxOverlap = Math.min(existing.length, next.length);
        for (let overlap = maxOverlap; overlap >= 1; overlap--) {
            let matches = true;
            for (let i = 0; i < overlap; i++) {
                if (existing[existing.length - overlap + i] !== next[i]) {
                    matches = false;
                    break;
                }
            }
            if (matches) {
                return existing.concat(next.slice(overlap));
            }
        }
        return existing.concat(next);
    };

    const merged = scored.reduce((acc, entry) => mergeBlocks(acc, entry.block), []);
    return merged.join('\n').trim();
}

function collectAssistantBlocks(lines) {
    const blocks = [];
    let current = null;
    for (const rawLine of lines) {
        const sanitized = sanitizeLine(rawLine);
        const trimmed = sanitized.trim();
        if (!trimmed || isNoiseLine(trimmed)) continue;

        if (/^⏺\s+/.test(trimmed)) {
            const title = stripAssistantPrefix(trimmed);
            if (!title) {
                current = null;
                continue;
            }
            current = {
                title,
                lines: [title],
                isTool: /^(?:Bash|Read|Write|Edit|MultiEdit|Task|Glob|Grep|LS|NotebookEdit)\(/.test(title),
            };
            blocks.push(current);
            continue;
        }

        if (!current) continue;
        const cleaned = stripAssistantPrefix(trimmed);
        if (!cleaned || /^…\s+\+\d+\s+lines\b/i.test(cleaned)) continue;
        current.lines.push(cleaned);
    }
    return blocks;
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
    const assistantWindow = lines.slice(assistantStart, end);
    const blocks = collectAssistantBlocks(assistantWindow);
    const lastNarrativeBlock = [...blocks].reverse().find(block => !block.isTool);
    let assistantLines = lastNarrativeBlock
        ? lastNarrativeBlock.lines
        : collectMeaningfulLines(assistantWindow);

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
    if (looksLikePromptEchoText(candidateAssistant, promptText, previousMessages)) return base;
    if (!assistantText && isSpinnerOnlyText(candidateAssistant)) return base;

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
    const terminalHistory = String(input?.terminalHistory || '');
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

    const { promptText, assistantText: visibleAssistantText } = status === 'waiting_approval'
        ? { promptText: '', assistantText: '' }
        : extractVisibleTurn(transcriptSource, previousMessages);
    const denseTerminalOutput = extractDenseOutputBlock(terminalHistory || buffer);
    const assistantText = denseTerminalOutput || visibleAssistantText;
    const rawPartialText = status === 'generating'
        ? extractPartialAssistant(input?.partialResponse || '')
        : '';
    const partialText = (!rawPartialText
        || isSpinnerOnlyText(rawPartialText)
        || looksLikePromptEchoText(rawPartialText, promptText, previousMessages))
        ? ''
        : rawPartialText;
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
