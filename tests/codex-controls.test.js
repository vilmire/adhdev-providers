const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CODEX_EXTENSION_SCRIPT_DIR = path.join(__dirname, '..', 'extension', 'codex', 'scripts', '1.0');
const codexExtensionScript = (name) => path.join(CODEX_EXTENSION_SCRIPT_DIR, name);

function createElement({
  tagName = 'DIV',
  text = '',
  attrs = {},
  visible = true,
  className = '',
  queryMap = {},
  onClick = null,
} = {}) {
  return {
    tagName,
    textContent: text,
    innerText: text,
    className,
    ownerDocument: null,
    _clicked: false,
    getAttribute(name) {
      return attrs[name] ?? null;
    },
    setAttribute(name, value) {
      attrs[name] = value;
    },
    getBoundingClientRect() {
      return visible
        ? { left: 10, top: 10, width: 120, height: 28 }
        : { left: 0, top: 0, width: 0, height: 0 };
    },
    get offsetWidth() {
      return visible ? 120 : 0;
    },
    get offsetHeight() {
      return visible ? 28 : 0;
    },
    closest() {
      return null;
    },
    querySelector(selector) {
      const value = queryMap[selector];
      if (Array.isArray(value)) return value[0] || null;
      return value || null;
    },
    querySelectorAll(selector) {
      const value = queryMap[selector];
      if (Array.isArray(value)) return value;
      return value ? [value] : [];
    },
    dispatchEvent(event) {
      if (event?.type === 'click') {
        this._clicked = true;
        if (typeof onClick === 'function') onClick(event);
      }
      return true;
    },
    click() {
      this._clicked = true;
      if (typeof onClick === 'function') onClick({ type: 'click' });
    },
  };
}

function createWindow() {
  return {
    getComputedStyle(el) {
      const visible = !!el && el.offsetWidth > 0 && el.offsetHeight > 0;
      return {
        display: visible ? 'block' : 'none',
        visibility: visible ? 'visible' : 'hidden',
        pointerEvents: visible ? 'auto' : 'none',
      };
    },
    PointerEvent: class PointerEvent {
      constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
    },
    MouseEvent: class MouseEvent {
      constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
    },
    KeyboardEvent: class KeyboardEvent {
      constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
    },
    Event: class Event {
      constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
    },
  };
}

async function runScript(filePath, { document, window, args = undefined }) {
  const rawCode = readFileSync(filePath, 'utf8');
  const needsInvocation = /\/set_(model|mode)\.js$/.test(filePath);
  const code = needsInvocation
    ? `(${rawCode})(${JSON.stringify(args ?? {})})`
    : rawCode;
  const context = {
    document,
    window,
    console,
    setTimeout,
    clearTimeout,
    PointerEvent: window.PointerEvent,
    MouseEvent: window.MouseEvent,
    KeyboardEvent: window.KeyboardEvent,
    Event: window.Event,
  };
  return await vm.runInNewContext(code, context, { filename: filePath });
}

function createHostedCodexModelDocument() {
  const defaultView = createWindow();
  const modelOptions = [
    createElement({ tagName: 'DIV', text: 'GPT-5.4', attrs: { role: 'option', 'aria-checked': 'true' } }),
    createElement({ tagName: 'DIV', text: 'o3', attrs: { role: 'option' } }),
  ];
  let listboxVisible = false;
  const listbox = createElement({
    tagName: 'DIV',
    attrs: { role: 'listbox', 'data-state': 'open' },
    visible: false,
    queryMap: {
      '[role="menuitem"], [role="menuitemradio"], div[class*="cursor-interaction"]': modelOptions,
      '[role="option"]': modelOptions,
      '[role="menuitem"], [role="menuitemradio"], [role="option"], div[class*="cursor-interaction"]': modelOptions,
    },
  });
  Object.defineProperty(listbox, 'offsetWidth', { get: () => (listboxVisible ? 160 : 0) });
  Object.defineProperty(listbox, 'offsetHeight', { get: () => (listboxVisible ? 120 : 0) });
  listbox.getBoundingClientRect = () => (listboxVisible
    ? { left: 10, top: 10, width: 160, height: 120 }
    : { left: 0, top: 0, width: 0, height: 0 });

  const modelButton = createElement({
    tagName: 'BUTTON',
    text: 'GPT-5.4',
    attrs: { 'aria-haspopup': 'menu' },
    onClick: () => { listboxVisible = true; },
  });

  const body = createElement({ tagName: 'BODY', queryMap: { 'button': [modelButton] } });
  const document = {
    body,
    defaultView,
    getElementById(id) {
      return id === 'root' ? null : null;
    },
    querySelector(selector) {
      if (selector === '[role="menu"][data-state="open"]') return null;
      if (selector === '[role="listbox"][data-state="open"]') return listboxVisible ? listbox : null;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'button' || selector === 'button[aria-haspopup="menu"]') return [modelButton];
      if (selector === '[role="menu"]') return [];
      if (selector === '[role="listbox"]' || selector === '[role="menu"][data-state="open"], [role="listbox"][data-state="open"]') {
        return listboxVisible ? [listbox] : [];
      }
      if (selector === 'iframe') return [];
      return [];
    },
    dispatchEvent(event) {
      if (event?.type === 'keydown' && event.key === 'Escape') listboxVisible = false;
      return true;
    },
  };
  body.ownerDocument = document;
  modelButton.ownerDocument = document;
  listbox.ownerDocument = document;
  modelOptions.forEach(option => { option.ownerDocument = document; });
  return { document, defaultView, modelButton, modelOptions };
}

