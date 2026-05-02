'use strict';
const detectStatus = require('./detect_status.js');
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

function tokenize(text) {
    return String(text || '')
        .toLowerCase()
        .split(/[^a-z0-9_./:-]+/)
        .map(token => token.trim())
        .filter(token => token.length >= 4);
}

function getLastUserPrompt(previousMessages) {
    return [...(Array.isArray(previousMessages) ? previousMessages : [])]
        .reverse()
        .find(message => message?.role === 'user' && typeof message.content === 'string')
        ?.content || '';
}

function promptTokenHits(line, promptText) {
    const tokens = tokenize(promptText);
    if (tokens.length === 0) return 0;
    const normalizedLine = normalize(line).toLowerCase();
    if (!normalizedLine) return 0;
    return tokens.filter(token => normalizedLine.includes(token)).length;
}

function findPromptLineIndex(lines, promptText) {
    if (!promptText) return -1;
    let bestIndex = -1;
    let bestScore = 0;
    const normalizedPrompt = normalize(promptText).toLowerCase();
    for (let index = 0; index < lines.length; index += 1) {
        const line = sanitize(lines[index]);
        const score = promptTokenHits(line, promptText);
        if (score > bestScore) {
            bestScore = score;
            bestIndex = index;
        }
        const normalizedLine = normalize(line).toLowerCase();
        if (normalizedLine && (normalizedPrompt.includes(normalizedLine) || normalizedLine.includes(normalizedPrompt))) {
            bestIndex = index;
            bestScore = Math.max(bestScore, tokenize(promptText).length + 1);
        }
    }
    return bestScore > 0 ? bestIndex : -1;
}

function isTableBorderLine(trimmed) {
    return /^[┌┐└┘├┤┬┴┼─]+$/.test(trimmed);
}

function isTableRowLine(trimmed) {
    return /^│.*│$/.test(trimmed);
}

function isFooterLine(trimmed) {
    return /^▣\s+Build\b/i.test(trimmed)
        || /^Build\s+.*OpenCode/i.test(trimmed)
        || /^\d+(?:\.\d+)?[KM]?\s*\(\d+%\)\s*ctrl\+p commands/i.test(trimmed)
        || /^ctrl\+p commands/i.test(trimmed)
        || /^[╹▀▁▂▃▄▅▆▇█⬝■]+$/.test(trimmed)
        || /^[⬝■]+\s*esc interrupt/i.test(trimmed)
        || /^Update available!/i.test(trimmed);
}

function isStatusLine(trimmed) {
    return !trimmed
        || /^[\u2800-\u28ff\s]+$/.test(trimmed)
        || /esc to (cancel|interrupt|stop)/i.test(trimmed)
        || /^┃\s*Thinking:/i.test(trimmed)
        || /(thinking|processing|generating|running|working|analyzing|planning|reading|searching|inspecting)/i.test(trimmed);
}

function isApprovalLine(trimmed) {
    return (/Allow|approve/i.test(trimmed) && /Deny|reject/i.test(trimmed))
        || /\(y\/n\)|confirm/i.test(trimmed);
}

function isNoiseLine(trimmed) {
    return isFooterLine(trimmed)
        || isStatusLine(trimmed)
        || isApprovalLine(trimmed)
        || /^┃\s*$/.test(trimmed)
        || /^\|\s*$/.test(trimmed);
}

function normalizeBlankRuns(lines) {
    const out = [];
    for (const line of lines) {
        const cleaned = sanitize(line);
        if (!cleaned.trim()) {
            if (out.length > 0 && out[out.length - 1] !== '') out.push('');
            continue;
        }
        out.push(cleaned);
    }
    while (out[0] === '') out.shift();
    while (out[out.length - 1] === '') out.pop();
    return out;
}

function trimTrailingNoise(lines) {
    const out = [...lines];
    while (out.length > 0) {
        const trimmed = sanitize(out[out.length - 1]).trim();
        if (!trimmed || isNoiseLine(trimmed)) {
            out.pop();
            continue;
        }
        break;
    }
    return out;
}

