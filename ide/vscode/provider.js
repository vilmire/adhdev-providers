/**
 * Visual Studio Code — IDE Provider
 * 
 * Category: ide
 * 인프라 정보만 제공 (CDP 스크립트는 cursor와 유사 — 향후 추가)
 * 
 * @type {import('../../../src/providers/contracts').ProviderModule}
 */
module.exports = {
  type: 'vscode',
  name: 'Visual Studio Code',
  category: 'ide',

  // ─── IDE 인프라 ───
  displayName: 'VS Code',
  icon: '💙',
  cli: 'code',
  cdpPorts: [9339, 9340],
  processNames: {
    darwin: 'Visual Studio Code',
    win32: ['Code.exe'],
  },
  paths: {
    darwin: ['/Applications/Visual Studio Code.app'],
    win32: [
      'C:\\Program Files\\Microsoft VS Code\\Code.exe',
      'C:\\Users\\*\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe',
    ],
    linux: ['/usr/share/code', '/snap/code/current'],
  },

  inputMethod: 'cdp-type-and-send',
  inputSelector: '[contenteditable="true"][role="textbox"]',

  scripts: {},
};
