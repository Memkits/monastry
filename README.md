# moonast

moonast turns a MoonBit module into a navigable AST website. The first vertical
slice combines the official MoonBit parser with compiler-aware moon ide
symbols, writes a portable JSON index, and renders it with
[Respo.mbt](https://github.com/Respo/respo.mbt).

## What works

- Parse every .mbt and .mbt.md source in the current module.
- Optionally include sources under .mooncakes.
- Keep source ranges, parser diagnostics, doc comments, and explicit types.
- Run moon check and collect its diagnostics.
- Index local and dependency symbols through moon ide gen-symbols.
- Write a compact .moonast/index.json artifact.
- Detect executable-package `main` functions and open the program from the
  selected entry instead of an arbitrary source file.
- Normalize parser JSON into a compact semantic AST (`Function`, `Call`,
  `Let`, `If`, patterns, arguments, and so on) while retaining the raw AST;
  positional-argument, sequence, anonymous-function, interpolation, and binary
  parser wrappers are folded into code-shaped rows.
- Index function-local `let` bindings and link calls back to their initializer
  within the owning function scope; local definitions are visibly marked.
- Index module-level `let` bindings separately and link references back to their
  initializer without marking them as local.
- Link both direct calls and functions passed as values (for example a
  component function argument) back to their definitions.
- Serve the artifact and Respo UI over loopback HTTP.
- Filter files, render the code outline fully expanded, keep short leaf
  expressions inline, encode types as compact hover markers, hover for
  location/type/docs, and follow linked local
  calls into definition panels.
- Reuse an existing definition column instead of appending the same function
  repeatedly to the navigation chain.

## Quick start

Requirements: a recent MoonBit toolchain and Node.js 20 or newer.

    yarn
    moon update
    moon test
    node ./cli/moonast.mjs serve /path/to/moonbit/project

Open <http://127.0.0.1:4177>.

Build data without starting a server:

    node ./cli/moonast.mjs build /path/to/project --out /path/to/output

Include dependency ASTs as well as their semantic symbols:

    node ./cli/moonast.mjs build /path/to/project --include-deps

Run node ./cli/moonast.mjs --help for all options.

## Architecture

    MoonBit module
      ├─ moon check ─────────────── diagnostics
      ├─ moonbitlang/parser ─────── untyped AST + locations + docs
      └─ moon ide gen-symbols ───── semantic symbol index (including deps)
                     │
                     ▼
              .moonast/index.json
                     │ HTTP
                     ▼
              Respo.mbt tree UI

The checked-in parser adapter is MoonBit. Filesystem traversal, subprocess
coordination, artifact writing, and HTTP serving currently use a small Node.js
host because these are host integration concerns and because moon ide is an
external tool. The UI and its immutable state/update tree are MoonBit + Respo.

See [research findings](docs/RESEARCH.md) and the
[development plan](docs/DEVELOPMENT_PLAN.md).

## Current boundaries

- The public parser AST is untyped. The current UI can show declared/explicit
  types; full inferred expression types require the planned LSP enrichment
  layer.
- moon ide gen-symbols is useful but currently positioned as tooling output,
  so moonast normalizes it behind schema version 1.
- The index includes absolute source paths for precise locations. Treat it as a
  local development artifact and do not publish it without redaction.
- Large modules should move to planned per-file lazy shards. The first version
  emits one compact JSON file for implementation simplicity.

## Verification

    moon check --target js -d
    moon test --target js
    node --test test/*.test.mjs
    moon info
    moon fmt
