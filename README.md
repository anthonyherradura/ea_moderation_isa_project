# Player Chat Moderation API (prototype)

COMP 4537 term project, team prjM3. A REST API that scores chat messages and
usernames for toxicity, masks clear violations, and sends unclear cases to a
human review queue. **The AI suggests; a moderator decides.**

## Run it locally

Needs Node 22+ and a MySQL 8 server. The quickest MySQL is Docker:

```bash
docker run -d --name moderation-mysql -p 3306:3306 -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=moderation mysql:8
```

(or point `DATABASE_URL` at any MySQL you have, e.g. the Railway one's public URL).
The tables and test accounts are created on first start.

```bash
npm install
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

### Using the real model

The mock is only a keyword matcher. The real service runs `unitary/toxic-bert`
(about 440 MB download, plus CPU PyTorch; about 800 MB of RAM, ~30 ms per message):

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

## How a decision is made

[api/decide.js](api/decide.js) turns the model's six scores into a decision.
The thresholds belong to the API, not the model:

- **masked** if a serious label is high (threat ≥ 0.7, severe_toxic ≥ 0.5,
  identity_hate ≥ 0.5), if swearing is aimed at someone (obscene and insult
  both ≥ 0.9), or if the message is a known abbreviation the model misses
  (`kys`, also spelled `k y s`). Masked cases can be appealed.
- **review** (human moderator) if the highest score is ≥ `REVIEW_THRESHOLD` (0.5).
- **allowed** otherwise.

toxic-bert's general `toxic` label is high for any rudeness or swearing
("shut up" 0.95, "holy shit" 0.98), so on its own it only sends a message to
review. Before scoring, a little gamer slang is rewritten for the model only
("goat" → "greatest of all time"; the model reads "ur the goat" as an insult);
the message is stored and shown as typed.

## Evaluation

[eval/](eval/) scores the CONDA validation set (Dota 2 in-game chat, Weld et
al., ACL 2021, https://github.com/usydnlp/CONDA) with the real model and
compares threshold rules. The data is downloaded on first run and not
committed (the dataset has no licence file).

```bash
node eval/score-conda.mjs http://localhost:8000   # ~5 min, caches eval/data/scores.json
node eval/evaluate.mjs
```

## Deploy (Railway)

One Railway project, four services, all from this repo:

| Service | Settings | Variables |
| --- | --- | --- |
| **MySQL** | New → Database → MySQL | (provided) |
| **inference** | Root directory `inference` (uses its Dockerfile). No public domain. | `PORT=8000` |
| **api** | Root `/`, start `npm start`, public domain, healthcheck `/health` | see below |
| **client** | Root `/`, start `npm run start:client`, public domain | `API_URL=https://<api domain>/api/v1` |

api variables:

```
NODE_ENV=production
TRUST_PROXY=1
JWT_SECRET=${{secret(64)}}
DATABASE_URL=${{MySQL.MYSQL_URL}}
INFERENCE_URL=http://${{inference.RAILWAY_PRIVATE_DOMAIN}}:8000
CLIENT_ORIGINS=https://<client domain>
SEED_ADMIN_EMAIL=...       SEED_ADMIN_PASSWORD=...
SEED_MODERATOR_EMAIL=...   SEED_MODERATOR_PASSWORD=...
SEED_USER_EMAIL=...        SEED_USER_PASSWORD=...      (optional demo player)
```

In production the API reads nothing from `.env` / `.env.example`, so a missing
variable fails at start-up instead of silently using a test value. The cookie
is `SameSite=None; Secure` because the client and API are on different sites;
browsers that block third-party cookies (Safari, Firefox strict mode) need the
client and API on subdomains of one custom domain.

The inference image downloads the model at build time and runs with Hugging
Face offline mode, so the running service depends only on the files on its disk.

## Layout

- `api/` – Express server: `auth.js`, `moderation.js` (scoring + review CRUD),
  `decide.js` (thresholds), `inference.js` (adapter), `db.js` (MySQL schema
  and query helpers), `messages.js` (user-facing strings)
- `inference/` – `app.py` (FastAPI + toxic-bert), `Dockerfile`, and `mock.js`
- `client/` – static client and its tiny server (`/config.js` comes from `API_URL`)
  - `index.html` – login and registration
  - `player.html` – player chat, username checks, and review cases
  - `admin.html` – admin-only statistics and user management data
- `eval/` – dataset evaluation scripts

## Not done yet

- Swagger docs at `/doc/` (Milestone 2).
- Retention limit on stored review-case text.
- A full decision history: a case keeps only its latest decision.

toxic-bert is Apache-2.0 (https://huggingface.co/unitary/toxic-bert).
