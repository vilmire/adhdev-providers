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
        .replace(/^\s*\d+;/, '');
}

function normalizeText(text) {
    return String(text || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeTranscriptLine(line) {
    return stripAssistantPrefix(sanitizeLine(line))
        .replace(/\s+/g, ' ')
        .trim();
}

function toTranscriptLines(text) {
    return trimBlankEdges(
        splitLines(text).map(line => stripAssistantPrefix(sanitizeLine(line)).trimEnd())
    );
}

function pickPreferredTranscriptLine(left, right) {
    if (!left) return right;
    if (!right) return left;

    const normalizedLeft = normalizeTranscriptLine(left);
    const normalizedRight = normalizeTranscriptLine(right);
    if (!normalizedLeft) return right;
    if (!normalizedRight) return left;
    if (normalizedLeft !== normalizedRight) return right;

    const leftIndent = (left.match(/^\s*/) || [''])[0].length;
    const rightIndent = (right.match(/^\s*/) || [''])[0].length;
    return rightIndent <= leftIndent ? right : left;
}

function mergeTranscriptLineArrays(leftLines, rightLines) {
    const left = trimBlankEdges(Array.isArray(leftLines) ? leftLines : []);
    const right = trimBlankEdges(Array.isArray(rightLines) ? rightLines : []);
    if (left.length === 0) return right.slice();
    if (right.length === 0) return left.slice();

    const normalizedLeft = left.map(normalizeTranscriptLine);
    const normalizedRight = right.map(normalizeTranscriptLine);
    let best = null;

    for (let offset = -right.length; offset <= left.length; offset++) {
        let matches = 0;
        let conflicts = 0;
        let overlap = 0;

        for (let index = 0; index < right.length; index++) {
            const leftIndex = offset + index;
            if (leftIndex < 0 || leftIndex >= left.length) continue;

            const a = normalizedLeft[leftIndex];
            const b = normalizedRight[index];
            if (!a || !b) continue;

            overlap += 1;
            if (a === b) matches += 1;
            else conflicts += 1;
        }

        if (!matches) continue;
        if (conflicts > Math.max(1, Math.floor(matches / 3))) continue;

        const score = (matches * 100) - (conflicts * 25) - Math.abs(offset);
        if (!best || score > best.score || (score === best.score && overlap > best.overlap)) {
            best = { offset, score, overlap };
        }
    }

    if (!best) {
        const leftText = normalizeText(left.join('\n'));
        const rightText = normalizeText(right.join('\n'));
        if (leftText && rightText) {
            if (leftText.includes(rightText)) return left.slice();
            if (rightText.includes(leftText)) return right.slice();
        }
        return right.length >= left.length ? right.slice() : left.slice();
    }

    const merged = [];
    const start = Math.min(0, best.offset);
    const end = Math.max(left.length, best.offset + right.length);
    for (let index = start; index < end; index++) {
        const leftLine = index >= 0 && index < left.length ? left[index] : '';
        const rightIndex = index - best.offset;
        const rightLine = rightIndex >= 0 && rightIndex < right.length ? right[rightIndex] : '';
        merged.push(pickPreferredTranscriptLine(leftLine, rightLine));
    }

    return trimBlankEdges(merged);
}

function mergeAssistantTexts(...texts) {
    const candidates = texts
        .map(text => String(text || '').trim())
        .filter(Boolean);
    if (candidates.length === 0) return '';

    let mergedLines = toTranscriptLines(candidates[0]);
    for (const candidate of candidates.slice(1)) {
        mergedLines = mergeTranscriptLineArrays(mergedLines, toTranscriptLines(candidate));
    }

    return trimTrailingNoise(mergedLines).join('\n').trim();
}

function isStartupPanelText(text) {
    const normalized = normalizeText(text).toLowerCase();
    if (!normalized) return false;

    let score = 0;
    if (normalized.includes('welcome back')) score += 2;
    if (normalized.includes('tips for getting')) score += 1;
    if (normalized.includes('run /init to create')) score += 1;
    if (normalized.includes('recent activity')) score += 1;
    if (normalized.includes('no recent activity')) score += 1;
    if (normalized.includes('claude pro')) score += 1;
    if (normalized.includes(' organization ')) score += 1;
    if (/(?:^|\s)~\/\S+/.test(normalized)) score += 1;

    return score >= 4;
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

function isProgressLine(trimmed) {
    return /^(?:[✻✶✳✢✽·⠂⠐⠒⠓⠦⠴⠶⠷⠿]\s+)?[\p{Lu}][\p{L}\p{M}' -]{2,}ing(?:\.{3}|…)?$/u.test(trimmed);
}

function isSpinnerOnlyText(text) {
    const lines = splitLines(text)
        .map(line => stripAssistantPrefix(sanitizeLine(line).trim()))
        .filter(Boolean);
    if (lines.length === 0) return true;
    return lines.every(line => isStatusLine(line) || isProgressLine(line) || /^(?:[✻✶✳✢✽⠂⠐⠒⠓⠦⠴⠶⠷⠿]+)$/.test(line));
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

function isToolHeaderLine(trimmed) {
    return /^(?:Bash|Read|Write|Edit|MultiEdit|Task|Glob|Grep|LS|NotebookEdit)\(/.test(trimmed)
        || /^(?:Bash|Read|Write|Edit|MultiEdit|Task|Glob|Grep|LS|NotebookEdit)\s+command$/i.test(trimmed)
        || /^(?:Exact output|Output|Result):/i.test(trimmed);
}

function isToolStatusDetail(trimmed) {
    return /^(?:Running|Processing|Thinking|Analyzing|Searching|Reading|Writing|Editing|Updating|Creating|Completed|Done)\u2026?$/i.test(trimmed)
        || /^(?:Running|Wrote|Read|Updated|Edited|Created|Deleted|Matched|Found)\b/i.test(trimmed);
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
    if (isProgressLine(trimmed)) return true;
    if (/^(?:[✻✶✳✢✽·]\s+)?(?:Working|Thinking|Processing|Analyzing|Planning|Drafting|Synthesizing|Inspecting|Reading|Searching)\u2026?$/i.test(trimmed)) return true;
    if (/esc to (cancel|interrupt|stop)/i.test(trimmed)) return true;
    if (/(?:Finagling|Scurrying|Bloviating|Whatchamacallit(?:ing)?|Hatching|Tinkering|Thinking|Processing|Working|Analyzing|Planning|Drafting|Synthesizing|Inspecting|Reading|Searching)\u2026?$/i.test(trimmed)) return true;
    if (isApprovalLine(trimmed)) return true;
    if (isOscResidueLine(trimmed)) return true;
    return false;
}

function isNoiseLine(line) {
    const trimmed = sanitizeLine(line).trim();
    if (!trimmed) return false; // Blank lines are ok
    if (/^…\s+\+\d+\s+lines\b/i.test(trimmed)) return true;
    if (isBoxLine(trimmed)) return true;
    if (isFooterLine(trimmed)) return true;
    if (isStatusLine(trimmed)) return true;
    if (isOscResidueLine(trimmed)) return true;
    if (isToolHeaderLine(trimmed)) return true;
    if (/^Run shell command$/i.test(trimmed)) return true;
    if (/^Do you want to (?:proceed|make this edit|run this command|allow)/i.test(trimmed)) return true;
    if (/^Esc to cancel\b/i.test(trimmed)) return true;
    if (/^Tab to amend\b/i.test(trimmed)) return true;
    if (/^ctrl\+e to explain\b/i.test(trimmed)) return true;
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
        if (!trimmed || isFooterLine(trimmed) || isApprovalLine(trimmed) || isStatusLine(trimmed)) {
            out.pop();
            continue;
        }
        break;
    }
    return out;
}

function stripAssistantPrefix(lineStr) {
    return lineStr
        .replace(/^\s*[⏺]\s+/, '')
        .replace(/^\s*⎿\s+/, '')
        .replace(/^\s*[✻✶✳✢✽]\s+/, '');
}

function pushUniqueLine(lines, value) {
    if (!value) {
        if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
        return;
    }
    if (lines[lines.length - 1] !== value) lines.push(value);
}

function trimBlankEdges(lines) {
    const out = [...lines];
    while (out[0] === '') out.shift();
    while (out[out.length - 1] === '') out.pop();
    return out;
}

function isPathLikeLine(line) {
    const trimmed = String(line || '').trim();
    return /^(?:~\/|\/)[^\s]+$/.test(trimmed);
}

function extractConciseToolResult(lines) {
    const candidates = (Array.isArray(lines) ? lines : [])
        .map(line => String(line || '').trim())
        .filter(Boolean)
        .filter(line => !isPathLikeLine(line))
        .filter(line => !isNoiseLine(line))
        .filter(line => !isStatusLine(line));
    if (candidates.length === 0) return '';
    return candidates[candidates.length - 1];
}

function shouldPreferToolResult(assistantLines, toolLines) {
    const assistantText = trimBlankEdges(Array.isArray(assistantLines) ? assistantLines : []).join('\n').trim();
    const toolResult = extractConciseToolResult(toolLines);
    if (!toolResult) return '';
    if (!assistantText) return toolResult;

    const normalizedAssistant = normalizeText(assistantText).toLowerCase();
    const normalizedTool = normalizeText(toolResult).toLowerCase();
    if (!normalizedAssistant || !normalizedTool) return '';
    if (normalizedAssistant === normalizedTool) return toolResult;

    const toolTokens = normalizedTool
        .split(/[^a-z0-9._-]+/i)
        .filter(token => token.length >= 3 || /^\d+(?:\.\d+){1,}$/.test(token));
    const overlap = toolTokens.filter(token => normalizedAssistant.includes(token)).length;
    const assistantLooksVerbose = normalizedAssistant.length > normalizedTool.length
        || /\b(?:version|located at|installed at|binary|path)\b/i.test(assistantText);

    if (assistantLooksVerbose && overlap >= Math.min(toolTokens.length, 2)) {
        return toolResult;
    }

    return '';
}

function collectContentBlocks(lines) {
    const blocks = [];
    let current = null;
    let allowToolDetails = false;
    let captureToolContinuation = false;
    let skipWrappedToolHeader = false;

    function ensureBlock(kind) {
        if (!current || current.kind !== kind) {
            current = { kind, lines: [] };
            blocks.push(current);
        }
        return current;
    }

    for (let index = 0; index < lines.length; index++) {
        const rawLine = lines[index];
        const promptText = parsePromptLine(rawLine);
        if (promptText !== null) {
            allowToolDetails = false;
            captureToolContinuation = false;
            skipWrappedToolHeader = false;
            current = null;
            continue;
        }

        const sanitized = sanitizeLine(rawLine);
        const trimmed = sanitized.trim();
        if (!trimmed) {
            if (current && current.kind !== 'tool') pushUniqueLine(current.lines, '');
            captureToolContinuation = false;
            skipWrappedToolHeader = false;
            continue;
        }
        if (isNoiseLine(trimmed)) continue;
        const nextTrimmed = sanitizeLine(lines[index + 1] || '').trim();
        if (/\u2026\)$/.test(trimmed) && /^⎿\s+/.test(nextTrimmed)) {
            skipWrappedToolHeader = true;
            continue;
        }

        const cleaned = stripAssistantPrefix(sanitized).trimEnd();

        if (/^\s*⏺\s+/.test(sanitized)) {
            const isToolHeader = isToolHeaderLine(cleaned.trim());
            allowToolDetails = isToolHeader;
            captureToolContinuation = false;
            skipWrappedToolHeader = isToolHeader;
            if (!isToolHeader && cleaned.trim()) {
                pushUniqueLine(ensureBlock('assistant').lines, cleaned);
            }
            continue;
        }

        if (/^\s*⎿\s+/.test(sanitized)) {
            const detail = cleaned.trim();
            if (!allowToolDetails || /^…\s+\+\d+\s+lines\b/i.test(detail) || isToolStatusDetail(detail)) {
                captureToolContinuation = false;
                skipWrappedToolHeader = false;
                continue;
            }
            pushUniqueLine(ensureBlock('tool').lines, detail);
            captureToolContinuation = true;
            skipWrappedToolHeader = false;
            continue;
        }

        if (skipWrappedToolHeader) continue;

        if (captureToolContinuation) {
            if (isNoiseLine(trimmed) || isApprovalLine(trimmed)) {
                captureToolContinuation = false;
            } else {
                pushUniqueLine(ensureBlock('tool').lines, sanitized.trim());
                continue;
            }
        }

        allowToolDetails = false;
        skipWrappedToolHeader = false;
        const kind = current?.kind === 'assistant' ? 'assistant' : 'text';
        if (cleaned.trim()) pushUniqueLine(ensureBlock(kind).lines, cleaned);
    }

    return blocks
        .map(block => ({ ...block, lines: trimBlankEdges(block.lines) }))
        .filter(block => block.lines.length > 0);
}

function collectMeaningfulLines(lines) {
    const blocks = collectContentBlocks(lines);
    const assistantIndex = [...blocks].map((block, index) => ({ block, index }))
        .reverse()
        .find(({ block }) => block.kind === 'assistant' && normalizeText(block.lines.join('\n')))?.index ?? -1;
    if (assistantIndex >= 0) {
        const assistant = blocks[assistantIndex];
        const previousTool = [...blocks.slice(0, assistantIndex)].reverse()
            .find(block => block.kind === 'tool' && normalizeText(block.lines.join('\n')));
        const preferredToolResult = shouldPreferToolResult(assistant.lines, previousTool?.lines);
        return preferredToolResult ? [preferredToolResult] : assistant.lines.slice();
    }

    const textBlock = [...blocks].reverse().find(block => block.kind === 'text' && normalizeText(block.lines.join('\n')));
    if (textBlock) return textBlock.lines.slice();

    const toolBlock = [...blocks].reverse().find(block => block.kind === 'tool' && normalizeText(block.lines.join('\n')));
    const preferredToolResult = shouldPreferToolResult([], toolBlock?.lines);
    return preferredToolResult ? [preferredToolResult] : (toolBlock ? toolBlock.lines.slice() : []);
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
    let assistantLines = collectMeaningfulLines(assistantWindow);

    if (assistantLines.length === 0 && Array.isArray(previousMessages) && previousMessages.length > 0) {
        assistantLines = collectMeaningfulLines(lines);
    }
    assistantLines = trimTrailingNoise(assistantLines);

    return {
        promptText: promptLines.join(' ').trim(),
        assistantText: assistantLines.join('\n').trim(),
    };
}

function extractPartialAssistant(text) {
    const meaningful = collectMeaningfulLines(splitLines(text));
    const assistantText = meaningful.join('\n').trim();
    return isStartupPanelText(assistantText) ? '' : assistantText;
}

function isUsableAssistantText(text, promptText, previousMessages) {
    const normalized = normalizeText(text);
    if (!normalized) return false;
    if (isStartupPanelText(text)) return false;
    if (looksLikePromptEchoText(text, promptText, previousMessages)) return false;
    if (isSpinnerOnlyText(text)) return false;
    return true;
}

function chooseBestAssistantText(candidates, promptText, previousMessages) {
    const usableCandidates = candidates.filter(candidate => isUsableAssistantText(candidate, promptText, previousMessages));
    return mergeAssistantTexts(...usableCandidates);
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

    const candidateAssistant = mergeAssistantTexts(assistantText, partialText);
    if (!candidateAssistant) return base;

    const normalizedAssistant = normalizeText(candidateAssistant);
    if (!normalizedAssistant) return base;
    if (isStartupPanelText(candidateAssistant)) return base;
    if (looksLikePromptEchoText(candidateAssistant, promptText, previousMessages)) return base;
    if (!assistantText && isSpinnerOnlyText(candidateAssistant)) return base;

    const last = base[base.length - 1];
    if (last && last.role === 'assistant') {
        const mergedAssistant = mergeAssistantTexts(last.content, candidateAssistant);
        if (normalizeText(last.content) !== normalizeText(mergedAssistant)) {
            last.content = mergedAssistant;
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
    const recentBuffer = String(input?.recentBuffer || '');
    const terminalHistory = String(input?.terminalHistory || '');
    const tail = String(recentBuffer || (screenText || buffer).slice(-500));
    const previousMessages = Array.isArray(input?.messages) ? input.messages : [];

    const status = detectStatus({
        tail,
        screenText,
        rawBuffer: input?.rawBuffer || '',
    });

    const activeModal = status === 'waiting_approval'
        ? parseApproval({ buffer: screenText || buffer, rawBuffer: input?.rawBuffer || '', tail })
        : null;

    const screenTurn = status === 'waiting_approval' || !screenText
        ? { promptText: '', assistantText: '' }
        : extractVisibleTurn(screenText, previousMessages);
    const bufferTurn = status === 'waiting_approval' || !buffer
        ? { promptText: '', assistantText: '' }
        : extractVisibleTurn(buffer, previousMessages);
    const historyTurn = status === 'waiting_approval' || !terminalHistory
        ? { promptText: '', assistantText: '' }
        : extractVisibleTurn(terminalHistory, previousMessages);
    const promptText = screenTurn.promptText || bufferTurn.promptText || historyTurn.promptText;
    const visibleAssistantText = chooseBestAssistantText(
        [
            screenTurn.assistantText,
            bufferTurn.assistantText,
            historyTurn.assistantText,
            extractPartialAssistant(buffer),
            extractPartialAssistant(terminalHistory),
            extractPartialAssistant(recentBuffer),
        ],
        promptText,
        previousMessages
    );
    const assistantText = status === 'waiting_approval' ? '' : visibleAssistantText;
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
