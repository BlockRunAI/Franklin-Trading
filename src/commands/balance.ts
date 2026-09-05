import { accountMode, ACCOUNT_PORTAL, validateAccountConfig } from '../payments/account.js';
import chalk from 'chalk';
import { setupAgentWallet, setupAgentSolanaWallet } from '@blockrun/llm';
import { loadChain } from '../config.js';

export async function balanceCommand() {
  if (accountMode()) {
    validateAccountConfig();
    console.log(`Account API credits and usage: ${ACCOUNT_PORTAL}/dashboard`);
    console.log(chalk.dim('Transaction wallet:'));
  }
  const chain = loadChain();

  try {
    if (chain === 'solana') {
      const client = await setupAgentSolanaWallet({ silent: true });
      const address = await client.getWalletAddress();
      const balance = await client.getBalance();

      console.log(`Chain:  ${chalk.magenta('solana')}`);
      console.log(`Transaction Wallet: ${chalk.cyan(address)}`);
      console.log(
        `USDC Balance: ${chalk.green(`$${balance.toFixed(2)}`)}`
      );

      if (balance === 0) {
        console.log(
          chalk.dim(`\nSend USDC on Solana to ${address} to get started.`)
        );
      }
    } else {
      const client = setupAgentWallet({ silent: true });
      const address = client.getWalletAddress();
      const balance = await client.getBalance();

      console.log(`Chain:  ${chalk.magenta('base')}`);
      console.log(`Transaction Wallet: ${chalk.cyan(address)}`);
      console.log(
        `USDC Balance: ${chalk.green(`$${balance.toFixed(2)}`)}`
      );

      if (balance === 0) {
        console.log(
          chalk.dim(`\nSend USDC on Base to ${address} to get started.`)
        );
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('ENOENT') || msg.includes('wallet') || msg.includes('key')) {
      console.log(chalk.red('No transaction wallet found. Run `franklin-trading setup` before live trading.'));
    } else {
      console.log(chalk.red(`Error checking balance: ${msg || 'unknown error'}`));
    }
    process.exit(1);
  }
}
