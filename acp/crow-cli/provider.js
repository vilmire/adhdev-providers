/**
 * crow-cli — ACP Provider
 * 
 * Minimal ACP Native Coding Agent
 * https://github.com/crow-cli/crow-cli
 * 
 * Install: pip install crow-cli  (Python/uvx)
 * 
 * @type {import('../../../../src/providers/contracts').ProviderModule}
 */
module.exports = {
  type: 'crow-cli-acp',
  name: 'crow-cli (ACP)',
  category: 'acp',

  displayName: 'crow-cli',
  icon: '🐦‍⬛',
  install: 'pip install crow-cli  (Python/uvx)',

  spawn: {
    command: 'crow-cli',
    args: ['acp'],
    shell: false,
  },

  auth: [
    {
      type: 'agent',
      id: 'crow',
      name: 'crow-cli Auth',
      description: 'Configure provider through crow-cli setup',
    },
  ],

  settings: {
    approvalAlert: {
      type: 'boolean',
      default: true,
      public: true,
      label: 'Approval Alerts',
      description: 'Show notification when agent requires approval',
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
