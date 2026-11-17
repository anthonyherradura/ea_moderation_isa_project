# Player Chat Moderation API (prototype)

COMP 4537 term project, team prjM3. A REST API that scores chat messages and
usernames for toxicity, masks clear violations, and sends unclear cases to a
human review queue. **The AI suggests; a moderator decides.**

## Run it

Needs Node 22.13+ (uses the built-in `node:sqlite`).

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5500. This starts three processes:

| Process | URL | What |
| --- | --- | --- |
| Client | http://localhost:5500 | Plain HTML/JS on its own origin |
| API | http://localhost:3000/api/v1 | Express server |
| Mock inference | http://localhost:8000 | Keyword matcher standing in for the model |

Register a player account in the client, or log in with the test admin /
moderator accounts listed in [.env.example](.env.example). To change settings,
copy `.env.example` to `.env`.

Try `gg well played` (allowed), `you are an idiot` (review queue) and `kys`
(masked) in the chat tester.

### Using the real model

The mock is only a keyword matcher. The real service runs `unitary/toxic-bert`
(about 440 MB download, plus PyTorch):

```bash
cd inference
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --port 8000
```

Then start the rest without the mock:

```bash
npm run dev -- --no-mock
```

If the inference service is down, scoring does not fail: the message goes to
the review queue with a warning (5 s timeout, one retry, circuit breaker).

## Endpoints (`/api/v1`)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/register` | Register with email and password |
| POST | `/auth/login`, `/auth/logout` | Set / clear the JWT cookie (HttpOnly) |
| GET | `/users/me` | Profile, role, API call count |
| POST | `/messages/score` | AI: score a chat message |
| POST | `/usernames/check` | AI: check a username |
| GET | `/reviews`, `/reviews/:id` | Own cases; moderators see all |
| PATCH | `/reviews/:id` | Moderator: `{decision: "uphold"\|"overturn", note}`. Owner: `{appealNote}` |
| DELETE | `/reviews/:id` | Owner or admin |
| GET | `/admin/stats` | Admin: requests per endpoint, calls per user |

Thresholds (`REVIEW_THRESHOLD`, `MASK_THRESHOLD`) are applied by the API to the
highest of the six label scores: below review = allowed, between = review
queue, at or above mask = masked (and still appealable).

## Layout

- `api/` – Express server: `auth.js`, `moderation.js` (scoring + review CRUD),
  `inference.js` (adapter), `db.js` (schema), `messages.js` (user-facing strings)
- `inference/` – `app.py` (FastAPI + toxic-bert) and `mock.js`
- `client/` – static client and its tiny dev server

## Not in the prototype yet

- MySQL: storage is SQLite for zero setup; the schema and parameterized
  queries are written to port over.
- Swagger docs at `/doc/` (Milestone 2).
- Deployment config for Railway. In production the cookie switches to
  `SameSite=None; Secure` when `NODE_ENV=production`.
- Retention limit on stored review-case text.

toxic-bert is Apache-2.0 (https://huggingface.co/unitary/toxic-bert).
