'use strict';
// Linux backend (UNVERIFIED on a real host): X11 only. maim/scrot/import for capture, xdotool for input.
// All values are passed as argv entries (never through a shell); text follows `--`.
// Wayland sessions and sessions without DISPLAY report backend_unavailable for screen and input.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DriverError, runProcess } = require('../run.js');
const { parseKey, checkModifiers, pngSize, findOnPath } = require('./common.js');

const XDO_NAMES = {
  enter: 'Return', tab: 'Tab', escape: 'Escape', backspace: 'BackSpace', delete: 'Delete', space: 'space',
  up: 'Up', down: 'Down', left: 'Left', right: 'Right', home: 'Home', end: 'End', pageup: 'Prior', pagedown: 'Next',
  ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`f${i + 1}`, `F${i + 1}`])),
};
const XDO_PUNCT = { ';': 'semicolon', '=': 'equal', ',': 'comma', '-': 'minus', '.': 'period', '/': 'slash', '`': 'grave', '[': 'bracketleft', '\\': 'backslash', ']': 'bracketright', "'": 'apostrophe' };
const XDO_MODIFIERS = { cmd: 'super', ctrl: 'ctrl', alt: 'alt', shift: 'shift' };
const BUTTON_NUMBER = { left: '1', middle: '2', right: '3' };
const UI_TREE_UNAVAILABLE = { available: false, reason: 'AT-SPI support is not included in the Linux backend', hint: 'Use screenshot and the screenshot coordinates instead' };
const CAPTURE_TOOLS = ['maim', 'scrot', 'import'];

/** The session kind from the environment: x11, wayland, or headless (no DISPLAY). */
function sessionKind(env) {
  if (String(env.XDG_SESSION_TYPE ?? '').toLowerCase() === 'wayland') return 'wayland';
  if (!env.DISPLAY) return env.WAYLAND_DISPLAY ? 'wayland' : 'headless';
  return 'x11';
}

/** Pure xdotool argv builders. */
const xdo = {
  move: ({ x, y }) => ['mousemove', '--sync', String(x), String(y)],
  click: ({ x, y, button = 'left', count = 1 }) => ['mousemove', '--sync', String(x), String(y), 'click', '--repeat', String(count), '--delay', '60', BUTTON_NUMBER[button]],
  drag: ({ fromX, fromY, toX, toY, button = 'left' }) => {
    const b = BUTTON_NUMBER[button];
    const args = ['mousemove', '--sync', String(fromX), String(fromY), 'mousedown', b];
    for (let s = 1; s <= 8; s += 1) {
      args.push('sleep', '0.02', 'mousemove', String(Math.round(fromX + (toX - fromX) * s / 8)), String(Math.round(fromY + (toY - fromY) * s / 8)));
    }
    args.push('mouseup', b);
    return args;
  },
  // deltaY > 0 scrolls down (button 5), < 0 up (4); deltaX > 0 right (7), < 0 left (6).
  scroll: ({ x, y, deltaX = 0, deltaY = 0 }) => {
    const args = ['mousemove', '--sync', String(x), String(y)];
    if (deltaY) args.push('click', '--repeat', String(Math.abs(deltaY)), deltaY > 0 ? '5' : '4');
    if (deltaX) args.push('click', '--repeat', String(Math.abs(deltaX)), deltaX > 0 ? '7' : '6');
    return args;
  },
  type: ({ text }) => ['type', '--clearmodifiers', '--delay', '8', '--', text],
};

/** Resolve a key press into either an xdotool `key` argv or a `type` argv (plain punctuation or non-ASCII). */
function keyArgs({ key, modifiers }) {
  const mods = checkModifiers(modifiers);
  const parsed = parseKey(key);
  let name;
  const extra = [];
  if (parsed.name) name = XDO_NAMES[parsed.name];
  else {
    const c = parsed.char;
    const lower = c.toLowerCase();
    if (/^[a-z0-9]$/.test(lower)) {
      name = lower;
      if (c !== lower && !mods.includes('shift')) extra.push('shift');
    } else if (c in XDO_PUNCT) name = XDO_PUNCT[c];
    else if (mods.length === 0) return ['type', '--clearmodifiers', '--', c];
    else throw new DriverError('invalid_arguments', `key ${c} cannot be combined with modifiers on Linux`);
  }
  const combo = [...mods.map((m) => XDO_MODIFIERS[m]), ...extra, name].join('+');
  return ['key', '--clearmodifiers', '--', combo];
}

function captureCommand(tool, file) {
  if (tool === 'maim') return { file: 'maim', args: ['--format', 'png', file] };
  if (tool === 'scrot') return { file: 'scrot', args: ['--overwrite', file] };
  if (tool === 'import') return { file: 'import', args: ['-window', 'root', file] };
  throw new DriverError('backend_unavailable', 'no screenshot tool');
}

