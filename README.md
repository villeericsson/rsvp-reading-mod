# RSVP Reader

A Svelte-based Rapid Serial Visual Presentation (RSVP) reader for speed reading with PDF and EPUB support. This is a fork of [thomaskolmans/rsvp-reading](https://github.com/thomaskolmans/rsvp-reading) with quality-of-life enhancements.

## Demo

**[Try the live app](https://rsvp-reading-mod.vercel.app/)** · [Original version](https://rsvp.n0name.eu/)

## What is RSVP?

Rapid Serial Visual Presentation (RSVP) is a technique where text is displayed one word at a time at a fixed focal point. This eliminates the need for eye movements (saccades) during reading, potentially allowing for significantly faster reading speeds.

The app uses **Optimal Recognition Point (ORP)** highlighting — the red letter in each word indicates the point where your eye naturally focuses for fastest word recognition. This is calculated based on word length:

- 1–3 letter words: 1st letter
- 4–5 letter words: 2nd letter
- 6–9 letter words: 3rd letter
- 10+ letter words: 4th letter

## Features

**Reading & Speed**
- PDF and EPUB file support
- Adjustable reading speed (50–1000 WPM) with quick presets
- Dynamic WPM scaling — automatically slows down for longer words
- ORP highlighting with adjustable X/Y offset

**Display**
- Font size control
- Font selection
- Dynamic font scaling — long words shrink to fit the screen
- Context mode — shows surrounding words for context while reading
- Bold and italic text formatting preserved from source
- Quotation highlighting — dialogue in quotation marks is visually distinct
- Book title displayed in the header
- Dark theme

**Navigation**
- Chapter menu — jump to any chapter in EPUB files
- Book and chapter progress shown in the footer
- Clickable progress bar to jump to any position
- Jump dialog — skip to any word number or percentage
- Keyboard shortcuts for hands-free control

**Pauses**
- Punctuation pauses with configurable multiplier
- Compound word pauses (hyphenated/dashed words)
- Number pauses
- Paragraph-end pauses with configurable style and multiplier
- Periodic pauses every N words
- Max pause cap — prevents any single word from displaying too slowly
- Post-pause speed smoothing — gradually ramps speed back up after a long pause
- Max-wins pause stacking — only the strongest applicable pause multiplier applies per word

**Persistence**
- Autosave — progress, settings, and selected files are saved automatically
- Session restore on reload
- PWA — installable as a native-like app on mobile

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause / Resume |
| `Escape` | Exit focus mode or close dialogs |
| `Arrow Up` | Increase speed (+25 WPM) |
| `Arrow Down` | Decrease speed (-25 WPM) |
| `Arrow Left` | Go back one word |
| `Arrow Right` | Skip forward one word |
| `G` | Open jump-to-position dialog |
| `Ctrl+S` / `Cmd+S` | Save current progress |

## Installation

```bash
git clone https://github.com/villeericsson/rsvp-reading-mod.git
cd rsvp-reading-mod

npm install
npm run dev
```

App runs at `http://localhost:5173/`

```bash
# Production build
npm run build

# Preview production build
npm run preview
```

## Docker

```bash
cd docker
docker compose up -d
```

The app will be available at `http://localhost:8080`. To rebuild after changes:

```bash
docker compose up -d --build
```

## Project Structure

```
src/
├── App.svelte                        # Main application component
├── app.css                           # Global styles
├── main.js                           # Entry point
├── lib/
│   ├── rsvp-utils.js                 # Core RSVP logic
│   ├── file-parsers.js               # PDF and EPUB parsing
│   ├── progress-storage.js           # Session save/load
│   ├── settings-storage.js           # Settings persistence
│   ├── book-cache.js                 # Book content caching
│   ├── fonts.js                      # Font definitions
│   └── components/
│       ├── RSVPDisplay.svelte        # Word display
│       ├── Controls.svelte           # Playback controls
│       ├── Settings.svelte           # Settings panel
│       ├── TextInput.svelte          # Text/file input
│       ├── ProgressBar.svelte        # Progress indicator
│       └── ChapterMenu.svelte        # Chapter navigation
└── tests/
    ├── rsvp-utils.test.js
    ├── file-parsers.test.js
    └── progress-storage.test.js
```

## Testing

```bash
npm test             # Watch mode
npm run test:run     # Run once
npm run test:coverage
```

## Dependencies

- **Svelte 5** — UI framework
- **Vite** — build tool
- **pdfjs-dist** — PDF parsing
- **epubjs** — EPUB parsing

## Acknowledgments

- Forked from [thomaskolmans/rsvp-reading](https://github.com/thomaskolmans/rsvp-reading)
- Based on RSVP research in cognitive psychology
- PDF parsing by [PDF.js](https://mozilla.github.io/pdf.js/)
- EPUB parsing by [Epub.js](https://github.com/futurepress/epub.js/)

## License

MIT
