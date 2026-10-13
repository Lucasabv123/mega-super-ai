import { usageBar } from "./usageBar.js";
import { claudeUsage } from "./claude.js";

// Picks which AI, model and effort should answer a message, using simple rules.
// The first rule that matches wins, so the order matters.
export function pickModel(message: string) {
  const text = message.toLowerCase();
  const words = message.trim().split(/\s+/).length;

  // Code: Claude Sonnet, thinking harder.
  if (/```|\bcode\b|\bbug\b|error|function|debug|typescript|javascript|python|html|css|sql/.test(text)) {
    return { provider: "claude", model: "sonnet", effort: "high", reason: "code" };
  }
  // Writing or a long message: Claude Sonnet.
  if (words > 80 || /\b(write|essay|email|letter|rewrite|explain)\b/.test(text)) {
    return { provider: "claude", model: "sonnet", effort: "medium", reason: "writing or long" };
  }
  // Short, simple question: ChatGPT's cheapest, fastest model.
  if (words <= 12) {
    return { provider: "chatgpt", model: "gpt-6-luna", effort: "low", reason: "short question" };
  }
  // Everything else: your everyday model.
  return { provider: "chatgpt", model: "gpt-6.1-sol", effort: "medium", reason: "everyday" };
}

const LOW = 10; // switch AIs when one has less than this % left

// Like pickModel, but switches to the other AI when the picked one is almost out.
export async function pickModelSmart(message: string) {
  const pick = pickModel(message);
  if (pick.provider === "chatgpt") {
    const bar = usageBar(); // your ChatGPT estimate
    if (bar && (bar.fiveHour.left < LOW || bar.weekly.left < LOW)) {
      return { provider: "claude", model: "sonnet", effort: pick.effort, reason: pick.reason + ", ChatGPT almost out" };
    }
  } else {
    const usage = await claudeUsage().catch(() => null); // your real Claude numbers (null if claude fails)
    if (usage?.session && (usage.session.left < LOW || (usage.week && usage.week.left < LOW))) {
      return { provider: "chatgpt", model: "gpt-6.1-sol", effort: pick.effort, reason: pick.reason + ", Claude almost out" };
    }
  }
  return pick;
}

// For Debate: picks a model and effort for EACH AI, using the same rules as pickModel.
export function pickBoth(message: string) {
  const pick = pickModel(message);
  if (pick.provider === "claude") {
    // The rules picked Claude, so ChatGPT gets its everyday model at the same effort.
    return { claude: pick, chatgpt: { model: "gpt-6.1-sol", effort: pick.effort, reason: pick.reason } };
  }
  // The rules picked ChatGPT, so Claude gets Sonnet at the same effort.
  return { chatgpt: pick, claude: { model: "sonnet", effort: pick.effort, reason: pick.reason } };
}
