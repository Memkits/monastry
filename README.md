# monastry

[![CI](https://github.com/Memkits/monastry/actions/workflows/ci.yml/badge.svg)](https://github.com/Memkits/monastry/actions/workflows/ci.yml)
[![Site](https://github.com/Memkits/monastry/actions/workflows/site.yml/badge.svg)](https://github.com/Memkits/monastry/actions/workflows/site.yml)
[![MoonBit](https://img.shields.io/badge/MoonBit-AST%20explorer-6b57ff)](https://www.moonbitlang.com/)

Monastry turns a MoonBit module into a navigable, execution-shaped AST. It
starts at an executable package's `main`, retains the recognizable shape of
the program, compresses parser-only detail into compact rows and tooltips, and
opens referenced definitions in adjacent context panels.

The frontend and command-line data service are separate:

- the Respo.mbt viewer is a static site at
  [r.tiye.me/Memkits/monastry](https://r.tiye.me/Memkits/monastry/);
- the `monastry` CLI preprocesses a local MoonBit project and exposes its AST
  index from a loopback HTTP endpoint;
- the CLI prints a viewer URL containing that endpoint in the `data` query
  parameter, so the hosted frontend can inspect local data without bundling or
  publishing project sources.

## Highlights

- Start at the selected executable `main` and follow the program outward.
- Parse `.mbt` and `.mbt.md` files, optionally including `.mooncakes` sources.
- Retain raw parser AST, locations, diagnostics, docs, and explicit types.
- Present a compact structural AST with calls, bindings, control flow,
  patterns, interpolations, binary expressions, and labelled arguments.
- Move detailed node kind, type, source range, and docs into hover metadata.
- Link direct calls, function values, module-level bindings, and local bindings
  to their definitions, without duplicating a definition already in the panel
  chain.
- Collect compiler-aware symbols and diagnostics through `moon ide` and
  `moon check`.
- Write a versioned `.monastry/index.json` artifact and expose it over a small
  read-only, CORS-enabled HTTP service.

## Requirements

- [MoonBit toolchain](https://www.moonbitlang.com/download/), currently pinned
  in CI to `moonc 0.10.4+2cc641edf` (`moon 0.1.20260713`)
- Node.js 20 or newer
- Corepack/Yarn; this repository pins Yarn through `packageManager`

`moonbitlang/parser` and `moonbitlang/lexer` use compiler-sensitive syntax.
Their versions and the MoonBit toolchain should be upgraded together.

## Quick start

```bash
corepack enable
yarn install --immutable
moon update

node ./cli/monastry.mjs serve /path/to/moonbit/project
```

The command prints both the local data endpoint and a complete hosted viewer
URL, for example:

```text
monastry: data   http://127.0.0.1:4177/api/index.json
monastry: viewer https://r.tiye.me/Memkits/monastry/?data=http%3A%2F%2F127.0.0.1%3A4177%2Fapi%2Findex.json
```

Open the printed viewer URL. The generated AST stays on the machine running
the CLI; only browser requests to the loopback service read it.

To generate data without starting the service:

```bash
node ./cli/monastry.mjs build /path/to/moonbit/project
```

The default artifact is `/path/to/moonbit/project/.monastry/index.json`.

## CLI

```text
monastry build [project] [options]
monastry serve [project] [options]
```

| Option | Meaning | Default |
| --- | --- | --- |
| `--out DIR`, `-o DIR` | Artifact output directory | `<project>/.monastry` |
| `--include-deps` | Parse dependency sources under `.mooncakes` | disabled |
| `--skip-check` | Skip the preprocessing `moon check` | disabled |
| `--host HOST` | Data-service bind address for `serve` | `127.0.0.1` |
| `--port PORT`, `-p PORT` | Data-service port for `serve` | `4177` |
| `--local` | Print a Vite viewer URL instead of the hosted viewer URL | disabled |
| `--help`, `-h` | Show command help | |

Examples:

```bash
# Include dependency syntax ASTs as well as dependency symbols.
node ./cli/monastry.mjs build ../my-app --include-deps

# Keep generated data outside the inspected project.
node ./cli/monastry.mjs build ../my-app --out /tmp/my-app-monastry

# Connect the Vite development frontend to the CLI data service.
node ./cli/monastry.mjs serve ../my-app --local --port 4312
```

Binding to a non-loopback host exposes source-bearing AST data to the network;
only do so on a network you trust.

## Frontend development

Run the data service and Vite in separate terminals:

```bash
# Terminal 1: preprocess the target project and print a local viewer URL.
node ./cli/monastry.mjs serve /path/to/moonbit/project --local

# Terminal 2: compile the MoonBit frontend and start Vite.
yarn dev
```

Vite runs at <http://127.0.0.1:5173/>. Open the URL printed by the first
command so its `data` parameter points Vite at the CLI service. Vite also
supports a repository-local artifact at `.monastry/index.json`; set
`MONASTRY_DATA` to another absolute `index.json` path when needed.

Build the deployable static frontend with:

```bash
yarn build:web
```

The output is written to `dist/` with relative asset paths and does not contain
an AST index.

## Architecture

```text
MoonBit project
  ├─ moon check ─────────────── diagnostics
  ├─ moonbitlang/parser ─────── source AST + locations + docs
  └─ moon ide gen-symbols ───── compiler-aware symbol index
                 │
                 ▼
        .monastry/index.json
                 │ local HTTP + CORS
                 ▼
  hosted or Vite Respo.mbt viewer
```

The parser AST is complete for syntax but untyped. `moon ide gen-symbols`
supplies a bulk semantic index; inferred expression types and exact
cross-package navigation belong in the planned persistent LSP enrichment
layer.

## Artifact and privacy notes

The current schema version is `2`. The index contains source text, parser data,
semantic symbols, and absolute source locations. Treat it as a local developer
artifact. The static deployment contains only the viewer and never uploads the
generated index.

## Development and releases

```bash
yarn check          # MoonBit type/lint check for the JS target
yarn test           # MoonBit tests followed by Node.js tests
yarn build:web      # Build the static Respo frontend
yarn release:check  # Inspect and validate the MoonCakes package contents
moon info           # Refresh generated public interfaces
moon fmt            # Format MoonBit sources
```

CI verifies pushes and pull requests. The site workflow builds and uploads PR
previews and deploys `main` to
[r.tiye.me/Memkits/monastry](https://r.tiye.me/Memkits/monastry/). Publishing a
GitHub Release runs the release workflow, reads `MOON_CREDENTIALS` from Actions
secrets, validates publication with a dry-run, and publishes `tiye/monastry` to
MoonCakes. Manually dispatching the same workflow performs the authenticated
dry-run only and never publishes a package.

For design constraints and next steps, see the
[research findings](docs/RESEARCH.md) and
[development plan](docs/DEVELOPMENT_PLAN.md).

## Current boundaries

- Full inferred expression types are not yet available from the public parser.
- Cross-package semantic resolution is only as complete as the current
  `moon ide` output and normalized name/range matching.
- The index is currently rebuilt as one JSON file rather than incremental
  shards.
- Browser security settings or enterprise policies may block an HTTPS page
  from contacting a loopback HTTP endpoint; `--local` is the development
  fallback.

## License

Apache-2.0, as declared by the MoonBit module metadata.
