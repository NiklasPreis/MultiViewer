'use strict'
const { app, BrowserWindow, BrowserView, ipcMain, shell } = require('electron')
const path = require('path')
const fs   = require('fs')

const HANDLE  = 22
const EDGE    = 10
const DEFAULT = 'https://www.google.com'

// ── Persistent settings ────────────────────────────────────────────────
let settingsPath
let settings = { rows: 3, cols: 3, favorites: ['', '', ''], theme: 'dark' }

function loadSettings() {
  try { Object.assign(settings, JSON.parse(fs.readFileSync(settingsPath, 'utf8'))) } catch {}
  settings.favorites = Array.isArray(settings.favorites) ? settings.favorites.slice(0, 3) : []
  while (settings.favorites.length < 3) settings.favorites.push('')
}
function saveSettings() {
  try { fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2)) } catch {}
}

// ── State ──────────────────────────────────────────────────────────────
let ROWS = 3, COLS = 3
let win
let nextId   = 0
let dragMode = false
let modalMode = false
let editMode = false
let audioId  = -1    // -1 = all unmuted
const cells  = []
const views  = {}

// ── Geometry ──────────────────────────────────────────────────────────
function contentSize() {
  const [w, h] = win.getContentSize()
  return { w, h, sw: Math.floor(w / COLS), sh: Math.floor(h / ROWS) }
}

function getOccupied() {
  const g = Array.from({ length: ROWS }, () => Array(COLS).fill(-1))
  for (const c of cells)
    for (let r = c.row; r < c.row + c.rowSpan; r++)
      for (let cl = c.col; cl < c.col + c.colSpan; cl++)
        if (r < ROWS && cl < COLS) g[r][cl] = c.id
  return g
}

function isAreaFree(row, col, rs, cs, skip = -1) {
  if (row < 0 || col < 0 || row + rs > ROWS || col + cs > COLS) return false
  const g = getOccupied()
  for (let r = row; r < row + rs; r++)
    for (let c = col; c < col + cs; c++)
      if (g[r][c] !== -1 && g[r][c] !== skip) return false
  return true
}

// ── BrowserView layout ─────────────────────────────────────────────────
function viewBounds(cell) {
  const { w, h, sw, sh } = contentSize()
  const handle = editMode ? HANDLE : 0
  const edge   = editMode ? EDGE   : 0
  const x  = cell.col * sw
  const y  = cell.row * sh
  const cw = cell.col + cell.colSpan >= COLS ? w - x : cell.colSpan * sw
  const ch = cell.row + cell.rowSpan >= ROWS ? h - y : cell.rowSpan * sh
  return {
    x:      x + edge,
    y:      y + handle + edge,
    width:  Math.max(1, cw - 2 * edge),
    height: Math.max(1, ch - handle - 2 * edge),
  }
}

function updateLayout() {
  if (!win || win.isDestroyed() || dragMode || modalMode) return
  for (const c of cells) {
    const v = views[c.id]
    if (v) v.setBounds(viewBounds(c))
  }
  pushLayout()
}

function pushLayout() {
  if (!win || win.isDestroyed()) return
  const { w, h, sw, sh } = contentSize()
  const occ = getOccupied()
  const empty = []
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (occ[r][c] === -1) empty.push({ row: r, col: c })
  win.webContents.send('layout', {
    cells: cells.map(c => ({ ...c, url: views[c.id]?.webContents.getURL() || '' })),
    sw, sh, w, h, ROWS, COLS,
    occupied: occ,
    empty,
    editMode,
    audioId,
  })
}

// ── Cell management ────────────────────────────────────────────────────
function createView(id, url) {
  const v = new BrowserView({
    webPreferences: { partition: `persist:cell${id}`, contextIsolation: true, nodeIntegration: false },
  })
  v.webContents.setWindowOpenHandler(({ url: u }) => { v.webContents.loadURL(u); return { action: 'deny' } })
  v.webContents.loadURL(url && url.trim() ? url : DEFAULT)

  const sendUrl = (_, u) => win?.webContents.send('cell-url', id, u)
  v.webContents.on('did-navigate', sendUrl)
  v.webContents.on('did-navigate-in-page', sendUrl)

  win.addBrowserView(v)
  views[id] = v

  if (audioId !== -1 && id !== audioId) v.webContents.setAudioMuted(true)

  return v
}

function addCell(row, col, url) {
  if (!isAreaFree(row, col, 1, 1)) return false
  const id = nextId++
  cells.push({ id, row, col, rowSpan: 1, colSpan: 1 })
  createView(id, url)
  updateLayout()
  return true
}

function removeCell(id) {
  const i = cells.findIndex(c => c.id === id)
  if (i === -1) return false
  cells.splice(i, 1)
  const v = views[id]
  if (v) { win.removeBrowserView(v); v.webContents.close(); delete views[id] }
  if (audioId === id) {
    audioId = -1
    for (const v2 of Object.values(views)) v2.webContents.setAudioMuted(false)
  }
  updateLayout()
  return true
}

