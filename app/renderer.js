'use strict'

// ── State ─────────────────────────────────────────────────────────────
let ROWS = 3, COLS = 3
let layout      = null
let drag        = null
let rsz         = null
let editMode    = false
let audioId     = -1
let isFullScreen = false
let modalOpen   = false
let favorites   = ['', '', '']
const cellUrls  = {}   // id → current url

// ── DOM refs ──────────────────────────────────────────────────────────
const ov    = document.getElementById('ov')
const ghost = document.getElementById('ghost')
const drop  = document.getElementById('drop')
const rszEl = document.getElementById('rsz')

// ── IPC ───────────────────────────────────────────────────────────────
mv.on('layout', data => {
  layout   = data
  ROWS     = data.ROWS
  COLS     = data.COLS
  editMode = data.editMode
  audioId  = data.audioId
  for (const c of data.cells) if (c.url) cellUrls[c.id] = c.url
  render()
})

mv.on('cell-url', (id, url) => {
  cellUrls[id] = url
  const inp = document.querySelector(`.url-input[data-id="${id}"]`)
  if (inp && document.activeElement !== inp) inp.value = url
})

mv.on('fullscreen-change', fs => { isFullScreen = fs })

mv.invoke('get-settings').then(s => {
  favorites = s.favorites || ['', '', '']
  ROWS = s.ROWS; COLS = s.COLS
  document.getElementById('set-cols').value = s.COLS
  document.getElementById('set-rows').value = s.ROWS
  document.getElementById('fav1').value = favorites[0] || ''
  document.getElementById('fav2').value = favorites[1] || ''
  document.getElementById('fav3').value = favorites[2] || ''
})

// ── Geometry helpers ──────────────────────────────────────────────────
function cellPx(row, col, rs, cs) {
  if (!layout) return null
  const { sw, sh, w, h } = layout
  const x = col * sw, y = row * sh
  return {
    x, y,
    w: col + cs >= COLS ? w - x : cs * sw,
    h: row + rs >= ROWS ? h - y : rs * sh,
  }
}

function slotAt(px, py) {
  if (!layout) return null
  return {
    col: Math.min(COLS - 1, Math.max(0, Math.floor(px / layout.sw))),
    row: Math.min(ROWS - 1, Math.max(0, Math.floor(py / layout.sh))),
  }
}

function areaFree(row, col, rs, cs, skip = -1) {
  if (!layout || row < 0 || col < 0 || row + rs > ROWS || col + cs > COLS) return false
  for (let r = row; r < row + rs; r++)
    for (let c = col; c < col + cs; c++)
      if (layout.occupied[r][c] !== -1 && layout.occupied[r][c] !== skip) return false
  return true
}

// ── URL helper ────────────────────────────────────────────────────────
function resolveUrl(text) {
  text = (text || '').trim()
  if (!text) return 'https://www.google.com'
  if (/^(https?|file|about):/.test(text)) return text
  if (/\./.test(text) && !/ /.test(text)) return 'https://' + text
  return 'https://www.google.com/search?q=' + encodeURIComponent(text)
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

    if (editMode) {
      // ── Header ──────────────────────────────────────────────────────
      const hdr = document.createElement('div')
      hdr.className = 'co-header'

      const icon = document.createElement('span')
      icon.className = 'drag-icon'
      icon.textContent = '⠿'
      icon.title = 'Move'
      icon.addEventListener('mousedown', e => startDrag(e, cell))

      const urlInp = document.createElement('input')
      urlInp.className = 'url-input'
      urlInp.dataset.id = cell.id
      urlInp.type = 'text'
      urlInp.value = cellUrls[cell.id] || cell.url || ''
      urlInp.placeholder = 'URL or search...'
      urlInp.addEventListener('keydown', e => {
        e.stopPropagation()
        if (e.key === 'Enter') { mv.send('navigate', cell.id, resolveUrl(urlInp.value)); urlInp.blur() }
        if (e.key === 'Escape') { urlInp.value = cellUrls[cell.id] || ''; urlInp.blur() }
      })
      urlInp.addEventListener('click', e => e.stopPropagation())

      const isAudio = audioId === cell.id
      const audioBtn = document.createElement('button')
      audioBtn.className = 'audio-btn' + (isAudio ? ' active' : '')
      audioBtn.textContent = isAudio ? '🔊' : '🔇'
      audioBtn.title = isAudio ? 'Audio active – click to deactivate' : 'Solo audio source'
      audioBtn.addEventListener('click', e => {
        e.stopPropagation()
        mv.send('set-audio', isAudio ? -1 : cell.id)
      })

      const closeBtn = document.createElement('button')
      closeBtn.className = 'close-btn'
      closeBtn.textContent = '×'
      closeBtn.title = 'Close panel'
      closeBtn.addEventListener('click', e => { e.stopPropagation(); mv.send('remove-cell', cell.id) })

      hdr.append(icon, urlInp, audioBtn, closeBtn)
      wrap.appendChild(hdr)

      // ── Resize handles (all 8 directions) ───────────────────────────
      const handleDefs = [
        ['rl', 'left'], ['rr', 'right'],
        ['rt', 'top'],  ['rb', 'bottom'],
        ['rtl', 'top-left'], ['rtr', 'top-right'],
        ['rbl', 'bottom-left'], ['rc', 'bottom-right'],
      ]
      for (const [cls, type] of handleDefs) {
        const el = document.createElement('div')
        el.className = cls
        el.addEventListener('mousedown', e => startResize(e, cell, type))
        wrap.appendChild(el)
      }
    }

    ov.appendChild(wrap)
  }

  // ── Empty slots ──────────────────────────────────────────────────────
  for (const s of layout.empty) {
    const b = cellPx(s.row, s.col, 1, 1)
    if (!b) continue
    const div = document.createElement('div')
    div.className = 'es'
    div.style.cssText = `left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px`
    const btn = document.createElement('button')
    btn.className = 'add-btn'
    btn.textContent = '+'
    btn.title = 'Open new panel'
    btn.addEventListener('click', () => openUrlPrompt(s.row, s.col))
    div.appendChild(btn)
    ov.appendChild(div)
  }
}

