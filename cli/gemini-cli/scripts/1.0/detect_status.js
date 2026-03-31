/**
 * Gemini CLI — detect_status
 * Input:  { tail: string }
 * Output: 'idle' | 'generating' | 'waiting_approval'
 */
'use strict';
module.exports = function detectStatus(input) {
    const { tail } = input;
    if (!tail) return 'idle';
    const text = String(tail);
    const trimmed = text.trim();

    // waiting_approval
    if (/Allow\s*once/i.test(text) || /Always\s*allow/i.test(text)) return 'waiting_approval';
    if (/\(y\/n\)/i.test(text) || /\[Y\/n\]/i.test(text)) return 'waiting_approval';
    if (/Run\s*this\s*command/i.test(text)) return 'waiting_approval';
    if (/Deny/i.test(text) && /Allow/i.test(text)) return 'waiting_approval';
    if (/auto-?approve/i.test(text) && /Deny/i.test(text)) return 'waiting_approval';

    // Gemini renders braille/logo/box glyphs in its idle prompt, so prefer prompt cues
    // over glyph-based heuristics and only treat explicit progress text as generating.
    const looksIdle =
        /\?\s*for\s*shortcuts/i.test(text) ||
        /Type your message(?:\s+or\s+@path\/to\/file)?/i.test(text) ||
        /workspace\s*\(\/directory\)/i.test(text) ||
        /\/model/i.test(text) ||
        /^>\s*$/m.test(text) ||
        /[›❯]\s*$/.test(trimmed);
    const explicitProgress =
        /Waiting for authentication/i.test(text) ||
        /Thinking/i.test(text) ||
        /Generating/i.test(text) ||
        /esc to (cancel|interrupt|stop)/i.test(text);

    if (looksIdle && !explicitProgress) return 'idle';
    if (explicitProgress) return 'generating';

    return 'idle';
};
