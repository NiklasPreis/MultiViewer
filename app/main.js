'use strict'
const { app, BrowserWindow, BrowserView, ipcMain } = require('electron')
const path = require('path')

const ROWS    = 3
const COLS    = 3
const HANDLE  = 22   // drag-handle strip height (px)
const EDGE    = 10   // resize-handle strip width/height (px)
const DEFAULT = 'https://www.google.com'

let win
let nextId   = 0
let dragMode = false
const cells  = []    // { id, row, col, rowSpan, colSpan }
const views  = {}    // id → BrowserView

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

// ── BrowserView layout ────────────────────────────────────────────────

function viewBounds(cell) {
  const { w, h, sw, sh } = contentSize()
  const x  = cell.col * sw
  const y  = cell.row * sh
  const cw = cell.col + cell.colSpan >= COLS ? w - x : cell.colSpan * sw
  const ch = cell.row + cell.rowSpan >= ROWS ? h - y : cell.rowSpan * sh
  return {
    x,
    y:      y + HANDLE,
    width:  Math.max(1, cw - EDGE),
    height: Math.max(1, ch - HANDLE - EDGE),
  }
}

function updateLayout() {
  if (!win || win.isDestroyed() || dragMode) return
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
    cells: cells.map(c => ({ ...c })),
    sw, sh, w, h,
    occupied: occ,
    empty,
  })
}

// ── Cell management ───────────────────────────────────────────────────

function createView(id) {
  const v = new BrowserView({
    webPreferences: { partition: `persist:cell${id}`, contextIsolation: true, nodeIntegration: false },
  })
  v.webContents.setWindowOpenHandler(({ url }) => { v.webContents.loadURL(url); return { action: 'deny' } })
  v.webContents.loadURL(DEFAULT)
  win.addBrowserView(v)
  views[id] = v
  return v
}

function addCell(row, col) {
  if (!isAreaFree(row, col, 1, 1)) return false
  const id = nextId++
  cells.push({ id, row, col, rowSpan: 1, colSpan: 1 })
  createView(id)
  updateLayout()
  return true
}

function removeCell(id) {
  const i = cells.findIndex(c => c.id === id)
  if (i === -1) return false
  cells.splice(i, 1)
  const v = views[id]
  if (v) { win.removeBrowserView(v); v.webContents.close(); delete views[id] }
  updateLayout()
  return true
}

function moveCell(id, row, col) {
  const c = cells.find(x => x.id === id)
  if (!c || !isAreaFree(row, col, c.rowSpan, c.colSpan, id)) return false
  c.row = row; c.col = col
  return true
}

function resizeCell(id, rs, cs) {
  const c = cells.find(x => x.id === id)
  if (!c || rs < 1 || cs < 1 || !isAreaFree(c.row, c.col, rs, cs, id)) return false
  c.rowSpan = rs; c.colSpan = cs
  return true
}

// ── Drag mode ─────────────────────────────────────────────────────────

function enterDragMode() {
  dragMode = true
  for (const v of Object.values(views)) v.setBounds({ x: 0, y: 0, width: 0, height: 0 })
}

function exitDragMode() {
  dragMode = false
  updateLayout()
}

// ── App ───────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  win = new BrowserWindow({
    show: false,
    backgroundColor: '#111111',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.removeMenu()
  win.loadFile('index.html')
  win.once('ready-to-show', () => { win.maximize(); win.show(); addCell(0, 0) })
  win.on('resize', updateLayout)
})

app.on('window-all-closed', () => app.quit())

// ── IPC ───────────────────────────────────────────────────────────────

ipcMain.on('add-cell',    (_, row, col) => addCell(row, col))
ipcMain.on('remove-cell', (_, id)       => removeCell(id))
ipcMain.on('navigate',    (_, id, url)  => views[id]?.webContents.loadURL(url))

ipcMain.handle('drag-start', (_, _id) => {
  enterDragMode()
  return true
})
ipcMain.handle('drag-end', (_, id, row, col) => {
  const ok = moveCell(id, row, col)
  exitDragMode()
  return ok
})
ipcMain.handle('drag-cancel', () => { exitDragMode(); return true })

ipcMain.handle('resize-start', () => { enterDragMode(); return true })
ipcMain.handle('resize-end', (_, id, rs, cs) => {
  const ok = resizeCell(id, rs, cs)
  exitDragMode()
  return ok
})
ipcMain.handle('resize-cancel', () => { exitDragMode(); return true })
