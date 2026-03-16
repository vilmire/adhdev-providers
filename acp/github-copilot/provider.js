/**
 * GitHub Copilot — ACP Provider
 * 
 * GitHub's AI pair programmer with ACP support
 * https://github.com/github/copilot-cli
 * 
 * Install: npm install -g @github/copilot
 * Auth: GitHub authentication (gh auth login)
 * 
 * @type {import('../../../../src/providers/contracts').ProviderModule}
 */
module.exports = {
  type: 'github-copilot-acp',
  name: 'GitHub Copilot (ACP)',
  category: 'acp',

  displayName: 'GitHub Copilot',
  icon: '🐙',
  install: 'npm install -g @github/copilot  (requires GitHub auth)',

  spawn: {
    command: 'copilot',
    args: ['--acp'],
    shell: false,
  },

  auth: [
    {
      type: 'agent',
      id: 'github',
      name: 'GitHub Authentication',
      description: 'Authenticate via GitHub OAuth device flow (gh auth login)',
    },
  ],

  settings: {
    approvalAlert: {
      type: 'boolean',
      default: true,
      public: true,
      label: 'Approval Alerts',
      description: 'Show notification when Copilot requires approval',
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
