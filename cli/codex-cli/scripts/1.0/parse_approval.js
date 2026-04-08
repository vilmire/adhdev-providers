/**
 * Codex CLI — parse_approval
 *
 * Extract approval modal info (message + buttons) from screen/buffer text.
 * Returns { message, buttons } or null.
 */
'use strict';

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

function stripLeadMarker(s) {
    return String(s || '').replace(/^(?:[▌>›❯]\s*)+/, '').trim();
}

// ─── Line classifiers ───────────────────────────

const CUE_RE = /Do you trust the contents of this directory\?|Working with untrusted contents|You are running Codex in|Allow Codex to (?:run|apply)|Allow command\?|Update available!/i;
const BUTTON_RE = /^\d+\.\s+/;
const FOOTER_RE = /⏎\s+send|⌃[JTC]\s+|Press [Ee]nter to (?:continue|confirm)|Esc to cancel/i;
const BOX_RE = /^[─═╭╮╰╯│┌┐└┘├┤┬┴┼]+$/;
const CHROME_RE = /^>?\s*(?:You are in|model:|directory:|OpenAI Codex)\b/i;

function isButton(line) {
    return BUTTON_RE.test(stripLeadMarker(normalize(line)));
}

function normalizeButton(line) {
    return stripLeadMarker(normalize(line))
        .replace(/^\d+\.\s+/, '')
        .replace(/\s{2,}\([A-Za-z]\)\s.*$/, '')
        .trim();
}

// ─── Export ──────────────────────────────────────

module.exports = function parseApproval(input) {
    const screen = String(input?.screenText || '');
    const text = screen || String(input?.buffer || input?.tail || '');
    const lines = splitLines(text);
    if (lines.length === 0) return null;

    // Check if there's actually an approval screen visible
    const window = lines.slice(-24).map(normalize).filter(Boolean);
    const hasCue = window.some(l => CUE_RE.test(l));
    const hasButton = window.some(isButton);
    const hasFooter = window.some(l => FOOTER_RE.test(l));
    // Same logic as detect_status: cue+button or button+footer
    if (!hasButton || (!hasCue && !hasFooter)) return null;

    // Collect buttons
    const buttons = [];
    let currentButton = '';
    for (const rawLine of lines.slice(-24)) {
        const line = normalize(rawLine);
        if (!line) continue;
        if (isButton(rawLine)) {
            if (currentButton && !buttons.includes(currentButton)) buttons.push(currentButton);
            currentButton = normalizeButton(rawLine);
            continue;
        }
        if (!currentButton) continue;
        if (FOOTER_RE.test(line) || BOX_RE.test(line) || CHROME_RE.test(line) || CUE_RE.test(line)) continue;
        const continuation = stripLeadMarker(line);
        if (continuation) currentButton = `${currentButton} ${continuation}`.replace(/\s+/g, ' ').trim();
    }
    if (currentButton && !buttons.includes(currentButton)) buttons.push(currentButton);

    // Build message from non-button, non-chrome lines
    const message = lines
        .map(normalize)
        .filter(l => l && !BOX_RE.test(l) && !isButton(l) && !FOOTER_RE.test(l) && !CHROME_RE.test(l) && !/^OpenAI Codex\b/i.test(l))
        .slice(-3)
        .join(' ')
        .slice(0, 240) || 'Codex approval required';

    return {
        message,
        buttons: buttons.length > 0 ? buttons : ['Approve', 'Deny'],
    };
};
