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

function sendFile(response, file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  response.writeHead(200, {
    "content-type": mime[path.extname(file)] ?? "application/octet-stream",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  });
  fs.createReadStream(file).pipe(response);
}

export function startServer({ host, port, webRoot, dataFile, appFile }) {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
    if (url.pathname === "/api/index.json") return sendFile(response, dataFile);
    if (url.pathname === "/app.js") return sendFile(response, appFile);
    const relative = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
    const candidate = path.resolve(webRoot, relative);
    if (!candidate.startsWith(path.resolve(webRoot) + path.sep) && candidate !== path.resolve(webRoot, "index.html")) {
      response.writeHead(403).end();
      return;
    }
    sendFile(response, candidate);
  });
  server.listen(port, host, () => {
    console.log(`moonast: http://${host}:${port}`);
  });
  return server;
}
