import sys
import os
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QGridLayout,
    QVBoxLayout, QHBoxLayout, QLineEdit, QPushButton,
    QSizePolicy, QProgressBar,
)
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtWebEngineCore import (
    QWebEngineProfile, QWebEnginePage, QWebEngineSettings,
    QWebEngineFullScreenRequest,
)
from PyQt6.QtCore import QUrl, Qt
from PyQt6.QtGui import QFont

# Chromium-Flag: Autoplay ohne Nutzer-Geste erlauben (nötig für YouTube-Vorschau)
os.environ.setdefault(
    "QTWEBENGINE_CHROMIUM_FLAGS",
    "--autoplay-policy=no-user-gesture-required",
)

CHROME_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

DEFAULT_URL = "https://www.google.com"
GRID_ROWS = 3
GRID_COLS = 3

BTN_STYLE = (
    "QPushButton {"
    "  background:#2e2e2e; color:#cccccc; border:none;"
    "  border-radius:3px; font-size:14px; font-weight:bold;"
    "}"
    "QPushButton:hover  { background:#484848; }"
    "QPushButton:pressed { background:#1a1a1a; }"
    "QPushButton:disabled { color:#555; }"
)

URL_STYLE = (
    "QLineEdit {"
    "  background:#252525; color:#e8e8e8; border:none;"
    "  border-radius:3px; padding:0 5px; font-size:11px;"
    "}"
    "QLineEdit:focus { background:#333333; }"
)


def resolve_url(text: str) -> str:
    text = text.strip()
    if not text:
        return DEFAULT_URL
    if text.startswith(("http://", "https://", "file://", "about:")):
        return text
    if "." in text and " " not in text:
        return "https://" + text
    return "https://www.google.com/search?q=" + text.replace(" ", "+")


