import { askChatGPT } from "./openai.js";
import type { Message, Attachment } from "./openai.js";
import { askClaude } from "./claude.js";
import { getMessagesForPage } from "./db.js";

// Auto's ladder, from cheapest to strongest. Auto starts on the step that fits your message,
// and climbs one step when a model can't answer or fails.
const LADDER = [
  { provider: "chatgpt", model: "gpt-6-luna", effort: "low", name: "luna" },    // 1: greetings, quick facts
  { provider: "chatgpt", model: "gpt-6.1-sol", effort: "medium", name: "sol" }, // 2: normal questions
  { provider: "claude", model: "sonnet", effort: "high", name: "sonnet" },      // 3: code, writing, several steps
  { provider: "chatgpt", model: "gpt-6-astra", effort: "high", name: "astra" }, // 4: very hard
  { provider: "claude", model: "opus", effort: "high", name: "opus" },          // only reached by climbing
];
const MAX_TRIES = 3; // at most 3 models answer one message

// Rules for the rater: luna reads your message and rates it, without answering it.
const RATER_RULES = `You sort messages for an AI app. Don't answer the message, only rate it.
Rate how hard the NEW message is to answer well, from 1 to 4:
1 = a greeting, thanks or a quick fact
2 = a normal question or a short explanation
3 = code, careful writing, or several steps of thinking
4 = very hard: advanced math, big plans or a long analysis
Add the word "again" if the user is asking the same thing again, or says the last answer was wrong, didn't work or didn't do what they asked.
Add the word "web" if answering needs the internet: news, prices, today's facts, or finding something online.
Reply with only the number, plus "again" or "web" if they fit. For example: 2 or 3 again or 2 web`;

// Asks luna how hard your new message is (1 to 4), whether you're asking again, and whether it needs the web.
async function rate(history: Message[]) {
  const users = history.filter((m) => m.role === "user");
  const question = users[users.length - 1]?.content ?? "";
  const lastQuestion = users[users.length - 2]?.content ?? "(none)";
  const before = history[history.length - 2]; // the answer right before your new message, if there is one
  const lastAnswer = before?.role === "assistant" ? before.content.slice(0, 300) : "(none)";
  try {
    const { reply } = await askChatGPT(
      [{ role: "user", content: "Last question: " + lastQuestion + "\nLast answer: " + lastAnswer + "\nNEW message: " + question }],
      RATER_RULES, "gpt-6-luna", "low");
    return { level: Number(reply.match(/[1-4]/)?.[0] ?? 2), again: /again/i.test(reply), web: /web/i.test(reply) };
  } catch (err) {
    console.error(err);
    return { level: 2, again: false, web: false }; // the rater failed, so treat it as a normal question
  }
}

// True when the answer's first sentence says it can't do it, like "I can't type into the box directly."
function gaveUp(reply: string) {
  const first = reply.trim().split(/[.!?\n]/)[0] ?? "";
  return first === "" || /\b(i can[’']?t|i cannot|i[’']?m unable|i am unable|i[’']?m not able|i am not able)\b/i.test(first);
}

// Which ladder step wrote an answer, from its saved model name (like "claude-sonnet-5-5"). -1 = not on the ladder.
function stepOf(model: unknown) {
  const saved = String(model ?? "");
  return LADDER.findIndex((s) => saved.includes(s.name));
}

// Auto: rates your message, starts on the right step, and climbs when a model can't answer or fails.
export async function smartAuto(chatId: number, history: Message[], memory: string, files: Attachment[], screen: boolean) {
  const { level, again, web } = await rate(history);
  let step = level - 1;
  const reasons = ["rated " + level];
  if (screen && step < 1) { step = 1; reasons.push("pop-up"); } // the pop-up's action rules need at least sol
  if (web && step < 2) { step = 2; reasons.push("needs web"); }    // Claude sonnet is the first step that can search the web
  if (again) {
    // You asked again: go one step above the model that answered last time.
    const answers = getMessagesForPage(chatId).filter((m) => m.role === "assistant");
    step = Math.max(step, stepOf(answers[answers.length - 1]?.model) + 1);
    reasons.push("asked again");
  }
  step = Math.min(step, LADDER.length - 1);

  const broken: string[] = []; // AIs that failed this time (like a usage limit): skip their other steps
  let kept = null;             // the last answer that gave up, used if no stronger model does better
  let lastError: unknown = null;
  for (let tries = 0; tries < MAX_TRIES && step < LADDER.length; step++) {
    const s = LADDER[step]!;
    if (broken.includes(s.provider)) continue;
    tries++;
    try {
      const answer = s.provider === "claude"
        ? await askClaude(history, memory, s.model, s.effort, files, true) // true = Claude may search the web
        : await askChatGPT(history, memory, s.model, s.effort, files, true); // true = ChatGPT may search the web
      if (!gaveUp(answer.reply)) return { ...answer, provider: s.provider, reason: reasons.join(", ") };
      kept = { ...answer, provider: s.provider };
      reasons.push(s.name + " couldn't");
    } catch (err) {
      console.error(err);
      lastError = err;
      broken.push(s.provider);
      reasons.push(s.name + " failed");
    }
  }
  if (kept) return { ...kept, reason: reasons.join(", ") };
  throw lastError ?? new Error("Auto found no model to answer");
}
