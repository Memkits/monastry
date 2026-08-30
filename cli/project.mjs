import fs from "node:fs";
import path from "node:path";

const ignored = new Set([".git", "_build", "target", "node_modules", "dist", ".moonast", ".monastry"]);

function walk(directory, files, includeDeps, insideDeps = false) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    if (ignored.has(entry.name)) continue;
    if (entry.name === ".mooncakes" && !includeDeps) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file, files, includeDeps, insideDeps || entry.name === ".mooncakes");
    else if (entry.isFile() && (entry.name.endsWith(".mbt") || entry.name.endsWith(".mbt.md"))) {
      files.push({ absolute: file, dependency: insideDeps });
    }
  }
}

export function findSources(project, includeDeps) {
  const files = [];
  walk(project, files, includeDeps);
  return files.sort((a, b) => a.absolute.localeCompare(b.absolute));
}

export function findPackages(project) {
  const packages = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || ignored.has(entry.name) || entry.name === ".mooncakes") continue;
      visit(path.join(directory, entry.name));
    }
    if (fs.existsSync(path.join(directory, "moon.pkg")) || fs.existsSync(path.join(directory, "moon.pkg.json"))) {
      packages.push(directory);
    }
  };
  visit(project);
  return packages.sort();
}

export function readModuleName(project) {
  const jsonFile = path.join(project, "moon.mod.json");
  if (fs.existsSync(jsonFile)) return JSON.parse(fs.readFileSync(jsonFile, "utf8")).name ?? path.basename(project);
  const textFile = path.join(project, "moon.mod");
  if (fs.existsSync(textFile)) {
    const match = fs.readFileSync(textFile, "utf8").match(/^name\s*=\s*"([^"]+)"/m);
    if (match) return match[1];
  }
  throw new Error(`No moon.mod or moon.mod.json found in ${project}`);
}

export function packageForFile(file, packages, project) {
  let best = project;
  for (const candidate of packages) {
    if (file === candidate || file.startsWith(candidate + path.sep)) {
      if (candidate.length > best.length) best = candidate;
    }
  }
  return path.relative(project, best) || ".";
}
