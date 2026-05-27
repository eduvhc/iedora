package main

// surface is a logical product surface — a hostname-keyed fachada
// served by the web container. Distinct from `product` (a deploy
// artifact, see products.go): three surfaces (menu, core, house)
// share a single product (web).
//
// Until this file existed, the surfaces were implicit — declared
// piecemeal across `outputs.tf` (URL strings), `tunnel.tf` (ingress
// rules), `products.go::envFromTofu` (env-var names), `bin/dev-stack`
// (local .env), and `apps/web/src/proxy.ts` (Host dispatch). Adding a
// fourth surface required edits in all five sites and was easy to
// drift. This slice is the source of truth; consumers derive their
// pieces from it.
//
// Adding a surface = one entry in `surfaces` below + regenerating the
// downstream artifacts (see `emit-topology` command).
type surface struct {
	// name — lowercase identifier. Doubles as the rewrite namespace
	// in proxy.ts (`menu` → /menu/*, `core` → /core/*). The apex
	// landing uses `house` for the same reason.
	name string

	// subdomain — the DNS label under the apex. "" means apex
	// (iedora.com itself). prodURL composes <subdomain>.<zone>; an
	// empty subdomain composes just the zone.
	subdomain string

	// serves — name of the `product` (products.go) that serves this
	// surface. Today every surface points at "web".
	serves string

	// publicURLEnv — the env var the container reads to learn its
	// own public URL (e.g. MENU_PUBLIC_URL). Empty when the surface
	// has no dedicated URL env (the apex `house` surface doesn't
	// expose itself via env — it's the implicit fallback).
	publicURLEnv string

	// nextPublicEnv — same value as publicURLEnv but surfaced under
	// a NEXT_PUBLIC_* name so Next.js inlines it into the browser
	// bundle at build time. Empty when not needed.
	nextPublicEnv string

	// trustedOrigin — when true, the surface's URL is added to the
	// CORE_TRUSTED_ORIGINS CSRF allowlist consumed by core's
	// better-auth instance. Every iedora surface is trusted today.
	trustedOrigin bool

	// localHostnames — Host header values that resolve to this
	// surface in local dev. `*.localhost` resolves to 127.0.0.1 on
	// macOS/Linux without /etc/hosts edits, which lets the local
	// stack exercise proxy.ts's Host-based dispatch identically to
	// production.
	localHostnames []string
}

// surfaces — the explicit registry of logical product surfaces.
//
// To add a surface:
//  1. Append an entry here.
//  2. Run `iedora emit-topology` to regenerate the Tofu tfvars +
//     proxy.ts surfaces.ts.
//  3. Add the routes under apps/web/src/app/<name>/.
//  4. Wire the workspace package in apps/web/package.json +
//     next.config.ts::transpilePackages + tsconfig references
//     (see apps/web/CLAUDE.md § Hard rules #5).
var surfaces = []surface{
	{
		name:           "house",
		subdomain:      "",
		serves:         "web",
		trustedOrigin:  true,
		localHostnames: []string{"localhost"},
	},
	{
		name:           "menu",
		subdomain:      "menu",
		serves:         "web",
		publicURLEnv:   "MENU_PUBLIC_URL",
		trustedOrigin:  true,
		localHostnames: []string{"menu.localhost"},
	},
	{
		name:           "core",
		subdomain:      "core",
		serves:         "web",
		publicURLEnv:   "CORE_BASE_URL",
		nextPublicEnv:  "NEXT_PUBLIC_CORE_URL",
		trustedOrigin:  true,
		localHostnames: []string{"core.localhost"},
	},
}

// prodHostname returns the FQDN this surface answers to in
// production. Apex surfaces (empty subdomain) collapse to the zone.
func (s surface) prodHostname(zone string) string {
	if s.subdomain == "" {
		return zone
	}
	return s.subdomain + "." + zone
}

// prodURL returns the public https URL for this surface in
// production.
func (s surface) prodURL(zone string) string {
	return "https://" + s.prodHostname(zone)
}

// localURL returns the local-dev http URL for this surface, using
// the surface's primary local hostname. Panics if the surface has no
// localHostnames declared — that's a programming error, every
// surface needs at least one local host.
func (s surface) localURL(port int) string {
	if len(s.localHostnames) == 0 {
		panic("surface " + s.name + " has no localHostnames")
	}
	return "http://" + s.localHostnames[0] + ":" + itoa(port)
}

// trustedOriginsProd returns the production CSRF allowlist —
// comma-separated URLs of every surface marked `trustedOrigin`, plus
// the apex `www.<zone>` alias that proxy.ts routes to the house
// surface.
func trustedOriginsProd(zone string) string {
	var b []byte
	first := true
	for _, s := range surfaces {
		if !s.trustedOrigin {
			continue
		}
		if !first {
			b = append(b, ',')
		}
		b = append(b, s.prodURL(zone)...)
		first = false
		// www.<zone> isn't a separate surface — it's a CF DNS alias
		// to the apex `house` surface. The CSRF list still needs it
		// because cookies may issue to it.
		if s.subdomain == "" {
			b = append(b, ",https://www."...)
			b = append(b, zone...)
		}
	}
	return string(b)
}

// trustedOriginsLocal returns the dev CSRF allowlist — every local
// hostname of every trusted surface, joined by commas.
func trustedOriginsLocal(port int) string {
	var b []byte
	first := true
	for _, s := range surfaces {
		if !s.trustedOrigin {
			continue
		}
		for _, h := range s.localHostnames {
			if !first {
				b = append(b, ',')
			}
			b = append(b, "http://"...)
			b = append(b, h...)
			b = append(b, ':')
			b = append(b, itoa(port)...)
			first = false
		}
	}
	return string(b)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
