# Mega Super AI

One chat app on my Mac that uses both my ChatGPT plan and my Claude plan, and picks the right AI for each question.

<!-- ____ : write 1-2 sentences in your own words: why you built it and what you learned -->

## What it does

- **One chat, two AIs.** Ask ChatGPT or Claude in the same chat. Both share the chat history and an editable Memory box.
- **Auto mode.** A small, cheap model rates how hard the question is, then sends it to the right model (from GPT-6 Luna up to Claude Opus). If an answer fails, it climbs to a stronger model.
- **Debate mode.** ChatGPT and Claude answer at the same time, then Claude judges the two answers without knowing which AI wrote which.
- **Web search.** Every mode can search the web and lists its sources.
- **Files.** Attach images, PDFs and text or code files to a message.
- **Usage bars.** Shows how much of my ChatGPT and Claude plan limits I have left.
- **Screen pop-up.** Press Cmd+Shift+Space anywhere to ask about what's on my screen. It can also open apps and websites, type text, and browse in Safari for me.

## How it works

- Node.js + TypeScript server on `127.0.0.1:1455`, plain HTML chat page.
- Signs in to ChatGPT with OAuth + PKCE, and talks to Claude through the Claude Code CLI.
- Chats are saved in SQLite.
- The screen pop-up is an Electron app.

## Run it

You need macOS, Node.js, a ChatGPT plan, and Claude Code installed and signed in.

```
npm install
npm run dev
```

Open http://127.0.0.1:1455 and sign in with ChatGPT.

For the screen pop-up, run this in a second terminal:

```
npm run screen
```

Your sign-in tokens and chats are saved in the `data/` folder, which is never uploaded.
