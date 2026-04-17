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
  disabled = false,
  ownerDocument = null,
}) {
  return {
    tagName,
    textContent: text,
    innerText: text,
    className,
    disabled,
    ownerDocument,
    dataset: {},
    _clicked: false,
    getAttribute(name) {
      return attrs[name] ?? null;
    },
    setAttribute(name, value) {
      attrs[name] = value;
    },
    getBoundingClientRect() {
      return visible
        ? { left: 10, top: 10, width: 100, height: 24 }
        : { left: 0, top: 0, width: 0, height: 0 };
    },
    closest() {
      return null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    dispatchEvent(event) {
      if (event && event.type === 'click') this._clicked = true;
      return true;
    },
    click() {
      this._clicked = true;
    },
    focus() {},
  };
}

function createDocument({ approvalTargets = [], welcomeText = '', modeText = '', initialCache = undefined } = {}) {
  const defaultView = {
    getComputedStyle() {
      return { display: 'block', visibility: 'visible' };
    },
    getSelection() {
      return {
        removeAllRanges() {},
        addRange() {},
      };
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
    Event: class Event {
      constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
    },
  };

  const body = createElement({ tagName: 'BODY', text: '', ownerDocument: null });
  const welcomeElement = welcomeText ? createElement({ tagName: 'DIV', text: welcomeText, className: 'message_AV_aEg', ownerDocument: null }) : null;
  const modeButton = modeText ? createElement({ tagName: 'BUTTON', text: modeText, className: 'footerButton_gGYT1w footerButtonPrimary_gGYT1w', ownerDocument: null }) : null;
  const doc = {
    body,
    defaultView,
    title: '',
    getElementById(id) {
      if (id === 'root') return body;
      return null;
    },
    createRange() {
      return {
        selectNodeContents() {},
        collapse() {},
      };
    },
    execCommand() {
      return false;
    },
    querySelector(selector) {
      if (selector === 'button.footerButton_gGYT1w.footerButtonPrimary_gGYT1w') return modeButton;
      if (selector === '.effortLabel_8RAulQ, [class*="effortLabel"]') return null;
      if (selector === '.messagesContainer_07S1Yg > .spinnerRow_07S1Yg') return null;
      if (selector === '[role="textbox"].messageInput_cKsPxg' || selector === '[role="textbox"].messageInput_cKsPxg, [role="textbox"][contenteditable="true"]') return null;
      if (selector === 'button.sendButton_gGYT1w, button[aria-label*="send" i]' || selector === 'button.sendButton_gGYT1w') return null;
      if (selector === '.message_AV_aEg, .messageContainer_AV_aEg, [class*="emptyState" i] [class*="message" i]') return welcomeElement;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.messagesContainer_07S1Yg .message_07S1Yg') return [];
      if (selector === 'button.footerButton_gGYT1w, button[class*="footerButton"]') return [];
      if (selector === 'button, [role="button"], [role="option"], [role="radio"]') return approvalTargets;
      return [];
    },
  };
  body.ownerDocument = doc;
  if (modeButton) modeButton.ownerDocument = doc;
  for (const target of approvalTargets) target.ownerDocument = doc;
  if (initialCache && typeof initialCache === 'object') defaultView.__adhdevClaudeCodeControls = { ...initialCache };
  return { doc, defaultView };
}

function runScript(filePath, { document: doc, window: win, replacements = {} }) {
  let code = readFileSync(filePath, 'utf8');
  for (const [token, value] of Object.entries(replacements)) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    code = code.replace(new RegExp(escaped, 'g'), value);
  }
  const context = {
    document: doc,
    window: win,
    console,
    setTimeout,
    clearTimeout,
  };
  return vm.runInNewContext(code, context, { filename: filePath });
}

test('claude-code-vscode read_chat detects approval from visible approval buttons', () => {
  const allowButton = createElement({ tagName: 'BUTTON', text: 'Allow for this session' });
  const denyButton = createElement({ tagName: 'BUTTON', text: 'Deny' });
  const { doc, defaultView } = createDocument({ approvalTargets: [allowButton, denyButton] });

  const raw = runScript(
    '/Users/vilmire/Work/adhdev_public/adhdev-providers/extension/claude-code-vscode/scripts/1.0/read_chat.js',
    { document: doc, window: defaultView },
  );
  const parsed = JSON.parse(raw);

  assert.equal(parsed.status, 'waiting_approval');
  assert.deepEqual(parsed.activeModal?.buttons, ['Allow for this session', 'Deny']);
  assert.equal(parsed.activeModal?.message, 'Claude Code requires approval');
});

test('claude-code-vscode read_chat suppresses welcome empty-state text as a real chat message', () => {
  const { doc, defaultView } = createDocument({
    welcomeText: "Ready to code?\nLet's write something worth deploying.",
  });

  const raw = runScript(
    '/Users/vilmire/Work/adhdev_public/adhdev-providers/extension/claude-code-vscode/scripts/1.0/read_chat.js',
    { document: doc, window: defaultView },
  );
  const parsed = JSON.parse(raw);

  assert.equal(parsed.status, 'idle');
  assert.equal(parsed.isWelcomeScreen, true);
  assert.deepEqual(parsed.messages, []);
});

test('claude-code-vscode read_chat does not resurrect stale cached mode when no live mode control is visible', () => {
  const { doc, defaultView } = createDocument({ initialCache: { mode: 'Edit automatically' } });

  const raw = runScript(
    '/Users/vilmire/Work/adhdev_public/adhdev-providers/extension/claude-code-vscode/scripts/1.0/read_chat.js',
    { document: doc, window: defaultView },
  );
  const parsed = JSON.parse(raw);

  assert.equal(parsed.mode, undefined);
  assert.equal(parsed.controlValues?.mode, undefined);
});

test('claude-code-vscode read_chat reports live mode text when the footer mode control is visible', () => {
  const { doc, defaultView } = createDocument({ modeText: 'Ask before edits' });

  const raw = runScript(
    '/Users/vilmire/Work/adhdev_public/adhdev-providers/extension/claude-code-vscode/scripts/1.0/read_chat.js',
    { document: doc, window: defaultView },
  );
  const parsed = JSON.parse(raw);

  assert.equal(parsed.mode, 'Ask before edits');
  assert.equal(parsed.controlValues?.mode, 'Ask before edits');
});

test('claude-code-vscode resolve_action clicks exact matching role=button approval targets', async () => {
  const allowButton = createElement({
    tagName: 'DIV',
    text: 'Allow for this session',
    attrs: { role: 'button' },
  });
  const denyButton = createElement({
    tagName: 'DIV',
    text: 'Deny',
    attrs: { role: 'button' },
  });
  const { doc, defaultView } = createDocument({ approvalTargets: [allowButton, denyButton] });

  const raw = await runScript(
    '/Users/vilmire/Work/adhdev_public/adhdev-providers/extension/claude-code-vscode/scripts/1.0/resolve_action.js',
    {
      document: doc,
      window: defaultView,
      replacements: {
        '${ ACTION }': JSON.stringify('approve'),
        '${ BUTTON_TEXT }': JSON.stringify('Allow for this session'),
      },
    },
  );
  const parsed = JSON.parse(raw);

  assert.equal(parsed.resolved, true);
  assert.equal(parsed.clicked, 'Allow for this session');
  assert.equal(allowButton._clicked, true);
  assert.equal(denyButton._clicked, false);
});
