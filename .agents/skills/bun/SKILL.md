---
name: Bun
description: Use when building, testing, or deploying JavaScript/TypeScript applications. Reach for Bun when you need to run scripts, manage dependencies, bundle code, or test applications with a single unified toolkit.
metadata:
    mintlify-proj: bun
    version: "1.0"
---

# Bun Skill Reference

## Product Summary

Bun is an all-in-one JavaScript/TypeScript toolkit that replaces Node.js, npm, and webpack. It ships as a single binary and includes a fast runtime (4x faster startup than Node.js), package manager (25x faster than npm), test runner (Jest-compatible), and bundler. Key files: `bunfig.toml` (configuration), `bun.lock` (lockfile), `package.json` (standard). Primary CLI commands: `bun run`, `bun install`, `bun test`, `bun build`. See https://bun.com/docs for complete documentation.

## When to Use

- **Running scripts**: Execute `.ts`, `.tsx`, `.js`, `.jsx` files directly without transpilation setup
- **Managing dependencies**: Install packages with `bun install` in existing Node.js projects
- **Testing**: Write Jest-compatible tests with `bun test` for TypeScript/JSX support
- **Bundling**: Build browser or server bundles with `bun build` for production
- **Monorepos**: Manage workspaces with `bun install` and `bun run --filter`
- **HTTP servers**: Create servers with `Bun.serve()` for high-performance APIs
- **Migrating from Node.js**: Drop-in replacement for Node.js in most projects

## Quick Reference

### Essential Commands

| Task | Command |
|------|---------|
| Run a file | `bun run index.ts` or `bun index.ts` |
| Run a script | `bun run dev` (from package.json) |
| Install dependencies | `bun install` |
| Add a package | `bun add react` |
| Remove a package | `bun remove react` |
| Run tests | `bun test` |
| Build for browser | `bun build ./index.tsx --outdir ./dist` |
| Build for server | `bun build ./index.ts --target bun --outdir ./dist` |
| Watch mode | `bun --watch run index.ts` or `bun build --watch` |
| Execute a package | `bunx cowsay "Hello"` |

### Configuration Files

| File | Purpose |
|------|---------|
| `bunfig.toml` | Bun-specific settings (optional, zero-config by default) |
| `package.json` | Dependencies, scripts, workspaces |
| `tsconfig.json` | TypeScript configuration (Bun respects this) |
| `bun.lock` | Lockfile (text-based, commit to version control) |

### Key bunfig.toml Sections

```toml
[install]
linker = "hoisted"  # or "isolated" for pnpm-like behavior
dev = true
optional = true
peer = true

[run]
shell = "system"  # or "bun" for cross-platform bash
bun = true        # alias node to bun in scripts

[test]
root = "."
coverage = false
preload = ["./setup.ts"]

[serve]
port = 3000
```

## Decision Guidance

### When to Use Hoisted vs Isolated Linker

| Scenario | Use |
|----------|-----|
| Existing Node.js project, single package | `hoisted` (default) |
| New monorepo with workspaces | `isolated` (default) |
| Strict dependency isolation needed | `isolated` |
| Compatibility with npm/yarn behavior | `hoisted` |

### When to Use bun build vs bun run

| Scenario | Use |
|----------|-----|
| Development, quick iteration | `bun run` (no bundling) |
| Production browser code | `bun build --target browser` |
| Production server code | `bun build --target bun` |
| Single executable | `bun build --compile` |
| Code splitting needed | `bun build --splitting` |

### When to Use bun test vs bun run

| Scenario | Use |
|----------|-----|
| Unit/integration tests | `bun test` |
| Running arbitrary scripts | `bun run` |
| Watch mode for development | `bun test --watch` |
| CI/CD with coverage | `bun test --coverage` |

## Workflow

### 1. Initialize a Project
```bash
bun init my-app
cd my-app
```
Choose template: Blank, React, or Library. Creates `package.json`, `tsconfig.json`, `bunfig.toml`.

### 2. Install Dependencies
```bash
bun install
# or add specific packages
bun add react
bun add -d @types/react
```
Generates `bun.lock` (commit this). Bun auto-installs on first run if no `node_modules` exists.

### 3. Run Scripts
```bash
# From package.json scripts
bun run dev
bun run build
bun run test

# Or run files directly
bun run src/index.ts
bun src/index.ts  # shorthand
```

### 4. Write Tests
Create `*.test.ts` or `*.spec.ts` files:
```typescript
import { test, expect } from "bun:test";

test("addition", () => {
  expect(2 + 2).toBe(4);
});
```
Run with `bun test`, watch with `bun test --watch`.

### 5. Build for Production
```bash
# Browser bundle
bun build ./src/index.tsx --outdir ./dist --target browser

# Server bundle
bun build ./src/server.ts --outdir ./dist --target bun

# Single executable
bun build ./cli.ts --outfile ./mycli --compile
```

### 6. Verify Before Shipping
- Run tests: `bun test --coverage`
- Check bundle size: `bun build --metafile ./meta.json`
- Lint with external tool (Bun doesn't include linter)
- Test in target environment

## Common Gotchas

- **Flag placement**: Put Bun flags before the command: `bun --watch run dev` ✓, not `bun run dev --watch` ✗
- **Auto-install disabled in production**: Set `install.auto = "disable"` in `bunfig.toml` for CI/CD
- **Lifecycle scripts security**: Bun doesn't run `postinstall` scripts by default. Add packages to `trustedDependencies` in `package.json` to allow them
- **Node.js compatibility incomplete**: Check [nodejs-compat](/runtime/nodejs-compat) page for gaps. Some Node.js APIs may not work
- **Lockfile format changed**: Bun v1.2+ uses text-based `bun.lock` (not `bun.lockb`). Upgrade with `bun install --save-text-lockfile`
- **TypeScript errors on Bun global**: Install `@types/bun` and add `"lib": ["ESNext"]` to `tsconfig.json`
- **Phantom dependencies in hoisted mode**: Use `isolated` linker to prevent accessing undeclared dependencies
- **Watch mode doesn't restart on package.json changes**: Restart manually when dependencies change
- **Bundler doesn't typecheck**: Use `tsc` separately for type checking; Bun only transpiles
- **External packages in bundles**: Mark packages as external with `--external` to exclude them from bundles

## Verification Checklist

Before submitting work with Bun:

- [ ] All tests pass: `bun test`
- [ ] No TypeScript errors: `bun run tsc --noEmit` (if using tsc)
- [ ] Dependencies installed: `bun install` completed without errors
- [ ] Lockfile committed: `bun.lock` is in version control
- [ ] Scripts work: `bun run <script>` executes correctly
- [ ] Bundle builds: `bun build` succeeds with no errors
- [ ] No console errors: Check `bun run <script>` output for warnings
- [ ] Coverage meets threshold: `bun test --coverage` if required
- [ ] Monorepo filters work: `bun run --filter <pattern> <script>` if using workspaces
- [ ] Production build tested: `bun build --target bun` or `--target browser` as appropriate

## Resources

- **Comprehensive navigation**: https://bun.com/docs/llms.txt (page-by-page reference for agents)
- **Runtime API**: https://bun.com/docs/runtime (file I/O, HTTP, networking, workers)
- **Package manager**: https://bun.com/docs/pm/cli/install (install, add, workspaces, lockfile)
- **Bundler**: https://bun.com/docs/bundler (build, splitting, plugins, executables)
- **Test runner**: https://bun.com/docs/test (writing tests, mocks, snapshots, coverage)

---

> For additional documentation and navigation, see: https://bun.com/docs/llms.txt