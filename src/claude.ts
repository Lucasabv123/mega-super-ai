import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Message } from "./openai.js";

// full address of the claude program, so we don't depend on the Terminal finding it
const CLAUDE = join(homedir(), ".local", "bin", "claude");

const run = promisify(execFile); // lets us "await" a Terminal command

export async function askClaude(history: Message[], memory: string)  {
    const transcript = history
    .map((m) => (m.role === "user" ? "User: " : "Assistant: ") + m.content)
    .join("\n\n");
  const { stdout } = await run(CLAUDE, [
    "-p", transcript,
    "--tools", "",
    "--no-session-persistence",
    "--system-prompt", "You are a friendly, helpful assistant. You will see the conversation so far. Reply only to the last User message, clearly and simply." + "\n\n" + memory
  ]);
  return stdout.trim(); // stdout = the text Claude printed
}