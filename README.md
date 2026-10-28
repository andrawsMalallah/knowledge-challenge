# تحدي المعرفة — Knowledge Challenge

An Arabic, right-to-left trivia game for two teams sharing one host-controlled device. Built with Svelte 5, TypeScript and Vite. It is a static, installable PWA with local saves; no backend, accounts, database server or API keys are required.

The question bank lives in `database/`. Its contents can grow over time; run `npm run validate:bank` for current totals and playability.

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
| `npm run migrate:questions:check` | Check pending batches without changing files. |
| `npm run migrate:questions` | Validate and migrate pending batches, archive them, and regenerate the question guide. |
| `npm run check` | Check Svelte and strict TypeScript, including unused locals and parameters. |
| `npm run build` | Validate content, run the type/Svelte check, then generate `dist/`. |
| `npm run preview -- --host 127.0.0.1 --port 4173 --strictPort` | Serve the production build locally. |
| `npm audit` | Check the locked dependencies against npm advisories. |

The historical gameplay test suite and GitHub CI remain absent. Focused database migration checks use Node's built-in test runner: `node --test scripts/database.test.mjs`. No test dependency is needed. The build blocks invalid content and type/Svelte errors.

## How a match works

### Start and setup

1. Choose **New Game**. This immediately deletes the previous game, unfinished preparation and frozen media.
2. Setup returns to default team names/colors, timer enabled, five tiebreaker attempts per team, six category slots and no selected categories.
3. Choose **4, 6 or 8 subcategories**. The selection tree has exactly two levels: main category, then selectable subcategory. Main-category labels show their subcategory count on the left, for example `(4) رياضة`.
4. Category groups expand/collapse; Arabic search also finds subcategories through their parent names.
5. Press **Create Game**. There is no replacement-confirmation modal. The app loads and validates the selected files, freezes the questions and prepares required assets before opening the board.

An empty catalog shows an Arabic empty state. Creation stays disabled if the category selection is incomplete or the tiebreaker pool cannot support the selected attempt count. Insufficient normal-question inventory is reported during creation.

### Board and scoring

Each selected subcategory supplies six distinct questions: one **200**, **400** and **600** point question for each team. At each tier the two questions have the same allowed difficulty. The app selects randomly from questions that have not previously been opened on this browser. A question is marked used only when it is displayed, so abandoned unseen tiles remain available. When one subcategory/point pool cannot provide a new matched pair, only that pool begins a new cycle.

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

The browser stores one active game, optional interrupted preparation, used-question history and frozen media for older saved games in IndexedDB. Setup preferences use localStorage. There is no cloud sync.

A Web Lock permits only one writable tab. Other tabs show a read-only takeover screen; control transfers only after the previous owner saves a paused checkpoint. Browsers without Web Locks cannot edit a game. Use HTTPS in deployment; localhost is suitable for development.

Game transitions are saved before advancing. A failed save blocks further play and offers **Retry**. Preparation can resume after a failed new-game save.

The navbar offers:

- **Export:** downloads a version-2 ZIP containing the saved match, used-question history and frozen media. Export pauses a running timer.
- **Import:** available from Home, validates the archive and asks before replacing the saved match. Version-2 imports restore the source device's used-question history so play can continue on another device. Legacy version-1 backups remain importable and leave the destination history unchanged.
- **Delete saved game:** a separate Home action with confirmation; removes the game, preparation and media while keeping setup preferences.
- **Reset question history:** a separate confirmed Home action makes used questions eligible for future games again without changing the current saved match.

Browser storage belongs to the site's exact origin. Localhost, preview URLs and a production/custom domain do not share saves. Clearing site data or browser eviction may delete progress. Keep an exported backup if the match matters.

Prepared matches and the cached app shell can work offline. Loading new, unprepared content needs a connection. When an update is waiting, the app prompts on Home rather than during play; **Later** is remembered for that build.

The installation manifest is `public/manifest.webmanifest`. It defines the app's name, icons, Arabic/RTL presentation and standalone launch behavior. It is unrelated to the question-bank schema and must remain.

## Project and content folders

`database/` is the editable database. Each JSON file is an array of rows, like a database table:

```text
database/
  categories.json
  subcategories.json
  questions.json
storage/
  images/
    icons/          # App icons
    questions/      # Reserved for future question images
  audio/            # Reserved for future question audio
public/
  _headers
  manifest.webmanifest
  sw.js
  fonts/
```

- `src/engine/`: question assignment, scoring, lifelines, timers, corrections and shootout transitions.
- `src/services/`: catalog/content parsing, storage, backups, preparation, tab control and update handling.
- `scripts/database.mjs`: validates table relationships and compiles runtime content.
- `scripts/validate-bank.mjs`: generates the local `docs/QUESTION_BANK_VALIDATION.json` report.
- `.generated/public/`: disposable compiled catalog, question pools/chunks and copied public/storage assets. Never edit this folder; it is ignored by Git.
- `dist/`: production deployment output; ignored by Git. Source database files are not deployed.

