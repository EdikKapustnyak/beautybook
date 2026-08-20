# Dependency audit notes

## Status: 0 vulnerabilities (resolved)

The 8 advisories (3 moderate, 4 high, 1 critical) reported at the initial
Stage 1 scaffold have been resolved by upgrading to the versions that ship
the fixes:

| Package                | Was       | Now       | Fixes                                                                           |
| ---------------------- | --------- | --------- | ------------------------------------------------------------------------------- |
| `next`                 | `^15.0.2` | `^16.3.0` | Bundled `postcss` XSS/path-traversal advisories, bundled `sharp`/`libvips` CVEs |
| `vitest`               | `^2.1.4`  | `^4.1.10` | Transitive `esbuild` dev-server advisory                                        |
| `@vitejs/plugin-react` | `^4.3.3`  | `^6.0.5`  | Required peer for `vitest@4` / `vite@8`                                         |

`npm audit` now reports `found 0 vulnerabilities` across all three
workspaces. Verified after the bump: `typecheck`, `lint`, `format:check`,
full test suite (95 tests), and `build` all pass.

## Why this was safe to do as a routine upgrade

- `next@16` and `vitest@4` were both stable (non-preview) releases at the
  time of the bump, not the preview builds `npm audit fix --force` would
  have installed when this was first triaged.
- `next@16`'s peer dependency range (`react ^18.2.0 || ^19.0.0`) is
  satisfied by the project's existing React 18.3.1 — no React major bump
  was needed.
- Full verification (typecheck/lint/test/build) passed with no code changes
  required in `apps/frontend` or `apps/admin` beyond the version bump
  itself and Prettier re-formatting the Next.js-regenerated `next-env.d.ts`
  files (Next 16 adds `.next/types/routes.d.ts` / `root-params.d.ts`
  imports there — auto-generated, not hand-edited).
- Discovered and fixed a related latent bug while upgrading: `vitest@4`'s
  default test-file discovery picked up compiled `*.test.js` files from
  `apps/backend/dist/` (leftover from a previous `npm run build`), causing
  every backend test to run twice. Fixed by (a) adding an explicit
  `exclude: ['**/node_modules/**', '**/dist/**']` in
  `apps/backend/vitest.config.ts`, and (b) introducing
  `apps/backend/tsconfig.build.json` (excludes `**/__tests__/**` and
  `*.test.ts`) so `npm run build` never emits test files into `dist/` in
  the first place — defense in depth, not just a vitest config fix.

## Review plan (unchanged going forward)

- Re-run `npm audit` before every release
  (`beautybook-development-tasks.md` §30 "Security verification before
  release").
- If a future advisory requires a breaking upgrade that ISN'T a routine,
  fully-verified bump like this one (e.g. a preview-only fix, or a major
  version with real breaking changes to this codebase), triage for actual
  exploitability before forcing it — don't upgrade blind just to silence
  the scanner. Document the reasoning here either way.
