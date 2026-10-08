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
`);

export function createChat(): number {
  const result = db.prepare("INSERT INTO chats DEFAULT VALUES").run();
  return Number(result.lastInsertRowid); // the new chat's id
}

export function getLatestChatId(): number | null {
  const row = db.prepare("SELECT MAX(id) AS id FROM chats").get() as { id: number | null };
  return row.id;
}

// Each ? is a slot that run() fills in, in order.
export function saveMessage(chatId: number, role: string, content: string, provider: string) {
  db.prepare("INSERT INTO messages (chat_id, role, content, provider) VALUES (?, ?, ?, ?)")
    .run(chatId, role, content, provider);
}

export function getMessages(chatId: number): Message[] {
  return db.prepare("SELECT role, content FROM messages WHERE chat_id = ? ORDER BY id")
    .all(chatId) as Message[];
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
