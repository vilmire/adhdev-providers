/**
 * Codex CLI — detect_status
 *
 * Lightweight status detection from screen/tail text.
 * Returns: 'idle' | 'generating' | 'waiting_approval'
 */
'use strict';

// ─── Helpers ─────────────────────────────────────

const ANSI_RE = /\x1b\[[0-?]*[ -/]*[@-~]/g;

function stripAnsi(value) {
    return String(value || '').replace(ANSI_RE, '');
}

function text(input, key) {
    return stripAnsi((input && input[key]) || '');
}

function tailLines(input, count) {
    const raw = text(input, 'screenText') || text(input, 'tail');
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    return lines.slice(-count);
}

// ─── Matchers ────────────────────────────────────

// Approval cue: the actual question/prompt text (not buttons, not footer)
const APPROVAL_CUE_RE = /Do you trust the contents of this directory\?|Working with untrusted contents|You are running Codex in|Allow Codex to (?:run|apply)|Allow command\?|Update available!/i;
// Approval buttons: numbered choice lines
const APPROVAL_BUTTON_RE = /^(?:[▌>›❯]\s*)?\d+\.\s+\S|Approve and run now|Always approve this session/i;
// Footer lines that accompany interactive prompts
const APPROVAL_FOOTER_RE = /Press [Ee]nter to (?:continue|confirm)|Esc to cancel/i;

const GENERATING_SPINNER_RE = /(?:Thinking|Planning|Searching|Reading|Working|Analyzing|Inspecting|Responding|Following instructions clearly)[^\n]*\(\d+s\b/i;
const GENERATING_ESC_RE = /Esc to interrupt/i;
const GENERATING_BRAILLE_RE = /[⠁-⣿]/;
const GENERATING_PARTIAL_WORK_RE = /(?:^|\s)•\s*(?:W|Wo|Wor|Work|Worki|Workin|Working)\b/i;

const IDLE_SEND_RE = /⏎\s+send/i;
const IDLE_PROMPT_LINE_RE = /^(?:>\s*|[›❯]\s*)$/;
const IDLE_FOOTER_RE = /(?:^|\s)[›❯]\s*(?:tab to queue message\b|gpt-[^\n]*?·\s*\/)/i;
const WELCOME_RE = /OpenAI Codex/i;
const STARTUP_RE = /To get started, describe a task|model:\s+.*directory:\s+|Tip:\s+(?:New Try the Codex App|Use \/skills)/is;

// ─── Detection ───────────────────────────────────

function hasApproval(lines) {
    const window = lines.slice(-18);
    const hasCue = window.some(l => APPROVAL_CUE_RE.test(l));
    const hasButton = window.some(l => APPROVAL_BUTTON_RE.test(l));
    const hasFooter = window.some(l => APPROVAL_FOOTER_RE.test(l));
    // Cue + buttons = definite approval
    // Buttons + footer (without cue) = likely interactive prompt (e.g. new dialog formats)
    return hasButton && (hasCue || hasFooter);
}

function hasGenerating(lines, raw) {
    const rawText = String(raw || '');
    const block = lines.slice(-12).join('\n');
    const lastGenerating = Math.max(
        rawText.lastIndexOf('Esc to interrupt'),
        rawText.lastIndexOf('esc to interrupt'),
        rawText.lastIndexOf('• Working'),
        rawText.lastIndexOf('•Working'),
        rawText.lastIndexOf('Working('),
    );
    const lastIdleFooter = Math.max(
        rawText.lastIndexOf('› tab to queue message'),
        rawText.lastIndexOf('› gpt-'),
        rawText.lastIndexOf('❯ tab to queue message'),
        rawText.lastIndexOf('❯ gpt-'),
    );
    if (lastIdleFooter >= 0 && lastIdleFooter > lastGenerating && IDLE_FOOTER_RE.test(rawText.slice(Math.max(0, lastIdleFooter - 2)))) {
        return false;
    }
    if (GENERATING_ESC_RE.test(block)) return true;
    if (GENERATING_SPINNER_RE.test(block)) return true;
    if (GENERATING_BRAILLE_RE.test(block) && /(?:Working|Thinking|Esc to interrupt)/i.test(block)) return true;
    if (GENERATING_PARTIAL_WORK_RE.test(rawText || block)) return true;
    return false;
}

function hasReadyPrompt(raw) {
    const rawText = String(raw || '');
    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const recent = lines.slice(-8);
    return recent.some(line => IDLE_SEND_RE.test(line) || IDLE_PROMPT_LINE_RE.test(line));
}

function hasIdle(raw) {
    const rawText = String(raw || '');
    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const recent = lines.slice(-8);
    if (recent.some(line => IDLE_SEND_RE.test(line) || IDLE_PROMPT_LINE_RE.test(line))) return true;

    const lastGenerating = Math.max(
        rawText.lastIndexOf('Esc to interrupt'),
        rawText.lastIndexOf('esc to interrupt'),
        rawText.lastIndexOf('• Working'),
        rawText.lastIndexOf('•Working'),
        rawText.lastIndexOf('Working('),
    );
    const lastIdleFooter = Math.max(
        rawText.lastIndexOf('› tab to queue message'),
        rawText.lastIndexOf('› gpt-'),
        rawText.lastIndexOf('❯ tab to queue message'),
        rawText.lastIndexOf('❯ gpt-'),
    );
    if (lastIdleFooter >= 0 && lastIdleFooter > lastGenerating && IDLE_FOOTER_RE.test(rawText.slice(Math.max(0, lastIdleFooter - 2)))) {
        return true;
    }

    if (WELCOME_RE.test(rawText) && STARTUP_RE.test(rawText)) return true;
    return false;
}

// ─── Export ──────────────────────────────────────

module.exports = function detectStatus(input) {
    const screen = text(input, 'screenText');
    const tail = text(input, 'tail');
    const visible = screen.trim() || tail.trim();
    if (!visible) return 'idle';

    const lines = (screen || tail).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const recentRaw = tail || screen;

    if (hasApproval(lines)) return 'waiting_approval';
    if (screen && hasReadyPrompt(screen)) return 'idle';
    if (hasGenerating(lines, recentRaw)) return 'generating';
    if (hasIdle(screen || tail)) return 'idle';
    if (tail && hasIdle(tail)) return 'idle';

    // Tail-only fallbacks
    if (GENERATING_ESC_RE.test(tail)) return 'generating';
    if (GENERATING_SPINNER_RE.test(tail)) return 'generating';

    return 'idle';
};
