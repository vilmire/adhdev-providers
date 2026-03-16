/**
 * Amp — ACP Provider
 * 
 * ACP wrapper for Amp - the frontier coding agent
 * https://github.com/tao12345666333/amp-acp
 * 
 * Install: Binary download from GitHub releases (no npm package)
 *   macOS: curl -L https://github.com/tao12345666333/amp-acp/releases/latest/download/amp-acp-darwin-aarch64.tar.gz | tar xz
 *   Linux: curl -L https://github.com/tao12345666333/amp-acp/releases/latest/download/amp-acp-linux-x86_64.tar.gz | tar xz
 * 
 * @type {import('../../../../src/providers/contracts').ProviderModule}
 */
module.exports = {
  type: 'amp-acp',
  name: 'Amp (ACP)',
  category: 'acp',

  displayName: 'Amp',
  icon: '⚡',
  install: 'Binary download from GitHub: https://github.com/tao12345666333/amp-acp/releases',

  spawn: {
    command: 'amp-acp',
    args: [],
    shell: false,
  },

  auth: [
    {
      type: 'agent',
      id: 'amp-auth',
      name: 'Amp Authentication',
      description: 'Authenticate through Amp setup flow',
    },
  ],

  settings: {
    approvalAlert: {
      type: 'boolean',
      default: true,
      public: true,
      label: 'Approval Alerts',
      description: 'Show notification when Amp requires approval',
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
