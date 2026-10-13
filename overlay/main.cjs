// The screen pop-up: press Cmd+Shift+Space in any app, ask a question, and the AI answers about what's on your screen.
// Start it with "npm run screen" while "npm run dev" is running in another Terminal.
const { app, BrowserWindow, globalShortcut, ipcMain } = require("electron");
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

// The pop-up page calls this with your question. It answers with { reply, model, effort, reason } or { error }.
ipcMain.handle("ask", async (event, question) => {
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
        provider: "auto",
        message: question + "\n📎 screen.jpg",
        files: [{ name: "screen.jpg", type: "image/jpeg", dataUrl: dataUrl }],
      }),
    });
    const data = await response.json();
    if (data.chatId) chatId = data.chatId; // your next question continues the same chat
    return data;
  } catch (err) {
    console.error(err);
    return { error: "Can't reach the server. Is \"npm run dev\" running?" };
  }
});
