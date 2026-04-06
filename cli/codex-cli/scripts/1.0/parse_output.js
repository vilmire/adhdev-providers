/**
 * Codex CLI — parse_output
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

function normalize(line) {
    return String(line || '')
        .replace(/\u0007/g, '')
        .replace(/^\d+;/, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenizePrompt(text) {
    return String(text || '')
        .replace(/\s+/g, ' ')
        .trim()
        .split(/[^A-Za-z0-9_.:/-]+/)
        .map(token => token.trim().toLowerCase())
        .filter(token => token.length >= 4);
}

function findPromptLineIndex(lines, promptText) {
    const tokens = tokenizePrompt(promptText);
    if (tokens.length === 0) return -1;
    const normalizedPrompt = normalize(promptText).toLowerCase();

    const matchesPrompt = (line) => {
        const normalizedLine = normalize(line).toLowerCase();
        if (!normalizedLine) return false;
        if (normalizedPrompt && normalizedLine === normalizedPrompt) return true;
        const matched = tokens.filter(token => normalizedLine.includes(token)).length;
        return matched >= Math.min(tokens.length, 3);
    };

    // Prefer the visible input line for the user's prompt.
    for (let index = lines.length - 1; index >= 0; index -= 1) {
        const line = lines[index];
        if (!isInputLine(normalize(line))) continue;
        if (matchesPrompt(line)) return index;
    }

    for (let index = lines.length - 1; index >= 0; index -= 1) {
        const line = normalize(lines[index]);
        if (!line || isAssistantLeadLine(line)) continue;
        if (matchesPrompt(line)) return index;
    }
    return -1;
}

function sliceAfterLatestPrompt(text, promptText) {
    const lines = splitLines(text);
    const index = findPromptLineIndex(lines, promptText);
    if (index < 0) return text;
    return lines.slice(index + 1).join('\n');
}

function isBoxLine(line) {
    return /^[─═╭╮╰╯│┌┐└┘├┤┬┴┼]+$/.test(line);
}

function isHeaderLine(line) {
    return /^OpenAI Codex\b/i.test(line)
        || /^>_ OpenAI Codex\b/i.test(line)
        || /(?:^|[│\s])model:\s+/i.test(line)
        || /(?:^|[│\s])directory:\s+/i.test(line);
}

function isShellChromeLine(line) {
    return /^>\s+You are in\b/i.test(line)
        || /^>_\s+OpenAI Codex\b/i.test(line)
        || /^OpenAI Codex\b/i.test(line);
}

function isFooterLine(line) {
    return /⏎\s+send/i.test(line)
        || /⌃J\s+newline/i.test(line)
        || /⌃T\s+transcript/i.test(line)
        || /⌃C\s+quit/i.test(line)
        || /\b\d+(?:\.\d+)?[KM]?\s+tokens used\b/i.test(line)
        || /\b\d+% context left\b/i.test(line)
        || /\b\d+% left\b/i.test(line);
}

function isWelcomeLine(line) {
    return /To get started, describe a task/i.test(line)
        || /^\/(?:init|status|approvals|model)\b/.test(line)
        || /create an AGENTS\.md file/i.test(line)
        || /show current session configuration/i.test(line)
        || /choose what Codex can do without approval/i.test(line)
        || /choose what model and reasoning effort to use/i.test(line)
        || /Update available!/i.test(line)
        || /npm install -g @openai\/codex@latest/i.test(line)
        || /Tip:\s+New Try the Codex App/i.test(line)
        || /chatgpt\.com\/codex\?app-landing-page=true/i.test(line)
        || /Tip:\s+Use \/skills to list available skills/i.test(line)
        || /ask Codex to use one/i.test(line);
}

function isStatusLine(line) {
    return /Esc to interrupt/i.test(line)
        || /(?:Thinking|Planning|Searching|Reading|Working|Analyzing|Inspecting|Responding|Following instructions clearly)[^\n]*\(\d+s\b/i.test(line)
        || /^[⠁-⣿]+$/.test(line);
}

function isApprovalCueLine(line) {
    return /Do you trust the contents of this directory\?/i.test(line)
        || /Working with untrusted contents/i.test(line)
        || /You are running Codex in/i.test(line)
        || /Allow Codex to (?:run|apply)/i.test(line)
        || /Allow command\?/i.test(line)
        || /Press Enter to (?:continue|confirm)/i.test(line)
        || /Esc to cancel/i.test(line);
}

function isApprovalButtonLine(line) {
    return /^(?:[>▌›❯]\s*)?\d+\.\s+\S/.test(line)
        || /Approve and run now/i.test(line)
        || /Always approve this session/i.test(line);
}

function isApprovalLine(line) {
    return isApprovalCueLine(line) || isApprovalButtonLine(line);
}

function isInputLine(line) {
    return /^▌\s*/.test(line) || /^>\s*$/.test(line);
}

