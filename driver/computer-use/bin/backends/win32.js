'use strict';
// Windows backend (UNVERIFIED on a real Windows host): PowerShell + System.Drawing for capture,
// Add-Type C# over user32 SendInput for input. The script source is a fixed constant passed with
// -EncodedCommand; operation arguments arrive as base64 JSON on stdin, so no value is ever spliced
// into script text.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DriverError, runProcess } = require('../run.js');
const { parseKey, checkModifiers, splitTypedText, pngSize, parseLastJson } = require('./common.js');

// Wall-clock budget for the UI Automation walk (the script stops and returns a partial tree); the process limit sits above it.
const UI_TREE_BUDGET_MS = 18_000;
const UI_TREE_PROCESS_TIMEOUT_MS = 30_000;
const UI_TREE_MAX_BYTES = 2 * 1024 * 1024;

const NAMED_VK = {
  enter: 0x0d, tab: 0x09, escape: 0x1b, backspace: 0x08, delete: 0x2e, space: 0x20,
  up: 0x26, down: 0x28, left: 0x25, right: 0x27, home: 0x24, end: 0x23, pageup: 0x21, pagedown: 0x22,
  ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`f${i + 1}`, 0x70 + i])),
};
const EXTENDED = new Set(['up', 'down', 'left', 'right', 'home', 'end', 'pageup', 'pagedown', 'delete']);
const MODIFIER_VK = { ctrl: 0x11, alt: 0x12, shift: 0x10, cmd: 0x5b };
const OEM_VK = { ';': 0xba, '=': 0xbb, ',': 0xbc, '-': 0xbd, '.': 0xbe, '/': 0xbf, '`': 0xc0, '[': 0xdb, '\\': 0xdc, ']': 0xdd, "'": 0xde };

function resolveKey(key, modifiers) {
  const mods = checkModifiers(modifiers).map((m) => MODIFIER_VK[m]);
  const parsed = parseKey(key);
  if (parsed.name) return { vk: NAMED_VK[parsed.name], ext: EXTENDED.has(parsed.name), modifiers: mods };
  const c = parsed.char;
  const lower = c.toLowerCase();
  if (/^[a-z]$/.test(lower)) {
    const shifted = c !== lower && !mods.includes(MODIFIER_VK.shift);
    return { vk: lower.charCodeAt(0) - 32, modifiers: shifted ? [...mods, MODIFIER_VK.shift] : mods };
  }
  if (/^[0-9]$/.test(c)) return { vk: c.charCodeAt(0), modifiers: mods };
  if (c in OEM_VK) return { vk: OEM_VK[c], modifiers: mods };
  if (mods.length === 0) return { text: c, modifiers: [] };
  throw new DriverError('invalid_arguments', `key ${c} cannot be combined with modifiers on Windows`);
}

function typeSteps(text) {
  return splitTypedText(text).map((item) => (item.key ? { vk: NAMED_VK[item.key], modifiers: [] } : item));
}

