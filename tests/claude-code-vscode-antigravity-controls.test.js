const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

function createElement({
  tagName = 'DIV',
  text = '',
  className = '',
  attrs = {},
  visible = true,
  ownerDocument = null,
  children = [],
  queryMap = {},
  queryAllMap = {},
  closestMap = {},
  onClick = null,
} = {}) {
  const element = {
    tagName,
    textContent: text,
    innerText: text,
    className,
    ownerDocument,
    parentElement: null,
    disabled: false,
    _clicked: false,
    _children: children,
    getAttribute(name) {
      return attrs[name] ?? null;
    },
    setAttribute(name, value) {
      attrs[name] = value;
    },
    querySelector(selector) {
      if (selector in queryMap) return queryMap[selector];
      if (selector === '.text-xs.font-medium') {
        return this._children.find((child) => String(child.className || '').includes('text-xs font-medium')) || null;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector in queryAllMap) return queryAllMap[selector];
      if (selector === '.font-medium') {
        return this._children.filter((child) => String(child.className || '').includes('font-medium'));
      }
      return [];
    },
    getBoundingClientRect() {
      return visible ? { left: 10, top: 10, width: 120, height: 24 } : { left: 0, top: 0, width: 0, height: 0 };
    },
    get offsetWidth() {
      return visible ? 120 : 0;
    },
    get offsetHeight() {
      return visible ? 24 : 0;
    },
    closest(selector) {
      if (selector in closestMap) return closestMap[selector];
      return null;
    },
    dispatchEvent() {
      return true;
    },
    click() {
      this._clicked = true;
      if (typeof onClick === 'function') onClick();
    },
    focus() {},
  };
  for (const child of children) {
    child.parentElement = element;
    child.ownerDocument = ownerDocument;
  }
  return element;
}

function createCurrentShellDocument() {
  const defaultView = {
    getComputedStyle() {
      return { display: 'block', visibility: 'visible' };
    },
    KeyboardEvent: class KeyboardEvent {
      constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
    },
    MouseEvent: class MouseEvent {
      constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
    },
    Event: class Event {
      constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
    },
  };

  const planningLabel = createElement({ tagName: 'DIV', text: 'Planning', className: 'font-medium' });
  const fastLabel = createElement({ tagName: 'DIV', text: 'Fast', className: 'font-medium' });
  const modeHeader = createElement({ tagName: 'DIV', text: 'Conversation mode', className: 'text-xs px-2 pb-1 opacity-80' });
  const modePanel = createElement({
    tagName: 'DIV',
    text: 'Conversation mode Planning Fast',
    className: 'flex flex-col items-start rounded-bg py-1 max-w-xs',
    children: [planningLabel, fastLabel],
  });
  modeHeader.parentElement = modePanel;

  const sonnetLabel = createElement({ tagName: 'SPAN', text: 'Claude Sonnet 4.6 (Thinking)', className: 'text-xs font-medium' });
  const sonnetItem = createElement({
    tagName: 'BUTTON',
    text: 'Claude Sonnet 4.6 (Thinking)',
    className: 'px-2 py-1 flex items-center justify-between cursor-pointer hover:bg-gray-500/10',
    children: [sonnetLabel],
  });
  const opusLabel = createElement({ tagName: 'SPAN', text: 'Claude Opus 4.6 (Thinking)', className: 'text-xs font-medium' });
  const opusItem = createElement({
    tagName: 'BUTTON',
    text: 'Claude Opus 4.6 (Thinking)',
    className: 'px-2 py-1 flex items-center justify-between cursor-pointer bg-gray-500/20',
    children: [opusLabel],
  });
  const modelHeader = createElement({ tagName: 'DIV', text: 'Model', className: 'text-xs px-2 pb-1 opacity-80' });

  const modeButton = createElement({
    tagName: 'BUTTON',
    text: 'Fast',
    className: 'py-1 pl-1 pr-2 flex items-center gap-0.5 rounded-md cursor-pointer opacity-70',
    attrs: { 'aria-label': 'Select conversation mode, current: Fast' },
  });
  const modelButton = createElement({
    tagName: 'BUTTON',
    text: 'Claude Opus 4.6 (Thinking)',
    className: 'flex min-w-0 max-w-full cursor-pointer items-center h-full gap-0.5 rounded-md py-1 pl-[0.125rem] pr-2 text-xs opacity-70',
    attrs: { 'aria-label': 'Select model, current: Claude Opus 4.6 (Thinking)' },
  });

  const doc = {
    body: createElement({ tagName: 'BODY', text: '' }),
    defaultView,
    title: '',
    getElementById() {
      return null;
    },
    dispatchEvent() {
      return true;
    },
    querySelector(selector) {
      if (selector === '.flex.min-w-0.max-w-full.cursor-pointer.items-center') return modelButton;
      if (selector === 'button[aria-label^="Select conversation mode"]') return modeButton;
      if (selector === 'button[aria-label^="Select model"]') return modelButton;
      if (selector === 'button.footerButton_gGYT1w.footerButtonPrimary_gGYT1w') return null;
      if (selector === '.messagesContainer_07S1Yg > .spinnerRow_07S1Yg') return null;
      if (selector === '.message_AV_aEg, .messageContainer_AV_aEg, [class*="emptyState" i] [class*="message" i]') return null;
      if (selector === '.effortLabel_8RAulQ, [class*="effortLabel"]') return null;
      if (selector === '[role="textbox"].messageInput_cKsPxg') return null;
      if (selector === '[role="textbox"].messageInput_cKsPxg, [role="textbox"][contenteditable="true"]') return null;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'button') return [modeButton, modelButton];
      if (selector === 'button, span') return [modeButton, modelButton];
      if (selector === 'div, button') return [modeButton, modelButton, sonnetItem, opusItem];
      if (selector === '.text-xs.px-2.pb-1.opacity-80') return [modeHeader, modelHeader];
      if (selector === '.px-2.py-1.flex.items-center.justify-between.cursor-pointer') return [sonnetItem, opusItem];
      if (selector === '.messagesContainer_07S1Yg .message_07S1Yg') return [];
      if (selector === 'button.footerButton_gGYT1w, button[class*="footerButton"]') return [];
      if (selector === 'button, [role="button"], [role="option"], [role="radio"]') return [];
      return [];
    },
  };

  for (const el of [planningLabel, fastLabel, modeHeader, modePanel, sonnetLabel, sonnetItem, opusLabel, opusItem, modelHeader, modeButton, modelButton, doc.body]) {
    el.ownerDocument = doc;
  }

  return { doc, defaultView, planningLabel, sonnetItem };
}

