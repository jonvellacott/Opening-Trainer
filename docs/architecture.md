# Architecture

## Purpose

A personal/family tool for drilling a memorized chess opening repertoire. It does **not** teach chess, evaluate positions, or find best moves. The repertoire itself is authored and maintained in Lichess Studies; this app is a read-only consumer that quizzes against it.

## Non-goals

- No chess engine, no move evaluation, no "best move" suggestions.
- No editing of the repertoire from within the app — Lichess Studies remain the single source of truth.
- No spaced-repetition scheduling or long-term progress tracking. Reps are uniformly random; repetition itself is the mechanism.
- No accounts, no backend, no paid services.

## Core loop

1. Pick a repertoire (White / Black vs 1.e4 / Black vs 1.d4). This sets board orientation and which chapters are in play.
2. Reset the board to the chapter's start position.
3. **Opponent's turn:** choose uniformly at random among the branches the study defines at that node, play it, briefly show its comment if present.
4. **Your turn:** wait for a move.
   - Matches a repertoire child move → advance, briefly show its comment, continue.
   - Doesn't match any repertoire child → show a red "wrong" indicator, leave the position unchanged, wait for another attempt. No hint or reveal.
   - If multiple repertoire children exist for your side, whichever legal one you play *is* your choice of branch — there is no separate branch picker.
5. Repeat steps 3–4 until a leaf node is reached, tally the rep for the session score, then return to step 2.

## Data model

Three independent stores, kept separate because they have different lifecycles:

| Store | Lifecycle | Contents |
|---|---|---|
| Repertoire | Disposable — replaced wholesale on re-import | Parsed from a Study's PGN |
| Config | Persisted, user-edited | Study URLs/IDs, assigned training colour per chapter |
| Session score | Ephemeral, in-memory only | Correct/incorrect counters for the current visit |

### Repertoire shape

- A `Repertoire` corresponds to one imported Study and holds a list of `Chapter`s.
- A `Chapter` has a name, a training colour (White/Black, assigned in config — never inferred), a starting FEN, and a root node ID.
- A `Node` represents one ply (a move), not a position:
  - stable ID derived from the SAN path from the chapter root (not array index — keeps IDs meaningful across re-imports)
  - SAN + UCI
  - ply / side to move
  - comment text, NAGs, drawn shapes (`[%cal]`/`[%csl]`) if present
  - parent ID, ordered list of child IDs
- Nodes are stored in a **flat map keyed by ID**, not a nested tree object — O(1) lookup, trivial serialization, no deep recursion in React.
- Positions (FEN) are derived on load by replaying moves through chess.js, not persisted — cheap to compute, and avoids storage bloat and staleness.
- Only the training side's nodes are ever quizzed; opponent nodes are always auto-played.

## Layering

```
views/ components/     React only — no chess logic.
        |
state/                 Reducers/context. Bridges domain <-> React.
        |
domain/                Pure TypeScript. No React, no DOM, no storage.
        |
storage/               Interface + implementation. Domain never imports this.
```

`domain/` must not import from `state/`, `views/`, `components/`, or `storage/`. This is what keeps parsing, tree-building, and the quiz state machine unit-testable without rendering anything.

### `domain/` modules

- `chess/` — thin wrapper over chess.js for legality checking and move generation.
- `pgn/` — Lichess Study PGN → `Repertoire`. Uses a grammar-based parser (not chess.js) because it must preserve variations, comments, and NAGs.
- `repertoire/` — the tree model and read queries over it (children of a node, path from root, etc).
- `quiz/` — the state machine described in "Core loop": current node, whose turn, random opponent selection, move validation, session score.

## Technology

| Concern | Choice | Why |
|---|---|---|
| UI | React + TypeScript + Vite | Matches original preference; no reason to deviate. |
| Board | react-chessboard | Supports arrows/highlights needed for `[%cal]`/`[%csl]` annotations. |
| Legality/rules | chess.js | Good at exactly this; not used for PGN tree parsing. |
| PGN parsing | A grammar-based PGN parser (e.g. `@mliebelt/pgn-parser`) | chess.js does not preserve variations/comments/NAGs, which is most of what a repertoire PGN *is*. Two libraries, each doing what it's good at. |
| Routing | None — a view enum in state | Only a handful of screens; avoids the GitHub Pages deep-link/404 problem entirely. |
| State management | `useReducer` + Context | No server state, no cache to manage — Redux/Zustand would be unused weight. |
| Hosting | Static GitHub Pages | No backend needed for this scope. |
| Storage | `localStorage`, behind a small interface | Only caches parsed repertoires + config; swappable later if needs grow. |

## Decisions made