// The 'tree' op is a read-only UI Automation walk of the foreground window: preorder, bounded by depth, node count,
// visited count and a wall-clock budget; a hung app yields a partial tree with truncated = true. The encoded script
// must stay well under the 32k command-line limit (no comments inside the script).
const POWERSHELL_SOURCE = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
function Emit($o) { [Console]::Out.WriteLine((ConvertTo-Json -Compress -Depth 6 -InputObject $o)) }
try {
  $raw = [Console]::In.ReadToEnd().Trim()
  $a = ConvertFrom-Json ([System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($raw)))
  $sessionId = [System.Diagnostics.Process]::GetCurrentProcess().SessionId
  if ($a.op -eq 'session') { Emit @{ ok = $true; sessionId = $sessionId }; exit 0 }
  if ($sessionId -eq 0) { Emit @{ ok = $false; code = 'backend_unavailable'; message = 'running in session 0 (a service); there is no interactive desktop' }; exit 0 }
  Add-Type -AssemblyName System.Drawing
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class CU {
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public INPUTUNION u; }
  [StructLayout(LayoutKind.Sequential)] struct POINT { public int X; public int Y; }
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);
  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  public static void Init() { SetProcessDPIAware(); }
  public static long Foreground() { return GetForegroundWindow().ToInt64(); }
  public static int Width() { return GetSystemMetrics(0); }
  public static int Height() { return GetSystemMetrics(1); }
  public static int CursorX() { POINT p; GetCursorPos(out p); return p.X; }
  public static int CursorY() { POINT p; GetCursorPos(out p); return p.Y; }
  public static void MoveTo(int x, int y) { if (!SetCursorPos(x, y)) throw new Exception("SetCursorPos failed"); }
  static void Send(INPUT[] a) {
    uint n = SendInput((uint)a.Length, a, Marshal.SizeOf(typeof(INPUT)));
    if (n != a.Length) throw new Exception("SendInput inserted " + n + " of " + a.Length + " events (blocked by a higher-privilege window?)");
  }
  public static void Mouse(uint flags, int data) {
    INPUT[] a = new INPUT[1];
    a[0].type = 0; a[0].u.mi.dwFlags = flags; a[0].u.mi.mouseData = unchecked((uint)data);
    Send(a);
  }
  public static void Key(ushort vk, bool up, bool ext) {
    INPUT[] a = new INPUT[1];
    a[0].type = 1; a[0].u.ki.wVk = vk; a[0].u.ki.dwFlags = (up ? 2u : 0u) | (ext ? 1u : 0u);
    Send(a);
  }
  public static void Unit(ushort unit, bool up) {
    INPUT[] a = new INPUT[1];
    a[0].type = 1; a[0].u.ki.wScan = unit; a[0].u.ki.dwFlags = 4u | (up ? 2u : 0u);
    Send(a);
  }
}
'@
  [CU]::Init()
  $w = [CU]::Width(); $h = [CU]::Height()
  $down = @{ left = 0x2; right = 0x8; middle = 0x20 }
  $up = @{ left = 0x4; right = 0x10; middle = 0x40 }
  switch ($a.op) {
    'info' { Emit @{ ok = $true; info = @{ width = $w; height = $h; cursor = @{ x = [CU]::CursorX(); y = [CU]::CursorY() }; sessionId = $sessionId } } ; exit 0 }
    'shot' {
      $bmp = New-Object System.Drawing.Bitmap($w, $h)
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $g.CopyFromScreen(0, 0, 0, 0, $bmp.Size)
      $bmp.Save([string]$a.path, [System.Drawing.Imaging.ImageFormat]::Png)
      $g.Dispose(); $bmp.Dispose()
      Emit @{ ok = $true; width = $w; height = $h }; exit 0
    }
    'tree' {
      Add-Type -AssemblyName UIAutomationClient
      Add-Type -AssemblyName UIAutomationTypes
      $deadline = [DateTime]::UtcNow.AddMilliseconds([int]$a.budgetMs)
      $maxNodes = [int]$a.maxNodes
      $maxDepth = [int]$a.maxDepth
      $hwnd = [CU]::Foreground()
      if ($hwnd -eq 0) { Emit @{ ok = $true; app = ''; window = ''; truncated = $false; nodes = @() }; exit 0 }
      $root = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$hwnd)
      function Clip([string]$t) { if ($t.Length -gt 200) { return $t.Substring(0, 200) } return $t }
      function Read-Node($el, [int]$depth) {
        $n = [ordered]@{ depth = $depth }
        try {
          $cur = $el.Current
          $n.role = [string]($cur.ControlType.ProgrammaticName -replace '^ControlType\.', '')
          $secure = $false
          try { $secure = [bool]$cur.IsPassword } catch { $secure = $true }
          $name = Clip ([string]$cur.Name)
          if ($name) { $n.name = $name }
          if ($secure) { $n.secure = $true } else {
            $p = $null
            try {
              if ($el.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$p)) {
                $v = Clip ([string]$p.Current.Value)
                if ($v) { $n.value = $v }
              }
            } catch { }
          }
          $r = $cur.BoundingRectangle
          if (-not $r.IsEmpty -and -not [double]::IsInfinity($r.X) -and -not [double]::IsInfinity($r.Y) -and -not [double]::IsInfinity($r.Width) -and -not [double]::IsInfinity($r.Height)) {
            $n.x = [int][Math]::Round($r.X); $n.y = [int][Math]::Round($r.Y); $n.width = [int][Math]::Round($r.Width); $n.height = [int][Math]::Round($r.Height)
          }
          $n.enabled = [bool]$cur.IsEnabled
          $n.focused = [bool]$cur.HasKeyboardFocus
        } catch { return $null }
        return $n
      }
      $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
      $nodes = New-Object System.Collections.Generic.List[object]
      $truncated = $false
      $visited = 0
      $maxVisit = [Math]::Min($maxNodes * 6, 6000)
      $stack = New-Object System.Collections.Generic.Stack[object]
      $stack.Push(@($root, 0))
      while ($stack.Count -gt 0) {
        if ([DateTime]::UtcNow -gt $deadline -or $visited -ge $maxVisit -or $nodes.Count -ge $maxNodes) { $truncated = $true; break }
        $item = $stack.Pop()
        $el = $item[0]; $depth = [int]$item[1]
        $visited++
        $node = Read-Node $el $depth
        if ($null -ne $node -and ($node.Contains('x') -or $node.Contains('name'))) { $nodes.Add($node) }
        $kids = New-Object System.Collections.Generic.List[object]
        try {
          $c = $walker.GetFirstChild($el)
          while ($null -ne $c -and $kids.Count -lt 500) { $kids.Add($c); $c = $walker.GetNextSibling($c) }
          if ($null -ne $c) { $truncated = $true }
        } catch { }
        if ($depth -ge $maxDepth) { if ($kids.Count -gt 0) { $truncated = $true }; continue }
        for ($i = $kids.Count - 1; $i -ge 0; $i--) { $stack.Push(@($kids[$i], ($depth + 1))) }
      }
      $app = ''
      try { $app = Clip ([System.Diagnostics.Process]::GetProcessById([int]$root.Current.ProcessId).ProcessName) } catch { }
      $title = ''
      try { $title = Clip ([string]$root.Current.Name) } catch { }
      Emit @{ ok = $true; app = $app; window = $title; truncated = $truncated; nodes = $nodes }
      exit 0
    }
    'move' { [CU]::MoveTo([int]$a.x, [int]$a.y) }
    'click' {
      [CU]::MoveTo([int]$a.x, [int]$a.y)
      for ($i = 0; $i -lt [int]$a.count; $i++) {
        [CU]::Mouse([uint32]$down[[string]$a.button], 0); Start-Sleep -Milliseconds 20
        [CU]::Mouse([uint32]$up[[string]$a.button], 0); Start-Sleep -Milliseconds 40
      }
    }
    'drag' {
      [CU]::MoveTo([int]$a.fromX, [int]$a.fromY); Start-Sleep -Milliseconds 50
      [CU]::Mouse([uint32]$down[[string]$a.button], 0); Start-Sleep -Milliseconds 50
      for ($s = 1; $s -le 12; $s++) {
        [CU]::MoveTo([int]($a.fromX + ($a.toX - $a.fromX) * $s / 12), [int]($a.fromY + ($a.toY - $a.fromY) * $s / 12)); Start-Sleep -Milliseconds 15
      }
      Start-Sleep -Milliseconds 50
      [CU]::Mouse([uint32]$up[[string]$a.button], 0)
    }
    'scroll' {
      [CU]::MoveTo([int]$a.x, [int]$a.y); Start-Sleep -Milliseconds 30
      if ([int]$a.deltaY -ne 0) { [CU]::Mouse(0x0800, [int](-120 * [int]$a.deltaY)) }
      if ([int]$a.deltaX -ne 0) { [CU]::Mouse(0x1000, [int](120 * [int]$a.deltaX)) }
    }
    'keys' {
      foreach ($step in $a.steps) {
        if ($null -ne $step.text) {
          foreach ($ch in $step.text.ToCharArray()) { [CU]::Unit([uint16][char]$ch, $false); [CU]::Unit([uint16][char]$ch, $true); Start-Sleep -Milliseconds 4 }
        } else {
          foreach ($m in @($step.modifiers)) { [CU]::Key([uint16]$m, $false, $false) }
          [CU]::Key([uint16]$step.vk, $false, [bool]$step.ext); [CU]::Key([uint16]$step.vk, $true, [bool]$step.ext)
          foreach ($m in @($step.modifiers)) { [CU]::Key([uint16]$m, $true, $false) }
          Start-Sleep -Milliseconds 8
        }
      }
    }
    default { Emit @{ ok = $false; code = 'invalid_arguments'; message = 'unknown op' }; exit 0 }
  }
  Emit @{ ok = $true }
} catch {
  Emit @{ ok = $false; code = 'command_failed'; message = $_.Exception.Message }
}
`;

/** Pure: the powershell invocation (fixed script, payload on stdin as base64 JSON). */
function buildPowershellCommand(payload) {
  return {
    file: 'powershell.exe',
    args: ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(POWERSHELL_SOURCE, 'utf16le').toString('base64')],
    input: Buffer.from(JSON.stringify(payload), 'utf8').toString('base64'),
  };
}

function create(deps = {}) {
  const run = deps.runProcess ?? runProcess;
  const fsx = deps.fs ?? fs;
  const tmpdir = deps.tmpdir ?? os.tmpdir();
  const helper = async (payload, limits = {}) => {
    const command = buildPowershellCommand(payload);
    const result = await run(command.file, command.args, { input: command.input, timeoutMs: limits.timeoutMs ?? 30_000, maxBytes: limits.maxBytes ?? 1024 * 1024 });
    if (result.timedOut) throw new DriverError('command_failed', 'powershell timed out');
    const parsed = parseLastJson(result.stdout);
    if (!parsed) throw new DriverError('command_failed', `powershell failed: ${(result.stderr || result.stdout).trim().slice(0, 300)}`);
    if (!parsed.ok) throw new DriverError(parsed.code || 'command_failed', parsed.message || 'powershell failed');
    return parsed;
  };
  return {
    async status() {
      let session;
      try { session = (await helper({ op: 'session' })).sessionId; } catch (error) {
        const reason = `cannot query the Windows session: ${error.message}`;
        return { platform: 'win32', session: 'unknown', screen: { available: false, reason }, input: { available: false, reason }, uiTree: { available: false, reason } };
      }
      if (session === 0) {
        const entry = { available: false, reason: 'running in session 0 (a service); there is no interactive desktop', hint: 'Start the ADHDev daemon from a logged-in user session' };
        return { platform: 'win32', session: 'session0', screen: entry, input: { ...entry }, uiTree: { ...entry } };
      }
      return { platform: 'win32', session: 'console', screen: { available: true }, input: { available: true }, uiTree: { available: true } };
    },
    async screenInfo() {
      const { info } = await helper({ op: 'info' });
      return { width: info.width, height: info.height, cursor: info.cursor };
    },
    async screenshot() {
      const dir = fsx.mkdtempSync(path.join(tmpdir, 'adhdev-cu-'));
      try {
        const file = path.join(dir, 'shot.png');
        await helper({ op: 'shot', path: file });
        const png = fsx.readFileSync(file);
        const size = pngSize(png);
        if (!size) throw new DriverError('command_failed', 'screen capture did not produce a PNG');
        return { png, width: size.width, height: size.height };
      } finally {
        fsx.rmSync(dir, { recursive: true, force: true });
      }
    },
    async uiTree({ maxDepth, maxNodes }) {
      const result = await helper({ op: 'tree', maxDepth, maxNodes, budgetMs: UI_TREE_BUDGET_MS }, { timeoutMs: UI_TREE_PROCESS_TIMEOUT_MS, maxBytes: UI_TREE_MAX_BYTES });
      return { app: result.app, window: result.window, truncated: result.truncated === true, nodes: Array.isArray(result.nodes) ? result.nodes : [] };
    },
    async mouseMove({ x, y }) { await helper({ op: 'move', x, y }); },
    async click({ x, y, button = 'left', count = 1 }) { await helper({ op: 'click', x, y, button, count }); },
    async drag({ fromX, fromY, toX, toY, button = 'left' }) { await helper({ op: 'drag', fromX, fromY, toX, toY, button }); },
    async scroll({ x, y, deltaX = 0, deltaY = 0 }) { await helper({ op: 'scroll', x, y, deltaX, deltaY }); },
    async typeText({ text }) { await helper({ op: 'keys', steps: typeSteps(text) }); },
    async pressKey({ key, modifiers }) { await helper({ op: 'keys', steps: [resolveKey(key, modifiers)] }); },
  };
}

module.exports = { UI_TREE_BUDGET_MS, create, resolveKey, typeSteps, buildPowershellCommand, POWERSHELL_SOURCE };
