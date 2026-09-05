import assert from "node:assert/strict";
import fs from "node:fs";

// Run against a freshly preprocessed frontend including its pinned dependencies.
// This exercises the actual MoonBit parser/inventory, beyond the unit fixtures.
const index = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
assert.equal(index.check.ok, true);
assert.deepEqual(index.warnings, []);
const definitions = index.program.definitions;
const entry = index.program.entry;
assert.equal(entry.path, "app/main.mbt");
assert.equal(entry.dependency, false);

function findNode(node, name) {
  if (node.referenceName === name || node.name === name) return node;
  for (const child of [...node.children ?? [], ...node.segments ?? []]) {
    const found = findNode(child, name);
    if (found) return found;
  }
}

function follow(ast, name, resolution) {
  const reference = findNode(ast, name);
  assert.ok(reference, `Missing reference: ${name}`);
  assert.equal(reference.resolution, resolution);
  const definition = definitions.find((d) => d.id === reference.targetId);
  assert.ok(definition, `Missing definition: ${name}`);
  return definition;
}

const render = follow(entry.ast, "render_loop", "declared-receiver");
assert.equal(render.path, ".mooncakes/tiye/respo/src/app.mbt");
const errorLog = follow(render.ast, "dom_ffi.error_log", "import");
assert.equal(errorLog.path, ".mooncakes/tiye/dom-ffi/src/console.mbt");
assert.ok(errorLog.ast.doc.includes("error message"));
assert.equal(errorLog.ast.type, "(String) -> Unit");
const view = follow(entry.ast, "view", "package");
const div = follow(view.ast, "div", "using");
assert.equal(div.package, ".mooncakes/tiye/respo/src/node");
assert.ok(div.ast.type);
console.log(`Verified ${index.files.length} files: main → render_loop → error_log; view → using div.`);
