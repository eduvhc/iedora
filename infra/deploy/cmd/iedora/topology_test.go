package main

import "testing"

func TestProdURL(t *testing.T) {
	cases := map[string]string{
		"house":   "https://iedora.com",
		"menu":    "https://menu.iedora.com",
		"core":    "https://core.iedora.com",
		"imopush": "https://imopush.iedora.com",
	}
	for _, s := range surfaces {
		got := s.prodURL("iedora.com")
		if want := cases[s.name]; got != want {
			t.Errorf("surface %q prodURL = %q, want %q", s.name, got, want)
		}
	}
}

func TestTrustedOriginsProd(t *testing.T) {
	want := "https://iedora.com,https://www.iedora.com,https://menu.iedora.com,https://core.iedora.com,https://imopush.iedora.com"
	if got := trustedOriginsProd("iedora.com"); got != want {
		t.Errorf("trustedOriginsProd = %q, want %q", got, want)
	}
}

func TestTrustedOriginsLocal(t *testing.T) {
	// house has no localHostnames (apex has no dev hostname — it's
	// reachable via the /house path fallback). Trusted-origins
	// includes only surfaces that DO have local hosts.
	want := "http://menu.localhost:3000,http://core.localhost:3000,http://imopush.localhost:3000"
	if got := trustedOriginsLocal(3000); got != want {
		t.Errorf("trustedOriginsLocal = %q, want %q", got, want)
	}
}
