import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(projectRoot, "web");
const appFile = path.join(
  projectRoot,
  "_build",
  "js",
  "debug",
  "build",
  "app",
  "app.js",
);
const dataFile = path.resolve(
  process.env.MOONAST_DATA ?? path.join(projectRoot, ".moonast", "index.json"),
);

function sendFile(response, file, contentType) {
  if (!fs.existsSync(file)) {
    response.statusCode = 404;
    response.setHeader("content-type", "text/plain; charset=utf-8");
    response.end("Missing generated file: " + file);
    return;
  }
  response.statusCode = 200;
  response.setHeader("content-type", contentType);
  response.setHeader("cache-control", "no-store");
  fs.createReadStream(file).pipe(response);
}

export default {
  root: webRoot,
  resolve: {
    alias: { "/app.js": appFile },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    fs: {
      allow: [projectRoot],
    },
  },
  plugins: [
    {
      name: "moonast-generated-assets",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const pathname = request.url?.split("?", 1)[0];
          if (pathname === "/api/index.json") {
            sendFile(response, dataFile, "application/json; charset=utf-8");
            return;
          }
          next();
        });
      },
    },
  ],
};
