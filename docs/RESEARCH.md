# MoonBit AST and type-information research

Research date: 2026-08-29. The locally verified toolchain is
moon 0.1.20260713 (75c7e1f 2026-07-13).

## Conclusion

No single stable public API currently returns the complete typed MoonBit AST.
The practical design is a layered index:

1. Use [moonbitlang/parser](https://github.com/moonbitlang/parser) for the
   complete source-shaped AST, source ranges, recovery diagnostics, and
   documentation comments.
2. Use compiler-aware moon ide commands (or the same engine through LSP) for
   symbols, definitions, references, hover text, and inferred types.
3. Normalize both into a versioned monastry schema. Never bind the UI directly
   to either experimental representation.

This keeps the implementation useful while leaving a clean seam for more
compiler information when MoonBit exposes a supported typed-tree API.

## Delivery architecture

The repository contains two MoonBit modules with separate lifecycles. The root
module contains the parser adapter and Node.js CLI host and is the only module
packaged for MoonCakes. `frontend/` contains the Respo application and is built
as a static site. The module's publish exclusions keep frontend and development
assets out of the CLI archive, while `moon package --list` and an authenticated
`moon publish --dry-run` verify that boundary before release.

The CLI data service binds to loopback by default and sends CORS and Private
Network Access response headers. The viewer selects its index endpoint from a
`data` query parameter, allowing the deployed static site or the Vite dev
server to connect to the same local service.

## Evaluated acquisition paths

### Official parser package — selected for syntax

The official parser repository defines the AST and both hand-written and
generated parsers. Its own README labels the API experimental. The published
AST JSON is nevertheless a strong fit for a source explorer:

- expressions, patterns, declarations, attributes, tests, and implementations;
- nested kind / children nodes;
- optional JSON source locations;
- attached documentation comments;
- error recovery reports.

The parser is source-shaped and deliberately has no compiler type checking.
That is a boundary, not a defect.

Compatibility is date-sensitive. moonbitlang/parser 0.3.18 did not type-check
with the installed July 13 toolchain, while 0.3.9 passed. The project therefore
pins 0.3.9; parser and toolchain should be upgraded together under CI.

### moon ide — selected for the semantic index

The installed moon exposes compiler-aware commands documented by moon ide
--help:

- outline
- hover --output-json
- peek-def
- find-references
- gen-symbols
- analyze
- doc

gen-symbols was verified against tiye/respo: it emitted 1,235 JSONL symbols and
included .mooncakes dependencies. Against tiye/react, the end-to-end monastry run
indexed 1,096 semantic symbols. This is the best bulk entry point today.

The command has no output-path option and writes symbols.jsonl in the package.
monastry refuses to overwrite a pre-existing file, reads the generated file, and
removes only the file it created.

### MoonBit LSP — selected for phase-two type enrichment

moon-lsp --stdio provides the standard semantic operations needed for exact
hover, definition, references, document symbols, and semantic tokens. It is a
better long-term source for on-demand inferred types than executing one CLI
process per AST node.

The planned enrichment worker will keep one LSP process per indexed module,
batch hovers only for visible or linkable nodes, and cache responses by file,
range, and toolchain fingerprint.

### Private lsp.ast files — rejected as a public integration point

The IDE build produces lsp.ast files, and the installed binary contains a full
typed-tree implementation. The observed file starts with a versioned magic such
as MAST250715, but there is no supported decoder or compatibility contract.
Reading it would couple monastry to private compiler serialization.

### Compiler source fork — fallback only

The [MoonBit compiler source repository](https://github.com/moonbitlang/moonbit-compiler)
is available, but embedding or patching the compiler would add OCaml build
complexity, version skew, and license review. It is only justified if the
official team never exposes an adequate typed-tree or LSP endpoint.

### Tree-sitter — optional incremental syntax fallback

The official
[tree-sitter-moonbit](https://github.com/moonbitlang/tree-sitter-moonbit)
grammar is attractive for incremental edits and a tolerant CST, but it lacks
MoonBit compiler semantics. It may later support live unsaved buffers, not the
canonical index.

## Package and dependency discovery

MoonBit's unit of compilation is a package, while a module contains multiple
packages. The scanner recognizes both current moon.pkg / moon.mod and legacy
JSON manifests. The MoonBit documentation notes that JSON package manifests are
deprecated, so moon fmt migrated this project to text manifests. See the
official
[package configuration documentation](https://docs.moonbitlang.com/en/latest/toolchain/moon/package.html).

Dependency syntax ASTs are optional because they can be large. Dependency
symbols are retained by default because moon ide gen-symbols naturally returns
them and they are needed for cross-package navigation.

## Data and security notes

- Bind the service to 127.0.0.1 by default.
- Do not evaluate source text or AST contents.
- Use argument arrays rather than shell interpolation for subprocesses.
- Refuse to overwrite an existing symbols.jsonl.
- Keep a schema version and toolchain fingerprint in every artifact.
- Absolute source paths are private workstation metadata; add a redaction mode
  before any hosted deployment.
