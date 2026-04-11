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
const {
    buildScreenSnapshot,
    getScreen,
    linesBelowPrompt,
    trimBottom,
} = require('./screen_helpers.js');

function splitLines(text) {
    return buildScreenSnapshot(text).lines.map(line => line.text);
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

function normalizeAssistantBlockLine(line) {
    const sanitized = sanitizeLine(line).replace(/\s+$/, '');
    const withoutPrefix = stripAssistantPrefix(sanitized);
    if (isBoxLine(withoutPrefix.trim())) return withoutPrefix.trim();
    return withoutPrefix.trimEnd();
}

function isFooterLine(trimmed) {
    return /^➜\s+\S+/.test(trimmed)
        || /^Update available!/i.test(trimmed)
        || /Claude Code v\d/i.test(trimmed)
        || /Claude Code has switched from npm to native/i.test(trimmed)
        || /^●\s+How is Claude doing this session\?/i.test(trimmed)
        || /^How is Claude doing this session\?/i.test(trimmed)
        || /^\d+:\s*(?:Bad|Poor|Okay|Fine|Good)\b.*\b0:\s*Dismiss\b/i.test(trimmed)
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

function isHorizontalSeparatorLine(trimmed) {
    return /^[-─═]{20,}$/.test(trimmed);
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
        if (!trimmed || isNoiseLine(trimmed) || isHorizontalSeparatorLine(trimmed)) {
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
        if (normalizedFragment && looksLikeSamePrompt(normalizedFragment, normalizedPrompt)) {
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
        if (isFooterLine(trimmed)) break;

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

// Split assistant output into text-only segments at ⏺ boundaries.
// Each segment is the prose Claude wrote before/after a tool call.
// Tool headers and indented tool output are stripped — only Claude's text is kept.
function extractAssistantBlocks(lines) {
    const blocks = [];
    let currentText = [];   // prose lines for the current segment
    let inToolContent = false; // inside indented tool-call output

    const flushText = () => {
        const text = trimTrailingNoise(currentText)
            .map(line => normalizeAssistantBlockLine(line))
            .filter(line => line.trim().length > 0)
            .join('\n')
            .trim();
        if (text) blocks.push(text);
        currentText = [];
    };

    for (const rawLine of lines) {
        if (parsePromptLine(rawLine) !== null) continue;

        const sanitized = sanitizeLine(rawLine);
        const trimmed = sanitized.trim();

        if (isFooterLine(trimmed)) { flushText(); break; }

        if (!trimmed) {
            inToolContent = false;
            if (currentText.length > 0 && currentText[currentText.length - 1] !== '') {
                currentText.push('');
            }
            continue;
        }

        if (isNoiseLine(trimmed)) continue;

        // ⏺ line: flush current prose, start a new segment; skip the tool header itself
        if (/^\s*⏺\s+/.test(sanitized)) {
            flushText();
            inToolContent = true;
            continue;
        }

        // ⎿ line: tool output continuation — skip
        if (/^\s*⎿\s+/.test(sanitized)) continue;

        // Indented content immediately after ⏺ (tool output body) — skip
        if (inToolContent && /^\s{2,}/.test(rawLine)) continue;

        inToolContent = false;

        if (isBoxLine(trimmed)) {
            currentText.push(sanitized);
            continue;
        }

        const cleaned = stripAssistantPrefix(sanitized).trim();
        if (cleaned) currentText.push(cleaned);
    }

    flushText();
    return blocks;
}

function cleanupAssistantText(text) {
    return trimTrailingNoise(splitLines(text))
        .map(line => normalizeAssistantBlockLine(line))
        .filter(line => line.trim().length > 0)
        .filter(line => !isFooterLine(line) && !isToolSummaryLine(line))
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
    const screen = typeof text === 'string' ? buildScreenSnapshot(text) : text;
    const lines = screen.lines.map(line => line.text);
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

    const linesAfterVisiblePrompt = lastVisiblePrompt.index >= 0
        ? linesBelowPrompt({
            ...screen,
            promptLineIndex: lastVisiblePrompt.index,
            linesBelowPrompt: screen.lines.slice(lastVisiblePrompt.index + 1),
        }).map(line => line.text)
        : lines;
    const assistantSliceLength = emptyPromptIndex >= 0 && lastVisiblePrompt.index >= 0
        ? Math.max(0, emptyPromptIndex - lastVisiblePrompt.index - 1)
        : linesAfterVisiblePrompt.length;
    const assistantRegion = trimBottom(
        linesAfterVisiblePrompt,
        Math.max(0, linesAfterVisiblePrompt.length - assistantSliceLength),
    );
    const assistantBlocks = extractAssistantBlocks(assistantRegion);
    const assistantText = assistantBlocks.length > 0
        ? assistantBlocks.join('\n\n').trim()
        : collectAssistantLines(assistantRegion).join('\n').trim();

    return {
        promptText: lastVisiblePrompt.text,
        assistantBlocks,
        assistantText,
    };
}

function needsPreformattedRender(text) {
    const value = String(text || '');
    return /[┌┐└┘├┤┬┴┼│─═╭╮╰╯]/.test(value) || (/^\s*\+[-+]+\+\s*$/m.test(value) && /^\s*\|.*\|\s*$/m.test(value));
}

function createAssistantMessage(content) {
    const message = { role: 'assistant', content };
    if (needsPreformattedRender(content)) {
        message.meta = { renderMode: 'preformatted' };
    }
    return message;
}

function buildMessages(previousMessages, promptText, assistantBlocks, assistantText) {
    const base = Array.isArray(previousMessages)
        ? previousMessages
            .filter(message => message && (message.role === 'user' || message.role === 'assistant'))
            .map(message => ({
                role: message.role,
                content: typeof message.content === 'string' ? message.content : String(message.content || ''),
                timestamp: message.timestamp,
                meta: message.meta && typeof message.meta === 'object' ? { ...message.meta } : undefined,
            }))
        : [];
    let sameTurnAsTail = false;

    if (promptText) {
        const last = base[base.length - 1];
        const previousUser = last?.role === 'assistant' ? base[base.length - 2] : last;
        if (!previousUser || previousUser.role !== 'user' || !looksLikeSamePrompt(previousUser.content, promptText)) {
            base.push({ role: 'user', content: promptText });
        } else {
            sameTurnAsTail = true;
        }
    }

    if (sameTurnAsTail) {
        while (base.length > 0 && base[base.length - 1]?.role === 'assistant') {
            base.pop();
        }
    }

    const normalizedBlocks = Array.isArray(assistantBlocks)
        ? assistantBlocks.map(block => trimPromptEchoPrefix(block, promptText)).filter(Boolean)
        : [];
    const effectiveBlocks = normalizedBlocks.length > 0
        ? normalizedBlocks
        : (assistantText ? [assistantText] : []);

    if (effectiveBlocks.length === 0) return base;
    if (effectiveBlocks.length === 1 && looksLikePromptEchoText(effectiveBlocks[0], promptText, previousMessages)) return base;

    const last = base[base.length - 1];
    if (!sameTurnAsTail && effectiveBlocks.length === 1 && last?.role === 'assistant') {
        if (normalizeText(last.content) !== normalizeText(effectiveBlocks[0])) {
            const nextAssistant = createAssistantMessage(effectiveBlocks[0]);
            last.content = nextAssistant.content;
            last.meta = nextAssistant.meta;
        }
        return base;
    }

    for (const block of effectiveBlocks) {
        base.push(createAssistantMessage(block));
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
        ...(message.meta ? { meta: { ...message.meta } } : {}),
        ...(status === 'generating' && index === slice.length - 1 && message.role === 'assistant'
            ? { meta: { ...(message.meta || {}), streaming: true } }
            : {}),
    }));
}

function extractControlValues(screenText) {
    const values = {};
    const lines = splitLines(screenText);

    for (const rawLine of lines) {
        const trimmed = sanitizeLine(rawLine).trim();

        // Model: footer shows "Sonnet" / "Opus" / "Haiku" at line start
        const modelMatch = trimmed.match(/^(Sonnet|Opus|Haiku)\b/i);
        if (modelMatch) {
            values.model = modelMatch[1].toLowerCase();
        }

        // Effort: footer shows "[spinner] medium · /effort" or similar
        const effortMatch = trimmed.match(/\b(low|medium|high|max)\s+[·•]\s+\/effort\b/i);
        if (effortMatch) {
            values.effort = effortMatch[1].toLowerCase();
        }
    }

    return Object.keys(values).length > 0 ? values : undefined;
}

module.exports = function parseOutput(input) {
    const screen = getScreen(input);
    const screenText = String(screen.text || input?.screenText || '');
    const buffer = String(input?.buffer || '');
    const tail = String(input?.recentBuffer || (screenText || buffer).slice(-500));
    const transcriptScreen = screen.lineCount > 0 ? screen : buildScreenSnapshot(buffer);
    const transcriptSource = transcriptScreen.text || screenText || buffer;
    const previousMessages = Array.isArray(input?.messages) ? input.messages : [];

    const status = detectStatus({
        tail,
        screenText,
        screen: transcriptScreen,
        tailScreen: buildScreenSnapshot(tail),
        rawBuffer: input?.rawBuffer || '',
    });

    const activeModal = status === 'waiting_approval'
        ? parseApproval({
            buffer: screenText || buffer,
            screenText,
            screen: transcriptScreen,
            bufferScreen: transcriptScreen,
            rawBuffer: input?.rawBuffer || '',
            tail,
        })
        : null;

    const { promptText, assistantBlocks, assistantText: visibleAssistantText } = status === 'waiting_approval'
        ? { promptText: '', assistantBlocks: [], assistantText: '' }
        : extractVisibleTurn(transcriptScreen);
    const effectivePromptText = String(input?.promptText || '').trim() || promptText || getLastUserPrompt(previousMessages);
    const assistantText = trimPromptEchoPrefix(
        cleanupAssistantText(visibleAssistantText) || extractLastAssistantHeader(transcriptSource),
        effectivePromptText,
    );

    const controlValues = extractControlValues(screenText || buffer);

    return {
        id: 'cli_session',
        status,
        title: 'Claude Code',
        messages: toMessageObjects(buildMessages(previousMessages, promptText, assistantBlocks, assistantText), status),
        activeModal,
        ...(controlValues ? { controlValues } : {}),
    };
};
