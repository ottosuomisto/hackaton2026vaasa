// Pieni staattinen palvelin prototyypille: node scripts/serve.js [portti]
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "app");
const port = Number(process.argv[2]) || 8765;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };

http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]);
  const file = path.join(root, rel === "/" ? "index.html" : rel);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": `${types[path.extname(file)] || "application/octet-stream"}; charset=utf-8` });
    res.end(buf);
  });
}).listen(port, () => console.log(`VILPE Sense+: http://localhost:${port}`));