function createUsageSessionDocument() {
  const defaultView = {
    getComputedStyle() {
      return { display: 'block', visibility: 'visible' };
    },
    KeyboardEvent: class KeyboardEvent {
      constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
    },
  };

  const closeButton = createElement({ tagName: 'BUTTON', text: '', attrs: { 'aria-label': 'Close' } });
  const planLabel = createElement({ tagName: 'DIV', text: 'Plan', className: 'accountLabel_JuUW3A' });
  const planValue = createElement({ tagName: 'DIV', text: 'Claude Pro', className: 'accountValue_JuUW3A' });
  const planRow = createElement({
    tagName: 'DIV',
    className: 'accountRow_JuUW3A',
    queryMap: {
      '.accountLabel_JuUW3A': planLabel,
      '.accountValue_JuUW3A': planValue,
    },
  });

  const sessionLabel = createElement({ tagName: 'DIV', text: 'Session (5hr)', className: 'usageLabel_JuUW3A' });
  const sessionPercent = createElement({ tagName: 'DIV', text: '4%', className: 'usagePercent_JuUW3A' });
  const sessionReset = createElement({ tagName: 'DIV', text: 'Resets in 1h', className: 'resetText_JuUW3A' });
  const sessionBar = createElement({
    tagName: 'DIV',
    className: 'usageBarContainer_JuUW3A',
    queryMap: {
      '.usageLabel_JuUW3A': sessionLabel,
      '.usagePercent_JuUW3A': sessionPercent,
      '.resetText_JuUW3A': sessionReset,
    },
  });

  const weeklyLabel = createElement({ tagName: 'DIV', text: 'Weekly (7 day)', className: 'usageLabel_JuUW3A' });
  const weeklyPercent = createElement({ tagName: 'DIV', text: '3%', className: 'usagePercent_JuUW3A' });
  const weeklyReset = createElement({ tagName: 'DIV', text: 'Resets in 6d', className: 'resetText_JuUW3A' });
  const weeklyBar = createElement({
    tagName: 'DIV',
    className: 'usageBarContainer_JuUW3A',
    queryMap: {
      '.usageLabel_JuUW3A': weeklyLabel,
      '.usagePercent_JuUW3A': weeklyPercent,
      '.resetText_JuUW3A': weeklyReset,
    },
  });

  const dialog = createElement({
    tagName: 'DIV',
    className: 'dialog_f3sAzg',
    text: 'Account usage',
    queryMap: {
      '.dialog_f3sAzg button[aria-label="Close"], .dialog_f3sAzg button[aria-label*="lose"]': closeButton,
    },
    queryAllMap: {
      '.accountRow_JuUW3A': [planRow],
      '.usageBarContainer_JuUW3A': [sessionBar, weeklyBar],
    },
  });

  const usageLabel = createElement({ tagName: 'DIV', text: 'Account usage', className: 'commandLabel_G_S7FQ' });
  const usageItem = createElement({ tagName: 'DIV', className: 'commandItem_G_S7FQ', children: [usageLabel] });
  usageLabel.closest = (selector) => (selector === '.commandItem_G_S7FQ' ? usageItem : null);

  const menuPopup = createElement({ tagName: 'DIV', className: 'menuPopup_G_S7FQ', text: 'Account usage' });
  const menuButton = createElement({ tagName: 'BUTTON', className: 'menuButton_gGYT1w' });

  const doc = {
    body: createElement({ tagName: 'BODY', text: '' }),
    defaultView,
    title: '',
    _menuOpen: true,
    _dialogOpen: true,
    getElementById() {
      return null;
    },
    dispatchEvent() {
      return true;
    },
    querySelector(selector) {
      if (selector === 'button[aria-label^="Select conversation mode"]') return null;
      if (selector === 'button[aria-label^="Select model"]') return null;
      if (selector === '.antigravity-agent-side-panel') return null;
      if (selector === 'button.menuButton_gGYT1w') return menuButton;
      if (selector === '.menuPopup_G_S7FQ') return this._menuOpen ? menuPopup : null;
      if (selector === '.dialog_f3sAzg') return this._dialogOpen ? dialog : null;
      if (selector === '.dialog_f3sAzg button[aria-label="Close"], .dialog_f3sAzg button[aria-label*="lose"]') return closeButton;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.commandItem_G_S7FQ .commandLabel_G_S7FQ') return this._menuOpen ? [usageLabel] : [];
      if (selector === '.accountRow_JuUW3A') return this._dialogOpen ? [planRow] : [];
      if (selector === '.usageBarContainer_JuUW3A') return this._dialogOpen ? [sessionBar, weeklyBar] : [];
      return [];
    },
  };

  menuButton.ownerDocument = doc;
  menuButton.click = () => { doc._menuOpen = !doc._menuOpen; };
  usageItem.ownerDocument = doc;
  usageItem.click = () => { doc._dialogOpen = true; };
  closeButton.ownerDocument = doc;
  closeButton.click = () => { doc._dialogOpen = false; };

  for (const el of [doc.body, closeButton, planLabel, planValue, planRow, sessionLabel, sessionPercent, sessionReset, sessionBar, weeklyLabel, weeklyPercent, weeklyReset, weeklyBar, dialog, usageLabel, usageItem, menuPopup]) {
    el.ownerDocument = doc;
  }

  return { doc, defaultView };
}

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

const base = '/Users/vilmire/Work/adhdev_public/adhdev-providers/extension/claude-code-vscode';

