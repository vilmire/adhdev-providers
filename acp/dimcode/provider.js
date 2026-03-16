/**
 * DimCode — ACP Provider
 * 
 * A coding agent that puts leading models at your command
 * 
 * Install: npm install -g dimcode
 * 
 * @type {import('../../../../src/providers/contracts').ProviderModule}
 */
module.exports = {
  type: 'dimcode-acp',
  name: 'DimCode (ACP)',
  category: 'acp',

  displayName: 'DimCode',
  icon: '💠',
  install: 'npm install -g dimcode',

  spawn: {
    command: 'dimcode',
    args: ['acp'],
    shell: false,
  },

  auth: [
    {
      type: 'agent',
      id: 'dimcode',
      name: 'DimCode Auth',
      description: 'Configure provider through DimCode setup',
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
