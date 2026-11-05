'use strict';
// Tool table and argument validation. The input schemas in ../schemas are the single source:
// the daemon validates against them before calling, and this module validates again.
const fs = require('node:fs');
const path = require('node:path');
const { DriverError } = require('./run.js');
const { shellRun } = require('./shell.js');

const SCHEMA_DIR = path.join(__dirname, '..', 'schemas');
const loadSchema = (name) => JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, `${name}.input.json`), 'utf8'));

/** Validate `value` against the subset of JSON Schema the package schemas use. Returns an error string or null. */
function validate(schema, value, at = 'arguments') {
  const type = schema.type;
  if (type === 'object') {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return `${at} must be an object`;
    const props = schema.properties ?? {};
    for (const key of Object.keys(value)) {
      if (!(key in props)) return `${at} has an unexpected property: ${key}`;
    }
    for (const key of schema.required ?? []) {
      if (value[key] === undefined) return `${at} is missing required property: ${key}`;
    }
    for (const [key, sub] of Object.entries(props)) {
      if (value[key] !== undefined) {
        const error = validate(sub, value[key], key);
        if (error) return error;
      }
    }
    return null;
  }
  if (type === 'integer') {
    if (!Number.isInteger(value)) return `${at} must be an integer`;
    if (schema.minimum !== undefined && value < schema.minimum) return `${at} must be >= ${schema.minimum}`;
    if (schema.maximum !== undefined && value > schema.maximum) return `${at} must be <= ${schema.maximum}`;
    return null;
  }
  if (type === 'string') {
    if (typeof value !== 'string') return `${at} must be a string`;
    const length = Array.from(value).length;
    if (schema.minLength !== undefined && length < schema.minLength) return `${at} must have at least ${schema.minLength} characters`;
    if (schema.maxLength !== undefined && length > schema.maxLength) return `${at} must have at most ${schema.maxLength} characters`;
    if (schema.enum && !schema.enum.includes(value)) return `${at} must be one of ${schema.enum.join(', ')}`;
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) return `${at} has an invalid value`;
    return null;
  }
  if (type === 'array') {
    if (!Array.isArray(value)) return `${at} must be an array`;
    if (schema.maxItems !== undefined && value.length > schema.maxItems) return `${at} has too many items`;
    if (schema.uniqueItems && new Set(value).size !== value.length) return `${at} items must be unique`;
    for (const item of value) {
      const error = validate(schema.items ?? {}, item, `${at} item`);
      if (error) return error;
    }
    return null;
  }
  return null;
}

const text = (value) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] });
const ok = () => text({ ok: true });

async function checkPoints(ctx, points) {
  const { width, height } = await ctx.backend.screenInfo();
  for (const [x, y] of points) {
    if (x >= width || y >= height) throw new DriverError('invalid_arguments', `coordinates (${x}, ${y}) are outside the ${width}x${height} screen`);
  }
}

