// Gives the pop-up page four safe functions, window.mega.ask(question, mode), window.mega.confirm(yes), window.mega.hide()
// and window.mega.onProgress(show), and nothing else.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mega", {
  ask: (question, mode) => ipcRenderer.invoke("ask", question, mode),
  confirm: (yes) => ipcRenderer.invoke("confirm", yes),
  hide: () => ipcRenderer.send("hide"),
  onProgress: (show) => ipcRenderer.on("progress", (event, text) => show(text)), // what it's doing while it browses
});
