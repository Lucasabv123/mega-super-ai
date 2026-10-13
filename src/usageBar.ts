// Estimates how much of your ChatGPT limits is left,
// from your last reading and the tokens the app used since then.
import { latestReading, chatgptTokensByModel, firstAnswerSince } from "./db.js";

// From your test on 2026-10-12 (gpt-6.1-sol on Plus).
const TOKENS_PER_1_PERCENT = { fiveHour: 21700, weekly: 114000 };

// How much each model costs compared to gpt-6.1-sol (OpenAI's price list). Unknown models count as 1.
const MODEL_COST: Record<string, number> = {
  "gpt-6.1-sol": 1, "gpt-6-sol": 1, "gpt-5.6-sol": 2,
  "gpt-6-astra": 5, "gpt-6-luna": 0.05,
};

// Tokens since a time, turned into "Sol tokens".
function solTokensSince(since: string) {
  let total = 0;
  for (const row of chatgptTokensByModel(since)) {
    total += (row.tokens ?? 0) * (MODEL_COST[row.model ?? ""] ?? 1);
  }
  return total;
}

// How long each window lasts, in milliseconds.
const HOUR = 60 * 60 * 1000;
const WINDOW = { fiveHour: 5 * HOUR, weekly: 7 * HOUR * 24 };   // blank: 7 days, using HOUR

// Turns a Date into local time text like "2026-10-13 19:10:22".
// (Sweden writes dates this way, so we borrow its format.)
function toText(date: Date) {
  return date.toLocaleString("sv-SE");
}

// One bar.
function estimate(readLeft: number, readAt: string, resets: string, per1: number, windowMs: number) {
  // Still in the window you read: count down from your reading.
  if (new Date() < new Date(resets)) {
    const used = solTokensSince(readAt) / per1;
    return { left: Math.max(0, Math.round(readLeft - used)), resets };
  }

  // That window ended. Each new window starts with your first ChatGPT answer after the last one ended.
  let windowEnd = resets;
  while (true) {
    const start = firstAnswerSince("chatgpt", windowEnd);
    if (!start) return { left: 100, resets: "(timer starts with your next message)" };
    const end = toText(new Date(new Date(start).getTime() + windowMs));
    if (new Date() < new Date(end)) {
      const used = solTokensSince(start) / per1;
      return { left: Math.max(0, Math.round(100 - used)), resets: end.slice(0, 16) }; // a new window starts at 100%
    }
    windowEnd = end; // that window ended too, so look for the next one
  }
}

export function usageBar() {
  const r = latestReading();
  if (!r) return null;
  return {
    fiveHour: estimate(r.five_hour_left, r.read_at, r.five_hour_resets, TOKENS_PER_1_PERCENT.fiveHour, WINDOW.fiveHour),
    weekly: estimate(r.weekly_left, r.read_at, r.weekly_resets, TOKENS_PER_1_PERCENT.weekly, WINDOW.weekly),
  };
}