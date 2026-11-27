# AGENTS.md

Instructions for coding agents (Claude Code, Codex, Cursor, …) working in this repository.
`CLAUDE.md` is a symlink to this file — edit this one.

## What this project is

Hackathon build of a system for supervising a laboratory's measuring equipment
(PN-EN ISO/IEC 17025): equipment register, calibration and check schedules, reagents,
test results with range control, notifications, audit history.
Backend is FastAPI + PostgreSQL; one React frontend serves both the browser and the
Android/iOS apps wrapped in Capacitor 8.

Read before coding:

| Document | Contents |
|---|---|
| `docs/01-zadanie.md` | Challenge statement, scope, cement ranges, open questions |
| `docs/02-architektura.md` | Decisions, data model, due dates/statuses, permissions, API, flows |
| `docs/03-implemetacja.md` | Task plan (T01–T30), file layout, acceptance checks |
| `docs/04-research.md` | 17025 requirements and prior art |

Work task by task from `docs/03-implemetacja.md`; each task lists files, red tests,
commands and the commit message to use. Do not invent scope outside the task.

## Repository layout

| Path | What lives there |
|---|---|
| `backend/` | uv project, `app/` package (`app.main:app`), tests in `tests/` |
| `frontend/` | bun project: Vite + React + TypeScript, Capacitor config, `android/`, `ios/` |
| `docs/` | Design and task documents (Polish) |
| `infra/` | Docker Compose, Caddy, backups (created by T27) |
| `.github/workflows/ci.yml` | Both quality gates |

## Language

- `docs/` is Polish — the client's language. Keep it that way.
- Everything else is English: README, AGENTS.md, code, identifiers, comments, docstrings,
  commit messages, branch names, PR titles and bodies.
- User-facing UI copy and API error messages are Polish (see `docs/02-architektura.md` §7).

## Toolchain — do not introduce alternatives

| Area | Tool | Notes |
|---|---|---|
| Python packages, venv, Python version | `uv` | Python 3.12, pinned in `backend/.python-version` |
| Python lint + format | `ruff` (dev dependency) | configured in `backend/pyproject.toml` |
| Python types | `ty` (dev dependency) | `all = "error"` |
| Python tests | `pytest` | `TestClient`, no network |
| JS/TS packages, runtime | `bun` **canary** | `bun install`, `bun add`, `bunx` |
| JS/TS lint, format, types, tests | `bun lint`, `bun fmt`, `bun check`, `bun test` | built into Bun canary |

Never run `npm`, `yarn`, `pnpm`, `npx`, `pip`, `poetry`, `pipenv`, ESLint, Prettier, Vitest
or Jest. Never add ESLint/Prettier config files; Bun reads `frontend/bunfig.toml`.

## Commands

Backend (from `backend/`):

```bash
uv sync                             # install runtime + dev dependencies
uv run uvicorn app.main:app --reload
uv run ruff check .                 # lint
uv run ruff format .                # format
uv run ty check                     # types
uv run pytest                       # tests
uv add <pkg> / uv add --dev <pkg>   # dependencies
```

Frontend (from `frontend/`):

```bash
bun install
bun run dev                         # Vite, /api proxied to :8000
bun lint / bun lint --fix
bun fmt / bun fmt --check
bun check                           # types
bun test
bun run build
bun run cap:sync                    # build + copy into android/ and ios/
```

## Quality gates

A change is done only when all of these pass for the part you touched:

- `uv run ruff check .`
- `uv run ruff format --check .`
- `uv run ty check`
- `uv run pytest`
- `bun fmt --check`
- `bun lint --max-warnings 0`
- `bun check`
- `bun run cap:sync` (builds the web bundle and syncs `android/` and `ios/`)

CI runs exactly these. Never report a task as done without showing the commands you ran
and their result.

## Never silence a warning

Treat every diagnostic as a bug report, not as noise. Fix the code.

