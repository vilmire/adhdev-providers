/**
 * Cursor Agent — ACP Provider
 * 
 * Cursor's coding agent
 * https://cursor.com/docs/cli/acp
 * 
 * Install: Download from https://cursor.com/docs/cli/acp
 * 
 * @type {import('../../../../src/providers/contracts').ProviderModule}
 */
module.exports = {
  type: 'cursor-acp',
  name: 'Cursor (ACP)',
  category: 'acp',

  displayName: 'Cursor Agent',
  icon: '🔵',
  install: 'Download from https://cursor.com/docs/cli/acp',

  spawn: {
    command: 'cursor-agent',
    args: ['acp'],
    shell: false,
  },

  auth: [
    {
      type: 'agent',
      id: 'cursor',
      name: 'Cursor Auth',
      description: 'Authenticate with Cursor account',
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
