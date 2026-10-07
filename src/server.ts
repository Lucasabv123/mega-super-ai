import { createServer } from "node:http";
import { getHostId } from "./hostIds.js";
import { makeAuthSecrets } from "./pkce.js";
import { buildAuthorizeUrl } from "./authUrl.js";

const HOST = "127.0.0.1"; // only this computer can connect, not your network
const PORT = 1455;

// This function runs once for every request the browser sends.
// req = what the browser asked for, res = what we send back.
const server = createServer((req, res) => {
  // Log every request so you can watch them arrive in Terminal.
  console.log(`${req.method} ${req.url}`);

  if (req.method === "GET" && req.url === "/auth/callback") {
    // 200 means "OK". The header tells the browser it's plain text.
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Callback reached.");
    return; // stop here so we don't also send the 404 below
  }

  if (req.method === "GET" && req.url === "/login") {
  const secrets = makeAuthSecrets();
  const url = buildAuthorizeUrl(getHostId(), secrets.state, secrets.nonce, secrets.challenge);
  res.writeHead(302, { Location: url }); // 302 = "go to this other page"
  res.end();
  return;
}
  // Anything else: 404 means "Not Found".
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found.");
});

// Start listening. The callback runs once the server is ready.
server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}/auth/callback`);
  console.log(`Host ID: ${getHostId()}`);
  //console.log(makeAuthSecrets());
});
