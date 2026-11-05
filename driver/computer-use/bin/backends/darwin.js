'use strict';
// macOS backend: screencapture + sips for pixels, osascript (JXA, CoreGraphics bridge) for input.
// The JXA source is a fixed constant. All values reach it as one JSON string in argv
// (`osascript -l JavaScript -e <source> -- <json>`), so user text can never become code.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DriverError, runProcess } = require('../run.js');
const { parseKey, checkModifiers, splitTypedText, pngSize, parseLastJson } = require('./common.js');

// ANSI virtual key codes (kVK_*).
const KEY_CODES = {
  a: 0, s: 1, d: 2, f: 3, h: 4, g: 5, z: 6, x: 7, c: 8, v: 9, b: 11, q: 12, w: 13, e: 14, r: 15, y: 16, t: 17,
  1: 18, 2: 19, 3: 20, 4: 21, 6: 22, 5: 23, '=': 24, 9: 25, 7: 26, '-': 27, 8: 28, 0: 29, ']': 30, o: 31, u: 32,
  '[': 33, i: 34, p: 35, l: 37, j: 38, "'": 39, k: 40, ';': 41, '\\': 42, ',': 43, '/': 44, n: 45, m: 46, '.': 47, '`': 50,
};
const NAMED_CODES = {
  enter: 36, tab: 48, space: 49, backspace: 51, escape: 53, delete: 117, home: 115, end: 119, pageup: 116, pagedown: 121,
  left: 123, right: 124, down: 125, up: 126,
  f1: 122, f2: 120, f3: 99, f4: 118, f5: 96, f6: 97, f7: 98, f8: 100, f9: 101, f10: 109, f11: 103, f12: 111,
};
const TEXT_CHUNK_UNITS = 16; // CGEventKeyboardSetUnicodeString accepts at most 20 UTF-16 units per event

/** Resolve a key + modifiers into the step the JXA helper executes. */
function resolveKey(key, modifiers) {
  const mods = checkModifiers(modifiers);
  const parsed = parseKey(key);
  if (parsed.name) return { keyCode: NAMED_CODES[parsed.name], modifiers: mods };
  const code = KEY_CODES[parsed.char.toLowerCase()];
  const upper = parsed.char !== parsed.char.toLowerCase() && parsed.char.toLowerCase() in KEY_CODES;
  if (code !== undefined) return { keyCode: code, modifiers: upper && !mods.includes('shift') ? [...mods, 'shift'] : mods };
  if (mods.length === 0) return { text: parsed.char, modifiers: [] };
  throw new DriverError('invalid_arguments', `key ${parsed.char} cannot be combined with modifiers on macOS`);
}

/** Split text into typing steps: Return/Tab keys for line breaks and tabs, unicode runs for the rest. */
function typeSteps(text) {
  return splitTypedText(text, TEXT_CHUNK_UNITS).map((item) => (item.key ? { keyCode: NAMED_CODES[item.key] } : item));
}

