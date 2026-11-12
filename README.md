# Next.js SaaS + RBAC

A multi-tenant SaaS boilerplate built as a **pnpm + Turborepo monorepo**. It pairs a **Fastify** REST API (JWT authentication, Prisma/PostgreSQL, CASL authorization) with a **Next.js App Router** frontend.

The domain is simple on purpose: users belong to **organizations**, organizations own **projects**, and access is controlled by **roles** plus resource **ownership**.

- [Architecture](./docs/architecture.md) — how the pieces fit together, request lifecycle, data model
- [API reference](./docs/api.md) — every endpoint, payload, response and required permission
- [RBAC reference](./docs/rbac.md) — roles, effective permission matrix, extension guide

---

## Table of contents

- [Stack](#stack)
- [Repository layout](#repository-layout)
- [Feature status](#feature-status)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Database](#database)
- [Running the apps](#running-the-apps)
- [Authentication](#authentication)
- [Authorization in one minute](#authorization-in-one-minute)
- [Seed data](#seed-data)
- [Known limitations](#known-limitations)
- [Roadmap](#roadmap)

---

## Stack

| Layer | Technology |
| --- | --- |
| Monorepo | pnpm workspaces, Turborepo 2 |
| API | Fastify 5, `fastify-type-provider-zod`, `@fastify/jwt`, `@fastify/swagger` |
| Validation / types | Zod 4 (shared between HTTP schemas and RBAC models) |
| Database | PostgreSQL, Prisma 7 (`@prisma/adapter-pg`) |
| Authorization | CASL (`@casl/ability`) with typed subjects |
| Web | Next.js 15 (App Router, Turbopack), React 19, Tailwind CSS 4, shadcn-style UI |
| HTTP client | `ky` |
| Tooling | TypeScript (strict), ESLint and Prettier configs, `dotenv-cli` |

**Requirements:** Node.js 20.19+ (Prisma 7 requires `^20.19`, `^22.12` or `>=24`), pnpm 9 (`corepack enable`), Docker (optional, for PostgreSQL).

---

## Repository layout

```
next-saas-rbac/
├── apps/
│   ├── api/                     # Fastify REST API
│   │   ├── prisma/
│   │   │   ├── schema.prisma    # Data model
│   │   │   ├── migrations/      # SQL migrations
│   │   │   └── seed.ts          # Demo data
│   │   └── src/
│   │       ├── http/
│   │       │   ├── server.ts    # App bootstrap + route registration
│   │       │   ├── error-handler.ts
│   │       │   ├── middlewares/auth.ts
│   │       │   └── routes/      # One file per endpoint, grouped by resource
│   │       ├── lib/prisma.ts
│   │       └── utils/
│   ├── web/                     # Next.js frontend
│   │   └── src/
│   │       ├── app/             # App Router pages, server actions, route handlers
│   │       ├── auth/auth.ts     # Session helpers
│   │       ├── http/            # Typed API client
│   │       └── components/ui/   # Reusable UI primitives
├── packages/
│   ├── auth/                    # CASL roles, subjects, models, permissions
│   └── env/                     # Type-safe environment validation (t3-env)
├── config/
│   ├── eslint-config/
│   ├── prettier/
│   └── typescript-config/
├── docker-compose.yml           # PostgreSQL for local development
├── turbo.json
└── pnpm-workspace.yaml
```

Turborepo orchestrates `dev` and `build`. The `lint` and `check-types` tasks are declared in `turbo.json`, but no workspace currently exposes those scripts, so those commands are effectively no-ops.

---

## Feature status

Legend: ✅ implemented · 🟡 API implemented, UI missing/partial · ❌ not implemented

Feature status describes the **API** unless a row mentions the web app. The frontend currently only covers authentication and profile display — see [Web UI](#web-ui).

### Authentication

| Feature | Status | Notes |
| --- | --- | --- |
| Sign up with e-mail, name, password | 🟡 | `POST /users` works; the sign-up page is not wired to it yet |
| Sign in with e-mail & password | ✅ | `POST /sessions/password` + working sign-in form |
| Sign in with GitHub | ✅ | OAuth callback route + API exchange |
| Password recovery | 🟡 | API creates a token and logs it to the server console; no e-mail is sent and the forgot-password form is not wired |
| Password reset | ✅ | `POST /password/reset` with the token |
| Get current profile | ✅ | `GET /profile`, rendered as JSON on `/` |

### Organizations

| Feature | Status |
| --- | --- |
| Create organization (creator becomes `ADMIN`) | ✅ |
| List organizations the user belongs to | ✅ |
| Get organization details | ✅ |
| Get the user's membership/role | ✅ |
| Update organization | ✅ Owner only |
| Shut down (delete) organization | ✅ Any `ADMIN` |
| Transfer ownership | ✅ Owner only (see known bugs) |
| Automatic join by e-mail domain | ✅ |

### Invites

| Feature | Status | Notes |
| --- | --- | --- |
| Invite a member (e-mail + role) | ✅ | No e-mail delivery; the invite ID is returned |
| List organization invites | ✅ (admins only) |
| Get a single invite (public) | ✅ |
| List the current user's pending invites | ✅ |
| Accept an invite | ✅ |
| Reject an invite | ✅ |
| Revoke a pending invite | ✅ |

### Members

| Feature | Status | Notes |
| --- | --- | --- |
| List organization members | ✅ | Admins and members; billing cannot. See [route caveat](#known-limitations) |
| Update a member's role | ✅ | |
| Remove a member | ✅ | |
| Leave an organization voluntarily | ❌ |

### Projects

| Feature | Status |
| --- | --- |
| List projects in an organization | ✅ (admins and members) |
| Get project details | ✅ (admins and members) |
| Create project (name, description) | ✅ |
| Update project | ✅ |
| Delete project | ✅ |

### Billing

| Feature | Status | Notes |
| --- | --- | --- |
| Get billing details | ✅ | $20/project, $10/member (billing members excluded) |
| Export billing details | ❌ | Permission exists in CASL, no endpoint |

### Web UI

The frontend currently covers **sign-in (password + GitHub)** and **profile display**. Organization, invite, member, project and billing screens are not built yet; the API is ready for them.

---

## Getting started

```bash
# 1. Clone and install
git clone <repository-url> next-saas-rbac
cd next-saas-rbac
pnpm install

# 2. Start PostgreSQL
docker compose up -d

# 3. Configure environment
cp .env.example .env
# edit .env — at minimum set JWT_SECRET and the GitHub OAuth credentials

# 4. Create the schema and generate the Prisma client
pnpm --filter @saas/api db:migrate
pnpm --filter @saas/api db:generate

# 5. (Optional) seed demo data
pnpm --filter @saas/api env:load prisma db seed

# 6. Run API (3333) and web (3000) together
pnpm dev
```

- Web: <http://localhost:3000>
- API: <http://localhost:3333>
- OpenAPI UI: <http://localhost:3333/docs>

> The API reads the **root** `.env` through `dotenv-cli` (`dotenv -e ../../.env --`). Do not create a second `.env` inside `apps/api`.

---

## Environment variables

All variables are validated at boot by `packages/env/index.ts`; the API refuses to start if a required value is missing.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `SERVER_PORT` | no | `3333` | API port |
| `DATABASE_URL` | yes | — | PostgreSQL connection string |
| `JWT_SECRET` | yes | — | Secret used to sign JWTs (7-day expiry) |
| `GITHUB_OAUTH_CLIENT_ID` | yes | — | GitHub OAuth app client ID |
| `GITHUB_OAUTH_CLIENT_SECRET` | yes | — | GitHub OAuth app client secret |
| `GITHUB_OAUTH_CLIENT_REDIRECT_URI` | yes | — | Must match the GitHub app callback, e.g. `http://localhost:3000/api/auth/callback` |

Example values live in [`.env.example`](./.env.example).

> All six variables are validated at boot, including the GitHub ones. If you are not using GitHub sign-in yet, set placeholder but syntactically valid values (the redirect URI must be a URL) — otherwise the API will not start.

Two frontend values are currently **hardcoded** and must be edited manually when deploying:

- API base URL — `apps/web/src/http/api-client.ts` (`http://localhost:3333`)
- GitHub client ID and callback — `apps/web/src/app/auth/actions.tsx`

### GitHub OAuth setup

1. Create an OAuth App in GitHub → **Settings → Developer settings → OAuth Apps**.
2. Set **Authorization callback URL** to `http://localhost:3000/api/auth/callback`.
3. Put the client ID/secret in the root `.env`.
4. Update the same client ID and callback in `apps/web/src/app/auth/actions.tsx`.

---

## Database

Prisma models: `User`, `Account`, `Token`, `Organization`, `Member`, `Invite`, `Project`.

| Script (run from repo root) | What it does |
| --- | --- |
| `pnpm --filter @saas/api db:migrate` | `prisma migrate dev` |
| `pnpm --filter @saas/api db:generate` | Regenerate the Prisma client |
| `pnpm --filter @saas/api db:studio` | Open Prisma Studio |
| `pnpm --filter @saas/api env:load prisma db seed` | Run `prisma/seed.ts` |

`db:seed` is not a package script; Prisma 7 picks the seed command up from `apps/api/prisma.config.ts`.

The seed **deletes all organizations and users** before inserting demo data. Never run it against a database you care about.

See the [ER diagram](./docs/architecture.md#data-model) for relationships and delete behavior.

---

## Running the apps

| Command | Scope | Description |
| --- | --- | --- |
| `pnpm dev` | root | Runs `turbo run dev` (API + web) |
| `pnpm build` | root | Runs the Next.js production build (the only workspace with a `build` script) |
| `pnpm lint` | root | Declared, but no workspace has a `lint` script yet |
| `pnpm check-types` | root | Declared, but no workspace has a `check-types` script yet |
| `pnpm --filter @saas/api dev` | API | Fastify with `tsx watch` |
| `pnpm --filter @saas/web dev` | web | Next.js dev server (Turbopack) |

The API is a single Fastify process; every route file exports a plugin that is registered in `apps/api/src/http/server.ts`.

---

## Authentication

The API issues a **JWT signed with `JWT_SECRET`**, valid for **7 days**, with the user ID in `sub`.

```http
POST /sessions/password
Content-Type: application/json

{ "email": "john@acme.com", "password": "123456" }
```

```json
{ "token": "eyJhbGciOi..." }
```

Protected requests send:

```http
Authorization: Bearer <token>
```

The web app stores the token in a **`token` cookie** (7 days) and attaches it to API calls in `apps/web/src/http/api-client.ts`. The Next.js `auth()` helper redirects unauthenticated users to `/auth/sign-in`; `isAuthenticated()` only checks that the cookie exists.

> The cookie is currently set without `httpOnly`, `secure` or `sameSite` flags, and password-reset tokens never expire. Treat this as a development setup — see [Known limitations](#known-limitations).

---

## Authorization in one minute

Authorization is evaluated **per organization** using CASL. There is no global "admin" flag.

1. The request is authenticated → `userId`.
2. `getUserMembership(slug)` loads the user's `Member` row and the `Organization`.
3. `getUserPermissions(userId, membership.role)` builds a CASL ability from `packages/auth`.
4. The route asks `cannot(action, subject)` and throws `401` when denied.

Roles: `ADMIN`, `MEMBER`, `BILLING`. **"Owner" is not a role** — it is `Organization.ownerId`, and the owner is normally also an `ADMIN` member.

Effective rules:

- **ADMIN** can manage everything, except updating an organization or transferring ownership, which require `organization.ownerId === user.id`.
- **MEMBER** can list members, list/create projects, and update/delete **their own** projects.
- **BILLING** can only read/export billing.
- **Anonymous** has no organization access (public endpoints only).

Full matrix, conditions and extension guide: [docs/rbac.md](./docs/rbac.md).

---

## Seed data

`prisma/seed.ts` creates three organizations so each role can be exercised:

| Organization | Slug | John's role |
| --- | --- | --- |
| Acme Inc (Admin) | `acme-admin` | `ADMIN` (owner) |
| Acme Inc (Member) | `acme-member` | `MEMBER` (owner) |
| Acme Inc (Billing) | `acme-billing` | `BILLING` (owner) |

- Login: **`john@acme.com` / `123456`**
- Two additional faker-generated users are created with the same password (`123456`); their e-mails are random and can be read from the database.
- `acme-admin` has `shouldAttachUsersByDomain = true` with domain `acme.com`, so new `@acme.com` accounts join automatically.

---

## Known limitations

These are real behaviors of the current code, not design intentions:

1. **Four routes have a trailing comma in their path:**
   - `GET /organizations/:slug/members,`
   - `PUT /organizations/:slug/members/:memberId,`
   - `DELETE /organizations/:slug/members/:memberId,`
   - `GET /organizations/:slug/projects,`

   For the two `GET` routes the comma is a literal path segment, so the intended path returns `404`. For the member `PUT`/`DELETE` routes the comma becomes part of the parameter name (`:memberId,`), so `request.params.memberId` is missing and Zod rejects the request with `400`. Fix the route strings in `members/*.ts` and `projects/get-projects.ts`.
2. **Ownership transfer is not transactional.** In `transfer-organization.ts` the two Prisma calls are placed in an array inside `$transaction(async () => …)` but are never awaited or returned. They run against the global client outside the transaction, so the operation is not atomic and failures become unhandled promise rejections.
3. **Invite domain check is broken.** `create-invite.ts` does `const [, domain] = email`, which takes the second *character* of the e-mail instead of the domain. Use `email.split('@')[1]`.
4. **No invite e-mails.** The invite ID is returned; delivery is left to the client. Password recovery only logs the token to the server console.
5. **Sign-up and forgot-password pages are static.** Their forms have `action=""` and are not connected to the API.
6. **BILLING members cannot list members or projects**, even though the original specification allowed it. `BILLING` only has `manage Billing`.
7. **Any ADMIN can delete an organization**, while only the owner can update it or transfer ownership.
8. **Members cannot leave an organization.** Only admins can remove members.
9. **No billing export endpoint**, despite an `export Billing` permission.
10. **Security hardening pending:** `console.log(request.headers)` in the auth middleware logs bearer tokens; Prisma logs every query; CORS is unrestricted; cookies lack `httpOnly`/`secure`/`sameSite`; reset tokens have no expiry; there is no rate limiting.
11. **Lint and type-check pipelines are not wired up.** `turbo.json` defines `lint` and `check-types`, but no workspace declares those scripts, so `pnpm lint` / `pnpm check-types` do not check anything.
12. **No automated tests** (unit, integration or e2e) and no CI workflow.

---

## Roadmap

- [ ] Wire the sign-up and forgot-password forms to the API
- [ ] Send invite and password-recovery e-mails (provider of choice)
- [ ] Fix the route typos and the ownership-transfer transaction
- [ ] Add the missing organization/invite/member/project/billing UI
- [ ] Implement "leave organization" and billing export
- [ ] Move hardcoded API URL and GitHub credentials to environment variables
- [ ] Harden auth: httpOnly cookies, token expiry/rotation, rate limiting, remove header logging
- [ ] Add tests and a CI pipeline