// ── URL Prompt ────────────────────────────────────────────────────────
function openUrlPrompt(row, col) {
  modalOpen = true
  mv.send('modal-open')
  const modal  = document.getElementById('url-modal')
  const input  = document.getElementById('url-input')
  const favDiv = document.getElementById('fav-buttons')

  favDiv.innerHTML = ''
  for (const fav of favorites.filter(f => f.trim())) {
    const btn = document.createElement('button')
    btn.className = 'fav-btn'
    btn.textContent = fav
    btn.title = fav
    btn.addEventListener('click', () => submit(fav))
    favDiv.appendChild(btn)
  }

  input.value = ''
  modal.style.display = 'flex'
  requestAnimationFrame(() => input.focus())

  function submit(raw) {
    cleanup()
    mv.send('add-cell', row, col, resolveUrl(raw))
  }

  function cleanup() {
    modal.style.display = 'none'
    modalOpen = false
    mv.send('modal-close')
    input.removeEventListener('keydown', onKey)
    document.getElementById('url-confirm').onclick = null
    document.getElementById('url-cancel').onclick  = null
  }

  function onKey(e) {
    if (e.key === 'Enter')  { e.preventDefault(); submit(input.value) }
    if (e.key === 'Escape') { e.preventDefault(); cleanup() }
  }

  input.addEventListener('keydown', onKey)
  document.getElementById('url-confirm').onclick = () => submit(input.value)
  document.getElementById('url-cancel').onclick  = cleanup
}

// ── Settings Modal ────────────────────────────────────────────────────
function openSettings() {
  modalOpen = true
  mv.send('modal-open')
  mv.invoke('get-settings').then(s => {
    document.getElementById('set-cols').value = s.COLS
    document.getElementById('set-rows').value = s.ROWS
    document.getElementById('fav1').value = (s.favorites || [])[0] || ''
    document.getElementById('fav2').value = (s.favorites || [])[1] || ''
    document.getElementById('fav3').value = (s.favorites || [])[2] || ''
    document.getElementById('settings-modal').style.display = 'flex'
  })
}

function closeSettings() {
  document.getElementById('settings-modal').style.display = 'none'
  modalOpen = false
  mv.send('modal-close')
}

document.getElementById('settings-save').addEventListener('click', () => {
  const rows = Math.max(1, parseInt(document.getElementById('set-rows').value) || ROWS)
  const cols = Math.max(1, parseInt(document.getElementById('set-cols').value) || COLS)
  const newFavs = [
    document.getElementById('fav1').value.trim(),
    document.getElementById('fav2').value.trim(),
    document.getElementById('fav3').value.trim(),
  ]
  favorites = newFavs
  mv.send('set-grid', rows, cols)
  mv.send('save-favorites', newFavs)
  closeSettings()
})

document.getElementById('settings-close').addEventListener('click', closeSettings)

document.getElementById('settings-reset').addEventListener('click', async () => {
  if (!window.confirm('Reset to defaults?\n\nAll open panels will be closed and the grid will be reset to 3×3. This cannot be undone.')) return
  await mv.invoke('reset-defaults')
  document.getElementById('set-cols').value = 3
  document.getElementById('set-rows').value = 3
  closeSettings()
})

document.getElementById('github-link').addEventListener('click', e => {
  e.preventDefault()
  mv.send('open-external', 'https://github.com/NiklasPreis')
})

