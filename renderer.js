'use strict'

const ROWS = 3, COLS = 3

// ── State ─────────────────────────────────────────────────────────────
let layout    = null   // last layout sent from main
let drag      = null   // { id, rowSpan, colSpan, targetRow, targetCol, valid }
let rsz       = null   // { id, row, col, type, newRs, newCs, valid }

// ── DOM refs ─────────────────────────────────────────────────────────
const ov     = document.getElementById('ov')
const ghost  = document.getElementById('ghost')
const drop   = document.getElementById('drop')
const rszEl  = document.getElementById('rsz')

// ── IPC ───────────────────────────────────────────────────────────────
mv.on('layout', data => { layout = data; render() })

// ── Geometry helpers ──────────────────────────────────────────────────
function cellPx(row, col, rs, cs) {
  if (!layout) return null
  const { sw, sh, w, h } = layout
  const x = col * sw
  const y = row * sh
  return {
    x, y,
    w: col + cs >= COLS ? w - x : cs * sw,
    h: row + rs >= ROWS ? h - y : rs * sh,
  }
}

function slotAt(px, py) {
  if (!layout) return null
  const col = Math.min(COLS - 1, Math.max(0, Math.floor(px / layout.sw)))
  const row = Math.min(ROWS - 1, Math.max(0, Math.floor(py / layout.sh)))
  return { row, col }
}

function areaFree(row, col, rs, cs, skip = -1) {
  if (!layout) return false
  if (row < 0 || col < 0 || row + rs > ROWS || col + cs > COLS) return false
  const occ = layout.occupied
  for (let r = row; r < row + rs; r++)
    for (let c = col; c < col + cs; c++)
      if (occ[r][c] !== -1 && occ[r][c] !== skip) return false
  return true
}

// ── Render ────────────────────────────────────────────────────────────
function render() {
  ov.innerHTML = ''
  if (!layout) return

  for (const cell of layout.cells) {
    const b = cellPx(cell.row, cell.col, cell.rowSpan, cell.colSpan)
    if (!b) continue

    const wrap = document.createElement('div')
    wrap.className = 'co'
    wrap.style.cssText = `left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px`

    // Header
    const hdr = document.createElement('div')
    hdr.className = 'co-header'

    const icon = document.createElement('span')
    icon.className = 'drag-icon'
    icon.textContent = '⠿'
    icon.title = 'Ziehen zum Verschieben'
    icon.addEventListener('mousedown', e => startDrag(e, cell))

    const title = document.createElement('span')
    title.className = 'cell-title'

    const x = document.createElement('button')
    x.className = 'close-btn'
    x.textContent = '×'
    x.title = 'Kasten schließen'
    x.addEventListener('click', e => { e.stopPropagation(); mv.send('remove-cell', cell.id) })

    hdr.append(icon, title, x)

    // Resize handles (right, bottom, corner)
    const rr = document.createElement('div'); rr.className = 'rr'
    const rb = document.createElement('div'); rb.className = 'rb'
    const rc = document.createElement('div'); rc.className = 'rc'
    rr.addEventListener('mousedown', e => startResize(e, cell, 'col'))
    rb.addEventListener('mousedown', e => startResize(e, cell, 'row'))
    rc.addEventListener('mousedown', e => startResize(e, cell, 'both'))

    wrap.append(hdr, rr, rb, rc)
    ov.appendChild(wrap)
  }

  // Empty slots
  for (const s of layout.empty) {
    const b = cellPx(s.row, s.col, 1, 1)
    if (!b) continue
    const div = document.createElement('div')
    div.className = 'es'
    div.style.cssText = `left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px`
    const btn = document.createElement('button')
    btn.className = 'add-btn'
    btn.textContent = '+'
    btn.title = 'Neuen Kasten hinzufügen'
    btn.addEventListener('click', () => mv.send('add-cell', s.row, s.col))
    div.appendChild(btn)
    ov.appendChild(div)
  }
}

