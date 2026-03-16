/**
 * OpenHands — ACP Provider
 * 
 * Open-source AI developer platform by AllHands AI
 * https://docs.openhands.dev/openhands/usage/run-openhands/acp
 * 
 * Install: pip install openhands  (Python/Docker)
 * 
 * @type {import('../../../../src/providers/contracts').ProviderModule}
 */
module.exports = {
  type: 'openhands-acp',
  name: 'OpenHands (ACP)',
  category: 'acp',

  displayName: 'OpenHands',
  icon: '✋',
  install: 'pip install openhands  (Python/Docker)',

  spawn: {
    command: 'openhands',
    args: ['acp'],
    shell: false,
  },

  auth: [
    {
      type: 'agent',
      id: 'openhands',
      name: 'OpenHands Auth',
      description: 'Configure provider through OpenHands setup',
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
