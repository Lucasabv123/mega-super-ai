import { readFileSync } from "node:fs";

const tokens = JSON.parse(readFileSync("data/tokens.json", "utf8"));

const response = await fetch("https://api.openai.com/v1/responses", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${tokens.access_token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "gpt-6.1-sol",
    input: [{ role: "user", content: "Say hi in 5 words"}], // blank 1: your message, like "Say hi in 5 words"
    store: false,  // blank 2: true or false? The plan says OpenAI must NOT save it
    stream: true, // blank 3: true or false? The plan says the answer must come in pieces
  }),
});

// blank 4: your response.ok check again
if (!response.ok) {
  throw new Error(`Error ${response.status}: ${await response.text()}`);
}

const text = await response.text();
let reply = "";
let finished = false;
for (const line of text.split("\n")) {
  if (!line.startsWith("data: ")) continue;
  const event = JSON.parse(line.slice(6));
  if (event.type === "response.output_text.delta") reply += event.delta;
  if (event.type === "response.completed") finished = true;
}
console.log(finished ? reply : "Did not finish, treat it as failed");