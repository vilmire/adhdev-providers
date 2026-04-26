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

function tokenizePrompt(text) {
    return String(text || '')
        .replace(/\s+/g, ' ')
        .trim()
        .split(/[^A-Za-z0-9_.:/-가-힣]+/)
        .map((token) => token.trim().toLowerCase())
        .filter((token) => token.length >= 2);
}

function lineMatchesPrompt(line, promptText) {
    const normalizedLine = normalize(line).toLowerCase();
    const normalizedPrompt = normalize(promptText).toLowerCase();
    if (!normalizedLine || !normalizedPrompt) return false;
    if (normalizedLine === normalizedPrompt) return true;
    if (normalizedLine.length >= 24 && normalizedPrompt.startsWith(normalizedLine)) return true;
    const promptTokens = tokenizePrompt(promptText);
    const lineTokens = tokenizePrompt(line);
    if (lineTokens.length === 0 || promptTokens.length === 0) return false;
    const promptTokenSet = new Set(promptTokens);
    const matches = lineTokens.filter((token) => promptTokenSet.has(token)).length;
    return matches >= 4 && matches / lineTokens.length >= 0.75;
}

function parsePromptLine(line) {
    const trimmed = sanitize(line).trim();
    if (!trimmed) return null;
    if (/^→\s*(?:Plan, search, build anything|Add a follow-up)(?:\s+ctrl\+c to stop)?$/i.test(trimmed)) return '';
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
        || /^Cursor Agent$/i.test(trimmed)
        || /^v\d{4}\.\d{2}\.\d{2}-/i.test(trimmed)
        || /^hint:\s*\/auto-run/i.test(trimmed)
        || /^Composer\b.+$/i.test(trimmed)
        || /^Auto\s+·\s+\d+(?:\.\d+)?%\s+·\s+\d+\s+file edited$/i.test(trimmed)
        || /^ctrl\+r to review (?:edits|changed files)$/i.test(trimmed)
        || /^…\s+truncated \(.+ctrl\+o to expand/i.test(trimmed)
        || /^\/(?:private\/)?(?:tmp|Users)\//.test(trimmed)
        || /Update available!/i.test(trimmed)
        || /\b\d+(?:\.\d+)?[KM]?\s+tokens used\b/i.test(trimmed)
        || /\b\d+% context left\b/i.test(trimmed)
        || /⏎\s+send/i.test(trimmed)
        || /⌃J\s+newline/i.test(trimmed)
        || /⌃T\s+transcript/i.test(trimmed)
        || /⌃C\s+quit/i.test(trimmed);
}

function isStatusLine(trimmed) {
    return !trimmed
        || /^[\u2800-\u28ff\s]+$/.test(trimmed)
        || /esc to (cancel|interrupt|stop)/i.test(trimmed)
        || /(thinking|processing|generating|working|analyzing|planning|reading|searching|inspecting|composing)/i.test(trimmed);
}

function isRawOutputLine(trimmed) {
    return /^[A-Z][A-Z0-9_]*=/.test(trimmed);
}

function isApprovalLine(trimmed) {
    return /Allow\s*once/i.test(trimmed)
        || /Always\s*allow/i.test(trimmed)
        || /\(y\/n\)|\[Y\/n\]/i.test(trimmed)
        || (/approve|confirm/i.test(trimmed) && /deny|cancel/i.test(trimmed));
}

function cleanContentLine(line) {
    const trimmed = sanitize(line).trim();
    if (!trimmed || isBoxLine(trimmed) || isFooterLine(trimmed) || isStatusLine(trimmed) || isApprovalLine(trimmed)) return '';
    if (/^\$\s+/.test(trimmed)) return '';
    return trimmed.replace(/^[⏺•]\s+/, '').trim();
}

function isBoxTableRow(trimmed) {
    return /^[│┃].*[│┃]$/.test(trimmed);
}

function toMarkdownTable(lines) {
    const rows = lines
        .map((line) => sanitize(line).trim())
        .filter((line) => isBoxTableRow(line))
        .map((line) => line.slice(1, -1).split(/[│┃]/).map((cell) => cell.trim()).filter(Boolean));
    if (rows.length < 2) return lines;
    const header = `| ${rows[0].join(' | ')} |`;
    const separator = `| ${rows[0].map(() => '---').join(' | ')} |`;
    const body = rows.slice(1).map((row) => `| ${row.join(' | ')} |`);
    return [header, separator, ...body];
}

function looksLikeCodeLine(line) {
    const trimmed = sanitize(line).trim();
    if (!trimmed) return false;
    if (isRawOutputLine(trimmed)) return false;
    return /^(?:import\b|from\b|def\b|class\b|if __name__ ==|for\b|while\b|try:|except\b|with\b|return\b|print\(|[A-Za-z_][A-Za-z0-9_]*\s*=|\S.*:\s*$)/.test(trimmed);
}

function rehydrateAssistantSections(text) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    const lines = splitLines(raw);
    const out = [];
    let index = 0;

    while (index < lines.length) {
        const trimmed = sanitize(lines[index]).trim();
        if (!trimmed) {
            out.push('');
            index += 1;
            continue;
        }

        if (isBoxTableRow(trimmed)) {
            const tableLines = [];
            while (index < lines.length && (isBoxTableRow(sanitize(lines[index]).trim()) || /^[├┤┬┴┼┌┐└┘─═]+$/.test(sanitize(lines[index]).trim()))) {
                tableLines.push(lines[index]);
                index += 1;
            }
            out.push(...toMarkdownTable(tableLines));
            continue;
        }

        if (looksLikeCodeLine(trimmed)) {
            const codeLines = [];
            while (index < lines.length && (!sanitize(lines[index]).trim() || looksLikeCodeLine(lines[index]))) {
                codeLines.push(lines[index]);
                index += 1;
            }
            out.push('```python');
            out.push(...codeLines.map((line) => sanitize(line).replace(/^\+\s*/, '')));
            out.push('```');
            continue;
        }

        if (isRawOutputLine(trimmed)) {
            const outputLines = [];
            while (index < lines.length) {
                const current = sanitize(lines[index]).trim();
                if (!current || isRawOutputLine(current) || (/^\d/.test(current) && outputLines.length > 0)) {
                    outputLines.push(sanitize(lines[index]));
                    index += 1;
                    continue;
                }
                break;
            }
            out.push('```text');
            out.push(...outputLines);
            out.push('```');
            continue;
        }

        out.push(trimmed);
        index += 1;
    }

    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
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

function extractRawVerifySection(lines, end) {
    for (let i = end - 1; i >= 0; i--) {
        const trimmed = sanitize(lines[i]).trim();
        if (/^RAW VERIFY RESULT$/i.test(trimmed)) {
            const assistantLines = collectMeaningfulLines(lines.slice(i, end));
            if (assistantLines.length > 0) return assistantLines;
        }
    }
    return [];
}

function extractLastResponseBlock(lines, end) {
    let blockEnd = end;
    while (blockEnd > 0 && !sanitize(lines[blockEnd - 1]).trim()) blockEnd -= 1;
    let blockStart = blockEnd;
    while (blockStart > 0 && sanitize(lines[blockStart - 1]).trim()) blockStart -= 1;
    return collectMeaningfulLines(lines.slice(blockStart, blockEnd));
}

function extractVisibleTurn(text, previousMessages) {
    const lines = splitLines(text);
    const lastUserMessage = Array.isArray(previousMessages)
        ? [...previousMessages].reverse().find((message) => message?.role === 'user' && normalize(message.content))
        : null;
    const emptyPromptIndex = (() => {
        for (let i = lines.length - 1; i >= 0; i--) {
            if (parsePromptLine(lines[i]) === '') {
                return i;
            }
        }
        return -1;
    })();

    if (lastUserMessage) {
        const promptAnchor = String(lastUserMessage.content || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean) || String(lastUserMessage.content || '');
        let matchedPromptIndex = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lineMatchesPrompt(lines[i], promptAnchor)) matchedPromptIndex = i;
        }
        if (matchedPromptIndex >= 0) {
            let assistantStart = matchedPromptIndex + 1;
            while (assistantStart < lines.length && sanitize(lines[assistantStart]).trim()) assistantStart += 1;
            while (assistantStart < lines.length && !sanitize(lines[assistantStart]).trim()) assistantStart += 1;
            const end = emptyPromptIndex >= assistantStart ? emptyPromptIndex : lines.length;
            const assistantLines = collectMeaningfulLines(lines.slice(assistantStart, end));
            if (assistantLines.length > 0) {
                return {
                    promptText: '',
                    assistantText: rehydrateAssistantSections(assistantLines.join('\n').trim()),
                };
            }
        }

        const end = emptyPromptIndex >= 0 ? emptyPromptIndex : lines.length;
        const rawVerifyLines = extractRawVerifySection(lines, end);
        if (rawVerifyLines.length > 0) {
            return {
                promptText: '',
                assistantText: rehydrateAssistantSections(rawVerifyLines.join('\n').trim()),
            };
        }
        const responseBlockLines = extractLastResponseBlock(lines, end);
        if (responseBlockLines.length > 0) {
            return {
                promptText: '',
                assistantText: rehydrateAssistantSections(responseBlockLines.join('\n').trim()),
            };
        }
    }

    let fallbackEmptyPromptIndex = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
        if (parsePromptLine(lines[i]) === '') {
            fallbackEmptyPromptIndex = i;
            break;
        }
    }

    const userPrompt = (() => {
        const upperBound = fallbackEmptyPromptIndex >= 0 ? fallbackEmptyPromptIndex - 1 : lines.length - 1;
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

    const end = fallbackEmptyPromptIndex >= 0 ? fallbackEmptyPromptIndex : lines.length;
    const assistantLines = collectMeaningfulLines(lines.slice(assistantStart, end));

    if (!promptLines.length) {
        const visibleLines = collectMeaningfulLines(lines.slice(0, end));
        if (visibleLines.length >= 2) {
            return {
                promptText: visibleLines[visibleLines.length - 2],
                assistantText: rehydrateAssistantSections(visibleLines[visibleLines.length - 1]),
            };
        }
    }

    return {
        promptText: promptLines.join(' ').trim(),
        assistantText: rehydrateAssistantSections(assistantLines.join('\n').trim()),
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
        title: 'Cursor CLI',
        messages: toMessageObjects(buildMessages(previousMessages, promptText, assistantText, partialText), status),
        activeModal,
    };
};
