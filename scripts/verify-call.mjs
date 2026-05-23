/**
 * Live end-to-end verification of the VoiceCall + VoiceStatus pipeline,
 * including journal persistence at ~/.blockrun/calls.jsonl.
 *
 * Cost: ~$0.54 USDC. Wallet must be on Base, must own a BlockRun phone
 * number to use as caller-ID.
 *
 * Gated by env flag VERIFY_CALL_E2E=1 because it's a real-world action —
 * a real phone rings. Don't run accidentally.
 *
 * Usage:
 *   VERIFY_CALL_E2E=1 VOICE_CALL_TO=+1xxxxxxxxxx VOICE_CALL_TASK="..." \
 *     node scripts/verify-call.mjs
 *
 * The script:
 *   1. Lists wallet-owned phone numbers via ListPhoneNumbers ($0.001)
 *   2. Picks the first active one as caller-ID
 *   3. Fires VoiceCall to VOICE_CALL_TO with task VOICE_CALL_TASK ($0.54)
 *   4. Polls VoiceStatus every 15s until terminal status or 5min timeout
 *   5. Verifies journal row appeared at ~/.blockrun/calls.jsonl with the
 *      expected call_id and final status.
 */
import { listPhoneNumbersCapability } from '../dist/tools/phone.js';
import { voiceCallCapability, voiceStatusCapability } from '../dist/tools/voice.js';
import { CallLog, isTerminalStatus } from '../dist/phone/call-log.js';

if (process.env.VERIFY_CALL_E2E !== '1') {
  console.log('Set VERIFY_CALL_E2E=1 to run this — it costs ~$0.54 and rings a real phone.');
  process.exit(0);
}

const TO = process.env.VOICE_CALL_TO;
const TASK = process.env.VOICE_CALL_TASK ||
  'Briefly say hello and ask what time the recipient is currently seeing on their clock. End the call after they answer.';

if (!TO || !/^\+1[2-9]\d{9}$/.test(TO)) {
  console.error('VOICE_CALL_TO must be set to a US/CA E.164 number (e.g. +14155552671).');
  process.exit(1);
}

const ctx = { workingDir: process.cwd(), abortSignal: new AbortController().signal };

console.log('=== 1. List wallet-owned numbers ($0.001) ===');
const listResult = await listPhoneNumbersCapability.execute({}, ctx);
console.log(listResult.output.slice(0, 600));

// Pull the first phone_number out of the markdown — agent-style parsing
const numMatch = listResult.output.match(/\+1\d{10}/);
if (!numMatch) {
  console.error('No wallet-owned phone number found. Run BuyPhoneNumber first.');
  process.exit(1);
}
const FROM = numMatch[0];
console.log(`\nCaller-ID: ${FROM}`);

console.log(`\n=== 2. VoiceCall ${TO} ($0.54) ===`);
console.log(`Task: ${TASK}`);
const callResult = await voiceCallCapability.execute({ to: TO, from: FROM, task: TASK }, ctx);
console.log(callResult.output.slice(0, 800));

const callIdMatch = callResult.output.match(/\*\*call_id:\*\*\s*`([^`]+)`/);
if (!callIdMatch) {
  console.error('No call_id returned. Aborting verification.');
  process.exit(1);
}
const callId = callIdMatch[1];
console.log(`\ncall_id: ${callId}`);

console.log(`\n=== 3. Poll VoiceStatus (free, 5s interval) ===`);
const startedAt = Date.now();
const MAX_MS = 5 * 60 * 1000;
let lastStatus = '';
while (Date.now() - startedAt < MAX_MS) {
  const statusResult = await voiceStatusCapability.execute({ call_id: callId }, ctx);
  const statusLine = statusResult.output.match(/"status":\s*"([^"]+)"/);
  const status = statusLine ? statusLine[1] : '(unknown)';
  if (status !== lastStatus) {
    console.log(`  [${Math.round((Date.now() - startedAt) / 1000)}s] status=${status}`);
    lastStatus = status;
  }
  if (isTerminalStatus(status)) break;
  await new Promise(r => setTimeout(r, 15_000));
}

console.log(`\n=== 4. Verify journal at ~/.blockrun/calls.jsonl ===`);
const log = new CallLog();
const entry = log.byCallId(callId);
if (!entry) {
  console.error('FAIL — call not found in journal');
  process.exit(1);
}
console.log(`  status:      ${entry.status}`);
console.log(`  duration:    ${entry.duration_sec ?? '?'}s`);
console.log(`  transcript:  ${(entry.transcript || '').slice(0, 200)}${entry.transcript && entry.transcript.length > 200 ? '…' : ''}`);
console.log(`  recording:   ${entry.recording_url || '(none)'}`);
console.log(`  paid_usd:    $${entry.paid_usd.toFixed(2)}`);

console.log(`\nPASS — end-to-end verified. Open \`franklin panel\` → Calls tab to see this call in the UI.`);
