    let THREE;
    let OrbitControls;
    let RAPIER;

    const TUNING = {
      fixedDt: 1 / 60,
      gravity: -9.81,
      stoneFriction: 3.0,
      stoneRestitution: 0.0,
      stoneDensity: 20000.0,
      groundFriction: 2.0,
      groundRestitution: 0.01,
      spawnY: 2.3,
      spawnRange: 1.8,
      minStoneSize: 0.5,
      maxStoneSize: 1.2,
      maxAspectRatio: 2.4,
      dragRotateSpeed: 0.012,
      dragProbeShrink: 1.0,
      gentleDurationMin: 1.2,
      gentleDurationMax: 1.9,
      gentleGravityScale: 0.035,
      gentleMaxDownSpeed: 0.5,
      topPolar: 0.01,
      sidePolar: Math.PI / 2,
      viewTweenSeconds: 0.32,
      viewEasing: (t) => 1 - Math.pow(1 - t, 3),
      touchLongPressMs: 320,
      touchMoveThresholdPx: 12,
      touchDoubleTapMs: 280,
      touchDoubleTapDistancePx: 26,
    };

    const ENV = {
      wind: 0,
      wave: 0,
    };
    const STAGE = {
      radius: 34,
      thickness: 0.1,
      inset: 1.2,
    };


    const SOUND = {
      enabled: true,
      mode: "synth", // "synth" | "file" (swap later without changing call sites)
      files: {
        place: "audio/place.wav",
        collapse: "audio/collapse.wav",
        stoneHit: "snd/stoneplace.wav",
        inactiveHits: ["snd/stonehit1.wav", "snd/stonehit2.wav", "snd/stonehit3.wav"],
      },
      inactiveHitCooldownSec: 0.06,
      activeHitCooldownSec: 0.08,
    };

    const app = document.getElementById("app");
    const stackCountEl = document.getElementById("stackCount");
    const stackHeightEl = document.getElementById("stackHeight");
    const gameOverOverlayEl = document.getElementById("gameOverOverlay");
    const stackAgainBtn = document.getElementById("stackAgainBtn");
    const startOverlayEl = document.getElementById("startOverlay");
    const beginBtn = document.getElementById("beginBtn");
    const giveUpBtn = document.getElementById("giveUpBtn");
    const hudBottomRightEl = document.getElementById("hudBottomRight");
    const hudToggleBtn = document.getElementById("hudToggleBtn");
    const langToggleBtn = document.getElementById("langToggleBtn");
    const stabilityWrapEl = document.getElementById("stabilityWrap");
    const stabilityFillEl = document.getElementById("stabilityFill");
    const stabilityValueEl = document.getElementById("stabilityValue");

    let scene;
    let camera;
    let renderer;
    let controls;
    let world;

    let groundMesh;
    let groundBody;
    let groundCollider;

    let activeStone = null;
    let stackCount = 0;
    let gameOver = false;
    let gameStarted = false;
    let spawnedStoneCount = 0;
    let lastReleasedPos = null;
    let stabilityTargetStone = null;

    let raycaster;
    let pointerNdc;
    let dragPlane;
    let dragHit;
    let dragOffset;

    let isGrabbing = false;
    let pointerIsDown = false;
    let grabMode = "none"; // none | move | rotate
    let lastPointerX = 0;
    let lastPointerY = 0;
    let activePointerId = null;
    let dragProbeBody = null;
    let dragProbeCollider = null;
    let activeTouchGesture = null;
    let lastTouchTap = null;

    const dynamicStones = [];
    const stones = [];
    const riverFlowMaterials = [];

    let viewTween = null;
    let audioCtx = null;
    let audioMasterGain = null;
    let noiseBuffer = null;
    const audioFiles = {};
    let lastInactiveHitSfxTs = 0;
    let prevInactiveContactPairs = new Set();
    let lastActiveHitSfxTs = 0;
    let textureLoader = null;
    let texStoneNormal = null;
    let texStoneAlbedo = null;
    let texStoneRoughness = null;
    let texStoneAO = null;
    let texStoneHeight = null;
    let texGroundNormal = null;
    let texGroundRoughness = null;
    let texGroundAlbedo = null;
    let texGroundAO = null;
    let texGroundHeight = null;
    let texRiverNormal = null;
    let texRiverRoughness = null;
    let texRiverAlbedo = null;
    let texRiverAO = null;
    let texRiverHeight = null;

    const I18N = {
      en: {
        stackCountLabel: "stackCount",
        heightLabel: "height",
        stabilityLabel: "stability",
        giveUpBtn: "Give Up",
        controlsTitle: "Controls",
        controlsEmptyTitle: "Empty Space",
        controlsEmptyPan: "LMB Drag -- Pan Camera",
        controlsEmptyRotate: "MMB Drag -- Rotate Camera",
        controlsStoneTitle: "Active Stone",
        controlsStoneMove: "LMB Drag -- Move Stone",
        controlsStoneRotate: "Shift + LMB Drag -- Rotate Stone",
        controlsTouchTitle: "Mobile",
        controlsTouchPan: "Drag on empty space -- Pan Camera",
        controlsTouchRotate: "Long Press + Drag on empty space -- Rotate Camera",
        controlsTouchMove: "Drag on stone -- Move Stone",
        controlsTouchStoneRotate: "Long Press + Drag on stone -- Rotate Stone",
        controlsTouchDrop: "Double Tap stone -- Drop Stone",
        controlsOtherTitle: "Other",
        controlsOtherDrop: "Space -- Drop Stone",
        controlsOtherTop: "1 -- Top View",
        controlsOtherSide: "2 -- Side View",
        gameOverTitle: "GAME OVER",
        stackAgainBtn: "Stack Again",
        beginBtn: "Begin Stacking",
        hudToggleBtn: "Controls",
        langToggleBtn: "日本語",
      },
      ja: {
        stackCountLabel: "積み数",
        heightLabel: "高さ",
        stabilityLabel: "安定度",
        giveUpBtn: "ギブアップ",
        controlsTitle: "操作",
        controlsEmptyTitle: "何もない場所",
        controlsEmptyPan: "左ドラッグ -- カメラ平行移動",
        controlsEmptyRotate: "中ドラッグ -- カメラ回転",
        controlsStoneTitle: "アクティブな石",
        controlsStoneMove: "左ドラッグ -- 石を移動",
        controlsStoneRotate: "Shift + 左ドラッグ -- 石を回転",
        controlsTouchTitle: "スマホ",
        controlsTouchPan: "何もない場所をドラッグ -- カメラ平行移動",
        controlsTouchRotate: "何もない場所を長押し後ドラッグ -- カメラ旋回",
        controlsTouchMove: "石をドラッグ -- 石を移動",
        controlsTouchStoneRotate: "石を長押し後ドラッグ -- 石を回転",
        controlsTouchDrop: "石をダブルタップ -- 石を手放す",
        controlsOtherTitle: "その他",
        controlsOtherDrop: "Space -- 石を落とす",
        controlsOtherTop: "1 -- 真上視点",
        controlsOtherSide: "2 -- 側面視点",
        gameOverTitle: "ゲームオーバー",
        stackAgainBtn: "もう一度積む",
        beginBtn: "積み始める",
        hudToggleBtn: "操作",
        langToggleBtn: "English",
      },
    };

    let currentLang = localStorage.getItem("saiLang") || "en";

    function rand(min, max) {
      return min + Math.random() * (max - min);
    }

    function clamp(v, lo, hi) {
      return Math.max(lo, Math.min(hi, v));
    }

    function clearTouchGestureTimer() {
      if (!activeTouchGesture || !activeTouchGesture.longPressTimer) return;
      clearTimeout(activeTouchGesture.longPressTimer);
      activeTouchGesture.longPressTimer = null;
    }

    function isMobileHudMode() {
      return window.matchMedia("(pointer: coarse)").matches || window.innerWidth <= 900;
    }

    function setHudCollapsed(collapsed) {
      if (!hudBottomRightEl) return;
      hudBottomRightEl.classList.toggle("is-collapsed", !!collapsed);
    }

    function updateHudLayoutForViewport() {
      if (!hudBottomRightEl) return;
      if (isMobileHudMode()) setHudCollapsed(true);
      else setHudCollapsed(false);
    }

    function toggleHudPanel() {
      if (!hudBottomRightEl || !isMobileHudMode()) return;
      hudBottomRightEl.classList.toggle("is-collapsed");
    }

    function panCameraByTouchDelta(dx, dy) {
      const offset = camera.position.clone().sub(controls.target);
      const distance = Math.max(0.001, offset.length());
      const worldPerPixel = (2 * distance * Math.tan((camera.fov * Math.PI / 180) * 0.5)) / Math.max(1, renderer.domElement.clientHeight);
      const forward = new THREE.Vector3();
      const right = new THREE.Vector3();
      const up = new THREE.Vector3();
      camera.getWorldDirection(forward);
      right.crossVectors(forward, camera.up).normalize();
      up.copy(camera.up).normalize();
      const move = right.multiplyScalar(-dx * worldPerPixel).add(up.multiplyScalar(dy * worldPerPixel));
      camera.position.add(move);
      controls.target.add(move);
      controls.update();
    }

    function rotateCameraByTouchDelta(dx, dy) {
      const offset = camera.position.clone().sub(controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      spherical.theta -= dx * 0.01;
      spherical.phi -= dy * 0.01;
      spherical.phi = clamp(spherical.phi, 0.08, controls.maxPolarAngle);
      offset.setFromSpherical(spherical);
      camera.position.copy(controls.target).add(offset);
      camera.lookAt(controls.target);
      controls.update();
    }

    function applyLanguage(lang) {
      const dict = I18N[lang] || I18N.en;
      currentLang = lang === "ja" ? "ja" : "en";
      localStorage.setItem("saiLang", currentLang);

      document.documentElement.lang = currentLang === "ja" ? "ja" : "en";

      for (const key of Object.keys(dict)) {
        const el = document.getElementById(key);
        if (!el) continue;
        el.textContent = dict[key];
      }
    }

    function toggleLanguage() {
      applyLanguage(currentLang === "en" ? "ja" : "en");
    }

    function ensureAudio() {
      if (!SOUND.enabled) return false;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      if (!audioCtx) {
        audioCtx = new AC();
        audioMasterGain = audioCtx.createGain();
        audioMasterGain.gain.value = 0.4;
        audioMasterGain.connect(audioCtx.destination);
      }
      if (audioCtx.state === "suspended") {
        audioCtx.resume();
      }
      if (!noiseBuffer) {
        noiseBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.35, audioCtx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i += 1) {
          data[i] = Math.random() * 2 - 1;
        }
      }
      return true;
    }

    function playFileSound(name, intensity) {
      const src = SOUND.files[name];
      if (!src) return;
      if (!audioFiles[name]) {
        audioFiles[name] = new Audio(src);
        audioFiles[name].preload = "auto";
      }
      const base = audioFiles[name];
      const a = base.cloneNode();
      a.volume = clamp(0.35 * intensity, 0, 1);
      a.playbackRate = clamp(0.95 + Math.random() * 0.1, 0.7, 1.3);
      a.play().catch(() => {});
    }

    function playSynthPlace(intensity) {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(560, now);
      osc.frequency.exponentialRampToValueAtTime(310, now + 0.07);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.14 * intensity, now + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.085);
      osc.connect(g).connect(audioMasterGain);
      osc.start(now);
      osc.stop(now + 0.09);
    }

    function playSynthCollapse(intensity) {
      const now = audioCtx.currentTime;
      const noise = audioCtx.createBufferSource();
      noise.buffer = noiseBuffer;
      const bp = audioCtx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(520, now);
      bp.Q.value = 0.8;
      const ng = audioCtx.createGain();
      ng.gain.setValueAtTime(0.0001, now);
      ng.gain.exponentialRampToValueAtTime(0.22 * intensity, now + 0.012);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
      noise.connect(bp).connect(ng).connect(audioMasterGain);
      noise.start(now);
      noise.stop(now + 0.25);

      const thud = audioCtx.createOscillator();
      const tg = audioCtx.createGain();
      thud.type = "sine";
      thud.frequency.setValueAtTime(120, now);
      thud.frequency.exponentialRampToValueAtTime(55, now + 0.16);
      tg.gain.setValueAtTime(0.0001, now);
      tg.gain.exponentialRampToValueAtTime(0.16 * intensity, now + 0.01);
      tg.gain.exponentialRampToValueAtTime(0.0001, now + 0.19);
      thud.connect(tg).connect(audioMasterGain);
      thud.start(now);
      thud.stop(now + 0.2);
    }

    function playGameSound(name, intensity = 1) {
      if (!SOUND.enabled) return;
      const i = clamp(intensity, 0.1, 1.8);
      if (SOUND.mode === "file") {
        playFileSound(name, i);
        return;
      }
      if (!ensureAudio()) return;
      if (name === "place") playSynthPlace(i);
      else if (name === "collapse") playSynthCollapse(i);
    }

    function playActiveStoneHitSfx(intensity = 1) {
      if (!SOUND.enabled) return;
      const now = performance.now() / 1000;
      if (now - lastActiveHitSfxTs < SOUND.activeHitCooldownSec) return;
      lastActiveHitSfxTs = now;
      playFileSound("stoneHit", clamp(intensity, 0.45, 1.2));
    }

    function playInactiveStoneHitSfx(intensity = 1) {
      if (!SOUND.enabled) return;
      const list = SOUND.files.inactiveHits;
      if (!list || !list.length) return;
      const idx = Math.floor(Math.random() * list.length);
      const pick = list[idx];
      if (!pick) return;

      const key = `inactive_${idx}`;
      if (!audioFiles[key]) {
        audioFiles[key] = new Audio(pick);
        audioFiles[key].preload = "auto";
      }
      const base = audioFiles[key];
      const a = base.cloneNode();
      a.volume = clamp(0.34 * intensity, 0, 1);
      a.playbackRate = clamp(0.92 + Math.random() * 0.16, 0.75, 1.35);
      a.play().catch(() => {});
    }

    function detectInactiveStoneCollisionSfx() {
      if (gameOver || !gameStarted) return;

      const currentPairs = new Set();
      let bestNewImpact = 0;
      const nowSec = performance.now() / 1000;

      // Robust pair check: overlap by AABB + relative speed (no Rapier query dependency).
      for (let i = 0; i < stones.length; i += 1) {
        const a = stones[i];
        if (!a || a.isActive || !a.body || !a.shapeData) continue;
        const pa = a.body.translation();
        const ha = a.shapeData.halfExtents;
        const av = a.body.linvel ? a.body.linvel() : { x: 0, y: 0, z: 0 };

        for (let j = i + 1; j < stones.length; j += 1) {
          const b = stones[j];
          if (!b || b.isActive || !b.body || !b.shapeData) continue;
          const pb = b.body.translation();
          const hb = b.shapeData.halfExtents;
          const bv = b.body.linvel ? b.body.linvel() : { x: 0, y: 0, z: 0 };

          const dx = Math.abs(pa.x - pb.x);
          const dy = Math.abs(pa.y - pb.y);
          const dz = Math.abs(pa.z - pb.z);
          const sx = ha.x + hb.x + 0.03;
          const sy = ha.y + hb.y + 0.03;
          const sz = ha.z + hb.z + 0.03;
          const touching = dx <= sx && dy <= sy && dz <= sz;
          if (!touching) continue;

          const pairKey = `${i}_${j}`;
          currentPairs.add(pairKey);

          const rel = Math.hypot(av.x - bv.x, av.y - bv.y, av.z - bv.z);
          const speedA = Math.hypot(av.x, av.y, av.z);
          const speedB = Math.hypot(bv.x, bv.y, bv.z);
          const impactScore = Math.max(rel, speedA * 0.7, speedB * 0.7);

          if (!prevInactiveContactPairs.has(pairKey)) {
            if (impactScore > bestNewImpact) bestNewImpact = impactScore;
          }
        }
      }

      prevInactiveContactPairs = currentPairs;
      if (bestNewImpact < 0.02) return;

      if (nowSec - lastInactiveHitSfxTs < SOUND.inactiveHitCooldownSec) return;
      lastInactiveHitSfxTs = nowSec;
      playInactiveStoneHitSfx(clamp(bestNewImpact / 1.2, 0.45, 1.3));
    }

    function getExternalTexture(cacheName, path, repeatX = 1, repeatY = 1) {
      if (!THREE) return null;
      if (!textureLoader) textureLoader = new THREE.TextureLoader();
      if (cacheName === "stoneNormal" && texStoneNormal) return texStoneNormal;
      if (cacheName === "stoneAlbedo" && texStoneAlbedo) return texStoneAlbedo;
      if (cacheName === "stoneRoughness" && texStoneRoughness) return texStoneRoughness;
      if (cacheName === "stoneAO" && texStoneAO) return texStoneAO;
      if (cacheName === "stoneHeight" && texStoneHeight) return texStoneHeight;
      if (cacheName === "groundNormal" && texGroundNormal) return texGroundNormal;
      if (cacheName === "groundRoughness" && texGroundRoughness) return texGroundRoughness;
      if (cacheName === "groundAlbedo" && texGroundAlbedo) return texGroundAlbedo;
      if (cacheName === "groundAO" && texGroundAO) return texGroundAO;
      if (cacheName === "groundHeight" && texGroundHeight) return texGroundHeight;
      if (cacheName === "riverNormal" && texRiverNormal) return texRiverNormal;
      if (cacheName === "riverRoughness" && texRiverRoughness) return texRiverRoughness;
      if (cacheName === "riverAlbedo" && texRiverAlbedo) return texRiverAlbedo;
      if (cacheName === "riverAO" && texRiverAO) return texRiverAO;
      if (cacheName === "riverHeight" && texRiverHeight) return texRiverHeight;

      const tex = textureLoader.load(
        path,
        undefined,
        undefined,
        () => { console.warn(`[texture] failed to load: ${path}`); }
      );
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeatX, repeatY);
      tex.anisotropy = 8;

      // Color textures use sRGB, normal/roughness/ao/height use linear.
      if (cacheName === "stoneAlbedo" || cacheName === "groundAlbedo" || cacheName === "riverAlbedo") {
        if ("colorSpace" in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      } else if (
        cacheName === "stoneNormal" ||
        cacheName === "stoneRoughness" ||
        cacheName === "stoneAO" ||
        cacheName === "stoneHeight" ||
        cacheName === "groundNormal" ||
        cacheName === "groundRoughness" ||
        cacheName === "groundAO" ||
        cacheName === "groundHeight" ||
        cacheName === "riverNormal" ||
        cacheName === "riverRoughness" ||
        cacheName === "riverAO" ||
        cacheName === "riverHeight"
      ) {
        if ("colorSpace" in tex && THREE.NoColorSpace) tex.colorSpace = THREE.NoColorSpace;
      }

      if (cacheName === "stoneNormal") texStoneNormal = tex;
      else if (cacheName === "stoneAlbedo") texStoneAlbedo = tex;
      else if (cacheName === "stoneRoughness") texStoneRoughness = tex;
      else if (cacheName === "stoneAO") texStoneAO = tex;
      else if (cacheName === "stoneHeight") texStoneHeight = tex;
      else if (cacheName === "groundNormal") texGroundNormal = tex;
      else if (cacheName === "groundRoughness") texGroundRoughness = tex;
      else if (cacheName === "groundAlbedo") texGroundAlbedo = tex;
      else if (cacheName === "groundAO") texGroundAO = tex;
      else if (cacheName === "groundHeight") texGroundHeight = tex;
      else if (cacheName === "riverNormal") texRiverNormal = tex;
      else if (cacheName === "riverRoughness") texRiverRoughness = tex;
      else if (cacheName === "riverAlbedo") texRiverAlbedo = tex;
      else if (cacheName === "riverAO") texRiverAO = tex;
      else if (cacheName === "riverHeight") texRiverHeight = tex;
      return tex;
    }

    function createRockTexture() {
      const size = 128;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      const base = 95;
      const variance = 35;
      const imageData = ctx.createImageData(size, size);
      for (let i = 0; i < imageData.data.length; i += 4) {
        const n = base + Math.floor((Math.random() - 0.5) * variance);
        imageData.data[i] = n;
        imageData.data[i + 1] = n + 8;
        imageData.data[i + 2] = n + 14;
        imageData.data[i + 3] = 255;
      }
      ctx.putImageData(imageData, 0, 0);
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(14, 14);
      tex.anisotropy = 8;
      return tex;
    }

    function createRiverbedAlbedoTexture() {
      const size = 512;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#8e8a80";
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 7000; i += 1) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const r = Math.random() * 2.8 + 0.6;
        const c = Math.floor(120 + Math.random() * 90);
        ctx.fillStyle = `rgb(${c},${c - 5},${c - 12})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(18, 18);
      tex.anisotropy = 8;
      return tex;
    }

    function createRiverbedRoughnessTexture() {
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      const img = ctx.createImageData(size, size);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.floor(145 + Math.random() * 90);
        img.data[i] = v;
        img.data[i + 1] = v;
        img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(22, 22);
      tex.anisotropy = 4;
      return tex;
    }

    function createRiverFlowTexture() {
      const size = 512;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#7fa9c6";
      ctx.fillRect(0, 0, size, size);

      // Long horizontal streaks to imply stream flow.
      ctx.globalAlpha = 0.22;
      for (let i = 0; i < 220; i += 1) {
        const y = Math.random() * size;
        const h = 1 + Math.random() * 2.8;
        const w = size * (0.35 + Math.random() * 0.7);
        const x = -size * 0.2 + Math.random() * size * 0.4;
        ctx.fillStyle = Math.random() > 0.5 ? "#bfe0f6" : "#6f96b3";
        ctx.fillRect(x, y, w, h);
      }
      ctx.globalAlpha = 0.12;
      for (let i = 0; i < 90; i += 1) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const r = 4 + Math.random() * 14;
        ctx.fillStyle = "#d7edfb";
        ctx.beginPath();
        ctx.ellipse(x, y, r * 1.8, r * 0.55, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }

      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(5.5, 2.4);
      tex.anisotropy = 8;
      return tex;
    }

    function createSkyDome() {
      const size = 1024;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size / 2;
      const ctx = canvas.getContext("2d");
      const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
      g.addColorStop(0.0, "#2f74c3");
      g.addColorStop(0.4, "#67a9ea");
      g.addColorStop(0.78, "#b4d8f6");
      g.addColorStop(1.0, "#d8e9f7");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 0.28;
      for (let i = 0; i < 120; i += 1) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * (canvas.height * 0.7);
        const w = 70 + Math.random() * 240;
        const h = 16 + Math.random() * 44;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.ellipse(x, y, w, h, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      const skyTex = new THREE.CanvasTexture(canvas);
      skyTex.mapping = THREE.EquirectangularReflectionMapping;
      const domeGeo = new THREE.SphereGeometry(130, 32, 24);
      const domeMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide });
      const dome = new THREE.Mesh(domeGeo, domeMat);
      scene.add(dome);
      scene.background = skyTex;
      scene.fog = new THREE.Fog(0xb2d2ee, 20, 72);
    }

    function createRiverbedPebbles() {
      const count = 1800;
      const geo = new THREE.DodecahedronGeometry(0.12, 0);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x7f7a70,
        roughness: 0.95,
        metalness: 0.0,
      });
      const inst = new THREE.InstancedMesh(geo, mat, count);
      inst.castShadow = false;
      inst.receiveShadow = true;
      const dummy = new THREE.Object3D();
      for (let i = 0; i < count; i += 1) {
        const theta = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * (STAGE.radius - STAGE.inset);
        const x = Math.cos(theta) * r;
        const z = Math.sin(theta) * r;
        const s = rand(0.5, 2.2);
        dummy.position.set(x, rand(-0.03, 0.03), z);
        dummy.rotation.set(rand(-0.25, 0.25), rand(0, Math.PI * 2), rand(-0.25, 0.25));
        dummy.scale.set(s * rand(0.9, 1.25), s * rand(0.5, 0.95), s * rand(0.85, 1.2));
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
      scene.add(inst);
    }

    function createRiverBackdrop() {
      const group = new THREE.Group();
      const waterTex = createRiverFlowTexture();
      const riverAlbedoTex = getExternalTexture("riverAlbedo", "tex/riverwater_albedo.png", 2.8, 1.2);
      const riverNormalTex = getExternalTexture("riverNormal", "tex/riverwater_normal.png", 2.8, 1.2);
      const riverRoughnessTex = getExternalTexture("riverRoughness", "tex/riverwater_roughness.png", 2.8, 1.2);
      const riverAoTex = getExternalTexture("riverAO", "tex/riverwater_ao.png", 2.8, 1.2);
      const riverHeightTex = getExternalTexture("riverHeight", "tex/riverwater_height.png", 2.8, 1.2);
      const riverTextures = [riverAlbedoTex, riverNormalTex, riverRoughnessTex, riverAoTex, riverHeightTex];
      for (let i = 0; i < riverTextures.length; i += 1) {
        const tex = riverTextures[i];
        if (!tex) continue;
        tex.center.set(0.5, 0.5);
        tex.rotation = Math.PI / 2;
      }


      const riverMat = new THREE.MeshStandardMaterial({
        color: 0xd6ecff,
        roughness: 0.18,
        metalness: 0.03,
        transparent: true,
        opacity: 0.92,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -2,
        map: riverAlbedoTex || waterTex,
        roughnessMap: riverRoughnessTex || null,
        aoMap: riverAoTex || null,
        aoMapIntensity: 0.65,
        normalMap: riverNormalTex || null,
        normalScale: new THREE.Vector2(1.1, 1.1),
        bumpMap: riverHeightTex || null,
        bumpScale: 0.1,
      });
      riverFlowMaterials.push(riverMat);

      // Horizontal river band near the upper side of the circular stage.
      const riverCenterZ = -10.5;
      const riverBandDepth = 7.8;
      const riverHalfDepth = riverBandDepth * 0.5;
      const riverSpanHalf = Math.sqrt(Math.max(0, STAGE.radius * STAGE.radius - riverCenterZ * riverCenterZ)) - 0.2;
      const riverWidth = Math.max(8, riverSpanHalf * 2);
      const riverGeo = new THREE.PlaneGeometry(riverWidth, riverBandDepth, 24, 6);
      if (riverGeo.attributes.uv && !riverGeo.attributes.uv2) {
        riverGeo.setAttribute("uv2", new THREE.BufferAttribute(riverGeo.attributes.uv.array, 2));
      }
      const riverSeg = new THREE.Mesh(riverGeo, riverMat);
      riverSeg.rotation.x = -Math.PI / 2;
      riverSeg.position.set(0, 0.012, riverCenterZ);
      riverSeg.receiveShadow = true;
      group.add(riverSeg);

      const pebbleGeo = new THREE.DodecahedronGeometry(0.44, 0);
      const pebbleMat = new THREE.MeshStandardMaterial({
        color: 0x7a756b,
        roughness: 0.95,
        metalness: 0.0,
      });
      const pebbleInst = new THREE.InstancedMesh(pebbleGeo, pebbleMat, 620);
      const dummy = new THREE.Object3D();
      for (let i = 0; i < 620; i += 1) {
        const theta = Math.random() * Math.PI * 2;
        const r = rand(STAGE.radius * 0.22, STAGE.radius - STAGE.inset);
        const x = Math.cos(theta) * r;
        const z = Math.sin(theta) * r;
        const insideRiverX = Math.abs(x) < (riverWidth * 0.5 + 0.8);
        const insideRiverZ = Math.abs(z - riverCenterZ) < (riverHalfDepth + 1.0);
        if (insideRiverX && insideRiverZ && Math.random() < 0.9) continue;
        const s = rand(0.7, 2.8);
        dummy.position.set(x, rand(-0.012, 0.035), z);
        dummy.rotation.set(rand(-0.18, 0.18), rand(0, Math.PI * 2), rand(-0.18, 0.18));
        dummy.scale.set(s * rand(0.9, 1.4), s * rand(0.48, 1.0), s * rand(0.85, 1.25));
        dummy.updateMatrix();
        pebbleInst.setMatrixAt(i, dummy.matrix);
      }
      pebbleInst.instanceMatrix.needsUpdate = true;
      pebbleInst.receiveShadow = true;
      group.add(pebbleInst);

      scene.add(group);
    }

    function initThree() {
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0xb4d8f6);
      scene.fog = new THREE.Fog(0xb4d8f6, 18, 68);

      camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 250);
      camera.position.set(6.2, 5.6, 7.4);

      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.domElement.style.touchAction = "none";
      app.appendChild(renderer.domElement);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 1.0, 0);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minDistance = 4;
      controls.maxDistance = 38;
      controls.maxPolarAngle = Math.PI * 0.495;
      controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
      controls.mouseButtons.RIGHT = null;
      controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
      controls.touches.ONE = THREE.TOUCH.PAN;
      controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
      controls.update();

      raycaster = new THREE.Raycaster();
      pointerNdc = new THREE.Vector2();
      dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      dragHit = new THREE.Vector3();
      dragOffset = new THREE.Vector3();

      const hemi = new THREE.HemisphereLight(0xdfefff, 0x6d7c86, 0.7);
      scene.add(hemi);

      const sun = new THREE.DirectionalLight(0xffffff, 1.15);
      sun.position.set(8, 16, 6);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 45;
      sun.shadow.camera.left = -14;
      sun.shadow.camera.right = 14;
      sun.shadow.camera.top = 14;
      sun.shadow.camera.bottom = -14;
      scene.add(sun);

      window.addEventListener("resize", onResize);
      hudToggleBtn.addEventListener("click", toggleHudPanel);
      renderer.domElement.addEventListener("pointerdown", onPointerDown);
      renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
      window.addEventListener("keydown", onKeyDown);
      giveUpBtn.addEventListener("click", onGiveUp);
      beginBtn.addEventListener("click", onBeginStacking);
      stackAgainBtn.addEventListener("click", onStackAgain);
      langToggleBtn.addEventListener("click", toggleLanguage);
      applyLanguage(currentLang);
      updateHudLayoutForViewport();
    }

    async function initRapier() {
      await RAPIER.init();
      world = new RAPIER.World({ x: 0, y: TUNING.gravity, z: 0 });
    }

    async function loadDependencies() {
      const threeMod = await import("three");
      const controlsMod = await import("three/addons/controls/OrbitControls.js");
      const rapierCandidates = [
        "https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.12.0/rapier.es.js",
        "https://unpkg.com/@dimforge/rapier3d-compat@0.12.0/rapier.es.js",
        "https://esm.sh/@dimforge/rapier3d-compat@0.12.0?bundle",
      ];
      let rapierMod = null;
      let rapierErr = null;
      for (let i = 0; i < rapierCandidates.length; i += 1) {
        const url = rapierCandidates[i];
        try {
          rapierMod = await import(url);
          rapierErr = null;
          break;
        } catch (err) {
          rapierErr = new Error(`Rapier import failed: ${url} :: ${err && err.message ? err.message : err}`);
        }
      }
      if (!rapierMod) {
        throw rapierErr || new Error("Rapier import failed on all CDNs.");
      }
      THREE = threeMod;
      OrbitControls = controlsMod.OrbitControls;
      RAPIER = rapierMod.default ?? rapierMod;
    }

    function showFatal(message) {
      const hud = document.getElementById("hudBottomRight");
      hud.textContent = `Init failed:\n${message}\n\nCheck network/CDN access.`; 
      hud.style.color = "#ffd7d7";
    }

    function createGround() {
      const groundRadius = STAGE.radius;
      const groundThickness = STAGE.thickness;

      const groundGeo = new THREE.CircleGeometry(groundRadius, 96);
      if (groundGeo.attributes.uv && !groundGeo.attributes.uv2) {
        groundGeo.setAttribute("uv2", new THREE.BufferAttribute(groundGeo.attributes.uv.array, 2));
      }
      const albedo = createRiverbedAlbedoTexture();
      const roughnessTex = createRiverbedRoughnessTexture();
      const extGroundNormal = getExternalTexture("groundNormal", "tex/ground_normal.png", 14, 14);
      const extGroundRoughness = getExternalTexture("groundRoughness", "tex/ground_roughness.png", 14, 14);
      const extGroundAlbedo = getExternalTexture("groundAlbedo", "tex/ground_albedo.png", 14, 14);
      const extGroundAO = getExternalTexture("groundAO", "tex/ground_ao.png", 14, 14);
      const extGroundHeight = getExternalTexture("groundHeight", "tex/ground_height.png", 14, 14);
      const groundMat = new THREE.MeshStandardMaterial({
        color: 0xcfd2d4,
        roughness: 1.0,
        metalness: 0.0,
        map: extGroundAlbedo || albedo,
        roughnessMap: extGroundRoughness || roughnessTex,
        aoMap: extGroundAO || null,
        aoMapIntensity: 0.5,
        normalMap: extGroundNormal || null,
        normalScale: new THREE.Vector2(1.15, 1.15),
        bumpMap: extGroundHeight || extGroundRoughness || roughnessTex,
        bumpScale: 0.05,
      });
      groundMesh = new THREE.Mesh(groundGeo, groundMat);
      groundMesh.rotation.x = -Math.PI / 2;
      groundMesh.receiveShadow = true;
      scene.add(groundMesh);

      createRiverbedPebbles();
      createRiverBackdrop();
      createSkyDome();

      const rbDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, -groundThickness, 0);
      groundBody = world.createRigidBody(rbDesc);

      const colDesc = RAPIER.ColliderDesc.cylinder(groundThickness, groundRadius)
        .setFriction(TUNING.groundFriction)
        .setRestitution(TUNING.groundRestitution);
      groundCollider = world.createCollider(colDesc, groundBody);
    }

    function randomStoneSize() {
      let w = rand(TUNING.minStoneSize, TUNING.maxStoneSize);
      let h = rand(TUNING.minStoneSize * 0.75, TUNING.maxStoneSize * 0.9);
      let d = rand(TUNING.minStoneSize, TUNING.maxStoneSize);

      const maxDim = Math.max(w, h, d);
      const minDim = Math.min(w, h, d);
      const ratio = maxDim / minDim;
      if (ratio > TUNING.maxAspectRatio) {
        const correctedMin = maxDim / TUNING.maxAspectRatio;
        if (w === minDim) w = correctedMin;
        else if (h === minDim) h = correctedMin;
        else d = correctedMin;
      }
      return { w, h, d };
    }

    function createRockShapeData() {
      const baseRadius = rand(0.055, 0.1);
      const geometry = new THREE.DodecahedronGeometry(baseRadius, 0);
      const sizeMul = rand(4.8, 6.0);

      // Reuse the old version's idea: non-uniform scaling gives varied rock silhouettes.
      geometry.scale(
        rand(0.68, 1.55) * sizeMul,
        rand(0.6, 1.4) * sizeMul,
        rand(0.68, 1.55) * sizeMul
      );
      geometry.rotateY(rand(0, Math.PI * 2));
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();

      const bb = geometry.boundingBox;
      const hx = Math.max(0.012, (bb.max.x - bb.min.x) * 0.5);
      const hy = Math.max(0.012, (bb.max.y - bb.min.y) * 0.5);
      const hz = Math.max(0.012, (bb.max.z - bb.min.z) * 0.5);

      const pos = geometry.attributes.position.array;
      const colliderPoints = new Float32Array(pos.length);
      colliderPoints.set(pos);

      return {
        geometry,
        colliderPoints,
        halfExtents: { x: hx, y: hy, z: hz },
      };
    }

    function makeStoneMesh(shapeData, color = 0xc9ced3) {
      const geom = shapeData.geometry.clone();
      geom.computeVertexNormals();
      if (geom.attributes.uv && !geom.attributes.uv2) {
        geom.setAttribute("uv2", new THREE.BufferAttribute(geom.attributes.uv.array, 2));
      }

      const stoneNormalTex = getExternalTexture("stoneNormal", "tex/stone_normal.png", 2.0, 2.0);
      const stoneRoughnessTex = getExternalTexture("stoneRoughness", "tex/stone_roughness.png", 2.0, 2.0);
      const stoneAoTex = getExternalTexture("stoneAO", "tex/stone_ao.png", 2.0, 2.0);
      const stoneHeightTex = getExternalTexture("stoneHeight", "tex/stone_height.png", 2.0, 2.0);
      const stoneAlbedoTex = getExternalTexture("stoneAlbedo", "tex/stone_albedo.png", 2.0, 2.0) || createRockTexture();

      const mat = new THREE.MeshStandardMaterial({
        color,
        map: stoneAlbedoTex,
        roughness: 1.0,
        metalness: 0.02,
        roughnessMap: stoneRoughnessTex || null,
        aoMap: stoneAoTex || null,
        aoMapIntensity: 0.75,
        normalMap: stoneNormalTex || null,
        normalScale: new THREE.Vector2(0.95, 0.95),
        bumpMap: stoneHeightTex || null,
        bumpScale: 0.06,
        flatShading: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const edges = new THREE.EdgesGeometry(geom);
      const line = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: 0xe8f6ff, transparent: true, opacity: 0.95 })
      );
      line.visible = false;
      mesh.add(line);

      return { mesh, outline: line };
    }

    function buildStoneRigidBody(shapeData, pos, bodyType) {
      let rbDesc;
      if (bodyType === "kinematic") rbDesc = RAPIER.RigidBodyDesc.kinematicPositionBased();
      else if (bodyType === "fixed") rbDesc = RAPIER.RigidBodyDesc.fixed();
      else rbDesc = RAPIER.RigidBodyDesc.dynamic();

      rbDesc.setTranslation(pos.x, pos.y, pos.z);
      const body = world.createRigidBody(rbDesc);

      const hullDesc = RAPIER.ColliderDesc.convexHull(shapeData.colliderPoints);
      const colDesc = hullDesc || RAPIER.ColliderDesc.cuboid(
        shapeData.halfExtents.x,
        shapeData.halfExtents.y,
        shapeData.halfExtents.z
      );
      const collider = world.createCollider(
        colDesc
          .setFriction(TUNING.stoneFriction)
          .setRestitution(TUNING.stoneRestitution)
          .setDensity(TUNING.stoneDensity),
        body
      );

      return { body, collider };
    }

    function setStoneActiveVisual(stone, on) {
      if (!stone) return;
      stone.outline.visible = !!on;
      if (on) {
        stone.mesh.material.color.setHex(0xd8dde2);
      } else {
        stone.mesh.material.color.setHex(0xc9ced3);
      }
    }

    function updateHudStats() {
      let maxTop = 0;
      for (let i = 0; i < stones.length; i += 1) {
        const stone = stones[i];
        if (stone.isActive || !stone.body) continue;
        const p = stone.body.translation();
        const top = p.y + stone.shapeData.halfExtents.y;
        if (top > maxTop) maxTop = top;
      }
      stackCountEl.textContent = String(stackCount);
      stackHeightEl.textContent = `${maxTop.toFixed(2)} m`;
    }

    function ensureDragProbe() {
      if (!activeStone || !world || !activeStone.shapeData) return false;
      if (dragProbeBody && dragProbeCollider) return true;

      const q = activeStone.mesh.quaternion;
      dragProbeBody = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(
          activeStone.mesh.position.x,
          activeStone.mesh.position.y,
          activeStone.mesh.position.z
        )
      );
      dragProbeBody.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);

      let probePoints = activeStone.shapeData.colliderPoints;
      const shrink = TUNING.dragProbeShrink;
      if (shrink > 0 && shrink < 1) {
        probePoints = new Float32Array(activeStone.shapeData.colliderPoints.length);
        for (let pi = 0; pi < probePoints.length; pi += 1) {
          probePoints[pi] = activeStone.shapeData.colliderPoints[pi] * shrink;
        }
      }
      let probeDesc = RAPIER.ColliderDesc.convexHull(probePoints);
      if (!probeDesc) {
        const h = activeStone.shapeData.halfExtents;
        probeDesc = RAPIER.ColliderDesc.cuboid(h.x, h.y, h.z);
      }
      if (probeDesc.setSensor) probeDesc.setSensor(true);
      dragProbeCollider = world.createCollider(probeDesc, dragProbeBody);
      return true;
    }

    function destroyDragProbe() {
      if (dragProbeBody) {
        world.removeRigidBody(dragProbeBody);
      }
      dragProbeBody = null;
      dragProbeCollider = null;
    }

    function setStabilityBar(score) {
      const s = clamp(score, 0, 1);
      const pct = Math.round(s * 100);
      stabilityFillEl.style.width = `${pct}%`;
      stabilityValueEl.textContent = `${pct}%`;
    }

    function updateStabilityBar() {
      if (!stabilityTargetStone || !stabilityTargetStone.body || gameOver) {
        stabilityWrapEl.classList.remove("on");
        return;
      }

      const lv = stabilityTargetStone.body.linvel ? stabilityTargetStone.body.linvel() : { x: 0, y: 0, z: 0 };
      const av = stabilityTargetStone.body.angvel ? stabilityTargetStone.body.angvel() : { x: 0, y: 0, z: 0 };
      const lin = Math.hypot(lv.x, lv.y, lv.z);
      const ang = Math.hypot(av.x, av.y, av.z);

      const linScore = Math.max(0, 1 - lin / 0.85);
      const angScore = Math.max(0, 1 - ang / 2.2);
      const score = linScore * 0.65 + angScore * 0.35;

      stabilityWrapEl.classList.add("on");
      setStabilityBar(score);
    }

    function canMoveActiveTo(targetPos) {
      if (!activeStone) return false;
      if (!world || !activeStone.shapeData) return false;

      if (typeof world.intersectionsWithCollider === "function") {
        if (!ensureDragProbe()) return false;

        const q = activeStone.mesh.quaternion;
        dragProbeBody.setTranslation({ x: targetPos.x, y: targetPos.y, z: targetPos.z }, true);
        dragProbeBody.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);

        let blocked = false;
        world.intersectionsWithCollider(dragProbeCollider, (other) => {
          if (!other) return true;
          if (groundCollider && other.handle === groundCollider.handle) return true;
          if (activeStone.collider && other.handle === activeStone.collider.handle) return true;

          for (let i = 0; i < stones.length; i += 1) {
            const s = stones[i];
            if (s === activeStone || s.isActive || !s.collider) continue;
            if (s.collider.handle === other.handle) {
              blocked = true;
              return false;
            }
          }
          return true;
        });

        return !blocked;
      }

      // Fallback if query API is unavailable.
      const h1 = activeStone.shapeData.halfExtents;
      for (let i = 0; i < stones.length; i += 1) {
        const s = stones[i];
        if (s === activeStone || s.isActive || !s.body) continue;
        const p = s.body.translation();
        const h2 = s.shapeData.halfExtents;
        const dx = Math.abs(targetPos.x - p.x);
        const dy = Math.abs(targetPos.y - p.y);
        const dz = Math.abs(targetPos.z - p.z);
        if (dx < (h1.x + h2.x) * 0.96 && dy < (h1.y + h2.y) * 0.96 && dz < (h1.z + h2.z) * 0.96) {
          return false;
        }
      }
      return true;
    }

    function destroyStoneBody(stone) {
      if (!stone || !stone.body) return;
      world.removeRigidBody(stone.body);
      stone.body = null;
      stone.collider = null;
    }

    function attachDynamicBehavior(stone) {
      stone.gentleTimer = 0;
      stone.gentleDuration = rand(TUNING.gentleDurationMin, TUNING.gentleDurationMax);
      stone.body.setGravityScale(TUNING.gentleGravityScale, true);
      stone.body.wakeUp();
      stone.hitSfxArmed = true;
      stone.hitSfxAge = 0;
      dynamicStones.push(stone);
    }

    function spawnActiveStone() {
      const shapeData = createRockShapeData();
      const pos = { x: 0, y: TUNING.spawnY, z: 0 };
      if (lastReleasedPos) {
        const hx = shapeData.halfExtents.x;
        const hy = shapeData.halfExtents.y;
        const hz = shapeData.halfExtents.z;
        const dx = (hx + 0.8) * (Math.random() < 0.5 ? -1 : 1);
        const dz = (hz + 0.8) * (Math.random() < 0.5 ? -1 : 1);
        pos.x = clamp(lastReleasedPos.x + dx, -TUNING.spawnRange * 2.6, TUNING.spawnRange * 2.6);
        pos.z = clamp(lastReleasedPos.z + dz, -TUNING.spawnRange * 2.6, TUNING.spawnRange * 2.6);
        pos.y = Math.max(lastReleasedPos.y + hy + 1.8, TUNING.spawnY);
      } else {
        pos.x = rand(-TUNING.spawnRange, TUNING.spawnRange);
        pos.z = rand(-TUNING.spawnRange, TUNING.spawnRange);
        pos.y = TUNING.spawnY;
      }

      const { mesh, outline } = makeStoneMesh(shapeData);
      mesh.position.set(pos.x, pos.y, pos.z);
      scene.add(mesh);

      const { body, collider } = buildStoneRigidBody(shapeData, pos, "kinematic");

      activeStone = {
        mesh,
        outline,
        body,
        collider,
        shapeData,
        spawnIndex: spawnedStoneCount + 1,
        isActive: true,
      };
      spawnedStoneCount += 1;
      setStoneActiveVisual(activeStone, true);
      stones.push(activeStone);
    }

    function hitActiveStoneAt(clientX, clientY) {
      if (!activeStone) return false;
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      return raycaster.intersectObject(activeStone.mesh, false).length > 0;
    }

    function beginGrab(clientX, clientY, mode) {
      if (!activeStone || isGrabbing) return;
      ensureAudio();
      if (!hitActiveStoneAt(clientX, clientY)) return;

      isGrabbing = true;
      grabMode = mode;
      destroyDragProbe();
      controls.enabled = false;
      lastPointerX = clientX;
      lastPointerY = clientY;

      if (mode === "move") {
        ensureDragProbe();
        const camForward = new THREE.Vector3();
        camera.getWorldDirection(camForward);
        dragPlane.setFromNormalAndCoplanarPoint(camForward, activeStone.mesh.position);
        raycaster.ray.intersectPlane(dragPlane, dragHit);
        if (dragHit) {
          dragOffset.copy(activeStone.mesh.position).sub(dragHit);
        } else {
          dragOffset.set(0, 0, 0);
        }
      }
    }

    function moveActiveStoneClosestTo(target) {
      if (!activeStone) return;

      if (canMoveActiveTo(target)) {
        activeStone.mesh.position.copy(target);
        activeStone.body.setNextKinematicTranslation(activeStone.mesh.position);
        return;
      }

      // If blocked, binary-search the furthest reachable point toward target.
      const start = activeStone.mesh.position.clone();
      const probe = new THREE.Vector3();
      const best = start.clone();
      let lo = 0;
      let hi = 1;

      for (let i = 0; i < 20; i += 1) {
        const mid = (lo + hi) * 0.5;
        probe.lerpVectors(start, target, mid);
        if (canMoveActiveTo(probe)) {
          best.copy(probe);
          lo = mid;
        } else {
          hi = mid;
        }
      }

      activeStone.mesh.position.copy(best);
      activeStone.body.setNextKinematicTranslation(activeStone.mesh.position);
    }

    function updateGrabMove(clientX, clientY) {
      if (!isGrabbing || !activeStone) return;

      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);

      if (!raycaster.ray.intersectPlane(dragPlane, dragHit)) return;

      const minY = activeStone.shapeData.halfExtents.y;
      const target = new THREE.Vector3(
        dragHit.x + dragOffset.x,
        Math.max(minY, dragHit.y + dragOffset.y),
        dragHit.z + dragOffset.z
      );
      moveActiveStoneClosestTo(target);
    }

    function updateGrabRotate(clientX, clientY) {
      if (!isGrabbing || !activeStone) return;
      const dx = clientX - lastPointerX;
      const dy = clientY - lastPointerY;
      lastPointerX = clientX;
      lastPointerY = clientY;

      const cameraForward = new THREE.Vector3();
      const cameraRight = new THREE.Vector3();
      const cameraUp = new THREE.Vector3();
      camera.getWorldDirection(cameraForward);
      cameraRight.crossVectors(cameraForward, camera.up).normalize();
      cameraUp.copy(camera.up).normalize();

      const qYaw = new THREE.Quaternion().setFromAxisAngle(cameraUp, dx * TUNING.dragRotateSpeed);
      const qPitch = new THREE.Quaternion().setFromAxisAngle(cameraRight, dy * TUNING.dragRotateSpeed);
      activeStone.mesh.quaternion.premultiply(qYaw);
      activeStone.mesh.quaternion.premultiply(qPitch);
      activeStone.body.setNextKinematicRotation(activeStone.mesh.quaternion);
      activeStone.body.setNextKinematicTranslation(activeStone.mesh.position);
    }

    function switchStoneBodyToDynamic(stone) {
      if (!stone) return;

      const p = stone.mesh.position;
      const q = stone.mesh.quaternion;

      destroyStoneBody(stone);

      const { body, collider } = buildStoneRigidBody(stone.shapeData, p, "dynamic");
      body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
      body.setLinearDamping(0.2);
      body.setAngularDamping(0.5);
      stone.body = body;
      stone.collider = collider;

      attachDynamicBehavior(stone);
    }

    function endGrab(releaseStone) {
      if (!activeStone) return;

      if (isGrabbing) {
        isGrabbing = false;
        grabMode = "none";
        controls.enabled = true;
        destroyDragProbe();
      }

      if (!releaseStone) return;

      const released = activeStone;
      setStoneActiveVisual(released, false);
      released.isActive = false;
      lastReleasedPos = released.mesh.position.clone();

      switchStoneBodyToDynamic(released);
      playGameSound("place", 1);
      stabilityTargetStone = released;
      stabilityWrapEl.classList.add("on");
      setStabilityBar(0);
      activeStone = null;

      stackCount += 1;
      updateHudStats();

      if (!gameOver) {
        spawnActiveStone();
      }
    }

    function setViewPolar(targetPolar) {
      const currentPolar = controls.getPolarAngle();
      const focus = activeStone ? activeStone.mesh.position : controls.target;
      viewTween = {
        startTime: performance.now(),
        duration: TUNING.viewTweenSeconds * 1000,
        startPolar: currentPolar,
        endPolar: targetPolar,
        azimuth: controls.getAzimuthalAngle(),
        radius: camera.position.distanceTo(controls.target),
        startTarget: controls.target.clone(),
        endTarget: new THREE.Vector3(focus.x, focus.y, focus.z),
      };
    }

    function setViewTop() {
      setViewPolar(TUNING.topPolar);
    }

    function setViewSide() {
      setViewPolar(TUNING.sidePolar);
    }

    function updateViewTween() {
      if (!viewTween) return;
      const now = performance.now();
      const t = clamp((now - viewTween.startTime) / viewTween.duration, 0, 1);
      const e = TUNING.viewEasing(t);

      const target = new THREE.Vector3().lerpVectors(viewTween.startTarget, viewTween.endTarget, e);
      const polar = THREE.MathUtils.lerp(viewTween.startPolar, viewTween.endPolar, e);

      const sinPolar = Math.sin(polar);
      const x = viewTween.radius * sinPolar * Math.sin(viewTween.azimuth);
      const y = viewTween.radius * Math.cos(polar);
      const z = viewTween.radius * sinPolar * Math.cos(viewTween.azimuth);

      controls.target.copy(target);

      camera.position.set(
        target.x + x,
        target.y + y,
        target.z + z
      );
      camera.lookAt(target);

      if (t >= 1) {
        viewTween = null;
      }
    }

    function updateDynamicStoneEffects(delta) {
      for (let i = dynamicStones.length - 1; i >= 0; i -= 1) {
        const stone = dynamicStones[i];
        if (!stone.body) {
          dynamicStones.splice(i, 1);
          continue;
        }

        stone.gentleTimer += delta;
        const ratio = clamp(stone.gentleTimer / stone.gentleDuration, 0, 1);
        const gravityScale = THREE.MathUtils.lerp(TUNING.gentleGravityScale, 1.0, ratio);
        stone.body.setGravityScale(gravityScale, true);

        if (ratio < 1) {
          const lv = stone.body.linvel();
          if (lv.y < -TUNING.gentleMaxDownSpeed) {
            stone.body.setLinvel({ x: lv.x, y: -TUNING.gentleMaxDownSpeed, z: lv.z }, true);
          }
        }


        // Play hit sfx after release when this now-dynamic stone touches another stone.
        stone.hitSfxAge = (stone.hitSfxAge || 0) + delta;
        if (stone.hitSfxArmed && stone.hitSfxAge > 0.03) {
          let hitOtherStone = false;
          if (typeof world.intersectionsWithCollider === "function" && stone.collider) {
            world.intersectionsWithCollider(stone.collider, (other) => {
              if (!other) return true;
              if (groundCollider && other.handle === groundCollider.handle) return true;
              for (let si = 0; si < stones.length; si += 1) {
                const s2 = stones[si];
                if (!s2 || s2 === stone || !s2.collider) continue;
                if (s2.collider.handle === other.handle) {
                  hitOtherStone = true;
                  return false;
                }
              }
              return true;
            });
          } else {
            // Fallback approximate check if query API is unavailable.
            const p = stone.body.translation();
            const h = stone.shapeData ? stone.shapeData.halfExtents : { x: 0.1, y: 0.1, z: 0.1 };
            for (let si = 0; si < stones.length; si += 1) {
              const s2 = stones[si];
              if (!s2 || s2 === stone || !s2.body || !s2.shapeData) continue;
              const p2 = s2.body.translation();
              const h2 = s2.shapeData.halfExtents;
              const dx = Math.abs(p.x - p2.x);
              const dy = Math.abs(p.y - p2.y);
              const dz = Math.abs(p.z - p2.z);
              if (dx < (h.x + h2.x) && dy < (h.y + h2.y) && dz < (h.z + h2.z)) {
                hitOtherStone = true;
                break;
              }
            }
          }
          if (hitOtherStone) {
            const lv2 = stone.body.linvel ? stone.body.linvel() : { x: 0, y: 0, z: 0 };
            const impact = Math.hypot(lv2.x, lv2.y, lv2.z);
            playActiveStoneHitSfx(clamp(impact / 1.2, 0.5, 1.25));
            stone.hitSfxArmed = false;
          }
        }

        if (ratio >= 1) {
          stone.body.setGravityScale(1.0, true);
          dynamicStones.splice(i, 1);
        }
      }
    }

    function triggerGameOver() {
      if (gameOver) return;
      gameOver = true;
      gameOverOverlayEl.classList.add("on");
      if (isGrabbing) {
        endGrab(false);
      }
      if (activeStone) {
        scene.remove(activeStone.mesh);
        destroyStoneBody(activeStone);
        const idx = stones.indexOf(activeStone);
        if (idx >= 0) stones.splice(idx, 1);
        activeStone = null;
      }
    }

    function checkGameOverByGroundContact() {
      if (gameOver) return;

      // Rule: game over when two or more non-active stones touch the ground.
      // Vertex-based world-space check avoids missing contacts due to physics query timing.
      const eps = 0.06;
      const nowSec = performance.now() / 1000;
      let groundedCount = 0;

      for (let i = 0; i < stones.length; i += 1) {
        const s = stones[i];
        if (!s.body || !s.mesh) continue;

        const geometry = s.mesh.geometry;
        const posAttr = geometry && geometry.attributes ? geometry.attributes.position : null;
        if (!posAttr || !posAttr.count) continue;

        s.mesh.updateMatrixWorld(true);
        const m = s.mesh.matrixWorld.elements;
        let minY = Infinity;

        for (let vi = 0; vi < posAttr.count; vi += 1) {
          const x = posAttr.getX(vi);
          const y = posAttr.getY(vi);
          const z = posAttr.getZ(vi);
          const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
          if (wy < minY) minY = wy;
        }

        const grounded = minY <= eps;
        if (grounded && !s.isActive) {
          groundedCount += 1;
          if (groundedCount >= 2) {
            triggerGameOver();
            return;
          }
        }

        if (s.isActive) {
          s.mesh.material.color.setHex(0xd8dde2);
        } else {
          s.mesh.material.color.setHex(0xc9ced3);
        }
      }
    }

    function syncMeshesFromPhysics() {
      for (let i = 0; i < stones.length; i += 1) {
        const stone = stones[i];
        if (!stone.body) continue;
        const pos = stone.body.translation();
        const rot = stone.body.rotation();
        stone.mesh.position.set(pos.x, pos.y, pos.z);
        stone.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
      }
    }

    function onPointerDown(e) {
      if (!gameStarted) return;
      if (gameOver) return;
      pointerIsDown = true;

      if (e.pointerType === "touch") {
        const now = performance.now();
        const hitActive = hitActiveStoneAt(e.clientX, e.clientY);
        controls.enabled = false;
        activeTouchGesture = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          lastX: e.clientX,
          lastY: e.clientY,
          hitActive,
          moved: false,
          longPressTriggered: false,
          longPressTimer: null,
          touchMode: hitActive ? "stoneMove" : "cameraPan",
        };
        activePointerId = e.pointerId;
        renderer.domElement.setPointerCapture(e.pointerId);

        if (hitActive && lastTouchTap) {
          const dt = now - lastTouchTap.time;
          const dd = Math.hypot(e.clientX - lastTouchTap.x, e.clientY - lastTouchTap.y);
          if (dt <= TUNING.touchDoubleTapMs && dd <= TUNING.touchDoubleTapDistancePx) {
            lastTouchTap = null;
            endGrab(true);
            controls.enabled = true;
            activeTouchGesture = null;
            pointerIsDown = false;
            renderer.domElement.releasePointerCapture(e.pointerId);
            activePointerId = null;
            e.preventDefault();
            return;
          }
        }

        if (hitActive) {
          beginGrab(e.clientX, e.clientY, "move");
        } else {
          lastPointerX = e.clientX;
          lastPointerY = e.clientY;
        }

        activeTouchGesture.longPressTimer = setTimeout(() => {
          if (!activeTouchGesture) return;
          if (activeTouchGesture.pointerId !== e.pointerId) return;
          if (activeTouchGesture.moved) return;
          activeTouchGesture.longPressTriggered = true;
          if (activeTouchGesture.hitActive) {
            if (!isGrabbing || grabMode !== "move") return;
            activeTouchGesture.touchMode = "stoneRotate";
            grabMode = "rotate";
            lastPointerX = activeTouchGesture.lastX;
            lastPointerY = activeTouchGesture.lastY;
            return;
          }
          activeTouchGesture.touchMode = "cameraRotate";
          lastPointerX = activeTouchGesture.lastX;
          lastPointerY = activeTouchGesture.lastY;
        }, TUNING.touchLongPressMs);

        e.preventDefault();
        return;
      }

      if (e.button === 0) {
        beginGrab(e.clientX, e.clientY, e.shiftKey ? "rotate" : "move");
      }
      if (isGrabbing) {
        activePointerId = e.pointerId;
        renderer.domElement.setPointerCapture(e.pointerId);
      }
    }

    function onPointerMove(e) {
      if (!pointerIsDown) return;
      if (activeTouchGesture && e.pointerId === activeTouchGesture.pointerId) {
        const dx = e.clientX - activeTouchGesture.lastX;
        const dy = e.clientY - activeTouchGesture.lastY;
        activeTouchGesture.lastX = e.clientX;
        activeTouchGesture.lastY = e.clientY;
        const movedDist = Math.hypot(e.clientX - activeTouchGesture.startX, e.clientY - activeTouchGesture.startY);
        if (movedDist > TUNING.touchMoveThresholdPx) {
          activeTouchGesture.moved = true;
          if (!activeTouchGesture.longPressTriggered) {
            clearTouchGestureTimer();
          }
        }

        if (!activeTouchGesture.hitActive) {
          if (activeTouchGesture.touchMode === "cameraPan") {
            panCameraByTouchDelta(dx, dy);
          } else if (activeTouchGesture.touchMode === "cameraRotate") {
            rotateCameraByTouchDelta(dx, dy);
          }
          return;
        }
      }
      if (!isGrabbing) return;
      if (grabMode === "move") {
        updateGrabMove(e.clientX, e.clientY);
      } else if (grabMode === "rotate") {
        updateGrabRotate(e.clientX, e.clientY);
      }
    }

    function onPointerUp(e) {
      pointerIsDown = false;
      if (activeTouchGesture && e.pointerId === activeTouchGesture.pointerId) {
        const now = performance.now();
        const movedDist = Math.hypot(e.clientX - activeTouchGesture.startX, e.clientY - activeTouchGesture.startY);
        const wasTap = activeTouchGesture.hitActive && !activeTouchGesture.longPressTriggered && movedDist <= TUNING.touchMoveThresholdPx;
        clearTouchGestureTimer();
        if (wasTap) {
          lastTouchTap = { time: now, x: e.clientX, y: e.clientY };
        }
        activeTouchGesture = null;
        controls.enabled = true;
        controls.update();
      }
      if (activePointerId !== null && e && e.pointerId === activePointerId) {
        renderer.domElement.releasePointerCapture(activePointerId);
        activePointerId = null;
      }
      if (isGrabbing) {
        endGrab(false);
      }
    }

    function onKeyDown(e) {
      if (!gameStarted) return;
      ensureAudio();
      if (gameOver && e.code !== "Digit1" && e.code !== "Digit2") return;
      if (e.code === "Digit1") setViewTop();
      if (e.code === "Digit2") setViewSide();
      if (e.code === "Space") {
        e.preventDefault();
        endGrab(true);
      }
    }

    function resetPlayfield(spawnStone) {
      pointerIsDown = false;
      clearTouchGestureTimer();
      activeTouchGesture = null;
      lastTouchTap = null;
      controls.enabled = true;
      controls.update();
      if (activePointerId !== null) {
        try {
          renderer.domElement.releasePointerCapture(activePointerId);
        } catch (e) {
          // Ignore release errors when pointer is already gone.
        }
        activePointerId = null;
      }
      if (isGrabbing) {
        endGrab(false);
      }
      destroyDragProbe();

      for (let i = 0; i < stones.length; i += 1) {
        const stone = stones[i];
        if (stone.body) {
          destroyStoneBody(stone);
        }
        scene.remove(stone.mesh);
      }
      stones.length = 0;
      dynamicStones.length = 0;
      activeStone = null;
      stackCount = 0;
      spawnedStoneCount = 0;
      lastReleasedPos = null;
      stabilityTargetStone = null;
      stabilityWrapEl.classList.remove("on");
      stabilityValueEl.textContent = "--";
      stabilityFillEl.style.width = "0%";
      gameOver = false;
      lastInactiveHitSfxTs = 0;
      prevInactiveContactPairs = new Set();
      lastActiveHitSfxTs = 0;
      gameOverOverlayEl.classList.remove("on");
      stackHeightEl.textContent = "0.00 m";
      updateHudStats();

      if (spawnStone) {
        spawnActiveStone();
      }
    }

    function resetCameraToStart() {
      viewTween = null;
      controls.target.set(0, 1.0, 0);
      camera.position.set(6.2, 5.6, 7.4);
      controls.enabled = true;
      controls.update();
    }

    function onBeginStacking() {
      if (gameStarted) return;
      ensureAudio();
      const hitList = SOUND.files.inactiveHits || [];
      for (let hi = 0; hi < hitList.length; hi += 1) {
        const key = `inactive_${hi}`;
        if (!audioFiles[key]) {
          audioFiles[key] = new Audio(hitList[hi]);
          audioFiles[key].preload = "auto";
        }
      }
      gameStarted = true;
      startOverlayEl.classList.add("hide");
      resetPlayfield(true);
    }

    function onGiveUp() {
      if (!gameStarted) return;
      resetPlayfield(true);
    }

    function onStackAgain() {
      gameStarted = true;
      startOverlayEl.classList.add("hide");
      resetPlayfield(true);
      resetCameraToStart();
    }

    function onResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      updateHudLayoutForViewport();
    }

    let accumulator = 0;
    let lastTs = performance.now();

    function animate() {
      requestAnimationFrame(animate);

      const now = performance.now();
      let frameDt = (now - lastTs) / 1000;
      lastTs = now;
      frameDt = Math.min(frameDt, 0.1);

      for (let i = 0; i < riverFlowMaterials.length; i += 1) {
        const m = riverFlowMaterials[i];
        if (m.map) {
          m.map.offset.y = (m.map.offset.y + frameDt * 0.18) % 1;
          m.map.offset.x = (m.map.offset.x + frameDt * 0.015) % 1;
        }
      }

      updateViewTween();

      if (activeStone && activeStone.body && isGrabbing) {
        activeStone.body.setNextKinematicRotation(activeStone.mesh.quaternion);
        activeStone.body.setNextKinematicTranslation(activeStone.mesh.position);
      }

      accumulator += frameDt;
      while (accumulator >= TUNING.fixedDt) {
        updateDynamicStoneEffects(TUNING.fixedDt);
        world.step();
        accumulator -= TUNING.fixedDt;
      }

      syncMeshesFromPhysics();
      checkGameOverByGroundContact();
      detectInactiveStoneCollisionSfx();
      updateStabilityBar();
      updateHudStats();

      if (!isGrabbing) {
        controls.enabled = true;
      }
      controls.update();
      renderer.render(scene, camera);
    }

    async function main() {
      await loadDependencies();
      initThree();
      await initRapier();
      createGround();
      animate();
    }

    main().catch((err) => {
      console.error(err);
      showFatal(String(err && err.message ? err.message : err));
    });




















