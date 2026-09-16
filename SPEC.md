# Pulse — live meeting polls

Production-quality real-time polling for meetings. React + Express + Socket.IO + PostgreSQL.

## Product

Host creates a poll → gets a 4-character room code + QR. Audience joins on phone, votes once. Bars update live. Host can lock, reveal, and see presence.

## Must-have (do not skip)

- Create poll: question + 2–8 options → room code like `K7MQ`
- Join by code (typed or URL `/p/K7MQ`)
- One vote per person (signed httpOnly cookie + unique DB constraint)
- Live results (Socket.IO), reconnect restores totals
- Host: lock / unlock voting, reveal results, close poll
- Optional hide results until reveal (`hideUntilReveal`)
- QR code for join URL
- Presence count (“12 connected”)
- Poll expires after 24 hours (default; host can set 1–72h)
- Rate-limit create (10/IP/hour) and vote (8/socket/10s)
- Demo poll already seeded so recruiters can click
- Tests for room codes, vote uniqueness, expiry
- Docker Compose Postgres on port **5434**
- README: how it works, input, output, run locally
- TypeScript strict, Zod on every mutation, no `any`

## Data model (PostgreSQL)

```
Poll: id, code UNIQUE, question, hideUntilReveal, locked, revealed, closed, hostTokenHash, expiresAt, createdAt
Option: id, pollId, label, position
Vote: id, pollId, optionId, voterId UNIQUE(pollId, voterId), createdAt
```

Vote insert must rely on UNIQUE constraint, never check-then-insert.

## HTTP

Base: `http://localhost:4000`

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/polls` | `{ question, options: string[], hideUntilReveal?: boolean, ttlHours?: number }` | `{ pollId, code, hostToken, joinUrl, expiresAt }` |
| GET | `/api/polls/:code` | optional `Authorization: Bearer <hostToken>` | public snapshot (hidden results are 0 unless host) |
| GET | `/api/health` | — | `{ ok: true }` (issues the voter cookie) |

CORS: `http://localhost:5173`. JSON errors: `{ error: { code, message } }`.

Host token: 32+ random bytes, hashed (sha256) in DB, returned once at create. Accept `Authorization: Bearer <hostToken>` and socket `hostToken`.

Voter cookie: `pulse_voter` httpOnly, SameSite=Lax, 7d, signed JWT `{ sub: voterId }`. Create voter id on first HTTP visit. Socket.IO requires this cookie (`NO_VOTER` otherwise).

## Socket.IO (path `/socket.io`, same origin 4000, CORS 5173)

Client → server:

- `join` `{ code, hostToken?: string }`
- `leave` `{}`
- `vote` `{ optionId }`
- `lock` `{}` host only
- `unlock` `{}` host only
- `reveal` `{}` host only
- `close` `{}` host only

Server → client:

- `state` `PollState`
- `presence` `{ count: number }`
- `error` `{ code, message }`

Audience does not see real vote counts until `resultsVisible`. Host always sees counts.

## Room code

4 chars, alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no I,O,0,1). Retry on collision.

## Web (Vite React, port 5173, proxy /api and /socket.io to 4000)

Routes:

- `/` landing: create poll form (ttl 1–72h) + open demo + open host console
- `/host/:code` host console (`sessionStorage` or `?host=TOKEN`)
- `/p/:code` audience: join + vote + live bars
- `/join` type a code

UI: dark zinc + emerald, fully responsive, min 44px targets, no overflow.

Demo: seeded poll code `K7MQ`. Seed on server start if missing.

## Quality bar

- Helmet, cors, express.json limit 32kb
- Graceful socket reconnect: on connect always `join` again, server sends full `state`
- Leave room on navigation so presence is accurate
- Expired polls reject votes
- Closed/locked reject votes with clear errors
- Vitest: roomCode, vote unique, resultsVisible logic
- GitHub Actions: test + typecheck
- `.env.example`: `PORT=4000`, `SESSION_SECRET=`, `CLIENT_ORIGIN=http://localhost:5173`, `DATABASE_URL=postgresql://pulse:pulse@localhost:5434/pulse`

## Scripts (root)

```
npm run db:up
npm run dev
npm run test
npm run typecheck
```
