/**
 * Codex CLI — detect_status (v1, extended-tier override)
 *
 * Most line-shape recognition (spinner, modal, settled-prompt, squashed
 * approval, dispatch order) is expressed in the manifest `tui` block and
 * synthesised by the daemon's declarative builder.
 *
 * This override remains for ONE reason: the stateful idle-settle hold.
 * Codex shows the idle model footer (`› gpt-4o · /…`) WHILE background tools
 * are still running (`1 background terminal running`). Without a temporal
 * hold, detect_status flips to idle prematurely. The original v0 logic kept
 * an `idleCandidate` + `settledIdleSignature` carried across frames and
 * required ~2s + ≥3 consecutive idle frames before committing to idle.
 *
 * The implementation here delegates the raw verdict to the declarative
 * builder via `sdk.declarativeDetectStatus(input)` and only adds the temporal
 * hold on top. Everything else — including the squashed-modal recognition
 * and the dispatch-order rule — is in provider.json.
 */

'use strict';

const IDLE_HOLD_MS = 2000;
const IDLE_CONFIRMATION_FRAMES = 3;

function tailHasBackgroundTool(input, sdk) {
    if (sdk && typeof sdk.tailHasPrimitive === 'function') {
        // Future hook: when tui/status-downgrade@1 ships, this is the right
        // place to wire it. For now, fall back to a tight inline check.
    }
    const tail = String(input?.tail || input?.screenText || '');
    return /\b\d+ background terminal running\b/i.test(tail)
        || /\bexec_command\b/.test(tail)
        || /\bapply_patch\b/.test(tail);
}

module.exports = function detectStatus(stateOrInput, input, sdk) {
    const effectiveInput = input !== undefined ? input : stateOrInput;
    const effectiveState = input !== undefined ? stateOrInput : null;
    const declarative = sdk && sdk.declarativeDetectStatus;
    if (typeof declarative !== 'function') {
        return 'idle';
    }
    const rawStatus = declarative(effectiveInput) || 'idle';
    const now = Date.now();

    // Treat background-tool presence as a soft generating signal — bridges
    // the gap between "footer shows idle" and "tool is still finishing".
    const backgroundActive = tailHasBackgroundTool(effectiveInput, sdk);

    if (effectiveState && (rawStatus === 'generating' || backgroundActive)) {
        effectiveState.lastGeneratingAt = now;
        effectiveState.consecutiveIdleFrames = 0;
    }

    if (effectiveState && rawStatus === 'idle' && effectiveState.lastGeneratingAt > 0) {
        const msSinceGenerating = now - effectiveState.lastGeneratingAt;
        if (msSinceGenerating < IDLE_HOLD_MS || backgroundActive) {
            const prior = Number.isFinite(effectiveState.consecutiveIdleFrames)
                ? effectiveState.consecutiveIdleFrames
                : 0;
            effectiveState.consecutiveIdleFrames = prior + 1;
            const sustainedIdle = effectiveState.consecutiveIdleFrames >= IDLE_CONFIRMATION_FRAMES
                && !backgroundActive;
            if (!sustainedIdle) {
                return 'generating';
            }
        }
        if (msSinceGenerating >= IDLE_HOLD_MS) {
            effectiveState.consecutiveIdleFrames = 0;
        }
    }

    return rawStatus;
};
