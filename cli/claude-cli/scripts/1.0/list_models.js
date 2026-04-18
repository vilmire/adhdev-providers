'use strict';

/**
 * Claude Code — listModels
 *
 * Returns available model options for the model selector.
 * Claude Code accepts aliases (default, sonnet, opus, haiku) and some
 * explicit model names.
 */

function splitLines(text) {
    return String(text || '').split(/\r?\n/);
}

function sanitizeLine(text) {
    return String(text || '').replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '').trim();
}

function getTailLines(text, limit = 15) {
    return splitLines(text)
        .map(sanitizeLine)
        .filter(Boolean)
        .slice(-limit);
}

function inferCurrentModel(text) {
    const tailLines = getTailLines(text);
    const explicitDefault = tailLines.some((line) => /^(?:[⎿└╰│>\-\s]+)?Set model to\s+(?:Sonnet|Opus|Haiku)(?:\s+\d+(?:\.\d+)*)?\s+\(default\)$/i.test(line));
    if (explicitDefault) return 'default';

    for (let i = tailLines.length - 1; i >= 0; i -= 1) {
        const line = tailLines[i];
        const setModelMatch = line.match(/^(?:[⎿└╰│>\-\s]+)?Set model to\s+(Sonnet|Opus|Haiku)(?:\s+\d+(?:\.\d+)*)?$/i);
        if (setModelMatch) {
            return setModelMatch[1].toLowerCase();
        }

        const footerMatch = line.match(/^(Sonnet|Opus|Haiku)(?:\s+\d+(?:\.\d+)*)?\b/i);
        if (footerMatch) {
            return footerMatch[1].toLowerCase();
        }
    }
    return '';
}

module.exports = function listModels(input) {
    const screenText = input?.recentBuffer || input?.screenText || input?.buffer || '';
    return {
        options: [
            { value: 'default', label: 'default' },
            { value: 'sonnet', label: 'sonnet' },
            { value: 'opus', label: 'opus' },
            { value: 'haiku', label: 'haiku' },
            { value: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6' },
            { value: 'claude-opus-4', label: 'claude-opus-4' },
            { value: 'claude-haiku-3-5', label: 'claude-haiku-3-5' },
        ],
        currentValue: inferCurrentModel(screenText),
    };
};
