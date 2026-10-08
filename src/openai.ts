import { getAccessToken } from "./auth.js";
export type Message = { role: "user" | "assistant"; content: string };
export async function askChatGPT(history: Message[], memory: string) { const accessToken = await getAccessToken();
    

const response = await fetch("https://api.openai.com/v1/responses", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "gpt-6.1-sol",
    instructions: memory,
    input: history,
    store: false,  
    stream: true,
  }),
});


if (!response.ok) {
  throw new Error(`Error ${response.status}: ${await response.text()}`);
}

const text = await response.text();
let reply = "";
let tokens = 0; 
let model = ""; 
let effort = "";
let finished = false;
for (const line of text.split("\n")) {
  if (!line.startsWith("data: ")) continue;
  const event = JSON.parse(line.slice(6));
  if (event.type === "response.output_text.delta") reply += event.delta;
  if (event.type === "response.completed") {
    finished = true;
    tokens = event.response.usage.total_tokens;
    model = event.response.model;
    effort = event.response.reasoning?.effort ?? "default";
  }
}
if (!finished) throw new Error("ChatGPT did not finish");
return { reply, tokens, model, effort };
}