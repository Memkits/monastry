# Development plan

## Product goal

Make a MoonBit program understandable as a navigable execution-shaped tree:
source and docs remain visible, structural details can be expanded, semantic
facts appear on hover, and definitions/references can be opened indefinitely
as right-hand context panels.

## Milestone 0 — working vertical slice (implemented)

- [x] Module/package/source discovery.
- [x] Optional .mooncakes dependency source discovery.
- [x] moon check preprocessing and diagnostics capture.
- [x] Official parser adapter with locations, docs, and AST JSON.
- [x] moon ide gen-symbols aggregation with collision-safe cleanup.
- [x] Versioned compact JSON artifact.
- [x] Loopback HTTP server.
- [x] Respo immutable store and recursive state tree.
- [x] File filtering and selection.
- [x] Expand/collapse tree controls.
- [x] Location, declared type, and documentation hover text.
- [x] Executable package detection and `main`-first program view.
- [x] Simplified structural AST with local call-to-definition links.
- [x] Unlimited right-hand subtree panel chain.
- [x] MoonBit test, strict check, interface generation, and formatting.
- [x] Browser verification on a real 10-file project.

Acceptance evidence:

- moon check --target js -d passes.
- moon test --target js passes.
- tiye/react produced 10 files and 1,096 symbols.
- Browser tests verified filtering, file switching, two consecutive detail
  panels, hover metadata, and zero console errors.

## Milestone 1 — stable normalized graph

1. Define typed schema structs instead of serving upstream raw JSON.
2. Assign stable node IDs from package/file/range/kind.
3. Normalize declarations, expressions, patterns, types, docs, and trivia.
4. Resolve parser nodes to moon ide symbols by range.
5. Add definition and reference edges.
6. Split output into manifest, per-file AST shards, and symbol shards.
7. Load shards lazily in the Respo UI.

Exit criteria: a parser version change affects only the adapter, and clicking a
reference opens its resolved declaration rather than only its syntactic
subtree.

## Milestone 2 — complete semantic enrichment

1. Implement a persistent JSON-RPC client for moon-lsp --stdio.
2. Collect document symbols and semantic tokens.
3. Batch/cache hovers for declarations and visible expressions.
4. Record inferred type, effect/error information, definition location, and
   reference locations.
5. Fall back gracefully when a file does not type-check.

Exit criteria: inferred expression types are visible on hover and cross-package
definition/reference navigation works for local packages and dependencies.

## Milestone 3 — execution-shaped views

The raw AST is accurate but not always the best explanation of runtime shape.
Add derived views without discarding source AST:

- call tree and reverse callers;
- data-type/constructor relationships;
- trait implementation graph;
- state/update flow for Respo applications;
- test-to-definition relationships;
- documentation view assembled from comments and examples.

Exit criteria: users can switch between source AST, call graph, type graph, and
documentation views while preserving a shared selection and panel history.

## Milestone 4 — scale and live development

- Watch manifests and sources; incrementally rebuild changed shards.
- Use content hashes and toolchain fingerprints.
- Virtualize very large trees and panel lists.
- Add server-sent events for index updates.
- Add redacted/exportable artifacts.
- Benchmark local modules, core-sized dependencies, and error-heavy edits.

Target budgets:

- initial manifest under 500 KB;
- selected file interactive within 200 ms after shard fetch;
- incremental rebuild below 500 ms for a typical source file;
- no all-AST-node DOM work.

## Milestone 5 — distribution

- Produce a reproducible moonast executable/package.
- Pin a supported MoonBit toolchain range.
- Test Linux, macOS, and Windows path/command behavior.
- Add fixture modules for syntax and semantic compatibility.
- Decide whether Node host integration migrates to MoonBit native APIs.
- Publish schema and adapter compatibility policy.

## Respo evolution policy

The current feature set did not require changing Respo. If future scale work
does, changes should remain generic and preserve:

- the immutable application store;
- the cursor-based state tree;
- virtual-DOM descriptions and diff/patch behavior;
- unidirectional event dispatch.

Likely reusable additions are keyed/virtualized child collections and
fine-grained memoization. They should be developed and tested in respo.mbt
before moonast depends on them.
