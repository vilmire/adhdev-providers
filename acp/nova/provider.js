/**
 * Nova — ACP Provider
 * 
 * Nova by Compass AI - a fully-fledged software engineer
 * https://github.com/Compass-Agentic-Platform/nova
 * 
 * Install: npm install -g @compass-ai/nova
 * 
 * @type {import('../../../../src/providers/contracts').ProviderModule}
 */
module.exports = {
  type: 'nova-acp',
  name: 'Nova (ACP)',
  category: 'acp',

  displayName: 'Nova',
  icon: '⭐',
  install: 'npm install -g @compass-ai/nova',

  spawn: {
    command: 'nova',
    args: ['acp'],
    shell: false,
  },

  auth: [
    {
      type: 'agent',
      id: 'nova',
      name: 'Nova Auth',
      description: 'Authenticate with Compass AI account',
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
