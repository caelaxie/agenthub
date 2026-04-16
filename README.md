# agenthub

Reference implementation of the `agenthub-spec` registry APIs.

## Local development

Start PostgreSQL and Redis locally:

```bash
docker compose up -d
```

Persistent local data is stored in:

```text
.docker/postgres
.docker/redis
```

The default local environment matches `.env.example`:

```bash
PORT=3000
LOG_LEVEL=debug
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agenthub
REDIS_URL=redis://localhost:6379
DEV_PUBLISHER_SUBJECT=publisher:local-dev
CORS_ORIGIN=*
```

Generate Drizzle migrations after schema changes:

```bash
bun run db:generate
```

For a fresh local database, apply the generated migrations:

```bash
bun run db:migrate
```

Start the app:

```bash
bun run dev
```

## Docker

Build the production image:

```bash
docker build -t agenthub .
```

Run it against the local Postgres and Redis services:

```bash
docker run --rm \
  -p 3000:3000 \
  -e DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5432/agenthub \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  agenthub
```

## Validation

Run the test suite with:

```bash
bun test
```
