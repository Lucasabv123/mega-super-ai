import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { getHostId } from "./hostIds.js";
import { makeAuthSecrets } from "./pkce.js";
import { buildAuthorizeUrl } from "./authUrl.js";
import { exchangeCode } from "./token.js";
import { getSavedClientId } from "./auth.js";

const HOST = "127.0.0.1"; // only this computer can connect, not your network
const PORT = 1455;

// Remember the secrets from /login so the callback can check them later.
let pendingState = "";
let pendingVerifier = "";

// This function runs once for every request the browser sends.
// req = what the browser asked for, res = what we send back.
// "async" lets us use "await" inside (needed to wait for OpenAI's answer).
const server = createServer(async (req, res) => {
  // Turn the request into a URL object so we can read its parts.
  const url = new URL(req.url ?? "/", "http://127.0.0.1:1455");
  // Log only the path, never the ?code=... part (that's a secret).
  console.log(`${req.method} ${url.pathname}`);

  // Start a sign-in: make fresh secrets, remember them, and send the browser to OpenAI.
  if (req.method === "GET" && url.pathname === "/login") {
    const secrets = makeAuthSecrets();
    pendingState = secrets.state;
    pendingVerifier = secrets.verifier;
    const authorizeUrl = buildAuthorizeUrl(getHostId(), secrets.state, secrets.nonce, secrets.challenge, getSavedClientId());
    res.writeHead(302, { Location: authorizeUrl }); // 302 = "go to this other page"
    res.end();
    return;
  }

  // OpenAI sends the browser back here after sign-in.
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

    // Save our app's registration ID so future sign-ins can reuse it.
    const clientId = url.searchParams.get("client_id") ?? getSavedClientId();
    if (clientId) {
      writeFileSync("data/client-id.txt", clientId);
      console.log("Saved client_id");
    }

    // Trade the one-time code for real tokens.
    const code = url.searchParams.get("code");
    if (!code || !clientId) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Missing code or client_id");
      return;
    }

    try {
      const tokens = await exchangeCode(code, pendingVerifier, clientId);
      writeFileSync("data/tokens.json", JSON.stringify({ ...tokens, expires_at: Date.now() + tokens.expires_in * 1000 }, null, 2));
      console.log("Got tokens:", Object.keys(tokens)); // names only, never the values!
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Signed in! Tokens saved.");
    } catch (error) {
      console.error(error);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Token exchange failed, check Terminal");
    }
    return;
  }

  // Anything else: 404 means "Not Found".
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found.");
});

// Start listening. The callback runs once the server is ready.
server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}/login`);
  console.log(`Host ID: ${getHostId()}`);
});
