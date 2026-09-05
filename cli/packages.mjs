import fs from "node:fs";
import path from "node:path";

// Isolate Moon's version-sensitive build inventory here. Never run any command
// from the inventory; only consume source ownership and import metadata.
export function readPackageInventory(moduleRoot, project) {
  const inventory = JSON.parse(fs.readFileSync(path.join(moduleRoot, "_build", "packages.json"), "utf8"));
  if (inventory.source_dir !== moduleRoot || !Array.isArray(inventory.packages)) {
    throw new Error("Unsupported or stale MoonBit package inventory");
  }
  const files = new Map();
  const relative = (directory) => path.relative(project, directory) || ".";
  for (const pkg of inventory.packages) {
    if (typeof pkg["root-path"] !== "string" || typeof pkg.root !== "string" || typeof pkg.rel !== "string") {
      throw new Error("Unsupported MoonBit package metadata");
    }
    const directory = pkg["root-path"];
    const packageName = [pkg.root, pkg.rel].filter(Boolean).join("/");
    const importsFor = (deps) => {
      const imports = {};
      for (const dep of deps) {
        if (typeof dep.alias !== "string" || typeof dep.fspath !== "string") {
          throw new Error("Unsupported MoonBit import metadata");
        }
        Object.defineProperty(imports, dep.alias, { value: relative(dep.fspath), enumerable: true, configurable: true });
      }
      return imports;
    };
    for (const [key, extraDeps] of [
      ["files", []],
      ["mbt-md-files", []],
      ["wbtest-files", pkg["wbtest-deps"] ?? []],
      ["test-files", pkg["test-deps"] ?? []],
    ]) {
      for (const file of Object.keys(pkg[key] ?? {})) {
        files.set(path.resolve(moduleRoot, file), {
          package: relative(directory),
          packageName,
          moduleRoot: relative(moduleRoot),
          imports: importsFor([...(key === "test-files" ? [] : pkg.deps ?? []), ...extraDeps]),
          executable: pkg["is-main"] === true,
          sourceKind: key === "test-files" ? "test" : key === "wbtest-files" ? "whitebox-test" : "source",
        });
      }
    }
  }
  return files;
}