function moveCell(id, row, col) {
  const c = cells.find(x => x.id === id)
  if (!c || !isAreaFree(row, col, c.rowSpan, c.colSpan, id)) return false
  c.row = row; c.col = col
  return true
}

function resizeCellFull(id, row, col, rs, cs) {
  const c = cells.find(x => x.id === id)
  if (!c || rs < 1 || cs < 1 || !isAreaFree(row, col, rs, cs, id)) return false
  c.row = row; c.col = col; c.rowSpan = rs; c.colSpan = cs
  return true
}

// ── Drag mode ──────────────────────────────────────────────────────────
function enterDragMode() {
  dragMode = true
  for (const v of Object.values(views)) v.setBounds({ x: 0, y: 0, width: 0, height: 0 })
}

function exitDragMode() {
  dragMode = false
  updateLayout()
}

// ── Grid resize ────────────────────────────────────────────────────────
function applyGrid(rows, cols) {
  ROWS = Math.max(1, Math.min(4, rows))
  COLS = Math.max(1, Math.min(6, cols))
  settings.rows = ROWS; settings.cols = COLS
  saveSettings()
  const toRemove = cells.filter(c => c.row >= ROWS || c.col >= COLS)
  for (const c of toRemove) removeCell(c.id)
  for (const c of cells) {
    c.rowSpan = Math.min(c.rowSpan, ROWS - c.row)
    c.colSpan = Math.min(c.colSpan, COLS - c.col)
  }
  updateLayout()
}

// ── App ────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  settingsPath = path.join(app.getPath('userData'), 'settings.json')
  loadSettings()
  ROWS = settings.rows
  COLS = settings.cols

  win = new BrowserWindow({
    show: false,
    title: 'MultiViewer - by NiklasPreis',
    icon: path.join(__dirname, 'icon.ico'),
    backgroundColor: '#111111',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.removeMenu()
  win.loadFile('index.html')
  win.once('ready-to-show', () => { win.maximize(); win.show() })
  win.on('resize', updateLayout)
  win.on('enter-full-screen', () => { win.webContents.send('fullscreen-change', true);  updateLayout() })
  win.on('leave-full-screen', () => { win.webContents.send('fullscreen-change', false); updateLayout() })
})

app.on('window-all-closed', () => app.quit())

// ── IPC ────────────────────────────────────────────────────────────────
ipcMain.on('add-cell',    (_, row, col, url) => addCell(row, col, url))
ipcMain.on('remove-cell', (_, id)            => removeCell(id))
ipcMain.on('navigate',    (_, id, url)       => views[id]?.webContents.loadURL(url))
ipcMain.on('leave-fullscreen',  ()           => win.setFullScreen(false))
ipcMain.on('open-external',    (_, url)      => shell.openExternal(url))
ipcMain.on('set-theme', (_, theme) => {
  settings.theme = theme
  saveSettings()
  win.setBackgroundColor(theme === 'light' ? '#e4e4e4' : '#111111')
})
ipcMain.on('modal-open',  () => { modalMode = true;  for (const v of Object.values(views)) v.setBounds({ x: 0, y: 0, width: 0, height: 0 }) })
ipcMain.on('modal-close', () => { modalMode = false; updateLayout() })
ipcMain.on('set-grid',    (_, rows, cols)    => applyGrid(rows, cols))
ipcMain.on('save-favorites', (_, favs)       => { settings.favorites = favs; saveSettings() })

ipcMain.on('set-audio', (_, id) => {
  audioId = id
  for (const [vid, v] of Object.entries(views))
    v.webContents.setAudioMuted(id !== -1 && Number(vid) !== id)
  pushLayout()
})

ipcMain.handle('toggle-fullscreen', () => { win.setFullScreen(!win.isFullScreen()); return win.isFullScreen() })
ipcMain.handle('toggle-edit',       () => { editMode = !editMode; updateLayout(); return editMode })
ipcMain.handle('get-settings',      () => ({ ...settings, ROWS, COLS }))

ipcMain.handle('drag-start',   ()                    => { enterDragMode(); return true })
ipcMain.handle('drag-end',     (_, id, row, col)     => { const ok = moveCell(id, row, col);              exitDragMode(); return ok })
ipcMain.handle('drag-cancel',  ()                    => { exitDragMode(); return true })

ipcMain.handle('resize-start', ()                         => { enterDragMode(); return true })
ipcMain.handle('resize-end',   (_, id, row, col, rs, cs) => { const ok = resizeCellFull(id, row, col, rs, cs); exitDragMode(); return ok })
ipcMain.handle('resize-cancel',()                         => { exitDragMode(); return true })
