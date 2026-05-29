/**
 * `franklin mcp <action> [name]` — manage MCP servers, especially hosted
 * (HTTP + OAuth) ones like Base MCP that need an interactive browser login.
 *
 *   franklin mcp list                 # configured servers + catalog + auth status
 *   franklin mcp add base             # save the catalog entry, then OAuth login
 *   franklin mcp login base           # (re-)authorize an already-added server
 *   franklin mcp remove base          # drop the server + delete its stored token
 *
 * Flags: --url <url> (login/add a non-catalog server), --no-browser (print the
 * auth URL + paste the redirect URL instead of opening a browser — headless).
 *
 * Note: this is a top-level command (NOT `franklin base setup`) because `base`
 * is intercepted as a payment-chain shortcut in src/index.ts.
 */

import fs from 'node:fs';
import readline from 'node:readline';
import chalk from 'chalk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { McpOAuthProvider, openUrl, authFilePath, hasStoredToken } from '../mcp/oauth.js';
import {
  loadMcpConfig,
  saveMcpServer,
  removeMcpServer,
  KNOWN_HTTP_SERVERS,
} from '../mcp/config.js';
import type { McpServerConfig } from '../mcp/client.js';

export interface McpCommandOptions {
  url?: string;
  /** commander maps --no-browser to { browser: false } (default true). */
  browser?: boolean;
}

export async function mcpCommand(
  action: string,
  name?: string,
  opts: McpCommandOptions = {},
): Promise<void> {
  switch (action) {
    case 'list':
    case 'ls':
      listAction();
      return;
    case 'add':
      await loginAction(name, opts, /* save */ true);
      return;
    case 'login':
      await loginAction(name, opts, /* save */ false);
      return;
    case 'remove':
    case 'rm':
    case 'logout':
      removeAction(name);
      return;
    default:
      console.error(
        chalk.red(`Unknown action "${action}".`) +
          '\n  Usage: franklin mcp list | add <name> | login <name> | remove <name>',
      );
      process.exitCode = 1;
  }
}

function listAction(): void {
  const { mcpServers } = loadMcpConfig(process.cwd());
  const names = Object.keys(mcpServers);

  if (names.length === 0) {
    console.log(chalk.dim('No MCP servers configured.'));
  } else {
    console.log(chalk.bold('Configured MCP servers:'));
    for (const name of names) {
      const s = mcpServers[name];
      const transport = s.transport === 'http' ? 'http' : 'stdio';
      let status = '';
      if (s.transport === 'http') {
        status = hasStoredToken(name)
          ? chalk.green(' ✓ authorized')
          : chalk.yellow(` ⚠ not logged in — franklin mcp login ${name}`);
      } else if (s.disabled) {
        status = chalk.yellow(' (disabled — missing credentials)');
      }
      console.log(`  ${chalk.cyan(name)} ${chalk.dim(`(${transport})`)} ${s.label ?? ''}${status}`);
    }
  }

  // Advertise catalog entries that aren't configured yet.
  const available = Object.values(KNOWN_HTTP_SERVERS).filter((k) => !names.includes(k.name));
  if (available.length > 0) {
    console.log('\n' + chalk.bold('Available (not added):'));
    for (const k of available) {
      console.log(`  ${chalk.cyan(k.label)} — ${chalk.dim(`franklin mcp add ${k.name}`)}`);
      console.log(`    ${chalk.dim(k.description)}`);
    }
  }
}

async function loginAction(
  name: string | undefined,
  opts: McpCommandOptions,
  save: boolean,
): Promise<void> {
  if (!name) {
    console.error(chalk.red('Missing server name. Example: franklin mcp add base'));
    process.exitCode = 1;
    return;
  }

  const known = KNOWN_HTTP_SERVERS[name];
  const url = opts.url || known?.url;
  if (!url) {
    console.error(
      chalk.red(`Unknown server "${name}".`) +
        ` Pass a URL: franklin mcp add ${name} --url https://…`,
    );
    process.exitCode = 1;
    return;
  }
  const label = known?.label || name;

  if (save) {
    saveMcpServer(name, { transport: 'http', url, label } as McpServerConfig);
    console.log(chalk.dim(`  Saved ${name} → ${url}`));
  }

  const useBrowser = opts.browser !== false;
  let manualUrl: URL | undefined;

  const provider = new McpOAuthProvider(name, url, {
    interactive: true,
    onAuthorizationUrl: (authUrl) => {
      manualUrl = authUrl;
      if (useBrowser && openUrl(authUrl.toString())) {
        console.log(chalk.dim('  Opened your browser to authorize…'));
        console.log(chalk.dim('  If it did not open, visit:\n    ') + authUrl.toString());
      } else {
        console.log('  Open this URL to authorize:\n    ' + chalk.cyan(authUrl.toString()));
      }
    },
  });

  await provider.startLoopback();
  const transport = new StreamableHTTPClientTransport(new URL(url), { authProvider: provider });
  const client = new Client({ name: `franklin-mcp-${name}`, version: '1.0.0' }, { capabilities: {} });

  try {
    // First connect: with no token the SDK fires redirectToAuthorization (opens
    // the browser) then throws UnauthorizedError. If a valid token already
    // exists this succeeds outright.
    await client.connect(transport);
  } catch (err) {
    if (!(err instanceof UnauthorizedError)) {
      provider.stopLoopback();
      throw err;
    }

    let code: string;
    if (useBrowser) {
      console.log(chalk.dim('  Waiting for authorization…'));
      ({ code } = await provider.waitForCallback());
    } else {
      // Headless: user pastes the full redirect URL they landed on.
      provider.stopLoopback();
      code = await promptForCode(manualUrl);
    }
    await transport.finishAuth(code);
    await client.close().catch(() => {});

    // Reconnect with a fresh transport now that tokens are stored.
    const verifyProvider = new McpOAuthProvider(name, url, { interactive: false });
    const verifyTransport = new StreamableHTTPClientTransport(new URL(url), { authProvider: verifyProvider });
    const verifyClient = new Client({ name: `franklin-mcp-${name}`, version: '1.0.0' }, { capabilities: {} });
    await verifyClient.connect(verifyTransport);
    const { tools } = await verifyClient.listTools();
    await verifyClient.close().catch(() => {});
    console.log(
      chalk.green(`✓ ${label} connected — ${tools.length} tools available as `) +
        chalk.cyan(`mcp__${name}__*`),
    );
    console.log(chalk.dim('  Run `franklin start` to use them.'));
    return;
  }

  // Already authorized.
  const { tools } = await client.listTools();
  await client.close().catch(() => {});
  console.log(
    chalk.green(`✓ ${label} already authorized — ${tools.length} tools (`) +
      chalk.cyan(`mcp__${name}__*`) + chalk.green(')'),
  );
}

function removeAction(name: string | undefined): void {
  if (!name) {
    console.error(chalk.red('Missing server name. Example: franklin mcp remove base'));
    process.exitCode = 1;
    return;
  }
  const removed = removeMcpServer(name);
  try { fs.rmSync(authFilePath(name), { force: true }); } catch { /* ignore */ }
  console.log(
    removed
      ? chalk.green(`✓ Removed ${name} and cleared its stored credentials.`)
      : chalk.yellow(`${name} was not configured (cleared any stored credentials anyway).`),
  );
}

/** Headless fallback: ask the user to paste the redirect URL and extract ?code=. */
function promptForCode(authUrl?: URL): Promise<string> {
  if (authUrl) {
    console.log('\n  Open this URL in any browser, approve, then copy the URL it redirects to:');
    console.log('    ' + chalk.cyan(authUrl.toString()));
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve, reject) => {
    rl.question('\n  Paste the redirect URL (or just the code): ', (answer) => {
      rl.close();
      const trimmed = answer.trim();
      if (!trimmed) { reject(new Error('no code provided')); return; }
      try {
        const code = new URL(trimmed).searchParams.get('code');
        resolve(code || trimmed);
      } catch {
        resolve(trimmed); // they pasted the bare code
      }
    });
  });
}
