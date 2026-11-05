'use strict';
// Test backend for the computer-use driver server (selected with ADHDEV_COMPUTER_BACKEND).
// Calls are appended as JSON lines to FAKE_COMPUTER_LOG; FAKE_COMPUTER_FAIL=<code> makes input fail.
const fs = require('node:fs');
const path = require('node:path');
const { DriverError } = require(path.join(__dirname, '..', '..', 'driver', 'computer-use', 'bin', 'run.js'));

const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const log = (name, args) => {
  if (process.env.FAKE_COMPUTER_LOG) fs.appendFileSync(process.env.FAKE_COMPUTER_LOG, `${JSON.stringify({ name, args })}\n`);
};
const op = (name) => async (args) => {
  if (process.env.FAKE_COMPUTER_FAIL) throw new DriverError(process.env.FAKE_COMPUTER_FAIL, `fake ${name} failure`);
  log(name, args);
};

module.exports = {
  async status() {
    return { platform: 'fake', session: 'test', screen: { available: true }, input: { available: false, reason: 'fake', hint: 'none' }, uiTree: { available: true } };
  },
  async screenInfo() { return { width: 1000, height: 800, cursor: { x: 5, y: 6 } }; },
  // FAKE_COMPUTER_TREE=<json file> replaces the default tree (raw backend nodes, passwords included on purpose).
  async uiTree(limits) {
    if (process.env.FAKE_COMPUTER_FAIL) throw new DriverError(process.env.FAKE_COMPUTER_FAIL, 'fake uiTree failure');
    log('uiTree', limits);
    if (process.env.FAKE_COMPUTER_TREE) return JSON.parse(fs.readFileSync(process.env.FAKE_COMPUTER_TREE, 'utf8'));
    return {
      app: 'FakeApp', window: 'Fake window', truncated: false,
      nodes: [
        { depth: 0, role: 'AXWindow', name: 'Fake window', x: 0, y: 0, width: 1000, height: 800 },
        { depth: 1, role: 'AXButton', name: 'OK', x: 100, y: 200, width: 80, height: 30, enabled: true },
        { depth: 1, role: 'AXSecureTextField', name: 'Password', value: 'hunter2', secure: true, x: 100, y: 300, width: 200, height: 24, focused: true },
      ],
    };
  },
  async screenshot() { log('screenshot', {}); return { png: PNG_1x1, width: 1, height: 1 }; },
  mouseMove: op('mouseMove'), click: op('click'), drag: op('drag'), scroll: op('scroll'), typeText: op('typeText'), pressKey: op('pressKey'),
};
