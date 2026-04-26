const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function runScript(filePath, { document: doc, window: win, replacements = {} }) {
  let code = readFileSync(filePath, 'utf8');
  for (const [token, value] of Object.entries(replacements)) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    code = code.replace(new RegExp(escaped, 'g'), value);
  }
  return vm.runInNewContext(code, {
    document: doc,
    window: win,
    console,
    setTimeout,
    clearTimeout,
  }, { filename: filePath });
}

function createSessionControlsDocument({ currentModel = 'Default (recommended)', currentMode = 'Ask before edits', initialCache } = {}) {
  const state = {
    currentModel,
    currentMode,
    commandMenuOpen: false,
    modelPickerOpen: false,
    modePickerOpen: false,
  };

  const defaultView = {
    __adhdevClaudeCodeControls: initialCache ? { ...initialCache } : undefined,
    getComputedStyle() {
      return { display: 'block', visibility: 'visible' };
    },
    PointerEvent: class PointerEvent {
      constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
    },
    MouseEvent: class MouseEvent {
      constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
    },
    InputEvent: class InputEvent {
      constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
    },
    KeyboardEvent: class KeyboardEvent {
      constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
    },
    Event: class Event {
      constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
    },
  };

  const visibleRect = { left: 10, top: 10, width: 120, height: 28 };
  const hiddenRect = { left: 0, top: 0, width: 0, height: 0 };

  const makeLabelNode = (text) => ({
    textContent: text,
    innerText: text,
  });

  const menuButton = {
    className: 'menuButton_gGYT1w',
    textContent: 'Show command menu (/)',
    innerText: 'Show command menu (/)',
    ownerDocument: null,
    closest() { return null; },
    getBoundingClientRect() { return visibleRect; },
    getAttribute(name) { return name === 'aria-label' ? 'Show command menu (/)' : null; },
    click() {
      state.commandMenuOpen = true;
      state.modelPickerOpen = false;
    },
  };

  const textbox = {
    className: 'messageInput_cKsPxg',
    textContent: '',
    innerText: '',
    ownerDocument: null,
    closest() { return null; },
    getBoundingClientRect() { return visibleRect; },
    getAttribute() { return null; },
    focus() {},
    dispatchEvent(event) {
      if (event?.type === 'input' && event?.data === '/') {
        this.textContent = '/';
        this.innerText = '/';
        state.commandMenuOpen = true;
      }
      if (event?.type === 'input' && event?.inputType === 'deleteContentBackward') {
        this.textContent = '';
        this.innerText = '';
      }
      return true;
    },
  };

  const footerButton = {
    className: 'footerButton_gGYT1w footerButtonPrimary_gGYT1w',
    ownerDocument: null,
    closest() { return null; },
    get textContent() { return state.currentMode; },
    get innerText() { return state.currentMode; },
    getBoundingClientRect() { return visibleRect; },
    getAttribute(name) { return name === 'aria-label' ? state.currentMode : null; },
    click() {
      state.modePickerOpen = true;
    },
  };

  const switchModelItem = {
    className: 'commandItem_G_S7FQ',
    textContent: 'Switch model',
    innerText: 'Switch model',
    ownerDocument: null,
    closest() { return null; },
    getBoundingClientRect() { return state.commandMenuOpen ? visibleRect : hiddenRect; },
    getAttribute(name) {
      if (name === 'title') return 'Change the AI model';
      return null;
    },
    querySelector() { return null; },
    click() {
      state.modelPickerOpen = true;
    },
  };

  const modelItems = ['Default (recommended)', 'Opus', 'Haiku'].map((label) => ({
    ownerDocument: null,
    closest() { return null; },
    getBoundingClientRect() { return state.modelPickerOpen ? visibleRect : hiddenRect; },
    get textContent() { return label; },
    get innerText() { return label; },
    get className() {
      return `modelItem_G8AMvA${state.currentModel === label ? ' activeModelItem_G8AMvA' : ''}`;
    },
    getAttribute(name) {
      if (name === 'aria-selected' || name === 'aria-checked') return state.currentModel === label ? 'true' : 'false';
      return null;
    },
    querySelector(selector) {
      if (selector === '.modelLabel_G8AMvA, [class*="modelLabel"]') return makeLabelNode(label);
      return null;
    },
    click() {
      state.currentModel = label;
    },
  }));

  const modeItems = ['Ask before edits', 'Edit automatically'].map((label) => ({
    ownerDocument: null,
    closest() { return null; },
    getBoundingClientRect() { return state.modePickerOpen ? visibleRect : hiddenRect; },
    get textContent() { return label; },
    get innerText() { return label; },
    className: 'menuItemV2_8RAulQ',
    getAttribute() { return null; },
    querySelector(selector) {
      if (selector === '.menuItemLabel_8RAulQ, [class*="menuItemLabel"]') return makeLabelNode(label);
      return null;
    },
    click() {
      state.currentMode = label;
      state.modePickerOpen = false;
    },
  }));

  const body = {
    ownerDocument: null,
    innerText: 'Untitled\nType /model to pick the right tool for the job.\nAsk before edits',
  };

  const doc = {
    body,
    defaultView,
    title: '',
    getElementById() { return null; },
    createRange() {
      return { selectNodeContents() {}, collapse() {} };
    },
    execCommand() { return false; },
    querySelector(selector) {
      if (selector === '[role="textbox"].messageInput_cKsPxg' || selector === '[role="textbox"].messageInput_cKsPxg, [role="textbox"][contenteditable="true"]') return textbox;
      if (selector === 'button.menuButton_gGYT1w') return menuButton;
      if (selector === '.menuPopup_G_S7FQ') return state.commandMenuOpen ? { className: 'menuPopup_G_S7FQ' } : null;
      if (selector === 'button.footerButton_gGYT1w.footerButtonPrimary_gGYT1w') return footerButton;
      if (selector === '.messagesContainer_07S1Yg > .spinnerRow_07S1Yg') return null;
      if (selector === '.message_AV_aEg, .messageContainer_AV_aEg, [class*="emptyState" i] [class*="message" i]') return null;
      if (selector === '.effortLabel_8RAulQ, [class*="effortLabel"]') return null;
      if (selector === 'button.titleText_aqhumA, .titleText_aqhumA, .titleTextInner_aqhumA') return makeLabelNode('Untitled');
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.commandItem_G_S7FQ, [class*="commandItem"]') return state.commandMenuOpen ? [switchModelItem] : [];
      if (selector === '.modelItem_G8AMvA, [class*="modelItem"]') return state.modelPickerOpen ? modelItems : [];
      if (selector === 'button.menuItemV2_8RAulQ, [class*="menuItemV2"]') return state.modePickerOpen ? modeItems : [];
      if (selector === '.messagesContainer_07S1Yg .message_07S1Yg') return [];
      if (selector === 'button.footerButton_gGYT1w, button[class*="footerButton"]') return [footerButton];
      if (selector === 'button, [role="button"], [role="option"], [role="radio"]') return [menuButton, footerButton];
      return [];
    },
    dispatchEvent(event) {
      if (event?.type === 'keydown' && event?.key === 'Escape') {
        state.commandMenuOpen = false;
        state.modelPickerOpen = false;
        state.modePickerOpen = false;
      }
      return true;
    },
  };

  for (const node of [menuButton, textbox, footerButton, switchModelItem, ...modelItems, ...modeItems, body]) {
    node.ownerDocument = doc;
  }

  return { doc, defaultView, state };
}

