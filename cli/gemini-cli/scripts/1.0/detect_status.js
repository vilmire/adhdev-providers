/**
 * Gemini CLI — detect_status
 * Input:  { tail: string }
 * Output: 'idle' | 'generating' | 'waiting_approval'
 */
'use strict';
module.exports = function detectStatus(input) {
    const screenText = String(input?.screenText || '');
    const tailText = String(input?.tail || '');
    const text = screenText.trim() ? screenText : tailText;
    if (!text) return 'idle';
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

    if (looksIdle && !explicitProgress) {
        const lines = text.split(/\r\n|\n|\r/g).map(line => line.trim()).filter(Boolean);
        let lastPromptIndex = -1;
        for (let index = lines.length - 1; index >= 0; index -= 1) {
            if (/^>\s*$/.test(lines[index]) || /[›❯]\s*$/.test(lines[index]) || /Type your message/i.test(lines[index])) {
                lastPromptIndex = index;
                break;
            }
        }
        if (lastPromptIndex >= 0) {
            const afterPrompt = lines.slice(lastPromptIndex + 1).join('\n');
            if (!/Allow\s*once/i.test(afterPrompt)
                && !/Always\s*allow/i.test(afterPrompt)
                && !/Run\s*this\s*command/i.test(afterPrompt)
                && !/\(y\/n\)/i.test(afterPrompt)
                && !/\[Y\/n\]/i.test(afterPrompt)) {
                return 'idle';
            }
        }
    }
    if (looksIdle && !explicitProgress) return 'idle';
    if (explicitProgress) return 'generating';

    if (screenText.trim()) return 'idle';

    return 'idle';
};