const JXA_SOURCE = String.raw`
ObjC.import('CoreGraphics');
ObjC.import('ApplicationServices');
ObjC.import('Foundation');
ObjC.bindFunction('CGEventKeyboardSetUnicodeString', ['void', ['void *', 'unsigned long', 'void *']]);
ObjC.bindFunction('CGPreflightScreenCaptureAccess', ['bool', []]);

var DRY = false;
var LOG = [];
var MASKS = { cmd: $.kCGEventFlagMaskCommand, ctrl: $.kCGEventFlagMaskControl, alt: $.kCGEventFlagMaskAlternate, shift: $.kCGEventFlagMaskShift };
var BUTTONS = {
  left: { down: $.kCGEventLeftMouseDown, up: $.kCGEventLeftMouseUp, drag: $.kCGEventLeftMouseDragged, id: $.kCGMouseButtonLeft },
  right: { down: $.kCGEventRightMouseDown, up: $.kCGEventRightMouseUp, drag: $.kCGEventRightMouseDragged, id: $.kCGMouseButtonRight },
  middle: { down: $.kCGEventOtherMouseDown, up: $.kCGEventOtherMouseUp, drag: $.kCGEventOtherMouseDragged, id: $.kCGMouseButtonCenter }
};

function pause(seconds) { $.NSThread.sleepForTimeInterval(seconds); }
function flagsOf(mods) { var f = 0; (mods || []).forEach(function (m) { f = f | Number(MASKS[m]); }); return f; }

function post(event, extra) {
  if (DRY) {
    var p = $.CGEventGetLocation(event);
    var entry = { type: Number($.CGEventGetType(event)), x: p.x, y: p.y, flags: Number($.CGEventGetFlags(event)) };
    entry.keyCode = Number($.CGEventGetIntegerValueField(event, $.kCGKeyboardEventKeycode));
    entry.clickState = Number($.CGEventGetIntegerValueField(event, $.kCGMouseEventClickState));
    entry.button = Number($.CGEventGetIntegerValueField(event, $.kCGMouseEventButtonNumber));
    entry.scrollY = Number($.CGEventGetIntegerValueField(event, $.kCGScrollWheelEventDeltaAxis1));
    entry.scrollX = Number($.CGEventGetIntegerValueField(event, $.kCGScrollWheelEventDeltaAxis2));
    if (extra) entry.text = extra;
    LOG.push(entry);
  } else {
    $.CGEventPost($.kCGHIDEventTap, event);
  }
}

function mouse(type, x, y, button, clickState) {
  var e = $.CGEventCreateMouseEvent($(), type, { x: x, y: y }, button);
  if (clickState) $.CGEventSetIntegerValueField(e, $.kCGMouseEventClickState, clickState);
  post(e);
}

function keyEvents(step) {
  var flags = flagsOf(step.modifiers);
  [true, false].forEach(function (down) {
    var e = $.CGEventCreateKeyboardEvent($(), step.keyCode === undefined ? 0 : step.keyCode, down);
    $.CGEventSetFlags(e, flags);
    if (step.text !== undefined) {
      var data = $.NSString.alloc.initWithUTF8String(step.text).dataUsingEncoding(0x94000100); // UTF-16LE
      $.CGEventKeyboardSetUnicodeString(e, Number(data.length) / 2, data.bytes);
    }
    post(e, step.text);
  });
}

function info() {
  var b = $.CGDisplayBounds($.CGMainDisplayID());
  var p = $.CGEventGetLocation($.CGEventCreate($()));
  return {
    width: Math.round(b.size.width), height: Math.round(b.size.height), cursor: { x: Math.round(p.x), y: Math.round(p.y) },
    accessibility: Boolean($.AXIsProcessTrusted()), screenCapture: Boolean($.CGPreflightScreenCaptureAccess())
  };
}

function run(argv) {
  var a = JSON.parse(argv[0]);
  DRY = a.dry === true;
  try {
    if (a.op === 'info') return JSON.stringify({ ok: true, info: info() });
    if (!DRY && !$.AXIsProcessTrusted()) return JSON.stringify({ ok: false, code: 'permission_denied', message: 'Accessibility permission is not granted to the process that started the daemon' });
    var btn = BUTTONS[a.button || 'left'];
    if (a.op === 'move') {
      mouse($.kCGEventMouseMoved, a.x, a.y, 0);
    } else if (a.op === 'click') {
      mouse($.kCGEventMouseMoved, a.x, a.y, 0);
      for (var i = 1; i <= a.count; i++) {
        mouse(btn.down, a.x, a.y, btn.id, i); pause(0.02);
        mouse(btn.up, a.x, a.y, btn.id, i); pause(0.04);
      }
    } else if (a.op === 'drag') {
      mouse($.kCGEventMouseMoved, a.fromX, a.fromY, 0); pause(0.05);
      mouse(btn.down, a.fromX, a.fromY, btn.id, 1); pause(0.05);
      var steps = 12;
      for (var s = 1; s <= steps; s++) {
        mouse(btn.drag, Math.round(a.fromX + (a.toX - a.fromX) * s / steps), Math.round(a.fromY + (a.toY - a.fromY) * s / steps), btn.id, 1);
        pause(0.015);
      }
      pause(0.05);
      mouse(btn.up, a.toX, a.toY, btn.id, 1);
    } else if (a.op === 'scroll') {
      mouse($.kCGEventMouseMoved, a.x, a.y, 0); pause(0.03);
      post($.CGEventCreateScrollWheelEvent2($(), $.kCGScrollEventUnitLine, 2, -a.deltaY, -a.deltaX, 0));
    } else if (a.op === 'keys') {
      a.steps.forEach(function (step) { keyEvents(step); pause(0.008); });
    } else {
      return JSON.stringify({ ok: false, code: 'invalid_arguments', message: 'unknown op' });
    }
    return JSON.stringify(DRY ? { ok: true, events: LOG } : { ok: true });
  } catch (e) {
    return JSON.stringify({ ok: false, code: 'command_failed', message: String(e) });
  }
}
`;

