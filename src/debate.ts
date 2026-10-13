// Debate mode: ChatGPT and Claude answer at the same time, then Claude Fable judges which answer is better.
import { askChatGPT } from "./openai.js";
import type { Message, Attachment } from "./openai.js";
import { askClaude } from "./claude.js";
import { pickBoth } from "./router.js";

export async function debate(history: Message[], memory: string, files: Attachment[] = []) {
  // Each AI gets its own model and effort, picked from the question like Auto.
  const question = history[history.length - 1].content;
  const pick = pickBoth(question);

  // Both AIs answer at the same time (Promise.all waits for both).
  const [chatgpt, claude] = await Promise.all([
    askChatGPT(history, memory, pick.chatgpt.model, pick.chatgpt.effort, files),
    askClaude(history, memory, pick.claude.model, pick.claude.effort, files),
  ]);

  // Shuffle and hide the names, so the judge can't favor one AI.
  const claudeIsA = Math.random() < 0.5;
  const a = claudeIsA ? claude : chatgpt;
  const b = claudeIsA ? chatgpt : claude;
  const prompt =
    "Question:\n" + question +
    "\n\nAnswer A:\n" + a.reply +
    "\n\nAnswer B:\n" + b.reply +
    '\n\nWhich answer is better? Write only "A" or "B" on the first line, then explain why in 2 or 3 sentences.';
  const judge = await askClaude([{ role: "user", content: prompt }], "You are a fair judge comparing two answers.", "fable", "medium");

  // Read the judge's pick ("A" or "B") and turn it back into a name.
  const pickedA = judge.reply.trim().startsWith("A");
  const winner = pickedA === claudeIsA ? "Claude" : "ChatGPT";
  const names = claudeIsA ? "A was Claude, B was ChatGPT" : "A was ChatGPT, B was Claude";
  const verdict = "Winner: " + winner + " (" + names + ")\n\n" + judge.reply;
  return {
    chatgpt: { ...chatgpt, reason: pick.chatgpt.reason },
    claude: { ...claude, reason: pick.claude.reason },
    judge: { ...judge, reply: verdict },
  };
}
