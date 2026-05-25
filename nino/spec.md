# Build Spec — Kids' Bilingual Vocabulary Game (French / English)

## 0. What this is
A small, delightful, **static website** that teaches a 6-year-old vocabulary in a
target language by **audio-first picture matching**: the mascot plays a word aloud,
the child taps the matching picture from 2–4 options. Two modes: **learning French**
(primary user: a French-beginner child) and **learning English** (a French-speaking
nephew). Deployed to **GitHub Pages**. No backend, no accounts, no build step.

**Design north star:** it must feel *delightful and alive* to a 6-year-old, never
punishing. A child will forgive missing features; he will not forgive jank or boredom.
Polish the core loop (audio → tap → mascot celebrates) above everything else.

---

## 1. Hard constraints (read before coding)
- **Static site only.** Plain HTML/CSS/JS, or a single-file React if preferred. **No
  bundler, no CI, no npm build step** — the deploy must be "commit files, push, done"
  so it works on GitHub Pages with zero friction.
- **No browser storage APIs other than `localStorage`.** Progress lives in
  `localStorage` (single device, no accounts). Do not build auth.
- **All assets committed to the repo.** Images (SVG) and audio (MP3) are files in the
  repo, not fetched at runtime from third parties. Must work offline once loaded.
- **Concept-centric data model (critical — see §3).** The two-language feature depends
  entirely on this. Do not build "French-first with a translation field."

---

## 2. Core mechanic
One **round**:
1. Mascot **auto-plays the target-language audio** for the word on round start.
   A tappable speaker icon (and tapping the mascot) **replays** it.
2. Show **N picture cards**: 1 correct + (N−1) distractors, shuffled.
3. Child taps a card:
   - **Correct** → happy chime, card does a pop/scale animation, mascot celebrates,
     auto-advance after ~1s.
   - **Wrong** → warm encouragement from mascot ("Essaie encore !" / "Try again!"),
     the tapped card gently greys/dims, child tries again. **No hard fail. No buzzer.
     No score loss. No way to "lose."**

A **session** = 8–10 rounds, then a **reward screen** (stars + big mascot celebration
+ confetti). Target total play time ~5 minutes. Short and winnable beats long.

---

## 3. Data model (THE most important architectural decision)
Each vocabulary item is a **language-neutral concept** with both languages hanging off
it equally and a **shared image**. The engine renders `item[targetLang]`. Flipping the
whole app between French and English is then a single `targetLang` switch.

```json
{
  "id": "dog",
  "category": "animals",
  "image": "assets/openmoji/1F415.svg",
  "fr": { "word": "chien",  "article": "le", "audio": "assets/audio/fr/dog.mp3" },
  "en": { "word": "dog",    "article": "the", "audio": "assets/audio/en/dog.mp3" }
}
```

- The **picture is shared** (a dog is a dog in both languages).
- `article` is **stored but hidden at Levels 1–2**; shown only at Level 3+ where text
  appears. (French gender taught from the start, without cluttering the pre-reader view.)
- Vocabulary lives in a **single `vocab.json`** file. **Adding a word later = appending
  one object + dropping in its SVG and 2 MP3s.** Make this genuinely trivial; the user
  will extend the list regularly. Document the "how to add a word" steps in a README.

---

## 4. Vocabulary (generate 40 to start)
- **You (Code) generate the initial ~40-item list.** All items must be:
  - **Concrete, picturable nouns** (so an OpenMoji icon exists). NO abstract words
    (because/maybe/idea), NO verbs/adjectives in v1 — they don't picture cleanly.
  - **Simple, common, day-to-day** vocabulary a 6-year-old encounters. Use high-
    frequency everyday nouns. Do **not** scale difficulty by word complexity — keep ALL
    words simple. (Difficulty comes from the game mechanic; see §5.)
- **Organize by category** (e.g. animals, food, body, home, clothes, vehicles, nature).
  Categories feed both the same-category-distractor difficulty and SRS grouping. Aim
  ~5–7 categories, ~6–8 words each.
