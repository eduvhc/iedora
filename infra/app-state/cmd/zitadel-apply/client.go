package main

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// saKeyJSON is the shape of the FirstInstance-minted SA key file
// (zitadel-admin-sa.json) — a Zitadel machine-key Type=1 JSON Web Profile.
type saKeyJSON struct {
	Type   string `json:"type"`   // "serviceaccount"
	KeyID  string `json:"keyId"`  // signs the JWT header
	UserID string `json:"userId"` // iss + sub
	Key    string `json:"key"`    // PEM-encoded RSA private key
}

// client is the authenticated Zitadel REST client. One per binary
// invocation — cheap to construct, holds the access token in memory
// and refreshes ~1m before expiry.
type client struct {
	baseURL string // e.g. "https://auth.iedora.com"
	hc      *http.Client

	sa     *saKeyJSON
	rsaKey *rsa.PrivateKey

	tokenMu  sync.Mutex
	token    string
	tokenExp time.Time
}

// newClient parses the SA key JSON and prepares the client. Does NOT
// mint a token yet — first request triggers token exchange.
func newClient(baseURL, saKeyData string) (*client, error) {
	var sa saKeyJSON
	if err := json.Unmarshal([]byte(saKeyData), &sa); err != nil {
		return nil, fmt.Errorf("parse SA key JSON: %w", err)
	}
	if sa.KeyID == "" || sa.UserID == "" || sa.Key == "" {
		return nil, fmt.Errorf("SA key JSON missing keyId/userId/key")
	}

	block, _ := pem.Decode([]byte(sa.Key))
	if block == nil {
		return nil, fmt.Errorf("SA key: PEM decode failed")
	}
	var rsaKey *rsa.PrivateKey
	// Zitadel exports the key as PKCS#1 ("RSA PRIVATE KEY") historically;
	// some newer builds emit PKCS#8 ("PRIVATE KEY"). Accept both.
	switch block.Type {
	case "RSA PRIVATE KEY":
		k, err := x509.ParsePKCS1PrivateKey(block.Bytes)
		if err != nil {
			return nil, fmt.Errorf("parse PKCS1 RSA key: %w", err)
		}
		rsaKey = k
	case "PRIVATE KEY":
		k, err := x509.ParsePKCS8PrivateKey(block.Bytes)
		if err != nil {
			return nil, fmt.Errorf("parse PKCS8 key: %w", err)
		}
		rk, ok := k.(*rsa.PrivateKey)
		if !ok {
			return nil, fmt.Errorf("PKCS8 key is not RSA (got %T)", k)
		}
		rsaKey = rk
	default:
		return nil, fmt.Errorf("unexpected PEM block %q (want RSA PRIVATE KEY or PRIVATE KEY)", block.Type)
	}

	return &client{
		baseURL: strings.TrimRight(baseURL, "/"),
		hc:      &http.Client{Timeout: 30 * time.Second},
		sa:      &sa,
		rsaKey:  rsaKey,
	}, nil
}

// ── JWT mint + token exchange ────────────────────────────────────────────────

