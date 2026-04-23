# MultiViewer

A dark-themed desktop app that splits your screen into a **3 × 3 grid of independent browser panels** — each with its own Chromium session, navigation bar, and isolated cookies.

---

## Features

- **9 browser panels** arranged in a 3 × 3 grid
- **Drag & drop** panels to rearrange them freely
- **Resize** panels to span multiple grid cells (right / bottom / corner handles)
- **Independent sessions** — each panel has its own cookies, localStorage, and login state
- **Smart URL bar** — enter a URL or just type a search term
- **Loading progress bar** per panel
- **Add / close** panels on the fly with + and ×
- **Autoplay support** — videos start without requiring a click (e.g. YouTube previews)
- **Chrome User-Agent** — avoids being blocked by sites that reject embedded browsers
- Press **Escape** to cancel any drag or resize in progress
- Fully dark UI

---

## Versions

| Version | Stack | File |
|---|---|---|
| **Electron** (recommended) | Node.js + Electron | `main.js` |
| **Python** | Python + PyQt6 + QtWebEngine | `main.py` |

---

## Quick Start — Electron (recommended)

**Requirements:** [Node.js](https://nodejs.org/) (LTS)

```
run.bat
```

`run.bat` installs Node.js automatically via winget if it is not found, then installs packages and launches the app.

### Manual start

```bash
npm install
npm start
```

---

## Quick Start — Python

**Requirements:** Python 3.11+

```bash
pip install -r requirements.txt
python main.py
```

---

## Build a standalone EXE (Electron)

```
build.bat
```

Output: `dist\MultiViewer-win32-x64\MultiViewer.exe`

Distribute the whole `MultiViewer-win32-x64` folder (or zip it) — the EXE needs the surrounding files.

---

## How to use

| Action | How |
|---|---|
| Open a URL | Click the address bar of any panel, type a URL or search term, press Enter |
| Add a panel | Click the **+** button in any empty slot |
| Close a panel | Click **×** in the panel header |
| Move a panel | Drag the **⠿** handle in the panel header to another slot |
| Resize a panel | Drag the right, bottom, or corner resize strip |
| Cancel drag/resize | Press **Escape** |
| Hard reload | Shift + click the reload button ↻ |

---

## Tech Stack

**Electron version**
- [Electron](https://www.electronjs.org/) — desktop shell
- [electron-packager](https://github.com/electron/packager) — builds the EXE
- `BrowserView` per panel for true process isolation

**Python version**
- [PyQt6](https://pypi.org/project/PyQt6/) — UI framework
- [PyQt6-WebEngine](https://pypi.org/project/PyQt6-WebEngine/) — Chromium-based web views
- Independent `QWebEngineProfile` per panel

---

## Project Structure

```
MultiViewer/
├── main.js          # Electron main process — window, BrowserViews, IPC
├── renderer.js      # Overlay UI — drag, resize, empty-slot buttons
├── preload.js       # IPC bridge exposed to renderer
├── index.html       # Overlay shell + styles
├── main.py          # Self-contained Python version
├── requirements.txt # Python dependencies
├── run.bat          # One-click launch (Electron)
└── build.bat        # One-click EXE build (Electron)
```
