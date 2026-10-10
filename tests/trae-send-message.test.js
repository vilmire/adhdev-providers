const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const TRAE_SEND_MESSAGE = path.join(__dirname, '..', 'ide', 'trae', 'scripts', '1.0', 'send_message.js');

function normalizeSelectorList(selector) {
  return String(selector || '').split(',').map(part => part.trim()).filter(Boolean);
}

function createElement({
  text = '',
  className = '',
  attrs = {},
  disabled = false,
  visible = true,
  onClick = null,
  onDispatch = null,
} = {}) {
  const element = {
    textContent: text,
    innerText: text,
    className,
    disabled,
    ownerDocument: null,
    clicked: false,
    focused: false,
    getAttribute(name) {
      return attrs[name] ?? null;
    },
    get classList() {
      return {
        contains: (name) => className.split(/\s+/).includes(name),
      };
    },
    get offsetWidth() {
      return visible ? 100 : 0;
    },
    get offsetHeight() {
      return visible ? 32 : 0;
    },
    getBoundingClientRect() {
      return visible
        ? { left: 0, top: 0, width: 100, height: 32 }
        : { left: 0, top: 0, width: 0, height: 0 };
    },
    matches(selector) {
      return normalizeSelectorList(selector).some(part => {
        if (part === '.chat-input-v2-send-button') return className.split(/\s+/).includes('chat-input-v2-send-button');
        if (part === 'button') return attrs.role === 'button' || element.tagName === 'BUTTON';
        if (part === '[role="button"]') return attrs.role === 'button';
        return false;
      });
    },
    focus() {
      this.focused = true;
    },
    click() {
      this.clicked = true;
      if (typeof onClick === 'function') onClick();
    },
    dispatchEvent(event) {
      if (typeof onDispatch === 'function') onDispatch(event);
      return true;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
  return element;
}

function createWindow() {
  class Event {
    constructor(type, init = {}) {
      this.type = type;
      Object.assign(this, init);
    }
  }
  return {
    Event,
    InputEvent: Event,
    KeyboardEvent: Event,
    getSelection() {
      return {
        removeAllRanges() {},
        addRange() {},
      };
    },
  };
}

function createTraeDocument({ sendButtonDisabled = false, sendOn = 'click' } = {}) {
  const defaultView = createWindow();
  const userMessages = [];
  let stopButton = null;
  let selectedNode = null;

  const editor = createElement({
    className: 'chat-input-v2-input-box-editable',
    attrs: { contenteditable: 'true', role: 'textbox' },
    onDispatch: (event) => {
      if (sendOn !== 'keyboard') return;
      if (event.type === 'keydown' && event.key === 'Enter' && userMessages.length === 0) {
        userMessages.push(createElement({ text: editor.textContent, className: 'user-chat-bubble-request__content-wrapper' }));
        stopButton = createElement({ text: 'Stop', attrs: { role: 'button', 'aria-label': 'Stop generating' } });
      }
    },
  });
  const sendButton = createElement({
    className: 'chat-input-v2-send-button',
    attrs: { role: 'button', 'aria-label': 'Send' },
    disabled: sendButtonDisabled,
    onClick: () => {
      if (sendOn !== 'click') return;
      userMessages.push(createElement({ text: editor.textContent, className: 'user-chat-bubble-request__content-wrapper' }));
      stopButton = createElement({ text: 'Stop', attrs: { role: 'button', 'aria-label': 'Stop generating' } });
    },
  });

  const auxbar = {
    querySelector(selector) {
      if (selector.includes('.chat-input-v2-input-box-editable')) return editor;
      if (selector === '.monaco-progress-container:not(.done)') return null;
      if (selector === '.latest-assistant-bar') return null;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.user-chat-bubble-request__content-wrapper') return userMessages;
      if (selector === '.chat-input-v2-send-button, button, [role="button"]') {
        return [sendButton, stopButton].filter(Boolean);
      }
      if (selector === 'button, [role="button"]') {
        return [sendButton, stopButton].filter(Boolean);
      }
      return [];
    },
  };

  const document = {
    defaultView,
    getElementById(id) {
      return id === 'workbench.parts.auxiliarybar' ? auxbar : null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    createRange() {
      return {
        selectNodeContents(node) {
          selectedNode = node;
        },
      };
    },
    execCommand(command, _showUi, value) {
      if (!selectedNode) return false;
      if (command === 'delete') selectedNode.textContent = '';
      if (command === 'insertText') selectedNode.textContent += value || '';
      return true;
    },
  };
  editor.ownerDocument = document;
  sendButton.ownerDocument = document;
  return { document, defaultView, editor, sendButton, userMessages };
}

function createTraeDocumentWithLexicalInsertMirroring() {
  const harness = createTraeDocument({
    sendButtonDisabled: false,
    sendOn: 'click',
  });
  const originalDispatch = harness.editor.dispatchEvent.bind(harness.editor);
  harness.editor.dispatchEvent = (event) => {
    if (
      (event.type === 'beforeinput' || event.type === 'input')
      && event.inputType === 'insertText'
      && typeof event.data === 'string'
      && event.data
    ) {
      harness.editor.textContent += event.data;
    }
    return originalDispatch(event);
  };
  return harness;
}

async function runSendMessage(document, window, message) {
  const rawCode = readFileSync(TRAE_SEND_MESSAGE, 'utf8');
  const code = rawCode.replace(/\$\{ MESSAGE \}/g, JSON.stringify(message));
  const context = {
    document,
    window,
    console,
    setTimeout,
    clearTimeout,
    Date,
    Event: window.Event,
    InputEvent: window.InputEvent,
    KeyboardEvent: window.KeyboardEvent,
  };
  const raw = await vm.runInNewContext(code, context, { filename: TRAE_SEND_MESSAGE });
  return JSON.parse(raw);
}

test('trae send_message confirms keyboard sends instead of asking daemon to type again', async () => {
  const { document, defaultView, editor, userMessages } = createTraeDocument({
    sendButtonDisabled: true,
    sendOn: 'keyboard',
  });

  const result = await runSendMessage(document, defaultView, 'hello solo');

  assert.equal(result.sent, true);
  assert.equal(result.method, 'keyboard');
  assert.equal(result.confirmed, true);
  assert.equal(result.needsTypeAndSend, undefined);
  assert.equal(result.clearedInput, true);
  assert.equal(editor.textContent, '');
  assert.equal(userMessages.at(-1).textContent, 'hello solo');
});

test('trae send_message never requests a daemon type-and-send fallback after Enter', async () => {
  const { document, defaultView, editor } = createTraeDocument({
    sendButtonDisabled: true,
    sendOn: 'none',
  });

  const result = await runSendMessage(document, defaultView, 'avoid interrupt');

  assert.equal(result.sent, true);
  assert.equal(result.method, 'keyboard');
  assert.equal(result.confirmed, false);
  assert.equal(result.needsTypeAndSend, undefined);
  assert.equal(editor.textContent, '');
});

test('trae send_message clears stale composer text after button send is observed', async () => {
  const { document, defaultView, editor, sendButton, userMessages } = createTraeDocument({
    sendButtonDisabled: false,
    sendOn: 'click',
  });

  const result = await runSendMessage(document, defaultView, 'clear me');

  assert.equal(result.sent, true);
  assert.equal(result.method, 'button');
  assert.equal(result.confirmed, true);
  assert.equal(result.clearedInput, true);
  assert.equal(sendButton.clicked, true);
  assert.equal(editor.textContent, '');
  assert.equal(userMessages.at(-1).textContent, 'clear me');
});

test('trae send_message does not duplicate text through synthetic input events', async () => {
  const { document, defaultView, editor, userMessages } = createTraeDocumentWithLexicalInsertMirroring();

  const result = await runSendMessage(document, defaultView, '几点了');

  assert.equal(result.sent, true);
  assert.equal(result.clearedInput, true);
  assert.equal(editor.textContent, '');
  assert.equal(userMessages.at(-1).textContent, '几点了');
});
