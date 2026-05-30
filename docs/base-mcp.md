# Base MCP — onchain actions for Franklin

Franklin connects to the **official hosted Base MCP server** (`https://mcp.base.org`),
giving the agent first-class onchain Base capabilities:

- View your address, balances, and activity
- Prepare and sign transactions (you approve each write in your Base Account)
- Swap tokens, batched contract calls
- Pay x402-enabled APIs with USDC on Base / Base Sepolia
- Works across Base + 6 other mainnets (Arbitrum, Optimism, Polygon, BNB, Avalanche, Ethereum)

Tools surface to the agent as `mcp__base__*`.

> **Wallet note.** Base MCP uses **your Base Account**, authorized via OAuth in your
> browser — it is a *different account* from the private-key wallet Franklin uses for
> its own x402 micropayments (e.g. `get_wallets` returns a Base Account address like
> `0xf0b7…`, not Franklin's `0xCC8c…` payment wallet).

## Authorization & autonomy (read this)

There are two separate things, don't conflate them:

1. **Connection authorization** — the one-time browser OAuth you do in `franklin mcp add base`.
   It is stored and auto-refreshed, so you authorize the *connection* once.
2. **Per-spend authorization** — **every write** (`send`, `swap`, `sign`, `send_calls`)
   and **every x402 payment** still requires a **fresh approval + wallet signature** in
   your Base Account. Base MCP today exposes **only "approval mode"** — there is no
   "approve a budget once, then spend autonomously" mode (Base docs: *"a single execution
   mode for write tools: approval mode"*; x402: *"each paid request still requires approval
   and a wallet signature"*).

**Implication for Franklin's autonomy.** Franklin's *autonomous* spending (paying for LLM
calls / APIs over x402) runs on **Franklin's own private-key wallet** — no per-call prompt.
**Base MCP is not autonomous**: it is best used for **reads** (balances, portfolio, history)
and **human-confirmed / larger onchain actions**. Do not route Franklin's high-frequency
autonomous spend through Base MCP — keep that on Franklin's own wallet.

## Using it in a session

Once `franklin start` has the Base tools loaded (`/mcp` lists them), just talk to the agent
in natural language — it auto-selects the matching `mcp__base__*` tool (Franklin activates
MCP tools on demand, so the agent may `ActivateTool` first, then call it):

- **Reads** return immediately, no approval:
  - "show my Base wallets" → `mcp__base__get_wallets`
  - "what's my Base portfolio / balances" → `mcp__base__get_portfolio`
  - "show my recent Base transactions" → `mcp__base__get_transaction_history`
- **Writes** return an **approval link + `requestId`** instead of executing:
  - "send 5 USDC to 0x…" / "swap 10 USDC for ETH on Base" → `mcp__base__send` / `swap`
  - Open the link, review and **sign in your Base Account**, then the agent confirms with
    `mcp__base__get_request_status`.
- **x402 payments**: `initiate_x402_request` → approve + sign → `complete_x402_request`.

## Setup (one command)

```bash
franklin mcp add base
```

This:
1. Saves the server to `~/.blockrun/mcp.json` (`{ "transport": "http", "url": "https://mcp.base.org" }`).
2. Opens your browser to authorize with your Base Account (OAuth + PKCE; the client is
   registered dynamically — no API key to copy).
3. Captures the redirect on a local loopback, stores the token at
   `~/.blockrun/mcp-auth/base.json` (mode `0600`), and verifies the connection.

Then start Franklin — the Base tools load automatically:

```bash
franklin start
# in-session: ask "show me my wallets" to confirm
```

## How it behaves at startup

- A configured Base server with a **stored token** connects silently; expired access
  tokens are refreshed automatically via the refresh token.
- A configured Base server with **no token** is auto-disabled and skipped at startup —
  it will never pop a browser mid-launch. Run `franklin mcp login base` to authorize.

## Commands

| Command | What it does |
|---|---|
| `franklin mcp list` | Show configured servers + auth status, and catalog entries you can add |
| `franklin mcp add base` | Save the Base entry and run the OAuth login |
| `franklin mcp login base` | Re-authorize (e.g. after a token was revoked) |
| `franklin mcp remove base` | Remove the server and delete its stored token |
| `franklin mcp add <name> --url <url>` | Add any hosted MCP server (generic HTTP+OAuth) |
| `franklin mcp login base --no-browser` | Headless: print the auth URL, paste the redirect URL back |

`/mcp` inside a session and `franklin doctor` both report Base connection/auth status.

## Troubleshooting

- **"needs authorization" at startup** — run `franklin mcp login base`.
- **Browser didn't open** — the URL is printed; open it manually, or use `--no-browser`.
- **Port 8404 in use** — Franklin falls back to an ephemeral loopback port automatically.
- **Authorization stuck** — re-run; the loopback listener times out after 120s.

The transport + OAuth layer is generic, so any hosted MCP server that supports Dynamic
Client Registration + PKCE works via `franklin mcp add <name> --url <url>`.
