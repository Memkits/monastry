import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-allow-private-network": "true",
  "cross-origin-resource-policy": "cross-origin",
};

function sendFile(request, response, file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8", ...corsHeaders });
    response.end("Not found");
    return;
  }
  response.writeHead(200, {
    "content-type": mime[path.extname(file)] ?? "application/octet-stream",
    "cache-control": "no-store",
    ...corsHeaders,
  });
  if (request.method === "HEAD") response.end();
  else fs.createReadStream(file).pipe(response);
}

function browserHost(host) {
  return host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
}

export function dataUrl(host, port) {
  const visibleHost = browserHost(host);
  const urlHost = visibleHost.includes(":") ? `[${visibleHost}]` : visibleHost;
  return `http://${urlHost}:${port}/api/index.json`;
}

export function viewerUrl(host, port, local) {
  const viewer = new URL(
    local ? "http://127.0.0.1:5173/" : "https://r.tiye.me/Memkits/monastry/",
  );
  viewer.searchParams.set("data", dataUrl(host, port));
  return viewer.toString();
}

export function startServer({ host, port, dataFile, local = false }) {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
    if (request.method === "OPTIONS") {
      response.writeHead(204, corsHeaders);
      response.end();
      return;
    }
    if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/api/index.json") {
      sendFile(request, response, dataFile);
      return;
    }
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8", ...corsHeaders });
    response.end("Monastry exposes AST data at /api/index.json\n");
  });
  server.listen(port, host, () => {
    const address = server.address();
    const boundPort = typeof address === "object" && address ? address.port : port;
    console.log(`monastry: data   ${dataUrl(host, boundPort)}`);
    console.log(`monastry: viewer ${viewerUrl(host, boundPort, local)}`);
  });
  return server;
}
