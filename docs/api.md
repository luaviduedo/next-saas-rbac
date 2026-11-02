# API Reference

Base URL: `http://localhost:3333`

Interactive OpenAPI documentation: **<http://localhost:3333/docs>**

- [Conventions](#conventions)
- [Endpoint index](#endpoint-index)
- [Authentication](#authentication-endpoints)
- [Organizations](#organization-endpoints)
- [Members](#member-endpoints)
- [Projects](#project-endpoints)
- [Invites](#invite-endpoints)
- [Billing](#billing-endpoints)
- [Common workflows](#common-workflows)

---

## Conventions

### Authentication

Protected endpoints require a bearer token obtained from `POST /sessions/password` or `POST /sessions/github`:

```http
Authorization: Bearer <jwt>
```

The JWT contains `sub` (user ID), is signed with `JWT_SECRET`, and expires after **7 days**.

Organization-scoped endpoints additionally require the authenticated user to be a **member** of the organization identified by `:slug`. Non-members receive `401` even with a valid token.

### Request format

- Bodies are JSON (`Content-Type: application/json`).
- No pagination, filtering or sorting parameters exist. List endpoints return everything.
- Slugs are generated server-side from names (`createSlug`), lowercased and accent-stripped.

### Response format

- Dates are ISO 8601 strings in JSON.
- `204` responses have an empty body.
- Validation is performed by Zod before the handler runs.

### Errors

| Status | Body | Meaning |
| --- | --- | --- |
| `400` | `{ "message": "Validation Error", "errors": ... }` | Body/params failed Zod validation |
| `400` | `{ "message": "..." }` | Business rule violation |
| `401` | `{ "message": "..." }` | Missing/invalid token, not a member, or permission denied |
| `500` | `{ "message": "Internal server error." }` | Unhandled error (including Prisma unique-constraint conflicts) |

### ⚠️ Route path bug

Four route strings contain a **trailing comma**, which changes how Fastify registers them:

| Intended path | What actually happens | File |
| --- | --- | --- |
| `GET /organizations/:slug/members` | Registered as `.../members,` (literal comma) → intended path `404` | `routes/members/get-members.ts` |
| `PUT /organizations/:slug/members/:memberId` | Param is parsed as `:memberId,`, so `memberId` is missing → `400` validation error | `routes/members/update-member.ts` |
| `DELETE /organizations/:slug/members/:memberId` | Param is parsed as `:memberId,`, so `memberId` is missing → `400` validation error | `routes/members/remove-member.ts` |
| `GET /organizations/:slug/projects` | Registered as `.../projects,` (literal comma) → intended path `404` | `routes/projects/get-projects.ts` |

This reference uses the **intended** paths below and marks them with `†`. Fix the source strings before relying on these four endpoints.

### Role values

`ADMIN` · `MEMBER` · `BILLING` — see [RBAC reference](./rbac.md).

### OpenAPI caveat

Swagger UI is generated from the route schemas. A few protected routes (`GET /pending-invites`, `POST /invites/:inviteId/accept`, `POST /invites/:inviteId/reject`) omit `security` metadata, so they appear without a lock icon even though they require a bearer token.

---

## Endpoint index

| Method | Path | Auth | Required permission | Success |
| --- | --- | --- | --- | --- |
| `POST` | `/users` | — | — | `201` |
| `POST` | `/sessions/password` | — | — | `201 { token }` |
| `POST` | `/sessions/github` | — | — | `201 { token }` |
| `GET` | `/profile` | Bearer | — | `200` |
| `POST` | `/password/recover` | — | — | `201 null` |
| `POST` | `/password/reset` | — | — | `204` |
| `GET` | `/organizations` | Bearer | — | `200` |
| `POST` | `/organizations` | Bearer | — | `201 { organizationId }` |
| `GET` | `/organizations/:slug` | Bearer + member | membership | `200` |
| `GET` | `/organizations/:slug/membership` | Bearer + member | membership | `200` |
| `PUT` | `/organizations/:slug` | Bearer + member | `update Organization` (owner) | `204` |
| `DELETE` | `/organizations/:slug` | Bearer + member | `delete Organization` | `204` |
| `PATCH` | `/organizations/:slug/owner` | Bearer + member | `transfer_ownership` (owner) | `204` |
| `GET` | `/organizations/:slug/members` † | Bearer + member | `get User` | `200` |
| `PUT` | `/organizations/:slug/members/:memberId` † | Bearer + member | `update User` | `204` |
| `DELETE` | `/organizations/:slug/members/:memberId` † | Bearer + member | `delete User` | `204` |
| `POST` | `/organizations/:slug/projects` | Bearer + member | `create Project` | `201 { projectId }` |
| `GET` | `/organizations/:slug/projects` † | Bearer + member | `get Project` | `200` |
| `GET` | `/organizations/:orgSlug/projects/:projectSlug` | Bearer + member | `get Project` | `200` |
| `PUT` | `/organizations/:slug/projects/:projectId` | Bearer + member | `update Project` | `204` |
| `DELETE` | `/organizations/:slug/projects/:projectId` | Bearer + member | `delete Project` | `204` |
| `POST` | `/organizations/:slug/invites` | Bearer + member | `create Invite` | `201 { inviteId }` |
| `GET` | `/organizations/:slug/invites` | Bearer + member | `create Invite` | `200` |
| `POST` | `/organizations/:slug/invites/:inviteId` | Bearer + member | `delete Invite` | `204` |
| `GET` | `/invites/:inviteId` | — | — | `200` |
| `GET` | `/pending-invites` | Bearer | — | `200` |
| `POST` | `/invites/:inviteId/accept` | Bearer | invite e-mail match | `204` |
| `POST` | `/invites/:inviteId/reject` | Bearer | invite e-mail match | `204` |
| `GET` | `/organizations/:slug/billing` | Bearer + member | `get Billing` | `200` |

---

## Authentication endpoints

### `POST /users` — create account

Public. Creates a user with a bcrypt-hashed password.

**Body**

| Field | Type | Rules |
| --- | --- | --- |
| `name` | string | required |
| `email` | string | valid e-mail, unique |
| `password` | string | minimum 6 characters |

```json
{ "name": "John Doe", "email": "john@acme.com", "password": "123456" }
```

**Response** `201` with an empty body.

**Errors**

- `400` — `user with same e-mail already exists.`
- `400` — validation error.

**Side effect:** if an organization has `domain` equal to the e-mail domain and `shouldAttachUsersByDomain = true`, the user is automatically added as a `MEMBER` of that organization.

---

### `POST /sessions/password` — sign in with password

Public.

**Body**

```json
{ "email": "john@acme.com", "password": "123456" }
```

**Response** `201`

```json
{ "token": "eyJhbGciOiJIUzI1NiIs..." }
```

**Errors**

- `400` — `Invalid credentials.`
- `400` — `User does not have a password, use social login.`

---

### `POST /sessions/github` — sign in with GitHub

Public. Exchanges a GitHub OAuth `code` for an access token, fetches the profile, and creates the user/account if needed.

**Body**

```json
{ "code": "gho_xxxxxxxx" }
```

**Response** `201`

```json
{ "token": "eyJhbGciOiJIUzI1NiIs..." }
```

**Errors**

- `400` — `Your GitHub Profile must have an email to authenticate.`
- `400` — validation error if GitHub's response is malformed.

The API uses `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` and `GITHUB_OAUTH_CLIENT_REDIRECT_URI`.

---

### `GET /profile` — current user

Bearer token.

**Response** `200`

```json
{
  "user": {
    "id": "6d2c1f6a-...",
    "name": "John Doe",
    "email": "john@acme.com",
    "avatarUrl": "https://avatars.githubusercontent.com/u/..."
  }
}
```

**Errors:** `400` if the token's user no longer exists; `401` if the token is invalid.

---

### `POST /password/recover` — request password recovery

Public.

**Body**

```json
{ "email": "john@acme.com" }
```

**Response** `201 null` — always, even if the e-mail is unknown (prevents account enumeration).

**Side effect:** a `PASSWORD_RECOVER` token is created and printed to the **server console**. No e-mail is sent.

---

### `POST /password/reset` — reset password

Public.

**Body**

| Field | Type | Rules |
| --- | --- | --- |
| `code` | string | reset token (UUID) |
| `password` | string | minimum 6 characters |

```json
{ "code": "a7f2e4c1-...", "password": "new-password" }
```

**Response** `204`.

**Errors:** `401` if the code does not exist. The token is deleted after use. Tokens currently have **no expiry**.

---

## Organization endpoints

### `GET /organizations` — organizations of the current user

Bearer token.

**Response** `200`

```json
{
  "organizations": [
    {
      "id": "c1a2...",
      "name": "Acme Inc (Admin)",
      "slug": "acme-admin",
      "avatarUrl": null,
      "role": "ADMIN"
    }
  ]
}
```

`role` is the current user's membership role in that organization.

---

### `POST /organizations` — create organization

Bearer token. The creator becomes the owner and an `ADMIN` member.

**Body**

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | required; slug generated from it |
| `domain` | string \| null | optional; must be unique |
| `shouldAttachUsersByDomain` | boolean | optional; auto-join behavior |

**Response** `201`

```json
{ "organizationId": "c1a2..." }
```

**Errors:** `400` if another organization already uses the domain.

---

### `GET /organizations/:slug` — organization details

Bearer token + membership (any role).

**Response** `200`

```json
{
  "organization": {
    "id": "c1a2...",
    "name": "Acme Inc (Admin)",
    "slug": "acme-admin",
    "domain": "acme.com",
    "shouldAttachUsersByDomain": true,
    "avatarUrl": null,
    "ownerId": "6d2c...",
    "createdAt": "2026-10-30T15:36:29.000Z",
    "updatedAt": "2026-10-30T15:36:29.000Z"
  }
}
```

**Errors:** `401` — `You're not a member of this organization.`

---

### `GET /organizations/:slug/membership` — current membership

Bearer token + membership.

**Response** `200`

```json
{
  "membership": {
    "id": "e9b1...",
    "role": "ADMIN",
    "organizationId": "c1a2..."
  }
}
```

---

### `PUT /organizations/:slug` — update organization

Bearer token + membership + `update Organization` ability. **Only the owner** passes this check.

**Body**

```json
{
  "name": "Acme Inc",
  "domain": "acme.com",
  "shouldAttachUsersByDomain": true
}
```

**Response** `204`.

**Errors**

- `400` — another organization uses the domain.
- `401` — not allowed (non-owner admin, member, billing).

The slug is **not** regenerated when the name changes.

---

### `DELETE /organizations/:slug` — shut down organization

Bearer token + membership + `delete Organization` ability. Any `ADMIN` (owner or not) passes.

**Response** `204`.

**Side effects:** cascades members, invites and projects. Users are not deleted.

---

### `PATCH /organizations/:slug/owner` — transfer ownership

Bearer token + membership + `transfer_ownership` ability. **Only the current owner** passes.

**Body**

```json
{ "transferToUserId": "6d2c1f6a-..." }
```

The target must already be a member of the organization.

**Response** `204`.

**Errors**

- `400` — `Target user is not a member of this organization.`
- `401` — not the owner.

> **Known bug:** the member promotion and organization update are not awaited inside `$transaction`. They execute outside the transaction, so the operation is not atomic and errors are not surfaced. See [Known limitations](../README.md#known-limitations).

---

## Member endpoints

### `GET /organizations/:slug/members` † — list members

Bearer token + membership + `get User` ability (`ADMIN`, `MEMBER`).

**Response** `200`

```json
{
  "members": [
    {
      "id": "e9b1...",
      "userId": "6d2c...",
      "role": "ADMIN",
      "name": "John Doe",
      "email": "john@acme.com",
      "avatarUrl": "https://..."
    }
  ]
}
```

Ordered by role ascending using the PostgreSQL enum order (`ADMIN`, `MEMBER`, `BILLING`).

**Errors:** `401` for `BILLING` members — they have no `get User` permission.

---

### `PUT /organizations/:slug/members/:memberId` † — update member role

Bearer token + membership + `update User` ability (`ADMIN`).

**Params:** `memberId` is the **membership ID** (`Member.id`), not the user ID.

**Body**

```json
{ "role": "MEMBER" }
```

Allowed roles: `ADMIN`, `MEMBER`, `BILLING`.

**Response** `204`.

**Errors:** `401` for non-admins. The endpoint does not prevent demoting the owner or changing your own role.

---

### `DELETE /organizations/:slug/members/:memberId` † — remove member

Bearer token + membership + `delete User` ability (`ADMIN`).

**Params:** `memberId` is the membership ID.

**Response** `204`.

**Errors:** `401` for non-admins.

There is no self-service "leave organization" endpoint.

---

## Project endpoints

### `POST /organizations/:slug/projects` — create project

Bearer token + membership + `create Project` ability (`ADMIN`, `MEMBER`).

**Body**

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | slug generated from it |
| `description` | string | required |

```json
{ "name": "Website", "description": "Marketing site" }
```

**Response** `201`

```json
{ "projectId": "0f7a..." }
```

The current user becomes `ownerId`. There is no `url` field in the data model.

**Errors:** `401` for `BILLING`.

---

### `GET /organizations/:slug/projects` † — list projects

Bearer token + membership + `get Project` ability (`ADMIN`, `MEMBER`).

**Response** `200`

```json
{
  "projects": [
    {
      "id": "0f7a...",
      "name": "Website",
      "description": "Marketing site",
      "slug": "website",
      "avatarUrl": null,
      "organizationId": "c1a2...",
      "ownerId": "6d2c...",
      "createdAt": "2026-10-30T15:36:29.000Z",
      "owner": {
        "id": "6d2c...",
        "name": "John Doe",
        "avatarUrl": "https://..."
      }
    }
  ]
}
```

Ordered by `createdAt` descending.

---

### `GET /organizations/:orgSlug/projects/:projectSlug` — project details

Bearer token + membership + `get Project` ability. Note that this route uses `:orgSlug`, unlike the other organization routes which use `:slug`.

**Response** `200`

```json
{
  "project": {
    "id": "0f7a...",
    "name": "Website",
    "description": "Marketing site",
    "slug": "website",
    "avatarUrl": null,
    "ownerId": "6d2c...",
    "organizationId": "c1a2...",
    "owner": {
      "id": "6d2c...",
      "name": "John Doe",
      "avatarUrl": "https://..."
    }
  }
}
```

**Errors:** `400` — `Project not found.`

---

### `PUT /organizations/:slug/projects/:projectId` — update project

Bearer token + membership + `update Project` ability. `ADMIN` can update any project; `MEMBER` only projects they own.

**Params:** `projectId` is `Project.id` (UUID).

**Body**

```json
{ "name": "Website v2", "description": "Updated description" }
```

**Response** `204`.

**Errors**

- `400` — project not found in this organization.
- `401` — member is not the project owner.

The slug is not regenerated on rename.

---

### `DELETE /organizations/:slug/projects/:projectId` — delete project

Bearer token + membership + `delete Project` ability. Same ownership rules as update.

**Response** `204`.

---

## Invite endpoints

### `POST /organizations/:slug/invites` — create invite

Bearer token + membership + `create Invite` ability (`ADMIN`).

**Body**

```json
{ "email": "new.member@example.com", "role": "MEMBER" }
```

**Response** `201`

```json
{ "inviteId": "4b8e..." }
```

**Errors**

- `400` — an invite with this e-mail already exists for the organization.
- `400` — the e-mail already belongs to a member.
- `400` — the domain auto-joins users (intended; currently broken, see below).

> **Known bug:** the auto-join guard does `const [, domain] = email`, which extracts the second character of the e-mail rather than the domain, so the check never matches. See [Known limitations](../README.md#known-limitations).

No e-mail is sent; the invite ID is the only handle.

---

### `GET /organizations/:slug/invites` — list invites

Bearer token + membership + `create Invite` ability (`ADMIN`).

**Response** `200`

```json
{
  "invites": [
    {
      "id": "4b8e...",
      "email": "new.member@example.com",
      "role": "MEMBER",
      "createdAt": "2026-10-30T15:36:29.000Z",
      "author": { "id": "6d2c...", "name": "John Doe" }
    }
  ]
}
```

`author` is `null` if the author's account was deleted. Ordered newest first.

> Read access is guarded by the `create Invite` permission, so `MEMBER` and `BILLING` cannot list invites.

---

### `GET /invites/:inviteId` — public invite details

No authentication. Used to render an invite acceptance page.

**Response** `200`

```json
{
  "invite": {
    "id": "4b8e...",
    "email": "new.member@example.com",
    "role": "MEMBER",
    "createdAt": "2026-10-30T15:36:29.000Z",
    "author": {
      "id": "6d2c...",
      "name": "John Doe",
      "avatarUrl": "https://..."
    },
    "organization": { "name": "Acme Inc" }
  }
}
```

**Errors:** `400` — `Invite not found.`

---

### `GET /pending-invites` — current user's invites

Bearer token. Returns invites whose `email` exactly matches the authenticated user's e-mail.

**Response** `200` (the schema incorrectly declares `204`)

```json
{
  "invites": [
    {
      "id": "4b8e...",
      "email": "john@acme.com",
      "role": "MEMBER",
      "createdAt": "2026-10-30T15:36:29.000Z",
      "author": { "id": "6d2c...", "name": "John Doe", "avatarUrl": null },
      "organization": { "name": "Acme Inc" }
    }
  ]
}
```

---

### `POST /invites/:inviteId/accept` — accept invite

Bearer token. The invite e-mail must match the authenticated user's e-mail.

**Response** `204`.

**Side effects:** creates a `Member` with the invite's role and deletes the invite, in a transaction.

**Errors**

- `400` — invite not found/expired.
- `400` — `This invite belongs to another user.`
- `500` — if the user is already a member (unique constraint is not handled).

---

### `POST /invites/:inviteId/reject` — reject invite

Bearer token. Same e-mail ownership check as accept.

**Response** `204`.

**Side effect:** deletes the invite. The user is not added to the organization.

---

### `POST /organizations/:slug/invites/:inviteId` — revoke invite

Bearer token + membership + `delete Invite` ability (`ADMIN`). Note the verb is `POST`, not `DELETE`.

**Response** `204`.

**Errors:** `400` — invite not found in this organization.

---

## Billing endpoints

### `GET /organizations/:slug/billing` — billing details

Bearer token + membership + `get Billing` ability (`ADMIN`, `BILLING`).

**Pricing**

- **$10** per member seat, excluding members whose role is `BILLING`.
- **$20** per project.

**Response** `200`

```json
{
  "billing": {
    "seats": { "amount": 3, "unit": 10, "price": 30 },
    "projects": { "amount": 3, "unit": 20, "price": 60 },
    "total": 90
  }
}
```

| Field | Meaning |
| --- | --- |
| `seats.amount` | members with a role other than `BILLING` |
| `seats.unit` | price per seat (`10`) |
| `seats.price` | `amount × unit` |
| `projects.amount` | projects in the organization |
| `projects.unit` | price per project (`20`) |
| `projects.price` | `amount × unit` |
| `total` | `seats.price + projects.price` |

There is no export endpoint and no payment provider integration; amounts are computed on the fly.

---

## Common workflows

### 1. Create an account and sign in

```bash
curl -X POST http://localhost:3333/users \
  -H 'Content-Type: application/json' \
  -d '{"name":"John Doe","email":"john@acme.com","password":"123456"}'

TOKEN=$(curl -s -X POST http://localhost:3333/sessions/password \
  -H 'Content-Type: application/json' \
  -d '{"email":"john@acme.com","password":"123456"}' | jq -r .token)
```

### 2. Create an organization and a project

```bash
ORG=$(curl -s -X POST http://localhost:3333/organizations \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Acme Inc"}' | jq -r .organizationId)

curl -X POST http://localhost:3333/organizations/acme-inc/projects \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Website","description":"Marketing site"}'
```

### 3. Invite a member and accept

```bash
INVITE=$(curl -s -X POST http://localhost:3333/organizations/acme-inc/invites \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"email":"member@example.com","role":"MEMBER"}' | jq -r .inviteId)

# As the invited user (logged in):
curl -X POST http://localhost:3333/invites/$INVITE/accept \
  -H "Authorization: Bearer $MEMBER_TOKEN"
```

### 4. Check billing

```bash
curl http://localhost:3333/organizations/acme-inc/billing \
  -H "Authorization: Bearer $TOKEN"
```

For permission rules and ownership conditions, see [RBAC reference](./rbac.md).