// ── Drag ─────────────────────────────────────────────────────────────
async function startDrag(e, cell) {
  e.preventDefault()
  drag = { id: cell.id, rowSpan: cell.rowSpan, colSpan: cell.colSpan,
           targetRow: cell.row, targetCol: cell.col, valid: true }
  await mv.invoke('drag-start', cell.id)
  showDrop(cell.row, cell.col, cell.rowSpan, cell.colSpan, true)
  posGhost(e)
  const b = cellPx(cell.row, cell.col, cell.rowSpan, cell.colSpan)
  if (b) {
    ghost.style.cssText = `display:block; width:${Math.round(b.w * 0.35)}px; height:${Math.round(b.h * 0.35)}px`
    posGhost(e)
  }
}

function posGhost(e) {
  ghost.style.left = (e.clientX + 14) + 'px'
  ghost.style.top  = (e.clientY - 14) + 'px'
}

function showDrop(row, col, rs, cs, valid) {
  const b = cellPx(row, col, rs, cs)
  if (!b) return
  drop.className = valid ? '' : 'bad'
  drop.style.cssText = `display:block;left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px`
}

// ── Resize ────────────────────────────────────────────────────────────
async function startResize(e, cell, type) {
  e.preventDefault(); e.stopPropagation()
  rsz = { id: cell.id, row: cell.row, col: cell.col,
          origRs: cell.rowSpan, origCs: cell.colSpan,
          newRs: cell.rowSpan, newCs: cell.colSpan, type, valid: true }
  document.body.style.cursor =
    type === 'col' ? 'ew-resize' : type === 'row' ? 'ns-resize' : 'nwse-resize'
  await mv.invoke('resize-start', cell.id)
  showRsz(cell.row, cell.col, cell.rowSpan, cell.colSpan, true)
}

function showRsz(row, col, rs, cs, valid) {
  const b = cellPx(row, col, rs, cs)
  if (!b) return
  rszEl.className = valid ? '' : 'bad'
  rszEl.style.cssText = `display:block;left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px`
}

// ── Global mouse events ───────────────────────────────────────────────
document.addEventListener('mousemove', e => {
  if (drag) {
    posGhost(e)
    const s = slotAt(e.clientX, e.clientY)
    if (s) {
      const tr = Math.min(s.row, ROWS - drag.rowSpan)
      const tc = Math.min(s.col, COLS - drag.colSpan)
      drag.targetRow = tr; drag.targetCol = tc
      drag.valid = areaFree(tr, tc, drag.rowSpan, drag.colSpan, drag.id)
      showDrop(tr, tc, drag.rowSpan, drag.colSpan, drag.valid)
    }
    return
  }

  if (rsz && layout) {
    const { sw, sh } = layout
    let nr = rsz.origRs, nc = rsz.origCs
    if (rsz.type === 'col' || rsz.type === 'both')
      nc = Math.max(1, Math.min(COLS - rsz.col, Math.round((e.clientX - rsz.col * sw) / sw)))
    if (rsz.type === 'row' || rsz.type === 'both')
      nr = Math.max(1, Math.min(ROWS - rsz.row, Math.round((e.clientY - rsz.row * sh) / sh)))
    rsz.newRs = nr; rsz.newCs = nc
    rsz.valid = areaFree(rsz.row, rsz.col, nr, nc, rsz.id)
    showRsz(rsz.row, rsz.col, nr, nc, rsz.valid)
  }
})

document.addEventListener('mouseup', async e => {
  if (drag) {
    ghost.style.display = 'none'
    drop.style.display  = 'none'
    if (drag.valid) await mv.invoke('drag-end', drag.id, drag.targetRow, drag.targetCol)
    else            await mv.invoke('drag-cancel')
    drag = null
    return
  }
  if (rsz) {
    rszEl.style.display    = 'none'
    document.body.style.cursor = ''
    if (rsz.valid) await mv.invoke('resize-end', rsz.id, rsz.newRs, rsz.newCs)
    else           await mv.invoke('resize-cancel')
    rsz = null
  }
})

document.addEventListener('keydown', async e => {
  if (e.key !== 'Escape') return
  if (drag) {
    ghost.style.display = drop.style.display = 'none'
    await mv.invoke('drag-cancel')
    drag = null
  }
  if (rsz) {
    rszEl.style.display = 'none'
    document.body.style.cursor = ''
    await mv.invoke('resize-cancel')
    rsz = null
  }
})
