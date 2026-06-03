/**
 * Claude Code — detect_status (v1, extended-tier override)
 *
 * After the v1 migration, all line-shape recognition (spinner, modal,
 * settled-prompt, footer chrome, dispatch order) is expressed in the manifest
 * `tui` block and synthesised by the daemon's declarative builder.
 *
 * This override remains for ONE reason only: the stateful generating-hold
 * (GENERATING_HOLD_MS = 3000 + IDLE_CONFIRMATION_FRAMES = 3) cannot be
 * expressed by a pure (input) → verdict primitive. Claude redraws the screen
 * without a spinner for 1-2 frames between tool steps; without a hold,
 * detect_status snaps to 'idle' during those frames and the daemon
 * incorrectly believes the turn finished.
 *
 * Strategy: delegate the raw verdict to the daemon-built declarative function
 * (passed in as `sdk.declarativeDetectStatus(input)`), then post-process it
 * with the hold. Everything that used to live here — spinner regexes, idle
 * prompt regexes, shell chrome lists, dispatch order — is now in
 * provider.json.
 */

'use strict';

const GENERATING_HOLD_MS = 3000;
const IDLE_CONFIRMATION_FRAMES = 3;

module.exports = function detectStatus(stateOrInput, input, sdk) {
    const effectiveInput = input !== undefined ? input : stateOrInput;
    const effectiveState = input !== undefined ? stateOrInput : null;
    const declarative = sdk && sdk.declarativeDetectStatus;
    if (typeof declarative !== 'function') {
        // Defensive: if the daemon did not inject the declarative verdict,
        // fail closed to 'idle' rather than guess.
        return 'idle';
    }
    const rawStatus = declarative(effectiveInput) || 'idle';
    const now = Date.now();

    if (effectiveState && rawStatus === 'generating') {
        effectiveState.lastGeneratingAt = now;
        effectiveState.consecutiveIdleFrames = 0;
    }

    if (effectiveState && rawStatus === 'idle' && effectiveState.lastGeneratingAt > 0) {
        const msSinceGenerating = now - effectiveState.lastGeneratingAt;
        if (msSinceGenerating < GENERATING_HOLD_MS) {
            const prior = Number.isFinite(effectiveState.consecutiveIdleFrames)
                ? effectiveState.consecutiveIdleFrames
                : 0;
            effectiveState.consecutiveIdleFrames = prior + 1;
            // Without a strong idle signal (settled prompt + shell chrome both
            // visible in the tail), keep reporting generating until the frame
            // counter clears.
            const tailHasSettled = sdk.tailHasPrimitive
                && sdk.tailHasPrimitive(effectiveInput, 'adhdev:tui/settled-prompt@1');
            const tailHasChrome = sdk.tailHasPrimitive
                && sdk.tailHasPrimitive(effectiveInput, 'adhdev:tui/footer-chrome@1');
            const hasStrongIdle = tailHasSettled && tailHasChrome;
            const sustainedIdle = effectiveState.consecutiveIdleFrames >= IDLE_CONFIRMATION_FRAMES;
            if (!hasStrongIdle && !sustainedIdle) {
                return 'generating';
            }
        }
        if (msSinceGenerating >= GENERATING_HOLD_MS) {
            effectiveState.consecutiveIdleFrames = 0;
        }
    }

    return rawStatus;
};
