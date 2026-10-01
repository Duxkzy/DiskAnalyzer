# Disk Analyzer Desktop

A private desktop application for Windows, macOS, and Linux. The interface, source code, and documentation are in English. It uses Electron to open its own application window; no browser tab, local web server, or internet connection is required at runtime.

## Features

- Native folder picker and drag-and-drop of one folder from your file manager.
- Background scanning with progress, cancellation, empty-folder detection, and explicit partial-result notices.
- Largest-first lists, folder navigation, percentage bars, and a donut chart with a clickable folder legend.
- Search by relative path, files/folders filter, extension filter, and minimum-size filter. Select **Include all subfolders** to search the current folder recursively.
- CSV export through a native save dialog. The export includes **all matching rows**, including those on other list pages, and records exact bytes, readable sizes, relative paths, folder percentages, and scan metadata.
- Dark interface that adapts to narrow desktop windows. This desktop edition does not run on phones.

## Open a packaged application

1. Linux: mark the `.AppImage` as executable in its file properties, then double-click it. If the system lacks FUSE, run it with `--appimage-extract-and-run`, or use the unpacked `dist/linux-unpacked/disk-analyzer` executable.
2. Windows: extract the Windows ZIP into a folder and open `Disk Analyzer.exe`. Keep all extracted files together.
3. macOS: extract the ZIP for your CPU (`arm64` for Apple Silicon, `x64` for Intel). For these Linux-built packages, run the adjacent `Prepare Disk Analyzer.command` once to apply and verify a local development signature, then open `Disk Analyzer.app` normally. The command changes only that app bundle, not system security settings.

The development packages are not publisher-signed or notarized. Windows or macOS may require approval to open them. The Mac preparation command uses an ad-hoc signature and does not provide Apple notarization. Publisher-signed distribution requires your own signing credentials, and macOS signing/notarization requires macOS. A package built here for another operating system still needs testing on that operating system. Windows packages require Windows 10 or newer; Mac packages require macOS 13 or newer.

## Run from source

Install Node.js 24 or newer, open a terminal in this project folder, and run:

```sh
npm ci
npm start
```

Node.js and npm are needed only for development/building, not to run packaged applications. The first dependency installation needs internet access.

## Build

```sh
npm test
npm run build:linux
npm run build:windows
npm run build:mac
```

The scripts create a Linux x64 AppImage, Windows x64 portable ZIP, and macOS Intel/Apple Silicon ZIPs in `dist/`. Build on the corresponding OS for the most reliable result. Mac builds made on macOS use ad-hoc signing without requiring a developer certificate. The included GitHub Actions workflow builds each package on its own OS after a version tag or manual dispatch; it does not publish releases or run unless uploaded to a GitHub repository and triggered.

## How results are measured

Sizes are **logical file sizes**, with 1 KB = 1,024 bytes. The application does not measure free disk space, allocated blocks, compression, shared blocks, or deduplicated storage. Each regular file path is counted, including hard links. Scanning is a snapshot; files that change during a scan can affect the result.

Symbolic links, Windows junctions reported as symbolic links, sockets, devices, and other special files are skipped to avoid following cycles or unrelated locations. Unreadable items produce a partial-result warning and propagate a partial marker to ancestor folders. Scanning reads metadata only; it does not read file contents, delete files, or upload data. CSV export writes only the file you choose.

The chart always uses the immediate children of the current folder, independent of list filters, so it never counts a file and its parent twice. Percentages in the filtered list and CSV use the current folder's full size. When recursively listing both files and folders, folder totals overlap their contents and should not be added together.

Search and filters apply within the selected scope. Entering another folder resets filters. Lists show 100 rows per page to keep large results usable. Canceling or failing a new scan preserves the previous completed scan.

CSV files use UTF-8 with a BOM and CRLF row endings. Cells are quoted, quotes escaped, and formula-like text prefixed with an apostrophe for safe spreadsheet import.

## Project structure

```text
index.html              Desktop interface
styles.css              Responsive dark theme
app.js                  Navigation, chart, filters, and user actions
core.js                 Shared query, formatting, chart, and CSV logic
desktop/main.js         Window, native dialogs, worker lifecycle, and export
desktop/preload.js      Narrow isolated bridge to desktop capabilities
desktop/scanner.js      Iterative filesystem metadata scan
desktop/scan-worker.js  Background scan entry point
assets/                 Application icons
tests/                  Scanner and data-logic tests
.github/workflows/      Per-platform build workflow
```
