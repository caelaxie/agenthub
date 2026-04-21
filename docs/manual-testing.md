# Manual Testing Runbook

This runbook is for developers and QA engineers validating the API locally.
It uses Postman as the primary workflow, with a few `curl` examples for quick
spot checks.

The current implementation supports the publication lifecycle endpoints. Domain
verification and discovery are still placeholder flows and are called out below
so they are not mistaken for fully implemented features.

## Prerequisites

Start local dependencies:

```bash
docker compose up -d
```

Copy the default local environment file if you do not already have a working
`.env` for this repo:

```bash
cp .env.example .env
```

Use the default local environment from `.env.example`:

```bash
PORT=3000
LOG_LEVEL=debug
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agenthub
REDIS_URL=redis://localhost:6379
DEV_PUBLISHER_SUBJECT=publisher:local-dev
CORS_ORIGIN=*
```

Apply migrations to a fresh local database:

```bash
bun run db:migrate
```

Start the API:

```bash
bun run dev
```

The service should listen on `http://localhost:3000`.

## Local Dummy Agent Card Server

For a reliable local publish flow, serve a dummy Agent Card over HTTPS from this
repo instead of pointing `agent_card_url` at an external site.

Generate a trusted local certificate with `mkcert`:

```bash
mkdir -p .certs
mkcert -install
mkcert -cert-file .certs/localhost.pem -key-file .certs/localhost-key.pem localhost 127.0.0.1 ::1
```

Start the dummy server:

```bash
bun run dev:dummy-agent-card
```

When you use the dummy HTTPS Agent Card server, start the API with the local
mkcert CA wired into Bun:

```bash
bun run dev:with-local-ca
```

This is the recommended local publish-testing flow. The plain `bun run dev`
command is still fine for routes that do not fetch a local HTTPS Agent Card.

Default URLs:

- Agent Card: `https://localhost:8443/.well-known/agent-card.json`
- Interface endpoint: `https://localhost:8443/a2a`

The script exits with setup instructions if the TLS files are missing. You can
override the defaults with:

- `DUMMY_AGENT_CARD_PORT`
- `DUMMY_AGENT_CARD_HOST`
- `DUMMY_AGENT_CARD_BIND_HOST`
- `DUMMY_AGENT_CARD_CERT_PATH`
- `DUMMY_AGENT_CARD_KEY_PATH`

## Postman Setup

Import the live OpenAPI document:

1. Open Postman.
2. Click `Import`.
3. Choose `Link`.
4. Paste `http://localhost:3000/docs/openapi.json`.

Recommended Postman environment variables:

| Variable | Value |
| --- | --- |
| `baseUrl` | `http://localhost:3000` |
| `publisherToken` | `Bearer publisher-token` |
| `otherPublisherToken` | `Bearer other-token` |
| `agentId` | `acme.travel-planner` |
| `agentCardUrl` | `https://localhost:8443/.well-known/agent-card.json` |
| `crossOriginAgentCardUrl` | `https://other.example.com/.well-known/agent-card.json` |

For publication routes, send:

| Header | Value |
| --- | --- |
| `Content-Type` | `application/json` |
| `Authorization` | `{{publisherToken}}` |

## Smoke Checks

### Health

Request:

```http
GET {{baseUrl}}/health
```

Expect:

- `200 OK`
- `status = "ok"`
- `service` and `version` present

Quick `curl`:

```bash
curl -i http://localhost:3000/health
```

### OpenAPI Document

Request:

```http
GET {{baseUrl}}/docs/openapi.json
```

Expect:

- `200 OK`
- `paths["/v1/publish/agents/{agentId}"]` exists
- `paths["/v1/agents/search"]` exists

## Publication Lifecycle Checks

These routes are currently implemented and are the main manual testing target.

### Publish Success

Request:

```http
PUT {{baseUrl}}/v1/publish/agents/{{agentId}}
Authorization: {{publisherToken}}
Content-Type: application/json
```

Body:

```json
{
  "agent_card_url": "{{agentCardUrl}}",
  "visibility": "public"
}
```

Expect:

- `201 Created` for a new publication
- `agent_id = "{{agentId}}"`
- `status = "pending_verification"`
- `challenge.method = "well_known_token"`
- `challenge.url` and `challenge.token` present

Important note:

- `agent_card_url` must be reachable over HTTPS and return a valid Agent Card.
- If you are using the local dummy Agent Card server, run the API with
  `bun run dev:with-local-ca`.
- If the remote endpoint is unavailable, this request will fail with `502`.

### Re-publish Same Origin

Run the same `PUT` request again with the same `agent_id` and same-origin card
URL.

Expect:

- `200 OK`
- `status = "pending_verification"`

### Owner-only Publication Read

Request:

```http
GET {{baseUrl}}/v1/publish/agents/{{agentId}}
Authorization: {{publisherToken}}
```