const base = path.resolve(__dirname, '../extension/claude-code-vscode');

test('claude-code-vscode list_models enumerates child-frame command-menu model options', async () => {
  const { doc, defaultView } = createSessionControlsDocument();
  const raw = await runScript(`${base}/scripts/1.0/list_models.js`, { document: doc, window: defaultView });
  const parsed = JSON.parse(raw);

  assert.deepEqual(parsed.options, [
    { value: 'Default (recommended)', label: 'Default (recommended)' },
    { value: 'Opus', label: 'Opus' },
    { value: 'Haiku', label: 'Haiku' },
  ]);
  assert.equal(parsed.currentValue, 'Default (recommended)');
});

test('claude-code-vscode list_modes enumerates child-frame footer mode options', async () => {
  const { doc, defaultView } = createSessionControlsDocument();
  const raw = await runScript(`${base}/scripts/1.0/list_modes.js`, { document: doc, window: defaultView });
  const parsed = JSON.parse(raw);

  assert.deepEqual(parsed.options, [
    { value: 'Ask before edits', label: 'Ask before edits' },
    { value: 'Edit automatically', label: 'Edit automatically' },
  ]);
  assert.equal(parsed.currentValue, 'Ask before edits');
});

test('claude-code-vscode set_model changes the child-frame model selection', async () => {
  const { doc, defaultView, state } = createSessionControlsDocument();
  const raw = await runScript(`${base}/scripts/1.0/set_model.js`, {
    document: doc,
    window: defaultView,
    replacements: {
      '${ MODEL }': JSON.stringify('Opus'),
    },
  });
  const parsed = JSON.parse(raw);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.model, 'Opus');
  assert.equal(parsed.currentValue, 'Opus');
  assert.equal(state.currentModel, 'Opus');
});

test('claude-code-vscode set_mode changes the child-frame footer mode selection', async () => {
  const { doc, defaultView, state } = createSessionControlsDocument();
  const raw = await runScript(`${base}/scripts/1.0/set_mode.js`, {
    document: doc,
    window: defaultView,
    replacements: {
      '${ MODE }': JSON.stringify('Edit automatically'),
    },
  });
  const parsed = JSON.parse(raw);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.mode, 'Edit automatically');
  assert.equal(parsed.currentValue, 'Edit automatically');
  assert.equal(state.currentMode, 'Edit automatically');
});

