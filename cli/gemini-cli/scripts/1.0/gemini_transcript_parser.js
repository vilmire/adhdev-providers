'use strict';

/**
 * Source-aware Gemini CLI terminal transcript parser.
 *
 * Gemini is a full-screen redraw TUI. The same user/assistant turn can appear
 * multiple times in the PTY buffer, while a single `* foo` line may be either a
 * boxed user prompt marker or normal assistant markdown. This parser therefore
 * tokenizes terminal text first, classifies structural prompt/assistant rows,
 * and only then reconciles a current turn.
 */

function stripAnsi(value) {
    return String(value || '')
        // xterm serialize uses cursor-forward escapes instead of literal spaces.
        .replace(/\x1B\[(\d*)C/g, (_match, n) => ' '.repeat(Math.max(1, Number(n) || 1)))
        .replace(/\x1B\[\d*D/g, '')
        .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
        .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, '')
        .replace(/\x1B[P^_X][\s\S]*?(?:\x07|\x1B\\)/g, '')
        .replace(/\x1B(?:[@-Z\\-_])/g, '')
        .replace(/\u0007/g, '');
}

function normalizeNewlines(value) {
    return String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function normalizeText(value) {
    return stripAnsi(normalizeNewlines(value)).trim();
}

function comparableText(value) {
    return normalizeText(value).replace(/\s+/g, ' ').trim().toLowerCase();
}

function looseText(value) {
    return comparableText(value).replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

function looksLikeSameText(left, right) {
    const a = comparableText(left);
    const b = comparableText(right);
    if (!a || !b) return false;
    if (a === b) return true;
    const la = looseText(left);
    const lb = looseText(right);
    if (la && lb && la === lb) return true;
    const min = Math.min(a.length, b.length);
    return min >= 24 && (a.includes(b) || b.includes(a) || la.includes(lb) || lb.includes(la));
}

function removeInlineTerminalProbeArtifacts(value) {
    return String(value || '')
        // Device Attributes / cursor-position responses leaked after ESC is
        // stripped: ESC[?1;2c -> ?1;2c, [?1;2c, or 1;2c.
        .replace(/(^|[\s([{"'`])(?:\[?\??\d{1,4}(?:;\d{1,4})+[cR])(?=$|[\s)\]}"'`.,:;!?])/gi, '$1')
        // Other compact terminal reports occasionally survive as bracketed CSI.
        .replace(/(^|[\s([{"'`])(?:\[\??\d{1,4}(?:;\d{1,4})*[A-Za-z])(?=$|[\s)\]}"'`.,:;!?])/g, '$1')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
}

function cleanLine(line) {
    return removeInlineTerminalProbeArtifacts(stripAnsi(line).replace(/[ \t]+$/g, '')).trim();
}

function stripFrame(line) {
    let value = cleanLine(line);
    // Some Gemini builds render boxed input rows as │ > prompt │. Strip only a
    // balanced-looking outer frame so normal content containing pipes survives.
    if (/^[│┃]\s*.*\s*[│┃]$/.test(value)) {
        value = value.replace(/^[│┃]\s*/, '').replace(/\s*[│┃]$/, '').trim();
    }
    return value;
}

function splitLines(text) {
    return normalizeNewlines(stripAnsi(text)).split('\n').map(line => line.replace(/[ \t]+$/g, ''));
}

function isTerminalProbeArtifactLine(line) {
    const value = cleanLine(line);
    if (!value) return false;
    return /^(?:\[?\??\d{1,4}(?:;\d{1,4})+[cR]|\[\??\d{1,4}(?:;\d{1,4})*[A-Za-z])$/i.test(value);
}

function isTopInputBoxLine(line) {
    const value = cleanLine(line);
    if (!value) return false;
    return /^[▄╭┌┏┍┎═━─_\-\s]{3,}$/u.test(value);
}

function isBottomInputBoxLine(line) {
    const value = cleanLine(line);
    if (!value) return false;
    return /^[▀╰└┗┕┖═━─_\-\s]{3,}$/u.test(value);
}

function isDividerLine(line) {
    const value = cleanLine(line);
    if (!value) return false;
    return /^[─═━╭╮╰╯│┃┌┐└┘├┤┬┴┼▀▄_\-=\s]+$/u.test(value);
}

function isGeminiChromeLine(line) {
    const value = stripFrame(line);
    if (!value) return false;
    if (isTerminalProbeArtifactLine(value)) return true;
    if (isDividerLine(value)) return true;
    if (/^[\u2800-\u28ff]+(?:\s+.*)?$/u.test(value) && /Thinking|Generating|esc to/i.test(value)) return true;
    if (/^workspace\s*\(\/directory\)/i.test(value)) return true;
    if (/^\/[^\s]+.*\bsandbox\b.*\bmodel\b/i.test(value)) return true;
    if (/\bsandbox\b.*\/model.*\bquota\b/i.test(value)) return true;
    if (/\?\s*for\s*shortcuts/i.test(value)) return true;
    if (/\bGEMINI\.md\b/i.test(value)) return true;
    if (/^YOLO\b/i.test(value)) return true;
    if (/Type your message(?:\s+or\s+@path\/to\/file)?/i.test(value)) return true;
    if (/^(Thinking|Generating|Waiting for authentication)\b/i.test(value)) return true;
    if (/\bThinking\.\.\.\s*\(esc to cancel/i.test(value)) return true;
    if (/^No changes detected\.?$/i.test(value)) return true;
    if (/^Verification Complete:/i.test(value)) return true;
    return false;
}

function previousMeaningfulLine(lines, index) {
    for (let i = index - 1; i >= 0; i -= 1) {
        const value = cleanLine(lines[i]);
        if (value) return value;
    }
    return '';
}

function parseUserMarker(line) {
    const value = stripFrame(line);
    const match = value.match(/^([*>›❯])\s*(.*)$/u);
    if (!match) return null;
    const content = removeInlineTerminalProbeArtifacts(match[2] || '').trim();
    if (!content || /Type your message/i.test(content)) return null;
    return { marker: match[1], content };
}

function isStructuralUserLine(lines, index, insideInputBox) {
    const marker = parseUserMarker(lines[index]);
    if (!marker) return false;
    const prev = previousMeaningfulLine(lines, index);
    const previousLooksLikeBoxTop = isTopInputBoxLine(prev) || isDividerLine(prev);
    if (marker.marker === '*') return insideInputBox || previousLooksLikeBoxTop;
    return insideInputBox || previousLooksLikeBoxTop || index === 0;
}

function stripAssistantMarker(line) {
    const value = stripFrame(line);
    const match = value.match(/^✦\s*(.*)$/u);
    if (!match) return null;
    return removeInlineTerminalProbeArtifacts(match[1] || '').trim();
}

function pushCandidate(candidates, candidate) {
    const content = normalizeText(candidate?.content);
    if (!content) return;
    const normalized = { ...candidate, content };
    const previous = candidates[candidates.length - 1];
    if (previous && previous.role === normalized.role && comparableText(previous.content) === comparableText(normalized.content)) {
        return;
    }
    candidates.push(normalized);
}

function parseCandidates(source, transcript) {
    const lines = splitLines(transcript);
    const candidates = [];
    let current = null;
    let insideInputBox = false;

    function flush(endIndex) {
        if (!current) return;
        pushCandidate(candidates, {
            source,
            role: current.role,
            content: current.lines.join('\n'),
            kind: 'standard',
            sourceRange: { startLine: current.startLine, endLine: endIndex },
            confidence: current.confidence || 'candidate',
        });
        current = null;
    }

    for (let index = 0; index < lines.length; index += 1) {
        const rawLine = lines[index];
        const line = stripFrame(rawLine);

        if (isTerminalProbeArtifactLine(rawLine)) continue;

        if (isTopInputBoxLine(rawLine)) {
            flush(index - 1);
            insideInputBox = true;
            continue;
        }
        if (isBottomInputBoxLine(rawLine)) {
            flush(index - 1);
            insideInputBox = false;
            continue;
        }

        const assistantStart = stripAssistantMarker(rawLine);
        if (assistantStart !== null) {
            flush(index - 1);
            current = { role: 'assistant', lines: [], startLine: index, confidence: 'current-turn' };
            if (assistantStart) current.lines.push(assistantStart);
            insideInputBox = false;
            continue;
        }

        if (isStructuralUserLine(lines, index, insideInputBox)) {
            flush(index - 1);
            const marker = parseUserMarker(rawLine);
            current = { role: 'user', lines: [marker.content], startLine: index, confidence: 'current-turn' };
            continue;
        }

        if (isGeminiChromeLine(rawLine)) {
            flush(index - 1);
            continue;
        }

        if (!current) continue;
        if (!line) {
            current.lines.push('');
            continue;
        }
        current.lines.push(line);
    }
    flush(lines.length - 1);
    return candidates;
}

function splitIntoTurns(candidates) {
    const turns = [];
    let current = null;
    for (const candidate of candidates) {
        if (candidate.role === 'user') {
            if (current) turns.push(current);
            current = { user: candidate, assistants: [] };
            continue;
        }
        if (candidate.role === 'assistant') {
            if (!current) current = { user: null, assistants: [] };
            current.assistants.push(candidate);
        }
    }
    if (current) turns.push(current);
    return turns;
}

function materializeTurn(turn, explicitPrompt) {
    const messages = [];
    const prompt = normalizeText(explicitPrompt) || normalizeText(turn?.user?.content);
    if (prompt) messages.push({ role: 'user', content: prompt, kind: 'standard' });
    const assistant = turn?.assistants?.filter(item => normalizeText(item.content)).at(-1);
    if (assistant) messages.push({ role: 'assistant', content: assistant.content, kind: 'standard' });
    return messages;
}

function reconcileCurrentTurn(candidates, explicitPrompt) {
    const prompt = normalizeText(explicitPrompt);
    const turns = splitIntoTurns(candidates);
    if (turns.length === 0) return prompt ? [{ role: 'user', content: prompt, kind: 'standard' }] : [];

    if (prompt) {
        for (let i = turns.length - 1; i >= 0; i -= 1) {
            const userContent = turns[i].user?.content || '';
            if (userContent && looksLikeSameText(userContent, prompt)) {
                return materializeTurn(turns[i], prompt);
            }
        }
        const lastAssistantTurn = [...turns].reverse().find(turn => turn.assistants.length > 0);
        if (lastAssistantTurn) return materializeTurn({ user: null, assistants: lastAssistantTurn.assistants }, prompt);
        return [{ role: 'user', content: prompt, kind: 'standard' }];
    }

    const lastComplete = [...turns].reverse().find(turn => turn.user || turn.assistants.length > 0);
    return materializeTurn(lastComplete, '');
}

function parseGeminiMessages(input, transcript) {
    const explicitPrompt = normalizeText(input?.promptText);
    const candidates = parseCandidates('transcript', transcript);
    return reconcileCurrentTurn(candidates, explicitPrompt);
}

module.exports = {
    stripAnsi,
    normalizeText,
    comparableText,
    looksLikeSameText,
    removeInlineTerminalProbeArtifacts,
    cleanLine,
    parseCandidates,
    parseGeminiMessages,
    reconcileCurrentTurn,
};
