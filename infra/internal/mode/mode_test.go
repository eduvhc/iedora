package mode

import (
	"strings"
	"testing"
)

func TestResolve(t *testing.T) {
	cases := []struct {
		name    string
		in      string
		want    Mode
		wantErr string // substring; "" means no error
	}{
		{"local", "local", Local, ""},
		{"live", "live", Live, ""},
		{"empty rejected", "", "", "empty value"},
		{"unknown rejected", "staging", "", `"staging" is not a valid mode`},
		{"case-sensitive — Live is not live", "Live", "", `"Live" is not a valid mode`},
		{"whitespace not trimmed", " live", "", `" live" is not a valid mode`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := Resolve(tc.in)
			if tc.wantErr == "" {
				if err != nil {
					t.Fatalf("Resolve(%q) err = %v, want nil", tc.in, err)
				}
				if got != tc.want {
					t.Fatalf("Resolve(%q) = %q, want %q", tc.in, got, tc.want)
				}
				return
			}
			if err == nil {
				t.Fatalf("Resolve(%q) err = nil, want substring %q", tc.in, tc.wantErr)
			}
			if !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("Resolve(%q) err = %q, want substring %q", tc.in, err.Error(), tc.wantErr)
			}
		})
	}
}

func TestMustResolve_panicsOnBad(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Fatal("MustResolve(\"nope\") did not panic")
		}
	}()
	_ = MustResolve("nope")
}

func TestMustResolve_returnsOnGood(t *testing.T) {
	if got := MustResolve("live"); got != Live {
		t.Fatalf("MustResolve(\"live\") = %q, want %q", got, Live)
	}
}

func TestRequire_okWhenMatch(t *testing.T) {
	// Should not panic.
	Live.Require(Live)
	Local.Require(Local)
}

func TestRequire_panicsOnMismatch(t *testing.T) {
	cases := []struct {
		have, want Mode
	}{
		{Local, Live},
		{Live, Local},
	}
	for _, tc := range cases {
		t.Run(string(tc.have)+"_wants_"+string(tc.want), func(t *testing.T) {
			defer func() {
				r := recover()
				if r == nil {
					t.Fatalf("%q.Require(%q) did not panic", tc.have, tc.want)
				}
				msg, ok := r.(string)
				if !ok {
					t.Fatalf("panic value is %T, want string", r)
				}
				if !strings.Contains(msg, string(tc.want)) || !strings.Contains(msg, string(tc.have)) {
					t.Fatalf("panic message %q does not name both modes", msg)
				}
			}()
			tc.have.Require(tc.want)
		})
	}
}

func TestPredicates(t *testing.T) {
	if !Live.IsLive() || Live.IsLocal() {
		t.Fatal("Live.IsLive/IsLocal wrong")
	}
	if !Local.IsLocal() || Local.IsLive() {
		t.Fatal("Local.IsLocal/IsLive wrong")
	}
	// Zero value should not falsely report either mode.
	var zero Mode
	if zero.IsLive() || zero.IsLocal() {
		t.Fatal("zero Mode falsely reports a side")
	}
}

func TestString(t *testing.T) {
	if Live.String() != "live" || Local.String() != "local" {
		t.Fatalf("String() values drifted from constants")
	}
}
