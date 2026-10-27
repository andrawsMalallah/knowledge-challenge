import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileDatabase } from './database.mjs';

const normalizePrompt = (prompt) => prompt
  .normalize('NFKC')
  .replace(/[\u064b-\u065f\u0670\u0640]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const escapeTableCell = (value) => String(value)
  .replaceAll('|', '\\|')
  .replaceAll('\r', ' ')
  .replaceAll('\n', ' ');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const allowedQuestionFields = new Set([
  'id',
  'subcategory_id',
  'type',
  'points',
  'difficultyLevel',
  'question',
  'answer',
  'format',
  'image_path',
  'audio_path',
  'image_alt',
]);

const nonArabicLetters = (value) => typeof value === 'string'
  ? [...new Set([...value].filter((character) => (
    /\p{L}/u.test(character) && !/\p{Script=Arabic}/u.test(character) && character !== '\u0640'
  )))]
  : [];

const characterLabel = (character) => {
  const codePoint = `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
  return `"${character}" (${codePoint})`;
};

export function validateQuestionRow(row, context) {
  const errors = [];
  const location = `${context.filename} row ${context.rowNumber}${Number.isSafeInteger(row?.id) ? ` (id ${row.id})` : ''}`;
  if (!row || typeof row !== 'object' || Array.isArray(row)) return [`${location}: expected a JSON object`];

  const unexpectedFields = Object.keys(row).filter((field) => !allowedQuestionFields.has(field));
  if (unexpectedFields.length) errors.push(`${location}: unsupported field(s): ${unexpectedFields.join(', ')}`);
  if (!Number.isSafeInteger(row.id) || row.id < 1) errors.push(`${location}, id: expected a positive integer`);
  if (!['normal', 'tiebreaker'].includes(row.type)) errors.push(`${location}, type: expected "normal" or "tiebreaker"`);

  if (row.type === 'normal') {
    if (context.subcategoryId !== undefined && row.subcategory_id !== context.subcategoryId) {
      errors.push(`${location}, subcategory_id: expected ${context.subcategoryId} from the filename, received ${JSON.stringify(row.subcategory_id)}`);
    }
    if (![200, 400, 600].includes(row.points)) errors.push(`${location}, points: normal questions require 200, 400, or 600`);
    if (![1, 2, 3, 4, 5].includes(row.difficultyLevel)) errors.push(`${location}, difficultyLevel: normal questions require an integer from 1 to 5`);
  } else if (row.type === 'tiebreaker') {
    if (row.subcategory_id !== null) errors.push(`${location}, subcategory_id: tiebreakers require null`);
    if (row.points !== 0) errors.push(`${location}, points: tiebreakers require 0`);
    if (![4, 5].includes(row.difficultyLevel)) errors.push(`${location}, difficultyLevel: tiebreakers require 4 or 5`);
  }

  for (const field of ['question', 'answer']) {
    if (typeof row[field] !== 'string' || !row[field].trim() || !/[\p{L}\p{N}]/u.test(row[field])) {
      errors.push(`${location}, ${field}: expected nonempty Arabic text`);
      continue;
    }
    const invalidCharacters = nonArabicLetters(row[field]);
    if (invalidCharacters.length) {
      const labels = invalidCharacters.map(characterLabel).join(', ');
      errors.push(`${location}, ${field}: contains unsupported non-Arabic letter(s): ${labels}. Replace Latin or other non-Arabic letters with Arabic wording.`);
    }
  }

  if (row.format !== 'text') errors.push(`${location}, format: expected "text"`);
  if (row.image_path !== null) errors.push(`${location}, image_path: expected null`);
  if (row.audio_path !== null) errors.push(`${location}, audio_path: expected null`);
  if (row.image_alt !== undefined && row.image_alt !== null) errors.push(`${location}, image_alt: omit it or use null`);
  return errors;
}

export function validateBatchFilenameAndRows(filename, rows, categories, subcategories) {
  const match = /^([a-z][a-z0-9]*(?:-[a-z0-9]+)*)_([a-z][a-z0-9]*(?:-[a-z0-9]+)*)_(\d{3,})\.json$/.exec(filename);
  if (!match || Number(match[3]) < 1) {
    throw new Error(`${filename}: expected category_subcategory_batch-number.json with a positive, zero-padded batch number`);
  }

  const [, categorySlug, subcategorySlug, batchNumber] = match;
  const category = categories.find((candidate) => candidate.slug === categorySlug);
  if (!category) throw new Error(`${filename}: unknown category slug ${categorySlug}`);
  const subcategory = subcategories.find((candidate) => (
    candidate.category_id === category.id && candidate.slug === subcategorySlug
  ));
  if (!subcategory) {
    throw new Error(`${filename}: ${subcategorySlug} is not a subcategory of ${categorySlug}`);
  }

  for (const row of rows) {
    if (row?.type === 'normal' && row.subcategory_id !== subcategory.id) {
      throw new Error(`${filename}: normal question ${String(row.id)} must use subcategory_id ${subcategory.id}`);
    }
  }

  return {
    batchNumber: Number(batchNumber),
    category,
    subcategory,
  };
}

export function inspectMigration(root = process.cwd()) {
  const databaseDirectory = resolve(root, 'database');
  const questionsDirectory = resolve(root, 'questions');
  const newDirectory = resolve(questionsDirectory, 'new');
  const migratedDirectory = resolve(questionsDirectory, 'migrated');
  const errors = [];
  const warnings = [];
  const files = [];

  if (!existsSync(questionsDirectory)) {
    errors.push('questions: folder not found in the project. Restore it at <project>/questions before running question migration.');
    return { errors, warnings, files, incomingQuestions: [], combinedQuestions: [] };
  }
  if (!existsSync(newDirectory)) {
    errors.push('questions/new: folder not found in the project. Create it before adding or migrating question batches.');
    return { errors, warnings, files, incomingQuestions: [], combinedQuestions: [] };
  }

  let categories;
  let subcategories;
  let existingQuestions;

  try {
    categories = readJson(resolve(databaseDirectory, 'categories.json'));
    subcategories = readJson(resolve(databaseDirectory, 'subcategories.json'));
    existingQuestions = readJson(resolve(databaseDirectory, 'questions.json'));
  } catch (error) {
    errors.push(`Database: ${error instanceof Error ? error.message : String(error)}`);
    return { errors, files, incomingQuestions: [], combinedQuestions: [] };
  }

  const newEntries = readdirSync(newDirectory, { withFileTypes: true });
  for (const entry of newEntries) {
    if (entry.isFile() && !entry.name.endsWith('.json')) {
      errors.push(`questions/new/${entry.name}: unsupported file; expected a .json batch`);
    }
  }
  const batchFiles = newEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => resolve(newDirectory, entry.name))
    .sort();
  if (!batchFiles.length) errors.push('questions/new: no JSON batches found');

  const incomingQuestions = [];
  for (const batchFile of batchFiles) {
    const filename = basename(batchFile);
    const fileReport = { filename, normal: 0, tiebreakers: 0, total: 0, tiers: {}, errors: [] };
    files.push(fileReport);
    let rows;
    try {
      rows = readJson(batchFile);
    } catch (error) {
      fileReport.errors.push(`invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      fileReport.errors.push('expected a nonempty JSON array');
      continue;
    }

    let filenameDetails;
    try {
      filenameDetails = validateBatchFilenameAndRows(filename, [], categories, subcategories);
    } catch (error) {
      fileReport.errors.push(error instanceof Error ? error.message.replace(`${filename}: `, '') : String(error));
    }
    const expectedSubcategoryId = filenameDetails?.subcategory.id;
    rows.forEach((row, index) => {
      const rowErrors = validateQuestionRow(row, {
        filename,
        rowNumber: index + 1,
        subcategoryId: expectedSubcategoryId,
      });
      fileReport.errors.push(...rowErrors);
    });
    fileReport.total = rows.length;
    fileReport.normal = rows.filter((row) => row?.type === 'normal').length;
    fileReport.tiebreakers = rows.filter((row) => row?.type === 'tiebreaker').length;
    for (const points of [200, 400, 600]) {
      fileReport.tiers[points] = rows.filter((row) => row?.type === 'normal' && row.points === points).length;
    }
    incomingQuestions.push(...rows.map((row) => ({ row, filename })));
  }

  const seenIds = new Map(existingQuestions.map((question) => [question.id, 'database/questions.json']));
  const seenPrompts = new Map(existingQuestions.map((question) => [normalizePrompt(question.question), {
    id: question.id,
    source: 'database/questions.json',
  }]));
  const fileReports = new Map(files.map((file) => [file.filename, file]));
  for (const item of incomingQuestions) {
    const { row, filename } = item;
    const fileReport = fileReports.get(filename);
    if (Number.isSafeInteger(row?.id)) {
      const previousSource = seenIds.get(row.id);
      if (previousSource) fileReport.errors.push(`id ${row.id}: duplicate ID already found in ${previousSource}`);
      else seenIds.set(row.id, filename);
    }
    if (typeof row?.question === 'string' && row.question.trim()) {
      const normalized = normalizePrompt(row.question);
      const previous = seenPrompts.get(normalized);
      if (previous) fileReport.errors.push(`id ${String(row.id)}: duplicate prompt matches question ${previous.id} in ${previous.source}`);
      else seenPrompts.set(normalized, { id: row.id, source: filename });
    }
  }

  for (const fileReport of files) {
    const destination = resolve(migratedDirectory, fileReport.filename);
    if (existsSync(destination)) fileReport.errors.push('a migrated batch with this filename already exists');
    for (const error of fileReport.errors) {
      errors.push(error.startsWith(`${fileReport.filename} `) ? error : `${fileReport.filename}: ${error}`);
    }
  }

  const incomingRows = incomingQuestions.map((item) => item.row);
  const combinedQuestions = [...existingQuestions, ...incomingRows].sort((left, right) => left.id - right.id);
  if (!errors.length) {
    try {
      compileDatabase(categories, subcategories, combinedQuestions);
    } catch (error) {
      errors.push(`Combined database validation: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    errors,
    warnings,
    files,
    categories,
    subcategories,
    existingQuestions,
    incomingQuestions: incomingRows,
    combinedQuestions,
    batchFiles,
    migratedDirectory,
    databaseDirectory,
    questionsDirectory,
  };
}

export function formatInspection(report) {
  const lines = ['Question migration preflight', ''];
  for (const file of report.files) {
    const status = file.errors.length ? 'FAIL' : 'PASS';
    const tiers = file.total
      ? `; normal tiers: 200=${file.tiers[200]}, 400=${file.tiers[400]}, 600=${file.tiers[600]}`
      : '';
    lines.push(`[${status}] ${file.filename}: ${file.total} rows (${file.normal} normal, ${file.tiebreakers} tiebreakers${tiers})`);
  }
  lines.push('');
  if (report.errors.length) {
    lines.push(`Found ${report.errors.length} problem(s). Nothing was migrated:`, '');
    report.errors.forEach((error, index) => lines.push(`${index + 1}. ${error}`));
    lines.push('', 'Fix the listed files, then run `npm run migrate:questions:check` before migrating again.');
  } else {
    lines.push(`Preflight passed: ${report.incomingQuestions.length} questions from ${report.files.length} batch(es).`);
  }
  return lines.join('\n');
}

export function buildQuestionList(categories, subcategories, questions) {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const subcategoryById = new Map(subcategories.map((subcategory) => [subcategory.id, subcategory]));
  const normalQuestions = questions.filter((question) => question.type === 'normal');
  const tiebreakers = questions.filter((question) => question.type === 'tiebreaker');
  const maximumQuestionId = questions.reduce((maximum, question) => Math.max(maximum, question.id), 0);
  const tierTotals = new Map([200, 400, 600].map((points) => [points, normalQuestions.filter((question) => question.points === points).length]));
  const allowedDifficulty = new Map([[200, [1, 2]], [400, [2, 3]], [600, [3, 4]]]);
  const playableSubcategories = subcategories.filter((subcategory) => {
    const rows = normalQuestions.filter((question) => question.subcategory_id === subcategory.id);
    return [...allowedDifficulty].every(([points, difficulties]) => difficulties.some((difficulty) => (
      rows.filter((question) => question.points === points && question.difficultyLevel === difficulty).length >= 2
    )));
  }).length;
  const lines = [
    '# Migrated Questions List',
    '',
    'This file is generated from `database/questions.json` by `npm run migrate:questions`.',
    'Give it to question-generating agents with `QUESTION_GENERATION_GUIDE.md` to help prevent duplicate and near-duplicate questions.',
    'Do not edit this file manually.',
    '',
    `Total migrated questions: **${questions.length}** (${normalQuestions.length} normal, ${tiebreakers.length} tiebreakers).`,
    `Question IDs: **1-${maximumQuestionId}**. Next available ID: **${maximumQuestionId + 1}**.`,
    `Playable subcategories: **${playableSubcategories}/${subcategories.length}**. Normal tiers: **${tierTotals.get(200)} at 200**, **${tierTotals.get(400)} at 400**, and **${tierTotals.get(600)} at 600** points.`,
    'Structural validation and duplicate checks do not replace factual review. Verify volatile facts against authoritative sources and record the verification date.',
    '',
  ];

  for (const category of categories) {
    const categorySubcategories = subcategories.filter((subcategory) => subcategory.category_id === category.id);
    for (const subcategory of categorySubcategories) {
      const rows = normalQuestions.filter((question) => question.subcategory_id === subcategory.id);
      if (!rows.length) continue;
      lines.push(`## ${category.name} / ${subcategory.name}`, '');
      lines.push(`Category: \`${category.slug}\` · Subcategory: \`${subcategory.slug}\` · subcategory_id: \`${subcategory.id}\` · Questions: **${rows.length}**`, '');
      lines.push('| ID | Points | Difficulty | Question | Answer |', '| ---: | ---: | ---: | --- | --- |');
      for (const question of rows.sort((left, right) => left.id - right.id)) {
        lines.push(`| ${question.id} | ${question.points} | ${question.difficultyLevel} | ${escapeTableCell(question.question)} | ${escapeTableCell(question.answer)} |`);
      }
      lines.push('');
    }
  }

  if (tiebreakers.length) {
    lines.push('## Tiebreakers', '', '| ID | Difficulty | Question | Answer |', '| ---: | ---: | --- | --- |');
    for (const question of tiebreakers.sort((left, right) => left.id - right.id)) {
      lines.push(`| ${question.id} | ${question.difficultyLevel} | ${escapeTableCell(question.question)} | ${escapeTableCell(question.answer)} |`);
    }
    lines.push('');
  }

  const unknownSubcategories = normalQuestions.filter((question) => !subcategoryById.has(question.subcategory_id));
  if (unknownSubcategories.length) throw new Error('Cannot list questions with unknown subcategories');
  for (const subcategory of subcategories) {
    if (!categoryById.has(subcategory.category_id)) throw new Error(`Unknown category for subcategory ${subcategory.id}`);
  }

  return `${lines.join('\n')}\n`;
}

export function migrateQuestions(root = process.cwd(), options = {}) {
  const report = inspectMigration(root);
  if (report.errors.length || options.dryRun) return report;

  mkdirSync(report.migratedDirectory, { recursive: true });
  const databasePath = resolve(report.databaseDirectory, 'questions.json');
  const listPath = resolve(report.questionsDirectory, 'QUESTIONS_LIST.md');
  writeFileSync(databasePath, `${JSON.stringify(report.combinedQuestions, null, 2)}\n`, 'utf8');
  writeFileSync(listPath, buildQuestionList(report.categories, report.subcategories, report.combinedQuestions), 'utf8');
  for (const batchFile of report.batchFiles) {
    renameSync(batchFile, resolve(report.migratedDirectory, basename(batchFile)));
  }

  return {
    ...report,
    migrated: true,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dryRun = process.argv.includes('--dry-run');
  const result = migrateQuestions(process.cwd(), { dryRun });
  console.log(formatInspection(result));
  if (result.errors.length) process.exitCode = 1;
  else if (dryRun) console.log('\nDry run only: no files were changed.');
  else console.log(`\nMigrated ${result.incomingQuestions.length} questions from ${result.files.length} batches; database total: ${result.combinedQuestions.length}.`);
}
