# Intelligent Laboratory

Hackathon: digitalizing the supervision of a laboratory's measuring equipment.

## Documentation

| Document | Contents |
|---|---|
| [docs/01-zadanie.md](docs/01-zadanie.md) | The challenge statement (verbatim), the refined problem, our idea, cement ranges, questions for mentors |
| [docs/02-architektura.md](docs/02-architektura.md) | Architecture: decisions, data model, due dates and statuses, permissions, API, flows, web + mobile (Capacitor) |
| [docs/03-implemetacja.md](docs/03-implemetacja.md) | Implementation plan: team tracks, schedule, 31 tasks with tests |
| [docs/04-research.md](docs/04-research.md) | Research: PN-EN ISO/IEC 17025 requirements, existing products, what we adopt |

Convention: the README is an index, content lives in `docs/`, numbered `NN-topic.md`.
Reading order: 01 → 04 → 02 → 03. The docs are in Polish; code, comments, commits and
this README are in English.

## Development

Requirements: `uv` (it installs Python 3.12 itself), `bun` **canary** (`bun upgrade --canary`).
`bun` is the default package manager, linter and formatter for JS/TS — canary is required
because `bun lint` and `bun fmt` ship with it. CI installs the `canary` channel.

Lint and format rules are strict where it matters, without taste rules that slow work:

- `frontend/bunfig.toml` — `[fmt]`: 100 columns, double quotes, trailing commas, every
  option set explicitly plus `sortImports`/`sortPackageJson`; `[lint]`: `typeAware`, the
  `correctness`/`suspicious`/`perf` categories as `error` plus explicit bug catchers
  (`no-floating-promises`, `no-misused-promises`, `switch-exhaustiveness-check`, …).
  `pedantic`/`style` are off: they carry preference-only, sometimes contradictory rules;
  layout belongs to `bun fmt`. Type errors stay with `bun check`.
- `backend/pyproject.toml` — `ruff`: `E,W,F,I,N,UP,B,SIM,C4,PIE,RUF,RET,ARG,PTH,DTZ,ASYNC,S,T20`
  (bug and consistency rules, not `ALL`); `ty`: default rule set plus return-type inference.

Agents follow `AGENTS.md` (`CLAUDE.md` is a symlink to it).

Backend — `backend/` (uv, FastAPI + SQLAlchemy 2/psycopg 3/Alembic; lint/format with `ruff`, types with `ty`):

| Command | What it does |
|---|---|
| `docker compose -f infra/docker-compose.yml up -d db` | starts PostgreSQL 17 (user/password/db `lab`) |
| `uv sync` | installs dependencies (runtime + dev) |
| `uv run alembic upgrade head` | applies migrations |
| `uv run alembic revision --autogenerate -m "message"` | creates a migration from model changes |
| `uv run uvicorn app.main:app --reload` | server on `http://localhost:8000/api/health` |
| `uv run ruff check .` / `uv run ruff format .` | lint and format |
| `uv run ty check` | type checking |
| `uv run pytest` | tests (needs the database) |
| `uv add <package>` / `uv add --dev <package>` | add a dependency |

Configuration comes from environment variables or `backend/.env` (see `backend/.env.example`):
`DATABASE_URL`, `CORS_ORIGINS`, `PUBLIC_BASE_URL`, `FILES_DIR`, `TIMEZONE`.

Frontend — `frontend/` (bun, React + TypeScript + Vite):

| Command | What it does |
|---|---|
| `bun install` | installs dependencies |
| `bun run dev` | Vite on `http://localhost:5173`, `/api` → `:8000` |
| `bun lint` / `bun fmt` | lint and format (`bun lint --fix`, `bun fmt --check`) |
| `bun check` | type checking |
| `bun run build` | production build into `dist/` |
| `bun run cap:sync` | build + copy the bundle into `android/` and `ios/` |
| `bun run cap:open:android` / `cap:open:ios` | open the native project in Android Studio / Xcode |

Mobile (Capacitor 8, projects in `frontend/android` and `frontend/ios`):

| Command | What it does |
|---|---|
| `bun run cap:sync` | rebuilds the web bundle and syncs it with both native projects |
| `bun run cap:open:android` | builds/runs in Android Studio (Android SDK required) |
| `bun run cap:open:ios` | builds/runs in Xcode 26+ (macOS only) |

At first launch the app asks for the server address (`https://lab.example.com`), checks
`GET /api/health` and stores it on the device; the web build uses the same origin as the API.
The API accepts the native origins `https://localhost` (Android) and `capacitor://localhost`
(iOS) — override with `CORS_ORIGINS`. Firebase files (`google-services.json`,
`GoogleService-Info.plist`) stay local and are gitignored.

CI (`.github/workflows/ci.yml`) runs both sets: `ruff` + `ty` + `pytest` and
`bun fmt --check` + `bun lint` + `bun check` + `bun run cap:sync`.
