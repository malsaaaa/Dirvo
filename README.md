<img src="resources/logo.svg" alt="Dirvo logo" width="96" height="96">

# Dirvo

**Mystery folders, explained.** Dirvo is a Windows desktop app that tells you what a folder or file is, which app made it, how big it is, whether it is safe to delete, and what happens if you delete it.

Pick a folder or a file, or scan a whole drive. Dirvo reads only metadata (names, sizes, counts and dates), never file contents.

> **Dirvo never deletes anything.** It only advises. The only actions are **Open in Explorer** and **Copy path**.

## Features

- **Explain a folder or a file:** choose one with the Windows pickers, or paste a path. A file gets the same four rulings: what it is, who made it, whether you can delete it, and what happens if you do.
- **Files in scans:** a drive scan and **Look inside** also list big files that sit directly in the folders they open (`pagefile.sys`, `hiberfil.sys`, a forgotten installer or disc image), and every scanned folder shows its five **Biggest files**, each with a ruling and an **Explain** button.
- **Scan a drive:** looks inside Windows, Program Files, ProgramData, user profiles and AppData, scans each folder, and lists the big ones ranked by size.
- **Reclaimable space:** after a scan, one figure shows how much space sits in folders rated Safe or Rebuilds, and a bar splits everything scanned by verdict. Space is never counted twice when one result is inside another.
- **Look inside:** on any folder with subfolders, one button scans each subfolder and rules on it separately. The pieces appear indented under their parent, so a big unknown folder can be broken down until the parts are recognised.
- **Remembers your scans:** results are saved and come back when you reopen the app. Rescan a folder and Dirvo shows what changed: "+3.1 GB since Nov 12" next to the folder, and a "since the last scan" line above the results.
- **Export a report:** save the results as a Markdown report (summary, a table, and a detail section for each folder) or a CSV spreadsheet. You can export everything or just what your search and filter show. Your Windows username is replaced with `<USER>` by default, so the report is safe to paste into a forum or ticket. CSV cells that start with `=`, `+`, `-` or `@` are neutralised, so a hostile folder name cannot run as a spreadsheet formula.
- **Idle hints:** Dirvo uses the dates of the newest files to show how long a folder has sat untouched ("idle 2 y" in the list, "Nothing in it has changed for 2 years" on the folder). The summary says how much of the reclaimable space is in folders untouched for over a year, an **Idle 1y+** toggle shows only those folders, and reports include the idle time. A folder with no known date is never called idle.
- **Explain unknown folders:** after a scan, one button asks your AI provider about every unrecognised folder, largest first. A dialog first says how many folders, which provider, where the data goes and exactly what is sent, and nothing is sent until you confirm. It does at most 50 per run, two at a time, can be cancelled, and stops by itself if there is no key or the AI fails three times in a row.
- **Keyboard shortcuts:** move through the results with `j` and `k` (or the arrow keys), then act on the selected folder: `o` opens it in Explorer, `c` copies its path, `r` rescans it, `i` looks inside it, `a` asks the AI. `/` or `Ctrl+F` searches, `Ctrl+E` exports, `Ctrl+1` to `Ctrl+4` switch screens, and `?` shows the full list. Shortcuts never fire while you are typing in a box or while a dialog is open, and normal combos like `Ctrl+C` are left alone.
- **Search, filter and sort:** find a folder by name, path or who made it, show only one ruling (for example just the Reclaimable ones), and sort by size, name, or how long it has been untouched. Without a search or filter the results stay a tree; while you search or filter they become a flat list.
- **To clean:** for known folders, Dirvo says how to clean them the safe way: plain steps, a command you can copy (never run for you), or a button that opens the right Windows settings page. For example, `npm cache clean --force` for npm's cache, or Storage settings for Windows Update files.
- **Colour-coded verdicts:** every folder gets one of four verdicts (see below), plus what it is, what created it, and what happens if you delete it.
- **Offline first:** about 40 well-known files and file types (`pagefile.sys`, `ntuser.dat`, thumbnail caches, crash dumps, documents, photos, videos, archives, disk images, ...) and about 80 common folders (browser caches, `node_modules`, npm and Gradle caches, Windows Update, Temp, Package Cache, Docker, ...) are recognised with no network.
- **AI for the rest:** unknown folders can be explained by an AI model of your choice, using your own key or a model running on your PC (see [AI providers](#ai-providers)).
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
4. **AI fallback** (only for folders nothing above recognised). The main process sends the folder's metadata to your chosen AI provider and validates the JSON reply: `{ whatItIs, createdBy, verdict, confidence, consequenceIfDeleted }`. Low confidence moves the verdict toward caution:

   | AI says | With confidence | Dirvo shows |
   | --- | --- | --- |
   | `SAFE` | `MEDIUM` or `LOW` | `CAUTION` |
   | `REBUILDS_AUTOMATICALLY` | `LOW` | `CAUTION` |
   | anything else | any | unchanged |

   A **SAFE** or **REBUILDS_AUTOMATICALLY** verdict is also moved to `CAUTION` when the AI's own explanation says deleting will break, lose or uninstall something. Small models sometimes contradict themselves, and the warning in the text wins over the label. These rules are the same for every provider. Answers are cached locally for 30 days, per provider and model.

For a drive scan, Dirvo splits "container" folders (drive root, Windows, Users, a profile, AppData, ...) into their subfolders and scans each one, three at a time. Folders under 50 MB are counted but not listed. Unknown folders get an **Explain with AI** button instead of being sent automatically. Files that sit directly inside the folders it opens are listed too when they are over the size limit, and each scanned folder keeps its five biggest files.

**Files** follow the same path with their own rules ([`data/known-files.json`](data/known-files.json)):

1. A file inside the Windows or Program Files trees is `DONT_TOUCH`, unless an entry written for that exact system path says otherwise (for example `C:\Windows\MEMORY.DMP`).
2. A file the database knows by name: `pagefile.sys`, `hiberfil.sys`, `ntuser.dat`, `Thumbs.db`, `Windows.edb`, SSH keys, ...
3. The folder it sits in. Anything inside `Temp` or `node_modules` follows that folder.
4. Its type, from the extension. A type that can hold your own work (documents, photos, videos, music, archives, databases, virtual disks, source code) is never rated Safe. Keys, certificates and password vaults are `DONT_TOUCH`.
5. Anything left goes to the AI as a file, with its own prompt, and the same confidence rules as folders.

## AI providers

Pick one in **Settings**. Each provider keeps its own encrypted key, so you can switch freely.

| Provider | Needs a key | Notes |
| --- | --- | --- |
| Anthropic (Claude) | Yes | Default |
| OpenAI | Yes | |
| Google Gemini | Yes | |
| Mistral | Yes | |
| xAI (Grok) | Yes | |
| DeepSeek | Yes | |
| Groq | Yes | |
| OpenRouter | Yes | One key, many models |
| Ollama | No | Runs on this PC. Nothing leaves your computer |
| Custom (OpenAI-compatible) | Optional | LM Studio, vLLM, or any server that speaks the OpenAI chat format |

- The **model** is editable for every provider. Model names change often, so if **Test connection** says "not found", check the provider's current names.
- Local servers have an editable **address**. Plain `http://` is only accepted for `localhost`, so folder details are never sent unencrypted to another machine.
- Small local models are less reliable. Dirvo validates every reply and never shows one it cannot parse, and a low-confidence answer is moved toward caution, but expect more "unknown" and cautious answers.

## Privacy and security

- Only for unknown folders, and only after you choose a provider (and add its key, if it needs one): the folder name and path, size, file and folder counts, file-type counts, dates, and up to 30 sample file names.
- For an unknown file: its name, full path, extension, size and dates. A file name can say a lot about you, so look at what you are about to send. The contents are never read.
- Your Windows username is replaced with `<USER>` in everything sent, including inside file names.
- File contents are never read or sent.
- The AI is called from the main process only. Each API key is encrypted with Electron `safeStorage` (Windows DPAPI, tied to your Windows account), is sent only in a request header to its own provider, is never sent back to the UI, and is never stored in plain text. If Windows encryption is unavailable, Dirvo refuses to save a key.
- With Ollama or another localhost server, no folder details leave your PC. With a hosted provider they go to that service, under its own terms and privacy policy.
- Folder names are treated as untrusted data in the prompt, and the AI's reply is strictly validated before it is shown or cached.
- `contextIsolation` is on, `nodeIntegration` is off, the window is sandboxed, and the renderer only talks to the main process through a typed preload bridge (`window.dirvo`).

Local files are stored in `%APPDATA%\dirvo`: one encrypted key file per provider (for example `anthropic-key.bin`), `ai-settings.json` (provider, model and address choices, no secrets) `ai-cache.json` (cached answers, with the username already redacted), and `saved-scans.json` (your latest results and the size of each scanned folder, so Dirvo can show what changed). Unlike the AI cache, `saved-scans.json` holds real paths and sample file names, including your username. It never leaves your PC, and **Settings → Saved scans → Forget** deletes it. Only AI answers are stored in it; rulings from the database are recomputed on every launch, so database updates improve old results.

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

To use AI explanations, open **Settings**, pick a provider and paste its API key, or pick Ollama to use a local model. Without one, everything else still works, and unknown folders show a prompt to set it up.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app with hot reload |
| `npm run build` | Typecheck, then build to `out/` |
| `npm run preview` | Run the built app |
| `npm run typecheck` | Typecheck main, preload and renderer |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run icons` | Regenerate `resources/icon.png` and `resources/icon.ico` from `resources/logo.svg` |
| `npm run pack` | Build the app unpacked into `release/win-unpacked/` (fast, for testing the packaged app) |
| `npm run dist` | Typecheck, build, and make the Windows installer in `release/` |

## Installing

`npm run dist` creates `release/Dirvo-Setup-0.1.0.exe` (about 116 MB, because it carries its own copy of Electron).

- **No administrator rights needed.** It installs for the current user, by default into `%LOCALAPPDATA%\Programs\Dirvo`, and you can pick another folder. It adds Desktop and Start Menu shortcuts and an entry in Windows Settings → Apps.
- **Uninstalling** removes the program, the shortcuts and the Apps entry. It **keeps** your saved scans, settings and API keys in `%APPDATA%\dirvo`; delete that folder to remove them too.
- **Windows SmartScreen will warn** ("Windows protected your PC") because the installer is not code-signed. Choose **More info → Run anyway**. Signing needs a code-signing certificate, which is paid for.
- **Silent install:** `Dirvo-Setup-0.1.0.exe /S`. Silent uninstall: run `Uninstall Dirvo.exe /currentuser /S` from the install folder.

The packaged app and the installer have been tested on Windows 11: a clean install, launch, scan, and uninstall.

## Project layout

```
data/known-folders.json     Offline known-folder database
data/known-files.json       Offline known-file and file-type database
src/main/                   Electron main process
  scanner/                  Metadata scanner, worker thread, drive scan orchestrator
  knowledge/                Path patterns, database matcher, system-path rules
  ai/                       Provider client, redaction, validation, cache, key store, provider settings
src/preload/                Typed bridge exposed as window.dirvo
src/renderer/               React UI (Tailwind CSS)
src/shared/                 Types and the provider catalog, shared by all three
tests/                      Vitest tests
```

## Tests

`npm test` covers the scanner, single-file inspection, the locked-file fallback, the file rules, the path matcher and database, the system-path rules, the drive scan logic, and the AI layer (redaction, response validation, confidence policy, key storage, cache and service, all with a fake network).

The AI layer is tested with a fake network for every provider's request and response format. It has **not** been run against the hosted APIs with real keys. Only Anthropic's "key rejected" error path was checked against its real endpoint. Ollama was tested end to end with a real local model (`qwen3.5:4b`): connection test, explanation of an unknown folder, and the "not running" error. That run showed that thinking models can use their whole output budget before answering, which is why Dirvo turns thinking off for Ollama and gives every provider a large output budget. It also showed a 4B model can give shaky explanations, which is what the contradiction check is for. The default model names for hosted providers are best guesses, so verify them with **Test connection**.

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
  "consequenceIfDeleted": "npm re-downloads packages when needed, so the next installs are slower.",
  "howToClean": {
    "text": "npm can clear its own cache, which is safer than deleting files by hand.",
    "command": "npm cache clean --force"
  }
}
```

- `patterns` use `/`, ignore case, and may use `*` inside a segment. `~/` means `C:\Users\<anyone>\`, and `<drive>/` means any drive root. A pattern with neither matches the end of a path (`node_modules`).
- `includeDescendants` also matches anything inside the folder.
- `confidence` is optional and defaults to `HIGH`. Use `MEDIUM` when the same folder name can mean different things.
- The database is validated when the app starts, and `npm test` checks the shipped file. Bad verdicts, duplicate ids and over-broad patterns fail loudly.
- `howToClean` is optional advice shown as "To clean". It has `text`, and optionally a `command` and a `settings` page (`storage` or `apps`). Dirvo never runs a command; it only offers to copy it. Commands must be on the exact allow-list in [`src/main/knowledge/clean-commands.ts`](src/main/knowledge/clean-commands.ts), which only contains each tool cleaning its own cache (no `rm`, `del` or `Remove-Item`). A command that is not on the list makes the database fail validation, so adding one needs a deliberate code change.
- When in doubt, pick the more cautious verdict.

## Known limitations

- Windows only.
- A drive scan reports a big unknown folder as one item. Use **Look inside** on it to break it down one level at a time.
- Sizes are the sum of file sizes. Folders that share files between copies (such as `WinSxS`) can differ from what Explorer reports.
- A drive scan lists a file only when it sits directly inside a folder the scan opens (the drive root, Windows, Users, a profile, AppData, ...). A file deeper down is part of its folder's size and appears in that folder's **Biggest files** (up to five per folder).
- Windows keeps `pagefile.sys`, `hiberfil.sys` and `swapfile.sys` locked, so Node cannot open them even to read the size. For those, and only those, Dirvo reads the size from the folder listing by starting PowerShell once, with a fixed read-only script. The names reach it through environment variables, never the command line. If PowerShell is missing, those files are simply not listed.
- A file's ruling comes from its name, its folder and its extension. Dirvo never looks inside it, so a `.txt` that holds something precious is rated by type, not by what it says.
- The installer is not code-signed, so Windows SmartScreen warns about it. There is no auto-update: install a newer setup over the old one to update.
- Only 64-bit Windows is built.

## License

Dirvo is released under the [MIT License](LICENSE). You can use, copy, modify and share it, including commercially, as long as you keep the copyright notice. It comes with no warranty.

It bundles the Geist fonts (SIL Open Font License) and Electron (MIT), which keep their own licenses.
