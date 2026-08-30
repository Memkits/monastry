import path from "node:path";

export function parseArgs(argv) {
  const words = [...argv];
  const command = words[0] && !words[0].startsWith("-") ? words.shift() : "serve";
  const options = {
    command,
    project: process.cwd(),
    out: null,
    host: "127.0.0.1",
    port: 4177,
    includeDeps: false,
    skipCheck: false,
    local: false,
    help: false,
  };
  if (words[0] && !words[0].startsWith("-")) options.project = words.shift();
  while (words.length > 0) {
    const word = words.shift();
    if (word === "--out" || word === "-o") options.out = words.shift();
    else if (word === "--host") options.host = words.shift();
    else if (word === "--port" || word === "-p") options.port = Number(words.shift());
    else if (word === "--include-deps") options.includeDeps = true;
    else if (word === "--skip-check") options.skipCheck = true;
    else if (word === "--local") options.local = true;
    else if (word === "--help" || word === "-h") options.help = true;
    else throw new Error(`Unknown option: ${word}`);
  }
  options.project = path.resolve(options.project);
  options.out = path.resolve(options.out ?? path.join(options.project, ".monastry"));
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error(`Invalid port: ${options.port}`);
  }
  return options;
}

export const helpText = `monastry — explore a MoonBit project as a navigable AST

Usage:
  monastry build [project] [--out DIR] [--include-deps] [--skip-check]
  monastry serve [project] [--out DIR] [--host HOST] [--port PORT] [--local]

Commands:
  build   Parse project sources and write DIR/index.json
  serve   Build the index and serve its data to the hosted Respo viewer

Serve options:
  --local  Open the Vite development viewer at http://127.0.0.1:5173/
`;
