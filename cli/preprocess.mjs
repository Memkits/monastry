import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findPackages, findSources, packageForFile, readModuleName } from "./project.mjs";
import { buildProgram } from "./simplify.mjs";

const toolRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args, cwd, allowFailure = false) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  }
  return result;
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function parseSources(files) {
  const parsed = [];
  for (const batch of chunks(files, 80)) {
    const result = run("moon", ["run", "parser", "--target", "js", "--", ...batch], toolRoot);
    try {
      parsed.push(...JSON.parse(result.stdout));
    } catch (error) {
      throw new Error(`Parser returned invalid JSON: ${error.message}\n${result.stdout.slice(0, 1000)}`);
    }
  }
  return parsed;
}

function collectSymbols(project, packages) {
  const symbols = new Map();
  const warnings = [];
  for (const packageDir of packages) {
    const symbolFile = path.join(packageDir, "symbols.jsonl");
    if (fs.existsSync(symbolFile)) {
      warnings.push(`Skipped semantic symbols for ${packageDir}: symbols.jsonl already exists`);
      continue;
    }
    const result = run("moon", ["ide", "gen-symbols", "--no-check"], packageDir, true);
    if (result.status !== 0 || !fs.existsSync(symbolFile)) {
      warnings.push(`moon ide gen-symbols failed in ${packageDir}: ${(result.stderr || result.stdout).trim()}`);
      continue;
    }
    try {
      for (const line of fs.readFileSync(symbolFile, "utf8").split(/\r?\n/)) {
        if (!line.trim()) continue;
        const item = JSON.parse(line);
        const key = `${item.pkg}\0${item.path}\0${JSON.stringify(item.name_range)}\0${JSON.stringify(item.kind)}`;
        symbols.set(key, item);
      }
    } finally {
      fs.unlinkSync(symbolFile);
    }
  }
  return { symbols: [...symbols.values()], warnings };
}

export function preprocess(options) {
  const moduleName = readModuleName(options.project);
  const sources = findSources(options.project, options.includeDeps);
  const packages = findPackages(options.project);
  if (sources.length === 0) throw new Error(`No MoonBit source files found in ${options.project}`);

  let check = { ok: true, diagnostics: [] };
  if (!options.skipCheck) {
    const checked = run("moon", ["check", "--output-json"], options.project, true);
    const output = `${checked.stdout}\n${checked.stderr}`.trim();
    check = { ok: checked.status === 0, diagnostics: output ? output.split(/\r?\n/).filter(Boolean) : [] };
  }

  const parsed = parseSources(sources.map((item) => item.absolute));
  const byPath = new Map(parsed.map((item) => [path.resolve(item.path), item]));
  const files = sources.map((item, index) => {
    const result = byPath.get(item.absolute) ?? { ast: [], diagnostics: [{ message: "missing parser result" }] };
    return {
      id: `file:${index}`,
      path: path.relative(options.project, item.absolute),
      package: packageForFile(item.absolute, packages, options.project),
      dependency: item.dependency,
      source: fs.readFileSync(item.absolute, "utf8"),
      ast: result.ast,
      diagnostics: result.diagnostics,
    };
  });

  const semantic = collectSymbols(options.project, packages);
  const program = buildProgram(files, options.project);
  if (!program.entry) semantic.warnings.push("No local MoonBit `main` entry function was found");
  const index = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    project: { name: moduleName, root: options.project },
    toolchain: {
      moon: run("moon", ["version"], options.project, true).stdout.trim().split(/\r?\n/)[0] ?? "unknown",
      parser: "moonbitlang/parser@0.3.9",
      semanticSource: "moon ide gen-symbols",
    },
    check,
    warnings: semantic.warnings,
    program,
    files,
    symbols: semantic.symbols,
  };
  fs.mkdirSync(options.out, { recursive: true });
  const outputFile = path.join(options.out, "index.json");
  fs.writeFileSync(outputFile, JSON.stringify(index));
  return { index, outputFile };
}

export { toolRoot };
