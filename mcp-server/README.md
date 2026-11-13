# FreshTrack MCP Server

A small Model Context Protocol (MCP) server that exposes the **live**
FreshTrack Worker to an MCP host (Kiro IDE / Kiro Web / any MCP client)
over stdio. It is read-only: every tool calls the real Worker at
`https://grokingstore.my.id/freshtrack-ai` and returns the real response.
On Worker failure it returns a structured error — never invented data.

## Tools

| Tool | What it does |
|---|---|
| `get_health` | `GET /api/health` — Worker status (`ok`, `ai`, `sync`, `app`). |
| `get_recipe` | `POST /api/recipe` — real AI recipe (Verboo `glm-5.3-flash`) for one item. Params: `item` (string), `mode` (`single` \| `tonight`). |
| `get_pantry` | `GET /api/pantry?code=XXXXXX` — shared household pantry from Workers KV. Unknown code returns `{ error: "not_found" }`. |
| `list_household_status` | Same fetch as `get_pantry`, summarised: device count, item count, item names, last update. All values come from the stored pantry. |

## Run it

```sh
cd mcp-server
npm install   # once; installs @modelcontextprotocol/sdk + zod
node server.mjs
```

The server speaks MCP JSON-RPC over stdio. It never writes to stdout
except the protocol itself (logs go to stderr).

## Connect it from Kiro

This repo already ships the config: `.kiro/settings/mcp.json` registers
the server (command `node`, args `mcp-server/server.mjs`). In Kiro IDE
or Kiro Web, open the MCP settings and enable the `freshtrack` server.
The tools then appear to the agent exactly as listed above.

## Verified live

Driven with an SDK client over stdio (13 Nov 2026):

- `get_health` → `{ "ok": true, "ai": true, "sync": true, "app": "freshtrack-ai" }`
- `get_recipe` (Bananas, single) → `"Easy Banana Pancakes"`, `source: "ai"`
- `get_pantry` (code `ZZZZZZ`) → `{ "error": "not_found", "code": "ZZZZZZ" }` (tool error)

## Honest note

This server was written directly by the maintainer agent from the Kiro
spec after the Kiro plan credits ran out (50/50, reset 1 Dec 2026) and
the 4,000 bonus credits were proven not to work in Kiro CLI
(`MONTHLY_REQUEST_COUNT`). It is a repo artifact built from the spec —
not a server Kiro executed, and no MCP/PBT/custom-agent work here was
run by Kiro. The Devpost write-up says exactly that.
