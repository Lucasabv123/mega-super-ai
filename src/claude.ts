import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile); // lets us "await" a Terminal command

export async function askClaude(message: string) {
  const { stdout } = await run("claude", [
    "-p", "Say hi in 5 words",                   // blank 1: the message to send
    "--tools", "",              // blank 2: an empty string "" = no tools, so Claude can only answer and can't touch your files
    "--no-session-persistence",  // don't save every chat in Claude Code's history
  ]);
  return stdout.trim(); // stdout = the text Claude printed
}