function isPlaceholderLine(line) {
    return /^(?:[›❯]\s*)?(?:Use \/skills to list available skills|Write tests for @filename|Explain this codebase|Summarize recent commits|Implement \{feature\})$/i.test(line);
}

function isAssistantLeadLine(line) {
    return (/^>\s+/.test(line) || /^•\s+/.test(line))
        && !isShellChromeLine(line)
        && !isApprovalLine(line);
}

function stripAssistantLead(line) {
    return String(line || '').replace(/^(?:>\s+|•\s+)/, '').trim();
}

function isTranscriptNoise(line) {
    return !line
        || isBoxLine(line)
        || isHeaderLine(line)
        || isShellChromeLine(line)
        || isFooterLine(line)
        || isWelcomeLine(line)
        || isStatusLine(line)
        || isApprovalLine(line)
        || isInputLine(line)
        || /^…\s+\+\d+\s+lines\b/i.test(line)
        || isPlaceholderLine(line);
}

function cleanContentLine(rawLine) {
    const normalized = normalize(rawLine);
    if (!normalized || isTranscriptNoise(normalized)) return '';
    let cleaned = normalized
        .replace(/^✔\s+/, '')
        .replace(/^\s*│\s*/, '')
        .replace(/▌.*$/g, '')
        .replace(/⏎\s+send.*$/i, '')
        .replace(/\b\d+(?:\.\d+)?[KM]?\s+tokens used\b.*$/i, '')
        .replace(/\b\d+% context left\b.*$/i, '')
        .replace(/\b(?:Working|Thinking|Planning|Searching|Reading|Analyzing|Inspecting|Responding)[^.!?]*$/i, '')
        .replace(/Write tests for @filename.*$/i, '')
        .replace(/([.!?])(?:[A-Za-z0-9]{3,}){3,}$/g, '$1')
        .trim();
    if (/^[{\[]/.test(cleaned)) {
        cleaned = cleaned.replace(/([}\]])[A-Za-z0-9]+$/, '$1');
    }
    return cleaned;
}

function cleanAssistantLeadContent(line) {
    return cleanContentLine(line)
        .replace(/^>\s+/, '')
        .replace(/^•\s+/, '')
        .trim();
}

function isWelcomeScreen(text) {
    return /OpenAI Codex/i.test(text)
        && /To get started, describe a task/i.test(text);
}

function isStartupScreen(text) {
    const value = String(text || '');
    return /You are running Codex in/i.test(value)
        || /Do you trust the contents of this directory\?/i.test(value)
        || isWelcomeScreen(value)
        || /Since this folder is version controlled/i.test(value)
        || /\/init - create an AGENTS\.md file with instructions for Codex/i.test(value)
        || /\/status - show current session configuration/i.test(value)
        || /\/approvals - choose what Codex can do without approval/i.test(value)
        || /\/model - choose what model and reasoning effort to use/i.test(value)
        || /(?:[▌›❯]\s*)?(?:Use \/skills to list available skills|Write tests for @filename|Explain this codebase|Summarize recent commits|Implement \{feature\})/i.test(value)
        || /Tip:\s+New Try the Codex App/i.test(value)
        || /Tip:\s+Use \/skills to list available skills/i.test(value);
}