function createHostedCodexModeDocument() {
  const defaultView = createWindow();
  const modeOptions = [
    createElement({ tagName: 'DIV', text: 'Ask', attrs: { role: 'option', 'aria-checked': 'true' } }),
    createElement({ tagName: 'DIV', text: 'Edit', attrs: { role: 'option' } }),
  ];
  let listboxVisible = false;
  const listbox = createElement({
    tagName: 'DIV',
    attrs: { role: 'listbox', 'data-state': 'open' },
    visible: false,
    queryMap: {
      '[role="menuitem"], [role="menuitemradio"], [role="option"], div[class*="cursor-interaction"]': modeOptions,
    },
  });
  Object.defineProperty(listbox, 'offsetWidth', { get: () => (listboxVisible ? 160 : 0) });
  Object.defineProperty(listbox, 'offsetHeight', { get: () => (listboxVisible ? 120 : 0) });
  listbox.getBoundingClientRect = () => (listboxVisible
    ? { left: 10, top: 10, width: 160, height: 120 }
    : { left: 0, top: 0, width: 0, height: 0 });

  const modelButton = createElement({
    tagName: 'BUTTON',
    text: 'GPT-5.4',
    attrs: { 'aria-haspopup': 'menu' },
  });
  const modeButton = createElement({
    tagName: 'BUTTON',
    text: 'Ask',
    attrs: { 'aria-haspopup': 'menu' },
    onClick: () => { listboxVisible = true; },
  });

  const composer = createElement({
    tagName: 'DIV',
    queryMap: { 'button[aria-haspopup="menu"]': [modelButton, modeButton] },
  });
  const body = createElement({
    tagName: 'BODY',
    queryMap: { 'button[aria-haspopup="menu"]': [modelButton, modeButton] },
  });
  const document = {
    body,
    defaultView,
    getElementById() {
      return null;
    },
    querySelector(selector) {
      if (selector === '[class*="thread-composer-max-width"]' || selector === '[class*="thread-composer"]' || selector === '[class*="pb-2"]') return composer;
      if (selector === '[role="menu"][data-state="open"]') return null;
      if (selector === '[role="listbox"][data-state="open"]') return listboxVisible ? listbox : null;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'button[aria-haspopup="menu"]') return [modelButton, modeButton];
      if (selector === '[role="menu"], [role="listbox"]' || selector === '[role="menu"][data-state="open"], [role="listbox"][data-state="open"]') {
        return listboxVisible ? [listbox] : [];
      }
      if (selector === '[role="menu"]') return [];
      if (selector === '[role="listbox"]') return listboxVisible ? [listbox] : [];
      if (selector === 'iframe') return [];
      return [];
    },
    dispatchEvent(event) {
      if (event?.type === 'keydown' && event.key === 'Escape') listboxVisible = false;
      return true;
    },
  };
  body.ownerDocument = document;
  composer.ownerDocument = document;
  modelButton.ownerDocument = document;
  modeButton.ownerDocument = document;
  listbox.ownerDocument = document;
  modeOptions.forEach(option => { option.ownerDocument = document; });
  return { document, defaultView, modeButton, modeOptions };
}

