/**
 * Claude Code — parse_approval
 */

'use strict';

const {
    getBufferScreen,
    getTailScreen,
    normalizeLineText,
    takeLast,
} = require('./screen_helpers.js');

function normalize(line) {
    return normalizeLineText(line);
}

function isNoise(line) {
    const trimmed = normalize(line);
    if (!trimmed) return true;
    if (/^[─═╭╮╰╯│┌┐└┘├┤┬┴┼]+$/.test(trimmed)) return true;
    if (/^❯\s*$/.test(trimmed)) return true;
    if (/^[❯›>]\s*\/rate-limit-options\s*$/i.test(trimmed)) return true;
    if (/^➜\s+\S+/.test(trimmed)) return true;
    if (/^⏵⏵\s+accept edits on/i.test(trimmed)) return true;
    if (/^[◐◑◒◓◴◵◶◷◸◹◺◿].*\/effort/i.test(trimmed)) return true;
    if (/^Update available!/i.test(trimmed)) return true;
    if (/^Claude Code v\d/i.test(trimmed)) return true;
    if (/^(Sonnet|Opus|Haiku)\b/i.test(trimmed)) return true;
    if (/^Security guide$/i.test(trimmed)) return true;
    if (/^Enter to confirm/i.test(trimmed)) return true;
    return false;
}

