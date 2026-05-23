#!/usr/bin/env node
/**
 * One-shot script: strip test() blocks from test/local.mjs that depend on
 * modules removed in the Franklin Trading fork (image/video/music/voice/
 * phone/content/social/modal/panel).
 *
 * Block detection: a top-level `test(` line starts a block; the block ends
 * at the first matching `});` at column 0 after it. Only the test() block
 * itself is dropped — top-level const/let/helper definitions sitting
 * between test blocks are preserved.
 *
 * Run once at fork time. Re-running is safe: blocks already pruned will
 * have left no `test(` line to match.
 */
import fs from 'node:fs';
import path from 'node:path';

const FILE = path.join(import.meta.dirname, '..', 'test', 'local.mjs');

const DEAD_PATTERNS = [
  // Direct module imports / file-path reads from deleted dist paths. Each
  // pattern matches both `'../dist/tools/X.js'` (absolute via URL) and
  // `'dist/tools/X.js'` (relative to cwd in readFileSync calls).
  'dist/tools/imagegen',
  'dist/tools/videogen',
  'dist/tools/musicgen',
  'dist/tools/voice',
  'dist/tools/posttox',
  'dist/tools/searchx',
  'dist/tools/browsex',
  'dist/tools/modal',
  'dist/tools/content-execute',
  'dist/tools/phone',
  'dist/phone/',
  'dist/content/',
  'dist/panel/',
  'dist/social/',
  'dist/narrative/',
  // Symbols defined inside pruned blocks (their definitions go with the
  // first pruning pass; surviving tests that reference them are dead too).
  'withPanelServer',
  'createPanelServer',
  'panelHtml',
  'phoneApiPost',
  'phoneApiGet',
  'voiceApiPost',
  'voiceApiGet',
  // Tool-name quoted-string references in registry / spec assertions that
  // target tools we removed. These tests assert "tool X is registered" or
  // similar — structurally false after the fork.
  "'MusicGen'",
  '"MusicGen"',
  "'VideoGen'",
  '"VideoGen"',
  "'ImageGen'",
  '"ImageGen"',
  "'PostToX'",
  '"PostToX"',
  "'SearchX'",
  '"SearchX"',
  "'BrowserX'",
  '"BrowserX"',
  "'VoiceCall'",
  '"VoiceCall"',
  "'VoiceStatus'",
  '"VoiceStatus"',
  "'ModalCreate'",
  '"ModalCreate"',
  "'ModalExec'",
  '"ModalExec"',
  "'ContentCreate'",
  '"ContentCreate"',
  "'ContentAddAsset'",
  '"ContentAddAsset"',
  // CLI shell-out tests that drive the removed `franklin content ...`
  // subcommand. The binary still rejects those args, but the assertion is
  // dead.
  "'content', 'list'",
  "'content', 'show'",
  // readDist('X.js') helper inside test blocks where X is a deleted tool —
  // the path is composed piecewise (path.join(cwd, 'dist', 'tools', X)) so
  // the direct path patterns above don't match.
  "readDist('imagegen.js')",
  "readDist('videogen.js')",
  "readDist('musicgen.js')",
  "readDist('voice.js')",
  "readDist('phone.js')",
  "readDist('modal.js')",
  "readDist('posttox.js')",
  "readDist('searchx.js')",
  "readDist('browsex.js')",
  "readDist('content-execute.js')",
];

function findBlockEnd(lines, start) {
  // The test() block ends at the first line that is exactly `});` (allowing
  // a trailing semicolon/whitespace). Robust because every top-level test
  // block in brcc closes with `});` at column 0.
  for (let i = start + 1; i < lines.length; i++) {
    if (/^}\);\s*$/.test(lines[i])) return i;
  }
  return lines.length - 1;
}

const src = fs.readFileSync(FILE, 'utf8');
const lines = src.split('\n');

let kept = 0;
let dropped = 0;
const drop = new Array(lines.length).fill(false);

for (let i = 0; i < lines.length; i++) {
  if (!/^test[(.]/.test(lines[i])) continue;
  const end = findBlockEnd(lines, i);
  const blockText = lines.slice(i, end + 1).join('\n');
  if (DEAD_PATTERNS.some((p) => blockText.includes(p))) {
    for (let j = i; j <= end; j++) drop[j] = true;
    dropped++;
    i = end;
  } else {
    kept++;
    i = end;
  }
}

const out = [];
let pruneMarkerNeeded = false;
for (let i = 0; i < lines.length; i++) {
  if (drop[i]) {
    pruneMarkerNeeded = true;
    continue;
  }
  if (pruneMarkerNeeded) {
    out.push('// [pruned: dead test block(s) referenced removed module — see git log for original]');
    pruneMarkerNeeded = false;
  }
  out.push(lines[i]);
}

fs.writeFileSync(FILE, out.join('\n'));
console.error(`prune-dead-tests: kept ${kept}, dropped ${dropped} test() blocks`);
