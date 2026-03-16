/**
 * Goose — ACP Provider
 * 
 * A local, extensible, open source AI agent by Block
 * https://github.com/block/goose
 * 
 * Install: Binary download from GitHub releases
 *   macOS: brew install goose or download from releases
 *   See: https://github.com/block/goose/releases
 * 
 * Auth: Configured via goose settings
 * 
 * @type {import('../../../../src/providers/contracts').ProviderModule}
 */
module.exports = {
  type: 'goose-acp',
  name: 'Goose (ACP)',
  category: 'acp',

  displayName: 'Goose',
  icon: '🪿',
  install: 'brew install goose  or download from https://github.com/block/goose/releases',

  spawn: {
    command: 'goose',
    args: ['acp'],
    shell: false,
  },

  auth: [
    {
      type: 'terminal',
      id: 'goose-configure',
      name: 'Goose Configure',
      description: 'Run goose configure to set up provider and API keys',
      args: ['configure'],
    },
  ],

  settings: {
    approvalAlert: {
      type: 'boolean',
      default: true,
      public: true,
      label: 'Approval Alerts',
      description: 'Show notification when Goose requires approval',
    },
    longGeneratingAlert: {
      type: 'boolean',
      default: true,
      public: true,
      label: 'Long Generation Alert',
      description: 'Alert when generation takes too long',
    },
    longGeneratingThresholdSec: {
      type: 'number',
      default: 180,
      public: true,
      label: 'Long Generation Threshold (sec)',
      min: 30,
      max: 600,
    },
  },
};