Expect:

- `200 OK`
- `agent_id = "{{agentId}}"`
- `ownership.owner_subject = "{{publisherToken}}"`
- `publication.agent_card_url` present
- `status` present

Quick `curl`:

```bash
curl -i \
  -H 'Authorization: Bearer publisher-token' \
  http://localhost:3000/v1/publish/agents/acme.travel-planner
```

### Deactivate

Request:

```http
POST {{baseUrl}}/v1/publish/agents/{{agentId}}/deactivate
Authorization: {{publisherToken}}
```

Expect:

- `200 OK`
- `agent_id = "{{agentId}}"`
- `status = "inactive"`

## Negative-path Checks

### Invalid Agent ID

Request:

```http
GET {{baseUrl}}/v1/publish/agents/InvalidId
```

Expect:

- `400 Bad Request`
- `error.code = "invalid_agent_id"`

### Malformed Publish Body

Request:

```http
PUT {{baseUrl}}/v1/publish/agents/{{agentId}}
Content-Type: application/json
```

Body:

```json
{
  "visibility": "public"
}
```

Expect:

- `400 Bad Request`
- `error.code = "invalid_request_body"`

### Non-HTTPS Agent Card URL

Request body:

```json
{
  "agent_card_url": "http://travel.example.com/.well-known/agent-card.json",
  "visibility": "public"
}
```

Expect:

- `400 Bad Request`
- `error.code = "invalid_agent_card_url"`

### Unauthorized Owner-only Access

Request:

```http
GET {{baseUrl}}/v1/publish/agents/{{agentId}}
Authorization: {{otherPublisherToken}}
```

Expect:

- `403 Forbidden`
- `error.code = "publication_forbidden"`

Also test missing auth:

```http
GET {{baseUrl}}/v1/publish/agents/{{agentId}}
```

Expect:

- `401 Unauthorized`
- `error.code = "publisher_auth_required"`

### Namespace Conflict

This requires a namespace already claimed by another owner in the local
database. Once that state exists, try:

```http
PUT {{baseUrl}}/v1/publish/agents/{{agentId}}
Authorization: {{publisherToken}}
Content-Type: application/json
```

Body:

```json
{
  "agent_card_url": "{{agentCardUrl}}",
  "visibility": "public"
}
```

Expect:

- `403 Forbidden`
- `error.code = "namespace_forbidden"`

### Cross-origin Re-publish

First create a successful publication for `{{agentId}}`, then repeat the same
request with a different-origin card URL:

```json
{
  "agent_card_url": "{{crossOriginAgentCardUrl}}",
  "visibility": "public"
}
```

Expect:

- `400 Bad Request`
- `error.code = "invalid_request_body"`

### Duplicate Active Source URL

This requires a second active publication already using the same canonical card
URL. Once that state exists, publish another `agent_id` against the same source
URL.

Expect:

- `409 Conflict`
- `error.code = "duplicate_publication_conflict"`

### Upstream Card Fetch Failure

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

## Discovery and Verification Notes

These routes are not fully implemented yet and should currently be treated as
placeholder behavior during manual testing.

### Domain Verification

Request:

```http
POST {{baseUrl}}/v1/publish/agents/{{agentId}}/verify-domain
Authorization: {{publisherToken}}
Content-Type: application/json
```

Body:

```json
{
  "method": "well_known_token"
}
```

Current expectation:

- `501 Not Implemented`
- `error.code = "domain_verification_not_implemented"`

### Discovery Search

Request:

```http
POST {{baseUrl}}/v1/agents/search
Content-Type: application/json
```

Body:

```json
{
  "query": {
    "text": "travel"
  }
}
```

Current expectation:

- `501 Not Implemented`
- `error.code = "discovery_search_not_implemented"`

### Exact Discovery Lookup

Request:

```http
GET {{baseUrl}}/v1/agents/{{agentId}}
```

Current expectation:

- `501 Not Implemented`
- `error.code = "discovery_lookup_not_implemented"`

## Troubleshooting

### Database or migration issues

Symptoms:

- startup failures
- publication routes failing with server errors

Checks:

- `docker compose up -d` completed successfully
- Postgres is reachable on `localhost:5432`
- `bun run db:migrate` has been run

### Agent Card fetch failures

Symptoms:

- publish returns `502 agent_card_fetch_failed`

Checks:

- the URL uses HTTPS
- the URL is reachable from your machine
- the upstream endpoint returns JSON

### Auth mistakes

Symptoms:

- owner-only routes return `401` or `403`

Checks:

- `Authorization` header is present
- the same token is used for publish, read, and deactivate when testing the
  same publication

### Placeholder routes

Symptoms:

- `501 Not Implemented`

Checks:

- confirm you are testing discovery or domain verification, which are still
  expected placeholders in the current repo state