function normalizeButtonLabel(line) {
    const trimmed = normalize(line)
        .replace(/^[❯›>]\s*/, '')
        .replace(/^[([{]?\d+[)\].:\]-]?\s*/, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (/^Yes,\s+and\s+don['’]t\s+ask\s+again\b/i.test(trimmed)) return 'Always allow';
    if (/^Allow\s*once\b/i.test(trimmed)) return 'Yes';
    if (/^Yes\s*[-–—]/i.test(trimmed)) return 'Yes';
    if (/^(?:Deny|Reject)\b/i.test(trimmed)) return 'No';
    return trimmed;
}

function isButtonLine(line) {
    const raw = normalize(line);
    const trimmed = normalizeButtonLabel(line);
    if (/^Esc to cancel/i.test(raw)) return false;
    return /^([❯›>]\s*)?\d+[.)]\s+/.test(raw)
        || /^(Allow\s*once|Always\s*allow.*|Deny|Reject|Yes|No)$/i.test(trimmed);
}

function isStartupTrustCue(line) {
    const trimmed = normalize(line);
    return /Quick safety check/i.test(trimmed)
        || /Is this a project you trust/i.test(trimmed)
        || /Claude Code'?ll be able to read, edit, and execute files here/i.test(trimmed);
}

function isNewMCPServerCue(line) {
    const trimmed = normalize(line);
    return /New MCP server found in this project/i.test(trimmed);
}

function isSettingsWarningCue(line) {
    const trimmed = normalize(line);
    return /^Settings Warning$/i.test(trimmed)
        || /Claude Code settings/i.test(trimmed);
}

function isApprovalQuestionLine(line) {
    const trimmed = normalize(line);
    return /Do you want to (?:proceed|make this edit|run this command|allow)/i.test(trimmed)
        || /^What do you want to do\??$/i.test(trimmed);
}

function isEnterConfirmCancelLine(line) {
    const trimmed = normalize(line);
    return /\bEnter to confirm\b/i.test(trimmed) && /\bEsc to cancel\b/i.test(trimmed);
}

function hasChoiceMenuStructure(lines) {
    const questionIndex = findLastIndex(lines, line => /^What do you want to do\??$/i.test(normalize(line)));
    if (questionIndex < 0) return false;
    const afterQuestion = lines.slice(questionIndex + 1);
    const footerIndex = afterQuestion.findIndex(isEnterConfirmCancelLine);
    if (footerIndex < 0) return false;
    return afterQuestion.slice(0, footerIndex).filter(isButtonLine).length >= 2;
}

function hasSettingsWarningMenu(lines) {
    const warningIndex = findLastIndex(lines, isSettingsWarningCue);
    if (warningIndex < 0) return false;
    const afterWarning = lines.slice(warningIndex + 1);
    const footerIndex = afterWarning.findIndex(isEnterConfirmCancelLine);
    if (footerIndex < 0) return false;
    const buttons = afterWarning.slice(0, footerIndex).filter(isButtonLine).map(normalizeButtonLabel);
    return buttons.some(label => /^Continue$/i.test(label))
        && buttons.some(label => /^Fix with Claude$/i.test(label));
}

function hasApprovalCue(lines) {
    return Array.isArray(lines) && lines.some(line => {
        const normalized = normalize(line);
        return /requires approval|Do you want to proceed|Do you want to make this edit|Do you want to run this command|Do you want to allow|Allow\s*once|Always\s*allow|Settings Warning/i.test(normalized)
            || isButtonLine(normalized);
    });
}

function screenHasReadyPromptWithoutApproval(screen) {
    if (!screen || !Array.isArray(screen.lines) || screen.promptLineIndex < 0) return false;
    const lines = screen.lines.map(line => line.text);
    const afterPrompt = lines.slice(screen.promptLineIndex + 1);
    if (hasApprovalCue(afterPrompt)) return false;
    return true;
}

function stripContextPrefix(line) {
    return normalize(line)
        .replace(/^[⏺•]\s+/, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function findLastIndex(lines, predicate) {
    for (let i = lines.length - 1; i >= 0; i--) {
        if (predicate(lines[i])) return i;
    }
    return -1;
}

function parseApprovalFromLines(lines, sourceText) {
    if (!Array.isArray(lines) || lines.length === 0) return null;

    const recent = takeLast(lines, 30);
    const normalizedRecent = recent.map(normalize).filter(Boolean);
    const lastPromptIndex = normalizedRecent.map((line, idx) => ({ line, idx }))
        .reverse()
        .find(({ line }) => /^❯\s*$/.test(line))?.idx ?? -1;
    if (lastPromptIndex >= 0) {
        const afterPrompt = normalizedRecent.slice(lastPromptIndex + 1);
        const trailingApproval = afterPrompt.some(line => /requires approval|Do you want to proceed|Allow\s*once|Always\s*allow/i.test(line))
            || afterPrompt.some(isButtonLine);
        if (!trailingApproval) return null;
    }

    const questionIndexInRecent = findLastIndex(recent, isApprovalQuestionLine);
    const buttonWindow = questionIndexInRecent >= 0 ? recent.slice(questionIndexInRecent) : recent;

    const buttons = [];
    for (const line of buttonWindow) {
        if (!isButtonLine(line)) continue;
        const label = normalizeButtonLabel(line);
        if (label && !buttons.includes(label)) buttons.push(label);
    }

    const startupTrust = normalizedRecent.some(isStartupTrustCue);
    const choiceMenu = hasChoiceMenuStructure(recent);
    const mcpServer = normalizedRecent.some(isNewMCPServerCue);
    const settingsWarning = hasSettingsWarningMenu(recent);
    const explicitApproval = /This command requires approval|Do you want to (?:proceed|make this edit|run this command|allow)|Allow\s*once|Always\s*allow|\(y\/n\)|\[Y\/n\]/i.test(sourceText || '');
    const hasApproval = startupTrust || choiceMenu || explicitApproval || mcpServer || settingsWarning;
    if (!hasApproval) return null;

    const questionIndex = findLastIndex(lines, isApprovalQuestionLine);
    const approvalIndex = findLastIndex(lines, line => /This command requires approval|requires approval/i.test(normalize(line)));
    const startupIndex = findLastIndex(lines, isStartupTrustCue);
    const mcpServerIndex = findLastIndex(lines, isNewMCPServerCue);
    const settingsWarningIndex = findLastIndex(lines, isSettingsWarningCue);
    const rateLimitIndex = findLastIndex(lines, line => /You've hit your limit/i.test(normalize(line)));
    const actionIndex = findLastIndex(lines, line => /^(?:[⏺•]\s+)?(?:Bash|Write|Edit|MultiEdit|Read|Task|Glob|Grep|LS|NotebookEdit)\(/.test(stripContextPrefix(line)));
    const startIndex = Math.max(0, (
        actionIndex >= 0 ? actionIndex
            : approvalIndex >= 0 ? approvalIndex - 2
                : rateLimitIndex >= 0 && questionIndex >= 0 && questionIndex - rateLimitIndex <= 10 ? rateLimitIndex
                    : questionIndex >= 0 ? questionIndex - 4
                        : startupIndex >= 0 ? startupIndex
                            : mcpServerIndex >= 0 ? mcpServerIndex
                                : settingsWarningIndex >= 0 ? settingsWarningIndex
                                : lines.length - 8
    ));
    const endIndex = questionIndex >= 0 ? questionIndex + 1 : lines.length;

    const context = [];
    for (const line of lines.slice(startIndex, endIndex)) {
        if (isNoise(line) || isButtonLine(line)) continue;
        const trimmed = stripContextPrefix(line);
        if (!trimmed) continue;
        if (context[context.length - 1] !== trimmed) context.push(trimmed);
    }

    return {
        message: context.slice(-3).join(' ').slice(0, 240) || 'Claude Code approval required',
        buttons: buttons.length > 0 ? buttons : ['Allow once', 'Always allow', 'Deny'],
    };
}

module.exports = function parseApproval(input) {
    const primaryScreen = getBufferScreen(input);
    const fallbackScreen = getTailScreen(input);
    const candidates = [];
    const suppressRawFallback = screenHasReadyPromptWithoutApproval(primaryScreen);

    if (primaryScreen.lineCount > 0) {
        candidates.push({
            lines: primaryScreen.lines.map(line => line.text),
            sourceText: String(input?.buffer || input?.screenText || ''),
        });
    }
    if (!suppressRawFallback && fallbackScreen.lineCount > 0) {
        candidates.push({
            lines: fallbackScreen.lines.map(line => line.text),
            sourceText: String(input?.tail || input?.recentBuffer || ''),
        });
    }

    // Adapter getStatus() calls can see a corrupted virtual-screen modal while
    // the raw tail/buffer still contains Claude's complete approval UI. Search
    // those raw streams as secondary candidates so approval/auto-approval does
    // not depend on the renderer snapshot being perfect.
    if (!suppressRawFallback) {
        for (const key of ['tail', 'buffer', 'screenText', 'rawBuffer']) {
            const text = typeof input?.[key] === 'string' ? input[key] : '';
            if (text) candidates.push({ lines: text.split(/\r?\n/), sourceText: text });
        }
    }

    const seen = new Set();
    let best = null;
    for (const candidate of candidates) {
        const signature = takeLast(candidate.lines, 30).map(line => String(line || '')).join('\n');
        if (!signature || seen.has(signature)) continue;
        seen.add(signature);
        const parsed = parseApprovalFromLines(candidate.lines, candidate.sourceText);
        if (!parsed) continue;
        if (!best || parsed.buttons.length > best.buttons.length) best = parsed;
    }

    return best;
};
