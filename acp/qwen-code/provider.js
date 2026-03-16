/**
 * Qwen Code — ACP Provider
 * 
 * Alibaba's Qwen coding assistant
 * https://github.com/QwenLM/qwen-code
 * 
 * Install: npm install -g @qwen-code/qwen-code
 * Auth: DASHSCOPE_API_KEY environment variable
 * 
 * @type {import('../../../../src/providers/contracts').ProviderModule}
 */
module.exports = {
  type: 'qwen-code-acp',
  name: 'Qwen Code (ACP)',
  category: 'acp',

  displayName: 'Qwen Code',
  icon: '🟦',
  install: 'npm install -g @qwen-code/qwen-code  (requires DASHSCOPE_API_KEY)',

  spawn: {
    command: 'qwen-code',
    args: ['--acp', '--experimental-skills'],
    shell: false,
  },

  auth: [
    {
      type: 'env_var',
      id: 'dashscope',
      name: 'DashScope API Key',
      vars: [{ name: 'DASHSCOPE_API_KEY' }],
      link: 'https://dashscope.console.aliyun.com/apiKey',
    },
  ],

  settings: {
    approvalAlert: {
      type: 'boolean',
      default: true,
      public: true,
      label: 'Approval Alerts',
      description: 'Show notification when Qwen Code requires approval',
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
