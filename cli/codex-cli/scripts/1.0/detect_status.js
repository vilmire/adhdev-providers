/**
 * Codex CLI — detect_status
 *
 * Lightweight status detection from screen/tail text.
 * Returns: 'idle' | 'generating' | 'waiting_approval'
 */
'use strict';

// ─── Helpers ─────────────────────────────────────

function text(input, key) {
    return String((input && input[key]) || '');
}

function tailLines(input, count) {
    const raw = text(input, 'screenText') || text(input, 'tail');
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    return lines.slice(-count);
}

// ─── Matchers ────────────────────────────────────

const APPROVAL_CUE_RE = /Do you trust the contents of this directory\?|Working with untrusted contents|You are running Codex in|Allow Codex to (?:run|apply)|Allow command\?|Press Enter to (?:continue|confirm)|Esc to cancel/i;
const APPROVAL_BUTTON_RE = /^(?:[▌>›❯]\s*)?\d+\.\s+\S|Approve and run now|Always approve this session/i;

const GENERATING_SPINNER_RE = /(?:Thinking|Planning|Searching|Reading|Working|Analyzing|Inspecting|Responding|Following instructions clearly)[^\n]*\(\d+s\b/i;
const GENERATING_ESC_RE = /Esc to interrupt/i;
const GENERATING_BRAILLE_RE = /[⠁-⣿]/;

const IDLE_PROMPT_RE = /⏎\s+send|^>\s*$|[›❯]\s*$/im;
const WELCOME_RE = /OpenAI Codex/i;
const STARTUP_RE = /To get started, describe a task|model:\s+.*directory:\s+|Tip:\s+(?:New Try the Codex App|Use \/skills)/is;

// ─── Detection ───────────────────────────────────

function hasApproval(lines) {
    const window = lines.slice(-18);
    return window.some(l => APPROVAL_CUE_RE.test(l))
        && window.some(l => APPROVAL_BUTTON_RE.test(l));
}

function hasGenerating(lines) {
    const block = lines.slice(-12).join('\n');
    if (GENERATING_ESC_RE.test(block)) return true;
    if (GENERATING_SPINNER_RE.test(block)) return true;
    if (GENERATING_BRAILLE_RE.test(block) && /(?:Working|Thinking|Esc to interrupt)/i.test(block)) return true;
    return false;
}

function hasIdle(raw) {
    if (IDLE_PROMPT_RE.test(raw)) return true;
    if (WELCOME_RE.test(raw) && STARTUP_RE.test(raw)) return true;
    return false;
}

// ─── Export ──────────────────────────────────────

module.exports = function detectStatus(input) {
    const screen = text(input, 'screenText');
    const tail = text(input, 'tail');
    const visible = screen.trim() || tail.trim();
    if (!visible) return 'idle';

    const lines = (screen || tail).split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    if (hasApproval(lines)) return 'waiting_approval';
    if (hasGenerating(lines)) return 'generating';
    if (hasIdle(screen || tail)) return 'idle';

    // Tail-only fallbacks
    if (GENERATING_ESC_RE.test(tail)) return 'generating';
    if (GENERATING_SPINNER_RE.test(tail)) return 'generating';

    return 'idle';
};