test('claude-code-vscode list_models reads current Antigravity-hosted model inventory', () => {
  const { doc, defaultView } = createCurrentShellDocument();
  const raw = runScript(`${base}/scripts/1.0/list_models.js`, { document: doc, window: defaultView });
  const parsed = JSON.parse(raw);

  assert.deepEqual(parsed.options, [
    { value: 'Claude Sonnet 4.6 (Thinking)', label: 'Claude Sonnet 4.6 (Thinking)' },
    { value: 'Claude Opus 4.6 (Thinking)', label: 'Claude Opus 4.6 (Thinking)' },
  ]);
  assert.equal(parsed.currentValue, 'Claude Opus 4.6 (Thinking)');
});

test('claude-code-vscode list_modes reads current Antigravity conversation modes', () => {
  const { doc, defaultView } = createCurrentShellDocument();
  const raw = runScript(`${base}/scripts/1.0/list_modes.js`, { document: doc, window: defaultView });
  const parsed = JSON.parse(raw);

  assert.deepEqual(parsed.options, [
    { value: 'Planning', label: 'Planning' },
    { value: 'Fast', label: 'Fast' },
  ]);
  assert.equal(parsed.currentValue, 'Fast');
});

test('claude-code-vscode set_mode clicks current Antigravity conversation mode entries', async () => {
  const { doc, defaultView, planningLabel } = createCurrentShellDocument();
  const raw = await runScript(`${base}/scripts/1.0/set_mode.js`, {
    document: doc,
    window: defaultView,
    replacements: {
      '${ MODE }': JSON.stringify('Planning'),
    },
  });
  const parsed = JSON.parse(raw);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.mode, 'Planning');
  assert.equal(parsed.currentValue, 'Planning');
  assert.equal(planningLabel._clicked, true);
});

test('claude-code-vscode set_model clicks current Antigravity model entries', async () => {
  const { doc, defaultView, sonnetItem } = createCurrentShellDocument();
  const raw = await runScript(`${base}/scripts/1.0/set_model.js`, {
    document: doc,
    window: defaultView,
    replacements: {
      '${ MODEL }': JSON.stringify('Claude Sonnet 4.6 (Thinking)'),
    },
  });
  const parsed = JSON.parse(raw);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.model, 'Claude Sonnet 4.6 (Thinking)');
  assert.equal(parsed.currentValue, 'Claude Sonnet 4.6 (Thinking)');
  assert.equal(sonnetItem._clicked, true);
});

test('claude-code-vscode read_chat exposes live Antigravity-hosted model and mode values', () => {
  const { doc, defaultView } = createCurrentShellDocument();
  const raw = runScript(`${base}/scripts/1.0/read_chat.js`, { document: doc, window: defaultView });
  const parsed = JSON.parse(raw);

  assert.equal(parsed.mode, 'Fast');
  assert.equal(parsed.model, 'Claude Opus 4.6 (Thinking)');
  assert.equal(parsed.controlValues?.mode, 'Fast');
  assert.equal(parsed.controlValues?.model, 'Claude Opus 4.6 (Thinking)');
});

test('claude-code-vscode request_usage returns a persisted Usage bubble on the session-frame surface', async () => {
  const { doc, defaultView } = createUsageSessionDocument();
  const raw = await runScript(`${base}/scripts/1.0/request_usage.js`, { document: doc, window: defaultView });
  const parsed = JSON.parse(raw);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.usage?.plan, 'Pro');
  assert.deepEqual(parsed.usage?.bars, [
    { label: 'Session (5hr)', percent: '4%', reset: 'Resets in 1h' },
    { label: 'Weekly (7 day)', percent: '3%', reset: 'Resets in 6d' },
  ]);
  assert.deepEqual(parsed.effects, [{
    type: 'message',
    persist: true,
    message: {
      role: 'system',
      senderName: 'Usage',
      content: 'Usage\nPro\nSession 5hr 4% · reset 1h\nWeekly 7 day 3% · reset 6d',
      kind: 'system',
    },
  }]);
});

test('claude-code-vscode request_usage fails closed with an explicit unsupported error on the Antigravity-hosted surface', async () => {
  const { doc, defaultView } = createCurrentShellDocument();
  const raw = await runScript(`${base}/scripts/1.0/request_usage.js`, { document: doc, window: defaultView });
  const parsed = JSON.parse(raw);

  assert.equal(parsed.ok, false);
  assert.match(parsed.error || '', /not exposed|unsupported/i);
});
