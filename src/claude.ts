import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Message, Attachment } from "./openai.js";

// full address of the claude program, so we don't depend on the Terminal finding it
const CLAUDE = join(homedir(), ".local", "bin", "claude");
const MODEL = "sonnet";   // blank: "sonnet", "opus" or "fable" (bigger = uses your plan faster)
const EFFORT = "medium"; // low, medium, high, xhigh or max (higher = more thinking tokens)

const run = promisify(execFile); // lets us "await" a Terminal command

export async function askClaude(history: Message[], memory: string, model = MODEL, effort = EFFORT, files: Attachment[] = []) {
    const transcript = history
    .map((m) => (m.role === "user" ? "User: " : "Assistant: ") + m.content)
    .join("\n\n");
    // Your message plus any files, in the format Claude reads with "--input-format stream-json".
    const content: any[] = [{ type: "text", text: transcript }];
    for (const f of files) {
      const data = f.dataUrl.split(",")[1]; // the base64 part, after "base64,"
      if (f.type.startsWith("image/")) content.push({ type: "image", source: { type: "base64", media_type: f.type, data: data } });
      else if (f.type === "application/pdf") content.push({ type: "document", source: { type: "base64", media_type: f.type, data: data } });
      else content.push({ type: "text", text: "File " + f.name + ":\n" + Buffer.from(data, "base64").toString("utf8") });
    }
    const claude = run(CLAUDE, [
    "-p",
    "--input-format", "stream-json",   // read the message from stdin (below), so it can carry pictures and PDFs
    "--tools", "",
    "--model", model,
    "--effort", effort,
    "--safe-mode",                  // no CLAUDE.md, memory, skills, plugins, hooks or MCP servers
    "--strict-mcp-config",          // ignore MCP servers from every settings file
    "--disallowedTools", "mcp__*",  // hide any MCP tools that still slip in
    "--disable-slash-commands",     // no skills list
    "--no-session-persistence",
    "--output-format", "stream-json",  // one JSON object per line
    "--verbose",                       // stream-json output needs this
    "--system-prompt", "You are a friendly, helpful assistant. You will see the conversation so far. Reply only to the last User message, clearly and simply." + "\n\n" + memory,
  ], { maxBuffer: 10 * 1024 * 1024 }); // allow up to 10 MB of output
  claude.child.stdin?.end(JSON.stringify({ type: "user", message: { role: "user", content: content } }) + "\n");
  const { stdout } = await claude;
  // stdout has one JSON object per line. The one with type "result" has the answer and the token counts.
  const data = stdout.trim().split("\n").map((line) => JSON.parse(line)).find((event) => event.type === "result");
  const u = data.usage; // Claude splits its count into 4 parts, so we add them up
  console.log(u);
  const tokens = u.input_tokens + u.output_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  return { reply: data.result, tokens, model: Object.keys(data.modelUsage).join(", "), effort };
}

    // Reads your real Claude plan usage with Claude Code's /usage command.
    // It runs on your Mac without asking Claude anything, so it uses no tokens.
    export async function claudeUsage() {
    const { stdout } = await run(CLAUDE, ["-p", "/usage", "--output-format", "json", "--no-session-persistence"]);
    const text: string = JSON.parse(stdout).result;
    // Find "Current session: 1% used · resets Oct 13 at 5:50pm (" and keep the 1 and the time.
    const session = text.match(/Current session: (\d+)% used.*?resets (.+?) \(/);
    const week = text.match(/Current week \(all models\): (\d+)% used.*?resets (.+?) \(/);
    const fable = text.match(/Current week \(Fable\): (\d+)% used.*?resets (.+?) \(/);
    return {
        session: session ? { left: 100 - Number(session[1]), resets: session[2] } : null,
        week: week ? { left: 100 - Number(week[1]), resets: week[2] } : null,
        fable: fable ? { left: 100 - Number(fable[1]), resets: fable[2] } : null,
    };
    }