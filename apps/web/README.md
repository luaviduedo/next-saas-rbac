# Web app

Next.js 15 (App Router) frontend for the SaaS + RBAC monorepo.

See the [root README](../../README.md) for setup and the [architecture guide](../../docs/architecture.md) for how this app talks to the API.

## Scope

Implemented today:

- Sign in with e-mail/password (`/auth/sign-in`)
- Sign in with GitHub (`/auth/sign-in` → `/api/auth/callback`)
- Session cookie handling and sign-out (`/api/auth/sign-out`)
- Profile display on `/` via `auth()`

Not wired yet:

- Sign-up form (`/auth/sign-up`) — the API endpoint exists
- Forgot-password form (`/auth/forgot-password`) — the API endpoints exist
- Organization, member, invite, project and billing screens

## Local development

Run from the repository root:

```bash
pnpm --filter web dev
```

The app runs at <http://localhost:3000> and expects the API at <http://localhost:3333>.

Two values are hardcoded and must be changed for non-local environments:

- API base URL: `src/http/api-client.ts`
- GitHub client ID and callback URL: `src/app/auth/actions.tsx`

## Structure

| Path | Purpose |
| --- | --- |
| `src/app/` | Pages, layouts, server actions and route handlers |
| `src/auth/auth.ts` | `isAuthenticated()` and `auth()` session helpers |
| `src/http/` | `ky` API client and endpoint wrappers |
| `src/components/ui/` | Buttons, inputs, alerts, separators |
| `src/app/hooks/use-form-state.ts` | `useTransition`-based form state helper |