- Do not add `# noqa`, `eslint-disable`, `bun:lint-ignore`, `@ts-ignore`,
  `@ts-expect-error`, `ty: ignore`, `--no-verify`, or a new `ignore`/`select` exclusion
  to make a check pass.
- Do not disable a rule in `frontend/bunfig.toml` or `backend/pyproject.toml`, and do not
  weaken a category, to get green locally.
- Do not delete, rename or narrow an assertion, or wrap a test body in `try/except`/`catch`,
  because it fails.
- Do not cast away a type (`as`, `cast(Any, …)`, `# type: ignore`) to avoid an error.

The only acceptable suppressions:

1. The rule is wrong for this code (for example a library's own types are incorrect), and
   the suppression is the narrowest one possible with a comment naming the reason.
2. There is a confirmed upstream bug, quoted with a link to the issue.

Both need the reason at the site, e.g.
`# noqa: S101  # httpx needs the assert to observe the failure` — and they never cover a
whole file or project. When a check cannot be satisfied, stop and ask instead of silencing.

## Architecture constraints

From `docs/02-architektura.md` — break these and the demo fails:

- Measured numbers are `Decimal` in Python, `NUMERIC` in PostgreSQL, strings in JSON
  (`"0.10"`, never `float`); input accepts a comma or a dot, garbage → 422 `INVALID_NUMBER`.
- Months in the database are `date` (first day), in the API `"YYYY-MM"`; dates `"YYYY-MM-DD"`.
- Deadlines come from data, never stored: status `OK` / `DUE_SOON` / `OVERDUE` / `NO_DATA` /
  `WITHDRAWN` / `NOT_REQUIRED` / `LOW` / `COUNT_DUE`.
- Errors are always `{"error": "<CODE>", "message": "<Polish text>"}`; codes are listed in
  `docs/02-architektura.md` §7.
- Every write and settings change goes to the audit history; technical records are never
  deleted, corrections are edits with a reason.
- Permissions are enforced in the API service layer, not the UI.
- CORS allows `http://localhost:5173`, `https://localhost` (Android) and
  `capacitor://localhost` (iOS); `CORS_ORIGINS` overrides the list.
- Sessions are bearer tokens (`Authorization: Bearer`), not cookies.

## Tests

- Write the failing test first, then the implementation (the task docs specify the cases).
- Backend tests use a transaction that is rolled back; "today" is injected, never
  `date.today()` inside business logic.
- Frontend tests use `bun test` (`bun:test`), co-located as `*.test.ts` next to the module.
- Test observable behavior — status codes, error codes, rendered text, computed statuses.
  No tests that only echo a constant, assert defaults, or re-pin implementation details.
- No network in tests; no `sleep`; no order dependence.

## Git workflow

- Never commit to `main`; never force-push a shared branch.
- Branch from `main`: `feat/t08-equipment-registry`, `fix/calibration-overdue`,
  `docs/architecture-cors`.
- Commits follow the task docs: `feat(scope): ...`, `fix: ...`, `docs: ...`, `test: ...` —
  small, English, imperative.
- Features and fixes go to `main` through a pull request opened with `gh`:

```bash
git push -u origin HEAD
gh pr create --base main --title "feat(backend): equipment registry" \
  --body "T08. What changed, why, and the commands you ran."
```

- PR body: linked task id, summary, test evidence (commands + result), risks or follow-ups.
- Wait for CI green; one review approves. Do not merge your own PR without it.
- Never commit secrets, `.env*` files, `google-services.json`, `GoogleService-Info.plist`,
  keystores, or real laboratory data.

## Do not

- Do not touch `docs/` content to make code match; the docs are the specification. Ask first.
- Do not add dependencies without a task requiring them, and never with `npm`/`pip`.
- Do not reformat unrelated files, rename public symbols, or "clean up" code you were not
  asked to change.
- Do not leave dead code, commented-out blocks, `TODO`s or stubs behind.
- Do not run the full test suite on every edit; run the narrowest check that covers the
  change, then the gates above once before the PR.
