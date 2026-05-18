import 'server-only'
import { auth } from '../adapters/better-auth-instance'

/**
 * Shared route handlers for the OIDC / OAuth 2.0 well-known discovery
 * endpoints. Better Auth's oauth-provider plugin computes the metadata
 * but marks the endpoints SERVER_ONLY, so each `.well-known/*` route file
 * just re-exports the matching function from this module.
 *
 * Two flavours, with RFC 8414 path-suffix variants:
 *   /.well-known/openid-configuration
 *   /.well-known/openid-configuration/api/auth
 *   /.well-known/oauth-authorization-server
 *   /.well-known/oauth-authorization-server/api/auth
 */

const JSON_CACHE_HEADERS = { 'cache-control': 'public, max-age=300' }

export async function getOpenIdConfiguration(): Promise<Response> {
  const config = await auth.api.getOpenIdConfig()
  return Response.json(config, { headers: JSON_CACHE_HEADERS })
}

export async function getOAuthAuthorizationServer(): Promise<Response> {
  const config = await auth.api.getOAuthServerConfig()
  return Response.json(config, { headers: JSON_CACHE_HEADERS })
}
