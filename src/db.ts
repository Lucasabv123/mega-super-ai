import { DatabaseSync } from "node:sqlite";
import type { Message } from "./openai.js";


// Opens the database file (creates it the first time).
const db = new DatabaseSync("data/chats.db");

// Make the tables if they don't exist yet.
db.exec(`
  CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY,
    chat_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    provider TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
    CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

    CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY,
    five_hour_left REAL NOT NULL,
    five_hour_resets TEXT NOT NULL,
    weekly_left REAL NOT NULL,
    weekly_resets TEXT NOT NULL,
    read_at TEXT DEFAULT (datetime('now', 'localtime'))
  );
`);

// Add the new columns to the messages table (skips any that are already there).
for (const column of ["tokens INTEGER", "model TEXT", "effort TEXT"]) {
  try { db.exec("ALTER TABLE messages ADD COLUMN " + column); } catch {}
}

export function createChat(): number {
  const result = db.prepare("INSERT INTO chats DEFAULT VALUES").run();
  return Number(result.lastInsertRowid); // the new chat's id
}

export function getLatestChatId(): number | null {
  const row = db.prepare("SELECT MAX(id) AS id FROM chats").get() as { id: number | null };
  return row.id;
}

// Each ? is a slot that run() fills in, in order.
// tokens, model and effort are only known for AI answers, so they default to null.
export function saveMessage(chatId: number, role: string, content: string, provider: string,
                            tokens: number | null = null, model: string | null = null, effort: string | null = null) {
  db.prepare("INSERT INTO messages (chat_id, role, content, provider, tokens, model, effort) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(chatId, role, content, provider, tokens, model, effort);
}

export function getMessages(chatId: number): Message[] {
  return db.prepare("SELECT role, content FROM messages WHERE chat_id = ? ORDER BY id")
    .all(chatId) as Message[];
}

// One chat's messages for the page, with which model and effort wrote each answer.
export function getMessagesForPage(chatId: number) {
  return db.prepare("SELECT role, content, model, effort FROM messages WHERE chat_id = ? ORDER BY id").all(chatId);
}

export function listChats() {
  return db.prepare(`
    SELECT id,
      (SELECT content FROM messages WHERE chat_id = chats.id ORDER BY id LIMIT 1) AS title
    FROM chats ORDER BY id DESC
  `).all() as { id: number; title: string }[];
}
// Shared memory: facts about you that both AIs get to see.
export function addMemory(content: string) {
  db.prepare("INSERT INTO memories (content) VALUES (?)").run(content);
}

export function listMemories() {
  return db.prepare("SELECT id, content FROM memories ORDER BY id")
    .all() as { id: number; content: string }[];
}

export function deleteMemory(id: number) {
  db.prepare("DELETE FROM memories WHERE id = ?").run(id);
}


// Answers and tokens per AI, model and effort, today.
export function usageToday() {
  return db.prepare(`
    SELECT provider, model, effort, COUNT(*) AS count, SUM(tokens) AS tokens
    FROM messages
    WHERE role = 'assistant' AND date(created_at, 'localtime') = date('now', 'localtime')
    GROUP BY provider, model, effort
  `).all() as { provider: string; model: string | null; effort: string | null; count: number; tokens: number | null }[];
}

// Tokens and answers from one AI since a time on your Mac's clock, like "2026-10-08 17:30".
export function tokensSince(provider: string, since: string) {
  const row = db.prepare(`
    SELECT SUM(tokens) AS tokens, COUNT(*) AS answers
    FROM messages
    WHERE role = 'assistant' AND provider = ? AND datetime(created_at, 'localtime') >= ?
  `).get(provider, since) as { tokens: number | null; answers: number };
  return { tokens: row.tokens ?? 0, answers: row.answers };
}

// ChatGPT tokens since a time, split by model (pricier models use up more of the limit).
export function chatgptTokensByModel(since: string) {
  return db.prepare(`
    SELECT model, SUM(tokens) AS tokens
    FROM messages
    WHERE role = 'assistant' AND (provider = 'chatgpt' OR model LIKE 'gpt-%')
      AND datetime(created_at, 'localtime') >= ?
    GROUP BY model
  `).all(since) as { model: string | null; tokens: number | null }[];
}

// Your ChatGPT Settings > Usage readings: % left and reset times, like "2026-10-12 21:30".
export function saveReading(fiveHourLeft: number, fiveHourResets: string, weeklyLeft: number, weeklyResets: string) {
  db.prepare("INSERT INTO readings (five_hour_left, five_hour_resets, weekly_left, weekly_resets) VALUES (?, ?, ?, ?)")
    .run(fiveHourLeft, fiveHourResets, weeklyLeft, weeklyResets);
}

export function latestReading() {
  return db.prepare("SELECT * FROM readings ORDER BY id DESC LIMIT 1").get() as
    { five_hour_left: number; five_hour_resets: string; weekly_left: number; weekly_resets: string; read_at: string } | undefined;
}

// When the first answer from one AI came at or after a time, like "2026-10-13 19:10:22" (undefined if none yet).
export function firstAnswerSince(provider: string, since: string) {
  const row = db.prepare(`
    SELECT datetime(created_at, 'localtime') AS at
    FROM messages
    WHERE role = 'assistant' AND provider = ? AND datetime(created_at, 'localtime') >= ?
    ORDER BY id LIMIT 1
  `).get(provider, since) as { at: string } | undefined;
  return row?.at;
}
