// Package r2 implements the bits of the Cloudflare R2 S3-compatible API
// the deploy stack needs — today, listing + deleting every object in a
// bucket so a subsequent `tofu destroy` of the bucket itself doesn't
// 409 on "bucket not empty".
//
// Pure Go SigV4 + ListObjectsV2 + single-object DELETE. No external SDK
// (aws-sdk-go-v2 is ~10 MB of indirect deps; minio-go is smaller but
// still pulls a handful of CPUID / xid / ini libs). The surface here is
// small enough that hand-rolling is the cheaper long-term bet.
package r2

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	region  = "auto" // R2 ignores region; "auto" is the documented value.
	service = "s3"
	algo    = "AWS4-HMAC-SHA256"
)

// emptyPayloadSHA is hex(sha256("")) — pre-computed because every
// GET/DELETE we send has no body.
const emptyPayloadSHA = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

// Client signs and dispatches S3-shaped requests against the account's
// R2 endpoint. Zero-value is not usable — go through New.
type Client struct {
	httpClient *http.Client
	endpoint   *url.URL
	accessKey  string
	secretKey  string
}

// New builds a Client for the account whose ID is `accountID`. The pair
// (accessKey, secretKey) is an R2 S3-API credential — for any CF API
// token with R2 bucket-item-write perms, that's (token-id, hex(sha256(
// token-value))). See internal/cloudflare.R2S3Credentials.
func New(accountID, accessKey, secretKey string) (*Client, error) {
	u, err := url.Parse(fmt.Sprintf("https://%s.r2.cloudflarestorage.com", accountID))
	if err != nil {
		return nil, fmt.Errorf("parse R2 endpoint: %w", err)
	}
	return &Client{
		httpClient: &http.Client{Timeout: 30 * time.Second},
		endpoint:   u,
		accessKey:  accessKey,
		secretKey:  secretKey,
	}, nil
}

// EmptyBucket lists every object in `bucket` and deletes them. Bounded
// concurrency keeps wall-time short without burying R2 in requests.
// The bucket itself is left in place; callers (the destroy
// orchestrator) drop it via Terraform once it's empty.
func (c *Client) EmptyBucket(ctx context.Context, bucket string) error {
	const parallel = 16
	sem := make(chan struct{}, parallel)
	var wg sync.WaitGroup
	var firstErr error
	var errMu sync.Mutex
	record := func(e error) {
		errMu.Lock()
		defer errMu.Unlock()
		if firstErr == nil {
			firstErr = e
		}
	}

	var continuation string
	for {
		keys, next, err := c.listOnce(ctx, bucket, continuation)
		if err != nil {
			return fmt.Errorf("list %s: %w", bucket, err)
		}
		for _, k := range keys {
			wg.Add(1)
			sem <- struct{}{}
			go func(key string) {
				defer wg.Done()
				defer func() { <-sem }()
				if err := c.deleteOne(ctx, bucket, key); err != nil {
					record(fmt.Errorf("delete %s/%s: %w", bucket, key, err))
				}
			}(k)
		}
		if next == "" {
			break
		}
		continuation = next
	}
	wg.Wait()
	return firstErr
}

// ── S3 operations ───────────────────────────────────────────────────────────

type listResult struct {
	XMLName  xml.Name `xml:"ListBucketResult"`
	Contents []struct {
		Key string `xml:"Key"`
	} `xml:"Contents"`
	NextContinuationToken string `xml:"NextContinuationToken"`
	IsTruncated           bool   `xml:"IsTruncated"`
}

func (c *Client) listOnce(ctx context.Context, bucket, continuation string) ([]string, string, error) {
	u := *c.endpoint
	u.Path = "/" + bucket + "/"
	q := url.Values{}
	q.Set("list-type", "2")
	q.Set("max-keys", "1000")
	if continuation != "" {
		q.Set("continuation-token", continuation)
	}
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, "", err
	}
	c.sign(req, emptyPayloadSHA)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var out listResult
	if err := xml.Unmarshal(body, &out); err != nil {
		return nil, "", fmt.Errorf("parse XML: %w", err)
	}
	keys := make([]string, 0, len(out.Contents))
	for _, e := range out.Contents {
		keys = append(keys, e.Key)
	}
	return keys, out.NextContinuationToken, nil
}

func (c *Client) deleteOne(ctx context.Context, bucket, key string) error {
	u := *c.endpoint
	u.Path = "/" + bucket + "/" + key

	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, u.String(), nil)
	if err != nil {
		return err
	}
	c.sign(req, emptyPayloadSHA)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	// R2 returns 204 on success; AWS also documents 200. Accept both.
	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	return nil
}

