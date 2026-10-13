// Gives the pop-up page two safe functions, window.mega.ask(question) and window.mega.hide(), and nothing else.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mega", {
  ask: (question) => ipcRenderer.invoke("ask", question),
  hide: () => ipcRenderer.send("hide"),
});
