import { guideTemplate } from './questionGuideTemplate.mjs';

const escapeTableCell = (value) => String(value)
  .replaceAll('|', '\\|')
  .replaceAll('\r', ' ')
  .replaceAll('\n', ' ');

function buildCatalog(categories, subcategories) {
  const lines = ['## 8. Complete current catalog', ''];
  for (const category of categories) {
    const children = subcategories.filter(subcategory => subcategory.category_id === category.id);
    lines.push(`### Category ${category.id}: ${escapeTableCell(category.name)}`, '',
      `Slug: \`${category.slug}\`. Subcategories: ${children.length}.`, '',
      '| subcategory_id | Exact display name | Slug |', '| --- | --- | --- |');
    for (const subcategory of children) {
      lines.push(`| ${subcategory.id} | ${escapeTableCell(subcategory.name)} | \`${subcategory.slug}\` |`);
    }
    lines.push('');
  }
  return lines;
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
  const guide = guideTemplate.trimEnd();
  const lines = [
    guide,
    '',
    ...buildCatalog(categories, subcategories),
    '# Current Question Bank',
    '',
    'The inventory reflects `database/questions.json` and can be regenerated with `npm run generate:guide`.',
    'Keep the inventory synchronized when updating the source files.',
    '',
    `Total questions: **${questions.length}** (${normalQuestions.length} normal, ${tiebreakers.length} tiebreakers).`,
    `Highest question ID: **${maximumQuestionId}**. Next available ID: **${maximumQuestionId + 1}**.`,
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

  return `${lines.join('\n').trimEnd()}\n`;
}
