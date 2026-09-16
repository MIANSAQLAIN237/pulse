# Pulse

**Live meeting polls.** A host creates a question, the room gets a 4-character code and QR, and everyone votes once from their phone. Bars, presence, and host controls update in real time over Socket.IO.

![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6)
![React](https://img.shields.io/badge/React-19-61DAFB)
![Express](https://img.shields.io/badge/Express-5-000000)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4-010101)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1)
![License: MIT](https://img.shields.io/badge/License-MIT-green)

## Demo

A seeded poll is created on server start if it is missing.

| | |
|---|---|
| **Code** | `K7MQ` |
| **Question** | Which topic should we cover next? |
| **Options** | Real-time systems · LLM evaluation · RAG quality · Auth deep-dive |
| Audience | [http://localhost:5173/p/K7MQ](http://localhost:5173/p/K7MQ) |
| Host console | [http://localhost:5173/host/K7MQ?host=pulse-demo-host-token](http://localhost:5173/host/K7MQ?host=pulse-demo-host-token) |

You can also open the landing page and click **Sit in the demo**. Join by typing `K7MQ` at `/join`.

## Walkthrough

[Demo video](demo/pulse-walkthrough.mp4) (~90 seconds): create a poll, hide then reveal the scoreboard, vote once, lock / unlock / close, and join the seeded room by code.

## How it works

```mermaid
flowchart LR
  A[Host creates poll] --> B[4-char code + QR]
  B --> C[Audience opens /p/CODE]
  C --> D[One vote per voter]
  D --> E[Postgres UNIQUE constraint]
  E --> F[Socket.IO broadcasts state]
  F --> G[Live bars + presence]
  A --> H[Host: lock / reveal / close]
  H --> F
```

1. Host submits a question and 2–8 options (`POST /api/polls`).
2. Server stores the poll in PostgreSQL and returns a room code (for example `K7MQ`), a one-time host token, a join URL, and an expiry.
3. Audience opens `/p/K7MQ` (typed, linked, or scanned from QR). Vite proxies `/api` and `/socket.io` to the API.
4. Each browser gets a signed `pulse_voter` cookie. A vote is an `INSERT`; duplicates are rejected by `UNIQUE(poll_id, voter_id)`.
5. Every client in the room receives `state` and `presence`. Reconnect calls `join` again and the server resends the full snapshot.

```mermaid
sequenceDiagram
  participant Host
  participant Web as Web :5173
  participant API as API :4000
  participant DB as Postgres
  participant Phone as Audience
  Host->>Web: Create poll form
  Web->>API: POST /api/polls
  API->>DB: poll + options
  API-->>Host: code, hostToken, joinUrl
  Phone->>API: GET /api/polls/K7MQ
  Phone->>API: socket join
  Phone->>API: vote optionId
  API->>DB: INSERT vote
  API-->>Host: state + presence
  API-->>Phone: state + presence
```

## INPUT

### Create poll (landing `/`)

| Field | Rules |
|---|---|
| `question` | Required, 5–200 characters |
| `options` | 2–8 non-empty strings (trimmed, de-duplicated, capped at 8) |
| `hideUntilReveal` | Optional boolean, default `false`. When true, audience bars stay at 0 until the host reveals |
| `ttlHours` | Optional integer 1–72, default **24** |

```http
POST /api/polls
Content-Type: application/json
```

```json
{
  "question": "Which topic should we cover next?",
  "options": ["Real-time systems", "LLM evaluation", "RAG quality", "Auth deep-dive"],
  "hideUntilReveal": false,
  "ttlHours": 24
}
```

Response:

```json
{
  "pollId": "…",
  "code": "K7MQ",
  "hostToken": "…",
  "joinUrl": "http://localhost:5173/p/K7MQ",
  "expiresAt": "2026-09-17T21:00:00.000Z"
}
```

`hostToken` is returned **once**. Keep it in `sessionStorage`, or open `/host/:code?host=TOKEN`. The database stores only `sha256(hostToken)`.

### Join

| Input | Where |
|---|---|
| Room code | 4 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no `I`, `O`, `0`, `1`) |
| Typed join | `/join` |
| Direct URL | `/p/K7MQ` |
| QR | Join URL encoded on the host console |

### Vote (Socket.IO)

```json
{ "optionId": "…" }
```

The voter id comes from the httpOnly cookie, not from the payload.

## OUTPUT

### Audience (`/p/:code`)

- Question and option buttons (min 44px targets)
- Live bars that move as votes land
- Your selection after you vote (`youVotedOptionId`)
- Presence: **“N connected”**
- Status: `open` · `locked` · `closed` · `expired`

If `hideUntilReveal` is on and the host has not revealed, `resultsVisible` is false: option `votes` and `totalVotes` are sent as **0** to the audience. The host still sees real counts.

### Host (`/host/:code`)

- Same live bars with true totals
- QR for the join URL
- Presence count
- Controls: **lock** / **unlock** voting, **reveal** results, **close** the poll

### Public snapshot

```http
GET /api/polls/:code
GET /api/health  →  { "ok": true }
```

`PollState` (HTTP snapshot and Socket.IO `state`):

| Field | Meaning |
|---|---|
| `code` | Room code |
| `question` | Poll question |
| `status` | `open` \| `locked` \| `closed` \| `expired` |
| `options[]` | `id`, `label`, `votes`, `position` |
| `totalVotes` | Sum of option votes (0 when hidden from audience) |
| `youVotedOptionId` | This voter’s choice, or `null` |
| `isHost` | True only after a valid host token on the socket |
| `presence` | Connected sockets in the room |
| `resultsVisible` | Whether vote counts are shown to this client |

JSON errors:

```json
{ "error": { "code": "ALREADY_VOTED", "message": "…" } }
```

## Vote rules

| Rule | How it is enforced |
|---|---|
| **One vote per person** | Signed httpOnly `pulse_voter` JWT (`sub` = voter id, 7 days, SameSite=Lax) |
| **No double-insert** | `UNIQUE(poll_id, voter_id)` on `votes`. Insert first; a constraint failure is `ALREADY_VOTED`. There is no check-then-insert |
| **Locked / closed** | Server rejects `vote` with a clear error |
| **Expired** | Default TTL 24 hours (host may set 1–72h). Expired polls reject votes; `GET` still returns `status: "expired"` |
| **Hidden results** | Audience counts zeroed until `reveal` when `hideUntilReveal` is true. Host always sees real totals |
| **Rate limits** | Create: 10 per IP per hour. Vote: 8 per socket per 10 seconds |

Room codes retry on collision (safe alphabet, 4 chars).

## Run locally

Node **20+** and Docker (Postgres).

```
cd pulse
cp .env.example apps/server/.env
# SESSION_SECRET must be at least 32 characters
npm install
npm run db:up
npm run dev
```

| Service | URL |
|---|---|
| Web (Vite) | [http://localhost:5173](http://localhost:5173) |
| API + Socket.IO | [http://localhost:4000](http://localhost:4000) |

Copy env before the first run if `apps/server/.env` is missing:

```bash
cp .env.example apps/server/.env
```

Set `SESSION_SECRET` to at least 32 random characters (for example `openssl rand -hex 32`).

Vite proxies `/api` and `/socket.io` to `http://127.0.0.1:4000`. CORS allows `http://localhost:5173`.

## Environment variables

From [`.env.example`](.env.example):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | API + Socket.IO listen port |
| `SESSION_SECRET` | — | ≥ 32 characters. Signs the voter JWT |
| `CLIENT_ORIGIN` | `http://localhost:5173` | CORS origin and `joinUrl` base |
| `DATABASE_URL` | `postgresql://pulse:pulse@localhost:5434/pulse` | Postgres connection |

Do not commit `.env`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Concurrently API (`tsx watch`) + Vite |
| `npm test` | Vitest: room codes, visibility, vote uniqueness |
| `npm run typecheck` | `tsc --noEmit` across workspaces |
| `npm run build` | Shared, server, then web |
| `npm run db:up` | Start Postgres on localhost:5434 |
| `npm run db:down` | Stop Postgres |
| `npm run lint` | Workspace lint if present |

## HTTP and Socket.IO

Base: `http://localhost:4000`. Path `/socket.io`. CORS `http://localhost:5173`. JSON body limit 32kb.

| Method | Path | Body | Response |
|---|---|---|---|
| `POST` | `/api/polls` | `{ question, options, hideUntilReveal?, ttlHours? }` | `{ pollId, code, hostToken, joinUrl, expiresAt }` |
| `GET` | `/api/polls/:code` | — | Public `PollState` (counts omitted when hidden) |
| `GET` | `/api/health` | — | `{ ok: true }` |

Host auth: `Authorization: Bearer <hostToken>`, socket `join` `{ code, hostToken }`, or optional `pulse_host` cookie.

**Client → server:** `join` `{ code, hostToken? }` · `vote` `{ optionId }` · `lock` · `unlock` · `reveal` · `close` (host only).

**Server → client:** `state` `PollState` · `presence` `{ count }` · `error` `{ code, message }`.

## App routes

| URL | Role |
|---|---|
| `/` | Create poll + open demo |
| `/join` | Type a room code |
| `/p/:code` | Audience: vote + live bars |
| `/host/:code` | Host console (needs host token) |

## Security

- **Helmet**, CORS locked to `CLIENT_ORIGIN`, `credentials: true`
- JSON parser limited to **32kb**
- Zod validation on every mutation
- Voter identity is an **httpOnly** cookie, not a client-supplied id
- Host token is 32+ random bytes, **hashed (SHA-256)** at rest, shown once at create
- Vote uniqueness is a **database constraint**, not an application-level read
- Create and vote are **rate-limited**
- TypeScript **strict** (`noUncheckedIndexedAccess`); no `any`

The demo host token `pulse-demo-host-token` is only for local `K7MQ`. Generate a real secret and do not reuse that token in production.

## Stack

npm workspaces.

| Package | Role |
|---|---|
| `apps/web` | Vite, React 19, React Router 7, Tailwind CSS 4, Socket.IO client, `qrcode.react` |
| `apps/server` | Express 5, Socket.IO 4, PostgreSQL (`pg`), jose, Zod, Helmet, CORS |
| `packages/shared` | Room codes, `PollState`, `deriveStatus`, `resultsVisibleFor` |

## License

MIT. See [LICENSE](LICENSE).
