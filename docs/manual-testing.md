# Manual Testing Runbook

This runbook is for a developer who wants to validate the API locally without
guessing which order to run things in.

The fastest reliable path is:

1. start Postgres and Redis
2. apply migrations
3. start the local HTTPS dummy Agent Card server
4. start the API with the local CA enabled
5. publish an agent
6. configure the verification token on the dummy server
7. verify the domain
8. confirm discovery and owner-only reads

If you only need one end-to-end confidence check, run the
[Fast Path](#fast-path) section and stop there.

## Table Of Contents

- [Test Values](#test-values)
- [Prerequisites](#prerequisites)
- [Fast Path](#fast-path)
- [Core Checks](#core-checks)
- [Discovery Checks](#discovery-checks)
- [Negative Checks](#negative-checks)
- [Postman Setup](#postman-setup)
- [Troubleshooting](#troubleshooting)

## Test Values

Use these example values throughout the runbook:

```bash
BASE_URL=http://localhost:3000
AGENT_ID=acme.travel-planner
AUTH='Bearer publisher-token'
OTHER_AUTH='Bearer other-token'
CARD_URL=https://localhost:8443/.well-known/agent-card.json
VERIFY_ADMIN_URL=https://localhost:8443/__admin/verification
```

Important auth note:

- In the current dev auth model, the raw `Authorization` header value becomes
  the publisher subject.
- Use the exact same `Authorization` value for publish, verify, owner-only
  read, and deactivate when testing one lifecycle.
- If you change from `Bearer publisher-token` to another string later in the
  flow, owner checks will fail with `403 publication_forbidden`.

## Prerequisites

Start local dependencies:

```bash
docker compose up -d
```

If you do not already have a working local env file:

```bash
cp .env.example .env
```

Apply migrations:

```bash
bun run db:migrate
```

Create local TLS files for the dummy HTTPS Agent Card server:

```bash
mkdir -p .certs
mkcert -install
mkcert -cert-file .certs/localhost.pem -key-file .certs/localhost-key.pem localhost 127.0.0.1 ::1
```

`mkcert -install` is usually a one-time machine setup. You normally only need
to recreate the project-local cert files if they are missing.

## Fast Path

Open four terminals.

### Terminal 1: infrastructure

```bash
docker compose up -d
```

### Terminal 2: migrations

```bash
bun run db:migrate
```

### Terminal 3: dummy Agent Card server

```bash
bun run dev:dummy-agent-card
```

Expected URLs:

- Agent Card: `https://localhost:8443/.well-known/agent-card.json`
- Verification admin endpoint: `https://localhost:8443/__admin/verification`

### Terminal 4: API

```bash
bun run dev:with-local-ca
```

The API should listen on `http://localhost:3000`.

### Step 1: smoke check the API

```bash
curl -i http://localhost:3000/health
```

Expect:

- `200 OK`
- JSON with `status: "ok"`

### Step 2: publish

```bash
curl -sS \
  -X PUT "http://localhost:3000/v1/publish/agents/acme.travel-planner" \
  -H "Authorization: Bearer publisher-token" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_card_url": "https://localhost:8443/.well-known/agent-card.json",
    "visibility": "public"
  }'
```

Expect:

- `201 Created` for a new record
- `agent_id = "acme.travel-planner"`
- `status = "pending_verification"`
- `challenge.method = "well_known_token"`
- `challenge.url` and `challenge.token` present

Copy the returned `challenge.token`.

### Step 3: teach the dummy server the verification token

Replace `TOKEN_FROM_PUBLISH` with the token from the publish response.

```bash
curl -sS \
  -X POST "https://localhost:8443/__admin/verification" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "acme.travel-planner",
    "token": "TOKEN_FROM_PUBLISH"
  }'
```

This makes the dummy server return the exact verification body from:

```text
https://localhost:8443/.well-known/agenthub-verification/acme.travel-planner
```

### Step 4: verify domain ownership

```bash
curl -sS \
  -X POST "http://localhost:3000/v1/publish/agents/acme.travel-planner/verify-domain" \
  -H "Authorization: Bearer publisher-token" \
  -H "Content-Type: application/json" \
  -d '{
    "method": "well_known_token"
  }'
```

Expect:

- `200 OK`
- `agent_id = "acme.travel-planner"`
- `status = "active"`
- `verified_at` present

### Step 5: confirm owner-only read

```bash
curl -sS \
  -H "Authorization: Bearer publisher-token" \
  "http://localhost:3000/v1/publish/agents/acme.travel-planner"
```

Expect:

- `200 OK`
- `status = "active"`
- `ownership.owner_subject = "Bearer publisher-token"`
- no `challenge` field

### Step 6: confirm discovery lookup

```bash
curl -sS \
  "http://localhost:3000/v1/agents/acme.travel-planner"
```

Expect:

- `200 OK`
- `agent_id = "acme.travel-planner"`
- `status = "active"`
- `visibility = "public"`

### Step 7: confirm discovery search

```bash
curl -sS \
  -X POST "http://localhost:3000/v1/agents/search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": {
      "text": "local"
    }
  }'
```

Expect:

- `200 OK`
- results include `acme.travel-planner`
- `next_page_token` is either `null` or a string

Why this query:

- the local dummy card currently indexes tokens such as `local`, `manual`, and
  `test`
- `travel` appears in the example `agent_id`, but free-text search does not use
  `agent_id` tokens

## Core Checks

Use these when you want to inspect one behavior without rerunning the entire
flow.

### Re-publish Same Origin

Run the same publish request again with the same `agent_id` and the same-origin
card URL.

Expect:

- `200 OK`
- `status = "pending_verification"`

### Deactivate

```bash
curl -sS \
  -X POST "http://localhost:3000/v1/publish/agents/acme.travel-planner/deactivate" \
  -H "Authorization: Bearer publisher-token"
```

Expect:

- `200 OK`
- `agent_id = "acme.travel-planner"`
- `status = "inactive"`

### OpenAPI

```bash
curl -sS "http://localhost:3000/docs/openapi.json"
```

Expect:

- `200 OK`
- includes `/v1/publish/agents/{agentId}`
- includes `/v1/agents/{agentId}`
- includes `/v1/agents/search`

## Discovery Checks

### Unauthenticated Restricted Search

```bash
curl -i \
  -X POST "http://localhost:3000/v1/agents/search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": {
      "visibility": "restricted"
    }
  }'
```

Expect:

- `401 Unauthorized`
- `error.code = "restricted_search_requires_auth"`

### Restricted Lookup Without Auth

This requires an active restricted publication.

```bash
curl -i "http://localhost:3000/v1/agents/acme.payroll"
```

Expect:

- `403 Forbidden`
- `error.code = "restricted_entry_forbidden"`

### Invalid Page Token

Use any malformed token:

```bash
curl -i \
  -X POST "http://localhost:3000/v1/agents/search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": {
      "text": "travel",
      "page_token": "not-a-real-token"
    }
  }'
```

Expect:

- `400 Bad Request`
- `error.code = "invalid_page_token"`

## Negative Checks

These are the highest-value failure cases to verify.

### Invalid Agent ID

```bash
curl -i "http://localhost:3000/v1/publish/agents/InvalidId"
```

Expect:

- `400 Bad Request`
- `error.code = "invalid_agent_id"`

### Malformed Publish Body

```bash
curl -i \
  -X PUT "http://localhost:3000/v1/publish/agents/acme.travel-planner" \
  -H "Content-Type: application/json" \
  -d '{
    "visibility": "public"
  }'
```

Expect:

- `400 Bad Request`
- `error.code = "invalid_request_body"`

### Non-HTTPS Agent Card URL

```bash
curl -i \
  -X PUT "http://localhost:3000/v1/publish/agents/acme.travel-planner" \
  -H "Authorization: Bearer publisher-token" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_card_url": "http://travel.example.com/.well-known/agent-card.json",
    "visibility": "public"
  }'
```

Expect:

- `400 Bad Request`
- `error.code = "invalid_agent_card_url"`

### Missing Auth On Owner-only Read

```bash
curl -i "http://localhost:3000/v1/publish/agents/acme.travel-planner"
```

Expect:

- `401 Unauthorized`
- `error.code = "publisher_auth_required"`

### Wrong Owner On Owner-only Read

```bash
curl -i \
  -H "Authorization: Bearer other-token" \
  "http://localhost:3000/v1/publish/agents/acme.travel-planner"
```

Expect:

- `403 Forbidden`
- `error.code = "publication_forbidden"`

### Verification Failure

Publish first, but do not configure the dummy verification token correctly.
Then run verify-domain.

Expect one of these depending on setup:

- `409 Conflict`
- `error.code = "verification_challenge_expired"`

or:

- `403 Forbidden`
- `error.code = "domain_verification_failed"`

### Upstream Agent Card Fetch Failure

Use a valid-looking HTTPS URL that is unreachable or returns a failing upstream
response.

Expect:

- `502 Bad Gateway`
- `error.code = "agent_card_fetch_failed"`

### Malformed Agent Card

Use an HTTPS URL that returns JSON without the required Agent Card structure.

Expect:

- `422 Unprocessable Entity`
- `error.code = "agent_card_invalid"`

### Namespace Conflict

This requires a namespace already claimed by another owner in the database.
Once that state exists, try to publish into that namespace with a different
`Authorization` value.

Expect:

- `403 Forbidden`
- `error.code = "namespace_forbidden"`

### Duplicate Active Source URL

This requires a second active publication already using the same canonical card
URL. Once that state exists, publish a different `agent_id` against the same
source URL.

Expect:

- `409 Conflict`
- `error.code = "duplicate_publication_conflict"`

## Postman Setup

If you prefer Postman over `curl`, import the live OpenAPI document:

1. open Postman
2. click `Import`
3. choose `Link`
4. paste `http://localhost:3000/docs/openapi.json`

Recommended environment variables:

| Variable | Value |
| --- | --- |
| `baseUrl` | `http://localhost:3000` |
| `publisherToken` | `Bearer publisher-token` |
| `otherPublisherToken` | `Bearer other-token` |
| `agentId` | `acme.travel-planner` |
| `agentCardUrl` | `https://localhost:8443/.well-known/agent-card.json` |

## Troubleshooting

### Publish Returns `502 agent_card_fetch_failed`

Check:

- the Agent Card URL uses HTTPS
- the dummy server is running
- the API was started with `bun run dev:with-local-ca`
- the upstream endpoint is reachable from your machine

### Owner-only Routes Return `401` Or `403`

Check:

- the `Authorization` header is present
- the same raw `Authorization` value is reused across publish, verify, read,
  and deactivate

### Discovery Search Returns `400 invalid_page_token`

Check:

- the same query body is reused when following `next_page_token`
- the token is not reused across authenticated and unauthenticated requests
- the token was not manually edited

### Discovery Search Returns `401 restricted_search_requires_auth`

Check:

- the request includes `visibility = "restricted"`
- an `Authorization` header is present when running restricted discovery checks
