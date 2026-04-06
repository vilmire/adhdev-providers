/**
 * Claude Code — parse_output
 *
 * Rewritten to favor simple regex classifiers over heuristic merging.
 */

'use strict';

const detectStatus = require('./detect_status.js');
const parseApproval = require('./parse_approval.js');

function splitLines(text) {
    return String(text || '')
        .replace(/\u0007/g, '')
        .split(/\r\n|\n|\r/g)
        .map((line) => line.replace(/\s+$/, ''));
}

function normalize(line) {
    return String(line || '')
        .replace(/\u0007/g, '')
        .replace(/^\s*\d+;/, '')
        .trim();
}

function normalizeText(text) {
    return String(text || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenizePrompt(text) {
    return normalizeText(text)
        .toLowerCase()
        .split(/[^a-z0-9가-힣_.:/-]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 4);
}

function isPromptLine(line) {
    return /^[❯›>]\s*$/.test(normalize(line));
}

function isPromptWithTextLine(line) {
    return /^[❯›>]\s+\S/.test(normalize(line));
}

function isAssistantLeadLine(line) {
    return /^(?:[⏺•]\s+)\S/.test(normalize(line));
}

function isShellChrome(line) {
    const trimmed = normalize(line);
    return /^➜\s+\S+/.test(trimmed)
        || /Update available!/i.test(trimmed)
        || /ctrl\+g to edit in VS Code/i.test(trimmed)
        || /accept edits on/i.test(trimmed)
        || /Claude Code v\d/i.test(trimmed)
        || /\b(?:Sonnet|Opus|Haiku)\b/i.test(trimmed)
        || /\/effort/i.test(trimmed);
}

function isStartupLine(line) {
    const trimmed = normalize(line);
    return /welcome back/i.test(trimmed)
        || /tips for getting started/i.test(trimmed)
        || /recent activity/i.test(trimmed)
        || /run \/init to create/i.test(trimmed)
        || /no recent activity/i.test(trimmed)
        || /claude pro/i.test(trimmed)
        || /organization/i.test(trimmed)
        || /~\/\S+/.test(trimmed);
}

function isApprovalCue(line) {
    const trimmed = normalize(line);
    return /requires approval/i.test(trimmed)
        || /Do you want to (?:proceed|allow|run|make this edit)/i.test(trimmed)
        || /\(y\/n\)/i.test(trimmed)
        || /\[Y\/n\]/i.test(trimmed);
}

function isApprovalButton(line) {
    const trimmed = normalize(line);
    return /^([❯›>]\s*)?\d+[.)]\s+/.test(trimmed)
        || /^(?:Allow once|Always allow|Yes|No|Deny|Reject|Cancel|Proceed)\b/i.test(trimmed)
        || /^Yes,\s+and\s+don['’]t\s+ask\s+again\b/i.test(trimmed);
}

function isStatusLine(line) {
    const trimmed = normalize(line);
    if (!trimmed || isShellChrome(trimmed)) return false;

    return /^[✻✶✳✢✽·⠂⠐⠒⠓⠦⠴⠶⠷⠿]+$/.test(trimmed)
        || /Esc to (?:cancel|interrupt|stop)/i.test(trimmed)
        || /[↑↓]\s*\d+(?:\.\d+)?k?\s*tokens\)/i.test(trimmed)
        || /\(\s*(?:\d+h\s*)?(?:\d+m\s*)?(?:\d+s)(?:\s*·\s*[↑↓]\s*\d+(?:\.\d+)?k?\s*tokens)?\s*\)$/i.test(trimmed)
        || /^(?:[✻✶✳✢✽·⠂⠐⠒⠓⠦⠴⠶⠷⠿]\s*)?[A-Z][\p{L}\p{M}'-]{2,}(?:ing|ed)(?:\s+[^\n()]*)?(?:\s*[.…]{1,3})?(?:\s+\([^)]*\))?$/u.test(trimmed);
}

function isToolLine(line) {
    const trimmed = normalize(line);
    return /^⎿\s+/.test(trimmed)
        || /^(?:[⏺•]\s+)?(?:Bash|Read|Write|Edit|MultiEdit|Task|Glob|Grep|LS|NotebookEdit|WebFetch|WebSearch|TodoWrite|NotebookRead|ExitPlanMode)\(/.test(trimmed)
        || /^(?:[⏺•]\s+)?Bash command\b/i.test(trimmed)
        || /^[A-Z][A-Za-z0-9_-]*\(/.test(trimmed)
        || /^\+\d+\s+more\s+(?:tool\s+uses?|steps?|actions?)\b/i.test(trimmed)
        || /^\(ctrl\+[a-z].*\)$/i.test(trimmed)
        || /^Show more\b/i.test(trimmed)
        || /^Read\s+\d+\s+files?\b/i.test(trimmed)
        || /^Wrote\s+\d+\s+files?\b/i.test(trimmed)
        || /^Edited\s+\d+\s+files?\b/i.test(trimmed)
        || /^Updated\s+\d+\s+files?\b/i.test(trimmed)
        || /^Created\s+\d+\s+files?\b/i.test(trimmed)
        || /^Deleted\s+\d+\s+files?\b/i.test(trimmed)
        || /^Debug\b/i.test(trimmed)
        || /^Trace\b/i.test(trimmed)
        || /^🖱️\s+/i.test(trimmed)
        || /\bTip:\s+Use \/permissions\b/i.test(trimmed);
}

function isBoxLine(line) {
    return /^[─═╭╮╰╯│┌┐└┘├┤┬┴┼]+$/.test(normalize(line));
}

function isNoiseLine(line) {
    const trimmed = normalize(line);
    return !trimmed
        || isBoxLine(trimmed)
        || isShellChrome(trimmed)
        || isStartupLine(trimmed)
        || isPromptLine(trimmed)
        || isApprovalCue(trimmed)
        || isApprovalButton(trimmed)
        || isStatusLine(trimmed)
        || isToolLine(trimmed);
}

function cleanTranscriptLine(line) {
    return normalize(line)
        .replace(/^(?:[✻✶✳✢✽·⠂⠐⠒⠓⠦⠴⠶⠷⠿]\s*)/, '')
        .replace(/^(?:[⏺•]\s+)/, '')
        .trim();
}

function isAssistantBlockLead(line) {
    const trimmed = normalize(line);
    if (!/^(?:[⏺•]\s+)\S/.test(trimmed)) return false;
    return !isToolLine(trimmed);
}

function isToolBlockLead(line) {
    const trimmed = normalize(line);
    return /^(?:[⏺•]\s+)\S/.test(trimmed) && isToolLine(trimmed);
}

function isTranscriptContinuationLine(line) {
    const raw = String(line || '');
    const trimmed = normalize(raw);
    if (!trimmed) return false;
    if (isNoiseLine(trimmed)) return false;
    if (isAssistantBlockLead(trimmed)) return false;
    if (isToolBlockLead(trimmed)) return false;
    if (/^[⏺•]\s+/.test(trimmed)) return false;
    return /^\s+/.test(raw) || /^[A-Za-z0-9가-힣_[({"'`-]/.test(trimmed);
}

function lastUserPrompt(messages) {
    const lastUser = [...(Array.isArray(messages) ? messages : [])]
        .reverse()
        .find((message) => message && message.role === 'user' && typeof message.content === 'string');
    return lastUser ? lastUser.content : '';
}

function findPromptBoundary(lines, promptText) {
    const tokens = tokenizePrompt(promptText);

    for (let index = lines.length - 1; index >= 0; index -= 1) {
        const line = normalize(lines[index]);
        if (!isPromptWithTextLine(line)) continue;
        if (tokens.length === 0) return index;
        const lower = line.toLowerCase();
        const matches = tokens.filter((token) => lower.includes(token)).length;
        if (matches >= Math.min(tokens.length, 3)) return index;
    }

    if (tokens.length === 0) return -1;
    for (let index = lines.length - 1; index >= 0; index -= 1) {
        const line = normalize(lines[index]).toLowerCase();
        const matches = tokens.filter((token) => line.includes(token)).length;
        if (matches >= Math.min(tokens.length, 3)) return index;
    }

    return -1;
}

function trimBlankEdges(lines) {
    let start = 0;
    let end = lines.length;
    while (start < end && !lines[start]) start += 1;
    while (end > start && !lines[end - 1]) end -= 1;
    return lines.slice(start, end);
}

function collapseLines(lines) {
    const result = [];
    for (const value of lines) {
        const line = String(value || '');
        if (!line) {
            if (result[result.length - 1] !== '') result.push('');
            continue;
        }
        if (result[result.length - 1] !== line) result.push(line);
    }
    return trimBlankEdges(result);
}

function looksLikePromptEcho(text, promptText) {
    const candidate = normalizeText(text).toLowerCase();
    const prompt = normalizeText(promptText).toLowerCase();
    if (!candidate || !prompt) return false;
    return candidate === prompt || candidate.startsWith(prompt) || prompt.startsWith(candidate);
}

function isPromptFragmentLine(line, promptText) {
    const normalizedLine = normalizeText(line).toLowerCase();
    const normalizedPrompt = normalizeText(promptText).toLowerCase();
    if (!normalizedLine || !normalizedPrompt) return false;
    if (normalizedPrompt.includes(normalizedLine)) return true;

    const promptTokens = tokenizePrompt(promptText);
    if (promptTokens.length === 0) return false;
    const matched = promptTokens.filter((token) => normalizedLine.includes(token)).length;
    return matched >= Math.min(promptTokens.length, 2) && normalizedLine.length <= normalizedPrompt.length;
}

function extractAssistantText(sourceText, promptText) {
    if (!normalizeText(promptText)) return '';
    const allLines = splitLines(sourceText);
    const boundary = findPromptBoundary(allLines, promptText);
    const candidateLines = boundary >= 0 ? allLines.slice(boundary + 1) : allLines.slice(-40);

    let index = 0;
    while (index < candidateLines.length) {
        const trimmed = normalize(candidateLines[index]);
        if (!trimmed || isPromptFragmentLine(trimmed, promptText)) {
            index += 1;
            continue;
        }
        break;
    }

    let lastBlock = [];
    while (index < candidateLines.length) {
        const rawLine = candidateLines[index];
        const trimmed = normalize(rawLine);

        if (!trimmed || isBoxLine(trimmed) || isPromptLine(trimmed) || isShellChrome(trimmed) || isStartupLine(trimmed)) {
            index += 1;
            continue;
        }

        if (isToolBlockLead(trimmed)) {
            index += 1;
            while (index < candidateLines.length) {
                const toolTrimmed = normalize(candidateLines[index]);
                if (!toolTrimmed) {
                    index += 1;
                    break;
                }
                if (isAssistantBlockLead(toolTrimmed) || isToolBlockLead(toolTrimmed) || isBoxLine(toolTrimmed) || isPromptLine(toolTrimmed)) break;
                index += 1;
            }
            continue;
        }

        if (!isAssistantBlockLead(trimmed)) {
            index += 1;
            continue;
        }

        const block = [];
        const lead = cleanTranscriptLine(trimmed);
        if (lead) block.push(lead);
        index += 1;

        while (index < candidateLines.length) {
            const continuationRaw = candidateLines[index];
            const continuationTrimmed = normalize(continuationRaw);
            if (!continuationTrimmed) {
                index += 1;
                break;
            }
            if (isAssistantBlockLead(continuationTrimmed) || isToolBlockLead(continuationTrimmed) || isBoxLine(continuationTrimmed) || isPromptLine(continuationTrimmed) || isShellChrome(continuationTrimmed) || isStartupLine(continuationTrimmed)) break;
            if (isTranscriptContinuationLine(continuationRaw)) {
                block.push(continuationTrimmed);
            }
            index += 1;
        }

        if (block.length > 0) lastBlock = block;
    }

    const text = collapseLines(lastBlock).join('\n').trim();
    if (!text) return '';
    if (looksLikePromptEcho(text, promptText)) return '';
    return text;
}

function extractPartialText(partialResponse, promptText) {
    const cleaned = splitLines(partialResponse)
        .map((line) => normalize(line))
        .filter((line) => line && !isNoiseLine(line))
        .map(cleanTranscriptLine);
    const text = collapseLines(cleaned).join('\n').trim();
    if (!text) return '';
    if (looksLikePromptEcho(text, promptText)) return '';
    return text;
}

function looksLikeToolChurnText(text) {
    const lines = splitLines(text)
        .map((line) => normalize(line))
        .filter(Boolean);
    if (lines.length === 0) return false;

    const noisyLines = lines.filter((line) =>
        /ctrl\+[a-z]/i.test(line)
        || /\bmore\b.*\buses?\b/i.test(line)
        || /\bTip:\s+Use \/permissions\b/i.test(line)
        || /^(?:Bash|Read|Write|Edit|MultiEdit|Task|Glob|Grep|LS|NotebookEdit|WebFetch|WebSearch|TodoWrite|NotebookRead|ExitPlanMode|Explore|Search)\(/.test(line)
        || /^Bash command\b/i.test(line)
        || /^[A-Z][A-Za-z0-9_-]*\(/.test(line)
        || /^[⏺•]$/.test(line)
        || /^[A-Za-z]\s+[A-Za-z](?:\s+[A-Za-z]){2,}/.test(line)
        || /^[^\s]{1,3}$/.test(line)
    ).length;

    return noisyLines >= Math.max(2, Math.ceil(lines.length * 0.35));
}

function normalizeBaseMessages(messages) {
    return (Array.isArray(messages) ? messages : [])
        .filter((message) => message && (message.role === 'user' || message.role === 'assistant'))
        .map((message, index) => ({
            id: message.id || `msg_${index}`,
            role: message.role,
            content: String(message.content || ''),
            timestamp: message.timestamp,
            index,
            kind: 'standard',
        }));
}

module.exports = function parseOutput(input) {
    const screenText = String(input?.screenText || '');
    const buffer = String(input?.buffer || '');
    const recentBuffer = String(input?.recentBuffer || '');
    const tail = recentBuffer || screenText || buffer.slice(-2000);
    const status = detectStatus({ tail, screenText, rawBuffer: input?.rawBuffer || '' });
    const activeModal = status === 'waiting_approval'
        ? parseApproval({ buffer, screenText, tail, rawBuffer: input?.rawBuffer || '' })
        : null;

    const messages = normalizeBaseMessages(input?.messages);
    const promptText = lastUserPrompt(messages);
    const transcriptSource = screenText || recentBuffer || buffer;
    const assistantText = extractAssistantText(transcriptSource, promptText);
    const partialText = extractPartialText(input?.partialResponse || '', promptText);
    const candidateAssistant = assistantText || partialText;

    if (candidateAssistant && !(status === 'generating' && looksLikeToolChurnText(candidateAssistant))) {
        const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant');
        if (!lastAssistant || normalizeText(lastAssistant.content) !== normalizeText(candidateAssistant)) {
            messages.push({
                id: `msg_${messages.length}`,
                role: 'assistant',
                content: candidateAssistant,
                index: messages.length,
                kind: 'standard',
                meta: status === 'generating' ? { streaming: true } : undefined,
            });
        }
    }

    return {
        id: 'cli_session',
        status,
        messages,
        activeModal,
    };
};
