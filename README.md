# تحدي المعرفة — Knowledge Challenge

An Arabic, right-to-left trivia game for two teams sharing one host-controlled device. Built with Svelte 5, TypeScript and Vite. It is a static, installable PWA with local saves; no backend, accounts, database server or API keys are required.

**The repository intentionally ships with an empty question bank.** You can deploy and open the app, but a new match cannot start until you add enough normal categories/questions and tiebreakers. Dummy/demo content is not included.

## Contents

- [Run locally](#run-locally)
- [How a match works](#how-a-match-works)
- [Tiebreaker shootout](#tiebreaker-shootout)
- [Saves, backups and offline use](#saves-backups-and-offline-use)
- [Project and content folders](#project-and-content-folders)
- [Category catalog](#category-catalog)
- [Unified question-file shape](#unified-question-file-shape)
- [Question rules](#question-rules)
- [Add or update content](#add-or-update-content)
- [Build and release checks](#build-and-release-checks)
- [Deploy to Cloudflare Pages](#deploy-to-cloudflare-pages)
- [Troubleshooting](#troubleshooting)

## Run locally

Use Node.js **24 or newer** and npm. The checked-in `.node-version` pins **24.19.0** for compatible development/build environments.

From the project root, in PowerShell or another terminal:

```powershell
npm ci
npm run dev
```

Use the URL printed by Vite. Development mode does not register a service worker.

To verify the actual production output:

```powershell
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

Open http://127.0.0.1:4173/. Production preview enables the PWA/service worker and applies the same global security headers supplied for Cloudflare Pages.

### Available commands

| Command | Purpose |
| --- | --- |
| `npm ci` | Install exactly the dependencies in `package-lock.json`. |
| `npm run dev` | Start Vite development mode. |
| `npm run validate:bank` | Validate the catalog and question files; regenerate the local validation report. |
| `npm run check` | Check Svelte and strict TypeScript, including unused locals and parameters. |
| `npm run build` | Validate content, run the type/Svelte check, then generate `dist/`. |
| `npm run preview -- --host 127.0.0.1 --port 4173 --strictPort` | Serve the production build locally. |
| `npm audit` | Check the locked dependencies against npm advisories. |

Tests, test fixtures, test dependencies and GitHub CI workflows are intentionally absent at the owner's request. The build still blocks invalid content and type/Svelte errors.

## How a match works

### Start and setup

1. Choose **New Game**. This immediately deletes the previous game, unfinished preparation and frozen media.
2. Setup returns to default team names/colors, timer enabled, five tiebreaker attempts per team, six category slots and no selected categories.
3. Choose **4, 6 or 8 subcategories**. The selection tree has exactly two levels: main category, then selectable subcategory. Main-category labels show their subcategory count on the left, for example `(4) رياضة`.
4. Category groups expand/collapse; Arabic search also finds subcategories through their parent names.
5. Press **Create Game**. There is no replacement-confirmation modal. The app loads and validates the selected files, freezes the questions and prepares required assets before opening the board.

An empty catalog shows an Arabic empty state. Creation stays disabled if the category selection is incomplete or the tiebreaker pool cannot support the selected attempt count. Insufficient normal-question inventory is reported during creation.

### Board and scoring

Each selected subcategory supplies six distinct questions: one **200**, **400** and **600** point question for each team. At each tier the two questions have the same allowed difficulty. The app selects them randomly without repeated internal question identities.

Teams alternate regular turns and choose their own available tiles. The host reveals the question, then the answer, selects **Team A**, **Team B** or **Neither**, and explicitly confirms the result. The answer can be revealed immediately; there is no five-second lock or expandable points preview.

With timing enabled, the first team has **60 seconds**, then the other team has **15 seconds**. Expiry reveals the answer without automatically scoring it. Timers can be paused. Refresh, returning Home, hiding the page, opening a legacy question image or opening a confirmation pause the timer; recovery never spends background wall-clock time.

### Lifelines

Each team can use each power once per game. Only one power can be active on a question.

| Power | Behavior |
| --- | --- |
| Risk | A correct answer by its owner earns twice the tile value. Failure deducts the tile value; a correct opponent can still earn the normal tile value. |
| Gift | Available on a 600-point tile. The opponent receives 200 provisionally; the owner earns 1,200 for a correct answer. Canceling before the question opens refunds the provisional change. |
| Steal | Selected by the opposing team before the question opens. Reverses the answering order without changing the tile's owner or normal turn progression. |

An uncommitted power can be canceled under its selection rules. Opening the question consumes it. Negative scores are allowed.

### Corrections, ending and results

The host can correct the latest eligible regular result and the latest eligible tiebreaker result. Opening the next question expires the relevant previous-question correction. Corrections recalculate scores/outcomes from the recorded state.

Every **End** action, including **End in Draw**, shows a warning. Confirming deletes the game/preparation/media and returns Home without a result or penalty screen. Cancel keeps the game and leaves any active timer paused. Returning **Home** alone preserves the game.

Naturally completed matches show the final result. Lifeline and question-history summaries are not displayed.

## Tiebreaker shootout

When normal play finishes tied:

- The setup choice means **1–5 attempts per team**, requiring **2–10 distinct tiebreaker questions**.
- The app randomly chooses which team starts when the shootout begins, independently of the next regular turn. It persists that choice.
- Teams alternate, each receiving a different question. **Only the assigned team may answer.**
- A correct answer counts as one shootout success; an incorrect answer counts as a miss. Regular-game points remain unchanged, and lifelines are unavailable.
- With timing enabled, each attempt lasts **60 seconds**. There is no 15-second opponent opportunity.
- After each host-confirmed result, the app announces the winner if the opponent can no longer catch up.
- Equal shootout totals after all allocated attempts mean a **draw**. There are no extra sudden-death attempts.
- The answering-team indicator is visible before reveal. After reveal, the answer screen hides both that indicator and the penalty scoreboard.
- The scoreboard appears during shootout preparation and on naturally completed shootout results.

Older imported/saved matches may retain their original sudden-death format; new matches use the shootout rules.

## Saves, backups and offline use

The browser stores one active game and optional interrupted preparation in IndexedDB, together with frozen media for older saved games. Setup preferences use localStorage. There is no cloud sync.

A Web Lock permits only one writable tab. Other tabs show a read-only takeover screen; control transfers only after the previous owner saves a paused checkpoint. Browsers without Web Locks cannot edit a game. Use HTTPS in deployment; localhost is suitable for development.

Game transitions are saved before advancing. A failed save blocks further play and offers **Retry**. Preparation can resume after a failed new-game save.

The navbar offers:

- **Export:** downloads a ZIP containing the saved match and its frozen media. Export pauses a running timer.
- **Import:** available from Home, validates the archive and asks before replacing the saved match.
- **Delete saved game:** a separate Home action with confirmation; removes the game, preparation and media while keeping setup preferences.

Browser storage belongs to the site's exact origin. Localhost, preview URLs and a production/custom domain do not share saves. Clearing site data or browser eviction may delete progress. Keep an exported backup if the match matters.

Prepared matches and the cached app shell can work offline. Loading new, unprepared content needs a connection. When an update is waiting, the app prompts on Home rather than during play; **Later** is remembered for that build.

The installation manifest is `public/manifest.webmanifest`. It defines the app's name, icons, Arabic/RTL presentation and standalone launch behavior. It is unrelated to the question-bank schema and must remain.

## Project and content folders

```text
knowledge-challenge/
├── .node-version
├── index.html
├── package.json
├── package-lock.json
├── README.md
├── scripts/
│   └── validate-bank.mjs
├── src/
│   ├── App.svelte
│   ├── components/
│   ├── engine/
│   ├── services/
│   ├── styles/
│   └── types/
└── public/
    ├── _headers
    ├── manifest.webmanifest
    ├── sw.js
    ├── fonts/
    ├── images/
    │   └── icons/
    └── data/
        ├── categories.json
        ├── questions/
        │   ├── normal/
        │   │   └── <category>/
        │   │       └── <subcategory>/
        │   │           └── questions.json
        │   └── tiebreaker/
        │       └── questions.json
        ├── images/
        │   └── <category>/<subcategory>/
        └── audio/
            └── <category>/<subcategory>/
```

- `src/engine/`: question assignment, scoring, lifelines, timers, corrections and shootout transitions.
- `src/services/`: catalog/content parsing, storage, backups, preparation, tab control and update handling.
- `public/data/`: **all deployed question-related data**, including future question images/audio.
- `public/images/icons/`: app icons only.
- `scripts/validate-bank.mjs`: build-time content validator, using the same source-schema rules as the browser.
- `dist/`: generated deployment output; ignored by Git.
- `docs/QUESTION_BANK_VALIDATION.json`: generated local validation report; ignored by Git and not deployed.

Empty reserved directories are tracked with empty `.gitkeep` files. These are folder placeholders, not content. There are no shards, per-pool manifests or separate generated category trees.

## Category catalog

`public/data/categories.json` starts as:

```json
{
  "categories": []
}
```

A populated example:

```json
{
  "categories": [
    {
      "id": "general-knowledge",
      "name": "معلومات عامة",
      "subcategories": [
        {
          "id": "mixed",
          "name": "معلومات متنوعة"
        }
      ]
    }
  ]
}
```

Only categories and subcategories declared here appear in the app. Adding folders alone does not add a selection.

Rules:

- Exactly two levels; subcategories cannot contain children.
- IDs are stable lowercase English slugs, starting with a letter, containing letters/digits and single hyphens between segments.
- Category IDs are unique; subcategory IDs are unique within their main category.
- `tiebreakers` is reserved for the dedicated tiebreaker bank.
- Display names must be Arabic. English folder/ID slugs are allowed.
- Do not add question paths or other metadata. Paths are derived from IDs.

The example maps to:

```text
public/data/questions/normal/general-knowledge/mixed/questions.json
```

A main category can have any supported number of subcategories; a match selects subcategories, not whole main categories.

## Unified question-file shape

Normal and tiebreaker files use the **same fields**. All questions for one normal subcategory, across all tiers, live in one `questions.json`.

### Normal subcategory example

This six-record example supplies the minimum balanced inventory for one subcategory. It is documentation only; the repository's actual bank remains empty.

```json
{
  "category": "general-knowledge",
  "subcategory": "mixed",
  "totalQuestions": 6,
  "questions": [
    {
      "id": 1,
      "points": 200,
      "difficultyLevel": 1,
      "question": "كم عدد أيام الأسبوع؟",
      "answer": "سبعة أيام",
      "format": "text",
      "image_path": null,
      "audio_path": null,
      "image_alt": null
    },
    {
      "id": 2,
      "points": 200,
      "difficultyLevel": 1,
      "question": "ما عاصمة العراق؟",
      "answer": "بغداد",
      "format": "text",
      "image_path": null,
      "audio_path": null,
      "image_alt": null
    },
    {
      "id": 3,
      "points": 400,
      "difficultyLevel": 2,
      "question": "ما الكوكب الذي يعرف بالكوكب الأحمر؟",
      "answer": "المريخ",
      "format": "text",
      "image_path": null,
      "audio_path": null,
      "image_alt": null
    },
    {
      "id": 4,
      "points": 400,
      "difficultyLevel": 2,
      "question": "ما العنصر الكيميائي الذي عدده الذري ثمانية؟",
      "answer": "الأكسجين",
      "format": "text",
      "image_path": null,
      "audio_path": null,
      "image_alt": null
    },
    {
      "id": 5,
      "points": 600,
      "difficultyLevel": 3,
      "question": "من مؤلف كتاب المقدمة؟",
      "answer": "ابن خلدون",
      "format": "text",
      "image_path": null,
      "audio_path": null,
      "image_alt": null
    },
    {
      "id": 6,
      "points": 600,
      "difficultyLevel": 3,
      "question": "ما اسم تحول المادة من الحالة الصلبة إلى الغازية مباشرة؟",
      "answer": "التسامي",
      "format": "text",
      "image_path": null,
      "audio_path": null,
      "image_alt": null
    }
  ]
}
```

### Dedicated tiebreaker file

The actual `public/data/questions/tiebreaker/questions.json` starts as:

```json
{
  "category": "tiebreakers",
  "subcategory": null,
  "totalQuestions": 0,
  "questions": []
}
```

When adding questions, each record has this shape:

```json
{
  "id": 1,
  "points": 0,
  "difficultyLevel": 4,
  "question": "ما اسم وحدة قياس الاستضاءة في النظام الدولي؟",
  "answer": "اللوكس",
  "format": "text",
  "image_path": null,
  "audio_path": null,
  "image_alt": null
}
```

Update `totalQuestions` to match the complete array. Tiebreaker `points:0` means no regular-game points; the shootout separately counts correct attempts.

### Field reference

| Field | Normal | Tiebreaker |
| --- | --- | --- |
| `category` | Main-category ID matching folders/catalog | Always `"tiebreakers"` |
| `subcategory` | Subcategory ID matching folders/catalog | Always `null` |
| `totalQuestions` | Actual array length | Actual array length |
| `id` | Positive numeric integer, unique within this file | Same |
| `points` | `200`, `400` or `600` | `0` |
| `difficultyLevel` | Integer `1–5`, subject to gameplay compatibility below | `4` or `5` |
| `question`, `answer` | Arabic text | Arabic text |
| `format` | Currently `"text"` | Always `"text"` |
| `image_path`, `audio_path` | Required; currently `null` | Required; always `null` |
| `image_alt` | Optional; currently omitted or `null` | Optional; omitted or `null` |

There is **no** `schemaVersion`, `published`, `explanation`, per-question category field or extra review/source metadata in source JSON.

## Question rules

### Language and content

- **Questions and answers must be fully Arabic.**
- Use Arabic names/transliterations rather than Latin text, including foreign people, places, films and brands.
- Numbers and punctuation are allowed. Numeric answers may be written as text using digits.
- Verify factual accuracy and avoid duplicate or near-duplicate questions. Validation checks structure and duplicate normalized prompts within a pool; it does not fact-check answers or prove semantic uniqueness.
- Category display names must also be Arabic. IDs/folder names remain stable English slugs.

### Text now; normal media later

**Only text questions and text answers are supported in the current source bank.** Every record must use `format:"text"`, `image_path:null` and `audio_path:null`.

The directories below are reserved for **future normal-question** media:

```text
public/data/images/<category>/<subcategory>/
public/data/audio/<category>/<subcategory>/
```

A future path would start with `/data/images/...` or `/data/audio/...`. Uploading a file or filling a path does not enable media questions today: the validator rejects non-text records. Supporting them later requires deliberate playback/rendering, validation, accessible alternatives, preparation and offline/backup work.

**Tiebreakers will always remain text only.** Images, audio and other media formats are not planned for that pool. Existing image support in the application is retained only for compatibility with older frozen saves/backups.

### IDs, counts and file limits

- IDs are JSON numbers: `1`, not `"1"`. Use positive safe integers.
- IDs must be unique within each file. Different subcategories may each contain question `1`.
- Keep IDs stable when reordering/removing questions; do not renumber old questions to close gaps.
- Internally the app scopes normal identities by category/subcategory/ID and tiebreakers separately, preserving save/backup compatibility.
- `totalQuestions` must exactly equal `questions.length`.
- Files may contain 0–1,000 questions and must be no larger than 25 MiB.
- Keep one UTF-8 JSON file per pool. Do not add manifests, part files or unlisted question files.

### Normal difficulty and playable inventory

| Points | Allowed gameplay difficulty | Minimum inventory |
| --- | --- | --- |
| 200 | 1 or 2 | Two questions of the same allowed difficulty |
| 400 | 2 or 3 | Two questions of the same allowed difficulty |
| 600 | 3 or 4 | Two questions of the same allowed difficulty |

A subcategory needs all three pairs: at least **six compatible questions**. For example, one difficulty-1 and one difficulty-2 question at 200 points do not form a matched pair; two of either rating do.

Source difficulty values 1–5 are retained. Incompatible point/difficulty combinations are excluded from normal play and reported. Do not silently relabel difficulty to make a pool playable.

| Match size | Required playable subcategories | Allocated normal questions |
| --- | --- | --- |
| Small | 4 | 24 |
| Default | 6 | 36 |
| Large | 8 | 48 |

### Tiebreaker inventory

Use a dedicated, distinct pool with `points:0` and difficulty 4 or 5. Do not copy normal questions into it.

Two distinct questions are needed per selected attempt per team: 2 for one attempt, through **10 for all five-attempt settings**. Smaller valid pools enable only settings their count supports. Empty tiebreakers are valid files, but no new game can start with an empty pool.

## Add or update content

1. Add the main category and its subcategories to `public/data/categories.json`.
2. Create exactly one `questions.json` for each declared subcategory under `public/data/questions/normal/<category>/<subcategory>/`.
3. Fill the file with Arabic text records, stable numeric IDs, matching category bindings and correct totals.
4. Populate `public/data/questions/tiebreaker/questions.json` separately, preferably with at least ten distinct questions.
5. Run:

   ```powershell
   npm run validate:bank
   npm run check
   npm run build
   ```

6. Read the console and generated `docs/QUESTION_BANK_VALIDATION.json`. Fix structural errors. Review warnings about insufficient balanced pools, excluded ratings and tiebreaker capacity.
7. Preview the production build. Check category counts/search, create a fresh match and verify its questions, regular scoring and a shootout.
8. Commit the source changes and push when ready. Deploy the new build and accept its app-update prompt from Home.

The validator never rewrites catalog/question source files. It validates only declared pools and rejects unexpected files under `public/data/`, except the three empty reserved-folder `.gitkeep` placeholders.

Existing matches retain frozen content; updating a JSON file does not replace questions in an active save. New Game uses the new bank and clears the previous match under the documented behavior.

## Build and release checks

Before publishing:

```powershell
npm ci
npm run validate:bank
npm run check
npm run build
npm audit
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

Use a disposable browser profile for a walkthrough. Check:

- Home and setup at narrow mobile and desktop widths; no horizontal overflow.
- Empty-bank messaging when no content exists.
- Category counts on the left, expand/collapse, search and deselection.
- New Game resets defaults; Create Game needs no replacement modal.
- Immediate answer reveal; selecting an outcome does not score before confirmation.
- Normal timer's 60/15-second transition and the shootout's 60-second-only transition.
- Correct/incorrect shootout attempts, early mathematical victory and a draw at the cap.
- End warning cancellation preserves the match; confirmation returns Home without a save.
- Backup export/import, refresh recovery, offline recovery and safe second-tab takeover.
- Naturally completed results without removed lifeline/question summaries.

Before the test sources were removed, the existing 100 unit/contract tests and browser journeys were executed. The repository intentionally does not retain an automated test command or CI. Deployment still needs verification on the intended domain and actual Android/iOS devices.

Do not commit `node_modules/`, `dist/`, generated reports, local backups, logs, private exports or environment files.

## Deploy to Cloudflare Pages

This is **plain Svelte + Vite**, not SvelteKit. Use the explicit settings below rather than a preset that expects server output.

1. In Cloudflare, open **Workers & Pages**, create a **Pages** project and connect GitHub.
2. Select `andrawsMalallah/knowledge-challenge`.
3. Configure:

   | Setting | Value |
   | --- | --- |
   | Production branch | `main` |
   | Framework preset | None / custom |
   | Root directory | Repository root; leave blank unless required by the UI |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Node version | `24.19.0` via checked-in `.node-version`; set `NODE_VERSION=24.19.0` if an explicit dashboard override is needed |

4. Save and deploy. Cloudflare installs the locked npm dependencies and runs the build.
5. Open the HTTPS deployment. Confirm that the app loads and its intentionally empty catalog disables game creation.
6. Inspect the served security/cache headers and verify that `/sw.js`, `/manifest.webmanifest` and `/data/categories.json` are accessible.
7. Add an optional custom domain in Pages. Export any match you need before switching origins.

No environment secrets, server/database bindings or Pages Functions are required. Git integration can automatically build future pushes to `main`; configure branch deployment controls in Cloudflare as desired. No GitHub CI or required status checks are configured.

`public/_headers` is copied to `dist/_headers`. Pages applies its CSP, anti-framing, MIME/referrer/permission protections and cache rules to static responses. Hashed assets use immutable caching; HTML, data and the service worker revalidate. Preserve this file.

Publish only the built `dist/` output. README, source, tools and local reports are not part of the site.

Official references: [Pages Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/), [build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/), [Node/build image settings](https://developers.cloudflare.com/pages/configuration/build-image/), and [static headers](https://developers.cloudflare.com/pages/configuration/headers/).

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No categories appear | An empty catalog is intentional initially. Add two-level entries to `public/data/categories.json`; folders alone do not appear. |
| Create Game is disabled | Select the chosen 4/6/8 subcategories and provide enough tiebreakers for the selected attempts. |
| Creation reports insufficient normal questions | Supply a matched pair at each 200/400/600 tier and check their allowed difficulty. |
| Validation rejects a question | Check numeric IDs, totals, category bindings, Arabic-only text, `format:"text"` and null media paths. |
| Changed JSON does not affect the current match | Saved questions are frozen. Accept the app update on Home and start a new game for new content. |
| Old interface remains after deployment | Return Home and accept the waiting update. Check a private profile to distinguish cache state from a broken deployment. Export saves before clearing site data. |
| Read-only tab overlay | Return to the controlling tab or use the safe takeover action. Ensure HTTPS/localhost and Web Locks support. |
| Clean install fails with a Windows native-binary lock | Stop this project's dev/preview server and build helpers, then rerun `npm ci`. |
| Cloudflare build uses the wrong output | Use `npm run build` and `dist`; this project is not SvelteKit. |
| An empty-bank warning appears | Expected until content is added. An empty bank is valid, but not playable. |
