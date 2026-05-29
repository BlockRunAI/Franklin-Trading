/**
 * Generic OAuth client provider for hosted (HTTP) MCP servers.
 *
 * Implements the MCP SDK's `OAuthClientProvider` against a terminal app:
 * tokens, the dynamically-registered client, and the PKCE code verifier are
 * persisted to `~/.blockrun/mcp-auth/<server>.json` (0600). Authorization uses
 * the OS browser plus a loopback redirect listener to capture the auth code.
 *
 * Nothing here is Base-specific — any hosted MCP doing Dynamic Client
 * Registration + PKCE + authorization-code (e.g. https://mcp.base.org) works.
 * The SDK performs discovery, registration, token exchange and refresh; this
 * class only supplies the storage + browser/loopback plumbing a CLI needs.
 *
 * Startup safety: when constructed non-interactively (the path used by
 * `connectMcpServers` at `franklin start`), `redirectToAuthorization` throws
 * instead of opening a browser, so a not-yet-authorized server can never pop a
 * browser tab mid-launch. The interactive flow only runs from `franklin mcp`.
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientMetadata,
  OAuthTokens,
  OAuthClientInformationMixed,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { BLOCKRUN_DIR } from '../config.js';

const AUTH_DIR = path.join(BLOCKRUN_DIR, 'mcp-auth');
const PREFERRED_PORT = 8404;
const CALLBACK_PATH = '/callback';
const CALLBACK_TIMEOUT_MS = 120_000;

interface StoredAuth {
  tokens?: OAuthTokens;
  clientInformation?: OAuthClientInformationMixed;
  codeVerifier?: string;
}

export interface OAuthProviderOptions {
  /** Interactive flows (franklin mcp) may open a browser; startup must not. */
  interactive?: boolean;
  /** Called with the authorization URL in interactive mode (open a browser). */
  onAuthorizationUrl?: (url: URL) => void;
}

/** Path to the persisted auth blob for a given server name. */
export function authFilePath(serverName: string): string {
  return path.join(AUTH_DIR, `${serverName}.json`);
}

/**
 * Does a usable access token exist for this server? Used as the startup gate
 * in loadMcpConfig — a token-less http server is auto-disabled so it is
 * silently skipped (never pops a browser, never hangs the agent boot).
 */
export function hasStoredToken(serverName: string): boolean {
  try {
    const stored = JSON.parse(fs.readFileSync(authFilePath(serverName), 'utf-8')) as StoredAuth;
    return !!stored?.tokens?.access_token;
  } catch {
    return false;
  }
}

export class McpOAuthProvider implements OAuthClientProvider {
  readonly interactive: boolean;
  onAuthorizationUrl?: (url: URL) => void;

  private readonly file: string;
  private _port = PREFERRED_PORT;
  private _state?: string;
  private server?: http.Server;
  private callback?: Promise<{ code: string; state?: string }>;

  constructor(
    private readonly serverName: string,
    private readonly serverUrl: string,
    opts: OAuthProviderOptions = {},
  ) {
    void this.serverUrl; // retained for diagnostics / future per-server config
    this.file = authFilePath(serverName);
    this.interactive = opts.interactive ?? false;
    this.onAuthorizationUrl = opts.onAuthorizationUrl;
  }

