# Navigation evidence and package ownership

The source viewer resolves references using lexical scope and the package import
graph. A navigation link identifies a source definition; it does not establish
that the definition runs, or that a dynamically dispatched call selects it.

## Acquisition

The CLI checks each local module (including a separated frontend module), then
reads that module's `_build/packages.json`. The adapter in `cli/packages.mjs`
consumes file ownership, canonical package names, import aliases, source roots,
test imports and executable flags. It never executes the build commands stored
in the inventory. Dependency source discovery happens after checking so newly
materialized `.mooncakes` files can be indexed.

`_build/packages.json` is toolchain-sensitive. This adapter is verified with the
repository's pinned `moon 0.1.20260713` / `moonc 0.10.4+2cc641edf`. It validates
the inventory's source root and required fields, and is the only module that
reads this format. Unsupported metadata or a failed check produces a warning
and preserves syntax navigation. `--skip-check` intentionally disables import
resolution rather than trusting a potentially stale inventory.

Each file retains its existing project-relative `package` plus, when available:

- `packageName`: canonical MoonBit package name, independent of a `src` root;
- `moduleRoot`: local module owning this compiler inventory;
- `imports`: alias to actual project-relative source directory;
- `sourceKind`: source, whitebox-test, or test;
- `executable`: executable-package flag.

This is an additive extension of schema 2. Stable IDs and lazy shards remain
tracked in issue #3. Core paths may be outside the project; the inventory alone
does not cause arbitrary source files to be read or served. `--include-deps`
currently indexes `.mooncakes` sources, not the entire core library.

## Resolution states

| `resolution` | Meaning |
| --- | --- |
| `local` | Local binding/parameter/pattern in the enclosing definition |
| `package` | Unique matching definition in the current package |
| `import` | Unique definition in the package selected by an import alias |
| `using` | Unique definition introduced by a package-level `using` declaration, including renames |
| `declared-receiver` | Unique inherent method on a concrete, explicitly typed receiver |
| `ambiguous` | Multiple matching definitions; `candidateIds` retained |
| `needs-type` | Field/method receiver type is needed; visible method candidates may be retained |
| `unknown-import` | Qualified name has no available alias mapping |
| `dependency-not-indexed` | Import resolves to a package whose definitions are unavailable |
| `unresolved` | No definition found in the relevant package |

Simple `receiver.method` expressions can resolve when a local/current-package
receiver's explicit type and the matching inherent method are both indexed.
The type's import alias identifies the method's owning dependency. Imported
value types, generic dispatch, fields and intermediate chain result types still
require compiler enrichment.

Only resolved states assign `targetId`. An unknown qualified reference never
falls back to an unrelated global or local name. A field/method segment never
opens an arbitrary same-named function. Each compact segment retains its own
resolution tooltip. Candidate metadata stays out of the expanded AST rows.

## Remaining boundaries

- Receiver types, inferred generics and compiler definition positions require
  the LSP enrichment worker in issue #2.
- A source file with a parser error can have incomplete definitions even when
  its package is known. The existing parser diagnostics remain available.
- Source navigation does not yet model visibility, overload selection or
  implicit prelude imports with compiler precision.
- Dependency examples/tests are still parsed by recursive discovery; target
  and test selection need explicit compiler-aware filtering in a later slice.
- Loading the implementation of core/FFI definitions on demand and separating
  syntax references from call edges remain future work.