/** Pure: the osascript invocation for one helper operation. */
function buildOsascriptCommand(payload) {
  return { file: 'osascript', args: ['-l', 'JavaScript', '-e', JXA_SOURCE, '--', JSON.stringify(payload)] };
}
/** Pure: screencapture of the main display to a PNG file. */
function buildCaptureCommand(file) {
  return { file: 'screencapture', args: ['-x', '-D', '1', '-t', 'png', file] };
}
/** Pure: resample to exactly width x height points (sips takes height first). */
function buildResampleCommand(input, output, width, height) {
  return { file: 'sips', args: ['-z', String(height), String(width), input, '--out', output] };
}

function create(deps = {}) {
  const run = deps.runProcess ?? runProcess;
  const fsx = deps.fs ?? fs;
  const tmpdir = deps.tmpdir ?? os.tmpdir();
  const exec = async (command, timeoutMs = 20_000) => {
    const result = await run(command.file, command.args, { timeoutMs, maxBytes: 1024 * 1024 });
    if (result.timedOut) throw new DriverError('command_failed', `${command.file} timed out`);
    return result;
  };
  const helper = async (payload) => {
    const result = await exec(buildOsascriptCommand(payload));
    const parsed = parseLastJson(result.stdout);
    if (!parsed) throw new DriverError('command_failed', `osascript failed: ${(result.stderr || result.stdout).trim().slice(0, 300)}`);
    if (!parsed.ok) throw new DriverError(parsed.code || 'command_failed', parsed.message || 'osascript failed');
    return parsed;
  };
  const probe = async () => (await helper({ op: 'info' })).info;

  return {
    async status() {
      let info;
      try { info = await probe(); } catch (error) {
        const reason = `cannot query macOS permissions: ${error.message}`;
        return { platform: 'darwin', session: 'unknown', screen: { available: false, reason }, input: { available: false, reason } };
      }
      const hint = (pane) => `System Settings > Privacy & Security > ${pane}: allow the app that started the ADHDev daemon, then restart the daemon`;
      return {
        platform: 'darwin',
        session: 'aqua',
        screen: info.screenCapture ? { available: true } : { available: false, reason: 'Screen Recording permission is not granted', hint: hint('Screen & System Audio Recording') },
        input: info.accessibility ? { available: true } : { available: false, reason: 'Accessibility permission is not granted', hint: hint('Accessibility') },
      };
    },
    async screenInfo() {
      const info = await probe();
      return { width: info.width, height: info.height, cursor: info.cursor };
    },
    async screenshot() {
      const info = await probe();
      if (!info.screenCapture) {
        throw new DriverError('permission_denied', 'Screen Recording permission is not granted to the process that started the daemon (System Settings > Privacy & Security > Screen & System Audio Recording)');
      }
      const dir = fsx.mkdtempSync(path.join(tmpdir, 'adhdev-cu-'));
      try {
        const raw = path.join(dir, 'raw.png');
        const scaled = path.join(dir, 'scaled.png');
        const captured = await exec(buildCaptureCommand(raw), 30_000);
        if (captured.exitCode !== 0 || !fsx.existsSync(raw)) {
          throw new DriverError('command_failed', `screencapture failed: ${captured.stderr.trim().slice(0, 300)}`);
        }
        const rawSize = pngSize(fsx.readFileSync(raw));
        let file = raw;
        if (!rawSize || rawSize.width !== info.width || rawSize.height !== info.height) {
          const resized = await exec(buildResampleCommand(raw, scaled, info.width, info.height), 30_000);
          if (resized.exitCode !== 0 || !fsx.existsSync(scaled)) throw new DriverError('command_failed', `sips failed: ${resized.stderr.trim().slice(0, 300)}`);
          file = scaled;
        }
        const png = fsx.readFileSync(file);
        const size = pngSize(png);
        if (!size) throw new DriverError('command_failed', 'screen capture did not produce a PNG');
        return { png, width: size.width, height: size.height };
      } finally {
        fsx.rmSync(dir, { recursive: true, force: true });
      }
    },
    async mouseMove({ x, y }) { await helper({ op: 'move', x, y }); },
    async click({ x, y, button = 'left', count = 1 }) { await helper({ op: 'click', x, y, button, count }); },
    async drag({ fromX, fromY, toX, toY, button = 'left' }) { await helper({ op: 'drag', fromX, fromY, toX, toY, button }); },
    async scroll({ x, y, deltaX = 0, deltaY = 0 }) { await helper({ op: 'scroll', x, y, deltaX, deltaY }); },
    async typeText({ text }) { await helper({ op: 'keys', steps: typeSteps(text) }); },
    async pressKey({ key, modifiers }) { await helper({ op: 'keys', steps: [resolveKey(key, modifiers)] }); },
  };
}

module.exports = { create, resolveKey, typeSteps, buildOsascriptCommand, buildCaptureCommand, buildResampleCommand, JXA_SOURCE, KEY_CODES, NAMED_CODES };
