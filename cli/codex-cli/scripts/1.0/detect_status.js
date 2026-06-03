/**
 * Codex CLI — detect_status
 *
 * Lightweight status detection from screen/tail text.
 * Returns: 'idle' | 'generating' | 'waiting_approval' | null
 */
'use strict';

// ─── Helpers ─────────────────────────────────────

const ANSI_RE = /\x1b\[[0-?]*[ -/]*[@-~]/g;

function stripAnsi(value) {
    return String(value || '')
        .replace(/\x1b\[(\d*)C/g, (_match, n) => ' '.repeat(Math.max(1, Number(n) || 1)))
        .replace(/\x1b\[\d*D/g, '')
        .replace(ANSI_RE, '')
        .replace(/\x1b\][^\x07\x1b\n]*(?:\x07|\x1b\\|(?=\n|$))/g, '')
        .replace(/\x1b[P^_X][\s\S]*?(?:\x07|\x1b\\)/g, '')
        .replace(/\x1b(?:[@-Z\\-_])/g, '');
}

function text(input, key) {
    return stripAnsi((input && input[key]) || '');
}

function compactText(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function hasCompactApprovalCue(value) {
    const compact = compactText(value);
    return compact.includes('doyoutrustthecontentsofthisdirectory')
        || compact.includes('workingwithuntrustedcontents')
        || compact.includes('youarerunningcodexin')
        || compact.includes('allowcodextorun')
        || compact.includes('allowcodextoapply')
        || compact.includes('allowcommand')
        || compact.includes('updateavailable')
        || compact.includes('approachingratelimits')
        || /switchtogpt[\w]+forlowercreditusage/.test(compact);
}

function hasCompactApprovalButton(value) {
    const text = String(value || '');
    const compact = compactText(text);
    return /(?:^|[\s›❯>▌])\d+\.\s*\S/.test(text)
        || /\d+(?:yescontinue|noquit|approveandrun|alwaysapprove|deny)/i.test(compact);
}

function hasCompactApprovalFooter(value) {
    const compact = compactText(value);
    return compact.includes('pressentertocontinue')
        || compact.includes('pressentertoconfirm')
        || compact.includes('esctocancel');
}

// ─── Matchers ────────────────────────────────────

const APPROVAL_RE = /Do you trust the contents of this directory\?|Working with untrusted contents|You are running Codex in|Allow Codex to (?:run|apply)|Allow command\?|Update available!|Approaching rate limits|Switch to gpt-[\w.-]+ for lower credit usage/i;
const APPROVAL_BUTTON_RE = /^(?:[▌>›❯]\s*)?\d+\.\s*\S|(?:^|\s)\d+\.\s*\S|Approve and run now|Always approve this session/i;
const APPROVAL_FOOTER_RE = /Press [Ee]nter to (?:continue|confirm)|Esc to cancel/i;

// Matches Codex spinner labels and accepts elapsed times in any of the
// following formats: `(12s`, `(8m 56s`, `(1h 2m 3s`. Previously only the
// integer-seconds form was recognized so long-running operations missed
// the generating signal once codex switched to mixed units.
const GENERATING_SPINNER_RE = /(?:Thinking|Planning|Searching|Reading|Working|Analyzing|Inspecting|Responding|Following instructions clearly)[^\n]*\((?:\d+h\s+\d+m\s+\d+s|\d+m\s+\d+s|\d+s)\b/i;
const GENERATING_MCP_START_RE = /Starting MCP servers?[^\n]*(?:\(\d+s\b|esc to interrupt|[◦◐◑◒◓◔◕◉●])/i;
const GENERATING_ESC_RE = /Esc to interrupt/i;
const GENERATING_BRAILLE_RE = /[⠁-⣿]/;
const GENERATING_PROGRESS_GLYPH_RE = /(?:^|\n)\s*[◦◐◑◒◓◔◕◉●]\s*(?:$|\n|[A-Z[(])/;
const GENERATING_PARTIAL_WORK_RE = /(?:^|\s)•\s*(?:W|Wo|Wor|Work|Worki|Workin|Working)\b/i;
const ACTIVE_TOOL_ACTIVITY_RE = /(?:^|\n)\s*(?:[•·]\s*)?(?:functions\.)?(?:exec_command|write_stdin|apply_patch|view_image|read_mcp_resource|list_mcp_resources|mcp__[A-Za-z0-9_]+)\b|(?:^|\n)\s*(?:[•·]\s*)?(?:Running|Reading|Editing|Writing|Patching|Checking|Executing)\b|\b\d+\s+background\s+terminal\s+running\b|(?:^|\n)\s*(?:[•·]\s*)?Waited\s+for\s+background\s+terminal\b/i;

const IDLE_SEND_RE = /⏎\s+send/i;
const IDLE_PROMPT_LINE_RE = /^(?:>\s*|[›❯]\s*)$/;
// Match Codex idle footers only. Keep this provider-specific; generic readiness
// fallbacks belong in provider scripts, not the shared CLI adapter.
const IDLE_FOOTER_MODEL_TOKEN_RE = /(?:^|[›❯>]\s*)\b(?:gpt-|o\d\b|codex-)[\w._-]*(?:\s+(?:none|minimal|low|medium|high|xhigh|max|fast))*\s+·/i;
const IDLE_FOOTER_RE = /(?:^|\s)[›❯]\s*(?:tab to queue message\b|(?:gpt-|o\d\b|codex-)[\w._-]*(?:\s+(?:none|minimal|low|medium|high|xhigh|max|fast))*\s+·\s*\/)/i;
const WELCOME_RE = /OpenAI Codex/i;
const STARTER_PROMPT_RE = /^(?:[›❯]\s*)?(?:Find and fix a bug in @filename|Improve documentation in @filename|Write tests for @filename|Explain this codebase|Summarize recent commits|Implement \{feature\}|Use \/skills(?:\s+to\s+list\s+available\s+skills)?|Run \/review on my current changes)$/i;
const STARTUP_RE = /To get started, describe a task/is;

// ─── Detection ───────────────────────────────────

/**
 * Returns the last position in rawText where an idle model-footer appears.
 * Handles Codex model footer prefixes: gpt-, o<digit>, and codex-.
 */
function lastIdleFooterIndex(rawText) {
    const tabQueue = Math.max(
        rawText.lastIndexOf('› tab to queue message'),
        rawText.lastIndexOf('❯ tab to queue message'),
    );
    // Scan for last › / ❯ followed by a known model token and ·
    const MODEL_FOOTER_SCAN_RE = /[›❯]\s*(?:gpt-|o\d[\w._-]*|codex-[\w._-]*)[\w._-]*(?:\s+(?:none|minimal|low|medium|high|xhigh|max|fast))*\s+·/gi;
    let match;
    let lastModel = -1;
    let m;
    while ((m = MODEL_FOOTER_SCAN_RE.exec(rawText)) !== null) {
        lastModel = m.index;
    }
    return Math.max(tabQueue, lastModel);
}

function lastIdlePromptIndex(rawText) {
    const promptRe = /(?:^|\n)\s*[›❯>]\s*(?:\n|$)/g;
    let last = -1;
    let match;
    while ((match = promptRe.exec(rawText)) !== null) {
        last = match.index;
    }
    return Math.max(last, lastIdleFooterIndex(rawText));
}

function lastActiveToolActivityIndex(rawText) {
    const toolRe = new RegExp(ACTIVE_TOOL_ACTIVITY_RE.source, 'gi');
    let last = -1;
    let match;
    while ((match = toolRe.exec(rawText)) !== null) {
        last = match.index;
    }
    return last;
}

function hasActiveToolActivityAfterIdle(rawText) {
    const source = String(rawText || '');
    const lastTool = lastActiveToolActivityIndex(source);
    if (lastTool < 0) return false;
    return lastTool > lastIdlePromptIndex(source);
}

function hasApproval(lines) {
    const window = lines.slice(-18);
    const block = window.join('\n');
    const hasCue = window.some(l => APPROVAL_RE.test(l) || hasCompactApprovalCue(l)) || hasCompactApprovalCue(block);
    const hasButton = window.some(l => APPROVAL_BUTTON_RE.test(l) || hasCompactApprovalButton(l)) || hasCompactApprovalButton(block);
    const hasFooter = window.some(l => APPROVAL_FOOTER_RE.test(l) || hasCompactApprovalFooter(l)) || hasCompactApprovalFooter(block);
    return hasButton && (hasCue || hasFooter);
}

function hasGenerating(lines, raw) {
    const rawText = String(raw || '');
    const block = lines.slice(-12).join('\n');

    // Check if idle prompt is newest
    const lastGenerating = Math.max(
        rawText.lastIndexOf('Esc to interrupt'),
        rawText.lastIndexOf('esc to interrupt'),
        rawText.lastIndexOf('• Working'),
        rawText.lastIndexOf('•Working'),
        rawText.lastIndexOf('Working(')
    );
    const lastIdleFooter = lastIdleFooterIndex(rawText);
    if (lastIdleFooter >= 0 && lastIdleFooter > lastGenerating && IDLE_FOOTER_RE.test(rawText.slice(Math.max(0, lastIdleFooter - 2)))) {
        return false;
    }
    
    if (GENERATING_ESC_RE.test(block)) return true;
    if (GENERATING_MCP_START_RE.test(block)) return true;
    if (GENERATING_SPINNER_RE.test(block)) return true;
    if (GENERATING_PROGRESS_GLYPH_RE.test(block)) return true;
    if (GENERATING_BRAILLE_RE.test(block) && /(?:Working|Thinking|Esc to interrupt|Generating)/i.test(block)) return true;
    if (GENERATING_PARTIAL_WORK_RE.test(rawText || block)) return true;
    return false;
}

function hasReadyPrompt(raw) {
    const rawText = String(raw || '');
    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const recent = lines.slice(-8);
    const recentBlock = recent.join('\n');
    return recent.some(line => IDLE_SEND_RE.test(line) || IDLE_PROMPT_LINE_RE.test(line))
        || IDLE_FOOTER_RE.test(recentBlock);
}

function hasReadyFooter(raw) {
    const rawText = String(raw || '');
    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const recentBlock = lines.slice(-8).join('\n');
    return IDLE_FOOTER_RE.test(recentBlock) || IDLE_FOOTER_MODEL_TOKEN_RE.test(recentBlock);
}

function hasRecentActiveGeneratingCue(raw) {
    const rawText = String(raw || '');
    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const recentBlock = lines.slice(-12).join('\n');
    return GENERATING_ESC_RE.test(recentBlock)
        || GENERATING_MCP_START_RE.test(recentBlock)
        || GENERATING_SPINNER_RE.test(recentBlock)
        || GENERATING_PROGRESS_GLYPH_RE.test(recentBlock)
        || (GENERATING_BRAILLE_RE.test(recentBlock) && /(?:Working|Thinking|Esc to interrupt|Generating)/i.test(recentBlock));
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
        rawText.lastIndexOf('Working(')
    );
    const lastIdleFooter = lastIdleFooterIndex(rawText);

    if (lastIdleFooter >= 0 && lastIdleFooter > lastGenerating && IDLE_FOOTER_RE.test(rawText.slice(Math.max(0, lastIdleFooter - 2)))) {
        return true;
    }

    if (
        WELCOME_RE.test(rawText)
        && (STARTUP_RE.test(rawText) || lines.some(line => STARTER_PROMPT_RE.test(line)))
        && !GENERATING_ESC_RE.test(rawText)
        && !GENERATING_MCP_START_RE.test(rawText)
        && !GENERATING_SPINNER_RE.test(rawText)
        && !GENERATING_PROGRESS_GLYPH_RE.test(rawText)
    ) return true;
    
    return false;
}

function hasStartupIdleScreen(raw) {
    const rawText = String(raw || '');
    if (!WELCOME_RE.test(rawText)) return false;
    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const hasStartupPrompt = STARTUP_RE.test(rawText) || lines.some(line => STARTER_PROMPT_RE.test(line));
    if (!hasStartupPrompt) return false;
    if (GENERATING_ESC_RE.test(rawText)) return false;
    if (GENERATING_MCP_START_RE.test(rawText)) return false;
    if (GENERATING_SPINNER_RE.test(rawText)) return false;
    if (GENERATING_PROGRESS_GLYPH_RE.test(rawText)) return false;
    return true;
}

// ─── Export ──────────────────────────────────────

module.exports = function detectStatus(input) {
    const screen = text(input, 'screenText');
    const tail = text(input, 'tail');
    const raw = text(input, 'rawBuffer');
    const visible = screen.trim() || tail.trim() || raw.trim();
    if (!visible) return 'idle';

    const combined = [screen, tail, raw].filter(Boolean).join('\n');
    const lines = combined.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const recentRaw = raw || tail || screen;

    if (hasApproval(lines)) return 'waiting_approval';

    // (fix 2026-06) When `screen` (post-terminal-emulation, source of truth
    // for "what the user actually sees now") shows the codex startup idle
    // screen — welcome box + starter prompt + idle footer — trust it
    // unconditionally. codex 0.136 logs "Starting MCP servers ... esc to
    // interrupt" lines during boot that linger in the ANSI raw buffer even
    // after the screen redraws to idle. The raw-cue branch below would then
    // pin status to `generating` forever despite the live screen being idle.
    if (screen && hasStartupIdleScreen(screen)) return 'idle';

    // (fix) Generation cues win over the "ready footer / prompt" idle paths.
    // Codex keeps the model footer + prompt input visible while a background
    // tool (`exec_command(... &)` + sleep, `1 background terminal running`,
    // etc.) is still pending. The prior order let `hasReadyPrompt` fire idle
    // even though the user's screen literally showed
    // `Working (Xs • esc to interrupt) · 1 background terminal running`.
    // Trust the explicit generation signals first; only consider idle paths
    // when no generation cue is anywhere in the live window.
    if (hasRecentActiveGeneratingCue(screen) || hasRecentActiveGeneratingCue(recentRaw)) {
        return 'generating';
    }
    if (input?.isWaitingForResponse && hasActiveToolActivityAfterIdle(recentRaw)) return 'generating';

    // A currently visible Codex model footer is stronger evidence than stale raw
    // buffer activity from an earlier turn. Do this before the isWaiting guard so
    // rawBuffer churn cannot keep a completed turn generating forever.
    if (screen && hasReadyFooter(screen)) return 'idle';
    if (screen && hasReadyPrompt(screen)) return 'idle';
    if (hasGenerating(lines, recentRaw)) return 'generating';
    if (hasIdle(screen || tail)) return 'idle';
    if (tail && hasIdle(tail)) return 'idle';

    if (GENERATING_ESC_RE.test(tail)) return 'generating';
    if (GENERATING_SPINNER_RE.test(tail)) return 'generating';

    return null;
};
