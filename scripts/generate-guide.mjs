import { readFileSync, writeFileSync, existsSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileDatabase } from './database.mjs';
import { buildQuestionList } from '../src/services/questionGuide.mjs';

/** Validate first so invalid source tables never replace a previously valid guide. */
export function generateGuide(root = process.cwd(), { check = false } = {}) {
  const tables = ['categories', 'subcategories', 'questions'].map(name => {
    const sourcePath = resolve(root, 'database', `${name}.json`);
    if (lstatSync(sourcePath).isSymbolicLink()) throw new Error('Database symlinks are not allowed');
    return JSON.parse(readFileSync(sourcePath, 'utf8'));
  });
  compileDatabase(...tables);
  const guide = buildQuestionList(...tables);
  const guidePath = resolve(root, 'database', 'QUESTION_BANK_GUIDE.md');
  if (existsSync(guidePath) && lstatSync(guidePath).isSymbolicLink()) throw new Error('Guide symlinks are not allowed');
  const current = existsSync(guidePath) ? readFileSync(guidePath, 'utf8') : null;
  // Git may check Markdown out with CRLF on Windows; this is not a stale inventory.
  const upToDate = current?.replaceAll('\r\n', '\n') === guide;
  if (!check && !upToDate) writeFileSync(guidePath, guide, 'utf8');
  return { upToDate, written: !check && !upToDate };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const check = process.argv.includes('--check');
    const result = generateGuide(process.cwd(), { check });
    if (check && !result.upToDate) {
      console.error('Question guide is missing or outdated. Run npm run generate:guide. No files were changed.');
      process.exitCode = 1;
    } else {
      console.log(result.written ? 'Generated database/QUESTION_BANK_GUIDE.md.' : 'Question guide is up to date.');
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