// grant: which owner permission the daemon enforces; the same mapping is in provider.v1.json.
const DEFINITIONS = [
  {
    name: 'status', grant: null,
    description: 'Report the platform, session kind and which of screen/input/shell can work, with a reason and a hint when not. Call this first.',
    async run(_args, ctx) {
      const s = await ctx.backend.status();
      return text({ platform: s.platform, session: s.session, screen: s.screen, input: s.input, shell: { available: true } });
    },
  },
  {
    name: 'screenshot', grant: 'screen',
    description: 'Capture the main display as a PNG. Pixel coordinates in the image are the coordinates every input tool uses.',
    async run(_args, ctx) {
      const shot = await ctx.backend.screenshot();
      return {
        content: [
          { type: 'image', data: Buffer.from(shot.png).toString('base64'), mimeType: 'image/png' },
          { type: 'text', text: JSON.stringify({ width: shot.width, height: shot.height }) },
        ],
      };
    },
  },
  {
    name: 'screen_info', grant: 'screen',
    description: 'Main display size in pixels (same scale as screenshots) and the cursor position.',
    async run(_args, ctx) {
      const { width, height, cursor } = await ctx.backend.screenInfo();
      return text({ width, height, cursor });
    },
  },
  {
    name: 'mouse_move', grant: 'input',
    description: 'Move the mouse pointer to x,y (screenshot pixel coordinates).',
    async run(args, ctx) { await checkPoints(ctx, [[args.x, args.y]]); await ctx.backend.mouseMove(args); return ok(); },
  },
  {
    name: 'click', grant: 'input',
    description: 'Click at x,y. button left|right|middle (default left); count 1..3 for double or triple click (default 1).',
    async run(args, ctx) {
      await checkPoints(ctx, [[args.x, args.y]]);
      await ctx.backend.click({ button: 'left', count: 1, ...args });
      return ok();
    },
  },
  {
    name: 'drag', grant: 'input',
    description: 'Press at fromX,fromY, move to toX,toY and release. button defaults to left.',
    async run(args, ctx) {
      await checkPoints(ctx, [[args.fromX, args.fromY], [args.toX, args.toY]]);
      await ctx.backend.drag({ button: 'left', ...args });
      return ok();
    },
  },
  {
    name: 'scroll', grant: 'input',
    description: 'Scroll at x,y by lines (-100..100). Positive deltaY scrolls down, positive deltaX scrolls right.',
    async run(args, ctx) {
      if (!args.deltaX && !args.deltaY) throw new DriverError('invalid_arguments', 'deltaX or deltaY must be non-zero');
      await checkPoints(ctx, [[args.x, args.y]]);
      await ctx.backend.scroll({ deltaX: 0, deltaY: 0, ...args });
      return ok();
    },
  },
  {
    name: 'type_text', grant: 'input',
    description: 'Type text (1..10000 characters, unicode) into the focused control. Line breaks press Enter.',
    async run(args, ctx) { await ctx.backend.typeText(args); return ok(); },
  },
  {
    name: 'press_key', grant: 'input',
    description: 'Press one key (enter tab escape backspace delete space up down left right home end pageup pagedown f1..f12 or a single character) with optional modifiers cmd, ctrl, alt, shift.',
    async run(args, ctx) { await ctx.backend.pressKey({ modifiers: [], ...args }); return ok(); },
  },
  {
    name: 'shell_run', grant: 'shell',
    description: 'Run a command line with the daemon user\'s shell. cwd defaults to the home directory; timeoutMs defaults to 60000 (max 300000). stdout and stderr are capped at 64 KiB each.',
    async run(args, ctx) { return text(await (ctx.shell ?? shellRun)(args)); },
  },
];

const TOOLS = DEFINITIONS.map((d) => ({ ...d, inputSchema: loadSchema(d.name) }));
const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));
// Desktop tools share one display and one pointer, so they run one at a time; shell does not.
const SERIAL = (tool) => tool.name !== 'shell_run' && tool.name !== 'status';

function toolList() {
  return TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
}

function errorResult(error) {
  const code = error instanceof DriverError ? error.code : 'command_failed';
  const message = error instanceof Error ? error.message : String(error);
  return { isError: true, content: [{ type: 'text', text: `${code}: ${message}` }] };
}

/** Validate and run one tool; always resolves to an MCP tool result. */
async function callTool(name, rawArgs, ctx) {
  const tool = BY_NAME.get(name);
  if (!tool) return errorResult(new DriverError('invalid_arguments', `unknown tool: ${String(name).slice(0, 100)}`));
  const args = rawArgs === undefined ? {} : rawArgs;
  const invalid = validate(tool.inputSchema, args);
  if (invalid) return errorResult(new DriverError('invalid_arguments', invalid));
  try {
    return await tool.run(args, ctx);
  } catch (error) {
    return errorResult(error);
  }
}

module.exports = { TOOLS, BY_NAME, SERIAL, toolList, callTool, validate, errorResult };
