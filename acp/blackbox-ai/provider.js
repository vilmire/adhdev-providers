/**
 * Blackbox AI — ACP Provider
 * 
 * AI coding assistant by Blackbox
 * https://docs.blackbox.ai/features/blackbox-cli/introduction
 * 
 * Install: Download from https://docs.blackbox.ai/features/blackbox-cli
 * 
 * @type {import('../../../../src/providers/contracts').ProviderModule}
 */
module.exports = {
  type: 'blackbox-ai-acp',
  name: 'Blackbox AI (ACP)',
  category: 'acp',

  displayName: 'Blackbox AI',
  icon: '⬛',
  install: 'Download from https://docs.blackbox.ai/features/blackbox-cli',

  spawn: {
    command: 'blackbox',
    args: ['acp'],
    shell: false,
  },

  auth: [
    {
      type: 'agent',
      id: 'blackbox',
      name: 'Blackbox Auth',
      description: 'Authenticate with Blackbox AI account',
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