Vite compiles the database for both development and production. During development it watches the source tables and assets and reloads after valid changes. Invalid edits are reported in the terminal; the last successfully compiled content remains available until they are fixed.

Storage icons are served at the same `/images/icons/` URLs as before. Future question images map to `/images/questions/`, and audio to `/audio/`. The folders do not enable media questions yet. Empty reserved folders contain `.gitkeep` placeholders, excluded from generated output.

## Category catalog

`database/categories.json`:

```json
[
  { "id": 1, "slug": "general-knowledge", "name": "معلومات عامة" }
]
```

`database/subcategories.json`:

```json
[
  { "id": 1, "category_id": 1, "slug": "mixed", "name": "معلومات متنوعة" }
]
```

IDs are positive safe integers, unique within each table. Every subcategory must reference an existing category. Category slugs are unique globally; subcategory slugs are unique within their parent. Slugs are lowercase English letters/digits with single hyphens between segments, starting with a letter. The category slug `tiebreakers` is reserved.

Keep IDs and slugs stable. Display names may contain Arabic or Latin letters, including original franchise titles. The existing catalog retains its 27 main categories and 191 subcategories. No extra manually maintained totals or nested rows are needed.

## Unified question-file shape

`database/questions.json` holds **all normal questions and tiebreakers** in one array. This example shows the row shapes only:

```json
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
```

Normal rows require an existing numeric `subcategory_id`; tiebreakers require `null`. The main category is derived through the subcategory. Question IDs are globally unique across both types. Optional `image_alt` must currently be omitted or null. Additional fields are rejected.

The compiler checks primary/foreign keys, source content rules and normalized duplicate prompts within each pool. It generates the existing runtime catalog and per-subcategory payloads, splitting pools above 1,000 questions into numbered chunks with a manifest. The browser fetches only selected normal pools and the tiebreaker pool, not the complete database. All chunks of a selected pool are loaded to preserve balanced random selection; extremely large individual pools still need corresponding browser memory.

The build reads the source tables in memory. Chunking bounds individual browser payloads; it does not make the source JSON a streaming database. Saved session version 1 remains unchanged. Backup version 2 adds used-question history while retaining version-1 import compatibility and frozen legacy question/media support.

## Question rules

### Language and content

- Write question sentences in Arabic. Use established English names for foreign works, games, brands, commercial products and platforms, fictional characters, songs and albums.
- Use Arabic for football players and clubs, countries, cities, originally Arabic names and general descriptions. Review other real people, fictional places and unspecified works individually.
- The validator accepts Arabic and Latin letters, including English-only answers. Editorial review must ensure English is used according to the naming policy.
- Numbers and punctuation are allowed. Numeric answers may be written as text using digits.
- Verify factual accuracy and avoid duplicate or near-duplicate questions. Validation checks structure and duplicate normalized prompts within a pool; it does not fact-check answers or prove semantic uniqueness.
- Category display names may use Arabic or Latin letters; IDs and folder names remain stable English slugs.

### Text now; normal media later

**Only text questions and text answers are supported in the current source bank.** Every record must use `format:"text"`, `image_path:null` and `audio_path:null`.

The directories below are reserved for **future normal-question** media:

```text
storage/images/questions/
storage/audio/
```

A future path would start with `/images/questions/...` or `/audio/...`. Uploading a file or filling a path does not enable media questions today: the validator rejects non-text records. Supporting them later requires deliberate playback/rendering, validation, accessible alternatives, preparation and offline/backup work.

**Tiebreakers will always remain text only.** Images, audio and other media formats are not planned for that pool. Existing image support in the application is retained only for compatibility with older frozen saves/backups.

### IDs, counts and file limits

- Use positive safe integer IDs, not strings. Never reuse or renumber existing IDs.
- Question IDs must be globally unique in `database/questions.json`.
- Do not add `totalQuestions` to source tables; the compiler calculates totals.
- Generated question chunks contain at most 1,000 questions and at most 25 MiB each.
- Runtime identities retain the existing category/subcategory/question namespace; active saves remain frozen.

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

The source tables in `database/` are authoritative. `database/QUESTION_BANK_GUIDE.md` combines the generation guide, naming rules, catalog and current question inventory; `scripts/question-guide-template.txt` supplies its guide text. Keep the guide in sync when updating the question bank. A successful local migration regenerates the guide, replacing uploaded or manual edits. If the local `questions/` folder is absent, restore it before using the batch workflow.

