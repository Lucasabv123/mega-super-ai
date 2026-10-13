import { getAccessToken } from "./auth.js";
export type Message = { role: "user" | "assistant"; content: string };
// A file from the page: its name, its type (like "image/png") and its bytes as a data URL ("data:image/png;base64,...").
export type Attachment = { name: string; type: string; dataUrl: string };
export async function askChatGPT(history: Message[], memory: string, model = "gpt-6.1-sol", effort = "medium", files: Attachment[] = []) { const accessToken = await getAccessToken();
    

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
  }),
});


if (!response.ok) {
  throw new Error(`Error ${response.status}: ${await response.text()}`);
}

const text = await response.text();
let reply = "";
let tokens = 0; 
let finished = false;
for (const line of text.split("\n")) {
  if (!line.startsWith("data: ")) continue;
  const event = JSON.parse(line.slice(6));
  if (event.type === "response.output_text.delta") reply += event.delta;
  if (event.type === "response.completed") {
    finished = true;
    tokens = event.response.usage.total_tokens;
    model = event.response.model; // the exact model name ChatGPT used
  }
}
if (!finished) throw new Error("ChatGPT did not finish");
return { reply, tokens, model, effort };
}