// accessToken returns a fresh-enough Bearer token, minting a new one when
// the cached token is within 1 minute of expiring (or missing).
func (c *client) accessToken(ctx context.Context) (string, error) {
	c.tokenMu.Lock()
	defer c.tokenMu.Unlock()

	if c.token != "" && time.Until(c.tokenExp) > time.Minute {
		return c.token, nil
	}

	assertion, err := c.signJWT()
	if err != nil {
		return "", err
	}

	form := url.Values{}
	form.Set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer")
	form.Set("assertion", assertion)
	// `urn:zitadel:iam:org:project:id:zitadel:aud` grants access to the
	// Zitadel project itself — required to call /admin and /management.
	form.Set("scope", "openid profile email urn:zitadel:iam:org:project:id:zitadel:aud")

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.baseURL+"/oauth/v2/token", strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := c.hc.Do(req)
	if err != nil {
		return "", fmt.Errorf("token exchange: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("token exchange HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var out struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return "", fmt.Errorf("decode token response: %w (body: %s)", err, string(body))
	}
	if out.AccessToken == "" {
		return "", fmt.Errorf("token response had empty access_token (body: %s)", string(body))
	}

	c.token = out.AccessToken
	c.tokenExp = time.Now().Add(time.Duration(out.ExpiresIn) * time.Second)
	return c.token, nil
}

// signJWT mints a signed JWT for the JWT-bearer grant. iss + sub = the
// machine user's userId; aud = the issuer URL; kid = the SA key's keyId.
func (c *client) signJWT() (string, error) {
	header := map[string]any{
		"alg": "RS256",
		"typ": "JWT",
		"kid": c.sa.KeyID,
	}
	now := time.Now()
	claims := map[string]any{
		"iss": c.sa.UserID,
		"sub": c.sa.UserID,
		"aud": c.baseURL,
		"iat": now.Unix(),
		"exp": now.Add(1 * time.Hour).Unix(),
	}

	headerB, err := json.Marshal(header)
	if err != nil {
		return "", err
	}
	claimsB, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}
	encode := func(b []byte) string {
		return base64.RawURLEncoding.EncodeToString(b)
	}
	signingInput := encode(headerB) + "." + encode(claimsB)

	digest := sha256.Sum256([]byte(signingInput))
	sig, err := rsa.SignPKCS1v15(rand.Reader, c.rsaKey, crypto.SHA256, digest[:])
	if err != nil {
		return "", fmt.Errorf("sign JWT: %w", err)
	}
	return signingInput + "." + encode(sig), nil
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

// HTTP retry policy. Zitadel's gateway can transiently 503 while its
// internal read-model catches up — most commonly right after a freshly-
// minted IAM grant, which is exactly when this binary runs. Same shape as
// the prior zitadel-grant binary at infra/app-state/cmd/zitadel-apply/main.go:80-84.
const (
	maxAttempts    = 6
	initialBackoff = time.Second
	maxBackoff     = 16 * time.Second
)

// requestOpts carries the per-call knobs that vary across endpoints.
type requestOpts struct {
	orgID string // x-zitadel-orgid header; empty omits
}

// do issues an authenticated JSON request with retry on transient 5xx.
// Returns the raw response body + status. 4xx responses are returned
// without retry (deterministic — caller decides what to do with them).
func (c *client) do(ctx context.Context, method, path string, body any, opts requestOpts) ([]byte, int, error) {
	var bodyBytes []byte
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, 0, fmt.Errorf("marshal body: %w", err)
		}
		bodyBytes = b
	}

	tok, err := c.accessToken(ctx)
	if err != nil {
		return nil, 0, err
	}

	url := c.baseURL + path
	backoff := initialBackoff
	var lastBody []byte
	var lastStatus int
	var lastErr error

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		req, err := http.NewRequestWithContext(ctx, method, url, bytes.NewReader(bodyBytes))
		if err != nil {
			return nil, 0, err
		}
		req.Header.Set("Authorization", "Bearer "+tok)
		req.Header.Set("Accept", "application/json")
		if bodyBytes != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		if opts.orgID != "" {
			req.Header.Set("x-zitadel-orgid", opts.orgID)
		}

		resp, err := c.hc.Do(req)
		if err != nil {
			lastErr = err
		} else {
			lastBody, _ = io.ReadAll(resp.Body)
			lastStatus = resp.StatusCode
			resp.Body.Close()
			lastErr = nil
			// 401 = token expired between mint and call (rare but possible
			// under clock skew). Force a fresh mint and retry once without
			// counting against the retry budget.
			if lastStatus == http.StatusUnauthorized && attempt == 1 {
				c.tokenMu.Lock()
				c.token = ""
				c.tokenMu.Unlock()
				tok, err = c.accessToken(ctx)
				if err != nil {
					return nil, 0, err
				}
				continue
			}
		}

		retry := lastErr != nil || (lastStatus >= 500 && lastStatus <= 599)
		if !retry {
			return lastBody, lastStatus, nil
		}
		if attempt == maxAttempts {
			break
		}

		why := ""
		if lastErr != nil {
			why = lastErr.Error()
		} else {
			why = fmt.Sprintf("HTTP %d", lastStatus)
		}
		fmt.Fprintf(stderr, "transient (%s) — retry %d/%d in %s\n",
			why, attempt, maxAttempts-1, backoff)
		select {
		case <-time.After(backoff):
		case <-ctx.Done():
			return nil, 0, ctx.Err()
		}
		if backoff < maxBackoff {
			backoff *= 2
			if backoff > maxBackoff {
				backoff = maxBackoff
			}
		}
	}
	return lastBody, lastStatus, lastErr
}

// doJSON is the typed convenience over `do` — marshals input, decodes
// output. Returns ErrNotFound on 404, ErrAlreadyExists on 409/412 with
// gRPC code 6 (ALREADY_EXISTS).
func (c *client) doJSON(ctx context.Context, method, path string, in, out any, opts requestOpts) error {
	body, status, err := c.do(ctx, method, path, in, opts)
	if err != nil {
		return err
	}
	if status == http.StatusNotFound {
		// Wrap so the caller's error message includes the URL — invaluable
		// for diagnosing which specific REST path is misconfigured.
		return fmt.Errorf("%w: %s %s", ErrNotFound, method, path)
	}
	if isAlreadyExists(status, body) {
		return ErrAlreadyExists
	}
	if isNoChanges(status, body) {
		// Idempotent no-op update — treat as success.
		return nil
	}
	if status < 200 || status >= 300 {
		return fmt.Errorf("HTTP %d %s %s: %s", status, method, path, strings.TrimSpace(string(body)))
	}
	if out != nil && len(body) > 0 {
		if err := json.Unmarshal(body, out); err != nil {
			return fmt.Errorf("decode response %s %s: %w (body: %s)", method, path, err, string(body))
		}
	}
	return nil
}

// Sentinel errors callers branch on.
var (
	ErrNotFound      = fmt.Errorf("zitadel: not found")
	ErrAlreadyExists = fmt.Errorf("zitadel: already exists")
)

type zitadelError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// isAlreadyExists matches the gRPC ALREADY_EXISTS (code 6) shape Zitadel
// returns as HTTP 409 or 412.
func isAlreadyExists(status int, body []byte) bool {
	if status != http.StatusConflict && status != http.StatusPreconditionFailed {
		return false
	}
	var ze zitadelError
	if err := json.Unmarshal(body, &ze); err != nil {
		return false
	}
	return ze.Code == 6
}

// isNoChanges matches Zitadel's idempotent "no-op update" signal — code 9
// (FAILED_PRECONDITION) with "No changes" in the message, returned as
// HTTP 400. Common on warm reconciles where every field matches the
// existing resource. Treated as success because that's the semantic.
func isNoChanges(status int, body []byte) bool {
	if status != http.StatusBadRequest {
		return false
	}
	var ze zitadelError
	if err := json.Unmarshal(body, &ze); err != nil {
		return false
	}
	return ze.Code == 9 && strings.Contains(ze.Message, "No changes")
}

// stderr indirection so tests can capture output. Mirrors the main
// orchestrator pattern at infra/deploy/cmd/iedora/log.go.
var stderr io.Writer = nil // set in main.go's init via the os.Stderr default
