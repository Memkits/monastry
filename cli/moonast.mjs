#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { helpText, parseArgs } from "./args.mjs";
import { preprocess, toolRoot } from "./preprocess.mjs";
import { startServer } from "./server.mjs";

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(helpText);
    process.exit(0);
  }
  if (options.command !== "build" && options.command !== "serve") throw new Error(`Unknown command: ${options.command}`);
  const { index, outputFile } = preprocess(options);
  console.log(`moonast: indexed ${index.files.length} files and ${index.symbols.length} symbols`);
  console.log(`moonast: wrote ${outputFile}`);
  if (options.command === "serve") {
    const built = spawnSync("moon", ["build", "--target", "js"], { cwd: toolRoot, stdio: "inherit" });
    if (built.status !== 0) throw new Error("Failed to build the Respo frontend");
    const webRoot = path.join(toolRoot, "web");
    const appFile = path.join(toolRoot, "_build", "js", "debug", "build", "app", "app.js");
    if (!fs.existsSync(path.join(webRoot, "index.html"))) throw new Error(`Missing frontend at ${webRoot}`);
    startServer({ host: options.host, port: options.port, webRoot, dataFile: outputFile, appFile });
  }
} catch (error) {
  console.error(`moonast: ${error.message}`);
  process.exitCode = 1;
}
