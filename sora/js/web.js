(() => {
  // native/audio.js
  var SETTINGS_KEY = "sora-audio-v1";
  var defaults = { enabled: true, music: 30, effects: 55 };
  var midi = (note) => 440 * 2 ** ((note - 69) / 12);
  var beatDuration = 60 / 72;
  var harmony = [
    [48, 55, 59, 64],
    [45, 52, 55, 60],
    [41, 48, 52, 57],
    [43, 50, 55, 59],
    [48, 55, 59, 64],
    [45, 52, 55, 60],
    [41, 48, 52, 57],
    [43, 50, 57, 59],
    [40, 47, 55, 59],
    [45, 52, 55, 60],
    [41, 48, 52, 57],
    [43, 50, 55, 59],
    [48, 55, 59, 64],
    [41, 48, 52, 57],
    [43, 50, 55, 59],
    [48, 55, 59, 64]
  ];
  var melody = [
    [76, null, 79, 74],
    [72, null, 71, null],
    [69, 72, null, 76],
    [74, null, null, null],
    [79, null, 76, 74],
    [72, null, 67, null],
    [69, null, 72, 76],
    [74, null, 71, null],
    [71, null, 74, 79],
    [76, null, 72, null],
    [69, 72, null, 76],
    [74, null, 79, null],
    [76, null, 74, 72],
    [69, null, 72, null],
    [71, 74, null, 67],
    [72, null, null, null]
  ];
  function installAudio() {
    let settings = { ...defaults };
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
      if (saved && typeof saved.enabled === "boolean") settings.enabled = saved.enabled;
      for (const key of ["music", "effects"]) {
        if (Number.isFinite(saved == null ? void 0 : saved[key])) settings[key] = Math.max(0, Math.min(100, saved[key]));
      }
    } catch {
    }
    let context, musicBus, effectsBus, timer, nextBeat = 0, step = 0;
    let background = document.hidden, unlocked = false, lastEffect = -Infinity;
    const voices = /* @__PURE__ */ new Map();
    let raining = window.soraRainActive === true, rainSource = null, rainBuffer = null;
    const fadingRain = /* @__PURE__ */ new Set();
    const button = document.createElement("button");
    button.id = "audio-settings";
    button.type = "button";
    button.setAttribute("aria-label", "\u97F3\u306E\u8A2D\u5B9A");
    button.setAttribute("aria-haspopup", "dialog");
    document.querySelector("#speed").insertAdjacentElement("afterend", button);
    const dialog = document.createElement("dialog");
    dialog.id = "audio-dialog";
    dialog.className = "audio-dialog";
    dialog.setAttribute("aria-labelledby", "audio-title");
    dialog.innerHTML = `<div class="sheet-heading"><h2 id="audio-title">\u266B \u97F3\u306E\u8A2D\u5B9A</h2><button id="audio-close" aria-label="\u97F3\u306E\u8A2D\u5B9A\u3092\u9589\u3058\u308B">\xD7</button></div>
    <label class="audio-switch"><span>\u97F3\u3092\u9CF4\u3089\u3059</span><input id="audio-enabled" type="checkbox"></label>
    <label class="audio-volume" for="audio-music"><span>BGM</span><output id="audio-music-value"></output><input id="audio-music" type="range" min="0" max="100" step="1"></label>
    <label class="audio-volume" for="audio-effects"><span>\u52B9\u679C\u97F3</span><output id="audio-effects-value"></output><input id="audio-effects" type="range" min="0" max="100" step="1"></label>
    <p class="audio-note">\u8A2D\u5B9A\u306F\u81EA\u52D5\u4FDD\u5B58\u3055\u308C\u307E\u3059\u3002\u30A2\u30D7\u30EA\u3092\u96E2\u308C\u308B\u3068\u97F3\u3082\u6B62\u307E\u308A\u307E\u3059\u3002</p>`;
    document.body.append(dialog);
    const enabled = dialog.querySelector("#audio-enabled");
    const sliders = Object.fromEntries(["music", "effects"].map((key) => [key, dialog.querySelector("#audio-" + key)]));
    function updateControls() {
      enabled.checked = settings.enabled;
      button.textContent = settings.enabled ? "\u266B \u97F3" : "\u266B OFF";
      button.dataset.audioState = !settings.enabled ? "off" : background ? "suspended" : (context == null ? void 0 : context.state) || "ready";
      for (const key of ["music", "effects"]) {
        sliders[key].value = settings[key];
        sliders[key].disabled = !settings.enabled;
        dialog.querySelector("#audio-" + key + "-value").textContent = settings[key] + "%";
      }
    }
    function saveSettings() {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      } catch {
      }
      updateControls();
    }
    function disconnectRain(voice) {
      if (voice.cleaned) return;
      voice.cleaned = true;
      voice.source.disconnect();
      voice.filter.disconnect();
      voice.gain.disconnect();
    }
    function stopRainAudio(immediate = false) {
      const voice = rainSource;
      rainSource = null;
      if (voice) {
        if (!immediate && (context == null ? void 0 : context.state) === "running") {
          const now = context.currentTime, gain = voice.gain.gain;
          if (typeof gain.cancelAndHoldAtTime === "function") gain.cancelAndHoldAtTime(now);
          else {
            const value = gain.value;
            gain.cancelScheduledValues(now);
            gain.setValueAtTime(value, now);
          }
          gain.linearRampToValueAtTime(0, now + 0.5);
          fadingRain.add(voice);
          voice.source.onended = () => {
            fadingRain.delete(voice);
            disconnectRain(voice);
          };
          voice.source.stop(now + 0.5);
        } else {
          try {
            voice.source.stop();
          } catch {
          }
          disconnectRain(voice);
        }
      }
      if (immediate) {
        for (const fading of fadingRain) {
          try {
            fading.source.stop();
          } catch {
          }
          disconnectRain(fading);
        }
        fadingRain.clear();
      }
    }
    function updateRainAudio() {
      const canPlay = raining && settings.enabled && settings.effects > 0 && !background && !document.hidden && (context == null ? void 0 : context.state) === "running";
      if (!canPlay) {
        stopRainAudio();
        return;
      }
      if (rainSource) return;
      if (!rainBuffer) {
        rainBuffer = context.createBuffer(2, context.sampleRate * 4, context.sampleRate);
        for (let channel = 0; channel < 2; channel++) {
          const data = rainBuffer.getChannelData(channel);
          let low = 0;
          for (let i = 0; i < data.length; i++) {
            const white = Math.random() * 2 - 1;
            low = low * 0.97 + white * 0.03;
            data[i] = white * 0.45 + low * 2.2;
          }
        }
      }
      const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
      source.buffer = rainBuffer;
      source.loop = true;
      filter.type = "lowpass";
      filter.frequency.value = 2600;
      filter.Q.value = 0.45;
      gain.gain.setValueAtTime(0, context.currentTime);
      gain.gain.setTargetAtTime(0.5, context.currentTime, 0.18);
      source.connect(filter).connect(gain).connect(effectsBus);
      source.start();
      rainSource = { source, filter, gain };
    }
    document.addEventListener("sora:rain", (e) => {
      raining = e.detail === true;
      updateRainAudio();
    });
    function applyVolume() {
      if (!context) return;
      musicBus.gain.setTargetAtTime(settings.music / 100 * 0.65, context.currentTime, 0.08);
      effectsBus.gain.setTargetAtTime(settings.effects / 100 * 0.45, context.currentTime, 0.02);
      updateRainAudio();
    }
    function stopVoices(kind) {
      for (const [source, voiceKind] of voices) {
        if (!kind || kind === voiceKind) {
          try {
            source.stop();
          } catch {
          }
          voices.delete(source);
        }
      }
    }
    function tone(note, time, duration, level, kind = "music", wave = "sine", pan = 0) {
      if (!context || context.state !== "running") return;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      const stereo = context.createStereoPanner();
      oscillator.type = wave;
      oscillator.frequency.value = midi(note);
      envelope.gain.setValueAtTime(0, time);
      envelope.gain.linearRampToValueAtTime(level, time + (kind === "music" ? 0.04 : 8e-3));
      envelope.gain.exponentialRampToValueAtTime(1e-4, time + duration);
      stereo.pan.value = pan;
      oscillator.connect(envelope).connect(stereo).connect(kind === "music" ? musicBus : effectsBus);
      voices.set(oscillator, kind);
      oscillator.onended = () => {
        voices.delete(oscillator);
        oscillator.disconnect();
        envelope.disconnect();
        stereo.disconnect();
      };
      oscillator.start(time);
      oscillator.stop(time + duration + 0.02);
    }
    function scheduleMusic() {
      if (background || !settings.enabled || (context == null ? void 0 : context.state) !== "running") return;
      while (nextBeat < context.currentTime + 0.3) {
        const bar = Math.floor(step / 4) % harmony.length;
        const beat = step % 4;
        if (settings.music > 0) {
          if (beat === 0) {
            harmony[bar].forEach((note2, i) => tone(note2 + 12, nextBeat + i * 0.025, beatDuration * 4.5, 0.045, "music", "sine", (i - 1.5) * 0.2));
            tone(harmony[bar][0], nextBeat, beatDuration * 3.5, 0.09);
          }
          const note = melody[bar][beat];
          if (note !== null) {
            tone(note, nextBeat, 1.25, 0.12, "music", "sine", 0.15);
            tone(note + 12, nextBeat + 8e-3, 0.45, 0.018, "music", "sine", -0.12);
          }
          if (beat === 2) tone(harmony[bar][2] + 12, nextBeat, 0.9, 0.035, "music", "triangle", -0.25);
        }
        step++;
        nextBeat += beatDuration;
      }
    }
    async function startAudio() {
      unlocked = true;
      if (!settings.enabled || background || document.hidden) return;
      try {
        if (!context) {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (!AudioContextClass) {
            button.hidden = true;
            return;
          }
          context = new AudioContextClass();
          musicBus = context.createGain();
          effectsBus = context.createGain();
          const compressor = context.createDynamicsCompressor();
          compressor.threshold.value = -12;
          compressor.ratio.value = 4;
          musicBus.connect(compressor);
          effectsBus.connect(compressor);
          compressor.connect(context.destination);
          applyVolume();
          context.addEventListener("statechange", updateControls);
        }
        await context.resume();
        if (background || !settings.enabled) {
          suspendAudio();
          return;
        }
        if (!timer) {
          nextBeat = context.currentTime + 0.06;
          scheduleMusic();
          timer = setInterval(scheduleMusic, 100);
        }
        updateRainAudio();
        updateControls();
      } catch {
        updateControls();
      }
    }
    function suspendAudio() {
      stopRainAudio(true);
      clearInterval(timer);
      timer = null;
      stopVoices();
      if (context && context.state !== "closed") context.suspend().catch(() => {
      });
      step = Math.ceil(step / 4) * 4;
      updateControls();
    }
    function effect(name) {
      if (!settings.enabled || !settings.effects || background || (context == null ? void 0 : context.state) !== "running") return;
      lastEffect = performance.now();
      const patterns = {
        coin: [[96, 0, 0.14, 0.18, "triangle"], [108, 0.015, 0.42, 0.09, "sine"], [103, 0.08, 0.3, 0.11, "triangle"], [115, 0.11, 0.42, 0.055, "sine"]],
        "santa-bells": [[100, 0, 0.14, 0.13, "sine"], [107, 0.04, 0.2, 0.09, "sine"], [100, 0.23, 0.14, 0.13, "sine"], [112, 0.28, 0.25, 0.065, "sine"], [104, 0.48, 0.22, 0.1, "sine"], [111, 0.52, 0.3, 0.07, "sine"]],
        tap: [[72, 0, 0.07, 0.11]],
        build: [[72, 0, 0.22, 0.18], [76, 0.08, 0.25, 0.16], [79, 0.16, 0.38, 0.15]],
        floor: [[60, 0, 0.2, 0.16], [67, 0.1, 0.22, 0.17], [72, 0.2, 0.35, 0.16], [76, 0.3, 0.45, 0.13]],
        // Two muted tool taps followed by a bright completion chime.
        repair: [[50, 0, 0.065, 0.26, "triangle"], [50, 0.14, 0.065, 0.22, "triangle"], [88, 0.32, 0.35, 0.12, "sine"], [100, 0.35, 0.5, 0.065, "sine"]],
        lift: [[67, 0, 0.17, 0.16], [72, 0.1, 0.2, 0.16], [79, 0.2, 0.4, 0.15]],
        remove: [[67, 0, 0.16, 0.14], [60, 0.1, 0.23, 0.12]],
        premium: [[72, 0, 0.25, 0.15], [76, 0.12, 0.25, 0.14], [79, 0.24, 0.3, 0.14], [84, 0.4, 0.7, 0.14]],
        // A dedicated celebratory brass-like phrase for completing the rooftop park.
        fanfare: [[67, 0, 0.17, 0.22], [67, 0.22, 0.14, 0.22], [67, 0.42, 0.14, 0.22], [72, 0.68, 0.4, 0.24], [76, 1.15, 0.2, 0.22], [79, 1.43, 0.6, 0.24], [84, 2.1, 1.65, 0.25], [72, 2.1, 1.65, 0.16], [76, 2.1, 1.65, 0.16], [79, 2.1, 1.65, 0.16]],
        error: [[62, 0, 0.12, 0.1], [59, 0.12, 0.16, 0.08]]
      };
      for (const [note, offset, duration, level, wave] of patterns[name] || patterns.tap) {
        tone(note, context.currentTime + 0.01 + offset, duration, level, "effects", wave || (name === "fanfare" ? "triangle" : "sine"));
      }
    }
    enabled.addEventListener("change", () => {
      settings.enabled = enabled.checked;
      saveSettings();
      if (settings.enabled) startAudio();
      else suspendAudio();
    });
    for (const key of ["music", "effects"]) {
      sliders[key].addEventListener("input", () => {
        settings[key] = Number(sliders[key].value);
        if (key === "music" && settings.music === 0) stopVoices("music");
        applyVolume();
        saveSettings();
      });
    }
    sliders.effects.addEventListener("change", () => effect("build"));
    button.addEventListener("click", () => dialog.showModal());
    dialog.querySelector("#audio-close").addEventListener("click", () => dialog.close());
    document.addEventListener("pointerdown", () => {
      startAudio();
    }, { passive: true });
    document.addEventListener("sora:sound", (e) => effect(e.detail));
    document.addEventListener("click", (e) => {
      const target = e.target.closest("button");
      if (target && !target.disabled && performance.now() - lastEffect > 100) effect("tap");
    });
    function setBackground(value) {
      background = value;
      if (background) suspendAudio();
      else if (unlocked) startAudio();
    }
    document.addEventListener("visibilitychange", () => setBackground(document.hidden));
    window.addEventListener("pagehide", () => setBackground(true));
    window.addEventListener("pageshow", () => setBackground(document.hidden));
    updateControls();
  }

  // ../../Codex/2026-10-25/w/outputs/sora-android-setup/web-entry.mjs
  var root = document.documentElement;
  var header = document.querySelector("#clock").closest("header");
  var main = document.querySelector("body > main");
  var frame = 0;
  function measure() {
    var _a2;
    frame = 0;
    const values = { "--app-height": ((_a2 = window.visualViewport) == null ? void 0 : _a2.height) || innerHeight, "--app-header-height": header.getBoundingClientRect().bottom, "--app-content-height": main.getBoundingClientRect().height };
    for (const [key, value] of Object.entries(values)) {
      const next = Math.round(value * 100) / 100 + "px";
      if (root.style.getPropertyValue(key) !== next) root.style.setProperty(key, next);
    }
  }
  function requestMeasure() {
    if (!frame) frame = requestAnimationFrame(measure);
  }
  var observer = new ResizeObserver(requestMeasure);
  [header, main, document.querySelector(".site-header")].forEach((e) => observer.observe(e));
  addEventListener("resize", requestMeasure);
  addEventListener("pageshow", requestMeasure);
  var _a;
  (_a = window.visualViewport) == null ? void 0 : _a.addEventListener("resize", requestMeasure);
  measure();
  installAudio();
})();
