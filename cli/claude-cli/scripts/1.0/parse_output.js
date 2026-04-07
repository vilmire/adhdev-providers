/**
 * Claude Code — parse_output
 *
 * Keep the parser simple:
 * - trust / approval screens are not assistant transcript
 * - preserve visible assistant blocks and plain bullet/text content
 * - drop tool summaries, tool headers, footer chrome, and spinner noise
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
        .replace(/^\s*\d+;/, '');
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

function looksLikePromptEchoText(candidate, promptText, previousMessages) {
    const normalizedCandidate = normalizeText(candidate);
    if (!normalizedCandidate) return false;
    if (promptText && looksLikeSamePrompt(normalizedCandidate, promptText)) return true;

    const lastUser = [...(Array.isArray(previousMessages) ? previousMessages : [])]
        .reverse()
        .find(message => message?.role === 'user' && typeof message.content === 'string');
    return !!lastUser && looksLikeSamePrompt(normalizedCandidate, lastUser.content);
}

function getLastUserPrompt(previousMessages) {
    return [...(Array.isArray(previousMessages) ? previousMessages : [])]
        .reverse()
        .find(message => message?.role === 'user' && typeof message.content === 'string')
        ?.content || '';
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

function stripAssistantPrefix(line) {
    return String(line || '')
        .replace(/^\s*⏺\s+/, '')
        .replace(/^\s*⎿\s+/, '')
        .replace(/^\s*[✻✶✳✢✽]\s+/, '');
}

function isFooterLine(trimmed) {
    return /^➜\s+\S+/.test(trimmed)
        || /^Update available!/i.test(trimmed)
        || /Claude Code v\d/i.test(trimmed)
        || /Claude Code has switched from npm to native/i.test(trimmed)
        || /^(Sonnet|Opus|Haiku)\b/i.test(trimmed)
        || /^[◐◑◒◓◴◵◶◷◸◹◺◿].*\/effort/i.test(trimmed)
        || /^⏵⏵\s+accept edits on/i.test(trimmed)
        || /^ctrl\+g to edit in VS Code/i.test(trimmed)
        || /^✳\s*Claude Code/i.test(trimmed)
        || /^[▗▖▘▝\s]+~\//.test(trimmed)
        || /\bextra usage\b/i.test(trimmed)
        || /\bthird-party apps\b/i.test(trimmed);
}

function isApprovalLine(trimmed) {
    return /This command requires approval/i.test(trimmed)
        || /Do you want to (?:proceed|make this edit|run this command|allow)/i.test(trimmed)
        || /^([❯›>]\s*)?\d+[.)]\s+/.test(trimmed)
        || /Allow\s*once|Always\s*allow|\(y\/n\)|\[Y\/n\]/i.test(trimmed);
}

function isOscResidueLine(trimmed) {
    return /^\d+;\s*(?:[✻✶✳✢✽⠂⠐⠒⠓⠦⠴⠶⠷⠿·]\s+)?(?:Claude Code|Brief|Working|Thinking|Processing|Searching|Reading|Writing)\b/i.test(trimmed);
}

function isStatusLine(trimmed) {
    if (!trimmed) return true;
    if (/^[✻✶✳✢✽⠂⠐⠒⠓⠦⠴⠶⠷⠿]+$/.test(trimmed)) return true;
    if (/^[⠂⠐⠒⠓⠦⠴⠶⠷⠿]\s+/.test(trimmed)) return true;
    if (/esc to (cancel|interrupt|stop)/i.test(trimmed)) return true;
    if (/(?:Finagling|Scurrying|Bloviating|Whatchamacallit(?:ing)?|Hatching|Tinkering|Thinking|Processing|Working|Analyzing|Planning|Drafting|Synthesizing|Inspecting|Reading|Searching)\u2026?$/i.test(trimmed)) return true;
    return isApprovalLine(trimmed);
}

function isToolHeader(text) {
    return /^\s*(?:Bash|Read|Write|Edit|MultiEdit|Task|Glob|Grep|LS|NotebookEdit)\(/.test(text);
}

function isToolSummaryLine(trimmed) {
    return /\bctrl\+o to expand\)$/i.test(trimmed)
        || /^Read\s+\d+\s+files?\b/i.test(trimmed)
        || /^Searched for \d+ patterns?/i.test(trimmed)
        || /^Listed \d+ director(?:y|ies)/i.test(trimmed)
        || /^Wrote \d+ files?/i.test(trimmed)
        || /^Updated \d+ files?/i.test(trimmed)
        || /^Edited \d+ files?/i.test(trimmed);
}

function isNoiseLine(line) {
    const trimmed = sanitizeLine(line).trim();
    if (!trimmed) return false;
    if (/^…\s+\+\d+\s+lines\b/i.test(trimmed)) return true;
    if (isToolSummaryLine(trimmed)) return true;
    if (isFooterLine(trimmed)) return true;
    if (isStatusLine(trimmed)) return true;
    if (isOscResidueLine(trimmed)) return true;
    if (/^Type your message/i.test(trimmed)) return true;
    if (/^for\s*shortcuts/i.test(trimmed)) return true;
    if (/^\? for help/i.test(trimmed)) return true;
    if (/^Press enter/i.test(trimmed)) return true;
    return false;
}

function trimTrailingNoise(lines) {
    const out = [...lines];
    while (out.length > 0) {
        const trimmed = sanitizeLine(out[out.length - 1]).trim();
        if (!trimmed || isNoiseLine(trimmed) || isBoxLine(trimmed)) {
            out.pop();
            continue;
        }
        break;
    }
    return out;
}

function trimPromptEchoPrefix(text, promptText) {
    const lines = splitLines(text).map(line => line.trim());
    const normalizedPrompt = normalizeText(promptText);
    if (!normalizedPrompt || lines.length === 0) return text;

    let dropCount = 0;
    for (let index = 0; index < Math.min(lines.length, 6); index += 1) {
        const fragment = lines[index].replace(/^[.…]+\s*/, '').trim();
        if (!fragment) {
            if (dropCount === index) dropCount = index + 1;
            continue;
        }
        const normalizedFragment = normalizeText(fragment);
        const fragmentWordCount = normalizedFragment ? normalizedFragment.split(/\s+/).length : 0;
        const canBePromptEcho = normalizedFragment.length >= 16 || fragmentWordCount >= 4;
        if (canBePromptEcho && normalizedFragment && normalizedPrompt.includes(normalizedFragment)) {
            dropCount = index + 1;
            continue;
        }
        break;
    }

    return lines.slice(dropCount).join('\n').trim();
}

