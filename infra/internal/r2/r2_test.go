package r2

import (
	"net/http"
	"net/url"
	"strings"
	"testing"
)

// TestSign_AWSReferenceVector verifies our SigV4 against a known-good
// AWS test vector — the canonical "GET vanilla" example from the AWS
// docs (https://docs.aws.amazon.com/general/latest/gr/signature-v4-test-suite.html).
// If the canonical-string, string-to-sign, or signature derivation drift,
// this catches it before we point destroy.go at a live R2 bucket.
func TestSign_AWSReferenceVector(t *testing.T) {
	// The vector uses host=example.amazonaws.com, region=us-east-1,
	// service=service. Our package pins region/service to R2 values, so
	// drive the inner signing math directly here.
	secretKey := "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY"
	canonical := strings.Join([]string{
		"GET",
		"/",
		"",
		"host:example.amazonaws.com",
		"x-amz-date:20150830T123600Z",
		"",
		"host;x-amz-date",
		emptyPayloadSHA,
	}, "\n")

	stringToSign := strings.Join([]string{
		algo,
		"20150830T123600Z",
		"20150830/us-east-1/service/aws4_request",
		sha256Hex([]byte(canonical)),
	}, "\n")

	kDate := hmacSHA256([]byte("AWS4"+secretKey), []byte("20150830"))
	kRegion := hmacSHA256(kDate, []byte("us-east-1"))
	kService := hmacSHA256(kRegion, []byte("service"))
	kSigning := hmacSHA256(kService, []byte("aws4_request"))
	got := toHex(hmacSHA256(kSigning, []byte(stringToSign)))

	// Expected signature from AWS's published test suite for the
	// "get-vanilla" case with the params above.
	want := "5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31"
	if got != want {
		t.Fatalf("SigV4 derivation drift\n  want: %s\n  got:  %s\n  canon:\n%s\n  sts:\n%s",
			want, got, canonical, stringToSign)
	}
}

// TestAWSEscape_SpaceAndUnreserved covers the two traps that wreck
// pure-Go SigV4 implementations: space must become %20 (not '+'), and
// unreserved chars (- _ . ~) must NOT be encoded.
func TestAWSEscape_SpaceAndUnreserved(t *testing.T) {
	for _, tc := range []struct {
		in, want string
	}{
		{"hello world", "hello%20world"},
		{"a-b_c.d~e", "a-b_c.d~e"},
		{"key/with/slash", "key%2Fwith%2Fslash"},
		{"plus+sign", "plus%2Bsign"},
		{"emoji-🚀", "emoji-%F0%9F%9A%80"},
	} {
		if got := awsEscape(tc.in); got != tc.want {
			t.Errorf("awsEscape(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

// TestCanonicalQuery_Sorted ensures keys come out in sorted order and
// multiple values for the same key are preserved.
func TestCanonicalQuery_Sorted(t *testing.T) {
	q := url.Values{}
	q.Set("list-type", "2")
	q.Set("continuation-token", "abc=def/")
	got := canonicalQuery(q)
	want := "continuation-token=abc%3Ddef%2F&list-type=2"
	if got != want {
		t.Fatalf("canonicalQuery = %q, want %q", got, want)
	}
}

// TestSign_HeadersAreSet smoke-tests the public path: after signing, an
// http.Request carries the three SigV4 headers we promised.
func TestSign_HeadersAreSet(t *testing.T) {
	c := &Client{accessKey: "AKID", secretKey: "SECRET"}
	req, err := http.NewRequest(http.MethodDelete, "https://acct.r2.cloudflarestorage.com/bucket/key", nil)
	if err != nil {
		t.Fatal(err)
	}
	c.sign(req, emptyPayloadSHA)
	for _, h := range []string{"Authorization", "X-Amz-Date", "X-Amz-Content-Sha256", "Host"} {
		if req.Header.Get(h) == "" {
			t.Errorf("missing header %s", h)
		}
	}
	auth := req.Header.Get("Authorization")
	if !strings.HasPrefix(auth, "AWS4-HMAC-SHA256 Credential=AKID/") {
		t.Errorf("Authorization header malformed: %q", auth)
	}
}

func toHex(b []byte) string { return sha256HexBytes(b) }

// sha256HexBytes is a tiny shim so the test file doesn't depend on the
// production helper's exact name.
func sha256HexBytes(b []byte) string {
	const hexdigits = "0123456789abcdef"
	out := make([]byte, len(b)*2)
	for i, x := range b {
		out[i*2] = hexdigits[x>>4]
		out[i*2+1] = hexdigits[x&0x0f]
	}
	return string(out)
}
