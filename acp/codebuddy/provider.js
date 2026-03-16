/**
 * Codebuddy Code — ACP Provider
 * 
 * Tencent Cloud's official intelligent coding tool
 * https://www.codebuddy.cn/cli/
 * 
 * Install: npm install -g @tencent-ai/codebuddy-code
 * 
 * @type {import('../../../../src/providers/contracts').ProviderModule}
 */
module.exports = {
  type: 'codebuddy-acp',
  name: 'Codebuddy Code (ACP)',
  category: 'acp',

  displayName: 'Codebuddy Code',
  icon: '🐧',
  install: 'npm install -g @tencent-ai/codebuddy-code',

  spawn: {
    command: 'codebuddy-code',
    args: ['--acp'],
    shell: false,
  },

  auth: [
    {
      type: 'agent',
      id: 'tencent',
      name: 'Tencent Cloud Auth',
      description: 'Authenticate through Tencent Cloud account',
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