function collectAssistantLines(lines) {
    const out = [];
    let skippingToolBlock = false;
    let captureDetailBlock = false;

    for (const rawLine of lines) {
        const promptText = parsePromptLine(rawLine);
        if (promptText !== null) continue;

        const sanitized = sanitizeLine(rawLine);
        const trimmed = sanitized.trim();
        if (isNoiseLine(trimmed)) continue;

        const cleaned = stripAssistantPrefix(sanitized).trim();
        if (!cleaned) {
            skippingToolBlock = false;
            if (out.length > 0 && out[out.length - 1] !== '') out.push('');
            continue;
        }

        if (/^\s*⏺\s+/.test(sanitized)) {
            skippingToolBlock = isToolHeader(cleaned);
            captureDetailBlock = /^\s*(?:Exact output|Output|Result):/i.test(cleaned);
            if (!skippingToolBlock && out[out.length - 1] !== cleaned) out.push(cleaned);
            continue;
        }

        if (/^\s*⎿\s+/.test(sanitized)) {
            if (captureDetailBlock && !/^…\s+\+\d+\s+lines\b/i.test(cleaned)) {
                if (out[out.length - 1] !== cleaned) out.push(cleaned);
            }
            continue;
        }

        if (skippingToolBlock && !captureDetailBlock) continue;
        if (out[out.length - 1] !== cleaned) out.push(cleaned);
    }

    return trimTrailingNoise(out);
}