function extractProviderSessionId(rawBuffer, buffer, screenText) {
    const source = [rawBuffer, buffer, screenText]
        .map(value => String(value || ''))
        .join('\n');
    const match = source.match(/session id:\s*([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i);
    return match ? match[1] : '';
}

function collectAssistantLines(lines) {
    const blocks = [];
    let current = null;
    let collecting = false;

    for (const rawLine of lines) {
        const line = normalize(rawLine);

        if (!line) {
            if (collecting && current && current.lines.length > 0 && current.lines[current.lines.length - 1] !== '') {
                current.lines.push('');
            }
            continue;
        }

        if (isInputLine(line)) {
            collecting = false;
            current = null;
            continue;
        }

        if (isAssistantLeadLine(line)) {
            const stripped = cleanAssistantLeadContent(stripAssistantLead(line));
            collecting = true;
            current = {
                kind: /^>\s+/.test(line) ? 'assistant' : 'tool',
                lines: [],
            };
            blocks.push(current);
            if (stripped) current.lines.push(stripped);
            continue;
        }

        if (!collecting) continue;

        const cleaned = cleanContentLine(rawLine);
        if (!cleaned) continue;
        if (current && current.lines[current.lines.length - 1] !== cleaned) current.lines.push(cleaned);
    }

    const preferred = [...blocks].reverse().find(block => block.kind === 'assistant' && block.lines.some(Boolean))
        || [...blocks].reverse().find(block => block.lines.some(Boolean));
    const result = preferred ? preferred.lines.slice() : [];
    while (result[0] === '') result.shift();
    while (result[result.length - 1] === '') result.pop();

    return result;
}

function cleanFallbackLines(lines) {
    const result = [];
    for (const rawLine of lines) {
        const line = normalize(rawLine);
        if (!isAssistantLeadLine(line)) continue;
        const stripped = stripAssistantLead(line);
        if (stripped && result[result.length - 1] !== stripped) result.push(stripped);
    }
    return result;
}

function extractAssistantText(text) {
    return collectAssistantLines(splitLines(text)).join('\n').trim();
}

function extractTrailingLeadAnswer(text) {
    const lines = splitLines(text);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
        const line = normalize(lines[index]);
        if (!isAssistantLeadLine(line)) continue;
        const cleaned = cleanAssistantLeadContent(stripAssistantLead(line));
        if (!cleaned || shouldSuppressAssistantText(cleaned)) continue;
        return cleaned;
    }
    return '';
}

function extractFallbackText(text) {
    return cleanFallbackLines(splitLines(text)).join('\n').trim();
}

function chooseRicherText(primary, secondary) {
    const a = String(primary || '').trim();
    const b = String(secondary || '').trim();
    if (!a) return b;
    if (!b) return a;
    const aLines = a.split('\n').length;
    const bLines = b.split('\n').length;
    if (aLines > bLines + 1 || a.length > b.length + 60) return a;
    if (bLines > aLines + 1 || b.length > a.length + 60) return b;
    return a.length >= b.length ? a : b;
}

function extractVisibleContent(text) {
    const blocks = [];
    let current = [];
    for (const rawLine of splitLines(text)) {
        const cleaned = cleanContentLine(rawLine);
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
    const chosen = [...blocks].reverse().find(block => block.length > 1) || blocks[blocks.length - 1] || [];
    return chosen.join('\n').trim();
}

function mergeLineContent(existing, incoming) {
    const left = String(existing || '').trim();
    const right = String(incoming || '').trim();
    if (!left) return right;
    if (!right) return left;
    if (left === right) return right;

    const leftLines = left.split('\n');
    const rightLines = right.split('\n');
    const leftNorm = leftLines.map(line => normalize(line));
    const rightNorm = rightLines.map(line => normalize(line));
    const maxOverlap = Math.min(leftLines.length, rightLines.length);

    for (let overlap = maxOverlap; overlap >= 1; overlap--) {
        const leftTail = leftNorm.slice(leftNorm.length - overlap);
        const rightHead = rightNorm.slice(0, overlap);
        if (leftTail.every((line, index) => line === rightHead[index])) {
            return [...leftLines.slice(0, leftLines.length - overlap), ...rightLines].join('\n').trim();
        }
    }

    if (left.includes(right)) return left;
    if (right.includes(left)) return right;
    return chooseRicherText(left, right);
}

function finalizeAssistantText(text) {
    const value = String(text || '').trim();
    if (!value) return '';
    const lines = value.split('\n');
    if (/^>\s*[{[]/.test(lines[0] || '')) {
        lines[0] = lines[0].replace(/^>\s*/, '');
    }
    return lines.join('\n').trim();
}

function extractLabeledAnswer(text) {
    const lines = String(text || '').split('\n');
    for (let index = lines.length - 1; index >= 0; index -= 1) {
        const label = normalize(lines[index]);
        if (!/^(?:Exact\s+)?(?:output|result|answer|response):$/i.test(label)) continue;
        const remainder = lines.slice(index + 1).some(line => normalize(line));
        if (remainder) return lines.slice(index).join('\n').trim();
    }
    return '';
}

function looksLikeStructuredAnswer(text) {
    const value = String(text || '').trim();
    if (!value) return false;
    const firstLine = value.split('\n')[0] || '';
    return /^TITLE=/.test(firstLine)
        || /^NEWS=/.test(firstLine)
        || /^[A-Z][A-Z0-9_]*=/.test(firstLine)
        || /^[{\[]/.test(firstLine);
}

function isStructuredAnswerLine(line) {
    const value = String(line || '').trim();
    return /^TITLE=/.test(value)
        || /^NEWS=/.test(value)
        || /^[A-Z][A-Z0-9_]*=/.test(value)
        || /^[{\[]/.test(value);
}

function extractStructuredAnswer(text) {
    const lines = splitLines(text)
        .map(cleanContentLine)
        .filter(Boolean);
    if (lines.length === 0) return '';

    const trailing = [];
    for (let i = lines.length - 1; i >= 0; i -= 1) {
        const line = lines[i];
        if (isStructuredAnswerLine(line)) {
            trailing.unshift(line);
            continue;
        }
        if (trailing.length > 0) break;
    }
    if (trailing.length >= 2) return trailing.join('\n').trim();

    const blocks = [];
    let current = [];
    for (const line of lines) {
        if (isStructuredAnswerLine(line)) {
            current.push(line);
        } else if (current.length > 0) {
            blocks.push(current);
            current = [];
        }
    }
    if (current.length > 0) blocks.push(current);
    const chosen = [...blocks].reverse().find(block => block.length >= 2) || [];
    return chosen.join('\n').trim();
}

function looksLikeCorruptToolText(text) {
    const value = String(text || '');
    if (!value) return false;
    return /Ran zsh -lc/i.test(value)
        || /• Added /i.test(value)
        || /… \+\d+ lines/.test(value)
        || /└ /.test(value)
        || /�/.test(value);
}

function shouldSuppressAssistantText(text) {
    const value = String(text || '').trim();
    if (!value) return true;
    return /^>_ OpenAI Codex\b/.test(value)
        || /^OpenAI Codex\b/.test(value)
        || isShellChromeLine(value)
        || isApprovalLine(value)
        || looksLikeCorruptToolText(value) && !looksLikeStructuredAnswer(value);
}

function shouldDropPartialText(text) {
    const value = String(text || '').trim();
    if (!value) return true;
    return /^>_ OpenAI Codex\b/.test(value)
        || /^OpenAI Codex\b/.test(value)
        || /^[│\s]+$/.test(value)
        || /(?:Working|Planning|Searching|Reading|Analyzing|Considering)/i.test(value) && !/\n/.test(value);
}

function shouldKeepPartialText(text) {
    const value = String(text || '').trim();
    if (!value || shouldDropPartialText(value) || looksLikeCorruptToolText(value)) return false;
    return looksLikeStructuredAnswer(value) || value.split('\n').length >= 3;
}

function containsUiNoise(text) {
    return /⏎\s+send|⌃J\s+newline|⌃T\s+transcript|⌃C\s+quit|\b\d+(?:\.\d+)?[KM]?\s+tokens used\b|\b\d+% context left\b|Working\(\d+s/i.test(String(text || ''));
}

function extractInlineLeadAnswer(text) {
    const lines = splitLines(text);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
        const rawLine = lines[index];
        const match = rawLine.match(/>\s+(.+)$/);
        if (!match) continue;
        const cleaned = cleanAssistantLeadContent(`> ${match[1]}`);
        if (cleaned && !shouldSuppressAssistantText(cleaned)) return cleaned;
    }
    return '';
}

function buildMessages(previousMessages, assistantText, partialText) {
    const base = Array.isArray(previousMessages)
        ? previousMessages
            .filter(message => message && (message.role === 'user' || message.role === 'assistant'))
            .map(message => ({
                role: message.role,
                content: typeof message.content === 'string' ? message.content : String(message.content || ''),
                timestamp: message.timestamp,
            }))
        : [];

    const lastUser = [...base].reverse().find(message => message.role === 'user')?.content || '';
    const rawCandidate = finalizeAssistantText(assistantText || partialText);
    if (!lastUser && isStartupScreen(rawCandidate)) return base;
    const inlineLead = extractInlineLeadAnswer(rawCandidate);
    const promptEcho = tokenizePrompt(lastUser)
        .slice(0, 6)
        .filter(token => normalize(rawCandidate).toLowerCase().includes(token))
        .length >= 2;
    const candidate = (inlineLead && (containsUiNoise(rawCandidate) || promptEcho))
        ? inlineLead
        : rawCandidate;
    if (!candidate || shouldSuppressAssistantText(candidate)) return base;

    const last = base[base.length - 1];
    if (last && last.role === 'assistant') {
        if (looksLikeStructuredAnswer(candidate) && !looksLikeStructuredAnswer(last.content)) {
            last.content = candidate;
        } else {
            const merged = mergeLineContent(last.content, candidate);
            if (last.content !== merged) last.content = merged;
        }
    } else {
        base.push({ role: 'assistant', content: candidate });
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
    const terminalHistory = String(input?.terminalHistory || '');
    const transcript = screenText || buffer;
    const tail = String(input?.recentBuffer || transcript.slice(-500));
    const previousMessages = Array.isArray(input?.messages) ? input.messages : [];
    const lastUserMessage = [...previousMessages].reverse().find(message => message && message.role === 'user');
    const promptScope = lastUserMessage?.content || '';
    const scopedScreenText = sliceAfterLatestPrompt(screenText, promptScope);
    const scopedBufferText = sliceAfterLatestPrompt(buffer, promptScope);
    const hasUserPrompt = !!promptScope;

    const status = detectStatus({
        tail,
        screenText,
        rawBuffer: input?.rawBuffer || '',
    });

    const activeModal = status === 'waiting_approval'
        ? parseApproval({ screenText, buffer: transcript, rawBuffer: input?.rawBuffer || '', tail })
        : null;

    if (status === 'waiting_approval' || (!hasUserPrompt && isStartupScreen(transcript))) {
        return {
            id: 'cli_session',
            status,
            title: 'Codex CLI',
            messages: toMessageObjects(previousMessages, status),
            activeModal,
            providerSessionId: extractProviderSessionId(input?.rawBuffer, transcript, screenText) || undefined,
        };
    }

    const bufferAssistantText = finalizeAssistantText(extractAssistantText(scopedBufferText || buffer));
    const screenAssistantText = finalizeAssistantText(extractAssistantText(scopedScreenText || screenText));
    const trailingLeadText = finalizeAssistantText(
        extractTrailingLeadAnswer(scopedScreenText || screenText) || extractTrailingLeadAnswer(scopedBufferText || buffer),
    );
    const visibleContentText = finalizeAssistantText(extractVisibleContent(scopedScreenText || screenText));
    const screenCandidateText = finalizeAssistantText(chooseRicherText(screenAssistantText, visibleContentText));
    const structuredAnswerText = finalizeAssistantText(
        extractStructuredAnswer(scopedScreenText || screenText) || extractStructuredAnswer(scopedBufferText || buffer),
    );
    const mergedAssistantText = finalizeAssistantText(mergeLineContent(
        mergeLineContent(
            chooseRicherText(bufferAssistantText, screenCandidateText),
            trailingLeadText,
        ),
        screenAssistantText,
    ));
    const assistantText = structuredAnswerText
        || (looksLikeCorruptToolText(bufferAssistantText)
            ? chooseRicherText(screenCandidateText, trailingLeadText)
            : chooseRicherText(mergedAssistantText, screenCandidateText))
        || trailingLeadText;
    const finalizedAssistantText = extractLabeledAnswer(assistantText) || assistantText;
    const partialText = status === 'generating'
        ? finalizeAssistantText(chooseRicherText(
            extractFallbackText(buffer),
            extractFallbackText(String(input?.partialResponse || '')),
        ))
        : '';
    const startupLike = !hasUserPrompt && (
        isStartupScreen(transcript)
        || isStartupScreen(screenText)
        || isStartupScreen(buffer)
        || isStartupScreen(terminalHistory)
        || isStartupScreen(assistantText)
        || isStartupScreen(partialText)
    );
    if (startupLike) {
        return {
            id: 'cli_session',
            status,
            title: 'Codex CLI',
            messages: toMessageObjects(previousMessages, status),
            activeModal,
        };
    }
    const messages = buildMessages(previousMessages, finalizedAssistantText, shouldKeepPartialText(partialText) ? partialText : '');

    return {
        id: 'cli_session',
        status,
        title: 'Codex CLI',
        messages: toMessageObjects(messages, status),
        activeModal,
        providerSessionId: extractProviderSessionId(input?.rawBuffer, transcript, screenText) || undefined,
    };
};