1. Read the guide and current bank; preserve existing categories, IDs and relationships. Allocate globally unique question IDs after the current maximum.
2. Place each reviewed JSON array in `questions/new/`, named `category-slug_subcategory-slug_batch-number.json` (for example, `football_players_002.json`). The guide describes the schema and editorial rules.
3. Run `npm run migrate:questions:check`. It reports batch and row errors without changing files. An empty `new/` folder means there are no batches to check.
4. After reviewing the batches, run `npm run migrate:questions`. It validates again, merges them into `database/questions.json`, regenerates the combined guide and moves the batches to `questions/migrated/`.
5. Run `npm run validate:bank`, `node --test scripts/database.test.mjs`, and `npm run build`. Review `docs/QUESTION_BANK_VALIDATION.json` for playability warnings.
6. Preview the production build and check category selection and a new match. Existing matches retain frozen content; start a new game to use updated questions.

Structural checks do not verify facts or catch all semantic duplicates. Research and editorial review remain necessary. Development and builds regenerate `.generated/public/`; commit source tables and assets only when publication is authorized.

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

Before the test sources were removed, the existing 100 unit/contract tests and browser journeys were executed. The historical gameplay suite remains absent; the focused database checks above cover the new content pipeline. CI remains unconfigured. Deployment still needs verification on the intended domain and actual Android/iOS devices.

Do not commit `node_modules/`, `dist/`, `.generated/`, browser artifacts, generated reports, local backups, logs, private exports or environment files.

## Deploy to any static host

Build with `npm ci` followed by `npm run build`, then publish the contents of `dist/` at the domain root. This works with static hosting on Cloudflare Workers/Pages, Render, Netlify, or a standard web server; no provider-specific runtime is required. On Render, use a Static Site with build command `npm ci && npm run build` and publish directory `dist`. On Cloudflare Workers, configure static assets to serve `dist`.

Use HTTPS so browser storage locks and the service worker are available. Serve JavaScript, CSS, JSON and the manifest with their correct MIME types. Keep `/sw.js` revalidating rather than giving it long-lived immutable caching. Hosts that do not interpret `public/_headers` need equivalent security/cache headers configured in their own settings. The app currently expects deployment at the domain root, rather than a URL subdirectory.

Both direct `/index.html` responses and redirects from `/index.html` to `/` are supported. Verify the first load, repeated refreshes after service-worker activation, and an offline refresh on the deployed origin.

After deploying a service-worker fix, an existing broken installation may need one hard refresh (Ctrl+Shift+R) to load the new version, followed by accepting the update on Home. Export important saves when possible before troubleshooting; do not clear site data, because that also removes local matches.

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
5. Open the HTTPS deployment. Confirm that the app loads, categories appear, and a new game can be created with sufficient question pools.
6. Inspect the served security/cache headers and verify that `/sw.js`, `/manifest.webmanifest` and `/data/categories.json` are accessible.
7. Add an optional custom domain in Pages. Export any match you need before switching origins.

No environment secrets, server/database bindings or Pages Functions are required. Git integration can automatically build future pushes to `main`; configure branch deployment controls in Cloudflare as desired. No GitHub CI or required status checks are configured.

`public/_headers` is copied to `dist/_headers`. Pages applies its CSP, anti-framing, MIME/referrer/permission protections and cache rules to static responses. Hashed assets use immutable caching; HTML, data and the service worker revalidate. Preserve this file.

Publish only the built `dist/` output. README, source, tools and local reports are not part of the site.

Official references: [Pages Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/), [build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/), [Node/build image settings](https://developers.cloudflare.com/pages/configuration/build-image/), and [static headers](https://developers.cloudflare.com/pages/configuration/headers/).

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No categories appear | Check the source catalog and build output; folders alone do not create categories. |
| Create Game is disabled | Select the chosen 4/6/8 subcategories and provide enough tiebreakers for the selected attempts. |
| Creation reports insufficient normal questions | Supply a matched pair at each 200/400/600 tier and check their allowed difficulty. |
| Validation rejects a question | Check unique numeric IDs, foreign keys, question type, permitted Arabic/Latin text, `format:"text"` and null media paths. |
| Changed JSON does not affect the current match | Saved questions are frozen. Accept the app update on Home and start a new game for new content. |
| Old interface remains after deployment | Return Home and accept the waiting update. Check a private profile to distinguish cache state from a broken deployment. Export saves before clearing site data. |
| Read-only tab overlay | Return to the controlling tab or use the safe takeover action. Ensure HTTPS/localhost and Web Locks support. |
| Clean install fails with a Windows native-binary lock | Stop this project's dev/preview server and build helpers, then rerun `npm ci`. |
| Cloudflare build uses the wrong output | Use `npm run build` and `dist`; this project is not SvelteKit. |
| An empty-bank warning appears | Check that the intended source tables contain questions and rebuild; an empty bank is valid but not playable. |
