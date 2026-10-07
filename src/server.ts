import { createServer } from "node:http";
import { getHostId } from "./hostIds.js";
import { makeAuthSecrets } from "./pkce.js";
import { buildAuthorizeUrl } from "./authUrl.js";
import { writeFileSync } from "node:fs";

const HOST = "127.0.0.1"; // only this computer can connect, not your network
const PORT = 1455;

// This function runs once for every request the browser sends.
// Remember the secrets from /login so the callback can check them later.
let pendingState = "";
let pendingVerifier = "";

// req = what the browser asked for, res = what we send back.
const server = createServer((req, res) => {
  // Turn the request into a URL object so we can read its parts.
  const url = new URL(req.url ?? "/", "http://127.0.0.1:1455");
  // Log only the path, never the ?code=... part (that's a secret).
  console.log(`${req.method} ${url.pathname}`);

    if (req.method === "GET" && url.pathname === "/auth/callback") {
    // Show which pieces OpenAI sent back (names only, not the secret values).
    console.log([...url.searchParams.keys()]);

    // The state OpenAI sent back to us.
    const returnedState = url.searchParams.get("state");

    // !== means "is not equal to".
    if (returnedState !== pendingState) {
      // 400 = "bad request": this reply doesn't belong to our /login.
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("State mismatch");
      return;
    }

    console.log("Scope:", url.searchParams.get("scope"));
    
    const clientId = url.searchParams.get("client_id");
    if (clientId) {
      writeFileSync("data/client-id.txt", clientId);
      console.log("Saved client_id");
    }

    // It matches, so this is the answer to OUR sign-in request.
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Signed in, state OK");
    return;
  }
  if (req.method === "GET" && req.url === "/auth/callback") {
    // 200 means "OK". The header tells the browser it's plain text.
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Callback reached.");
    return; // stop here so we don't also send the 404 below
  }

  if (req.method === "GET" && req.url === "/login") {
  const secrets = makeAuthSecrets();
  pendingState = secrets.state;
  pendingVerifier = secrets.verifier;
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
