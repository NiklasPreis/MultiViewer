'use strict'
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('mv', {
  send:   (ch, ...a) => ipcRenderer.send(ch, ...a),
  invoke: (ch, ...a) => ipcRenderer.invoke(ch, ...a),
  on:     (ch, cb)   => ipcRenderer.on(ch, (_, ...a) => cb(...a)),
})
