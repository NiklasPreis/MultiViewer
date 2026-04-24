# MultiViewer

A dark-themed desktop app that splits your screen into a customizable **grid of independent browser panels** — each with its own Chromium session, URL bar, and isolated cookies.

---

## Features

- **Flexible grid** — configure between 1–6 columns and 1–4 rows via the settings menu
- **Independent sessions** — each panel has its own cookies, localStorage, and login state
- **Drag & drop** panels to rearrange them freely
- **Resize from all sides** — drag any edge or corner to span multiple grid cells
- **Edit mode** — toggle handles, URL bars, and controls on/off for a clean borderless look
- **Audio selection** — choose one panel as the sole audio source; all others are muted
- **URL prompt** — enter a URL or search term when opening each panel; pick from saved favourites
- **Favourite URLs** — save up to 3 URLs for quick access when opening a new panel
- **Fullscreen** — hide the taskbar and window frame with one key
- **Autoplay support** — videos play without requiring a click (e.g. YouTube previews)
- **Chrome User-Agent** — avoids being blocked by sites that reject embedded browsers
- Fully dark UI, settings are persisted between sessions

---

## Quick Start

**Requirements:** [Node.js](https://nodejs.org/) (LTS)

```
app\run.bat
```

`run.bat` installs Node.js automatically via winget if not found, then installs packages and launches the app.

### Manual start

```bash
cd app
npm install
npm start
```

---

## Build a standalone EXE

```
app\build.bat
```

Output: `builds\MultiViewer-win32-x64\MultiViewer.exe`

Zip the whole `MultiViewer-win32-x64` folder for distribution — the EXE needs the surrounding files.

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `F` | Fullscreen on / off |
| `S` | Open settings |
| `D` | Edit mode on / off |
| `ESC` | Close modal · Cancel drag/resize · Exit fullscreen |

---

## How to use

| Action | How |
|---|---|
| Add a panel | Click **+** in any empty slot, enter a URL or search term |
| Open a favourite | Click **+**, then click one of the favourite buttons |
| Navigate | Enable edit mode (D), click the URL bar in the panel header, press Enter |
| Move a panel | Enable edit mode (D), drag the **⠿** handle to another slot |
| Resize a panel | Enable edit mode (D), drag any edge or corner handle |
| Select audio source | Enable edit mode (D), click **🔇** in a panel header to make it the sole audio source |
| Close a panel | Enable edit mode (D), click **×** |
| Change grid size | Press **S**, adjust columns and rows, click Save |
| Save favourites | Press **S**, enter up to 3 URLs under Favourites, click Save |

---

## Tech Stack

- [Electron](https://www.electronjs.org/) — desktop shell
- [electron-packager](https://github.com/electron/packager) — builds the EXE
- `BrowserView` per panel for true process isolation
- Settings persisted to JSON in the OS user-data folder

---

## Project Structure

```
MultiViewer/
├── README.md
├── app/
│   ├── main.js       # Electron main process — window, BrowserViews, IPC, settings
│   ├── renderer.js   # Overlay UI — edit mode, drag, resize, modals, shortcuts
│   ├── preload.js    # IPC bridge exposed to renderer
│   ├── index.html    # Overlay shell, styles, modal HTML
│   ├── package.json
│   ├── run.bat       # One-click launch
│   └── build.bat     # One-click EXE build
```
