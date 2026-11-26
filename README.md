<img src="resources/logo.svg" alt="Dirvo logo" width="96" height="96">

# Dirvo

**Mystery folders, explained.** Dirvo is a Windows desktop app that tells you what a folder is, which app made it, how big it is, whether it is safe to delete, and what happens if you delete it.

Pick a folder, or scan a whole drive. Dirvo reads only folder metadata (names, sizes, counts and dates), never file contents.

> **Dirvo never deletes anything.** It only advises. The only actions are **Open in Explorer** and **Copy path**.

## Features

- **Explain a folder:** choose a folder with the Windows picker, or paste a path.
- **Scan a drive:** looks inside Windows, Program Files, ProgramData, user profiles and AppData, scans each folder, and lists the big ones ranked by size.
- **Reclaimable space:** after a scan, one figure shows how much space sits in folders rated Safe or Rebuilds, and a bar splits everything scanned by verdict. Folders inside other listed folders are not counted twice.
- **Colour-coded verdicts:** every folder gets one of four verdicts (see below), plus what it is, what created it, and what happens if you delete it.
- **Offline first:** about 80 common folders (browser caches, `node_modules`, npm and Gradle caches, Windows Update, Temp, Package Cache, Docker, ...) are recognised with no network.
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

For a drive scan, Dirvo splits "container" folders (drive root, Windows, Users, a profile, AppData, ...) into their subfolders and scans each one, three at a time. Folders under 50 MB are counted but not listed. Unknown folders get an **Explain with AI** button instead of being sent automatically.

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
- Your Windows username is replaced with `<USER>` in everything sent, including inside file names.
- File contents are never read or sent.
- The AI is called from the main process only. Each API key is encrypted with Electron `safeStorage` (Windows DPAPI, tied to your Windows account), is sent only in a request header to its own provider, is never sent back to the UI, and is never stored in plain text. If Windows encryption is unavailable, Dirvo refuses to save a key.
- With Ollama or another localhost server, no folder details leave your PC. With a hosted provider they go to that service, under its own terms and privacy policy.
- Folder names are treated as untrusted data in the prompt, and the AI's reply is strictly validated before it is shown or cached.
- `contextIsolation` is on, `nodeIntegration` is off, the window is sandboxed, and the renderer only talks to the main process through a typed preload bridge (`window.dirvo`).

Local files are stored in `%APPDATA%\dirvo`: one encrypted key file per provider (for example `anthropic-key.bin`), `ai-settings.json` (provider, model and address choices, no secrets) and `ai-cache.json` (cached answers, with the username already redacted).

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

Dirvo is not packaged as an installer yet. Run it from source as above.

## Project layout

```
data/known-folders.json     Offline known-folder database
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

`npm test` covers the scanner, the path matcher and database, the system-path rules, the drive scan logic, and the AI layer (redaction, response validation, confidence policy, key storage, cache and service, all with a fake network).

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