// ── Drag ─────────────────────────────────────────────────────────────
async function startDrag(e, cell) {
  e.preventDefault()
  drag = { id: cell.id, rowSpan: cell.rowSpan, colSpan: cell.colSpan,
           targetRow: cell.row, targetCol: cell.col, valid: true }
  await mv.invoke('drag-start', cell.id)
  showDrop(cell.row, cell.col, cell.rowSpan, cell.colSpan, true)
  const b = cellPx(cell.row, cell.col, cell.rowSpan, cell.colSpan)
  if (b) {
    ghost.style.cssText = `display:block;width:${Math.round(b.w * .35)}px;height:${Math.round(b.h * .35)}px`
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
  rsz = {
    id: cell.id,
    origRow: cell.row, origCol: cell.col,
    origRs: cell.rowSpan, origCs: cell.colSpan,
    newRow: cell.row, newCol: cell.col,
    newRs: cell.rowSpan, newCs: cell.colSpan,
    type, valid: true,
  }
  const cursors = {
    'left': 'ew-resize', 'right': 'ew-resize',
    'top': 'ns-resize',  'bottom': 'ns-resize',
    'top-left': 'nwse-resize',  'bottom-right': 'nwse-resize',
    'top-right': 'nesw-resize', 'bottom-left': 'nesw-resize',
  }
  document.body.style.cursor = cursors[type] || 'default'
  await mv.invoke('resize-start')
  showRsz(cell.row, cell.col, cell.rowSpan, cell.colSpan, true)
}

function showRsz(row, col, rs, cs, valid) {
  const b = cellPx(row, col, rs, cs)
  if (!b) return
  rszEl.className = valid ? '' : 'bad'
  rszEl.style.cssText = `display:block;left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px`
}

// ── Mouse events ──────────────────────────────────────────────────────
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
    const t = rsz.type
    let nr = rsz.origRs, nc = rsz.origCs
    let nr2 = rsz.origRow, nc2 = rsz.origCol

    if (t === 'right' || t === 'top-right' || t === 'bottom-right')
      nc = Math.max(1, Math.min(COLS - rsz.origCol, Math.round((e.clientX - rsz.origCol * sw) / sw)))

    if (t === 'bottom' || t === 'bottom-right' || t === 'bottom-left')
      nr = Math.max(1, Math.min(ROWS - rsz.origRow, Math.round((e.clientY - rsz.origRow * sh) / sh)))

    if (t === 'left' || t === 'top-left' || t === 'bottom-left') {
      nc2 = Math.max(0, Math.min(rsz.origCol + rsz.origCs - 1, Math.floor(e.clientX / sw)))
      nc  = rsz.origCol + rsz.origCs - nc2
    }

    if (t === 'top' || t === 'top-left' || t === 'top-right') {
      nr2 = Math.max(0, Math.min(rsz.origRow + rsz.origRs - 1, Math.floor(e.clientY / sh)))
      nr  = rsz.origRow + rsz.origRs - nr2
    }

    rsz.newRs = nr; rsz.newCs = nc
    rsz.newRow = nr2; rsz.newCol = nc2
    rsz.valid = areaFree(nr2, nc2, nr, nc, rsz.id)
    showRsz(nr2, nc2, nr, nc, rsz.valid)
  }
})

document.addEventListener('mouseup', async () => {
  if (drag) {
    ghost.style.display = drop.style.display = 'none'
    if (drag.valid) await mv.invoke('drag-end', drag.id, drag.targetRow, drag.targetCol)
    else            await mv.invoke('drag-cancel')
    drag = null
    return
  }
  if (rsz) {
    rszEl.style.display = 'none'
    document.body.style.cursor = ''
    if (rsz.valid) await mv.invoke('resize-end', rsz.id, rsz.newRow, rsz.newCol, rsz.newRs, rsz.newCs)
    else           await mv.invoke('resize-cancel')
    rsz = null
  }
})

// ── Keyboard shortcuts ────────────────────────────────────────────────
document.addEventListener('keydown', async e => {
  const inInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA'

  if (e.key === 'Escape') {
    if (inInput) { e.target.blur(); return }
    if (document.getElementById('settings-modal').style.display !== 'none') { closeSettings(); return }
    if (document.getElementById('url-modal').style.display !== 'none') {
      document.getElementById('url-modal').style.display = 'none'
      modalOpen = false; mv.send('modal-close'); return
    }
    if (drag) {
      ghost.style.display = drop.style.display = 'none'
      await mv.invoke('drag-cancel'); drag = null; return
    }
    if (rsz) {
      rszEl.style.display = 'none'; document.body.style.cursor = ''
      await mv.invoke('resize-cancel'); rsz = null; return
    }
    if (isFullScreen) { mv.send('leave-fullscreen'); return }
    return
  }

  if (inInput || modalOpen) return

  if (e.key === 'f' || e.key === 'F') await mv.invoke('toggle-fullscreen')
  if (e.key === 's' || e.key === 'S') openSettings()
  if (e.key === 'd' || e.key === 'D') mv.invoke('toggle-edit')
})
