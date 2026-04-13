/**
 * Generate JS baseline IR samples after bug fixes.
 * Run: bun run scripts/gen-baseline.mjs
 */

import fs from 'fs';
import path from 'path';
import { extractContent } from './lib/content-extractor.mjs';

const samples = {
  '经部': [
    '古籍/经部/大学章句集注.htm',
    '古籍/经部/中庸章句集注.htm',
    '古籍/经部/劉熙釋名.htm',
  ],
  '史部': [
    '古籍/史部-其他/列女传/index.htm',
    '古籍/史部-其他/吳越春秋.htm',
    '古籍/史部-其他/佛国记.htm',
  ],
  '子部': [
    '古籍/子部-先秦两汉/《老子》集注(落花散人).htm',
    '古籍/子部-魏晋以下/世说新语/index.htm',
  ],
  '集部': [
    '古籍/集部/元人小令選.htm',
    '古籍/集部/乐府诗集/index.htm',
  ],
};

const outputDir = 'tests/parity-baseline/js-baseline-output';

for (const [category, files] of Object.entries(samples)) {
  const dir = path.join(outputDir, category);
  fs.mkdirSync(dir, { recursive: true });

  for (const file of files) {
    try {
      const html = fs.readFileSync(file, 'utf-8');
      const ir = extractContent(html, file);
      const outName = path.basename(file).replace('.htm', '.json');
      const outPath = path.join(dir, outName);
      fs.writeFileSync(outPath, JSON.stringify(ir, null, 2), 'utf-8');
      console.log(`OK: ${file} → ${outPath}`);
    } catch (err) {
      console.error(`FAIL: ${file} → ${err.message}`);
    }
  }
}

console.log('\nBaseline generation complete.');
