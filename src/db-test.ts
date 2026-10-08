import { createChat, saveMessage, getMessages } from "./db.js";

const chatId = createChat();
saveMessage(chatId, "user", "hello database", "chatgpt");
console.log(chatId, getMessages(chatId));