  // ── persistence ──────────────────────────────────────────────────────────
  private read(): StoredAuth {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf-8')) as StoredAuth;
    } catch {
      return {};
    }
  }

  private persist(next: StoredAuth): void {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
  }

  // ── OAuthClientProvider ────────────────────────────────────────────────────
  get redirectUrl(): string {
    return `http://127.0.0.1:${this._port}${CALLBACK_PATH}`;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'Franklin Trading',
      redirect_uris: [this.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      // Public CLI client — no client secret; PKCE protects the exchange.
      token_endpoint_auth_method: 'none',
      // Base advertises agent_wallet:transact / :escalate. Request transact so
      // the issued token can prepare/sign transactions, not just read.
      scope: 'agent_wallet:transact',
    };
  }

  state(): string {
    if (!this._state) this._state = randomBytes(16).toString('hex');
    return this._state;
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    return this.read().clientInformation;
  }

  saveClientInformation(info: OAuthClientInformationMixed): void {
    this.persist({ ...this.read(), clientInformation: info });
  }

  tokens(): OAuthTokens | undefined {
    return this.read().tokens;
  }

  saveTokens(tokens: OAuthTokens): void {
    // Called after both the initial exchange AND every silent refresh, so
    // refreshed tokens auto-persist. The code verifier is single-use — drop it.
    const cur = this.read();
    delete cur.codeVerifier;
    this.persist({ ...cur, tokens });
  }

  saveCodeVerifier(verifier: string): void {
    this.persist({ ...this.read(), codeVerifier: verifier });
  }

  codeVerifier(): string {
    const v = this.read().codeVerifier;
    if (!v) throw new Error('missing PKCE code verifier — restart authorization');
    return v;
  }

  redirectToAuthorization(url: URL): void {
    if (!this.interactive) {
      // Never open a browser during `franklin start`. The startup token-gate
      // (loadMcpConfig) should prevent reaching here; throwing keeps it a clean
      // one-line skip in connectMcpServers rather than a hang or a browser pop.
      throw new Error(
        `MCP server "${this.serverName}" needs authorization — run: franklin mcp login ${this.serverName}`,
      );
    }
    this.onAuthorizationUrl?.(url);
  }

  /** Clear stored credentials so the next login starts clean. */
  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier'): void {
    if (scope === 'all') {
      try { fs.rmSync(this.file, { force: true }); } catch { /* ignore */ }
      return;
    }
    const cur = this.read();
    if (scope === 'client') delete cur.clientInformation;
    if (scope === 'tokens') delete cur.tokens;
    if (scope === 'verifier') delete cur.codeVerifier;
    this.persist(cur);
  }

  // ── interactive loopback (only used by `franklin mcp`) ─────────────────────
  /**
   * Bind the loopback redirect listener and fix `redirectUrl`'s port BEFORE the
   * connect attempt, so Dynamic Client Registration registers the right URI.
   * Tries a stable port first, then an ephemeral one if it's taken.
   */
  async startLoopback(): Promise<void> {
    const tryListen = (port: number) =>
      new Promise<http.Server>((resolve, reject) => {
        const server = http.createServer();
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => resolve(server));
      });

    let server: http.Server;
    try {
      server = await tryListen(PREFERRED_PORT);
      this._port = PREFERRED_PORT;
    } catch {
      server = await tryListen(0); // ephemeral — handles "port already in use"
      this._port = (server.address() as { port: number }).port;
    }
    this.server = server;

    this.callback = new Promise<{ code: string; state?: string }>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.stopLoopback();
        reject(new Error('authorization timed out (no redirect within 120s)'));
      }, CALLBACK_TIMEOUT_MS);

      server.on('request', (req, res) => {
        const u = new URL(req.url || '/', `http://127.0.0.1:${this._port}`);
        if (u.pathname !== CALLBACK_PATH) {
          res.writeHead(404).end('Not found');
          return;
        }
        const code = u.searchParams.get('code') || undefined;
        const state = u.searchParams.get('state') || undefined;
        const error = u.searchParams.get('error') || undefined;
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(callbackHtml(error));
        clearTimeout(timer);
        if (error) reject(new Error(`authorization denied: ${error}`));
        else if (!code) reject(new Error('authorization response missing code'));
        else resolve({ code, state });
      });
    });
  }

  /** Await the captured authorization code (after the browser redirect). */
  async waitForCallback(): Promise<{ code: string; state?: string }> {
    if (!this.callback) throw new Error('loopback not started');
    try {
      const result = await this.callback;
      if (this._state && result.state && result.state !== this._state) {
        throw new Error('OAuth state mismatch — possible CSRF, aborting');
      }
      return result;
    } finally {
      this.stopLoopback();
    }
  }

  stopLoopback(): void {
    try { this.server?.close(); } catch { /* ignore */ }
    this.server = undefined;
  }
}

function callbackHtml(error?: string): string {
  const msg = error
    ? `Authorization failed: ${error}`
    : 'Authorization complete — you can close this tab and return to your terminal.';
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<title>Franklin × MCP</title></head>' +
    '<body style="font-family:system-ui;text-align:center;padding:3rem;background:#0a0a0a;color:#eee">' +
    `<h2>${msg}</h2></body></html>`
  );
}

/** Open a URL in the system browser. Returns false if it couldn't be launched. */
export function openUrl(url: string): boolean {
  try {
    const cmd =
      process.platform === 'darwin' ? 'open' :
      process.platform === 'win32' ? 'cmd' :
      'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => { /* swallow — caller prints the URL as fallback */ });
    child.unref();
    return true;
  } catch {
    return false;
  }
}