class BrowserCell(QWidget):
    def __init__(self, index: int, parent=None):
        super().__init__(parent)
        self.index = index

        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        # ── Toolbar ──────────────────────────────────────────────────
        bar_wrap = QWidget()
        bar_wrap.setFixedHeight(28)
        bar_wrap.setStyleSheet("background:#1a1a1a; border-bottom:1px solid #3c3c3c;")
        bar = QHBoxLayout(bar_wrap)
        bar.setContentsMargins(3, 3, 3, 3)
        bar.setSpacing(3)

        self.back_btn   = QPushButton("‹")
        self.fwd_btn    = QPushButton("›")
        self.reload_btn = QPushButton("↻")
        for btn in (self.back_btn, self.fwd_btn, self.reload_btn):
            btn.setFixedSize(22, 22)
            btn.setStyleSheet(BTN_STYLE)

        self.back_btn.setToolTip("Zurück")
        self.fwd_btn.setToolTip("Vor")
        self.reload_btn.setToolTip("Neu laden")

        self.url_bar = QLineEdit()
        self.url_bar.setFont(QFont("Segoe UI", 9))
        self.url_bar.setStyleSheet(URL_STYLE)
        self.url_bar.setPlaceholderText("URL oder Suche …")

        bar.addWidget(self.back_btn)
        bar.addWidget(self.fwd_btn)
        bar.addWidget(self.reload_btn)
        bar.addWidget(self.url_bar)
        root.addWidget(bar_wrap)

        # ── Thin loading bar ──────────────────────────────────────────
        self.progress = QProgressBar()
        self.progress.setFixedHeight(2)
        self.progress.setTextVisible(False)
        self.progress.setRange(0, 100)
        self.progress.setStyleSheet(
            "QProgressBar { background:transparent; border:none; }"
            "QProgressBar::chunk { background:#29b6f6; }"
        )
        self.progress.hide()
        root.addWidget(self.progress)

        # ── Web view (independent Chromium session per cell) ──────────
        self.profile = QWebEngineProfile(f"cell_{index}", self)
        # Chrome-User-Agent: YouTube und andere Sites blockieren embedded Browser
        self.profile.setHttpUserAgent(CHROME_UA)

        page = QWebEnginePage(self.profile, self)
        # Fullscreen-Anfragen (YouTube-Vollbild) direkt annehmen
        page.fullScreenRequested.connect(self._on_fullscreen_requested)

        self.view = QWebEngineView()
        self.view.setPage(page)
        self.view.setSizePolicy(
            QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding
        )

        # Web-Settings für Video-Wiedergabe
        s = self.view.settings()
        s.setAttribute(QWebEngineSettings.WebAttribute.PluginsEnabled, True)
        s.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
        s.setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)
        s.setAttribute(QWebEngineSettings.WebAttribute.FullScreenSupportEnabled, True)
        s.setAttribute(QWebEngineSettings.WebAttribute.PlaybackRequiresUserGesture, False)

        root.addWidget(self.view)

        # ── Signals ───────────────────────────────────────────────────
        self.back_btn.clicked.connect(self.view.back)
        self.fwd_btn.clicked.connect(self.view.forward)
        self.reload_btn.clicked.connect(self._reload)
        self.url_bar.returnPressed.connect(self._navigate)

        self.view.urlChanged.connect(self._on_url_changed)
        self.view.loadStarted.connect(self._on_load_started)
        self.view.loadProgress.connect(self.progress.setValue)
        self.view.loadFinished.connect(self._on_load_finished)

        self.view.load(QUrl(DEFAULT_URL))

    # ── Slots ─────────────────────────────────────────────────────────

    def _navigate(self):
        self.view.load(QUrl(resolve_url(self.url_bar.text())))

    def _reload(self):
        modifiers = QApplication.keyboardModifiers()
        if modifiers & Qt.KeyboardModifier.ShiftModifier:
            self.view.page().triggerAction(QWebEnginePage.WebAction.ReloadAndBypassCache)
        else:
            self.view.reload()

    def _on_url_changed(self, url: QUrl):
        self.url_bar.setText(url.toString())
        self.url_bar.setCursorPosition(0)
        hist = self.view.history()
        self.back_btn.setEnabled(hist.canGoBack())
        self.fwd_btn.setEnabled(hist.canGoForward())

    def _on_load_started(self):
        self.progress.setValue(0)
        self.progress.show()
        self.reload_btn.setText("✕")
        self.reload_btn.clicked.disconnect()
        self.reload_btn.clicked.connect(self.view.stop)

    def _on_load_finished(self, _ok: bool):
        self.progress.hide()
        self.reload_btn.setText("↻")
        self.reload_btn.clicked.disconnect()
        self.reload_btn.clicked.connect(self._reload)

    def _on_fullscreen_requested(self, request: QWebEngineFullScreenRequest):
        request.accept()
        if request.toggleOn():
            self.view.showFullScreen()
        else:
            self.view.showNormal()


class MultiViewer(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("MultiViewer")
        self.setStyleSheet("QMainWindow, QWidget#central { background:#111111; }")

        central = QWidget()
        central.setObjectName("central")
        self.setCentralWidget(central)

        grid = QGridLayout(central)
        grid.setSpacing(1)          # 1 px dark line between cells
        grid.setContentsMargins(0, 0, 0, 0)

        self.cells: list[BrowserCell] = []
        for i in range(GRID_ROWS * GRID_COLS):
            row, col = divmod(i, GRID_COLS)
            cell = BrowserCell(i, central)
            grid.addWidget(cell, row, col)
            grid.setRowStretch(row, 1)
            grid.setColumnStretch(col, 1)
            self.cells.append(cell)

        self.showMaximized()


def main():
    QApplication.setHighDpiScaleFactorRoundingPolicy(
        Qt.HighDpiScaleFactorRoundingPolicy.PassThrough
    )
    app = QApplication(sys.argv)
    app.setApplicationName("MultiViewer")
    app.setOrganizationName("MultiViewer")

    window = MultiViewer()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
