import { getAccessToken } from "./auth.js";
export type Message = { role: "user" | "assistant"; content: string };
// A file from the page: its name, its type (like "image/png") and its bytes as a data URL ("data:image/png;base64,...").
export type Attachment = { name: string; type: string; dataUrl: string };

// Models that refused ChatGPT's web search once (that model or your plan can't use it), so we stop asking for it.
const noWeb = new Set<string>();

export async function askChatGPT(history: Message[], memory: string, model = "gpt-6.1-sol", effort = "medium", files: Attachment[] = [], web = false) { const accessToken = await getAccessToken();
    

// Files go with your newest message: pictures as input_image, PDFs as input_file, text files as plain text.
const input: any[] = [...history];
if (files.length > 0) {
  const last = input[input.length - 1];
  const content: any[] = [{ type: "input_text", text: last.content }];
  for (const f of files) {
    if (f.type.startsWith("image/")) content.push({ type: "input_image", image_url: f.dataUrl });
    else if (f.type === "application/pdf") content.push({ type: "input_file", filename: f.name, file_data: f.dataUrl });
    else content.push({ type: "input_text", text: "File " + f.name + ":\n" + Buffer.from(f.dataUrl.split(",")[1], "base64").toString("utf8") });
  }
  input[input.length - 1] = { role: "user", content: content };
}

const useWeb = web && !noWeb.has(model);
const response = await fetch("https://api.openai.com/v1/responses", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: model,
    reasoning: { effort: effort }, // low, medium or high (higher = more thinking tokens)
    instructions: memory,
    input: input,
    store: false,  
    stream: true,
    ...(useWeb ? { tools: [{ type: "web_search" }] } : {}), // ChatGPT may search the web when it needs to
  }),
});


if (!response.ok) {
  const error = await response.text();
  // Web search isn't allowed for this model or plan: remember that, and ask again without it.
  if (useWeb && response.status === 400 && /web_search|tool/i.test(error)) {
    console.log("ChatGPT web search isn't available for " + model + ": " + error.slice(0, 200));
    noWeb.add(model);
    return askChatGPT(history, memory, model, effort, files, false);
  }
  throw new Error(`Error ${response.status}: ${error}`);
}

const text = await response.text();
let reply = "";
let tokens = 0; 
let finished = false;
const sources = new Map<string, string>(); // web pages ChatGPT cited: address -> title
const cite = (a: any) => { if (a?.type === "url_citation") sources.set(a.url, a.title || a.url); };
for (const line of text.split("\n")) {
  if (!line.startsWith("data: ")) continue;
  const event = JSON.parse(line.slice(6));
  if (event.type === "response.output_text.delta") reply += event.delta;
  // Web search: ChatGPT can send the pages it cited in 3 different places, so look in all of them.
  if (event.type === "response.output_text.annotation.added") cite(event.annotation);
  if (event.type === "response.output_item.done") {
    for (const part of event.item.content ?? []) for (const a of part.annotations ?? []) cite(a);
    if (event.item.type === "web_search_call") console.log("ChatGPT searched the web: " + (event.item.action?.query ?? event.item.action?.url ?? ""));
  }
  if (event.type === "response.completed") {
    finished = true;
    tokens = event.response.usage.total_tokens;
    model = event.response.model; // the exact model name ChatGPT used
    for (const item of event.response.output ?? [])
      for (const part of item.content ?? [])
        for (const a of part.annotations ?? []) cite(a);
  }
}
if (!finished) throw new Error("ChatGPT did not finish");
// Add the cited pages that the answer doesn't already show.
const pages = [...sources].filter(([url]) => !reply.includes(url));
if (pages.length > 0) reply += "\n\nSources:\n" + pages.map(([url, title]) => "- " + title + ": " + url).join("\n");
return { reply, tokens, model, effort };
}