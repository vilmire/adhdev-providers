const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const outputDir = process.env.ADHDEV_DRIVER_STATE_DIR
  || path.join(os.tmpdir(), 'adhdev-driver-browser-playwright');
fs.mkdirSync(outputDir, { recursive: true });

const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['-y', '@playwright/mcp@0.0.83', '--headless', '--output-dir', outputDir],
  { stdio: 'inherit', cwd: outputDir },
);
child.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
