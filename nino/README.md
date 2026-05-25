# Nino — Kids' Bilingual Vocabulary Game 🇫🇷 🇬🇧

A small, delightful, **static** website that teaches a young child vocabulary by
**audio-first picture matching**: Nino the mascot says a word, the child taps the
matching picture. Two modes — learning **French** and learning **English** — share
one concept-centric word list. No backend, no accounts, no build step.

- **Audio-first:** every round plays the word in a clear, native voice.
- **Never punishing:** wrong taps get a gentle nudge from Nino; there's no way to lose.
- **Spaced repetition:** a 3-box Leitner system surfaces the words a child needs most.
- **Two languages, one data model:** each word is a language-neutral concept with a
  shared picture, so flipping French ↔ English is a single switch (progress is kept
  separately per language).

> Status: v1 — French **and** English, Levels 1–2, 60 words with full audio in both
> languages. (Level 3 is a future addition.)

## Run it locally

It's a static site — serve the folder and open it (use a server, not `file://`, so
the browser can fetch `vocab.json`):

```bash
python3 -m http.server 8000
# open http://localhost:8000   (or http://<your-LAN-ip>:8000 on a phone/tablet)
```

Add `?dev` to the URL for a panel that triggers Nino's states. In the console,
`__nino.loadProgress('fr')` shows the Leitner boxes and `__nino.resetProgress()` clears them.

## Add a new word (3 steps, no code change)

1. **Append one object to `vocab.json`** (inside `items`):
   ```json
   { "id": "fox", "category": "animals", "codepoint": "1F98A",
     "fr": { "word": "renard", "article": "le", "gender": "m" },
     "en": { "word": "fox", "article": "the" } }
   ```
   - `id` — a unique slug (also the audio filename). `category` — an existing category.
   - `codepoint` — the emoji's Unicode code point in **UPPERCASE** hex (e.g. 🦊 → `1F98A`).
     Find it on [openmoji.org](https://openmoji.org) (the SVG's filename *is* the codepoint)
     or Emojipedia. Multi-codepoint emoji use hyphens, e.g. `1F468-200D-1F33E`.
   - `article` — `le` / `la` / `l'`; include `gender` (`m`/`f`) for French.
2. **Get the picture:** `python3 scripts/fetch_images.py`
3. **Get the audio:** `python3 scripts/generate_audio.py fox` (see below)

The word is now in rotation. (Until step 2/3 run, the app falls back to the plain emoji
glyph and a synthesized voice, so nothing breaks in the meantime.)

## Asset scripts

### Images — `scripts/fetch_images.py`
Reads every `codepoint` in `vocab.json` and downloads the matching **OpenMoji** color SVG
into `assets/openmoji/<CODEPOINT>.svg`. Idempotent (skips files already present), so it's
safe to re-run after adding words.

```bash
python3 scripts/fetch_images.py
```

### Audio — `scripts/generate_audio.py`
Generates one MP3 per word using **Google Gemini TTS** and converts it with **ffmpeg**.
French clips say the word **with its article** ("le chien", "l'œuf") so gender is taught
aloud even when no text is shown.

**Requirements:**
- `export GEMINI_API_KEY=...` — a [Google AI Studio](https://aistudio.google.com/apikey) key.
- `ffmpeg` on your `PATH` (`brew install ffmpeg`).

```bash
export GEMINI_API_KEY=your_key
python3 scripts/generate_audio.py            # all words, skips existing
python3 scripts/generate_audio.py dog cat    # just these ids (audition before a full run)
python3 scripts/generate_audio.py --force    # regenerate everything
python3 scripts/generate_audio.py --voice Leda   # try another voice
python3 scripts/generate_audio.py --lang en  # English clips
```

- **Voice:** default `Sulafat` (warm). Alternatives: `Achird`, `Vindemiatrix`, `Leda`, `Aoede`, `Kore`.
- **Model:** `gemini-3.1-flash-tts-preview`, auto-falling back to `gemini-2.5-flash-preview-tts`.
- **Rate limits:** the free tier allows only ~3 requests/minute, so the script waits and
  retries automatically (a full run is slow and may hit a daily cap). A billing-enabled key
  generates all 60 in seconds for a few cents.
- Output: `assets/audio/<lang>/<id>.mp3`. Missing files fall back to the browser's speech voice.

## Deploy to GitHub Pages

It's pure static files — push and enable Pages:

```bash
git init && git add -A && git commit -m "Nino v1"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Then on GitHub: **Settings → Pages → Build and deployment → Source: _Deploy from a branch_ →
Branch: `main`, folder `/ (root)` → Save.** Your site appears at
`https://<you>.github.io/<repo>/`.

Notes:
- A `.nojekyll` file is included to skip Jekyll processing.
- All paths are relative, so it works whether served from the root
  (`<you>.github.io`, repo named `<you>.github.io`) or a project subpath (`/<repo>/`).
- Filenames are case-sensitive on Pages; keep `codepoint`s uppercase.

### Or: drop it into an existing `username.github.io` site

If you already have a personal Pages site, copy this project in as a subfolder and
push — no new repo, no Pages settings to change:

```bash
cp -R learn_language /path/to/<you>.github.io/nino
cd /path/to/<you>.github.io && git add nino && git commit -m "Add Nino" && git push
```

It serves at `https://<you>.github.io/nino/`. All paths are relative, so it works under
the subpath. If your main site uses Jekyll, don't rename any files to start with `_`.

## Project structure

```
index.html        markup + screens
style.css         pastel design system
app.js            game logic (mascot, round engine, SRS, audio)
vocab.json        the word list (the one file you edit to add words)
assets/openmoji/  downloaded SVGs        assets/fonts/  self-hosted Fredoka
assets/audio/fr/  generated MP3s         assets/audio/en/  generated MP3s
scripts/fetch_images.py   scripts/generate_audio.py
```

## Credits & licenses

- Emoji artwork: [OpenMoji](https://openmoji.org) — **CC BY-SA 4.0**
- Font: [Fredoka](https://fonts.google.com/specimen/Fredoka) — **SIL Open Font License**
- Audio generated with Google Gemini TTS.
