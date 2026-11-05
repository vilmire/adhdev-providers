'use strict';
// shell_run: run one command line with the daemon user's own shell.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DriverError, runProcess } = require('./run.js');

const OUTPUT_CAP_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 300_000;

// Run through a script block so the exit code reflects native commands and failed cmdlets.
// The command text is carried as base64 and never spliced into the script source.
function powershellScript(command) {
  const b64 = Buffer.from(command, 'utf8').toString('base64');
  return [
    "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)",
    '$global:LASTEXITCODE = $null',
    `$cmd = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64}'))`,
    'try { & ([ScriptBlock]::Create($cmd)); $ok = $? } catch { [Console]::Error.WriteLine($_.ToString()); exit 1 }',
    'if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }',
    'if ($ok) { exit 0 } else { exit 1 }',
  ].join('\n');
}

/** Pure: the executable and argv used for a command line on a platform. */
function buildShellCommand(command, { platform = process.platform, env = process.env, fileExists = fs.existsSync } = {}) {
  if (platform === 'win32') {
    const encoded = Buffer.from(powershellScript(command), 'utf16le').toString('base64');
    return { file: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded] };
  }
  const shell = typeof env.SHELL === 'string' && path.isAbsolute(env.SHELL) && fileExists(env.SHELL) ? env.SHELL : null;
  return shell ? { file: shell, args: ['-lc', command] } : { file: '/bin/sh', args: ['-c', command] };
}

function resolveCwd(cwd) {
  const dir = cwd === undefined ? os.homedir() : cwd;
  let stat;
  try { stat = fs.statSync(dir); } catch { throw new DriverError('invalid_arguments', 'cwd does not exist'); }
  if (!stat.isDirectory()) throw new DriverError('invalid_arguments', 'cwd is not a directory');
  return dir;
}

async function shellRun(args, deps = {}) {
  const platform = deps.platform ?? process.platform;
  const env = deps.env ?? process.env;
  const cwd = resolveCwd(args.cwd);
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new DriverError('invalid_arguments', `timeoutMs must be 1..${MAX_TIMEOUT_MS}`);
  }
  const { file, args: argv } = buildShellCommand(args.command, { platform, env, fileExists: deps.fileExists });
  const run = deps.runProcess ?? runProcess;
  const result = await run(file, argv, { cwd, env, timeoutMs, maxBytes: OUTPUT_CAP_BYTES, platform });
  return {
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    stdout: result.stdout,
    stderr: result.stderr,
    truncated: result.truncated,
  };
}

module.exports = { shellRun, buildShellCommand, powershellScript, OUTPUT_CAP_BYTES, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS };
