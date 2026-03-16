/**
 * VT Code — ACP Provider
 * 
 * Swift-based coding agent with Zed/ACP integration
 * https://github.com/vinhnx/vtcode
 * 
 * Install: npm install -g vtcode
 * 
 * @type {import('../../../../src/providers/contracts').ProviderModule}
 */
module.exports = {
  type: 'vtcode-acp',
  name: 'VT Code (ACP)',
  category: 'acp',

  displayName: 'VT Code',
  icon: '🟣',
  install: 'npm install -g vtcode',

  spawn: {
    command: 'vtcode',
    args: ['acp'],
    shell: false,
  },

  auth: [
    {
      type: 'agent',
      id: 'vtcode',
      name: 'VT Code Auth',
      description: 'Configure provider through VT Code setup',
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
