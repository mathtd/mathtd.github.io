'use strict';
/* =====================================================================
   Nino — Kids' Bilingual Vocabulary Game
   Single-file vanilla JS. No build step. Architected for TWO languages
   from day one; v1 exercises French only.
   ===================================================================== */
(function () {

  // ------------------------------------------------------------------
  // Config  (rename the mascot here — single source of truth)
  // ------------------------------------------------------------------
  const MASCOT_NAME = 'Nino';

  const CONFIG = {
    roundsPerSession: 9,        // a session = 8–10 rounds, then reward
    storagePrefix: 'ninovocab', // localStorage namespace
  };

  // Difficulty scales the MECHANIC, not the words. Data-driven so adding
  // Level 3 (4 cards, same-category distractors, text on) in v2 is one entry.
  //   distractors: 'cross' = different categories | 'mixed' | 'same'
  const LEVELS = [
    { id: 1, cards: 2, distractors: 'cross', text: false, emoji: '🌱', label: { fr: 'Découverte', en: 'Discover' } },
    { id: 2, cards: 3, distractors: 'mixed', text: false, emoji: '🌿', label: { fr: 'En route',   en: 'Off we go' } },
    // { id: 3, cards: 4, distractors: 'same', text: true, emoji: '🌳', label: { fr: 'Les mots', en: 'Words' } },  // v2
  ];

  // UI/mascot strings render in the TARGET language (immersion).
  const STRINGS = {
    fr: {
      greet: 'Salut ! On joue ?',
      pickLevel: 'Choisis ton niveau',
      praise:    ['Bravo !', 'Super !', 'Ouais !', 'Génial !'],
      encourage: ['Essaie encore !', 'Presque !', 'Encore !'],
      reward:    'Bravo !',
    },
    en: {
      greet: 'Hi! Want to play?',
      pickLevel: 'Pick your level',
      praise:    ['Great!', 'Yes!', 'Nice!', 'Awesome!'],
      encourage: ['Try again!', 'Almost!', 'Keep going!'],
      reward:    'You did it!',
    },
  };

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------
  const state = {
    targetLang: null,   // 'fr' | 'en'
    level: null,        // LEVELS entry
  };

  let VOCAB = null;     // vocab.json once loaded
  let session = null;   // { items, index, current, correctFirstTry, answeredWrong, locked }

  // ------------------------------------------------------------------
  // Tiny DOM helpers
  // ------------------------------------------------------------------
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ------------------------------------------------------------------
  // Progress persistence — keyed PER LANGUAGE (FR and EN tracked apart).
  // Full 3-box Leitner logic lands in Step 6; these are the I/O primitives.
  // ------------------------------------------------------------------
  const progressKey = (lang) => `${CONFIG.storagePrefix}.progress.${lang}`;

  function loadProgress(lang) {
    try { return JSON.parse(localStorage.getItem(progressKey(lang))) || {}; }
    catch { return {}; }
  }
  function saveProgress(lang, data) {
    try { localStorage.setItem(progressKey(lang), JSON.stringify(data)); }
    catch { /* private mode / quota — game still works, just no memory */ }
  }

  // ------------------------------------------------------------------
  // Mascot  (Step 1: static idle blob with CSS bob.
  //          Step 3 swaps in the full state machine: blink + celebrate +
  //          encourage + session-complete.)
  // ------------------------------------------------------------------
  // Nesting matters: bob (idle float) ▸ hop (jumps + squash/stretch about the
  // feet) ▸ spin (rotation about the centre) ▸ the face. Keeping them on separate
  // groups lets the gentle idle bob compose under one-shot reactions without
  // fighting over the `transform` property.
  function mascotMarkup() {
    return `
      <svg class="nino is-idle" viewBox="0 0 200 210" role="img" aria-label="${MASCOT_NAME}">
        <g class="nino-bob">
        <g class="nino-hop">
        <g class="nino-spin">
          <ellipse class="nino-blob" cx="100" cy="108" rx="72" ry="74"/>
          <circle class="nino-cheek" cx="60"  cy="124" r="11"/>
          <circle class="nino-cheek" cx="140" cy="124" r="11"/>

          <!-- round eyes: idle + encouraging -->
          <g class="nino-eyes">
            <circle class="nino-eye" cx="78"  cy="96" r="16"/>
            <circle class="nino-eye" cx="122" cy="96" r="16"/>
            <g class="nino-pupils">
              <circle class="nino-pupil" cx="78"  cy="98" r="6.5"/>
              <circle class="nino-pupil" cx="122" cy="98" r="6.5"/>
            </g>
          </g>
          <!-- happy ^^ eyes: correct + celebrate -->
          <g class="nino-eyes-happy">
            <path d="M64 100 Q78 82 92 100"/>
            <path d="M108 100 Q122 82 136 100"/>
          </g>

          <!-- three mouths; CSS shows one per state -->
          <path    class="nino-mouth"         d="M80 134 Q100 152 120 134"/>
          <path    class="nino-mouth-support" d="M82 138 Q100 145 118 138"/>
          <ellipse class="nino-mouth-open"    cx="100" cy="143" rx="17" ry="15"/>

          <!-- sparkles: pop in on a happy state -->
          <g class="nino-sparkles">
            <path class="nino-sparkle" d="M40 39 Q40 48 49 48 Q40 48 40 57 Q40 48 31 48 Q40 48 40 39 Z"/>
            <path class="nino-sparkle" d="M162 48 Q162 56 170 56 Q162 56 162 64 Q162 56 154 56 Q162 56 162 48 Z"/>
            <path class="nino-sparkle" d="M150 111 Q150 118 157 118 Q150 118 150 125 Q150 118 143 118 Q150 118 150 111 Z"/>
            <path class="nino-sparkle" d="M30 109 Q30 116 37 116 Q30 116 30 123 Q30 116 23 116 Q30 116 30 109 Z"/>
          </g>
        </g>
        </g>
        </g>
      </svg>`;
  }
  function mountMascots() {
    $$('[data-mascot]').forEach((stage) => {
      if (!stage.firstElementChild) stage.innerHTML = mascotMarkup();
    });
  }

  // Idle liveliness — random blink + wandering glances, on organic (non-looping)
  // timers so it never feels mechanical. Step 3 layers the celebrate / encourage
  // states on top of this same machinery.
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function initMascotIdle() {
    if (REDUCED) return;
    const rand = (min, max) => min + Math.random() * (max - min);

    $$('.nino').forEach((svg) => {
      const eyes   = svg.querySelector('.nino-eyes');
      const pupils = svg.querySelector('.nino-pupils');
      if (!eyes || !pupils) return;

      const blink = () => eyes.animate(
        [{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.08)', offset: 0.5 }, { transform: 'scaleY(1)' }],
        { duration: 190, easing: 'ease-in-out' }
      );

      (function blinkLoop() {
        setTimeout(() => {
          blink();
          if (Math.random() < 0.25) setTimeout(blink, 250);   // occasional cute double-blink
          blinkLoop();
        }, rand(2400, 6200));
      })();

      // glance around: shift both pupils together, hold, then re-center
      const DIRS = [[7, 0], [-7, 0], [6, -3], [-6, -3], [0, 4], [6, 3], [-6, 3]];
      (function glanceLoop() {
        setTimeout(() => {
          const [dx, dy] = DIRS[(Math.random() * DIRS.length) | 0];
          pupils.style.transform = `translate(${dx}px, ${dy}px)`;
          setTimeout(() => { pupils.style.transform = 'translate(0px, 0px)'; }, rand(650, 1500));
          glanceLoop();
        }, rand(1700, 4200));
      })();
    });
  }

  // ------------------------------------------------------------------
  // Mascot reactions (Step 3) — one-shot states layered on the idle machinery.
  // Body animations run via the Web Animations API so they re-trigger cleanly
  // and we can revert to idle on finish. Squash-and-stretch is the whole trick:
  // anticipate (squash) → launch (stretch) → land (squash) → settle.
  // ------------------------------------------------------------------
  const HOP = [
    { transform: 'translateY(0) scale(1,1)',          offset: 0 },
    { transform: 'translateY(2px) scale(1.12,0.88)',  offset: 0.15 },  // anticipate
    { transform: 'translateY(-34px) scale(0.9,1.14)', offset: 0.35 },  // launch (stretch)
    { transform: 'translateY(-40px) scale(0.98,1.04)',offset: 0.52 },  // float
    { transform: 'translateY(-12px) scale(0.92,1.1)', offset: 0.70 },  // fall (stretch)
    { transform: 'translateY(0) scale(1.14,0.84)',    offset: 0.84 },  // land (squash)
    { transform: 'translateY(0) scale(0.98,1.03)',    offset: 0.93 },  // rebound
    { transform: 'translateY(0) scale(1,1)',          offset: 1 },
  ];
  const WOBBLE = [                                     // a clear, friendly "oops — try again" shimmy
    { transform: 'translateX(0) rotate(0) scale(1)',           offset: 0 },
    { transform: 'translateX(-7px) rotate(-9deg) scale(1.06)', offset: 0.16 },
    { transform: 'translateX(7px) rotate(8deg) scale(1.04)',   offset: 0.36 },
    { transform: 'translateX(-6px) rotate(-7deg) scale(1.03)', offset: 0.56 },
    { transform: 'translateX(5px) rotate(5deg) scale(1.02)',   offset: 0.76 },
    { transform: 'translateX(0) rotate(0) scale(1)',           offset: 1 },
  ];
  const JUMP = [
    { transform: 'translateY(0) scale(1,1)',           offset: 0 },
    { transform: 'translateY(4px) scale(1.14,0.86)',   offset: .18 },
    { transform: 'translateY(-62px) scale(0.92,1.12)', offset: .45 },
    { transform: 'translateY(-66px) scale(1,1)',       offset: .60 },
    { transform: 'translateY(0) scale(1.16,0.84)',     offset: .82 },
    { transform: 'translateY(0) scale(0.98,1.03)',     offset: .92 },
    { transform: 'translateY(0) scale(1,1)',           offset: 1 },
  ];
  const SPIN = [{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }];

  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  // reactions target the mascot on whichever screen is currently visible
  const activeScreen  = () => document.querySelector('.screen:not([hidden])');
  const activeMascot  = () => activeScreen()?.querySelector('.nino') || null;
  const activeSpeech  = () => activeScreen()?.querySelector('.speech') || null;

  function speak(text, revertMs) {
    const b = activeSpeech();
    if (!b || !text) return;
    if (b.dataset.base === undefined) b.dataset.base = b.textContent;
    b.textContent = text;
    clearTimeout(b._revert);
    if (revertMs) b._revert = setTimeout(() => { b.textContent = b.dataset.base; }, revertMs);
  }

  const Mascot = {
    react(kind) {                       // 'correct' | 'encouraging'
      const svg = activeMascot();
      if (!svg) return;
      const t = STRINGS[state.targetLang || 'fr'];
      if (kind === 'correct') {
        svg.classList.remove('is-encouraging');
        svg.classList.add('is-correct');
        speak(pick(t.praise), 1100);
        if (!REDUCED) {
          const a = svg.querySelector('.nino-hop').animate(HOP, { duration: 900, easing: 'cubic-bezier(.3,.7,.4,1)' });
          a.onfinish = () => svg.classList.remove('is-correct');
        } else { setTimeout(() => svg.classList.remove('is-correct'), 900); }
      } else {
        svg.classList.add('is-encouraging');
        speak(pick(t.encourage), 1300);
        const done = () => svg.classList.remove('is-encouraging');
        if (!REDUCED) { svg.querySelector('.nino-spin').animate(WOBBLE, { duration: 820, easing: 'ease-in-out' }).onfinish = done; }
        else { setTimeout(done, 820); }
      }
    },
    celebrate() {
      const svg = activeMascot();
      if (!svg) return;
      svg.classList.remove('is-correct', 'is-encouraging');
      svg.classList.add('is-celebrate');
      speak(STRINGS[state.targetLang || 'fr'].reward);
      if (!REDUCED) {
        svg.querySelector('.nino-hop').animate(JUMP, { duration: 1100, easing: 'cubic-bezier(.3,.7,.4,1)' });
        svg.querySelector('.nino-spin').animate(SPIN, { duration: 1100, easing: 'cubic-bezier(.34,.1,.3,1)' });
      }
      spawnConfetti();
    },
    idle() {
      const svg = activeMascot();
      if (svg) svg.classList.remove('is-correct', 'is-encouraging', 'is-celebrate');
    },
  };

  const CONFETTI_COLORS = ['#FF8FA3', '#5FC2E8', '#6FCF97', '#FFC54D', '#B79CE6', '#ffffff'];
  function spawnConfetti(n = 80) {
    if (REDUCED) return;
    let layer = document.querySelector('.confetti-layer');
    if (!layer) { layer = document.createElement('div'); layer.className = 'confetti-layer'; document.body.appendChild(layer); }
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      const size = 7 + Math.random() * 7;
      p.style.cssText =
        `left:${Math.random() * 100}vw;width:${size}px;height:${size * 0.66}px;` +
        `background:${pick(CONFETTI_COLORS)};border-radius:${Math.random() < .5 ? '2px' : '50%'};` +
        `--drift:${(Math.random() * 2 - 1) * 80}px;` +
        `animation-duration:${1400 + Math.random() * 1400}ms;animation-delay:${Math.random() * 350}ms`;
      frag.appendChild(p);
    }
    layer.appendChild(frag);
    clearTimeout(layer._clear);
    layer._clear = setTimeout(() => { layer.innerHTML = ''; }, 2300);
  }

  // Dev-only harness: visit with ?dev to get buttons that trigger each state on
  // the visible mascot, so the feel can be tuned before the round engine exists.
  function initDevHarness() {
    if (!/(?:[?&]|#)dev/.test(location.search + location.hash)) return;
    const bar = document.createElement('div');
    bar.className = 'dev-bar';
    bar.innerHTML =
      '<button data-dev="idle">😐 idle</button>' +
      '<button data-dev="correct">✅ correct</button>' +
      '<button data-dev="encouraging">↩︎ try again</button>' +
      '<button data-dev="celebrate">🎉 celebrate</button>';
    bar.addEventListener('click', (e) => {
      const k = e.target.closest('[data-dev]')?.dataset.dev;
      if (k === 'idle') Mascot.idle();
      else if (k === 'celebrate') Mascot.celebrate();
      else if (k) Mascot.react(k);
    });
    document.body.appendChild(bar);
  }

  // ------------------------------------------------------------------
  // Screen router
  // ------------------------------------------------------------------
  function showScreen(name) {
    // query .screen specifically — NOT [data-screen] — so we never accidentally
    // toggle `hidden` on any other element that happens to carry the attribute
    $$('.screen').forEach((s) => { s.hidden = s.dataset.screen !== name; });
  }

  // ------------------------------------------------------------------
  // Flow
  // ------------------------------------------------------------------
  function chooseLang(lang) {
    unlockAudio();
    state.targetLang = lang;
    document.documentElement.lang = lang;
    renderLevelPicker();
    showScreen('level');
  }

  function renderLevelPicker() {
    const t = STRINGS[state.targetLang];
    $('[data-title]').textContent = t.pickLevel;

    const list = $('[data-level-list]');
    list.innerHTML = '';
    LEVELS.forEach((lvl) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'level-btn';
      btn.innerHTML =
        `<span class="level-btn__emoji">${lvl.emoji}</span>` +
        `<span class="level-btn__label">${lvl.label[state.targetLang]}</span>`;
      btn.addEventListener('click', () => chooseLevel(lvl));
      list.appendChild(btn);
    });
  }

  function chooseLevel(lvl) {
    unlockAudio();
    state.level = lvl;
    startSession();
  }

  function startSession() {
    if (!VOCAB) { loadVocab().then(startSession); return; }   // wait for vocab on first run
    showScreen('play');
    const progress = loadProgress(state.targetLang);          // per-language Leitner state
    session = { items: pickSessionItems(CONFIG.roundsPerSession, progress), index: 0, correctFirstTry: 0, progress };
    nextRound();
  }

  // ------------------------------------------------------------------
  // Round engine (Step 4) — build a round, play audio, handle taps.
  // Session sequencing is placeholder-random here; Step 6 swaps in the SRS.
  // ------------------------------------------------------------------
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const codepointToEmoji = (cp) =>
    cp.split('-').map((h) => String.fromCodePoint(parseInt(h, 16))).join('');

  function buildCard(item) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';

    const img = document.createElement('img');
    img.className = 'card-img';
    img.src = `assets/openmoji/${item.codepoint}.svg`;
    img.alt = '';
    img.draggable = false;
    // until the SVGs are downloaded (Step 8), fall back to the emoji glyph —
    // the same code path shows real SVGs once they exist
    img.addEventListener('error', () => {
      const span = document.createElement('span');
      span.className = 'card-emoji';
      span.textContent = codepointToEmoji(item.codepoint);
      img.replaceWith(span);
    }, { once: true });
    card.appendChild(img);

    if (state.level && state.level.text) {            // Level 3+ (v2): word + article shown
      const loc = item[state.targetLang];
      const label = document.createElement('span');
      label.className = 'card-label';
      label.textContent = (loc.article ? loc.article + ' ' : '') + loc.word;
      card.appendChild(label);
    }

    card.addEventListener('click', () => onCardTap(card, item));
    return card;
  }

  function pickDistractors(target, count, strategy, pool) {
    let candidates =
      strategy === 'cross' ? pool.filter((i) => i.category !== target.category) :
      strategy === 'same'  ? pool.filter((i) => i.category === target.category) :
      pool;                                            // 'mixed'
    if (candidates.length < count) candidates = pool;  // safety net
    return shuffle(candidates).slice(0, count);
  }

  // ---- Spaced repetition: 3-box Leitner (Step 6) ----
  // Box 1 = new/struggling, 2 = learning, 3 = known. First-try correct promotes
  // one box; any miss demotes to Box 1. Selection favours low boxes (mostly 1,
  // sometimes 2, rarely 3). State is per-language in localStorage.
  function pickSessionItems(n, progress) {
    const WEIGHT = { 1: 6, 2: 3, 3: 1 };
    const pool = VOCAB.items.map((item) => ({ item, w: WEIGHT[(progress && progress[item.id]) || 1] }));
    const chosen = [];
    const count = Math.min(n, pool.length);
    for (let k = 0; k < count; k++) {
      let total = 0;
      for (const p of pool) total += p.w;
      let r = Math.random() * total;
      let idx = 0;
      while (idx < pool.length - 1 && (r -= pool[idx].w) > 0) idx++;   // weighted draw…
      chosen.push(pool[idx].item);
      pool.splice(idx, 1);                                             // …without replacement
    }
    return chosen;
  }

  function recordResult(item, firstTry) {
    if (!session) return;
    const box = session.progress[item.id] || 1;
    session.progress[item.id] = firstTry ? Math.min(box + 1, 3) : 1;
    saveProgress(state.targetLang, session.progress);
  }

  function renderCards(cards) {
    const wrap = $('[data-cards]');
    wrap.innerHTML = '';
    wrap.dataset.n = cards.length;
    cards.forEach((item) => wrap.appendChild(buildCard(item)));
  }

  function renderProgress() {
    const wrap = $('[data-progress]');
    if (!wrap || !session) return;
    wrap.innerHTML = '';
    for (let i = 0; i < session.items.length; i++) {
      const dot = document.createElement('span');
      dot.className = 'progress-dot' +
        (i < session.index ? ' is-done' : i === session.index ? ' is-current' : '');
      wrap.appendChild(dot);
    }
  }

  function runRound(target) {
    session.current = target;
    session.answeredWrong = false;
    session.locked = false;
    const lvl = state.level;
    const pool = VOCAB.items.filter((i) => i.id !== target.id);
    const distractors = pickDistractors(target, lvl.cards - 1, lvl.distractors, pool);
    renderCards(shuffle([target, ...distractors]));
    renderProgress();
    Mascot.idle();
    playWord(target);                                  // auto-play on round start
  }

  function nextRound() {
    if (!session) return;
    if (session.index >= session.items.length) { endSession(); return; }
    runRound(session.items[session.index]);
  }

  function onCardTap(cardEl, item) {
    if (!session || session.locked || cardEl.classList.contains('is-dimmed')) return;

    if (item.id === session.current.id) {              // correct
      session.locked = true;
      const firstTry = !session.answeredWrong;
      if (firstTry) session.correctFirstTry++;
      recordResult(session.current, firstTry);
      chime();
      cardEl.classList.add('is-right');
      Mascot.react('correct');
      setTimeout(() => { session.index++; nextRound(); }, 1100);
    } else {                                            // wrong — gentle, always recoverable
      session.answeredWrong = true;
      cardEl.classList.add('is-dimmed');
      softWrong();
      Mascot.react('encouraging');
    }
  }

  function endSession() {
    const total = session.items.length;
    const stars = starsFor(session.correctFirstTry, total);
    session = null;
    showScreen('reward');
    renderReward(stars);
    chime();
    Mascot.celebrate();
  }

  // stars reflect first-try accuracy, with a floor of 1 — every finished
  // session is a win (the celebration is identical regardless)
  function starsFor(firstTry, total) {
    const ratio = total ? firstTry / total : 1;
    return ratio >= 0.7 ? 3 : ratio >= 0.4 ? 2 : 1;
  }

  function renderReward(stars) {
    const wrap = $('[data-stars]');
    if (!wrap) return;
    wrap.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const s = document.createElement('span');
      s.textContent = '⭐';
      s.className = i < stars ? 'star' : 'star is-empty';
      if (i < stars) s.style.animationDelay = (i * 0.18) + 's';
      wrap.appendChild(s);
    }
  }

  // ------------------------------------------------------------------
  // Audio — pre-generated MP3 is the real path (Step 9). Until those exist
  // (or if one is missing) we fall back to Web Speech, exactly as the spec
  // permits. The correct-chime is synthesised with Web Audio (no asset).
  // ------------------------------------------------------------------
  let audioUnlocked = false;
  let actx = null;
  let voices = [];
  let currentSource = null;   // currently-playing word (Web Audio buffer source)
  const wordBuffers = {};     // src -> decoded AudioBuffer (decode once, replay instantly)

  if ('speechSynthesis' in window) {
    const loadVoices = () => { voices = speechSynthesis.getVoices(); };
    loadVoices();
    speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
  }

  // article + word for French ("le chien") so the fallback matches the MP3s
  function phraseFor(item, lang) {
    const loc = item[lang];
    if (lang !== 'fr' || !loc.article) return loc.word;
    return /['’]$/.test(loc.article) ? loc.article + loc.word : loc.article + ' ' + loc.word;
  }

  // iOS/Safari only allow audio that starts inside a user gesture — on the first
  // tap we create + resume the AudioContext (after which word clips, chime, etc.
  // all play through that one graph anytime) and prime the speech fallback.
  function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume?.(); } catch {}
    try { if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } } catch {}
  }

  const pickVoice = (lang) =>
    voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(lang === 'fr' ? 'fr' : 'en')) || null;

  function speakWord(item) {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(phraseFor(item, state.targetLang));
    u.lang = state.targetLang === 'fr' ? 'fr-FR' : 'en-US';
    u.rate = 0.92;
    const v = pickVoice(state.targetLang);
    if (v) u.voice = v;
    try { speechSynthesis.cancel(); speechSynthesis.speak(u); } catch {}
  }

  // Play the word's MP3 through the Web Audio graph (same context as the chime)
  // instead of an <audio> element: one audio path, so no element-reuse crackle and
  // no HTMLMediaElement/AudioContext contention (the source of the static). Decoded
  // buffers are cached, so replays are instant. Falls back to speech on a miss.
  async function playWord(item) {
    if (!item) return;
    try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch {}
    if (!actx) { speakWord(item); return; }           // not unlocked yet
    try { if (actx.state === 'suspended') await actx.resume(); } catch {}
    const src = `assets/audio/${state.targetLang}/${item.id}.mp3`;
    let buffer = wordBuffers[src];
    if (!buffer) {
      try {
        const resp = await fetch(src);
        if (!resp.ok) throw 0;
        buffer = await actx.decodeAudioData(await resp.arrayBuffer());
        wordBuffers[src] = buffer;
      } catch { speakWord(item); return; }            // not generated yet -> Web Speech
    }
    try { if (currentSource) currentSource.stop(); } catch {}   // stop the previous word
    const source = actx.createBufferSource();
    source.buffer = buffer;
    source.connect(actx.destination);
    source.onended = () => { if (currentSource === source) currentSource = null; };
    currentSource = source;
    try { source.start(); } catch {}
  }

  function chime() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const now = actx.currentTime;
      [523.25, 659.25, 783.99].forEach((freq, i) => {  // C5–E5–G5: a happy little arpeggio
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = 'sine'; o.frequency.value = freq;
        o.connect(g); g.connect(actx.destination);
        const t = now + i * 0.1;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
        o.start(t); o.stop(t + 0.34);
      });
    } catch {}
  }

  // gentle, warm downward "boop" for a wrong tap — soft and lower than the
  // chime, deliberately NOT a buzzer (the spec forbids punishing feedback)
  function softWrong() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const now = actx.currentTime;
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(360, now);
      o.frequency.exponentialRampToValueAtTime(250, now + 0.18);
      o.connect(g); g.connect(actx.destination);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.15, now + 0.03);   // gentle, a touch under the chime (0.18)
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      o.start(now); o.stop(now + 0.32);
    } catch {}
  }

  async function loadVocab() {
    if (VOCAB) return VOCAB;
    const res = await fetch('vocab.json');
    VOCAB = await res.json();
    return VOCAB;
  }

  // ------------------------------------------------------------------
  // Init
  // ------------------------------------------------------------------
  function init() {
    mountMascots();
    initMascotIdle();
    initDevHarness();

    $$('[data-lang]').forEach((btn) =>
      btn.addEventListener('click', () => chooseLang(btn.dataset.lang)));

    $$('[data-nav]').forEach((btn) =>
      btn.addEventListener('click', () => showScreen(btn.dataset.nav)));

    // reward "again" button — re-runs a session (wired fully in Step 5)
    const again = $('[data-action="again"]');
    if (again) again.addEventListener('click', startSession);

    // replay the current word: speaker button, or by tapping Nino on the play screen
    const replay = () => { unlockAudio(); if (session) playWord(session.current); };
    const replayBtn = $('[data-replay]');
    if (replayBtn) replayBtn.addEventListener('click', replay);
    const playMascot = document.querySelector('[data-screen="play"] [data-mascot]');
    if (playMascot) { playMascot.style.cursor = 'pointer'; playMascot.addEventListener('click', replay); }

    loadVocab();              // preload so the first round can auto-play within the tap gesture
    showScreen('home');
  }

  document.addEventListener('DOMContentLoaded', init);

  // expose a tiny surface for console poking during development
  window.__nino = {
    state, CONFIG, LEVELS, loadProgress, saveProgress, Mascot, spawnConfetti,
    resetProgress: (lang) => saveProgress(lang || state.targetLang || 'fr', {}),
  };
})();