function linesToParagraph(lines) {
    return lines
        .map(line => sanitize(line).trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tableBlockToMarkdown(blockLines) {
    const rows = blockLines
        .map(line => sanitize(line).trim())
        .filter(line => isTableRowLine(line))
        .map(line => line.slice(1, -1).split('│').map(cell => cell.trim()));
    if (rows.length === 0) return '';
    const width = Math.max(...rows.map(row => row.length));
    const normalizedRows = rows.map(row => {
        const cells = row.slice(0, width);
        while (cells.length < width) cells.push('');
        return cells;
    });
    const header = normalizedRows[0];
    const body = normalizedRows.slice(1);
    const lines = [
        `| ${header.join(' | ')} |`,
        `| ${header.map(() => '---').join(' | ')} |`,
        ...body.map(row => `| ${row.join(' | ')} |`),
    ];
    return lines.join('\n');
}

function looksLikeCodeLine(trimmed) {
    return /^(?:import\s+\w+|from\s+\w+\s+import\s+.+|def\s+\w+\(|class\s+\w+|if\s+__name__\s*==|print\(|squares\s*=|json\.|cwd\s*=|return\b|for\s+\w+\s+in\s+)/.test(trimmed)
        || /^[\]})(:,]?$/.test(trimmed)
        || /^[A-Za-z_][A-Za-z0-9_]*\s*=\s*.+/.test(trimmed);
}

function isOutputLine(trimmed) {
    return /^(?:CWD=|SQUARES=|JSON=)/.test(trimmed);
}

function splitBlocks(text) {
    return String(text || '')
        .split(/\n{2,}/)
        .map(block => block.trim())
        .filter(Boolean);
}

function parseMarkdownTable(block) {
    const lines = String(block || '').split('\n').map(line => line.trim()).filter(Boolean);
    if (lines.length < 2) return null;
    const rows = lines.map(line => line.replace(/^\|\s*|\s*\|$/g, '').split('|').map(cell => cell.trim()));
    return rows.length >= 2 ? rows : null;
}

function mergeMarkdownTables(existing, incoming) {
    const left = parseMarkdownTable(existing);
    const right = parseMarkdownTable(incoming);
    if (!left || !right) return incoming.length > existing.length ? incoming : existing;
    const header = right[0].length >= left[0].length ? right[0] : left[0];
    const rows = [];
    const seen = new Set();
    for (const row of [...left.slice(1), ...right.slice(1)]) {
        const key = row.join(' | ');
        if (!seen.has(key)) {
            seen.add(key);
            rows.push(row);
        }
    }
    return [
        `| ${header.join(' | ')} |`,
        `| ${header.map(() => '---').join(' | ')} |`,
        ...rows.map(row => `| ${row.join(' | ')} |`),
    ].join('\n');
}

function mergeAssistantContent(existing, incoming) {
    const current = String(existing || '').trim();
    const next = String(incoming || '').trim();
    if (!current) return next;
    if (!next) return current;
    const normalizedCurrent = normalize(current);
    const normalizedNext = normalize(next);
    if (normalizedCurrent === normalizedNext) return current.length >= next.length ? current : next;
    if (normalizedCurrent.includes(normalizedNext)) return current;
    if (normalizedNext.includes(normalizedCurrent)) return next;

    const merged = splitBlocks(current);
    for (const block of splitBlocks(next)) {
        const normalizedBlock = normalize(block);
        const tableIndex = block.startsWith('|')
            ? merged.findIndex(candidate => candidate.startsWith('|'))
            : -1;
        if (tableIndex >= 0) {
            merged[tableIndex] = mergeMarkdownTables(merged[tableIndex], block);
            continue;
        }

        const fencedIndex = /^```/.test(block)
            ? merged.findIndex(candidate => candidate.startsWith(block.split('\n')[0]))
            : -1;
        if (fencedIndex >= 0) {
            if (block.length > merged[fencedIndex].length) merged[fencedIndex] = block;
            continue;
        }

        const existingIndex = merged.findIndex(candidate => {
            const normalizedCandidate = normalize(candidate);
            return normalizedCandidate === normalizedBlock
                || normalizedCandidate.includes(normalizedBlock)
                || normalizedBlock.includes(normalizedCandidate);
        });
        if (existingIndex >= 0) {
            if (block.length > merged[existingIndex].length) merged[existingIndex] = block;
            continue;
        }
        merged.push(block);
    }
    return merged.join('\n\n').trim();
}

function extractAssistantText(screenText, previousMessages) {
    const lines = splitLines(screenText);
    const promptText = getLastUserPrompt(previousMessages);
    const promptIndex = findPromptLineIndex(lines, promptText);
    const scoped = promptIndex >= 0 ? lines.slice(promptIndex + 1) : lines;
    const blocks = [];
    let paragraph = [];

    const flushParagraph = () => {
        const text = linesToParagraph(paragraph);
        if (text) blocks.push(text);
        paragraph = [];
    };

    for (let index = 0; index < scoped.length; index += 1) {
        const cleaned = sanitize(scoped[index]);
        const trimmed = cleaned.trim();

        if (!trimmed) {
            flushParagraph();
            continue;
        }
        if (isFooterLine(trimmed)) {
            flushParagraph();
            break;
        }
        if (isApprovalLine(trimmed)) continue;
        if (/^┃/.test(trimmed)) {
            flushParagraph();
            continue;
        }
        if (isTableBorderLine(trimmed) || isTableRowLine(trimmed)) {
            flushParagraph();
            const tableLines = [];
            while (index < scoped.length) {
                const tableLine = sanitize(scoped[index]).trim();
                if (!tableLine) break;
                if (!(isTableBorderLine(tableLine) || isTableRowLine(tableLine))) break;
                tableLines.push(tableLine);
                index += 1;
            }
            index -= 1;
            const markdownTable = tableBlockToMarkdown(tableLines);
            if (markdownTable) blocks.push(markdownTable);
            continue;
        }
        if (looksLikeCodeLine(trimmed)) {
            flushParagraph();
            const codeLines = [];
            while (index < scoped.length) {
                const codeRaw = sanitize(scoped[index]);
                const codeTrimmed = codeRaw.trim();
                if (!codeTrimmed) {
                    if (codeLines.length > 0) break;
                    index += 1;
                    continue;
                }
                if (isFooterLine(codeTrimmed) || isOutputLine(codeTrimmed) || /^┃/.test(codeTrimmed) || isTableBorderLine(codeTrimmed) || isTableRowLine(codeTrimmed)) break;
                if (!looksLikeCodeLine(codeTrimmed) && !/^[ \t]+\S/.test(codeRaw)) break;
                codeLines.push(codeRaw.replace(/^ /, ''));
                index += 1;
            }
            index -= 1;
            if (codeLines.length > 0) {
                blocks.push(```python\n${codeLines.join('\n').trim()}\n```);
            }
            continue;
        }
        if (isOutputLine(trimmed)) {
            flushParagraph();
            const outputLines = [];
            while (index < scoped.length) {
                const outputRaw = sanitize(scoped[index]);
                const outputTrimmed = outputRaw.trim();
                if (!outputTrimmed) {
                    if (outputLines.length > 0) break;
                    index += 1;
                    continue;
                }
                if (!isOutputLine(outputTrimmed)) break;
                outputLines.push(outputTrimmed);
                index += 1;
            }
            index -= 1;
            if (outputLines.length > 0) {
                blocks.push(```text\n${outputLines.join('\n')}\n```);
            }
            continue;
        }
        if (isNoiseLine(trimmed)) {
            flushParagraph();
            continue;
        }
        paragraph.push(cleaned);
    }

    flushParagraph();
    return normalizeBlankRuns(trimTrailingNoise(blocks.join('\n\n').split('\n'))).join('\n').trim();
}

function buildMessages(previousMessages, assistantText) {
    const base = Array.isArray(previousMessages)
        ? previousMessages
            .filter(message => message && (message.role === 'user' || message.role === 'assistant'))
            .map(message => ({
                role: message.role,
                content: typeof message.content === 'string' ? message.content : String(message.content || ''),
                timestamp: message.timestamp,
            }))
        : [];

    if (!assistantText) return base;

    const last = base[base.length - 1];
    if (last && last.role === 'assistant') {
        last.content = mergeAssistantContent(last.content, assistantText);
    } else {
        base.push({ role: 'assistant', content: assistantText });
    }
    return base;
}

function toMessageObjects(messages, status) {
    return messages.map((message, index, slice) => ({
        id: `msg_${index}`,
        role: message.role,
        content: String(message.content || ''),
        index,
        kind: 'standard',
        ...(status === 'generating' && index === slice.length - 1 && message.role === 'assistant'
            ? { meta: { streaming: true } }
            : {}),
    }));
}

function extractProviderSessionId(rawBuffer, buffer, screenText) {
    const source = [rawBuffer, buffer, screenText]
        .map(value => String(value || ''))
        .join('\n');
    const jsonMatch = source.match(/"sessionID"\s*:\s*"([^"]+)"/);
    if (jsonMatch) return jsonMatch[1];
    const textMatch = source.match(/\b(ses_[A-Za-z0-9]+)\b/);
    return textMatch ? textMatch[1] : '';
}

module.exports = function parseOutput(input) {
    const screenText = String(input?.screenText || '');
    const buffer = String(input?.buffer || '');
    const tail = String(input?.recentBuffer || screenText.slice(-500) || buffer.slice(-500));
    const previousMessages = Array.isArray(input?.messages) ? input.messages : [];
    const status = detectStatus({ tail, screenText, rawBuffer: input?.rawBuffer || '' });
    const activeModal = status === 'waiting_approval'
        ? parseApproval({ buffer: buffer || screenText, tail, screenText, rawBuffer: input?.rawBuffer || '' })
        : null;

    const assistantText = status === 'waiting_approval'
        ? ''
        : extractAssistantText(screenText || buffer, previousMessages);

    return {
        id: 'cli_session',
        status,
        title: 'OpenCode CLI',
        messages: toMessageObjects(buildMessages(previousMessages, assistantText), status),
        activeModal,
        providerSessionId: extractProviderSessionId(input?.rawBuffer, buffer, screenText) || undefined,
    };
};
