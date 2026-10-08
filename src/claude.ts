import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile); // lets us "await" a Terminal command

export async function askClaude(message: string) {
  const { stdout } = await run("claude", [
    "-p", message,                  
    "--tools", "",              
    "--no-session-persistence",  
    "--system-prompt", "You are a friendly, helpful assistant. Answer clearly and simply.",
  ]);
  return stdout.trim(); // stdout = the text Claude printed
}