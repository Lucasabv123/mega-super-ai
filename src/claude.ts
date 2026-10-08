import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Message } from "./openai.js";

// full address of the claude program, so we don't depend on the Terminal finding it
const CLAUDE = join(homedir(), ".local", "bin", "claude");
const MODEL = "sonnet";   // blank: "sonnet", "opus" or "fable" (bigger = uses your plan faster)
const EFFORT = "medium"; // low, medium, high, xhigh or max (higher = more thinking tokens)

const run = promisify(execFile); // lets us "await" a Terminal command

export async function askClaude(history: Message[], memory: string)  {
    const transcript = history
    .map((m) => (m.role === "user" ? "User: " : "Assistant: ") + m.content)
    .join("\n\n");
    const { stdout } = await run(CLAUDE, [
    "-p", transcript,
    "--tools", "",
    "--model", MODEL, 
    "--effort", EFFORT,
    "--safe-mode",                  // no CLAUDE.md, memory, skills, plugins, hooks or MCP servers
    "--strict-mcp-config",          // ignore MCP servers from every settings file
    "--disallowedTools", "mcp__*",  // hide any MCP tools that still slip in
    "--disable-slash-commands",     // no skills list
    "--no-session-persistence",
    "--output-format", "json",
    "--system-prompt", "You are a friendly, helpful assistant. You will see the conversation so far. Reply only to the last User message, clearly and simply." + "\n\n" + memory,
  ],);
  const data = JSON.parse(stdout); // stdout = what Claude printed, now a JSON object
  const u = data.usage; // Claude splits its count into 4 parts, so we add them up
  console.log(u);
  const tokens = u.input_tokens + u.output_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  return { reply: data.result, tokens, model: Object.keys(data.modelUsage).join(", "), effort: EFFORT };
}