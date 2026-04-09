/**
 * Codex CLI — parse_output
 *
 * Clean parser for Codex CLI TUI output.
 * Strategy:
 * 1. Detect status via detect_status
 * 2. Parse approval via parse_approval when waiting
 * 3. Extract assistant text from screen/buffer by recognizing
 *    Codex's `> ` lead prefix for assistant lines and bullet `• ` for tool calls
 * 4. Filter out TUI chrome (header, footer, status bars, welcome screen)
 * 5. Build message array from previous + current turn
 */
'use strict';

const detectStatus = require('./detect_status.js');
const parseApproval = require('./parse_approval.js');

// ─── Helpers ─────────────────────────────────────

function splitLines(text) {
    return String(text || '')
        .replace(/\u0007/g, '')
        .split(/\r?\n/)
        .map(l => l.replace(/\s+$/, ''));
}

function normalize(line) {
    return String(line || '')
        .replace(/\u0007/g, '')
        .replace(/^\d+;/, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeForCompare(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
}

// ─── Line classifiers ───────────────────────────

const BOX_RE = /^[─═╭╮╰╯│┌┐└┘├┤┬┴┼]+$/;
const STARTER_PROMPT_RE = /^(?:[›❯]\s*)?(?:Find and fix a bug in @filename|Improve documentation in @filename|Write tests for @filename|Explain this codebase|Summarize recent commits|Implement \{feature\}|Use \/skills|Run \/review on my current changes)$/i;

function isHeaderLine(l) {
    return /^(?:>_ )?OpenAI Codex\b/i.test(l)
        || /(?:^|[│\s])model:\s+/i.test(l)
        || /(?:^|[│\s])directory:\s+/i.test(l);
}

function isFooterLine(l) {
    return /⏎\s+send/i.test(l)
        || /⌃[JTC]\s+/i.test(l)
        || /\b\d+(?:\.\d+)?[KM]?\s+tokens used\b/i.test(l)
        || /\b\d+% (?:context )?left\b/i.test(l);
}

function isWelcomeLine(l) {
    return /To get started, describe a task/i.test(l)
        || /^\/(?:init|status|approvals|model)\b/.test(l)
        || /create an AGENTS\.md file/i.test(l)
        || /show current session configuration/i.test(l)
        || /choose what Codex can do/i.test(l)
        || /Update available!/i.test(l)
        || /npm install -g @openai\/codex@latest/i.test(l)
        || /Tip:\s+(?:New Try the Codex App|Use \/skills)/i.test(l)
        || /chatgpt\.com\/codex/i.test(l)
        || /ask Codex to use one/i.test(l)
        || STARTER_PROMPT_RE.test(l);
}

function isStatusLine(l) {
    return /Esc to interrupt/i.test(l)
        || /(?:Thinking|Planning|Searching|Reading|Working|Analyzing|Inspecting|Responding|Following instructions clearly)[^\n]*\(\d+s\b/i.test(l)
        || /^[⠁-⣿]+$/.test(l);
}

function isApprovalLine(l) {
    return /Do you trust the contents|Working with untrusted|You are running Codex in|Allow Codex to|Allow command\?|Press Enter to (?:continue|confirm)|Esc to cancel/i.test(l)
        || /^(?:[>▌›❯]\s*)?\d+\.\s+\S/.test(l)
        || /Approve and run now|Always approve this session/i.test(l);
}

function isInputLine(l) {
    return /^▌\s*/.test(l) || /^>\s*$/.test(l);
}

function isPlaceholderLine(l) {
    return STARTER_PROMPT_RE.test(l);
}

function isNoise(l) {
    if (!l) return true;
    return BOX_RE.test(l) || isHeaderLine(l) || isFooterLine(l) || isWelcomeLine(l)
        || isStatusLine(l) || isApprovalLine(l) || isInputLine(l) || isPlaceholderLine(l)
        || /^…\s+\+\d+\s+lines\b/i.test(l);
}

function isAssistantLead(l) {
    return (/^>\s+/.test(l) || /^•\s+/.test(l))
        && !/^>\s+You are in\b/i.test(l)
        && !/^>_\s+OpenAI Codex\b/i.test(l)
        && !isApprovalLine(l);
}

function stripLead(l) {
    return String(l || '').replace(/^(?:>\s+|•\s+)/, '').trim();
}

// ─── Content cleaning ───────────────────────────

function cleanLine(rawLine) {
    const l = normalize(rawLine);
    if (!l || isNoise(l)) return '';
    return l
        .replace(/^✔\s+/, '')
        .replace(/^\s*│\s*/, '')
        .replace(/▌.*$/g, '')
        .replace(/⏎\s+send.*$/i, '')
        .replace(/\b\d+(?:\.\d+)?[KM]?\s+tokens used\b.*$/i, '')
        .replace(/\b\d+% (?:context )?left\b.*$/i, '')
        .replace(/\b(?:Working|Thinking|Planning|Searching|Reading|Analyzing|Inspecting|Responding)[^.!?]*$/i, '')
        .replace(/Write tests for @filename.*$/i, '')
        .trim();
}

// ─── Startup screen detection ───────────────────

function isStartupScreen(text) {
    const v = String(text || '');
    return /You are running Codex in/i.test(v)
        || /Do you trust the contents of this directory\?/i.test(v)
        || (/OpenAI Codex/i.test(v) && /To get started, describe a task/i.test(v))
        || /Since this folder is version controlled/i.test(v)
        || /\/init - create an AGENTS\.md file/i.test(v)
        || /Tip:\s+(?:New Try the Codex App|Use \/skills)/i.test(v)
        || STARTER_PROMPT_RE.test(v);
}

// ─── Session ID extraction ──────────────────────

const SESSION_ID_RE = /session id:\s*([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i;

function extractSessionId(rawBuffer, buffer, screenText) {
    const source = [rawBuffer, buffer, screenText].map(v => String(v || '')).join('\n');
    const m = source.match(SESSION_ID_RE);
    return m ? m[1] : '';
}

// ─── Prompt scoping ─────────────────────────────

function tokenizePrompt(text) {
    return String(text || '')
        .replace(/\s+/g, ' ').trim()
        .split(/[^A-Za-z0-9_.:/-]+/)
        .map(t => t.trim().toLowerCase())
        .filter(t => t.length >= 4);
}

function findPromptLineIndex(lines, promptText) {
    const tokens = tokenizePrompt(promptText);
    if (tokens.length === 0) return -1;
    const normalizedPrompt = normalizeForCompare(promptText).toLowerCase();

    const matches = (line) => {
        const nl = normalizeForCompare(line).toLowerCase();
        if (!nl) return false;
        if (nl === normalizedPrompt) return true;
        return tokens.filter(t => nl.includes(t)).length >= Math.min(tokens.length, 3);
    };

    // Prefer input lines (▌ or empty >) that match
    for (let i = lines.length - 1; i >= 0; i--) {
        if (!isInputLine(normalize(lines[i]))) continue;
        if (matches(lines[i])) return i;
    }
    // Fallback: any matching non-assistant line
    for (let i = lines.length - 1; i >= 0; i--) {
        const nl = normalize(lines[i]);
        if (!nl || isAssistantLead(nl)) continue;
        if (matches(lines[i])) return i;
    }
    return -1;
}

function sliceAfterPrompt(text, promptText) {
    const lines = splitLines(text);
    const idx = findPromptLineIndex(lines, promptText);
    return idx < 0 ? text : lines.slice(idx + 1).join('\n');
}

// ─── Assistant text extraction ──────────────────

function collectAssistantText(text) {
    const lines = splitLines(text);
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

        if (isWelcomeLine(line) || isPlaceholderLine(line)) {
            collecting = false;
            current = null;
            continue;
        }

        // A bare `>` during active collection is a paragraph break, not an input reset.
        // Only `▌` (cursor input marker) truly resets the collection.
        if (isInputLine(line)) {
            if (collecting && /^>\s*$/.test(line)) {
                // Treat as paragraph separator
                if (current && current.lines.length > 0 && current.lines[current.lines.length - 1] !== '') {
                    current.lines.push('');
                }
                continue;
            }
            collecting = false;
            current = null;
            continue;
        }

        if (isAssistantLead(line)) {
            const stripped = cleanLine(stripLead(line));
            const kind = /^>\s+/.test(line) ? 'assistant' : 'tool';
            // Continue existing block if same kind, else start new
            if (!collecting || !current || current.kind !== kind) {
                current = { kind, lines: [] };
                blocks.push(current);
            }
            collecting = true;
            if (stripped && current.lines[current.lines.length - 1] !== stripped) {
                current.lines.push(stripped);
            }
            continue;
        }

        if (!collecting) continue;
        const cleaned = cleanLine(rawLine);
        if (!cleaned) continue;
        if (current && current.lines[current.lines.length - 1] !== cleaned) {
            current.lines.push(cleaned);
        }
    }

    // Prefer the last "assistant" block with content, else any block with content
    const preferred = [...blocks].reverse().find(b => b.kind === 'assistant' && b.lines.some(Boolean))
        || [...blocks].reverse().find(b => b.lines.some(Boolean));
    const result = preferred ? preferred.lines.slice() : [];
    while (result[0] === '') result.shift();
    while (result[result.length - 1] === '') result.pop();
    return result.join('\n').trim();
}

// ─── Suppress detection ─────────────────────────

function shouldSuppress(text) {
    const v = String(text || '').trim();
    if (!v) return true;
    return /^(?:>_ )?OpenAI Codex\b/.test(v) || isApprovalLine(v);
}

// ─── Message building ───────────────────────────

function buildMessages(previousMessages, assistantText) {
    const base = Array.isArray(previousMessages)
        ? previousMessages
            .filter(m => m && (m.role === 'user' || m.role === 'assistant'))
            .map(m => ({
                role: m.role,
                content: typeof m.content === 'string' ? m.content : String(m.content || ''),
                timestamp: m.timestamp,
            }))
        : [];

    if (!assistantText || shouldSuppress(assistantText)) return base;

    const last = base[base.length - 1];
    if (last && last.role === 'assistant') {
        // Update existing assistant message if content is richer
        const newNorm = normalizeForCompare(assistantText);
        const oldNorm = normalizeForCompare(last.content);
        if (newNorm !== oldNorm) {
            // Keep the longer/richer version
            if (assistantText.length >= last.content.length || assistantText.split('\n').length > last.content.split('\n').length) {
                last.content = assistantText;
            }
        }
    } else {
        base.push({ role: 'assistant', content: assistantText });
    }
    return base;
}

function toMessageObjects(messages, status) {
    return messages.slice(-50).map((m, i, arr) => ({
        id: `msg_${i}`,
        role: m.role,
        content: typeof m.content === 'string' && m.content.length > 6000
            ? `${m.content.slice(0, 6000)}\n[... truncated]`
            : m.content,
        index: i,
        kind: 'standard',
        ...(status === 'generating' && i === arr.length - 1 && m.role === 'assistant'
            ? { meta: { streaming: true } }
            : {}),
    }));
}

// ─── Export ──────────────────────────────────────

module.exports = function parseOutput(input) {
    const screenText = String(input?.screenText || '');
    const buffer = String(input?.buffer || '');
    const transcript = screenText || buffer;
    const tail = String(input?.recentBuffer || transcript.slice(-500));
    const previousMessages = Array.isArray(input?.messages) ? input.messages : [];
    const lastUser = [...previousMessages].reverse().find(m => m?.role === 'user');
    const promptScope = lastUser?.content || '';
    const hasUserPrompt = !!promptScope;

    const status = detectStatus({ tail, screenText, rawBuffer: input?.rawBuffer || '' });
    const activeModal = status === 'waiting_approval'
        ? parseApproval({ screenText, buffer: transcript, rawBuffer: input?.rawBuffer || '', tail })
        : null;

    // During approval or pre-prompt startup, return current messages unchanged
    if (status === 'waiting_approval' || (!hasUserPrompt && isStartupScreen(transcript))) {
        return {
            id: 'cli_session',
            status,
            title: 'Codex CLI',
            messages: toMessageObjects(previousMessages, status),
            activeModal,
            providerSessionId: extractSessionId(input?.rawBuffer, transcript, screenText) || undefined,
        };
    }

    // Scope to current turn
    const scopedScreen = sliceAfterPrompt(screenText, promptScope);
    const scopedBuffer = sliceAfterPrompt(buffer, promptScope);

    // Extract assistant text from both sources and pick richer
    const fromScreen = collectAssistantText(scopedScreen || screenText);
    const fromBuffer = collectAssistantText(scopedBuffer || buffer);
    const assistantText = (fromScreen.length >= fromBuffer.length ? fromScreen : fromBuffer) || fromScreen || fromBuffer;

    // Final startup guard
    if (!hasUserPrompt && isStartupScreen(assistantText)) {
        return {
            id: 'cli_session',
            status,
            title: 'Codex CLI',
            messages: toMessageObjects(previousMessages, status),
            activeModal,
        };
    }

    const messages = buildMessages(previousMessages, assistantText);

    return {
        id: 'cli_session',
        status,
        title: 'Codex CLI',
        messages: toMessageObjects(messages, status),
        activeModal,
        providerSessionId: extractSessionId(input?.rawBuffer, transcript, screenText) || undefined,
    };
};
