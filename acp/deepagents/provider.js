/**
 * DeepAgents — ACP Provider
 * 
 * Batteries-included AI coding agent powered by LangChain
 * https://github.com/langchain-ai/deepagentsjs
 * 
 * Install: npm install -g deepagents-acp
 * 
 * @type {import('../../../../src/providers/contracts').ProviderModule}
 */
module.exports = {
  type: 'deepagents-acp',
  name: 'DeepAgents (ACP)',
  category: 'acp',

  displayName: 'DeepAgents',
  icon: '🔗',
  install: 'npm install -g deepagents-acp',

  spawn: {
    command: 'deepagents-acp',
    args: [],
    shell: false,
  },

  auth: [
    {
      type: 'agent',
      id: 'deepagents',
      name: 'DeepAgents Auth',
      description: 'Configure provider through DeepAgents setup',
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
