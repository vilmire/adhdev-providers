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
const { extractControlValues } = require('./control_helpers.js');
let nativeHistory = null;
try { nativeHistory = require('../../../_shared/native_history.js'); } catch { nativeHistory = null; }

// ─── Helpers ─────────────────────────────────────

const ANSI_RE = /\x1b\[[0-?]*[ -/]*[@-~]/g;

function stripAnsi(text) {
    return String(text || '')
        // xterm serialize may encode spaces as cursor-forward escapes.
        .replace(/\x1b\[(\d*)C/g, (_match, n) => ' '.repeat(Math.max(1, Number(n) || 1)))
        .replace(/\x1b\[\d*D/g, '')
        .replace(ANSI_RE, '')
        .replace(/\x1b\][^\x07\x1b\n]*(?:\x07|\x1b\\|(?=\n|$))/g, '')
        .replace(/\x1b[P^_X][\s\S]*?(?:\x07|\x1b\\)/g, '')
        .replace(/\x1b(?:[@-Z\\-_])/g, '');
}

function splitLines(text) {
    return stripAnsi(text)
        .replace(/\u0007/g, '')
        .split(/\r?\n/)
        .map(l => l.replace(/\s+$/, ''));
}

function normalize(line) {
    return stripAnsi(line)
        .replace(/\u0007/g, '')
        .replace(/^\d+;/, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeForCompare(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
}

// ─── Line classifiers ───────────────────────────

const BOX_RE = /^[─═╭╮╰╯│┌┐└┘├┤┬┴┼]+(?:\s*(?:\d+|W|Wo|W\s+Wo|Working))?$/;
const HORIZONTAL_STATUS_RESIDUE_RE = /^[─═-]{10,}\s*(?:\d+|W|Wo|Wor|Work|Worki|Workin|Working|[•·]\s*(?:W|Wo|Wor|Work|Worki|Workin|Working)|orking|rking|king|ing|ng|g)\b.*$/i;
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
        || /\b\d+% (?:context )?left\b/i.test(l)
        || /^(?:[›❯]\s*)?gpt-[^\n]*?·\s*\/?\S+/i.test(l);
}

function isWorkingFragmentLine(l) {
    const value = String(l || '').trim();
    if (!value || value === '•') return true;
    const body = value.replace(/^•\s*/, '').trim();
    return /^(?:\d{1,2}|W|Wo|Wor|Work|Worki|Workin|Working|orking|rking|king|ing|ng|g)$/i.test(body);
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
    return HORIZONTAL_STATUS_RESIDUE_RE.test(l)
        || isWorkingFragmentLine(l)
        || /Esc to interrupt/i.test(l)
        || /(?:Thinking|Planning|Searching|Reading|Working|Analyzing|Inspecting|Responding|Following instructions clearly)[^\n]*\(\d+s\b/i.test(l)
        || /^[⠁-⣿]+$/.test(l);
}

function isApprovalLine(l) {
    return /Do you trust the contents|Working with untrusted|You are running Codex in|Allow Codex to|Allow command\?|Press Enter to (?:continue|confirm)|Esc to cancel/i.test(l)
        || /Approaching rate limits|Switch to gpt-[\w.-]+ for lower credit usage|You've hit your usage limit/i.test(l)
        || /^(?:[>▌›❯]\s*)?\d+\.\s+\S/.test(l)
        || /Approve and run now|Always approve this session/i.test(l);
}

function isInputLine(l) {
    return /^▌\s*/.test(l) || /^>\s*$/.test(l) || /^[›❯]\s*(?:$|\S.*$)/.test(l);
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

function stripTrailingFooterChrome(line) {
    return String(line || '')
        .replace(/\s*[›❯]\s*tab to queue message.*$/i, '')
        .replace(/\s+[›❯]\s*gpt-[^\n]*?·\s*\/?\S+.*$/i, '')
        .replace(/\s+gpt-[^\n]*?·\s*\/?\S+.*$/i, '')
        .trim();
}

function stripInlineStatusResidue(line) {
    return stripTrailingFooterChrome(line)
        .replace(HORIZONTAL_STATUS_RESIDUE_RE, '')
        .replace(/\s*[•·]\s*esc to interr?upt\)?(?:\s+[A-Za-z]+)*.*$/i, '')
        .replace(/\s+(?:\d+\s+)?[•·]\s*(?:Explored|Read(?:ing)?|Listed|Searched|Opened|Ran|Run)\b.*(?:Working\(?|W(?:o(?:r(?:k(?:i(?:n(?:g)?)?)?)?)?)?|$).*$/i, '')
        .replace(/(LONG_SEQUENCE=.*?\bEND)\s+(?:\d+|W|Wo|W\s+Wo|[•·]?\s*Wor\b.*)$/i, '$1')
        .replace(/([.!?])\s+(?:W|Wo|Wor|Work|Worki|Workin|Working)$/i, '$1')
        .replace(/([.!?])\s+(?:[•·]\s*)?\d+$/i, '$1')
        .replace(/\s+g\s+\d+$/i, '')
        .replace(/(\bADHDEV_[A-Z0-9_]+)\s+\d+$/g, '$1')
        .replace(/\s+(?:[•·]?\s*(?:W|Wo|Wor|Work|Worki|Workin|Working|orking|rking|king|ing|ng|g)\s*){2,}$/i, '')
        .replace(/\s+(?:W|Wo|Wor|Work|Worki|Workin|orking|rking|king|ing|ng|g)\(?$/i, '')
        .replace(/\s+[•·]\s*(?:W|Wo|Wor|Work|Worki|Workin|Working)\b.*$/i, '')
        .trim();
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
    const l = stripInlineStatusResidue(normalize(rawLine));
    if (!l || isNoise(l)) return '';
    return stripInlineStatusResidue(l
        .replace(/^✔\s+/, '')
        .replace(/^\s*│\s*/, '')
        .replace(/▌.*$/g, '')
        .replace(/⏎\s+send.*$/i, '')
        .replace(/\b\d+(?:\.\d+)?[KM]?\s+tokens used\b.*$/i, '')
        .replace(/\b\d+% (?:context )?left\b.*$/i, '')
        .replace(/\b(?:Working|Thinking|Planning|Searching|Reading|Analyzing|Inspecting|Responding)[^.!?]*$/i, '')
        .replace(/Write tests for @filename.*$/i, '')
        .replace(/(LONG_SEQUENCE=.*?\bEND)\s+\d+$/i, '$1')
        .trim());
}

function cleanUserLine(rawLine) {
    let l = stripInlineStatusResidue(normalize(rawLine));
    if (!l) return '';
    l = l.replace(/^[›❯▌>]\s*/, '').replace(/^\s*│\s*/, '').trim();
    if (!l || BOX_RE.test(l) || isHeaderLine(l) || isFooterLine(l) || isWelcomeLine(l)
        || isStatusLine(l) || isPlaceholderLine(l) || /^…\s+\+\d+\s+lines\b/i.test(l)) {
        return '';
    }
    return stripTrailingFooterChrome(l);
}

function rehydrateRenderedSections(text) {
    // Preserve the provider-rendered transcript literally. Older versions tried to
    // infer Python/output sections and synthesize markdown fences for verifier
    // readability, but that introduced provider-owned content not present in the
    // raw CLI transcript and depended on fixture-specific output markers.
    return String(text || '').trim();
}

// ─── Startup screen detection ───────────────────

function isStartupScreen(text) {
    const v = String(text || '');
    const lines = splitLines(v).map(l => normalize(l)).filter(Boolean);
    return /You are running Codex in/i.test(v)
        || /Do you trust the contents of this directory\?/i.test(v)
        || (/OpenAI Codex/i.test(v) && /To get started, describe a task/i.test(v))
        || /Since this folder is version controlled/i.test(v)
        || /\/init - create an AGENTS\.md file/i.test(v)
        || /Tip:\s+(?:New Try the Codex App|Use \/skills)/i.test(v)
        || lines.some(line => STARTER_PROMPT_RE.test(line));
}

// ─── Session ID extraction ──────────────────────

const SESSION_ID_RE = /session id:\s*([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i;

function extractSessionId(rawBuffer, buffer, screenText) {
    const source = [rawBuffer, buffer, screenText].map(v => String(v || '')).join('\n');
    const m = source.match(SESSION_ID_RE);
    return m ? m[1] : '';
}

// ─── Prompt scoping ─────────────────────────────

function promptLineBody(line) {
    const normalizedLine = normalize(line);
    if (!isInputLine(normalizedLine)) return '';
    return cleanUserLine(normalizedLine);
}

function findPromptLineIndex(lines, promptText) {
    const normalizedPrompt = normalizeForCompare(promptText);
    if (!normalizedPrompt) return -1;

    for (let i = lines.length - 1; i >= 0; i--) {
        const body = normalizeForCompare(promptLineBody(lines[i]));
        if (!body) continue;
        if (body === normalizedPrompt) return i;
        // Codex can show a wrapped/truncated prompt row. Limit prefix matching to
        // explicit input rows so assistant prose cannot become a fuzzy anchor.
        if (body.length >= 24 && normalizedPrompt.startsWith(body)) return i;
    }
    return -1;
}

function sliceAfterPrompt(text, promptText) {
    const lines = splitLines(text);
    const idx = findPromptLineIndex(lines, promptText);
    return idx < 0 ? text : lines.slice(idx + 1).join('\n');
}

// ─── Assistant text extraction ──────────────────

function normalizeMessage(message) {
    const role = message?.role === 'user' ? 'user' : 'assistant';
    const kind = typeof message?.kind === 'string' && message.kind ? message.kind : 'standard';
    const senderName = typeof message?.senderName === 'string' && message.senderName ? message.senderName : undefined;
    return {
        role,
        kind,
        ...(senderName ? { senderName } : {}),
        content: typeof message?.content === 'string' ? message.content.trim() : String(message?.content || '').trim(),
        timestamp: message?.timestamp,
    };
}

function normalizeNativeMessage(message) {
    const normalized = normalizeMessage(message);
    if (!normalized.content || normalized.kind === 'session_start' || normalized.role === 'system') return null;
    return normalized;
}

function collectNativeMessages(input, fallbackSessionId) {
    if (!nativeHistory || typeof nativeHistory.readCodexNativeHistory !== 'function') return { messages: [], providerSessionId: fallbackSessionId || '' };
    const workspace = String(input?.workspace || input?.workingDir || input?.args?.workspace || input?.args?.workingDir || '').trim();
    const historySessionId = String(input?.historySessionId || input?.sessionId || input?.args?.historySessionId || input?.args?.sessionId || fallbackSessionId || '').trim();
    if (!historySessionId) return { messages: [], providerSessionId: fallbackSessionId || '' };
    const result = nativeHistory.readCodexNativeHistory({ historySessionId, sessionId: historySessionId, workspace });
    const records = Array.isArray(result?.messages) ? result.messages : [];
    const messages = records.map(normalizeNativeMessage).filter(Boolean);
    const resolvedSessionId = String(records.find(record => record?.historySessionId)?.historySessionId || historySessionId || '').trim();
    return { messages: dedupeMessages(messages), providerSessionId: resolvedSessionId || fallbackSessionId || '' };
}

function comparableText(message) {
    return normalizeForCompare(normalizeMessage(message).content);
}

function messagesMatch(left, right) {
    const a = normalizeMessage(left);
    const b = normalizeMessage(right);
    if (!a.content || !b.content || a.role !== b.role || a.kind !== b.kind) return false;
    return comparableText(a) === comparableText(b);
}

function chooseMoreCompleteMessage(left, right) {
    const a = normalizeMessage(left);
    const b = normalizeMessage(right);
    const preferred = b.content.length > a.content.length ? b : a;
    const fallback = preferred === a ? b : a;
    return {
        role: preferred.role,
        kind: preferred.kind || fallback.kind || 'standard',
        ...(preferred.senderName || fallback.senderName ? { senderName: preferred.senderName || fallback.senderName } : {}),
        content: preferred.content,
        timestamp: preferred.timestamp || fallback.timestamp,
    };
}

function dedupeMessages(messages) {
    const out = [];
    for (const raw of Array.isArray(messages) ? messages : []) {
        const message = normalizeMessage(raw);
        if (!message.content) continue;
        const prev = out[out.length - 1];
        if (prev && messagesMatch(prev, message)) {
            out[out.length - 1] = chooseMoreCompleteMessage(prev, message);
            continue;
        }
        out.push(message);
    }
    return out;
}

function mergeMessageHistories(baseMessages, currentMessages) {
    const merged = dedupeMessages(baseMessages);
    const current = dedupeMessages(currentMessages);
    if (merged.length === 0) return current;
    let cursor = 0;
    for (const message of current) {
        let matchIndex = -1;
        for (let i = cursor; i < merged.length; i += 1) {
            if (messagesMatch(merged[i], message)) {
                matchIndex = i;
                break;
            }
        }
        if (matchIndex >= 0) {
            merged[matchIndex] = chooseMoreCompleteMessage(merged[matchIndex], message);
            cursor = matchIndex + 1;
            continue;
        }
        const prev = merged[merged.length - 1];
        if (prev && messagesMatch(prev, message)) {
            merged[merged.length - 1] = chooseMoreCompleteMessage(prev, message);
        } else {
            merged.push(message);
        }
        cursor = merged.length;
    }
    return dedupeMessages(merged);
}

function classifyCodexLead(line, content) {
    if (/^>\s+/.test(line)) return { kind: 'standard' };
    const body = String(content || '').trim();
    if (/^(?:Ran|Run)\s+/i.test(body)) return { kind: 'terminal', senderName: 'Terminal' };
    if (/^(?:Explored|Read|Reading|Listed|Searched|Opened|Added|Edited|Updated|Deleted|Created|Modified|Patched|Wrote|Checked)\b/i.test(body)) {
        return { kind: 'tool', senderName: 'Tool' };
    }
    return { kind: 'standard' };
}

function cleanActivityContinuation(rawLine) {
    const line = stripInlineStatusResidue(normalize(rawLine));
    if (!line || isNoise(line) || isInputLine(line)) return '';
    const withoutBranch = stripInlineStatusResidue(line.replace(/^\s*[│└]\s*/, '').trim());
    if (!withoutBranch || isNoise(withoutBranch)) return '';
    return stripInlineStatusResidue(line.replace(/^\s*│\s*/, '').trim());
}

function collectVisibleMessages(text) {
    const lines = splitLines(text);
    const messages = [];
    let current = null;

    const flush = () => {
        if (!current) return;
        const content = current.lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
        if (content && !shouldSuppress(content)) {
            messages.push({
                role: current.role || 'assistant',
                kind: current.kind || 'standard',
                ...(current.senderName ? { senderName: current.senderName } : {}),
                content,
            });
        }
        current = null;
    };

    for (const rawLine of lines) {
        const line = normalize(rawLine);
        if (!line) continue;
        if (isWelcomeLine(line) || isPlaceholderLine(line) || isHeaderLine(line) || isFooterLine(line) || BOX_RE.test(line)) {
            continue;
        }
        if (isInputLine(line)) {
            flush();
            const userText = cleanUserLine(line);
            if (userText && !isHeaderLine(userText) && !isFooterLine(userText)) {
                current = { role: 'user', kind: 'standard', lines: [userText] };
            }
            continue;
        }
        if (isAssistantLead(line)) {
            flush();
            const stripped = cleanLine(stripLead(line));
            if (!stripped || /^W(?:o(?:r(?:k(?:i(?:n(?:g)?)?)?)?)?)?$/i.test(stripped)) continue;
            const classification = classifyCodexLead(line, stripped);
            current = { ...classification, lines: [stripped] };
            continue;
        }
        if (!current) continue;
        const cleaned = current.role === 'user'
            ? cleanUserLine(rawLine)
            : cleanActivityContinuation(rawLine);
        if (!cleaned) continue;
        if (current.lines[current.lines.length - 1] !== cleaned) current.lines.push(cleaned);
    }
    flush();
    return dedupeMessages(messages);
}

function collectAssistantText(text) {
    const messages = collectVisibleMessages(text).filter(m => m.role === 'assistant');
    const standard = [...messages].reverse().find(m => m.kind === 'standard' && m.content);
    const preferred = standard || [...messages].reverse().find(m => m.content);
    return preferred ? preferred.content : '';
}

function messageSetScore(messages) {
    return (Array.isArray(messages) ? messages : []).reduce((score, message) => {
        const content = String(message?.content || '');
        const kindBonus = message?.kind === 'standard' ? 20 : 5;
        return score + content.length + kindBonus;
    }, 0);
}

function chooseRicherMessages(...sets) {
    return sets.reduce((best, current) => {
        if (!Array.isArray(current) || current.length === 0) return best;
        if (!Array.isArray(best) || best.length === 0) return current;
        if (current.length > best.length) return current;
        if (current.length === best.length && messageSetScore(current) > messageSetScore(best)) return current;
        return best;
    }, []);
}

// ─── Suppress detection ─────────────────────────

function shouldSuppress(text) {
    const v = String(text || '').trim();
    if (!v) return true;
    return /^(?:>_ )?OpenAI Codex\b/.test(v) || isApprovalLine(v);
}

// ─── Message building ───────────────────────────

function createApprovalMessage(activeModal) {
    const message = String(activeModal?.message || '').trim();
    const buttons = Array.isArray(activeModal?.buttons)
        ? activeModal.buttons.map(button => String(button || '').trim()).filter(Boolean)
        : [];
    const lines = ['Approval requested'];
    if (message) lines.push(message);
    if (buttons.length > 0) lines.push(buttons.map(label => `[${label}]`).join(' '));
    return {
        role: 'assistant',
        kind: 'system',
        senderName: 'System',
        content: lines.join('\n'),
    };
}

function appendPromptMessage(messages, promptText) {
    const prompt = String(promptText || '').trim();
    const base = Array.isArray(messages) ? messages : [];
    if (!prompt) return base;
    const lastUser = [...base].reverse().find(m => m?.role === 'user');
    if (lastUser && normalizeForCompare(lastUser.content) === normalizeForCompare(prompt)) return base;
    return [...base, { role: 'user', kind: 'standard', content: prompt }];
}

function buildMessages(previousMessages, currentMessagesOrText) {
    const base = Array.isArray(previousMessages)
        ? previousMessages
            .filter(m => m && (m.role === 'user' || m.role === 'assistant'))
            .map(normalizeMessage)
        : [];

    const currentMessages = Array.isArray(currentMessagesOrText)
        ? currentMessagesOrText
        : (currentMessagesOrText && !shouldSuppress(currentMessagesOrText)
            ? [{ role: 'assistant', kind: 'standard', content: currentMessagesOrText }]
            : []);

    return mergeMessageHistories(base, currentMessages);
}

function toMessageObjects(messages, status) {
    return dedupeMessages(messages).map((m, i, arr) => ({
        id: `msg_${i}`,
        role: m.role,
        content: m.content,
        index: i,
        kind: m.kind || 'standard',
        ...(m.senderName ? { senderName: m.senderName } : {}),
        ...(status === 'generating' && i === arr.length - 1 && m.role === 'assistant' && (m.kind || 'standard') === 'standard'
            ? { meta: { streaming: true } }
            : {}),
    }));
}

// ─── Export ──────────────────────────────────────

function parseOutput(input) {
    const screenText = String(input?.screenText || '');
    const buffer = String(input?.buffer || '');
    const transcript = screenText || buffer;
    const tail = String(input?.recentBuffer || transcript.slice(-500));
    const promptText = String(input?.promptText || input?.scope?.prompt || input?.args?.promptText || '').trim();
    const previousMessages = appendPromptMessage(Array.isArray(input?.messages) ? input.messages : [], promptText);
    const lastUser = [...previousMessages].reverse().find(m => m?.role === 'user');
    const promptScope = lastUser?.content || promptText;
    const hasUserPrompt = !!promptScope;

    const controlValues = extractControlValues(screenText, buffer, input?.recentBuffer || '', input?.rawBuffer || '');

    const status = detectStatus({ tail, screenText, rawBuffer: input?.rawBuffer || '' });
    const visibleSessionId = extractSessionId(input?.rawBuffer, transcript, screenText);
    const activeModal = status === 'waiting_approval'
        ? parseApproval({ screenText, buffer: transcript, rawBuffer: input?.rawBuffer || '', tail })
        : null;

    // During approval or pre-prompt startup, avoid workspace-wide native history.
    // Fresh Codex launches often have no session id yet, and reading by cwd alone
    // can attach an older transcript from another Codex terminal in the same repo.
    if (status === 'waiting_approval' || (!hasUserPrompt && isStartupScreen(transcript))) {
        const visibleMessages = activeModal
            ? buildMessages(previousMessages, [createApprovalMessage(activeModal)])
            : buildMessages(previousMessages, []);
        return {
            id: 'cli_session',
            status,
            title: 'Codex CLI',
            messages: toMessageObjects(visibleMessages, status),
            activeModal,
            ...(controlValues ? { controlValues } : {}),
            providerSessionId: visibleSessionId || undefined,
        };
    }

    const nativeSession = collectNativeMessages(input, visibleSessionId);

    // Scope to current turn
    const scopedScreen = sliceAfterPrompt(screenText, promptScope);
    const scopedBuffer = sliceAfterPrompt(buffer, promptScope);

    // Extract assistant messages from all available views. Prefer the richer source; the
    // live screen can contain truncated rows or model footer chrome, while recentBuffer
    // often has the fully rendered final assistant line.
    const screenMessages = collectVisibleMessages(scopedScreen || screenText);
    const bufferMessages = collectVisibleMessages(scopedBuffer || buffer);
    const recentMessages = collectVisibleMessages(sliceAfterPrompt(tail, promptScope) || tail);
    const tuiMessages = chooseRicherMessages(screenMessages, bufferMessages, recentMessages);
    const currentMessages = nativeSession.messages.length > 0
        ? (status === 'idle' ? nativeSession.messages : chooseRicherMessages(nativeSession.messages, tuiMessages))
        : tuiMessages;
    const fromScreen = collectAssistantText(scopedScreen || screenText);
    const fromBuffer = collectAssistantText(scopedBuffer || buffer);
    const fromRecent = collectAssistantText(sliceAfterPrompt(tail, promptScope) || tail);
    const assistantText = rehydrateRenderedSections(
        [fromScreen, fromBuffer, fromRecent].sort((a, b) => String(b || '').length - String(a || '').length)[0] || '',
    );
    const visibleAssistantText = currentMessages.some(m => m.kind === 'standard')
        ? ''
        : assistantText;

    // Final startup guard
    if (!hasUserPrompt && isStartupScreen(assistantText)) {
        return {
            id: 'cli_session',
            status,
            title: 'Codex CLI',
            messages: toMessageObjects(previousMessages, status),
            activeModal,
            ...(controlValues ? { controlValues } : {}),
            providerSessionId: nativeSession.providerSessionId || visibleSessionId || undefined,
        };
    }

    const messages = buildMessages(previousMessages, currentMessages.length > 0
        ? currentMessages
        : visibleAssistantText);

    return {
        id: 'cli_session',
        status,
        title: 'Codex CLI',
        messages: toMessageObjects(messages, status),
        activeModal,
        ...(controlValues ? { controlValues } : {}),
        providerSessionId: nativeSession.providerSessionId || visibleSessionId || undefined,
        ...(nativeSession.messages.length > 0 ? { transcriptAuthority: 'provider', coverage: 'full' } : {}),
    };
}

module.exports = parseOutput;
module.exports.rehydrateRenderedSections = rehydrateRenderedSections;
