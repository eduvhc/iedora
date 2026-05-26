package main

import (
	"io"
	"os"
)

// stderr is the single sink for every status line. Using an io.Writer
// indirection lets tests capture output.
var stderr io.Writer = os.Stderr