function cleanupAssistantText(text) {
    return trimTrailingNoise(splitLines(text))
        .map(line => stripAssistantPrefix(sanitizeLine(line)).trim())
        .filter(Boolean)
        .filter(line => !isFooterLine(line) && !isToolSummaryLine(line) && !isBoxLine(line))
        .join('\n')
        .trim();
}

function extractLastAssistantHeader(text) {
    let candidate = '';
    for (const rawLine of splitLines(text)) {
        const sanitized = sanitizeLine(rawLine);
        if (!/^\s*⏺\s+/.test(sanitized)) continue;
        const cleaned = stripAssistantPrefix(sanitized).trim();
        if (!cleaned || isToolHeader(cleaned) || isNoiseLine(cleaned) || isApprovalLine(cleaned)) continue;
        candidate = cleaned;
    }
    return candidate;
}

function extractVisibleTurn(text) {
    const lines = splitLines(text);
    const emptyPromptIndex = (() => {
        for (let i = lines.length - 1; i >= 0; i -= 1) {
            if (parsePromptLine(lines[i]) === '') return i;
        }
        return -1;
    })();

    const lastVisiblePrompt = (() => {
        const end = emptyPromptIndex >= 0 ? emptyPromptIndex - 1 : lines.length - 1;
        for (let i = end; i >= 0; i -= 1) {
            const prompt = parsePromptLine(lines[i]);
            if (prompt) return { index: i, text: prompt };
        }
        return { index: -1, text: '' };
    })();

    const assistantStart = lastVisiblePrompt.index >= 0 ? lastVisiblePrompt.index + 1 : 0;
    const assistantEnd = emptyPromptIndex >= 0 ? emptyPromptIndex : lines.length;
    const assistantLines = collectAssistantLines(lines.slice(assistantStart, assistantEnd));

    return {
        promptText: lastVisiblePrompt.text,
        assistantText: assistantLines.join('\n').trim(),
    };
}

function buildMessages(previousMessages, promptText, assistantText) {
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
        const last = base[base.length - 1];
        const previousUser = last?.role === 'assistant' ? base[base.length - 2] : last;
        if (!previousUser || previousUser.role !== 'user' || !looksLikeSamePrompt(previousUser.content, promptText)) {
            base.push({ role: 'user', content: promptText });
        }
    }

    if (!assistantText) return base;
    if (looksLikePromptEchoText(assistantText, promptText, previousMessages)) return base;

    const last = base[base.length - 1];
    if (last?.role === 'assistant') {
        if (normalizeText(last.content) !== normalizeText(assistantText)) {
            last.content = assistantText;
        }
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

module.exports = function parseOutput(input) {
    const screenText = String(input?.screenText || '');
    const buffer = String(input?.buffer || '');
    const tail = String(input?.recentBuffer || (screenText || buffer).slice(-500));
    const transcriptSource = screenText || buffer;
    const previousMessages = Array.isArray(input?.messages) ? input.messages : [];

    const status = detectStatus({
        tail,
        screenText,
        rawBuffer: input?.rawBuffer || '',
    });

    const activeModal = status === 'waiting_approval'
        ? parseApproval({ buffer: screenText || buffer, screenText, rawBuffer: input?.rawBuffer || '', tail })
        : null;

    const { promptText, assistantText: visibleAssistantText } = status === 'waiting_approval'
        ? { promptText: '', assistantText: '' }
        : extractVisibleTurn(transcriptSource);
    const effectivePromptText = String(input?.promptText || '').trim() || promptText || getLastUserPrompt(previousMessages);
    const assistantText = trimPromptEchoPrefix(
        cleanupAssistantText(visibleAssistantText) || extractLastAssistantHeader(transcriptSource),
        effectivePromptText,
    );

    return {
        id: 'cli_session',
        status,
        title: 'Claude Code',
        messages: toMessageObjects(buildMessages(previousMessages, promptText, assistantText), status),
        activeModal,
    };
};
