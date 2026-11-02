# RBAC Reference

Authorization is implemented with [CASL](https://casl.js.org/) in the shared `@saas/auth` package and enforced by the API on every organization-scoped route.

- [Core concepts](#core-concepts)
- [Roles](#roles)
- [Effective permission matrix](#effective-permission-matrix)
- [Conditions explained](#conditions-explained)
- [How an ability is built](#how-an-ability-is-built)
- [Route enforcement pattern](#route-enforcement-pattern)
- [Adding a permission](#adding-a-permission)
- [Specification vs implementation](#specification-vs-implementation)

---

## Core concepts

| Concept | Meaning in this codebase |
| --- | --- |
| **Role** | Stored on `Member.role`: `ADMIN`, `MEMBER` or `BILLING`. One role per user per organization. |
| **Owner** | `Organization.ownerId`. Not a role. The owner is normally also an `ADMIN` member, but ownership is tracked separately so it can be transferred. |
| **Subject** | The thing being acted on: `Organization`, `Project`, `Invite`, `User`, `Billing`. Some subjects are strings, some are Zod models carrying `ownerId`. |
| **Action** | A verb: `manage`, `get`, `create`, `update`, `delete`, `transfer_ownership`, `export`. |
| **Ability** | The per-request object returned by `defineAbilityFor(user)`, exposing `can` / `cannot`. |

The user object passed to CASL is minimal:

```ts
// packages/auth/src/models/user.ts
{ id: string, role: 'ADMIN' | 'MEMBER' | 'BILLING' }
```

---

## Roles

### `ADMIN`

```ts
can('manage', 'all')

cannot(['transfer_ownership', 'update'], 'Organization')
can(['transfer_ownership', 'update'], 'Organization', {
  ownerId: { $eq: user.id },
})
```

Broad administrative access. The two organization-level operations are carved back out and re-granted **only when the user owns the organization**.

### `MEMBER`

```ts
can('get', 'User')
can(['create', 'get'], 'Project')
can(['update', 'delete'], 'Project', { ownerId: { $eq: user.id } })
```

Can see teammates, create projects, and manage only projects they own.

### `BILLING`

```ts
can('manage', 'Billing')
```

Can read (and theoretically export) billing. Cannot see members or projects, list invites, or change organization settings.

### Anonymous

There is no `ANONYMOUS` role. Unauthenticated requests are rejected by the `auth` middleware before any ability is built.

---

## Effective permission matrix

This matrix reflects **what the code actually does**, including the difference between an owner and a non-owner administrator.

| Capability | Owner* | Admin (non-owner) | Member | Billing | Anonymous |
| --- | :---: | :---: | :---: | :---: | :---: |
| View organization details / membership | ✅ | ✅ | ✅ | ✅ | ❌ |
| Update organization | ✅ | ❌ | ❌ | ❌ | ❌ |
| Delete organization | ✅ | ✅ | ❌ | ❌ | ❌ |
| Invite a member | ✅ | ✅ | ❌ | ❌ | ❌ |
| List invites | ✅ | ✅ | ❌ | ❌ | ❌ |
| Revoke an invite | ✅ | ✅ | ❌ | ❌ | ❌ |
| List members | ✅ | ✅ | ✅ | ❌ | ❌ |
| Update member role | ✅ | ✅ | ❌ | ❌ | ❌ |
| Remove a member | ✅ | ✅ | ❌ | ❌ | ❌ |
| Leave organization | ❌ | ❌ | ❌ | ❌ | ❌ |
| Transfer ownership | ✅ | ❌ | ❌ | ❌ | ❌ |
| List projects | ✅ | ✅ | ✅ | ❌ | ❌ |
| Create a project | ✅ | ✅ | ✅ | ❌ | ❌ |
| Update a project | ✅ | ✅ | Author only | ❌ | ❌ |
| Delete a project | ✅ | ✅ | Author only | ❌ | ❌ |
| Get billing details | ✅ | ✅ | ❌ | ✅ | ❌ |
| Export billing details | Ability only | Ability only | ❌ | Ability only | ❌ |
| View an invite by ID (public) | ✅ | ✅ | ✅ | ✅ | ✅ |
| List own pending invites | ✅ | ✅ | ✅ | ✅ | ❌ |

\* **Owner** = `organization.ownerId === user.id` **and** member role `ADMIN`. Ownership alone is not enough: the seed's `acme-member` organization is owned by John, but John has the `MEMBER` role there, so he cannot update it.

> `Export billing` has a CASL permission (`export Billing`) but no HTTP endpoint, so it is not reachable today.

### Permission checks per endpoint

| Endpoint | Check performed |
| --- | --- |
| `GET /organizations` | authenticated |
| `POST /organizations` | authenticated (creator becomes `ADMIN`) |
| `GET /organizations/:slug` | membership |
| `GET /organizations/:slug/membership` | membership |
| `PUT /organizations/:slug` | `update Organization` (owner) |
| `DELETE /organizations/:slug` | `delete Organization` (any admin) |
| `PATCH /organizations/:slug/owner` | `transfer_ownership Organization` (owner) |
| `GET /organizations/:slug/members,` | `get User` |
| `PUT /organizations/:slug/members/:memberId,` | `update User` |
| `DELETE /organizations/:slug/members/:memberId,` | `delete User` |
| `POST /organizations/:slug/projects` | `create Project` |
| `GET /organizations/:slug/projects,` | `get Project` |
| `GET /organizations/:orgSlug/projects/:projectSlug` | `get Project` |
| `PUT /organizations/:slug/projects/:projectId` | `update Project` (owner-aware) |
| `DELETE /organizations/:slug/projects/:projectId` | `delete Project` (owner-aware) |
| `POST /organizations/:slug/invites` | `create Invite` |
| `GET /organizations/:slug/invites` | `create Invite` (read guarded by the create permission) |
| `POST /organizations/:slug/invites/:inviteId` | `delete Invite` |
| `GET /organizations/:slug/billing` | `get Billing` |
| `GET /invites/:inviteId` | public |
| `GET /pending-invites` | authenticated (filtered by e-mail) |
| `POST /invites/:inviteId/accept` | authenticated + invite e-mail must match |
| `POST /invites/:inviteId/reject` | authenticated + invite e-mail must match |

> The trailing commas in some paths are a known bug; see [Known limitations](../README.md#known-limitations).

---

## Conditions explained

### Only the owner may update an organization or transfer ownership

```ts
// ADMIN
cannot(['transfer_ownership', 'update'], 'Organization')
can(['transfer_ownership', 'update'], 'Organization', {
  ownerId: { $eq: user.id },
})
```

The route parses the organization into a subject containing `ownerId`, then:

```ts
const authOrganization = organizationSchema.parse(organization)
const { cannot } = getUserPermissions(userId, membership.role)

if (cannot('update', authOrganization)) {
  throw new UnauthorizedError(...)
}
```

CASL compares `user.id` with `organization.ownerId` automatically through the `ownerId: { $eq: user.id }` condition.

### Members may only modify their own projects

```ts
can(['update', 'delete'], 'Project', { ownerId: { $eq: user.id } })
```

The project is loaded first and passed as the subject:

```ts
const project = await prisma.project.findUnique({ ... })
const authProject = projectSchema.parse(project)

if (cannot('update', authProject)) {
  throw new UnauthorizedError(...)
}
```

This is why project update/delete routes load the row **before** checking permission: the subject must include `ownerId`.

### Transfer target must be a member

The transfer route additionally verifies that `transferToUserId` has a `Member` row in the organization. It then promotes that member to `ADMIN` and updates `Organization.ownerId`.

> **Current bug:** the two updates are in an un-awaited array inside `$transaction`, so they run outside the transaction and are not atomic. See [Known limitations](../README.md#known-limitations).

### One billing member per organization

The original specification says "Billing (one per organization)", but **nothing enforces this** — neither the database nor the API prevents multiple `BILLING` members. Billing seats simply exclude members whose role is `BILLING`.

### Invite acceptance

Acceptance requires `invite.email === user.email`:

```ts
if (invite.email !== user.email) {
  throw new BadRequestError('This invite belongs to another user.')
}
```

The invite ID is the secret; anyone with the ID can view the invite publicly, but only the matching account can accept or reject it.

---

## How an ability is built

```ts
// packages/auth/src/index.ts
export function defineAbilityFor(user: User) {
  const builder = new AbilityBuilder(createAppAbility)

  if (typeof permissions[user.role] !== 'function') {
    throw new Error(`Permissions for role ${user.role} not found`)
  }

  permissions[user.role](user, builder)

  const ability = builder.build({
    detectSubjectType(subject) {
      return subject.__typename
    },
  })

  ability.can = ability.can.bind(ability)
  ability.cannot = ability.cannot.bind(ability)

  return ability
}
```

- `detectSubjectType` reads `__typename`, which is why `organizationSchema` and `projectSchema` default `__typename` to `"Organization"` / `"Project"`.
- String subjects (`'User'`, `'Invite'`, `'Billing'`) are matched directly.
- The ability type is derived from the Zod union in `appAbilitiesSchema`, so an invalid `(action, subject)` pair is a TypeScript error.

API helper:

```ts
// apps/api/src/utils/get-user-permissions.ts
export function getUserPermissions(userId: string, role: Role) {
  const authUser = userSchema.parse({ id: userId, role })
  return defineAbilityFor(authUser)
}
```

---

## Route enforcement pattern

Every protected, organization-scoped route follows the same shape:

```ts
app
  .withTypeProvider<ZodTypeProvider>()
  .register(auth)
  .post('/organizations/:slug/resource', { schema }, async (request, reply) => {
    // 1. Authenticate
    const userId = await request.getCurrentUserId()

    // 2. Resolve tenant membership (throws 401 if not a member)
    const { organization, membership } = await request.getUserMembership(slug)

    // 3. Build ability
    const { cannot } = getUserPermissions(userId, membership.role)

    // 4. Check permission
    if (cannot('create', 'Resource')) {
      throw new UnauthorizedError(`You're not allowed to ...`)
    }

    // 5. Mutate/read within organization.id
  })
```

Rules of thumb:

- Always scope database queries by `organizationId`.
- Load ownership-aware resources before checking permission.
- Use `UnauthorizedError` for both authentication and authorization failures (current convention returns `401`).
- Never trust a role or `userId` sent by the client.

---

## Adding a permission

### 1. Define or extend the subject

`packages/auth/src/subjects/report.ts`:

```ts
import { z } from 'zod'

export const reportSubject = z.tuple([
  z.union([z.literal('manage'), z.literal('get'), z.literal('create')]),
  z.literal('Report'),
])

export type ReportSubject = z.infer<typeof reportSubject>
```

### 2. Register it in the ability union

`packages/auth/src/index.ts`:

```ts
import { reportSubject } from './subjects/report'

const appAbilitiesSchema = z.union([
  // ...
  reportSubject,
  z.tuple([z.literal('manage'), z.literal('all')]),
])
```

### 3. Grant it to a role

`packages/auth/src/permissions.ts`:

```ts
MEMBER: (user, { can }) => {
  can('get', 'User')
  can(['create', 'get'], 'Project')
  can(['update', 'delete'], 'Project', { ownerId: { $eq: user.id } })
  can('create', 'Report')
},
```

### 4. Enforce it in the route

```ts
if (cannot('create', 'Report')) {
  throw new UnauthorizedError(`You're not allowed to create reports.`)
}
```

### 5. Verify the ability

There is no test suite yet, but abilities are pure functions and easy to test:

```ts
import { defineAbilityFor } from '@saas/auth'

const ability = defineAbilityFor({ id: 'user-1', role: 'MEMBER' })

ability.can('create', 'Report')            // true
ability.can('update', 'User')              // false
```

For ownership-aware checks, pass a subject object:

```ts
const project = { __typename: 'Project', id: 'p1', ownerId: 'user-1' }

defineAbilityFor({ id: 'user-1', role: 'MEMBER' }).can('update', project) // true
defineAbilityFor({ id: 'user-2', role: 'MEMBER' }).can('update', project) // false
```

---

## Specification vs implementation

Differences between the original feature specification and the current code:

| Rule in the specification | Current implementation | Status |
| --- | --- | --- |
| Administrator can update the organization | Only the owner (`ownerId`) can update | ⚠️ Stricter |
| Administrator can delete the organization | Any `ADMIN` can delete | ✅ / broader than expected |
| Only owners may transfer ownership | Enforced by CASL | ✅ |
| Billing can list members | Billing has no `get User` permission → `401` | ⚠️ Missing |
| Billing can list projects | Billing has no `get Project` permission → `401` | ⚠️ Missing |
| Members can delete their own membership / leave | No endpoint or permission | ❌ Missing |
| Administrators and project authors can update/delete projects | Enforced via `ownerId` condition | ✅ |
| Export billing details | Permission only, no route | ❌ Missing |
| One billing member per organization | Not enforced | ❌ Missing |
| Invite a new member by e-mail | Invite row created, no e-mail sent | 🟡 Partial |
