#!/usr/bin/env python3
"""Generate word-audio MP3s from vocab.json using Gemini TTS.

Setup (one time):
    export GEMINI_API_KEY=your_google_ai_studio_key
    # needs `ffmpeg` on PATH; no Python packages required (stdlib only)

Usage:
    python3 scripts/generate_audio.py              # all French words, skip existing
    python3 scripts/generate_audio.py dog cat      # only these ids — AUDITION a few first!
    python3 scripts/generate_audio.py --force      # regenerate everything
    python3 scripts/generate_audio.py --voice Leda # try a different voice
    python3 scripts/generate_audio.py --lang en    # English
    python3 scripts/generate_audio.py --lang ja --engine say  # macOS voices: free, offline, no key/limits

French clips say the word WITH its article ("le chien", "l'œuf") so gender is
taught aloud even when no text is shown. Gemini returns 24kHz/mono/16-bit PCM,
which ffmpeg converts to MP3 at assets/audio/<lang>/<id>.mp3.

Tip: run a couple of ids first and LISTEN before generating all 40 — confirm the
voice/pronunciation is right and that no style direction got read aloud.
"""
import argparse
import base64
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOCAB = os.path.join(ROOT, "vocab.json")

# Newest first; falls back automatically if a key lacks access to the newer one.
MODELS = ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"]
DEFAULT_VOICE = "Sulafat"   # warm. alts: Achird (friendly), Vindemiatrix (gentle), Leda (youthful), Kore (firm), Aoede (breezy)
LANG_NAME = {"fr": "French", "en": "English", "ja": "Japanese"}
# macOS `say` voices (engine="say"): free, offline, no rate limits. Download the
# Enhanced/Premium variants in System Settings ▸ Spoken Content ▸ Manage Voices.
SAY_VOICE = {"fr": "Amélie (Premium)", "en": "Allison (Enhanced)", "ja": "Kyoko (Enhanced)"}
SAY_RATE = 150              # words/min — `say` default (~175+) is brisk for a learner
PCM_RATE = 24000            # Gemini TTS output: 24kHz, mono, signed 16-bit LE
ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

_working_model = None       # remembered after the first successful call


def phrase_for(item, lang):
    """What the voice actually says. French: article + word (teaches gender)."""
    loc = item[lang]
    word = loc["word"]
    art = loc.get("article", "")
    if lang != "fr" or not art:
        return word
    return art + word if art.endswith(("’", "'")) else f"{art} {word}"


def synthesize(text, lang, voice, api_key):
    """Return raw PCM bytes for `text` from Gemini TTS."""
    global _working_model
    # a clear directive before the colon is interpreted as style, not spoken
    prompt = f"Say clearly and warmly, in {LANG_NAME.get(lang, 'French')}, for a young child: {text}"
    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}},
        },
    }).encode("utf-8")

    models = [_working_model] if _working_model else list(MODELS)
    for model in models:
        for attempt in range(10):
            req = urllib.request.Request(
                ENDPOINT.format(model=model),
                data=body,
                headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
            )
            try:
                with urllib.request.urlopen(req, timeout=90) as r:
                    resp = json.load(r)
            except urllib.error.HTTPError as e:
                if e.code == 429:                          # rate limited — wait and retry
                    detail = e.read().decode("utf-8", "replace")
                    m = re.search(r"retry in ([\d.]+)s", detail)
                    wait = (float(m.group(1)) + 1.5) if m else 20.0
                    print(f"    rate limited; waiting {wait:.0f}s ...", file=sys.stderr)
                    time.sleep(min(wait, 65))
                    continue
                if e.code in (403, 404) and model != models[-1]:
                    break                                  # try the fallback model
                raise
            _working_model = model
            for part in resp["candidates"][0]["content"]["parts"]:
                if "inlineData" in part:
                    return base64.b64decode(part["inlineData"]["data"])
            raise RuntimeError("no audio in response: " + json.dumps(resp)[:400])
    raise RuntimeError(f'gave up after rate-limit retries on "{text}"')


