/**
 * Code Assistant — ACP Provider
 * 
 * AI code assistant written in Rust
 * https://github.com/stippi/code-assistant
 * 
 * Install: Download from https://github.com/stippi/code-assistant/releases
 * 
 * @type {import('../../../../src/providers/contracts').ProviderModule}
 */
module.exports = {
  type: 'code-assistant-acp',
  name: 'Code Assistant (ACP)',
  category: 'acp',

  displayName: 'Code Assistant',
  icon: '🔧',
  install: 'Download from https://github.com/stippi/code-assistant/releases',

  spawn: {
    command: 'code-assistant',
    args: ['--acp'],
    shell: false,
  },

  auth: [
    {
      type: 'agent',
      id: 'code-assistant',
      name: 'Code Assistant Auth',
      description: 'Configure provider through code-assistant setup',
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