- **Unit of review:** a full walk from chapter root to a leaf, not an isolated position.
- **Wrong move handling:** no reveal — show a red "wrong" indicator and allow retry at the same position.
- **Rep boundary:** always root-to-leaf, no fixed move cap.
- **Comment timing:** shown briefly after the move that earns them, for both sides, non-blocking.
- **Session score:** ephemeral only, resets on reload. A rep counts as correct only if every move was right on the first attempt; mistakes are tracked separately.
- **Multiple prepared lines on your side:** all accepted; the move you play selects the branch.
- **Opponent branch selection:** uniform random among the study's branches at that node.
- **Chapter selection:** chapters that share a starting position and training colour are merged into one tree before a quiz session uses them (`domain/repertoire/merge.ts`), so a branch point on the training side that happens to fall across a chapter boundary (e.g. two White chapters both starting 1.d4) is a normal in-tree choice you make by playing a move — same as any other multi-child node on your side. Chapters with a genuinely different starting position (e.g. a custom-FEN sideline) can't share nodes and remain separate trees; picking among *those* is still a random draw per rep, same mechanism as opponent branch selection. This merge is applied only for quizzing — the debug tree view still shows each Lichess chapter separately, since that's useful for seeing how the study is actually organised.
- **Colour assignment:** per chapter, defaulting from the study, set in config — never inferred from PGN.
- **Transpositions:** chapters sharing an identical move-order prefix are merged (see above). Merging positions reached by *different* move orders is not done in v1. Nodes are indexed by FEN so that could be added later without a data migration.
- **Repertoire mutation:** never — the app is strictly read-only against Lichess Studies.
- **Multiple family members:** assumed to share one Lichess account/browser for now. Storage sits behind an interface so per-device profiles could be added later without a rewrite, but nothing is built for it yet.

## Known risks

- **CORS / Lichess API access is unverified.** The whole "no backend" design assumes a direct browser fetch of a Study's exported PGN works cross-origin. This is the first thing M0 checks. Fallback if it doesn't hold: manual paste/upload of the PGN.
- **Chapters with custom starting FENs.** Repertoire studies sometimes start a chapter mid-game rather than from the standard start. The model already carries a starting FEN per chapter to accommodate this, but it needs confirming against real data.
- **Browser storage eviction.** Config and cached repertoires live in `localStorage`; Safari in particular can evict infrequently-used site storage. Mitigate with `navigator.storage.persist()` and an easy manual re-import.
- **Malformed or unusual PGN** — NAGs, non-standard comment syntax, or embedded Chess960/variant chapters could break the parser. Needs handling once real data is seen, not designed against speculatively.

## M0 spike — findings

Tested against `https://lichess.org/study/wDAoY1rd` (one chapter, "London") plus a synthetic snippet for coverage the real chapter lacked.

- **CORS is open:** `GET https://lichess.org/api/study/{studyId}.pgn` returns `access-control-allow-origin: *`. A direct browser fetch will work; no backend or proxy needed. Confirmed for a public study — an unlisted/private study would need this re-checked.
- **`@mliebelt/pgn-parser` handles real nested variations correctly:** the test chapter has RAVs 4 levels deep; every one of the 43 resulting plies replayed as legal via chess.js once the walk correctly re-forked from the pre-move FEN at each variation (an error in the throwaway script itself, not the library).
- **Comments, NAGs, and shapes parse cleanly:** confirmed with a synthetic PGN since the real chapter had none. `commentAfter` gives plain prose with directives stripped out; `nag` gives a plain array (e.g. `["$1"]`); `commentDiag.colorArrows`/`colorFields` give `[%cal]`/`[%csl]` already split into arrow/square lists — no manual regex needed.
- **Non-standard tags (`StudyName`, `ChapterName`, `ChapterURL`) parse fine**, just with harmless "not known" advisory messages. `ChapterURL` is useful — it's a ready-made link back to the source chapter in Lichess.
- **Still unconfirmed:** a study with more than one chapter (to verify each chapter lands as a separate entry in the parsed `games` array — expected, standard multi-game PGN, but not yet seen firsthand) and a chapter with a custom starting FEN. Worth a second, quick spike pass once you have a multi-chapter study to point at, before M2 locks in the import code.

## Milestones

- **M0 — Spike (throwaway code):** fetch one real Study's PGN from the Lichess API in-browser, confirm CORS, inspect actual structure (custom FENs, comment format, branching). **Done — see findings above.**
- **M1 — Scaffold + board:** Vite/TS/React project, board renders, legal moves playable by hand. Deploy to GitHub Pages at the end of this milestone, while there's nothing else to debug.
- **M2 — Import & model:** PGN → `Repertoire` via the domain layer, viewable as a plain debug tree. No quizzing yet. Mostly pure domain code — this is where tests live.
- **M3 — Core quiz loop:** the full loop described above. This is the first genuinely useful version.
- **M4 — Session score:** ephemeral counters + an end-of-session summary.
- **M5 — Comments & annotations:** comment display, board arrows/highlights from `[%cal]`/`[%csl]`.
- **M6 — Multi-repertoire management & polish:** config UI for study URLs/colours, edge-case handling.

## Project structure

```
src/
├─ main.tsx
├─ App.tsx
├─ domain/
│  ├─ chess/
│  ├─ pgn/
│  ├─ repertoire/
│  └─ quiz/
├─ storage/
├─ state/
├─ components/
└─ views/
```

Tests are colocated as `*.test.ts` next to the domain file they cover, rather than a mirrored `tests/` tree.
