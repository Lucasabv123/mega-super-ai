import { createServer } from "node:http";
import { writeFileSync, readFileSync } from "node:fs";
import { getHostId } from "./hostIds.js";
import { makeAuthSecrets } from "./pkce.js";
import { buildAuthorizeUrl } from "./authUrl.js";
import { exchangeCode } from "./token.js";
import { getSavedClientId } from "./auth.js";
import { askChatGPT } from "./openai.js";
import { createChat, getLatestChatId, saveMessage, getMessages, listChats, getMessagesForPage } from "./db.js";
import { listMemories,addMemory,deleteMemory, usageToday, tokensSince, saveReading, latestReading } from "./db.js";    
import { usageBar } from "./usageBar.js";
import { askClaude, claudeUsage } from "./claude.js";
import { pickModelSmart } from "./router.js";
import { debate } from "./debate.js";


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
  
  if (req.method === "POST" && req.headers.origin && req.headers.origin !== "http://127.0.0.1:1455") {
    res.writeHead(403);
    res.end();
    return;
  }
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
  // The chat page itself.
  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(readFileSync("public/index.html", "utf8"));
    return;
  }


        // The page asks for the newest chat when it opens.
    if (req.method === "GET" && url.pathname === "/chat/latest") {
        const chatId = getLatestChatId();
        const messages = chatId ? getMessagesForPage(chatId) : [];
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ chatId, messages }));
        return;
    }

        // The list of all chats, newest first.
    if (req.method === "GET" && url.pathname === "/chats") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(listChats()));
        return;
    }

    // One chat's messages, for example /chat/open?id=3
    if (req.method === "GET" && url.pathname === "/chat/open") {
        const chatId = Number(url.searchParams.get("id"));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ chatId, messages: getMessagesForPage(chatId) }));
        return;
    }

      // Shared memory: list, add, delete.
        if (req.method === "GET" && url.pathname === "/memories") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(listMemories()));
            return;
        }

        if (req.method === "POST" && url.pathname === "/memories") {
            let body = "";
            for await (const chunk of req) body += chunk;
            const { content } = JSON.parse(body);
            addMemory(content); // blank 1
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        if (req.method === "POST" && url.pathname === "/memories/delete") {
            let body = "";
            for await (const chunk of req) body += chunk;
            const { id } = JSON.parse(body);
            deleteMemory(id); // blank 2
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
            return;
        }
  

  // GET /usage: how many answers each AI gave today.
  if (req.method === "GET" && url.pathname === "/usage") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(usageToday()));
    return;
  }

  // GET /usage/since?provider=chatgpt&since=2026-10-08 17:30
  // Tokens one AI used since a start time, for comparing with ChatGPT's Settings > Usage %.
  if (req.method === "GET" && url.pathname === "/usage/since") {
    const provider = url.searchParams.get("provider") ?? "chatgpt";
    const since = url.searchParams.get("since") ?? "";
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ provider, since, ...tokensSince(provider, since) }));
    return;
  }

  // POST /reading: save what you read in ChatGPT Settings > Usage.
  if (req.method === "POST" && url.pathname === "/reading") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const r = JSON.parse(body);
    saveReading(r.fiveHourLeft, r.fiveHourResets, r.weeklyLeft, r.weeklyResets);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // GET /reading: your latest reading.
  if (req.method === "GET" && url.pathname === "/reading") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(latestReading() ?? null));
    return;
  }

  // GET /usage/bar: estimated % left of your ChatGPT limits.
  if (req.method === "GET" && url.pathname === "/usage/bar") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(usageBar()));
    return;
  }

  // GET /usage/claude: your real Claude plan usage, from Claude Code's /usage.
  if (req.method === "GET" && url.pathname === "/usage/claude") {
    res.writeHead(200, { "Content-Type": "application/json" });
    try {
      res.end(JSON.stringify(await claudeUsage()));
    } catch {
      res.end(JSON.stringify({ session: null, week: null })); // claude failed, so send no numbers instead of crashing
    }
    return;
  }

  // ===== POST /chat: the main chat route =====
  // The page sends { chatId, provider, message } here and gets { chatId, reply } back.
  if (req.method === "POST" && url.pathname === "/chat") {
    // only allow our own page (stops other websites from using your AIs)
    if (req.headers.origin && req.headers.origin !== "http://127.0.0.1:1455") {
      res.writeHead(403);
      res.end();
      return;
    }
    
    let body = "";
    for await (const chunk of req) body += chunk; // read what the page sent
    const { chatId: sentChatId, provider: chosen, message, files = [] } = JSON.parse(body); // files: pictures/documents you attached
    // "auto": the router picks the AI, model and effort from your message. Otherwise use the AI you picked, with its usual model.
    const pick = chosen === "auto" ? await pickModelSmart(message) : { provider: chosen, model: undefined, effort: undefined, reason: undefined };
    const provider = pick.provider;
    const chatId = sentChatId ?? createChat(); // no chat yet? make one
    saveMessage(chatId, "user", message, provider);
    try {
      const history = getMessages(chatId); // the whole chat, from the database
      const facts = listMemories().map((m) => "- " + m.content).join("\n");
      const memory = "Things to remember about the user:\n" + (facts || "(nothing yet)");

      // Debate mode: both AIs answer, then a judge picks the better answer.
      if (chosen === "debate") {
        const d = await debate(history, memory, files);
        saveMessage(chatId, "assistant", d.chatgpt.reply, "chatgpt", d.chatgpt.tokens, d.chatgpt.model, d.chatgpt.effort);
        saveMessage(chatId, "assistant", d.claude.reply, "claude", d.claude.tokens, d.claude.model, d.claude.effort);
        saveMessage(chatId, "assistant", d.judge.reply, "claude", d.judge.tokens, d.judge.model, d.judge.effort);
        console.log("debate used", d.chatgpt.tokens, "+", d.claude.tokens, "+", d.judge.tokens, "tokens");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ chatId, answers: [d.chatgpt, d.claude], judge: d.judge }));
        return;
      }

      const { reply, tokens, model, effort } = provider === "claude"
        ? await askClaude(history, memory, pick.model, pick.effort, files)
        : await askChatGPT(history, memory, pick.model, pick.effort, files);
      console.log(provider, model, effort, "used", tokens, "tokens");
      saveMessage(chatId, "assistant", reply, provider, tokens, model, effort);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ chatId, reply, model, effort, reason: pick.reason }));
    } catch (err) {
      console.error(err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Something went wrong, check Terminal" }));
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