def pcm_to_mp3(pcm, dest):
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error",
         "-f", "s16le", "-ar", str(PCM_RATE), "-ac", "1", "-i", "pipe:0",
         "-codec:a", "libmp3lame", "-qscale:a", "4", dest],
        input=pcm, check=True,
    )


def aiff_to_mp3(src, dest):
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", src,
         "-codec:a", "libmp3lame", "-qscale:a", "4", dest],
        check=True,
    )


def say_synthesize(text, voice, rate, dest_aiff):
    """macOS `say` -> AIFF. Tries the full voice name, then the base name ('Kyoko')."""
    for v in (voice, voice.split(" (")[0]):
        cmd = ["say", "-v", v] + (["-r", str(rate)] if rate else []) + ["-o", dest_aiff, text]
        if subprocess.run(cmd).returncode == 0 and os.path.exists(dest_aiff):
            return
    raise RuntimeError(f"`say` failed for voice {voice!r} (is it installed? `say -v '?'`)")


def main():
    ap = argparse.ArgumentParser(description="Generate word MP3s via Gemini TTS or macOS `say`.")
    ap.add_argument("ids", nargs="*", help="only these item ids (default: all)")
    ap.add_argument("--lang", default="fr", choices=["fr", "en", "ja"])
    ap.add_argument("--engine", default="gemini", choices=["gemini", "say"],
                    help="gemini = Google TTS (needs API key); say = macOS local voices (free, offline)")
    ap.add_argument("--voice", default=None, help="override the voice (engine-specific default otherwise)")
    ap.add_argument("--rate", type=int, default=None, help=f"words/min, --engine say only (default {SAY_RATE})")
    ap.add_argument("--force", action="store_true", help="overwrite existing MP3s")
    args = ap.parse_args()

    api_key = os.environ.get("GEMINI_API_KEY")
    if args.engine == "gemini" and not api_key:
        sys.exit("Set GEMINI_API_KEY first:  export GEMINI_API_KEY=your_key")

    if args.engine == "say":
        voice = args.voice or SAY_VOICE.get(args.lang, SAY_VOICE["en"])
        rate = args.rate if args.rate is not None else SAY_RATE
    else:
        voice = args.voice or DEFAULT_VOICE

    with open(VOCAB, encoding="utf-8") as f:
        items = json.load(f)["items"]
    if args.ids:
        wanted = set(args.ids)
        items = [it for it in items if it["id"] in wanted]
        missing = wanted - {it["id"] for it in items}
        if missing:
            sys.exit("unknown id(s): " + ", ".join(sorted(missing)))

    outdir = os.path.join(ROOT, "assets", "audio", args.lang)
    os.makedirs(outdir, exist_ok=True)

    made = skipped = 0
    for it in items:
        dest = os.path.join(outdir, it["id"] + ".mp3")
        if os.path.exists(dest) and not args.force:
            skipped += 1
            continue
        text = phrase_for(it, args.lang)
        try:
            if args.engine == "say":
                tmp = dest + ".aiff"
                say_synthesize(text, voice, rate, tmp)
                aiff_to_mp3(tmp, dest)
                os.remove(tmp)
            else:
                pcm = synthesize(text, args.lang, voice, api_key)
                pcm_to_mp3(pcm, dest)
        except urllib.error.HTTPError as e:
            sys.exit(f'\nAPI error on "{text}" (HTTP {e.code}): {e.read().decode("utf-8", "replace")[:500]}')
        except Exception as e:
            sys.exit(f'\nFailed on "{text}": {e}')
        made += 1
        print(f'  {it["id"]:12s} "{text}"  ->  {args.lang}/{it["id"]}.mp3')

    tag = f"say {voice} @{rate}wpm" if args.engine == "say" else f"gemini {voice}, model {_working_model or MODELS[0]}"
    print(f"\ndone: {made} generated, {skipped} skipped  ({tag})  ->  {outdir}")


if __name__ == "__main__":
    main()
