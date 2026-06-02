import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const port = 4173;
const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
]);

function resolvePath(url = "/") {
  const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  const relative = normalize(pathname === "/" ? "index.html" : pathname.slice(1));
  const filePath = resolve(join(root, relative));
  return filePath.startsWith(`${root}\\`) ? filePath : null;
}

createServer(async (request, response) => {
  try {
    const filePath = resolvePath(request.url);
    if (!filePath || !(await stat(filePath)).isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": mimeTypes.get(extname(filePath)) ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`SignalCatch preview: http://127.0.0.1:${port}`);
});
