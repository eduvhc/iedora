# identity slice

Federates organization ownership through Zitadel (`auth.iedora.com`).
Menu owns ZERO organization data — every read/write goes over Zitadel's
REST management API using the menu service-account PAT (IAM_OWNER).

## Public API (`@/features/identity`)

- `listOrganizations(userId)` → `Organization[]` (memoized per request)
- `getActiveOrganization(userId)` → `Organization | null` (first org)
- `createOrganization(userId, name, slug)` → `CreateOrganizationResult`
- `setActiveOrganization(userId, organizationId)` → `boolean` (no-op today)

## Port

`IdentityGateway` (in `./ports.ts`). Production adapter:
`./adapters/zitadel-http.ts`.

## Why this exists

Menu's tenant-scoping DAL needs to know "is user U a member of org O?"
without keeping a local mirror of the org graph. The adapter answers
membership questions by calling Zitadel's `/v2/users/{id}/memberships/_search`
with menu's machine-user PAT. The same adapter handles onboarding-time
org provisioning (`POST /admin/v1/orgs` then add the user as `ORG_OWNER`).

## Why a PAT (not the user's OIDC token)

The user's own access_token doesn't carry IAM_OWNER scope; the
membership search and org-create endpoints reject it. Stage 3's
[`infra/app-state/cmd/zitadel-apply`](../../../../../infra/app-state/cmd/zitadel-apply/) reconciler
mints a long-lived PAT for the `menu_sa` machine user with IAM_OWNER
and writes it to BWS as `APP_ZITADEL_MENU_SA_TOKEN`; the menu container
reads it as `ZITADEL_MANAGEMENT_TOKEN`.