// ── SigV4 ───────────────────────────────────────────────────────────────────

// sign attaches the AWS Signature V4 headers to req. payloadSHA is the
// hex-sha256 of the request body — for GET/DELETE with no body, callers
// pass emptyPayloadSHA.
func (c *Client) sign(req *http.Request, payloadSHA string) {
	now := time.Now().UTC()
	amzDate := now.Format("20060102T150405Z")
	dateStamp := now.Format("20060102")

	req.Header.Set("Host", req.URL.Host)
	req.Header.Set("X-Amz-Date", amzDate)
	req.Header.Set("X-Amz-Content-Sha256", payloadSHA)

	// Canonical request: method, uri, query, headers, signed-headers, payload-hash.
	canonURI := canonicalURI(req.URL.EscapedPath())
	canonQuery := canonicalQuery(req.URL.Query())

	// We only sign these three. Adding more headers means adding them
	// here AND to signedHeaders below.
	signedHeaders := "host;x-amz-content-sha256;x-amz-date"
	canonHeaders := strings.Join([]string{
		"host:" + strings.TrimSpace(req.Header.Get("Host")),
		"x-amz-content-sha256:" + strings.TrimSpace(req.Header.Get("X-Amz-Content-Sha256")),
		"x-amz-date:" + strings.TrimSpace(req.Header.Get("X-Amz-Date")),
	}, "\n") + "\n"

	canonical := strings.Join([]string{
		req.Method,
		canonURI,
		canonQuery,
		canonHeaders,
		signedHeaders,
		payloadSHA,
	}, "\n")

	scope := fmt.Sprintf("%s/%s/%s/aws4_request", dateStamp, region, service)
	stringToSign := strings.Join([]string{
		algo,
		amzDate,
		scope,
		sha256Hex([]byte(canonical)),
	}, "\n")

	kDate := hmacSHA256([]byte("AWS4"+c.secretKey), []byte(dateStamp))
	kRegion := hmacSHA256(kDate, []byte(region))
	kService := hmacSHA256(kRegion, []byte(service))
	kSigning := hmacSHA256(kService, []byte("aws4_request"))
	signature := hex.EncodeToString(hmacSHA256(kSigning, []byte(stringToSign)))

	req.Header.Set("Authorization", fmt.Sprintf("%s Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		algo, c.accessKey, scope, signedHeaders, signature))
}

// canonicalURI re-encodes each path segment under AWS's strict
// unreserved-char rule. Go's url.URL.EscapedPath() leaves some chars
// (`!`, `*`, `(`, `)`, `'`) un-escaped that AWS expects encoded.
func canonicalURI(escaped string) string {
	if escaped == "" {
		return "/"
	}
	// EscapedPath returns the path already %-encoded. We need to
	// decode + re-encode under AWS rules. Split on `/` first.
	segs := strings.Split(escaped, "/")
	for i, s := range segs {
		// PathUnescape any existing %-encoding so we re-encode uniformly.
		dec, err := url.PathUnescape(s)
		if err != nil {
			dec = s
		}
		segs[i] = awsEscape(dec)
	}
	return strings.Join(segs, "/")
}

// canonicalQuery sorts the query keys and re-encodes both keys and
// values under AWS rules. Multi-value keys keep their original order
// within a key (per AWS spec).
func canonicalQuery(q url.Values) string {
	keys := make([]string, 0, len(q))
	for k := range q {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var parts []string
	for _, k := range keys {
		ek := awsEscape(k)
		for _, v := range q[k] {
			parts = append(parts, ek+"="+awsEscape(v))
		}
	}
	return strings.Join(parts, "&")
}

// awsEscape implements AWS's URI-encoding rule: %-encode every byte
// except the unreserved set A-Z a-z 0-9 - _ . ~. Spaces become %20, not
// `+` (the trap with url.QueryEscape).
func awsEscape(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if (c >= 'A' && c <= 'Z') ||
			(c >= 'a' && c <= 'z') ||
			(c >= '0' && c <= '9') ||
			c == '-' || c == '_' || c == '.' || c == '~' {
			b.WriteByte(c)
		} else {
			fmt.Fprintf(&b, "%%%02X", c)
		}
	}
	return b.String()
}

func sha256Hex(data []byte) string {
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:])
}

func hmacSHA256(key, data []byte) []byte {
	mac := hmac.New(sha256.New, key)
	mac.Write(data)
	return mac.Sum(nil)
}
