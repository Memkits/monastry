#!/usr/bin/env node
import { helpText, parseArgs } from "./args.mjs";
import { preprocess } from "./preprocess.mjs";
import { startServer } from "./server.mjs";

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(helpText);
    process.exit(0);
  }
  if (options.command !== "build" && options.command !== "serve") {
    throw new Error(`Unknown command: ${options.command}`);
  }
  const { index, outputFile } = preprocess(options);
  console.log(`monastry: indexed ${index.files.length} files and ${index.symbols.length} symbols`);
  console.log(`monastry: wrote ${outputFile}`);
  if (options.command === "serve") {
    startServer({
      host: options.host,
      port: options.port,
      dataFile: outputFile,
      local: options.local,
    });
  }
} catch (error) {
  console.error(`monastry: ${error.message}`);
  process.exitCode = 1;
}
