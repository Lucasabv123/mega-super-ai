// The screen pop-up: press Cmd+Shift+Space in any app, ask a question, and the AI answers about what's on your screen.
// Start it with "npm run screen" while "npm run dev" is running in another Terminal.
const { app, BrowserWindow, globalShortcut, ipcMain, clipboard } = require("electron");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { readFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const run = promisify(execFile); // lets us "await" a Terminal command
const SERVER = "http://127.0.0.1:1455";
const SHORTCUT = "CommandOrControl+Shift+Space";
let win = null;
let chatId = null; // the pop-up's own chat (null = the first question starts a new one)

// Makes the small window. It stays hidden until you press the shortcut.
function createWindow() {
  win = new BrowserWindow({
    width: 460,
    height: 320,
    show: false,
    alwaysOnTop: true, // floats above every other app
    type: "panel",     // Mac: floats over full-screen apps and shows on every desktop, so it doesn't switch you away
    webPreferences: { preload: join(__dirname, "preload.cjs") },
  });
  win.loadFile(join(__dirname, "popup.html"));
}

app.whenReady().then(() => {
  createWindow();
  // The shortcut works from any app: it opens the pop-up, or hides it if it's already open.
  globalShortcut.register(SHORTCUT, () => {
    if (!win || win.isDestroyed()) createWindow(); // you closed it? make a new one
    if (win.isVisible()) {
      win.hide();
    } else {
      app.show?.(); // Mac: undo app.hide() from typing (the ?. skips it on other systems)
      win.show();
      win.focus();
    }
  });
});

app.on("window-all-closed", () => {}); // keep running (and listening for the shortcut) after you close the pop-up
app.on("will-quit", () => globalShortcut.unregisterAll());

// Takes a picture of your screen and returns it as a data URL, like the files you attach on the chat page.
async function screenshot() {
  const file = join(tmpdir(), "mega-screen.jpg");
  await run("screencapture", ["-x", "-t", "jpg", file]); // -x = no camera sound, -t jpg = smaller than png
  await run("sips", ["-Z", "1568", file]);              // shrink so the longest side is 1568 pixels (fewer tokens)
  return "data:image/jpeg;base64," + readFileSync(file).toString("base64");
}

ipcMain.on("hide", () => win.hide());

// Looks for an action at the end of the AI's answer, like "ACTION: open_app Spotify",
// "ACTION: open_url https://youtube.com", "ACTION: browse", or "ACTION: type_text" with the text on the lines after it.
// Returns null when there is none, or when it isn't one of the four safe kinds.
function findAction(reply) {
  const typing = reply.match(/^ACTION: type_text\n([\s\S]+)$/m); // [\s\S]+ = everything after it, even several lines
  if (typing && typing[1].trim()) return { type: "type_text", target: typing[1].trim(), line: typing[0] };
  const browsing = reply.match(/^ACTION: browse[ \t]*$/m);
  if (browsing) return { type: "browse", target: "", line: browsing[0] };
  const match = reply.match(/^ACTION: (open_app|open_url) (.+)$/m);
  if (!match) return null;
  const type = match[1];
  const target = match[2].trim();
  if (type === "open_url" && !/^https?:\/\//.test(target)) return null; // only web addresses, no files or other apps' links
  if (type === "open_app" && !/^[\w .&'-]+$/.test(target)) return null;   // only plain app names
  return { type: type, target: target, line: match[0] };
}

let pending = null; // the action waiting for your Yes or No

// Types text where your cursor was: copies it, goes back to your app, and presses Cmd+V for you.
async function typeText(text) {
  clipboard.writeText(text);
  win.hide();
  app.hide?.(); // Mac: go back to the app you were in, with its text box
  await new Promise((resolve) => setTimeout(resolve, 400)); // give the Mac a moment to switch
  try {
    // System Events presses Cmd+V for you. macOS asks once for Accessibility permission.
    await run("osascript", ["-e", 'tell application "System Events" to keystroke "v" using command down']);
    return { done: true };
  } catch (err) {
    console.error(err);
    app.show?.();
    win.show();
    return { error: "It's copied, so press Cmd+V to paste it. To let me paste for you, allow Accessibility for Visual Studio Code." };
  }
}

// Does an action: opens an app or a website, or types text where your cursor was.
async function runAction(action) {
  if (action.type === "type_text") return typeText(action.target);
  try {
    if (action.type === "open_app") await run("open", ["-a", action.target]); // like typing: open -a Spotify
    else await run("open", [action.target]);                                  // opens the address in your browser
    win.hide(); // get out of the way so you can see it
    return { done: true };
  } catch (err) {
    console.error(err);
    return { error: "Couldn't open " + action.target };
  }
}

const MAX_PAGES = 15; // the most pages it reads for one question (Google results count as a page)

// Runs a little JavaScript in Safari's front tab and returns its result.
// Needs Safari > Settings > Developer > "Allow JavaScript from Apple Events".
async function safari(js) {
  const { stdout } = await run("osascript", ["-l", "JavaScript", "-e",
    'function run(argv) { const s = Application("Safari"); return s.doJavaScript(argv[0], { in: s.windows[0].currentTab }); }', js]);
  return stdout.trim();
}

// Reads the page in Safari: its address, title, text (the first 12,000 letters) and up to 150 links.
// A link that only shows its address (like "Syllabus: https://...") gets the words in front of it,
// and a link that's on the page twice is listed once with both names.
const READ_PAGE = `(() => {
  const wordsBefore = (a, text) => {
    for (let box = a.parentElement, i = 0; box && i < 3; box = box.parentElement, i++) {
      const before = box.innerText.split(text)[0].trim();
      if (before) return before.split("\\n").pop().slice(-60) + " ";
    }
    return "";
  };
  const links = new Map();
  for (const a of document.links) {
    let text = a.innerText.trim();
    if (!text || !a.href.startsWith("http")) continue;
    if (text.startsWith("http")) text = wordsBefore(a, text) + text;
    const old = links.get(a.href);
    links.set(a.href, old && !old.includes(text) ? old + " / " + text : old || text);
  }
  return JSON.stringify({
    url: location.href,
    title: document.title,
    text: document.body.innerText.slice(0, 12000),
    links: [...links].slice(0, 150).map(([url, text]) => ({ text: text.slice(0, 160), url })),
  });
})()`;

// Opens a link in the same Safari tab, then waits until the new page has loaded (10 seconds at most).
// "back" presses Safari's Back button instead.
async function openInSafari(url, from) {
  if (url === from) return; // that page is already open
  await safari(url === "back" ? "history.back()" : "location.href = " + JSON.stringify(url));
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const [now, state] = JSON.parse(await safari("JSON.stringify([location.href, document.readyState])"));
      if (now !== from && state === "complete") return;
    } catch {} // Safari is still switching pages
  }
}

// Browses for you: reads the page in Safari, the AI picks a link, Safari opens it, and so on until it finds the answer.
async function browse(question, mode) {
  const visited = [];
  let tokens = 0;
  try {
    for (let step = 1; step <= MAX_PAGES; step++) {
      const page = JSON.parse(await safari(READ_PAGE));
      win.webContents.send("progress", "Reading page " + step + ": " + page.title + "...");
      const response = await fetch(SERVER + "/browse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, mode, question, page, visited, left: MAX_PAGES - step, tokens }),
      });
      const data = await response.json();
      if (data.error) return { error: data.error };
      tokens = data.tokens;
      if (data.answer !== undefined) {
        return { reply: data.answer, model: data.model, effort: data.effort, reason: "browsed " + step + (step === 1 ? " page" : " pages") };
      }
      visited.push(page.url);
      win.webContents.send("progress", "Opening " + data.open.text + "...");
      await openInSafari(data.open.url, page.url);
    }
  } catch (err) {
    console.error(err);
    return { error: "Couldn't read Safari. Open the page in Safari, and turn on Safari > Settings > Developer > Allow JavaScript from Apple Events." };
  }
}

// Actions that wait for your Yes. Opening and typing happen right away.
// Deleting and submitting will need a Yes (they come later, with clicking on the screen).
const ASK_FIRST = ["delete", "submit"];

// The pop-up page calls this when you click Yes (true) or No (false).
ipcMain.handle("confirm", async (event, yes) => {
  const action = pending;
  pending = null;
  if (!yes || !action) return { done: false };
  return runAction(action);
});

// The pop-up page calls this with your question. It answers with { reply, model, effort, reason } or { error }.
ipcMain.handle("ask", async (event, question, mode = "auto") => {
  let dataUrl;
  try {
    win.hide(); // hide the pop-up so it isn't in the picture
    await new Promise((resolve) => setTimeout(resolve, 300)); // give the Mac a moment to hide it
    dataUrl = await screenshot();
  } catch (err) {
    console.error(err);
    return { error: "Couldn't take a screenshot. Check Screen Recording permission (see Terminal)." };
  } finally {
    win.show();
  }
  try {
    const response = await fetch(SERVER + "/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: chatId,
        provider: mode, // Auto, Low power, ChatGPT, Claude or Debate, from the pop-up's dropdown
        message: question + "\n📎 screen.jpg",
        files: [{ name: "screen.jpg", type: "image/jpeg", dataUrl: dataUrl }],
        screen: mode !== "debate", // tells the server to add the rules for actions (Debate only compares answers)
      }),
    });
    const data = await response.json();
    if (data.chatId) chatId = data.chatId; // your next question continues the same chat
    // Debate: show both answers and the judge's verdict as one text. No actions, since two AIs could ask for different ones.
    if (data.answers) {
      pending = null;
      data.reply = data.answers.map((a) => a.model + ":\n" + a.reply).join("\n\n") + "\n\nJudge (" + data.judge.model + "):\n" + data.judge.reply;
      data.model = "Debate";
      data.effort = data.answers.map((a) => a.model).join(" vs ");
      return data;
    }
    pending = data.reply ? findAction(data.reply) : null;
    if (pending) {
      data.reply = data.reply.replace(pending.line, "").trim(); // hide the ACTION line from the answer
      if (pending.type === "browse") {
        // Browse: read pages in Safari and open links until it finds the answer.
        pending = null;
        const found = await browse(question, mode);
        if (found.error) return { ...data, reply: data.reply + "\n\n" + found.error };
        return { ...data, ...found };
      }
      if (!ASK_FIRST.includes(pending.type)) {
        // Open or type: do it now, and add a ✓ line to the answer.
        const action = pending;
        pending = null;
        const result = await runAction(action);
        const done = action.type === "type_text" ? "✓ Typed it where your cursor was. Cmd+Z undoes it." : "✓ Opened " + action.target;
        data.reply = (data.reply + "\n\n" + (result.error ?? done)).trim();
        return data;
      }
      data.action = pending.type + " " + pending.target + "?"; // delete or submit: the yellow box asks first
    }
    return data;
  } catch (err) {
    console.error(err);
    return { error: "Can't reach the server. Is \"npm run dev\" running?" };
  }
});
