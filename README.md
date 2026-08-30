# moonast

[![CI](https://github.com/Memkits/moonast/actions/workflows/ci.yml/badge.svg)](https://github.com/Memkits/moonast/actions/workflows/ci.yml)
[![MoonBit](https://img.shields.io/badge/MoonBit-AST%20explorer-6b57ff)](https://www.moonbitlang.com/)

moonast turns a MoonBit module into a navigable, execution-shaped AST website.
It starts from an executable package's `main`, keeps the recognizable shape of
the source, folds parser-only wrappers into compact rows, and lets references
open their definitions in adjacent context panels.

The parser adapter and browser application are written in MoonBit. A small
Node.js host handles project discovery, MoonBit tooling subprocesses, artifact
storage, and the loopback HTTP server. The UI uses
[Respo.mbt](https://github.com/Respo/respo.mbt) and preserves its immutable
state tree and virtual-DOM model.

## Highlights

- Start at the selected executable `main` and follow the program outward.
- Parse `.mbt` and `.mbt.md` files, optionally including `.mooncakes` sources.
- Retain raw parser AST, locations, diagnostics, docs, and explicit types.
- Present a compact semantic AST with calls, bindings, control flow, patterns,
  interpolations, binary expressions, and labelled arguments.
- Move detailed node kind, type, source range, and docs into hover metadata.
- Link direct calls, function values, module-level `let` bindings, and
  function-local bindings to their definitions.
- Mark local bindings explicitly while keeping module definitions distinct.
- Preserve the current context column when opening or replacing panels to the
  right, and reuse an existing definition instead of duplicating it.
- Collect compiler-aware symbols and diagnostics through `moon ide` and
  `moon check`.
- Write a portable, versioned `.moonast/index.json` artifact and serve it over
  loopback HTTP.

## Requirements

- [MoonBit toolchain](https://www.moonbitlang.com/download/), currently pinned
  in CI to `moonc 0.10.4+2cc641edf` (`moon 0.1.20260713`)
- Node.js 20 or newer
- Corepack/Yarn; this repository pins Yarn through `packageManager`

`moonbitlang/parser` and `moonbitlang/lexer` use compiler-sensitive syntax.
Their versions and the MoonBit toolchain must be upgraded together; CI pins the
known-compatible toolchain instead of silently following `latest`.

## Quick start

```bash
corepack enable
yarn install --immutable
moon update

node ./cli/moonast.mjs serve /path/to/moonbit/project
```

Open <http://127.0.0.1:4177>. The server preprocesses the target project,
builds the Respo frontend, and serves both the UI and generated index.

To generate data without starting the HTTP server:

```bash
node ./cli/moonast.mjs build /path/to/moonbit/project
```

The default output is `/path/to/moonbit/project/.moonast/index.json`.

## CLI

```text
moonast build [project] [options]
moonast serve [project] [options]
```

| Option | Meaning | Default |
| --- | --- | --- |
| `--out DIR`, `-o DIR` | Artifact output directory | `<project>/.moonast` |
| `--include-deps` | Parse dependency sources under `.mooncakes` | disabled |
| `--skip-check` | Skip the preprocessing `moon check` | disabled |
| `--host HOST` | HTTP bind address for `serve` | `127.0.0.1` |
| `--port PORT`, `-p PORT` | HTTP port for `serve` | `4177` |
| `--help`, `-h` | Show command help | |

Examples:

```bash
# Include dependency syntax ASTs as well as dependency symbols.
node ./cli/moonast.mjs build ../my-app --include-deps

# Keep generated data outside the inspected project.
node ./cli/moonast.mjs build ../my-app --out /tmp/my-app-moonast

# Run a loopback server on another port.
node ./cli/moonast.mjs serve ../my-app --port 4312
```

## Local frontend development

Generate an index in this repository, then start Vite:

```bash
node ./cli/moonast.mjs build /path/to/moonbit/project --out .moonast
yarn build
yarn vite --config vite.config.mjs
```

Vite runs at <http://127.0.0.1:5173/> and reads `.moonast/index.json`. To use
another artifact, set `MOONAST_DATA` to its absolute `index.json` path before
starting Vite.

For simultaneous MoonBit and Vite development, use two terminals:

```bash
yarn dev:moon
yarn vite --config vite.config.mjs
```

## How it works

```text
MoonBit module
  ├─ moon check ─────────────── diagnostics
  ├─ moonbitlang/parser ─────── source AST + locations + docs
  └─ moon ide gen-symbols ───── compiler-aware symbol index
                 │
                 ▼
          normalized program graph
                 │
                 ▼
          .moonast/index.json
                 │ HTTP
                 ▼
          Respo.mbt tree UI
```

The checked-in parser adapter uses `moonbitlang/parser`. Its AST is complete for
syntax but untyped. `moon ide gen-symbols` supplies a bulk semantic index;
future inferred expression types and exact cross-package navigation belong in
the planned persistent LSP enrichment layer.

## Artifact and privacy notes

The current schema version is `2`. The index contains source text, parser data,
semantic symbols, and absolute source locations. Treat it as a local developer
artifact: do not publish it before adding or applying path/source redaction.

Large projects can generate sizeable single-file indexes. Per-file lazy shards
and incremental rebuilds are planned but not part of the current format.

## Development

```bash
yarn check       # MoonBit type/lint check for the JS target
yarn test        # MoonBit tests followed by Node.js tests
yarn build       # Build the MoonBit Respo application for JS
moon info        # Refresh generated public interfaces
moon fmt         # Format MoonBit sources
```

CI runs the same checks on pushes and pull requests, and also fails when
`moon info` or `moon fmt` would leave a tracked diff.

For design constraints and next steps, see the
[research findings](docs/RESEARCH.md) and
[development plan](docs/DEVELOPMENT_PLAN.md).

## Current boundaries

- Full inferred expression types are not yet available from the public parser.
- Cross-package semantic resolution is only as complete as the current
  `moon ide` output and normalized name/range matching.
- The local server is intentionally bound to loopback by default.
- The index is currently rebuilt as one JSON file rather than incremental
  shards.

## License

Apache-2.0, as declared by the MoonBit module metadata.
