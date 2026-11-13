# Deploying the F3 Estimation Tool to a server

One Linux server runs the app and Caddy (HTTPS) in Docker. The data lives in IT's managed PostgreSQL. Everything below is done once, except "Updating".

```
people ──https──▶ Caddy (ports 80/443) ──▶ app container (port 3000) ──▶ managed PostgreSQL
                                                    └──▶ Google sign-in, Gmail SMTP, Claude API
```

## 1. What IT provides

**Server**
- Linux, 64-bit x86 (for example Ubuntu 24.04 LTS), at least **2 vCPU, 4 GB RAM, 30 GB disk**. Building the image needs the memory; running it needs about 1 GB.
- **Docker Engine with the Compose plugin** (`docker compose version` works), and `git`.
- Inbound: ports **80 and 443** open to the people who use the tool (80 is needed for the HTTPS certificate).
- Outbound HTTPS to: `github.com`, `registry.npmjs.org`, `huggingface.co` and `registry-1.docker.io` (building), `api.anthropic.com` (Claude), `accounts.google.com` and `oauth2.googleapis.com` (sign-in), `acme-v02.api.letsencrypt.org` (certificate), and the mail server (`smtp.gmail.com:465`).
- SSH access for whoever deploys.

**Domain**: a name such as `estimates.folio3.com` with a DNS **A record pointing at the server's public IP**.

**Database**: managed **PostgreSQL 17**
- Database **`f3_estimation`**, and a user with full rights on it (it creates its own tables).
- Extensions **`vector`** (pgvector) and **`pg_trgm`** created in it (`CREATE EXTENSION vector; CREATE EXTENSION pg_trgm;`), or the user allowed to create them.
- Reachable from the server on port 5432; TLS is fine (`?sslmode=require`).
- **Daily backups** kept at least 14 days: it holds client estimates.

## 2. Google sign-in: add the new address (once, product owner)

In the [Google Cloud console](https://console.cloud.google.com/) → APIs & Services → Credentials → the existing OAuth client:
- Authorized JavaScript origins: add `https://estimates.folio3.com`
- Authorized redirect URIs: add `https://estimates.folio3.com/api/auth/callback/google`

Keep the `localhost` entries so local work keeps working.

## 3. First deployment (on the server)

```bash
git clone https://github.com/Umair2725/f3-estimation-tool.git
cd f3-estimation-tool
cp deploy/env.production.example deploy/.env.production
nano deploy/.env.production
```

Fill in every value (the file explains each one). Generate a **new** `AUTH_SECRET` for production:

```bash
docker run --rm node:26-bookworm-slim node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Load the data (before the first start)

On the product owner's PC, `bash deploy/export-data.sh` writes `local-data/deploy/f3_estimation-<date>.dump`: the real work without test data. Copy it to the server (for example `scp`), then restore it into the empty database:

```bash
set -a; . deploy/.env.production; set +a
docker run --rm -v "$PWD:/work" postgres:17 \
  pg_restore --no-owner --no-privileges --dbname="$DATABASE_URL" /work/f3_estimation-<date>.dump
```

Restore **before** the app's first start: the app creates the tables itself on an empty database, and a restore on top of that fails. To start fresh instead, skip this step.

### Start

```bash
docker compose --env-file deploy/.env.production -f deploy/compose.yaml up -d --build
```

The first build takes 5–10 minutes. Then:
- `https://estimates.folio3.com/api/health` shows `"status":"ok"`.
- Sign in with Google. A person in `ADMIN_EMAILS` (or an Admin from the restored data) has Admin rights.
- Settings → Email → **Send test email** checks the mail settings.

## 4. Updating to a new version

```bash
cd f3-estimation-tool
git pull
docker compose --env-file deploy/.env.production -f deploy/compose.yaml up -d --build
docker image prune -f
```

The app applies new database migrations by itself when it starts, and refuses to start if a setting is missing.

## 5. Day to day

| Task | Command |
|---|---|
| Is it running? | `docker compose --env-file deploy/.env.production -f deploy/compose.yaml ps` |
| App logs | `docker compose --env-file deploy/.env.production -f deploy/compose.yaml logs -f app` |
| Restart | `docker compose --env-file deploy/.env.production -f deploy/compose.yaml restart app` |
| Stop | `docker compose --env-file deploy/.env.production -f deploy/compose.yaml down` (data stays in the database) |

Changing a setting: edit `deploy/.env.production`, then run the start command again.

## 6. If something goes wrong

| Symptom | Likely cause |
|---|---|
| App keeps restarting; the log names a setting | That setting is missing or wrong in `deploy/.env.production` |
| `migrate deploy` fails with "permission denied to create extension" | Ask IT to create `vector` and `pg_trgm` in `f3_estimation` |
| Browser shows a certificate error | DNS doesn't point at the server yet, or port 80/443 is closed; check `docker compose … logs caddy` |
| Google says `redirect_uri_mismatch` | Step 2 not done, or `AUTH_URL` differs from the address in the browser |
| Documents aren't read / no AI estimates | `ANTHROPIC_API_KEY` empty or its account has no credit; the document shows the reason |
