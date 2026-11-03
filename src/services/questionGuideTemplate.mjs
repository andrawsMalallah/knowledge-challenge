// Shared editorial instructions. The catalog and inventory are generated from the source tables.
export const guideTemplate = `# Knowledge Challenge — Question Generation Handoff

This guide and question inventory describe the current source tables. Read the inventory below and recheck the source tables before allocating IDs. The local guide command and admin publishing regenerate this guide from the current tables. Do not edit the generated guide manually.

## 1. Your task and scope

Generate accurate, varied Arabic trivia questions for the subcategories the owner assigns. Use the IDs in the catalog below. Preserve the existing category names, slugs, IDs, and relationships. Do not add, rename, merge, or remove categories without the owner's instruction.

The owner expects the bank to grow to tens of thousands of questions or more. That is a long-term scale target, not an instruction to generate that many in one batch. No fixed per-subcategory or per-tier generation quota has been agreed for this layout. If scope or quantity is not supplied, ask which subcategories to cover and how many questions per point tier, plus how many tiebreakers. The minimum playable counts below are not generation quotas.

Produce content only. Do not change application code, schemas, validation rules, dependencies, CI, or hosting to make content pass. Do not commit or push unless explicitly instructed.

When the owner asks for updated source files, add reviewed questions to the complete \`database/questions.json\` array. Preserve existing rows and assign globally unique IDs. Upload the updated JSON files through the admin panel; publishing regenerates \`database/QUESTION_BANK_GUIDE.md\` automatically in the same commit. Do not upload a separate guide. Read this guide and its inventory before generating to avoid existing facts and near-duplicates.

For local edits, run \`npm run generate:guide\` to validate the source tables and regenerate the guide. Run \`npm run generate:guide:check\` to validate the tables and verify that the guide matches them without changing any files. Neither command modifies the source JSON files.

## 2. Database layout and relationships

The three editable source files at the project root are:

| File | Contents | Relationships |
| --- | --- | --- |
| \`database/categories.json\` | Array of \`{id, slug, name}\` rows | Parent table |
| \`database/subcategories.json\` | Array of \`{id, category_id, slug, name}\` rows | \`category_id\` references a category |
| \`database/questions.json\` | Array of all normal and tiebreaker question rows | Normal \`subcategory_id\` references a subcategory |

All new questions go into **one shared questions table**. Do not create one file per subcategory. Do not use the old \`public/data/\` source layout or wrap rows in a \`questions\` object. Do not add \`totalQuestions\`; totals are generated.

A normal question's main category is derived from its subcategory, so a question row must not contain \`category_id\`. Tiebreakers have no subcategory and are distinguished by \`type\`.

The build generates browser-facing pools and splits large pools into chunks of at most 1,000 questions, subject to a 25 MiB limit per generated chunk. These are generated-file limits, not a 1,000-question limit on the source table or a subcategory. Never edit \`.generated/\` or \`dist/\`.

## 3. Exact question schema

Use these exact field names and types:

| Field | Normal question | Tiebreaker question |
| --- | --- | --- |
| \`id\` | Positive safe integer, globally unique | Same global ID space as normal questions |
| \`subcategory_id\` | Existing numeric subcategory ID from this guide | JSON \`null\` |
| \`type\` | \`"normal"\` | \`"tiebreaker"\` |
| \`points\` | \`200\`, \`400\`, or \`600\` | \`0\` |
| \`difficultyLevel\` | See playable difficulty table below | \`4\` or \`5\` |
| \`question\` | Nonempty Arabic or Latin string | Nonempty Arabic or Latin string |
| \`answer\` | Nonempty Arabic or Latin string | Nonempty Arabic or Latin string |
| \`format\` | \`"text"\` | \`"text"\` |
| \`image_path\` | JSON \`null\` | JSON \`null\` |
| \`audio_path\` | JSON \`null\` | JSON \`null\` |
| \`image_alt\` | Optional; omit or use JSON \`null\` | Optional; omit or use JSON \`null\` |

All fields except \`image_alt\` are required. No additional fields are accepted. In particular, do not add explanations, choices/options, source URLs, review status, tags, language, schema versions, category names, or totals to records. If research notes are requested, deliver them separately from the JSON table.

### Valid row examples

These examples illustrate structure only; do not append them automatically. Their IDs must be replaced if already occupied. One normal example does not make a subcategory playable.

\`\`\`json
[
  {
    "id": 1,
    "subcategory_id": 1,
    "type": "normal",
    "points": 200,
    "difficultyLevel": 1,
    "question": "كم عدد أيام الأسبوع؟",
    "answer": "سبعة أيام",
    "format": "text",
    "image_path": null,
    "audio_path": null
  },
  {
    "id": 2,
    "subcategory_id": null,
    "type": "tiebreaker",
    "points": 0,
    "difficultyLevel": 4,
    "question": "ما اسم الوحدة الدولية لقياس النشاط الإشعاعي؟",
    "answer": "البيكريل",
    "format": "text",
    "image_path": null,
    "audio_path": null
  }
]
\`\`\`

### ID and merge rules

- IDs are numbers, not strings. Use positive integers up to \`9007199254740991\`.
- Question IDs are unique across the entire table, including tiebreakers. Never restart numbering for each subcategory.
- For a single writer, inspect the latest table and start after its maximum question ID. Keep every existing ID stable; never renumber to fill gaps or reuse a removed ID.
- If multiple agents are working, coordinate disjoint ID ranges before generation and have one owner merge their results. Do not independently choose the same next ID.
- Preserve existing rows. When repository editing is authorized, merge validated additions into the existing array; never replace the table with only the new batch.
- With no repository access, ask for the current maximum ID or an allocated ID range. Return the requested batch as a standalone valid JSON array for merging, not as a claimed complete replacement database.
- Use UTF-8 JSON with double quotes, numeric numbers, and literal \`null\`. No comments, trailing commas, or Markdown inside actual JSON files.

## 4. Language and editorial rules

### Established content requirements

- **Write question sentences in Arabic.** Use the established English names of foreign films, series, anime, cartoons, video games, companies, brands, commercial products and platforms, fictional characters, songs, and albums in both questions and answers when those names are intended. Use Arabic for football players and clubs, countries, cities, originally Arabic names, and general descriptive terms. Use an established English title for non-English works when available; do not invent a literal translation.
- Foreign real people other than football players, fictional places, books, and other unspecified works require case-by-case review; do not convert them in bulk without the owner's direction. Check names in context, preserve the tested fact, and avoid revealing the answer.
- Validation accepts Arabic and Latin letters in question and answer fields, including an English-only answer. It cannot determine whether English is an appropriate name: reviewers must enforce this policy and reject arbitrary English wording. Other writing systems remain unsupported.
- Category display names are a separate rule: preserve their exact original wording, including English franchise titles in the catalog below. English slugs and schema keys remain unchanged.
- Numbers and punctuation are allowed. Numeric answers must still be strings, for example \`"١١"\` or \`"11"\`.
- Verify factual accuracy. Avoid exact duplicates and near-duplicates, including rephrased versions of the same fact.
- Match the selected subcategory. Do not copy normal questions into the tiebreaker pool.
- Assign difficulty honestly. Do not silently relabel a difficult question as easy just to fill a point tier.

### Expansion and research policy

- Aim for an approximate 50/50 mix of familiar trivia and fresh angles; accuracy, category fit, and variety take priority over a numerical quota.
- An answer may recur when each question tests a distinct fact. Prefer varied answers; for a batch of 30, aim for no more than two occurrences of the same answer when practical.
- Explore quiz games and public sources for ideas lawfully, without copying protected question lists or extracting paid content. Write original Arabic questions and independently verify facts with reliable sources. Record sources and dates outside JSON where needed.
- A proposed pilot of three subcategories with 30 questions each is not authorization or a fixed quota. Do not generate or publish content without the owner's instruction. Do not change old questions without explicit authorization and a review of proposed changes.

### Recommended quality checks for the generating agent

- Write a clear, self-contained prompt with one defensible answer. Avoid vague superlatives, trick ambiguity, opinion questions, and clues that accidentally reveal the answer.
- Prefer durable facts. Date or scope changing statistics, records, squads, transfers, awards, and similar facts explicitly; verify them against reliable sources. Never invent a source or claim a fact was checked when it was not.
- Verify quotes and attributed lines exactly. Clarify the work, adaptation, season, edition, competition, or period when ambiguity would otherwise exist.
- Keep answers concise but sufficient for the host to judge them. Do not add an explanation paragraph to the answer as a substitute for the unsupported explanation field.
- Check for semantic duplicates across the entire bank, especially overlapping mixed/franchise/general-knowledge subcategories. Repeating an answer is not automatically a duplicate, but repeating the tested fact is usually redundant.
- If uncertain about a fact, omit it and report the uncertainty rather than inventing an answer. Review difficulty consistently across the batch.

## 5. Points, difficulty, and playability

### Normal questions

| Points | Allowed difficulty for gameplay | Minimum matched inventory per subcategory |
| --- | --- | --- |
| 200 | 1 or 2 | Two distinct questions sharing one allowed difficulty |
| 400 | 2 or 3 | Two distinct questions sharing one allowed difficulty |
| 600 | 3 or 4 | Two distinct questions sharing one allowed difficulty |

A playable subcategory needs all three pairs: **at least six compatible questions**. At 200 points, one difficulty-1 and one difficulty-2 question do **not** form a matched pair; two difficulty-1 questions or two difficulty-2 questions do. Apply the same rule to the other tiers. The game gives each team one question from each point tier with matched difficulty.

The source parser accepts normal difficulty values 1–5, but combinations outside the table are excluded from gameplay and reported. Generate playable combinations by default. Normal difficulty 5 is not currently playable at any point tier. Difficulty ratings do not override the points field.

A small/default/large match selects 4/6/8 playable subcategories and allocates 24/36/48 normal questions respectively. Do not claim the whole game is ready merely because one subcategory has enough questions.

### Used-question history and bank depth

- A question enters the used-question history only when it is displayed; preparing or starting a game does not mark every assigned question as used.
- New games avoid used questions. When one subcategory/points pool no longer has enough eligible questions, only that exhausted pool is made eligible again.
- The application displays each subcategory's remaining eligible count from the generated catalog and updates it after question display, history reset, backup import, and automatic pool rollover.
- With two displayed questions per tier in a completed appearance, the number of appearances before rollover depends on the current pool size.
- Used-question history is stored separately from the saved game. Backup format v2 includes it; importing a legacy v1 backup preserves the destination browser's existing history.
- Existing games retain frozen assigned questions. Start a new game when testing updated bank content.

### Tiebreakers

- Use \`type:"tiebreaker"\`, \`subcategory_id:null\`, \`points:0\`, and difficulty 4 or 5.
- Generate a distinct pool of hard questions, not copies of normal records.
- Two distinct questions are required per chosen attempt per team: 2 questions support one attempt each; **10 questions support all five-attempt settings**.
- A larger pool adds variety. Ten is the full-settings minimum, not a maximum or an agreed production quota.
- Tiebreakers will always remain text only. There are no image/audio tiebreakers.

## 6. Media and special formats

Only text questions and answers are currently supported. Every row must use \`format:"text"\`, \`image_path:null\`, and \`audio_path:null\`. Omit \`image_alt\` or set it to null.

Reserved asset folders are \`storage/images/questions/\` and \`storage/audio/\`. \`storage/images/icons/\` contains application icons, not question media. These folders do not authorize or enable image/audio question generation. Do not download assets or populate media fields for this task.

Emoji clues may be embedded in the text string, with an Arabic instruction such as «ما اسم الفيلم الذي تشير إليه الرموز التالية؟». A prompt consisting only of emoji fails the current text requirement: include Arabic words. Apply the selective naming policy to answers and make the intended clue unambiguous. A category name never overrides the text-only schema. Defer any question that inherently requires an unavailable image or audio clip rather than inventing a media format.

## 7. Validation and delivery

Before delivering a batch:

1. Confirm scope, quota, and ID allocation; read the latest existing questions if available.
2. Verify every \`subcategory_id\` against the catalog. Preserve names and IDs.
3. Check schema, global ID uniqueness, permitted text and selective naming, null media fields, allowed points/difficulty, and exact/semantic duplicates.
4. Verify factual accuracy separately from structural validation. The validator is not a fact checker and does not prove semantic uniqueness.
5. Report question counts by subcategory, points, and difficulty, plus the separate tiebreaker count. State incomplete tiers and any deferred work accurately.
6. Keep factual research notes separate from the runtime JSON. For volatile facts, record the authoritative source and verification date in the delivery summary.
7. After updating the local source tables, regenerate and check the guide:

\`\`\`powershell
npm run generate:guide
npm run generate:guide:check
\`\`\`

8. After accepted content is updated, run:

\`\`\`powershell
npm run validate:bank
node --test scripts/database.test.mjs scripts/question-history.test.mjs
npm run check
npm run build
\`\`\`

Review \`docs/QUESTION_BANK_VALIDATION.json\`. Structural errors block the build; empty/insufficient pools and excluded difficulty ratings produce warnings. A successful build does not mean every subcategory is playable. Do not change validators to hide failures. If tools or the repository are unavailable, explicitly say checks were not executed.

For manual acceptance, preview the production build, open New Game, select populated subcategories, and check creation, question/answer display, scoring, and tiebreakers. Existing matches retain frozen questions: start a new match to test new content. Do not claim gameplay was tested when only the JSON was inspected.

Without repository access, deliver the requested valid JSON array plus a brief separate batch summary. With authorized repository access, update only the source question table and any separately requested handoff notes. No commits or pushes without explicit authorization.`;
