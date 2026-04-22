# Domain Verification Workflow

This page is a maintainer guide to the publish-to-active flow around
`POST /v1/publish/agents/{agent_id}/verify-domain`.

If you are new to the repo, the main point to keep in mind is simple:

- `PUT /publish` proves the registry can fetch and normalize a card
- `POST /verify-domain` proves the publisher controls the canonical card origin
- only after both succeed may a record become `active`

## Why This Exists

The registry must not make an entry discoverable just because a caller knows a
valid `agent_card_url`.

Without domain verification:

- a caller could publish someone else's Agent Card URL
- a caller could try to bind a namespace it does not control
- the registry could expose a discoverable entry without proof that the
  publisher controls the canonical card origin

Domain verification is the control that binds:

- the publisher subject
- the namespace
- the canonical Agent Card origin

into one verified ownership boundary.

## Maintainer Mental Model

Think of the workflow as a two-phase gate.

```text
Phase 1: Publish
  "Is this card fetchable, valid, and normalizable?"

Phase 2: Verify Domain
  "Does this publisher control the same HTTPS origin as the canonical card?"

Only if both are true:
  pending_verification -> active
```

This separation is intentional:

- publish is about card validity and registry-owned normalization
- verify is about ownership of the canonical origin
- activation requires both

## Happy Path

```text
Publisher                  AgentHub                    Agent Card Origin
   |                          |                               |
   | PUT /v1/publish/agents/{agent_id}                        |
   | agent_card_url=https://travel.example.com/...            |
   |------------------------->|                               |
   |                          | GET canonical Agent Card      |
   |                          |------------------------------>|
   |                          | validate + normalize snapshot |
   |                          | write pending publication     |
   |                          | write challenge               |
   |<-------------------------|                               |
   | 201/200 pending_verification + challenge                 |
   |                                                          |
   | serve verification file at                               |
   | /.well-known/agenthub-verification/{agent_id}            |
   |                                                          |
   | body must be exactly:                                    |
   | agent_id=acme.travel-planner                             |
   | token=ahv1_...                                           |
   |                                                          |
   | POST /v1/publish/agents/{agent_id}/verify-domain         |
   |------------------------->|                               |
   |                          | read stored publication       |
   |                          | read stored challenge         |
   |                          | GET stored challenge URL      |
   |                          |------------------------------>|
   |                          | require same HTTPS origin     |
   |                          | require exact body match      |
   |                          | claim namespace if unowned    |
   |                          | mark publication active       |
   |                          | delete challenge              |
   |<-------------------------|                               |
   | 200 active + verified_at                                 |
```

## State Machine

For this flow, the critical transition is:

```text
new publication
   |
   v
pending_verification
   |
   | verify-domain succeeds
   v
active
```

Important implication for maintainers:

- publish must never skip directly to `active`
- verify must not activate records outside `pending_verification`
- `active` records should not carry an outstanding verification challenge

## What Each Endpoint Owns

```text
PUT /v1/publish/agents/{agent_id}
  - validates agent_id and request shape
  - fetches canonical Agent Card
  - validates enough card structure for discovery
  - normalizes registry-owned snapshot fields
  - writes publication as pending_verification
  - issues or refreshes a well-known challenge
  - does not activate the record

POST /v1/publish/agents/{agent_id}/verify-domain
  - requires authenticated owner access
  - reads stored challenge state
  - rejects expired or missing active challenge state
  - fetches the stored well-known verification URL
  - enforces same-origin HTTPS redirects only
  - requires exact body match
  - claims namespace on first success
  - marks record active
  - clears challenge state
```

## Registry-Owned State

The verification flow updates three pieces of persisted state.

```text
agent_publications
  - holds lifecycle state
  - starts as pending_verification after publish
  - becomes active after successful verify-domain
  - stores verified_at once verification succeeds

verification_challenges
  - holds the current well_known_token challenge
  - is created or refreshed during publish
  - is deleted after successful verification

namespaces
  - holds namespace ownership
  - is populated on first successful verification for an unclaimed namespace
  - becomes the authorization source for later admin operations
```

Another way to read the same flow:

```text
publish writes:
  agent_publications + agent_snapshots + verification_challenges

verify-domain writes:
  namespaces (if needed) + agent_publications + delete verification_challenges
```

## Namespace Binding

Namespace ownership is not finalized at publish time. It is finalized on first
successful domain verification.

```text
before verification:
  namespace "acme" -> unowned
  publication "acme.travel-planner" -> pending_owner_subject=publisher:test

after first successful verification:
  namespace "acme" -> owner_subject=publisher:test
  publication "acme.travel-planner" -> active

after that:
  publish/get/verify/deactivate for acme.*
  -> must come from that owner subject
```

This is the main reason verification is part of the ownership model rather than
just a discovery-health check.

## Exact Proof Rules

New team members usually need this section when debugging failed verification.

The verification fetch is strict by design:

- the URL comes from stored challenge state, not from the request body
- the verification resource must stay on the same scheme, host, and port as
  `agent_card_ref.source_url`
- redirects are allowed only when every hop stays on that same HTTPS origin
- the final response must be `200 OK`
- the body must be exactly:

```text
agent_id=<agent_id>
token=<challenge token>
```

- one trailing newline is allowed
- any other body shape fails verification

Treat this as an ownership proof, not a best-effort heuristic.

## Failure Cases

These are the failure modes that matter most in code review and debugging.

```text
Case: challenge expired
pending_verification -> verify-domain -> 409 verification_challenge_expired

Case: wrong file body
pending_verification -> verify-domain -> 403 domain_verification_failed

Case: file missing / non-200
pending_verification -> verify-domain -> 403 domain_verification_failed

Case: redirect changes origin
pending_verification -> verify-domain -> 403 domain_verification_failed

Case: redirect changes HTTPS status
pending_verification -> verify-domain -> 403 domain_verification_failed

Case: wrong owner tries to verify
pending_verification -> verify-domain -> 403 publication_forbidden

Case: record is already active
active -> verify-domain -> reject as ineligible
```

## Where To Read The Code

For onboarding, these are the highest-value entry points:

- `src/modules/publication/publication.service.ts`
  publish-time validation, normalization, and challenge issuance
- `src/modules/verification/verification.service.ts`
  verify-time ownership checks, proof fetching, and activation
- `src/modules/publication/publication.repo.ts`
  atomic persistence transitions, including namespace claim and challenge cleanup
- `src/common/types/api.ts`
  public request and response shapes
- `src/tests/unit/services.unit.test.ts`
  service-level verification scenarios
- `src/tests/integration/routes.integration.test.ts`
  route-level verification behavior and error envelopes

Read those in that order if you are trying to understand the feature from
scratch.

## Maintainer Debug Checklist

When verification fails unexpectedly, check these in order:

1. Is the publication still `pending_verification`?
2. Does the record still have a stored challenge?
3. Is the challenge still unexpired?
4. Does the stored challenge URL stay on the same HTTPS origin as
   `agent_card_ref.source_url`?
5. Does the served body exactly match `agent_id=...` and `token=...`?
6. Is the caller the pending owner or bound namespace owner?
7. After success, was the namespace claimed and was the challenge deleted?

If one of these is false, the failure is usually correct.

## Review Invariants

When reviewing changes in this area, preserve these invariants:

- verification must use stored challenge state, not caller-supplied origin data
- publish must not activate a record
- verification must not bypass owner checks
- namespace claim must happen on first successful verification, not before
- challenge state must not remain active after successful verification
- redirects must never allow origin drift

If a change weakens any of those, it is likely changing the ownership model,
not just refactoring implementation details.
