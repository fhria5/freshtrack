// FreshTrack MCP server — read-only tools over the LIVE FreshTrack Worker.
//
// Exposes the real app backend (https://grokingstore.my.id/freshtrack-ai)
// to an MCP client (Kiro IDE / Kiro Web / any MCP host) over stdio.
// Every tool returns the Worker response as-is; on Worker failure it
// returns a structured error, never invented data.
//
// Run:  node server.mjs
// Requires: npm install (once) in this folder.
//
// Honest note: this server was written directly by the maintainer agent
// from the Kiro spec after the Kiro plan credits ran out (50/50, reset
// 1 Dec 2026) — it is a repo artifact, not something Kiro executed.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const WORKER_BASE = 'https://grokingstore.my.id/freshtrack-ai';
const FETCH_TIMEOUT_MS = 20000;

// Never log to stdout: stdio transport owns it. stderr only.
function log(...args) {
  console.error('[freshtrack-mcp]', ...args);
}

async function fetchJson(url, options) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { ...options, signal: ctrl.signal });
    let data = null;
    try {
      data = await resp.json();
    } catch {
      data = null;
    }
    return { status: resp.status, data };
  } finally {
    clearTimeout(timer);
  }
}

function textResult(obj, isError) {
  return {
    content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

const server = new McpServer({
  name: 'freshtrack',
  version: '1.0.0',
});

server.tool(
  'get_health',
  'Live health of the FreshTrack Worker (AI + KV sync status). No parameters.',
  {},
  async () => {
    try {
      const { status, data } = await fetchJson(WORKER_BASE + '/api/health');
      if (status !== 200) return textResult({ error: 'worker_error', status, body: data }, true);
      return textResult(data);
    } catch (err) {
      return textResult({ error: 'fetch_failed', message: String(err && err.message ? err.message : err) }, true);
    }
  },
);

server.tool(
  'get_recipe',
  'Ask the live AI (Verboo glm-5.3-flash, via the Worker) for a rescue recipe for one fridge item. mode "single" is one item, "tonight" plans a meal from the item.',
  {
    item: z.string().min(1).max(60).describe('Food item name, e.g. "Bananas"'),
    mode: z.enum(['single', 'tonight']).default('single').describe('Recipe mode'),
  },
  async ({ item, mode }) => {
    try {
      const { status, data } = await fetchJson(WORKER_BASE + '/api/recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredients: [item.trim()], mode }),
      });
      if (status !== 200) return textResult({ error: 'worker_error', status, body: data }, true);
      return textResult(data);
    } catch (err) {
      return textResult({ error: 'fetch_failed', message: String(err && err.message ? err.message : err) }, true);
    }
  },
);

server.tool(
  'get_pantry',
  'Fetch a shared household pantry from the live Worker KV store by its 6-character household code. Returns the stored pantry, device count and last update.',
  {
    code: z.string().min(6).max(6).describe('6-character household code, e.g. "ANNUYE"'),
  },
  async ({ code }) => {
    try {
      const { status, data } = await fetchJson(
        WORKER_BASE + '/api/pantry?code=' + encodeURIComponent(code.toUpperCase()),
      );
      if (status === 404) return textResult({ error: 'not_found', code: code.toUpperCase() }, true);
      if (status !== 200) return textResult({ error: 'worker_error', status, body: data }, true);
      return textResult(data);
    } catch (err) {
      return textResult({ error: 'fetch_failed', message: String(err && err.message ? err.message : err) }, true);
    }
  },
);

server.tool(
  'list_household_status',
  'Summarise a shared household from the live Worker KV store: device count, item count, item names and last update time. All values come from the stored pantry; nothing is invented.',
  {
    code: z.string().min(6).max(6).describe('6-character household code, e.g. "ANNUYE"'),
  },
  async ({ code }) => {
    try {
      const { status, data } = await fetchJson(
        WORKER_BASE + '/api/pantry?code=' + encodeURIComponent(code.toUpperCase()),
      );
      if (status === 404) return textResult({ error: 'not_found', code: code.toUpperCase() }, true);
      if (status !== 200) return textResult({ error: 'worker_error', status, body: data }, true);
      const pantry = data && data.pantry ? data.pantry : {};
      const values = Array.isArray(pantry) ? pantry : Object.keys(pantry).map((k) => pantry[k]);
      const names = values
        .map((v) => (v && v.name ? String(v.name) : null))
        .filter(Boolean)
        .slice(0, 10);
      return textResult({
        code: code.toUpperCase(),
        devices: data.devices,
        itemCount: values.length,
        itemNames: names,
        updatedAt: data.updatedAt,
        updatedAtISO: data.updatedAt ? new Date(data.updatedAt).toISOString() : null,
      });
    } catch (err) {
      return textResult({ error: 'fetch_failed', message: String(err && err.message ? err.message : err) }, true);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
log('FreshTrack MCP server running on stdio, Worker: ' + WORKER_BASE);