function create(deps = {}) {
  const run = deps.runProcess ?? runProcess;
  const env = deps.env ?? process.env;
  const exists = deps.exists ?? fs.existsSync;
  const fsx = deps.fs ?? fs;
  const tmpdir = deps.tmpdir ?? os.tmpdir();
  const platform = deps.platform ?? 'linux';
  const where = (name) => findOnPath(name, env, platform, exists);
  const session = sessionKind(env);

  const requireX11 = () => {
    if (session === 'wayland') throw new DriverError('backend_unavailable', 'Wayland sessions are not supported; log in with an X11 session');
    if (session === 'headless') throw new DriverError('backend_unavailable', 'no graphical session (DISPLAY is not set)');
  };
  const requireXdotool = () => {
    requireX11();
    if (!where('xdotool')) throw new DriverError('backend_unavailable', 'xdotool is not installed (for example: sudo apt install xdotool)');
  };
  const exec = async (file, args, timeoutMs = 20_000) => {
    const result = await run(file, args, { env, timeoutMs, maxBytes: 1024 * 1024 });
    if (result.timedOut) throw new DriverError('command_failed', `${file} timed out`);
    if (result.exitCode !== 0) throw new DriverError('command_failed', `${file} failed: ${(result.stderr || result.stdout).trim().slice(0, 300)}`);
    return result;
  };
  const xdotool = async (args) => { requireXdotool(); await exec('xdotool', args); };

  return {
    async status() {
      if (session !== 'x11') {
        const reason = session === 'wayland' ? 'Wayland sessions are not supported' : 'no graphical session (DISPLAY is not set)';
        const hint = session === 'wayland' ? 'Log in with an X11 session to use screen capture and input' : 'Start the daemon inside a graphical X11 session';
        return { platform: 'linux', session, screen: { available: false, reason, hint }, input: { available: false, reason, hint }, uiTree: { ...UI_TREE_UNAVAILABLE } };
      }
      const tool = CAPTURE_TOOLS.find((t) => where(t));
      return {
        platform: 'linux',
        session,
        screen: tool ? { available: true } : { available: false, reason: 'no screenshot tool found (maim, scrot or import)', hint: 'Install one, for example: sudo apt install maim' },
        input: where('xdotool') ? { available: true } : { available: false, reason: 'xdotool is not installed', hint: 'Install it, for example: sudo apt install xdotool' },
        uiTree: { ...UI_TREE_UNAVAILABLE },
      };
    },
    async screenInfo() {
      requireXdotool();
      const [geometry, location] = await Promise.all([exec('xdotool', ['getdisplaygeometry']), exec('xdotool', ['getmouselocation', '--shell'])]);
      const size = geometry.stdout.trim().split(/\s+/).map(Number);
      const x = /X=(-?\d+)/.exec(location.stdout);
      const y = /Y=(-?\d+)/.exec(location.stdout);
      if (size.length < 2 || !size.every(Number.isFinite) || !x || !y) throw new DriverError('command_failed', 'unexpected xdotool output');
      return { width: size[0], height: size[1], cursor: { x: Number(x[1]), y: Number(y[1]) } };
    },
    async screenshot() {
      requireX11();
      const tool = CAPTURE_TOOLS.find((t) => where(t));
      if (!tool) throw new DriverError('backend_unavailable', 'no screenshot tool found (install maim, scrot or imagemagick)');
      const dir = fsx.mkdtempSync(path.join(tmpdir, 'adhdev-cu-'));
      try {
        const file = path.join(dir, 'shot.png');
        const command = captureCommand(tool, file);
        await exec(command.file, command.args, 30_000);
        const png = fsx.readFileSync(file);
        const size = pngSize(png);
        if (!size) throw new DriverError('command_failed', 'screen capture did not produce a PNG');
        return { png, width: size.width, height: size.height };
      } finally {
        fsx.rmSync(dir, { recursive: true, force: true });
      }
    },
    async uiTree() { throw new DriverError('backend_unavailable', `${UI_TREE_UNAVAILABLE.reason}; use screenshot instead`); },
    mouseMove: (a) => xdotool(xdo.move(a)),
    click: (a) => xdotool(xdo.click(a)),
    drag: (a) => xdotool(xdo.drag(a)),
    scroll: (a) => xdotool(xdo.scroll(a)),
    typeText: (a) => xdotool(xdo.type(a)),
    pressKey: (a) => xdotool(keyArgs(a)),
  };
}

module.exports = { create, xdo, keyArgs, captureCommand, sessionKind };
