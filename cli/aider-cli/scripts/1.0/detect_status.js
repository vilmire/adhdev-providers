/**
 * Aider — detect_status
 * Uses screenText (current visible PTY snapshot) as primary signal.
 * Falls back to tail for partial/recent output.
 */
'use strict';
module.exports = function detectStatus(input) {
    const { tail, screenText } = input;
    const screen = (screenText || '').trim();
    const t = tail || '';

    // --- approval patterns (check before generating) ---
    // Aider prompts: "Allow creation of new file? (Y)es/(N)o"
    //                "Run shell command? (Y)es/(N)o"
    //                "Apply edits? (Y)es/(N)o"
    //                "Add X to the chat? (Y)es/(N)o [Yes]:"
    const approvalScreen = /\(Y\)es\/\(N\)o/i.test(screen) ||
        /Allow\s+creation/i.test(screen) ||
        /Run\s+shell\s+command/i.test(screen) ||
        /Apply\s+(edit|change)/i.test(screen) ||
        /Add\s+.+\s+to\s+the\s+chat/i.test(screen);
    if (approvalScreen) return 'waiting_approval';

    const approvalTail = (/\(Y\)es\/\(N\)o/i.test(t) || /Allow\s+creation/i.test(t) ||
        /Run\s+shell\s+command/i.test(t) || /Apply\s+(edit|change)/i.test(t)) &&
        !/Tokens:/i.test(t.slice(-100));
    if (approvalTail) return 'waiting_approval';

    // --- generating patterns ---
    // Braille spinner
    if (/[\u2800-\u28ff]/.test(screen)) return 'generating';
    if (/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(screen)) return 'generating';
    // Aider streaming indicators
    if (/Thinking\.\.\.|Sending\.\.\.|Streaming\.\.\./i.test(screen)) return 'generating';
    // Screen shows partial response (no prompt at bottom, content is present)
    // If screen has substantial text and no trailing '>' prompt, likely generating
    if (screen && screen.length > 20 && !/>\s*$/.test(screen) && !/Tokens:/i.test(screen)) {
        // Check tail for spinner or active output
        if (/[\u2800-\u28ff]/.test(t) || /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(t)) return 'generating';
        if (/Thinking\.\.\.|Sending\.\.\.|Streaming\.\.\./i.test(t)) return 'generating';
    }

    // --- idle: aider shows '>' prompt when waiting for input ---
    if (/^>\s*$/.test(screen)) return 'idle';
    if (/Tokens:/i.test(screen)) return 'idle';

    // tail-based fallback
    if (/Tokens:/i.test(t)) return 'idle';

    return 'idle';
};
