/**
 * GitHub Copilot CLI — detect_status
 * `gh copilot` uses a conversational interface.
 */
'use strict';
module.exports = function detectStatus(input) {
    const { tail } = input;
    if (!tail) return 'idle';
    const text = String(tail);
    const trimmed = text.trim();
    // waiting_approval
    if (/Confirm folder trust/i.test(text)) return 'waiting_approval';
    if (/Do you trust the files in this folder\?/i.test(text)) return 'waiting_approval';
    if (/^\s*❯?\s*1\.\s*Yes\b/m.test(text) && /^\s*2\.\s*Yes, and remember this folder/m.test(text)) return 'waiting_approval';
    if (/execute\s*command/i.test(text) && /\[Y\/n\]/i.test(text)) return 'waiting_approval';
    if (/approve|confirm/i.test(text) && /\(y\/n\)/i.test(text)) return 'waiting_approval';
    if (/Run\s*this/i.test(text) && /deny|cancel|no/i.test(text)) return 'waiting_approval';
    // generating
    if (/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(text)) return 'generating';
    if (/thinking|generating|processing/i.test(text)) return 'generating';
    if (/\.{3,}$/.test(trimmed)) return 'generating';
    return 'idle';
};
