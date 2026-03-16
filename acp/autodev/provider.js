/**
 * AutoDev — ACP Provider
 * 
 * AI-powered coding assistant by Phodal
 * https://github.com/phodal/auto-dev
 * 
 * Install: Download from https://github.com/phodal/auto-dev/releases
 * 
 * @type {import('../../../../src/providers/contracts').ProviderModule}
 */
module.exports = {
  type: 'autodev-acp',
  name: 'AutoDev (ACP)',
  category: 'acp',

  displayName: 'AutoDev',
  icon: '🤖',
  install: 'Download from https://github.com/phodal/auto-dev/releases',

  spawn: {
    command: 'autodev',
    args: ['acp'],
    shell: false,
  },

  auth: [
    {
      type: 'agent',
      id: 'autodev',
      name: 'AutoDev Auth',
      description: 'Configure provider through AutoDev setup',
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
