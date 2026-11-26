# Dirvo

**Mystery folders, explained.** Dirvo is a Windows desktop app that tells you what a folder is, which app made it, how big it is, whether it is safe to delete, and what happens if you delete it.

Pick a folder, or scan a whole drive. Dirvo reads only folder metadata (names, sizes, counts and dates), never file contents.

> **Dirvo never deletes anything.** It only advises. The only actions are **Open in Explorer** and **Copy path**.

## Features

- **Explain a folder:** choose a folder with the Windows picker, or paste a path.
- **Scan a drive:** looks inside Windows, Program Files, ProgramData, user profiles and AppData, scans each folder, and lists the big ones ranked by size.
- **Colour-coded verdicts:** every folder gets one of four verdicts (see below), plus what it is, what created it, and what happens if you delete it.
- **Offline first:** about 80 common folders (browser caches, `node_modules`, npm and Gradle caches, Windows Update, Temp, Package Cache, Docker, ...) are recognised with no network.
- **AI for the rest:** unknown folders can be explained by Claude, using your own Anthropic API key.
- **Dark by default:** the app opens in a dark theme. Switch to light in **Settings → Appearance**, and your choice is remembered.
- **Cancelable, with progress:** scans run in worker threads, so the app stays responsive.

## Verdicts

| Verdict | Meaning |
| --- | --- |
| **Safe to delete** (`SAFE`) | Removing it harms nothing of yours. |
| **Rebuilds automatically** (`REBUILDS_AUTOMATICALLY`) | Safe to delete. The app that owns it recreates it. |
| **Be careful** (`CAUTION`) | May hold settings or data. Check before deleting. |
| **Don't touch** (`DONT_TOUCH`) | Windows, a program, or your own data depends on it. |

## How it works

1. **Scanner** (main process, worker thread). Walks a folder and collects metadata only: name, size, file and folder counts, extension counts, dates, and up to 30 sample file names. It never opens a file. Symlinks and junctions are not followed. Permission errors are counted, not fatal.
2. **System rules.** Windows, Program Files, ProgramData, `Users`, profile roots, Documents, Desktop, Downloads, Pictures, Music, Videos, OneDrive and the AppData roots are always `DONT_TOUCH`. So is anything else inside the Windows and Program Files trees, unless a database entry written for that exact system path says otherwise (for example `C:\Windows\Temp`).
3. **Known-folder database** ([`data/known-folders.json`](data/known-folders.json)). Checked next, offline. Path patterns are case-insensitive and anchored where it matters (`~` is any user profile, `<drive>` is a drive root), and the most specific match wins.
4. **AI fallback** (only for folders nothing above recognised). The main process sends the folder's metadata to the Anthropic API and validates the JSON reply: `{ whatItIs, createdBy, verdict, confidence, consequenceIfDeleted }`. Low confidence moves the verdict toward caution:

   | AI says | With confidence | Dirvo shows |
   | --- | --- | --- |
   | `SAFE` | `MEDIUM` or `LOW` | `CAUTION` |
   | `REBUILDS_AUTOMATICALLY` | `LOW` | `CAUTION` |
   | anything else | any | unchanged |

   Answers are cached locally for 30 days.

For a drive scan, Dirvo splits "container" folders (drive root, Windows, Users, a profile, AppData, ...) into their subfolders and scans each one, three at a time. Folders under 50 MB are counted but not listed. Unknown folders get an **Explain with AI** button instead of being sent automatically.

## Privacy and security

- Only for unknown folders, and only after you add an API key: the folder name and path, size, file and folder counts, file-type counts, dates, and up to 30 sample file names.
- Your Windows username is replaced with `<USER>` in everything sent, including inside file names.
- File contents are never read or sent.
- The AI is called from the main process only. The API key is encrypted with Electron `safeStorage` (Windows DPAPI, tied to your Windows account), is never sent back to the UI, and is never stored in plain text. If Windows encryption is unavailable, Dirvo refuses to save a key.
- Folder names are treated as untrusted data in the prompt, and the AI's reply is strictly validated before it is shown or cached.
- `contextIsolation` is on, `nodeIntegration` is off, the window is sandboxed, and the renderer only talks to the main process through a typed preload bridge (`window.dirvo`).

Local files are stored in `%APPDATA%\dirvo`: `anthropic-key.bin` (encrypted key) and `ai-cache.json` (cached answers, with the username already redacted).

## Getting started

Requirements: Windows 10 or 11, Node.js 22 or newer.

```powershell
npm install
npm run dev
```

If Electron complains that it "failed to install correctly", download its binary once with:

```powershell
npx install-electron --no
```

To use AI explanations, open **Settings** and paste an Anthropic API key. Without a key everything else works, and unknown folders show a prompt to add one.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app with hot reload |
| `npm run build` | Typecheck, then build to `out/` |
| `npm run preview` | Run the built app |
| `npm run typecheck` | Typecheck main, preload and renderer |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run tests in watch mode |

Dirvo is not packaged as an installer yet. Run it from source as above.

## Project layout

```
data/known-folders.json     Offline known-folder database
src/main/                   Electron main process
  scanner/                  Metadata scanner, worker thread, drive scan orchestrator
  knowledge/                Path patterns, database matcher, system-path rules
  ai/                       API client, redaction, validation, cache, key store
src/preload/                Typed bridge exposed as window.dirvo
src/renderer/               React UI (Tailwind CSS)
src/shared/types.ts         Types shared by all three
tests/                      Vitest tests
```

## Tests

`npm test` covers the scanner, the path matcher and database, the system-path rules, the drive scan logic, and the AI layer (redaction, response validation, confidence policy, key storage, cache and service, all with a fake network).

The AI layer has not been run against the live Anthropic API with a real key in the automated tests. Only the error path (a rejected key) was checked against the real endpoint.

## Adding a known folder

Add an entry to [`data/known-folders.json`](data/known-folders.json):

```json
{
  "id": "npm-cache",
  "patterns": ["~/AppData/Local/npm-cache", "~/.npm/_cacache"],
  "includeDescendants": true,
  "whatItIs": "npm's download cache of packages you have installed before.",
  "createdBy": "npm",
  "verdict": "REBUILDS_AUTOMATICALLY",
  "confidence": "HIGH",
  "consequenceIfDeleted": "npm re-downloads packages when needed, so the next installs are slower."
}
```

- `patterns` use `/`, ignore case, and may use `*` inside a segment. `~/` means `C:\Users\<anyone>\`, and `<drive>/` means any drive root. A pattern with neither matches the end of a path (`node_modules`).
- `includeDescendants` also matches anything inside the folder.
- `confidence` is optional and defaults to `HIGH`. Use `MEDIUM` when the same folder name can mean different things.
- The database is validated when the app starts, and `npm test` checks the shipped file. Bad verdicts, duplicate ids and over-broad patterns fail loudly.
- When in doubt, pick the more cautious verdict.

## Known limitations

- Windows only.
- A big unknown folder is reported as one item. For example, a large `AppData\Local\<vendor>` folder is not broken down further.
- Sizes are the sum of file sizes. Folders that share files between copies (such as `WinSxS`) can differ from what Explorer reports.
- Files sitting directly inside container folders (such as `pagefile.sys`) are not listed in a drive scan.
- No installer or auto-update yet.

## License

No license has been chosen yet.