- Provide correct French articles (le/la/l') and gender. Flag any item where no clean
  OpenMoji icon exists and substitute a different equally-common word.

---

## 5. Difficulty levels (scale the MECHANIC, not the words)
Three axes: number of cards, distractor similarity, text on/off.

| Level | Cards | Distractors | Text under pictures |
|-------|-------|-------------|---------------------|
| 1 — Découverte | 2 | different categories (dog vs. car) | none (audio + picture only) |
| 2 | 3 | mixed categories | none |
| 3 | 4 | **same category** (dog/cat/horse/rabbit) | yes (target word + article) |
| 4 (build later, optional) | 4 | same category | **text only, no pictures** |

- A true beginner lives at **Levels 1–2** for weeks. Build 1–3 well; Level 4 is a
  stretch goal, do not over-invest.
- Front page lets the child/parent pick a level, OR auto-start at Level 1 and ramp.
  Keep level selection simple and visual (big buttons, e.g. 🌱 / 🌿 / 🌳).

---

## 6. Spaced repetition (do NOT replace with random shuffle)
Implement a **simple 3-box Leitner system**:
- Box 1 = new/unseen, Box 2 = learning, Box 3 = known.
- Correct on first try → promote one box. Wrong → demote to Box 1.
- Round selection draws mostly from Box 1, sometimes Box 2, rarely Box 3.
- Persist box state per item in `localStorage`, keyed by `targetLang` (French and
  English progress are tracked separately).
This is ~30 lines of logic and is the highest-leverage feature for retention.

---

## 7. The mascot — "Nino" (name is a single config constant; user may rename)
A **simple pastel blob with an expressive face** — shape-simple, expression-rich. Built
as **inline SVG primitives + CSS keyframe animation only**. No sprite sheets, no images,
no animation libraries.

- **Body:** one rounded blob/circle in a pastel fill. Two big white eyes with dot
  pupils. A simple curved-path mouth. Optional two tiny rounded-rect arms.
- **States:**
  - **Idle:** gentle vertical bob (translateY ±4px, ~2s ease-in-out infinite) +
    **random blink** (eyes scaleY → ~0 for ~100ms on a random timer). The blink is
    cheap and makes it feel alive — include it.
  - **Correct:** a hop with **squash-and-stretch** (scale 1.1/0.9 on jump and land),
    mouth opens to a big "O" smile, eyes become happy `^^` arcs, a couple of CSS
    sparkles fade in.
  - **Encouraging** (after wrong tap): small side-to-side wobble (rotate ±5°), mouth
    flattens to a gentle supportive curve. **Never a frown.**
  - **Session complete:** bigger jump/spin + confetti.
- **Squash-and-stretch is mandatory** on the hop/land — it's the single trick that makes
  simple animation read as professional. If motion feels stiff, fix **timing**
  (slower, ease-in-out, slight delay between body and face), do NOT add more shapes.
- Mascot "speaks" the encouragement text: "Bravo !" / "Encore !" in French mode,
  "Great!" / "Try again!" in English mode.
- **Config constant** at top of code: `const MASCOT_NAME = "Nino";`

---

## 8. Audio (pre-generated neural TTS — NOT runtime Web Speech)
- **Pre-generate one MP3 per word per language** using a good **neural TTS** engine
  (Google Cloud WaveNet / Azure Neural / OpenAI TTS — single-word clips, near-human).
  Commit the MP3s to the repo. Result: one consistent high-quality voice, deterministic
  across all devices, works offline.
- **Write a generation script** (`scripts/generate_audio.py` or `.js`) that reads
  `vocab.json` and produces `assets/audio/fr/*.mp3` and `assets/audio/en/*.mp3`. The user
  will run it once with their own TTS API key (env var — never hardcode keys). Document
  this in the README, including which env var to set.
- Pick a **clear, warm, native voice** for each language (a native French voice for FR,
  a native English voice for EN).
- **Do NOT ship runtime `SpeechSynthesis`/Web Speech as the production audio path** — its
  voice/quality is non-deterministic per device and a wrong-accent voice teaches bad
  pronunciation. (You MAY wire Web Speech as an optional fallback ONLY if a given MP3 is
  missing, but generated MP3s are the real path.)

---

## 9. Images (OpenMoji — Code maps + downloads; Code does NOT draw them)
- **You cannot draw images.** Use **OpenMoji** (openmoji.org, CC BY-SA 4.0) — one
  coherently-designed open icon set covering everyday concrete vocabulary.
- For each vocab item, **map the concept to its OpenMoji codepoint** and write a script
  (`scripts/fetch_images.{py,sh}`) that downloads the corresponding SVGs into
  `assets/openmoji/`. Commit them.
- Use the **SVG (color)** OpenMoji variant for a consistent, clean look.
- **Attribute OpenMoji** in a small footer ("Emoji by OpenMoji – CC BY-SA 4.0").
- Do not use AI-generated images or mixed clip art — inconsistent style looks amateur
  and creates licensing problems.

---

## 10. Front page & flow
- Two big, friendly, distinct buttons:
  - **« J'apprends le français » 🇫🇷** → sets `targetLang = "fr"`
  - **"I'm learning English" 🇬🇧** → sets `targetLang = "en"`
- Then a **difficulty picker** (visual: 🌱 / 🌿 / 🌳), or auto-start Level 1.
- Mascot greets the child on the front page (idle animation).
- Flow: front page → (lang) → (level) → session of 8–10 rounds → reward screen →
  "play again" / back to start.

---

## 11. Visual design / theme
- **Soft pastel palette** (gentle pinks/blues/greens/yellows — NOT the default
  purple-gradient SaaS look). Rounded everything, generous whitespace.
- **Large tap targets** (small fingers) — minimum ~44px, prefer bigger for cards.
- One **playful rounded display font** for the few words shown (e.g. a friendly
  rounded Google Font; self-host or link).
- Mobile-first and touch-first (this will be used on a phone/tablet). Must work great
  in portrait on a phone and landscape on a tablet.
- Refer to the **frontend-design** skill for styling quality; aim for "intentionally
  designed kids' app," not generic.

---

## 12. Build order (ship v1 first — do NOT build everything at once)
**v1 (the priority):**
- French only, **Levels 1–2**, picture-matching core loop, SRS, Nino mascot with all
  states, pastel theme, ~40-word `vocab.json`, OpenMoji images downloaded, audio
  generation script + generated French MP3s.
- The **data model, `targetLang` switch, and audio/image pipelines are built to support
  two languages from day one** — but only the French path is exercised in v1.

**v2 (after v1 is proven fun):**
- Wire up the **English toggle** for the nephew (trivial given the data model) + generate
  English MP3s.
- Add **Level 3** (4 cards, same-category distractors, text + articles shown).
- Expand vocabulary.

**Stretch:** Level 4 (text-only).

> Build the architecture for two languages; ship one. Get the French core loop genuinely
> delightful before adding surface area.

---

## 13. Repo structure (suggested)
```
/index.html
/style.css
/app.js              (or /src for single-file React)
/vocab.json
/assets/openmoji/    (downloaded SVGs)
/assets/audio/fr/    (generated MP3s)
/assets/audio/en/    (generated MP3s, v2)
/scripts/fetch_images.{py,sh}
/scripts/generate_audio.{py,js}
/README.md           (how to add a word; how to run the asset scripts; how to deploy to GH Pages)
```

## 14. README must document
- How to **add a new word** (append to `vocab.json`, run the two asset scripts).
- How to **run the audio generation** (which TTS provider, which env var holds the key).
- How to **deploy to GitHub Pages** (which branch/folder).
- OpenMoji attribution + license note.

---

## 15. Acceptance check (does it actually work for a 6-year-old?)
- [ ] A non-reading child can complete a Level-1 session using **sound + pictures only**.
- [ ] Wrong taps are gentle and encouraging; the child can always recover and succeed.
- [ ] The mascot feels **alive** (bob + blink + celebrate), not static or stiff.
- [ ] Audio is one consistent, clear, correctly-accented native voice.
- [ ] Switching FR ↔ EN is a single toggle and keeps progress separate per language.
- [ ] Adding a word later is a 3-step, no-code-change operation.
- [ ] Deploys to GitHub Pages by pushing files — no build step.