test('codex list_models reads listbox-based model menus in hosted webviews', async () => {
  const { document, defaultView } = createHostedCodexModelDocument();
  const raw = await runScript(
    codexExtensionScript('list_models.js'),
    { document, window: defaultView },
  );
  const parsed = JSON.parse(raw);

  assert.equal(parsed.current, 'GPT-5.4');
  assert.deepEqual(parsed.models.map(model => model.name), ['GPT-5.4', 'o3']);
});

test('codex set_model selects listbox-based model menus in hosted webviews', async () => {
  const { document, defaultView, modelOptions } = createHostedCodexModelDocument();
  const raw = await runScript(
    codexExtensionScript('set_model.js'),
    { document, window: defaultView },
  );
  const parsed = JSON.parse(raw);

  assert.equal(parsed.success, true);
  assert.equal(parsed.model, 'o3');
  assert.equal(modelOptions[1]._clicked, true);
});

test('codex list_modes works when hosted controls live in the outer webview document', async () => {
  const { document, defaultView } = createHostedCodexModeDocument();
  const raw = await runScript(
    codexExtensionScript('list_modes.js'),
    { document, window: defaultView },
  );
  const parsed = JSON.parse(raw);

  assert.equal(parsed.current, 'Ask');
  assert.deepEqual(parsed.modes, ['Ask', 'Edit']);
});

test('codex set_mode works when hosted controls live in the outer webview document', async () => {
  const { document, defaultView, modeOptions } = createHostedCodexModeDocument();
  const raw = await runScript(
    codexExtensionScript('set_mode.js'),
    { document, window: defaultView },
  );
  const parsed = JSON.parse(raw);

  assert.equal(parsed.success, true);
  assert.equal(parsed.mode, 'Edit');
  assert.equal(modeOptions[1]._clicked, true);
});

// Regression (2026-11-08): a codex-cli command-approval prompt whose command was long enough to push
// the "Would you like to run the following command?" line above the 32-row viewport stayed undetected
// (the modal section anchors on that line), so the worker sat in an approval nobody could see or answer.
const CODEX_CLI_SPEC = JSON.parse(readFileSync(path.join(__dirname, '..', 'cli', 'codex-cli', 'specs', '4.0.json'), 'utf8'));
const SCROLLED_APPROVAL = [
  'he following command?',
  '',
  '  Environment: local',
  '',
  '  Reason: rerun the runtime tests four threads at a time, five times',
  '',
  "  $ python3 -c 'import subprocess;",
  '  results=[subprocess.run(c) for c in commands]',
  '',
  '',
  '› 1. Yes, proceed (y)',
  "  2. Yes, and don't ask again for commands that start with `python3 -c` (p)",
  '  3. No, and tell Codex what to do differently (esc)',
  '',
  '  Press enter to confirm or esc to cancel',
].join('\n');
const CODEX_IDLE = ['› Ask Codex to do anything', '', '  GPT-6.1-Sol medium · ~/Work/project', '  ? for shortcuts'].join('\n');

function screenConds(when, negated = false, out = []) {
  if (!when || typeof when !== 'object') return out;
  if (when.not) return screenConds(when.not, true, out);
  for (const k of ['any', 'all']) if (Array.isArray(when[k])) when[k].forEach((w) => screenConds(w, negated, out));
  if (when.section === 'screen' && typeof when.matches === 'string') out.push({ negated, re: new RegExp(when.matches) });
  return out;
}

test('codex-cli spec: an approval prompt whose question scrolled off still enters approval', () => {
  const enter = CODEX_CLI_SPEC.transitions.find((t) => t.label === '→approval');
  const conds = screenConds(enter.when).filter((c) => !c.negated);
  assert.ok(conds.length >= 1, 'a screen-level approval matcher exists');
  assert.ok(conds.some((c) => c.re.test(SCROLLED_APPROVAL)));
  assert.equal(conds.some((c) => c.re.test(CODEX_IDLE)), false);
});

test('codex-cli spec: approval does not exit while the scrolled prompt is still on screen', () => {
  for (const label of ['approval→busy', 'approval→idle']) {
    const t = CODEX_CLI_SPEC.transitions.find((x) => x.label === label);
    const guards = screenConds(t.when).filter((c) => c.negated);
    assert.ok(guards.some((c) => c.re.test(SCROLLED_APPROVAL)), `${label} keeps approval while the prompt is visible`);
  }
});
