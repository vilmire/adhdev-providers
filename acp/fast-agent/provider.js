/**
 * fast-agent — ACP Provider
 * 
 * Code and build agents with comprehensive multi-provider support
 * https://github.com/evalstate/fast-agent
 * 
 * Install: pip install fast-agent-acp  (Python/uvx)
 * 
 * @type {import('../../../../src/providers/contracts').ProviderModule}
 */
module.exports = {
  type: 'fast-agent-acp',
  name: 'fast-agent (ACP)',
  category: 'acp',

  displayName: 'fast-agent',
  icon: '⚡',
  install: 'pip install fast-agent-acp  (Python/uvx)',

  spawn: {
    command: 'fast-agent-acp',
    args: [],
    shell: false,
  },

  auth: [
    {
      type: 'agent',
      id: 'fast-agent',
      name: 'fast-agent Auth',
      description: 'Configure provider through fast-agent setup',
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
