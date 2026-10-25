const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });

const ui = {
  lap: document.getElementById("lapValue"),
  time: document.getElementById("timeValue"),
  speed: document.getElementById("speedValue"),
  pause: document.getElementById("pauseValue"),
  wrongWay: document.getElementById("wrongWayValue"),
  resultPanel: document.getElementById("resultPanel"),
  finishPlace: document.getElementById("finishPlace"),
  finishTime: document.getElementById("finishTime"),
  lapTimes: document.getElementById("lapTimes"),
  sectionPanel: document.querySelector(".section-panel"),
  sectionToggle: document.getElementById("sectionToggle"),
  sectionTimes: document.getElementById("sectionTimes"),
  miniMapCanvas: document.getElementById("miniMapCanvas"),
  startOverlay: document.getElementById("startOverlay"),
  startButton: document.getElementById("startButton"),
  ghostIdInput: document.getElementById("ghostIdInput"),
  loadGhostButton: document.getElementById("loadGhostButton"),
  loadGhostStatus: document.getElementById("loadGhostStatus"),
  activeGhostLabel: document.getElementById("activeGhostLabel"),
  mobileTiltPrompt: document.getElementById("mobileTiltPrompt"),
  tiltStatus: document.getElementById("tiltStatus"),
  enableTiltButton: document.getElementById("enableTiltButton"),
  saveGhostButton: document.getElementById("saveGhostButton"),
  copyGhostButton: document.getElementById("copyGhostButton"),
  saveGhostStatus: document.getElementById("saveGhostStatus"),
  sharedGhostId: document.getElementById("sharedGhostId"),
  sharedGhostWrap: document.getElementById("sharedGhostWrap"),
  mobileControls: document.getElementById("mobileControls"),
  brakeButton: document.getElementById("brakeButton"),
  accelButton: document.getElementById("accelButton"),
  lapCountOptions: Array.from(document.querySelectorAll('input[name="lapCount"]'))
};

let audioContext = null;
let audioUnlocked = false;
let raceStartedWithAudio = false;

const CONFIG = {
  countdownStart: 8.5,
  roadWidth: 18,
  grassDrag: 0.985,
  wallBounce: 0.42,
  wallInset: 0.9,
  wallSegmentLength: 10,
  spectatorOffset: 34,
  player: {
    accel: 72,
    brake: 30,
    reverse: 16,
    drag: 0.995,
    turnRate: 2.3,
    maxSpeed: 92,
    reverseMax: -10,
    lateralGrip: 7.5,
    grassGrip: 4.4
  },
  cpu: {
    accel: 38,
    drag: 0.993,
    turnRate: 1.85,
    maxSpeed: 58,
    lateralGrip: 7.2,
    waypointReach: 10
  },
  camera: {
    distance: 36,
    height: 16,
    smoothing: 0.08
  },
  ghost: {
    sampleInterval: 0.05
  }
};

const TRACK_SCALE = 1.85;
const TRACK_SMOOTHING_PASSES = 3;
const START_CUE_LEAD = 0.08;
const COURSE_KEY = "3dar_main_v1";
const SAVE_GHOST_URL = "api/save_ghost.php";
const LOAD_GHOST_URL = "api/load_ghost.php";
const MOBILE_STEER_DEADZONE = 7;
const MOBILE_STEER_RANGE = 46;
const ROCKET_START_WINDOW = 0.5;
const ROCKET_START_DURATION = 0.75;
const ROCKET_START_ACCEL_BONUS = 108;

const RAW_TRACK_POINTS = [
  new BABYLON.Vector3(170, 0, 30),
  new BABYLON.Vector3(184, 0, -4),
  new BABYLON.Vector3(188, 0, -42),
  new BABYLON.Vector3(176, 0, -80),
  new BABYLON.Vector3(160, 0, -116),
  new BABYLON.Vector3(176, 0, -150),
  new BABYLON.Vector3(204, 0, -174),
  new BABYLON.Vector3(220, 0, -212),
  new BABYLON.Vector3(206, 0, -244),
  new BABYLON.Vector3(178, 0, -240),
  new BABYLON.Vector3(158, 0, -212),
  new BABYLON.Vector3(150, 0, -178),
  new BABYLON.Vector3(132, 0, -158),
  new BABYLON.Vector3(108, 0, -144),
  new BABYLON.Vector3(100, 0, -116),
  new BABYLON.Vector3(114, 0, -90),
  new BABYLON.Vector3(132, 0, -66),
  new BABYLON.Vector3(126, 0, -34),
  new BABYLON.Vector3(98, 0, -24),
  new BABYLON.Vector3(68, 8, -44),
  new BABYLON.Vector3(34, 18, -72),
  new BABYLON.Vector3(-4, 10, -104),
  new BABYLON.Vector3(-42, 0, -122),
  new BABYLON.Vector3(-88, 0, -106),
  new BABYLON.Vector3(-100, 0, -58),
  new BABYLON.Vector3(-80, 0, -12),
  new BABYLON.Vector3(-74, 0, 24),
  new BABYLON.Vector3(-88, 0, 42),
  new BABYLON.Vector3(-132, 0, 36),
  new BABYLON.Vector3(-168, 0, 52),
  new BABYLON.Vector3(-204, 0, 90),
  new BABYLON.Vector3(-232, 0, 124),
  new BABYLON.Vector3(-242, 0, 156),
  new BABYLON.Vector3(-228, 0, 180),
  new BABYLON.Vector3(-198, 0, 174),
  new BABYLON.Vector3(-178, 0, 146),
  new BABYLON.Vector3(-160, 0, 114),
  new BABYLON.Vector3(-138, 0, 88),
  new BABYLON.Vector3(-104, 0, 70),
  new BABYLON.Vector3(-70, 0, 48),
  new BABYLON.Vector3(-40, 0, 8),
  new BABYLON.Vector3(-8, 0, -20),
  new BABYLON.Vector3(26, 0, -40),
  new BABYLON.Vector3(64, 6, -32),
  new BABYLON.Vector3(104, 12, -10),
  new BABYLON.Vector3(132, 8, 18)
];

const TRACK_CONTROL_POINTS = RAW_TRACK_POINTS.map((point) =>
  new BABYLON.Vector3(point.x * TRACK_SCALE, point.y * TRACK_SCALE, point.z * TRACK_SCALE)
);
const TRACK_POINTS = createSmoothClosedTrack(TRACK_CONTROL_POINTS, TRACK_SMOOTHING_PASSES);
const TRACK_DISTANCE_DATA = computeTrackDistanceData(TRACK_POINTS);
const START_GATE_DISTANCE = BABYLON.Vector3.Distance(TRACK_POINTS[0], TRACK_POINTS[1]) * 0.5;
const SECTION_LENGTH = TRACK_DISTANCE_DATA.totalLength / 4;
const SECTION_DISTANCE_THRESHOLDS = [1, 2, 3].map((index) => index * SECTION_LENGTH);
const SECTION_MARKER_DISTANCES = [0, 1, 2, 3].map((index) =>
  wrapTrackDistance(START_GATE_DISTANCE + SECTION_LENGTH * index)
);
const CHECKPOINT_INDICES = SECTION_DISTANCE_THRESHOLDS.map((distance) =>
  findTrackIndexAtDistance(TRACK_DISTANCE_DATA, wrapTrackDistance(START_GATE_DISTANCE + distance))
);
const START_GATE_INDEX = findTrackIndexAtDistance(TRACK_DISTANCE_DATA, START_GATE_DISTANCE);
const START_LINE_INDEX = START_GATE_INDEX;
const START_LINE_NEXT_INDEX = (START_GATE_INDEX + 1) % TRACK_POINTS.length;
const START_LINE = createTrackLineAtDistance(START_GATE_DISTANCE);

const scene = createScene();

const world = buildTrack(scene);
const race = createRaceState(world);

setupInput(race);
resetRaceState(race);

engine.runRenderLoop(() => {
  const dt = Math.min(engine.getDeltaTime() / 1000, 0.033);
  updateRace(race, dt);
  scene.render();
});

window.addEventListener("resize", () => engine.resize());

function createSmoothClosedTrack(controlPoints, smoothingPasses) {
  let points = controlPoints.map((point) => point.clone());

  for (let pass = 0; pass < smoothingPasses; pass += 1) {
    const nextPoints = [];

    for (let i = 0; i < points.length; i += 1) {
      const current = points[i];
      const next = points[(i + 1) % points.length];
      nextPoints.push(BABYLON.Vector3.Lerp(current, next, 0.25));
      nextPoints.push(BABYLON.Vector3.Lerp(current, next, 0.75));
    }
 
    points = nextPoints;
  }

  return points;
}

function wrapTrackDistance(distance) {
  return ((distance % TRACK_DISTANCE_DATA.totalLength) + TRACK_DISTANCE_DATA.totalLength) % TRACK_DISTANCE_DATA.totalLength;
}

function getRelativeTrackDistance(trackDistance) {
  return wrapTrackDistance(trackDistance - START_GATE_DISTANCE);
}

function getSectionIndexForDistance(relativeDistance) {
  if (relativeDistance >= SECTION_DISTANCE_THRESHOLDS[2]) {
    return 3;
  }
  if (relativeDistance >= SECTION_DISTANCE_THRESHOLDS[1]) {
    return 2;
  }
  if (relativeDistance >= SECTION_DISTANCE_THRESHOLDS[0]) {
    return 1;
  }
  return 0;
}

function computeTrackDistanceData(points) {
  const cumulative = [0];
  let totalLength = 0;

  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    totalLength += BABYLON.Vector3.Distance(current, next);
    cumulative.push(totalLength);
  }

  return { cumulative, totalLength };
}

function findTrackIndexAtDistance(distanceData, distance) {
  for (let i = 0; i < distanceData.cumulative.length - 1; i += 1) {
    if (distanceData.cumulative[i + 1] >= distance) {
      return i;
    }
  }
  return 0;
}

function getTrackPointAtDistance(distance) {
  const wrappedDistance = ((distance % TRACK_DISTANCE_DATA.totalLength) + TRACK_DISTANCE_DATA.totalLength) % TRACK_DISTANCE_DATA.totalLength;

  for (let i = 0; i < TRACK_POINTS.length; i += 1) {
    const segmentStart = TRACK_DISTANCE_DATA.cumulative[i];
    const segmentEnd = TRACK_DISTANCE_DATA.cumulative[i + 1];
    if (wrappedDistance <= segmentEnd) {
      const segmentLength = Math.max(0.0001, segmentEnd - segmentStart);
      const t = BABYLON.Scalar.Clamp((wrappedDistance - segmentStart) / segmentLength, 0, 1);
      return BABYLON.Vector3.Lerp(TRACK_POINTS[i], TRACK_POINTS[(i + 1) % TRACK_POINTS.length], t);
    }
  }

  return TRACK_POINTS[0].clone();
}

function createTrackLineAtDistance(distance) {
  const center = getTrackPointAtDistance(distance);
  const previous = getTrackPointAtDistance(distance - 3);
  const next = getTrackPointAtDistance(distance + 3);
  const tangent = next.subtract(previous).normalize();
  const normal = new BABYLON.Vector3(-tangent.z, 0, tangent.x).normalize();
  const halfWidth = CONFIG.roadWidth * 0.41;

  return {
    center,
    tangent,
    p1: center.add(normal.scale(halfWidth)),
    p2: center.subtract(normal.scale(halfWidth))
  };
}

function createScene() {
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.74, 0.87, 0.98, 1);
  scene.ambientColor = new BABYLON.Color3(0.5, 0.5, 0.5);

  const camera = new BABYLON.UniversalCamera("camera", new BABYLON.Vector3(0, 12, -20), scene);
  camera.fov = 0.9;
  camera.minZ = 0.1;
  scene.activeCamera = camera;

  const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0.2, 1, 0.1), scene);
  hemi.intensity = 0.92;

  const dir = new BABYLON.DirectionalLight("dir", new BABYLON.Vector3(-0.5, -1, 0.35), scene);
  dir.position = new BABYLON.Vector3(40, 80, -20);
  dir.intensity = 0.78;

  return scene;
}

function buildTrack(scene) {
  const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 1100, height: 1100 }, scene);
  ground.position.y = -0.1;

  const groundMat = new BABYLON.StandardMaterial("groundMat", scene);
  groundMat.diffuseColor = new BABYLON.Color3(0.18, 0.42, 0.2);
  groundMat.specularColor = BABYLON.Color3.Black();
  ground.material = groundMat;

  const roadMat = new BABYLON.StandardMaterial("roadMat", scene);
  roadMat.diffuseColor = new BABYLON.Color3(0.17, 0.18, 0.2);
  roadMat.specularColor = BABYLON.Color3.Black();

  const lineMat = new BABYLON.StandardMaterial("lineMat", scene);
  lineMat.emissiveColor = new BABYLON.Color3(0.95, 0.92, 0.65);

  const barrierMat = new BABYLON.StandardMaterial("barrierMat", scene);
  barrierMat.diffuseColor = new BABYLON.Color3(0.92, 0.36, 0.2);
  barrierMat.specularColor = BABYLON.Color3.Black();

  const standMat = new BABYLON.StandardMaterial("standMat", scene);
  standMat.diffuseColor = new BABYLON.Color3(0.68, 0.71, 0.76);
  standMat.specularColor = BABYLON.Color3.Black();

  const signMat = new BABYLON.StandardMaterial("signMat", scene);
  signMat.diffuseColor = new BABYLON.Color3(0.92, 0.92, 0.96);
  signMat.emissiveColor = new BABYLON.Color3(0.08, 0.12, 0.18);
  signMat.specularColor = BABYLON.Color3.Black();

  const towerMat = new BABYLON.StandardMaterial("towerMat", scene);
  towerMat.diffuseColor = new BABYLON.Color3(0.55, 0.58, 0.64);
  towerMat.specularColor = BABYLON.Color3.Black();

  const crowdPalette = [
    new BABYLON.Color3(0.93, 0.28, 0.27),
    new BABYLON.Color3(0.24, 0.74, 0.99),
    new BABYLON.Color3(0.96, 0.84, 0.26),
    new BABYLON.Color3(0.95, 0.95, 0.95),
    new BABYLON.Color3(0.18, 0.22, 0.36)
  ];

  const roadRibbonPaths = buildRoadRibbonPaths(TRACK_POINTS, CONFIG.roadWidth);
  const road = BABYLON.MeshBuilder.CreateRibbon("road", {
    pathArray: [roadRibbonPaths.left, roadRibbonPaths.right],
    sideOrientation: BABYLON.Mesh.DOUBLESIDE,
    closeArray: true,
    closePath: false,
    updatable: false
  }, scene);
  road.material = roadMat;
  road.position.y = 0.02;

  const centerLine = BABYLON.MeshBuilder.CreateLines("centerLine", {
    points: [...TRACK_POINTS, TRACK_POINTS[0]]
  }, scene);
  centerLine.color = new BABYLON.Color3(1, 0.9, 0.4);
  centerLine.position.y = 0.08;

  const barriers = [];
  barriers.push(...createBarrierSegmentsFromEdge("left", roadRibbonPaths.left.slice(0, -1), scene, barrierMat));
  barriers.push(...createBarrierSegmentsFromEdge("right", roadRibbonPaths.right.slice(0, -1), scene, barrierMat));
  const spectators = createSpectatorAreas(roadRibbonPaths, scene, standMat, crowdPalette);
  const tracksideProps = createTracksideProps(roadRibbonPaths, scene, signMat, towerMat);
  const startGate = createStartGate(scene, signMat, towerMat);
  const sectionMarkers = createSectionMarkers(scene);

  const startLine = createCheckpointMesh("startLine", START_LINE, scene, new BABYLON.Color3(1, 1, 1));
  const checkpoints = SECTION_DISTANCE_THRESHOLDS.map((distance, index) =>
    createCheckpointMesh(
      `checkpoint-${index}`,
      createTrackLineAtDistance(wrapTrackDistance(START_GATE_DISTANCE + distance)),
      scene,
      new BABYLON.Color3(0.35, 0.72, 1)
    )
  );

  return {
    road,
    centerLine,
    barriers,
    spectators,
    tracksideProps,
    startGate,
    sectionMarkers,
    startLine,
    checkpoints,
    path: TRACK_POINTS,
    totalSegments: TRACK_POINTS.length
  };
}

function buildRoadRibbonPaths(points, roadWidth) {
  const left = [];
  const right = [];
  let previousNormal = null;

  for (let i = 0; i < points.length; i += 1) {
    const prev = points[(i - 1 + points.length) % points.length];
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const toCurrent = current.subtract(prev).normalize();
    const toNext = next.subtract(current).normalize();
    let tangent = toCurrent.add(toNext);

    if (tangent.lengthSquared() < 0.0001) {
      tangent = next.subtract(prev);
    }

    tangent = new BABYLON.Vector3(tangent.x, 0, tangent.z).normalize();

    let normal = new BABYLON.Vector3(-tangent.z, 0, tangent.x).normalize();
    if (previousNormal && BABYLON.Vector3.Dot(previousNormal, normal) < 0) {
      normal.scaleInPlace(-1);
    }

    previousNormal = normal.clone();
    left.push(new BABYLON.Vector3(current.x + normal.x * roadWidth * 0.5, current.y, current.z + normal.z * roadWidth * 0.5));
    right.push(new BABYLON.Vector3(current.x - normal.x * roadWidth * 0.5, current.y, current.z - normal.z * roadWidth * 0.5));
  }
  left.push(left[0].clone());
  right.push(right[0].clone());
  return { left, right };
}

function createBarrierSegmentsFromEdge(label, edgePoints, scene, material) {
  const segments = [];

  for (let i = 0; i < edgePoints.length; i += 1) {
    const current = edgePoints[i];
    const next = edgePoints[(i + 1) % edgePoints.length];
    const direction = next.subtract(current);
    const length = direction.length();
    const segmentCount = Math.max(1, Math.ceil(length / CONFIG.wallSegmentLength));
    const wallDepth = length / segmentCount;

    for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
      const t = (segmentIndex + 0.5) / segmentCount;
      const segmentCenter = BABYLON.Vector3.Lerp(current, next, t);
      const wall = BABYLON.MeshBuilder.CreateBox(`wall-${label}-${i}-${segmentIndex}`, {
        width: 1.2,
        height: 2,
        depth: wallDepth
      }, scene);
      wall.material = material;
      wall.position = new BABYLON.Vector3(segmentCenter.x, segmentCenter.y + 1, segmentCenter.z);
      wall.rotation.y = Math.atan2(direction.x, direction.z);
      segments.push(wall);
    }
  }

  return segments;
}

function createSpectatorAreas(roadRibbonPaths, scene, standMat, crowdPalette) {
  const zones = [];
  const placements = [
    { edge: roadRibbonPaths.left, start: 2, count: 6, height: 7, depth: 12 },
    { edge: roadRibbonPaths.right, start: 22, count: 7, height: 6, depth: 11 },
    { edge: roadRibbonPaths.left, start: 34, count: 6, height: 8, depth: 13 }
  ];

  placements.forEach((placement, placementIndex) => {
    const edge = placement.edge.slice(0, -1);

    for (let i = 0; i < placement.count; i += 1) {
      const baseIndex = (placement.start + i * 2) % edge.length;
      const current = edge[baseIndex];
      const next = edge[(baseIndex + 1) % edge.length];
      const direction = next.subtract(current).normalize();
      const outward = new BABYLON.Vector3(direction.z, 0, -direction.x).normalize();
      const midpoint = current.add(next).scale(0.5).add(outward.scale(CONFIG.spectatorOffset));

      const stand = BABYLON.MeshBuilder.CreateBox(`stand-${placementIndex}-${i}`, {
        width: 18,
        height: placement.height,
        depth: placement.depth
      }, scene);
      stand.material = standMat;
      stand.position = new BABYLON.Vector3(midpoint.x, midpoint.y + placement.height * 0.5 - 0.5, midpoint.z);
      stand.rotation.y = Math.atan2(direction.x, direction.z);
      zones.push(stand);

      crowdPalette.forEach((color, crowdIndex) => {
        const crowdMat = new BABYLON.StandardMaterial(`crowd-${placementIndex}-${i}-${crowdIndex}`, scene);
        crowdMat.diffuseColor = color;
        crowdMat.specularColor = BABYLON.Color3.Black();

        const crowd = BABYLON.MeshBuilder.CreateBox(`crowd-block-${placementIndex}-${i}-${crowdIndex}`, {
          width: 3.1,
          height: 1.6 + crowdIndex * 0.12,
          depth: placement.depth - 1.8
        }, scene);
        crowd.material = crowdMat;

        const lateralOffset = -6 + crowdIndex * 3.1;
        const right = new BABYLON.Vector3(direction.z, 0, -direction.x);
        crowd.position = stand.position
          .add(right.scale(lateralOffset))
          .add(new BABYLON.Vector3(0, placement.height * 0.5 + 0.4 + crowdIndex * 0.12, 0));
        crowd.rotation.y = stand.rotation.y;
        zones.push(crowd);
      });
    }
  });

  return zones;
}

function createTracksideProps(roadRibbonPaths, scene, signMat, towerMat) {
  const props = [];
  const propSets = [
    { edge: roadRibbonPaths.right, start: 6, step: 8, count: 3, type: "sign" },
    { edge: roadRibbonPaths.left, start: 20, step: 10, count: 2, type: "tower" },
    { edge: roadRibbonPaths.right, start: 34, step: 7, count: 3, type: "flag" }
  ];

  propSets.forEach((set, setIndex) => {
    const edge = set.edge.slice(0, -1);
    for (let i = 0; i < set.count; i += 1) {
      const index = (set.start + i * set.step) % edge.length;
      const current = edge[index];
      const next = edge[(index + 1) % edge.length];
      const direction = next.subtract(current).normalize();
      const outward = new BABYLON.Vector3(direction.z, 0, -direction.x).normalize();
      const base = current.add(next).scale(0.5).add(outward.scale(CONFIG.spectatorOffset + 16));

      if (set.type === "sign") {
        const postLeft = BABYLON.MeshBuilder.CreateBox(`sign-post-l-${setIndex}-${i}`, { width: 1, height: 8, depth: 1 }, scene);
        const postRight = BABYLON.MeshBuilder.CreateBox(`sign-post-r-${setIndex}-${i}`, { width: 1, height: 8, depth: 1 }, scene);
        const board = BABYLON.MeshBuilder.CreateBox(`sign-board-${setIndex}-${i}`, { width: 16, height: 5, depth: 1 }, scene);
        [postLeft, postRight].forEach((post, postIndex) => {
          post.material = towerMat;
          post.position = base
            .add(new BABYLON.Vector3(0, 4, 0))
            .add(new BABYLON.Vector3(direction.z, 0, -direction.x).scale(postIndex === 0 ? -6 : 6));
          props.push(post);
        });
        board.material = signMat;
        board.position = base.add(new BABYLON.Vector3(0, 7, 0));
        board.rotation.y = Math.atan2(direction.x, direction.z);
        props.push(board);
      }

      if (set.type === "tower") {
        const tower = BABYLON.MeshBuilder.CreateBox(`light-tower-${setIndex}-${i}`, { width: 2.2, height: 18, depth: 2.2 }, scene);
        const lampBar = BABYLON.MeshBuilder.CreateBox(`lamp-bar-${setIndex}-${i}`, { width: 8, height: 0.8, depth: 1.2 }, scene);
        tower.material = towerMat;
        lampBar.material = signMat;
        tower.position = base.add(new BABYLON.Vector3(0, 9, 0));
        lampBar.position = base.add(new BABYLON.Vector3(0, 17.5, 0));
        lampBar.rotation.y = Math.atan2(direction.x, direction.z);
        props.push(tower, lampBar);
      }

      if (set.type === "flag") {
        const pole = BABYLON.MeshBuilder.CreateBox(`flag-pole-${setIndex}-${i}`, { width: 0.6, height: 10, depth: 0.6 }, scene);
        pole.material = towerMat;
        pole.position = base.add(new BABYLON.Vector3(0, 5, 0));
        props.push(pole);

        const clothColors = [
          new BABYLON.Color3(0.95, 0.2, 0.2),
          new BABYLON.Color3(0.2, 0.8, 0.95),
          new BABYLON.Color3(0.98, 0.92, 0.24)
        ];

        clothColors.forEach((color, clothIndex) => {
          const clothMat = new BABYLON.StandardMaterial(`flag-mat-${setIndex}-${i}-${clothIndex}`, scene);
          clothMat.diffuseColor = color;
          clothMat.specularColor = BABYLON.Color3.Black();
          const cloth = BABYLON.MeshBuilder.CreatePlane(`flag-${setIndex}-${i}-${clothIndex}`, { width: 3.6, height: 1.2 }, scene);
          cloth.material = clothMat;
          cloth.position = base.add(new BABYLON.Vector3(1.8, 8.2 - clothIndex * 1.5, 0));
          cloth.rotation.y = Math.atan2(direction.x, direction.z) + Math.PI * 0.5;
          props.push(cloth);
        });
      }
    }
  });

  return props;
}

function createStartGate(scene, signMat, towerMat) {
  const props = [];
  const start = TRACK_POINTS[0];
  const next = TRACK_POINTS[1];
  const direction = next.subtract(start).normalize();
  const right = new BABYLON.Vector3(direction.z, 0, -direction.x).normalize();
  const gateCenter = start.add(next).scale(0.5).add(new BABYLON.Vector3(0, 0, 0));
  const gateTowerMat = towerMat.clone("start-gate-tower-mat");
  gateTowerMat.alpha = 0.62;
  const gateBannerMat = signMat.clone("start-gate-banner-mat");
  gateBannerMat.alpha = 0.48;

  const leftPost = BABYLON.MeshBuilder.CreateBox("start-gate-left", { width: 2, height: 16, depth: 2 }, scene);
  const rightPost = BABYLON.MeshBuilder.CreateBox("start-gate-right", { width: 2, height: 16, depth: 2 }, scene);
  const topBeam = BABYLON.MeshBuilder.CreateBox("start-gate-top", { width: CONFIG.roadWidth + 10, height: 2.2, depth: 2.4 }, scene);
  const banner = BABYLON.MeshBuilder.CreateBox("start-gate-banner", { width: CONFIG.roadWidth + 4, height: 4.4, depth: 0.8 }, scene);

  [leftPost, rightPost, topBeam].forEach((mesh) => {
    mesh.material = gateTowerMat;
    mesh.rotation.y = Math.atan2(direction.x, direction.z);
  });
  banner.material = gateBannerMat;
  banner.rotation.y = Math.atan2(direction.x, direction.z);

  leftPost.position = gateCenter.add(right.scale(-(CONFIG.roadWidth * 0.5 + 4))).add(new BABYLON.Vector3(0, 8, 0));
  rightPost.position = gateCenter.add(right.scale(CONFIG.roadWidth * 0.5 + 4)).add(new BABYLON.Vector3(0, 8, 0));
  topBeam.position = gateCenter.add(new BABYLON.Vector3(0, 15, 0));
  banner.position = gateCenter.add(new BABYLON.Vector3(0, 11, 0));

  props.push(leftPost, rightPost, topBeam, banner);

  const signalHousing = BABYLON.MeshBuilder.CreateBox("start-signal-housing", { width: 17, height: 4.4, depth: 2 }, scene);
  signalHousing.material = gateTowerMat;
  signalHousing.rotation.y = Math.atan2(direction.x, direction.z);
  signalHousing.position = gateCenter.add(new BABYLON.Vector3(0, 12.3, 0)).subtract(direction.scale(1.4));
  props.push(signalHousing);

  const lightMaterials = {
    redOff: createSignalMaterial(scene, new BABYLON.Color3(0.14, 0.05, 0.05), BABYLON.Color3.Black()),
    redOn: createSignalMaterial(scene, new BABYLON.Color3(0.92, 0.22, 0.18), new BABYLON.Color3(0.72, 0.16, 0.14))
  };

  const signalLights = [];
  [-6.4, -3.2, 0, 3.2, 6.4].forEach((offset, index) => {
    const light = BABYLON.MeshBuilder.CreateSphere(`start-red-light-${index}`, {
      diameter: 2.2,
      segments: 16
    }, scene);
    light.material = lightMaterials.redOff;
    light.position = gateCenter
      .add(right.scale(offset))
      .add(new BABYLON.Vector3(0, 12.35, 0))
      .subtract(direction.scale(2.4));
    signalLights.push(light);
    props.push(light);
  });

  const bannerColors = [
    new BABYLON.Color3(0.96, 0.2, 0.2),
    new BABYLON.Color3(0.18, 0.78, 0.96),
    new BABYLON.Color3(0.98, 0.9, 0.22)
  ];

  bannerColors.forEach((color, index) => {
    const sideBannerMat = new BABYLON.StandardMaterial(`side-banner-mat-${index}`, scene);
    sideBannerMat.diffuseColor = color;
    sideBannerMat.specularColor = BABYLON.Color3.Black();

    [-1, 1].forEach((side) => {
      const sideBanner = BABYLON.MeshBuilder.CreatePlane(`side-banner-${index}-${side}`, { width: 10, height: 2.6 }, scene);
      sideBanner.material = sideBannerMat;
      sideBanner.position = gateCenter
        .add(right.scale(side * (CONFIG.roadWidth * 0.5 + 10 + index * 4)))
        .add(direction.scale(-10 + index * 10))
        .add(new BABYLON.Vector3(0, 4.5, 0));
      sideBanner.rotation.y = Math.atan2(direction.x, direction.z);
      props.push(sideBanner);
    });
  });

  return {
    props,
    signalLights,
    lightMaterials
  };
}

function createSignalMaterial(scene, diffuseColor, emissiveColor) {
  const material = new BABYLON.StandardMaterial(`signal-mat-${Math.random().toString(36).slice(2)}`, scene);
  material.diffuseColor = diffuseColor;
  material.emissiveColor = emissiveColor;
  material.specularColor = BABYLON.Color3.Black();
  return material;
}

function createSectionMarkers(scene) {
  const markers = [];
  const roadEdges = buildRoadRibbonPaths(TRACK_POINTS, CONFIG.roadWidth);
  SECTION_MARKER_DISTANCES.forEach((distance, index) => {
    const pointIndex = findTrackIndexAtDistance(TRACK_DISTANCE_DATA, distance);
    const center = getTrackPointAtDistance(distance);
    const leftEdge = roadEdges.left[pointIndex];
    const next = TRACK_POINTS[(pointIndex + 1) % TRACK_POINTS.length];
    const tangent = next.subtract(center).normalize();
    const outward = leftEdge.subtract(center).normalize();
    const markerBase = leftEdge.add(outward.scale(22));

    const line = BABYLON.MeshBuilder.CreateBox(`section-line-${index}`, { width: 14, height: 0.35, depth: 1 }, scene);
    line.position = markerBase.add(new BABYLON.Vector3(0, 0.2, 0));
    line.rotation.y = Math.atan2(tangent.x, tangent.z);
    const lineMat = new BABYLON.StandardMaterial(`section-line-mat-${index}`, scene);
    lineMat.emissiveColor = new BABYLON.Color3(0.96, 0.96, 0.96);
    lineMat.diffuseColor = new BABYLON.Color3(0.96, 0.96, 0.96);
    lineMat.specularColor = BABYLON.Color3.Black();
    line.material = lineMat;
    markers.push(line);

    const textOffset = outward.scale(4).add(new BABYLON.Vector3(0, 4.2, 0));
    markers.push(createTextMarker(scene, `Sec${index + 1}`, markerBase.add(textOffset)));
  });

  return markers;
}

function createTextMarker(scene, text, position) {
  const texture = new BABYLON.DynamicTexture(`marker-texture-${text}`, { width: 256, height: 96 }, scene, false);
  texture.hasAlpha = true;
  texture.drawText(text, 36, 62, "bold 40px Segoe UI", "#ffffff", "rgba(7, 17, 31, 0.55)", true);

  const material = new BABYLON.StandardMaterial(`marker-mat-${text}`, scene);
  material.diffuseTexture = texture;
  material.emissiveTexture = texture;
  material.opacityTexture = texture;
  material.specularColor = BABYLON.Color3.Black();

  const plane = BABYLON.MeshBuilder.CreatePlane(`marker-${text}`, { width: 18, height: 7 }, scene);
  plane.material = material;
  plane.position = position;
  plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
  return plane;
}

function createCheckpointMesh(name, line, scene, color) {
  const direction = line.p2.subtract(line.p1);
  const center = line.center.clone();

  const marker = BABYLON.MeshBuilder.CreateBox(name, { width: CONFIG.roadWidth * 0.82, height: 0.2, depth: 2.2 }, scene);
  marker.position = center.clone();
  marker.position.y += 0.15;
  marker.rotation.y = Math.atan2(direction.x, direction.z);

  const mat = new BABYLON.StandardMaterial(`${name}-mat`, scene);
  mat.emissiveColor = color;
  mat.alpha = 0.55;
  marker.material = mat;

  return {
    mesh: marker,
    p1: line.p1.clone(),
    p2: line.p2.clone(),
    center
  };
}

function createRaceState(world) {
  const playerCar = createCar("player", new BABYLON.Color3(0.18, 0.8, 0.98), world.path[0], world.path[1], scene);
  const ghostCar = createCar("ghost", new BABYLON.Color3(1, 0.36, 0.22), world.path[0], world.path[1], scene);
  applyGhostVisuals(ghostCar);

  return {
    world,
    scene,
    input: {},
    cameraTarget: new BABYLON.Vector3(),
    phase: "ready",
    countdown: CONFIG.countdownStart,
    elapsed: 0,
    finishOrder: [],
    lastCountdownCue: null,
    signalReleaseDelay: 2 + Math.random(),
    startSequenceElapsed: 0,
    startGate: world.startGate,
    ghostSamples: [],
    previousGhostSamples: [],
    ghostPlaybackIndex: 0,
    ghostActive: false,
    lastGhostSampleTime: 0,
    lapsToWin: 3,
    bestSectionTimes: Array(4).fill(null),
    loadedGhostId: null,
    loadedGhostLapCount: null,
    rocketStartQueued: false,
    waitingForLaunchPress: true,
    mobile: createMobileControlState(),
    miniMap: createMiniMapState(world.path, ui.miniMapCanvas),
    playerCar,
    ghostCar
  };
}

function createMobileControlState() {
  const needsPermission = typeof DeviceOrientationEvent !== "undefined"
    && typeof DeviceOrientationEvent.requestPermission === "function";
  const orientationSupported = typeof window !== "undefined" && "DeviceOrientationEvent" in window;
  const isTouchDevice = window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;

  return {
    isTouchDevice,
    orientationSupported,
    needsPermission,
    tiltEnabled: !needsPermission && orientationSupported,
    tiltPermissionDenied: false,
    steerAxis: 0,
    accelPressed: false,
    brakePressed: false
  };
}

document.body.classList.toggle("mobile-layout", window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window);

function createRocketSmokeSystem(name, emitter, scene) {
  const texture = new BABYLON.DynamicTexture(`${name}-smoke-tex`, { width: 64, height: 64 }, scene, true);
  const ctx = texture.getContext();
  ctx.clearRect(0, 0, 64, 64);
  const gradient = ctx.createRadialGradient(32, 32, 8, 32, 32, 28);
  gradient.addColorStop(0, "rgba(255,255,255,0.9)");
  gradient.addColorStop(0.45, "rgba(220,220,220,0.55)");
  gradient.addColorStop(1, "rgba(180,180,180,0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(32, 32, 28, 0, Math.PI * 2);
  ctx.fill();
  texture.update();

  const smoke = new BABYLON.ParticleSystem(`${name}-rocket-smoke`, 250, scene);
  smoke.particleTexture = texture;
  smoke.emitter = emitter;
  smoke.minEmitBox = new BABYLON.Vector3(-0.45, 0, -0.1);
  smoke.maxEmitBox = new BABYLON.Vector3(0.45, 0.1, 0.1);
  smoke.color1 = new BABYLON.Color4(0.92, 0.92, 0.92, 0.7);
  smoke.color2 = new BABYLON.Color4(0.72, 0.72, 0.72, 0.45);
  smoke.colorDead = new BABYLON.Color4(0.4, 0.4, 0.4, 0);
  smoke.minSize = 0.45;
  smoke.maxSize = 1.2;
  smoke.minLifeTime = 0.18;
  smoke.maxLifeTime = 0.45;
  smoke.emitRate = 0;
  smoke.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
  smoke.gravity = new BABYLON.Vector3(0, 1.3, 0);
  smoke.direction1 = new BABYLON.Vector3(-0.7, 0.4, -4.4);
  smoke.direction2 = new BABYLON.Vector3(0.7, 1.2, -5.8);
  smoke.minAngularSpeed = -1.2;
  smoke.maxAngularSpeed = 1.2;
  smoke.minEmitPower = 0.6;
  smoke.maxEmitPower = 1.8;
  smoke.updateSpeed = 0.016;
  smoke.start();
  return smoke;
}

function applyGhostVisuals(car) {
  car.root.getChildMeshes().forEach((mesh) => {
    if (mesh.material && typeof mesh.material.clone === "function") {
      const cloned = mesh.material.clone(`${mesh.name}-ghost-mat`);
      cloned.alpha = 0.35;
      if (cloned.emissiveColor) {
        cloned.emissiveColor = new BABYLON.Color3(0.18, 0.72, 0.95);
      }
      mesh.material = cloned;
    }
  });
  car.root.setEnabled(false);
}

function getAudioContext() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }
    audioContext = new AudioContextClass();
  }
  return audioContext;
}

function unlockAudioContext() {
  const context = getAudioContext();
  if (context && context.state === "suspended") {
    context.resume().then(() => {
      handleAudioUnlocked();
    }).catch(() => {});
  } else if (context && context.state === "running") {
    handleAudioUnlocked();
  }
}

function handleAudioUnlocked() {
  const wasUnlocked = audioUnlocked;
  audioUnlocked = true;

  if (!wasUnlocked && typeof race !== "undefined" && race.phase === "countdown" && race.startSequenceElapsed > 0.05) {
    race.countdown = CONFIG.countdownStart;
    race.lastCountdownCue = null;
    race.signalReleaseDelay = 2 + Math.random();
    race.startSequenceElapsed = 0;
    raceStartedWithAudio = true;
    updateStartSignal(0, race.startGate);
  }
}

function playCountdownCue(isGoCue = false) {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();

  oscillator.type = isGoCue ? "triangle" : "square";
  oscillator.frequency.setValueAtTime(isGoCue ? 920 : 520, now);
  oscillator.frequency.exponentialRampToValueAtTime(isGoCue ? 1240 : 420, now + (isGoCue ? 0.28 : 0.12));

  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.exponentialRampToValueAtTime(isGoCue ? 0.12 : 0.08, now + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + (isGoCue ? 0.42 : 0.18));

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + (isGoCue ? 0.45 : 0.2));
}

function createMiniMapState(trackPoints, canvasEl) {
  const ctx = canvasEl.getContext("2d");
  const padding = 20;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  trackPoints.forEach((point) => {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  });

  const width = canvasEl.width;
  const height = canvasEl.height;
  const spanX = Math.max(1, maxX - minX);
  const spanZ = Math.max(1, maxZ - minZ);
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanZ);
  const offsetX = (width - spanX * scale) * 0.5;
  const offsetY = (height - spanZ * scale) * 0.5;

  return {
    ctx,
    width,
    height,
    scale,
    minX,
    minZ,
    offsetX,
    offsetY
  };
}

function createCar(name, color, startPoint, nextPoint, scene) {
  const root = new BABYLON.TransformNode(`${name}-root`, scene);
  const bodyMat = new BABYLON.StandardMaterial(`${name}-body-mat`, scene);
  bodyMat.diffuseColor = color;
  bodyMat.specularColor = BABYLON.Color3.Black();

  const trimMat = new BABYLON.StandardMaterial(`${name}-trim-mat`, scene);
  trimMat.diffuseColor = new BABYLON.Color3(0.96, 0.95, 0.88);
  trimMat.specularColor = BABYLON.Color3.Black();

  const seatMat = new BABYLON.StandardMaterial(`${name}-seat-mat`, scene);
  seatMat.diffuseColor = new BABYLON.Color3(0.72, 0.14, 0.16);
  seatMat.specularColor = BABYLON.Color3.Black();

  const skinMat = new BABYLON.StandardMaterial(`${name}-skin-mat`, scene);
  skinMat.diffuseColor = new BABYLON.Color3(0.96, 0.82, 0.68);
  skinMat.specularColor = BABYLON.Color3.Black();

  const hairMat = new BABYLON.StandardMaterial(`${name}-hair-mat`, scene);
  hairMat.diffuseColor = new BABYLON.Color3(0.18, 0.11, 0.07);
  hairMat.specularColor = BABYLON.Color3.Black();

  const shirtPalette = [
    new BABYLON.Color3(0.98, 0.84, 0.22),
    new BABYLON.Color3(0.18, 0.78, 0.95)
  ];

  const wheelMat = new BABYLON.StandardMaterial(`${name}-wheel-mat`, scene);
  wheelMat.diffuseColor = new BABYLON.Color3(0.08, 0.08, 0.08);
  wheelMat.specularColor = BABYLON.Color3.Black();

  const rimMat = new BABYLON.StandardMaterial(`${name}-rim-mat`, scene);
  rimMat.diffuseColor = new BABYLON.Color3(0.84, 0.86, 0.9);
  rimMat.specularColor = BABYLON.Color3.Black();

  const chassis = BABYLON.MeshBuilder.CreateBox(`${name}-chassis`, { width: 2.8, height: 0.9, depth: 5.1 }, scene);
  chassis.parent = root;
  chassis.position.y = 0.92;
  chassis.material = bodyMat;

  const hood = BABYLON.MeshBuilder.CreateBox(`${name}-hood`, { width: 2.45, height: 0.5, depth: 1.45 }, scene);
  hood.parent = root;
  hood.position.set(0, 1.26, 1.58);
  hood.material = bodyMat;

  const trunk = BABYLON.MeshBuilder.CreateBox(`${name}-trunk`, { width: 2.35, height: 0.45, depth: 1.1 }, scene);
  trunk.parent = root;
  trunk.position.set(0, 1.18, -1.74);
  trunk.material = bodyMat;

  const leftSide = BABYLON.MeshBuilder.CreateBox(`${name}-side-left`, { width: 0.3, height: 0.55, depth: 2.55 }, scene);
  leftSide.parent = root;
  leftSide.position.set(-1.08, 1.22, -0.08);
  leftSide.material = bodyMat;

  const rightSide = leftSide.clone(`${name}-side-right`);
  rightSide.parent = root;
  rightSide.position.x = 1.08;

  const noseTrim = BABYLON.MeshBuilder.CreateBox(`${name}-nose-trim`, { width: 2.18, height: 0.16, depth: 0.32 }, scene);
  noseTrim.parent = root;
  noseTrim.position.set(0, 1.1, 2.34);
  noseTrim.material = trimMat;

  const windshield = BABYLON.MeshBuilder.CreatePlane(`${name}-windshield`, { width: 2.0, height: 0.8 }, scene);
  windshield.parent = root;
  windshield.position.set(0, 1.72, 0.75);
  windshield.rotation.x = Math.PI / 5.2;
  const windshieldMat = new BABYLON.StandardMaterial(`${name}-windshield-mat`, scene);
  windshieldMat.diffuseColor = new BABYLON.Color3(0.72, 0.92, 0.98);
  windshieldMat.alpha = 0.5;
  windshieldMat.specularColor = BABYLON.Color3.Black();
  windshield.material = windshieldMat;

  [-0.58, 0.58].forEach((x, index) => {
    const seat = BABYLON.MeshBuilder.CreateBox(`${name}-seat-${index}`, { width: 0.82, height: 0.58, depth: 0.72 }, scene);
    seat.parent = root;
    seat.position.set(x, 1.2, 0.02);
    seat.material = seatMat;

    const seatBack = BABYLON.MeshBuilder.CreateBox(`${name}-seatback-${index}`, { width: 0.82, height: 0.72, depth: 0.22 }, scene);
    seatBack.parent = root;
    seatBack.position.set(x, 1.5, -0.18);
    seatBack.material = seatMat;

    const shirtMat = new BABYLON.StandardMaterial(`${name}-shirt-mat-${index}`, scene);
    shirtMat.diffuseColor = shirtPalette[index % shirtPalette.length];
    shirtMat.specularColor = BABYLON.Color3.Black();

    const torso = BABYLON.MeshBuilder.CreateCylinder(`${name}-torso-${index}`, {
      diameterTop: 0.45,
      diameterBottom: 0.58,
      height: 0.78,
      tessellation: 16
    }, scene);
    torso.parent = root;
    torso.position.set(x, 1.68, 0.02);
    torso.material = shirtMat;

    const head = BABYLON.MeshBuilder.CreateSphere(`${name}-head-${index}`, {
      diameter: 0.56,
      segments: 18
    }, scene);
    head.parent = root;
    head.position.set(x, 2.22, 0.06);
    head.material = skinMat;

    const hair = BABYLON.MeshBuilder.CreateSphere(`${name}-hair-${index}`, {
      diameterX: 0.6,
      diameterY: 0.34,
      diameterZ: 0.6,
      segments: 16
    }, scene);
    hair.parent = root;
    hair.position.set(x, 2.37, 0.04);
    hair.material = hairMat;
  });

  [
    [-1.15, 0.55, 1.45],
    [1.15, 0.55, 1.45],
    [-1.15, 0.55, -1.45],
    [1.15, 0.55, -1.45]
  ].forEach(([x, y, z], index) => {
    const wheel = BABYLON.MeshBuilder.CreateCylinder(`${name}-wheel-${index}`, {
      diameter: 0.75,
      height: 0.45,
      tessellation: 18
    }, scene);
    wheel.parent = root;
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    wheel.material = wheelMat;

    const rim = BABYLON.MeshBuilder.CreateCylinder(`${name}-rim-${index}`, {
      diameter: 0.4,
      height: 0.48,
      tessellation: 18
    }, scene);
    rim.parent = root;
    rim.rotation.z = Math.PI / 2;
    rim.position.set(x, y, z);
    rim.material = rimMat;
  });

  const smokeEmitter = new BABYLON.TransformNode(`${name}-smoke-emitter`, scene);
  smokeEmitter.parent = root;
  smokeEmitter.position.set(0, 1.1, -2.65);

  const rocketSmoke = createRocketSmokeSystem(name, smokeEmitter, scene);

  const heading = nextPoint.subtract(startPoint);
  const startYaw = Math.atan2(heading.x, heading.z);

  return {
    root,
    previousPosition: new BABYLON.Vector3(),
    sweptPosition: new BABYLON.Vector3(),
    speed: 0,
    velocity: new BABYLON.Vector3(),
    yaw: startYaw,
    lap: 0,
    nextCheckpoint: 0,
    progress: 0,
    previousProgress: 0,
    trackDistance: 0,
    previousTrackDistance: 0,
    relativeTrackDistance: 0,
    previousRelativeTrackDistance: 0,
    finished: false,
    lapStartTime: 0,
    lapTimes: [],
    currentSectionIndex: 0,
    currentSectionStartTime: 0,
    sectionTimes: Array(4).fill(null),
    lastLapMarkTime: -999,
    wrongWayTime: 0,
    isWrongWay: false,
    rocketBoostTime: 0,
    rocketSmoke,
    lineSides: {
      start: null,
      checkpoints: Array(worldCheckpointCount()).fill(null)
    },
    cpuWaypointIndex: 1,
    name
  };
}

function worldCheckpointCount() {
  return CHECKPOINT_INDICES.length;
}

function updateLapOptionLock(lapCount = null) {
  ui.lapCountOptions.forEach((option) => {
    const label = option.closest(".lap-option");
    const isLockedOut = lapCount !== null && Number(option.value) !== lapCount;
    option.disabled = isLockedOut;
    if (lapCount !== null && Number(option.value) === lapCount) {
      option.checked = true;
    }
    label?.classList.toggle("is-disabled", isLockedOut);
  });
}

function updateMobileControlUI(race) {
  const mobile = race.mobile;
  ui.mobileControls.classList.toggle("hidden", !mobile.isTouchDevice || race.phase === "ready");
  ui.mobileTiltPrompt.classList.toggle("hidden", !mobile.isTouchDevice);

  if (!mobile.isTouchDevice) {
    return;
  }

  if (!mobile.orientationSupported) {
    ui.tiltStatus.textContent = "Tilt steering is not available on this device.";
    ui.enableTiltButton.classList.add("hidden");
    return;
  }

  if (mobile.tiltEnabled) {
    ui.tiltStatus.textContent = "Tilt left or right to steer.";
    ui.enableTiltButton.classList.add("hidden");
    return;
  }

  if (mobile.tiltPermissionDenied) {
    ui.tiltStatus.textContent = "Tilt permission was denied.";
  } else {
    ui.tiltStatus.textContent = "Enable tilt steering for mobile controls.";
  }

  ui.enableTiltButton.classList.toggle("hidden", !mobile.needsPermission);
}

async function enableTiltControls(race) {
  const mobile = race.mobile;
  if (!mobile.orientationSupported) {
    updateMobileControlUI(race);
    return false;
  }

  if (!mobile.needsPermission) {
    mobile.tiltEnabled = true;
    updateMobileControlUI(race);
    return true;
  }

  try {
    const result = await DeviceOrientationEvent.requestPermission();
    mobile.tiltEnabled = result === "granted";
    mobile.tiltPermissionDenied = result !== "granted";
  } catch (error) {
    mobile.tiltEnabled = false;
    mobile.tiltPermissionDenied = true;
  }

  updateMobileControlUI(race);
  return mobile.tiltEnabled;
}

function resetRaceState(race) {
  race.phase = "ready";
  race.input.arrowup = false;
  race.input.arrowdown = false;
  race.input.steerAxis = 0;
  race.rocketStartQueued = false;
  race.waitingForLaunchPress = true;
  race.mobile.steerAxis = 0;
  race.mobile.accelPressed = false;
  race.mobile.brakePressed = false;
  race.countdown = CONFIG.countdownStart;
  race.elapsed = 0;
  race.finishOrder = [];
  race.lastCountdownCue = null;
  race.signalReleaseDelay = 2 + Math.random();
  race.startSequenceElapsed = 0;
  raceStartedWithAudio = false;
  race.ghostSamples = [];
  race.ghostPlaybackIndex = 0;
  race.ghostActive = race.previousGhostSamples.length > 1;
  race.lastGhostSampleTime = 0;
  ui.resultPanel.classList.add("hidden");
  ui.pause.classList.add("hidden");
  ui.startOverlay.classList.remove("hidden");
  ui.saveGhostStatus.textContent = "";
  ui.loadGhostStatus.textContent = race.loadedGhostId ? `Loaded Ghost ${race.loadedGhostId}` : "";
  ui.activeGhostLabel.textContent = race.loadedGhostId ? `Rival Ghost: ${race.loadedGhostId}` : "";
  ui.activeGhostLabel.classList.toggle("hidden", !race.loadedGhostId);
  updateLapOptionLock(race.loadedGhostLapCount);
  ui.sharedGhostId.textContent = "";
  ui.sharedGhostWrap.classList.add("hidden");
  updateMobileControlUI(race);
  updateStartSignal(0, race.startGate);

  placeCarAtStart(race.playerCar, 0);
  placeCarAtStart(race.ghostCar, 0);
  race.ghostCar.root.setEnabled(race.ghostActive);

  updateHUD(race);
}

function placeCarAtStart(car, lateralOffset) {
  const start = START_LINE.center;
  const forward = START_LINE.tangent.clone();
  const right = new BABYLON.Vector3(forward.z, 0, -forward.x);
  car.root.position = start
    .subtract(new BABYLON.Vector3(forward.x, 0, forward.z).scale(6))
    .add(right.scale(lateralOffset));
  car.speed = 0;
  car.velocity.set(0, 0, 0);
  car.yaw = Math.atan2(forward.x, forward.z);
  car.root.rotation.y = car.yaw;
  car.lap = 0;
  car.nextCheckpoint = 0;
  car.progress = 0;
  car.previousProgress = 0;
  car.trackDistance = 0;
  car.previousTrackDistance = 0;
  car.relativeTrackDistance = 0;
  car.previousRelativeTrackDistance = 0;
  car.finished = false;
  car.lapStartTime = 0;
  car.lapTimes = [];
  car.currentSectionIndex = 0;
  car.currentSectionStartTime = 0;
  car.sectionTimes = Array(4).fill(null);
  car.lastLapMarkTime = -999;
  car.wrongWayTime = 0;
  car.isWrongWay = false;
  car.rocketBoostTime = 0;
  if (car.rocketSmoke) {
    car.rocketSmoke.emitRate = 0;
  }
  car.lineSides = {
    start: null,
    checkpoints: Array(worldCheckpointCount()).fill(null)
  };
  snapCarToTrack(car);
  car.previousPosition.copyFrom(car.root.position);
  car.sweptPosition.copyFrom(car.root.position);
  car.progress = computeProgressOnTrack(car.root.position);
  car.previousProgress = car.progress;
  car.trackDistance = computeTrackDistance(car.root.position);
  car.previousTrackDistance = car.trackDistance;
  car.relativeTrackDistance = getRelativeTrackDistance(car.trackDistance);
  car.previousRelativeTrackDistance = car.relativeTrackDistance;
}

function setupInput(race) {
  ui.sectionPanel.classList.toggle("is-collapsed", race.mobile.isTouchDevice);
  ui.sectionToggle.addEventListener("click", () => {
    if (!race.mobile.isTouchDevice) {
      return;
    }
    ui.sectionPanel.classList.toggle("is-collapsed");
  });

  ui.startButton.addEventListener("click", async () => {
    unlockAudioContext();
    if (race.mobile.isTouchDevice && race.mobile.needsPermission && !race.mobile.tiltEnabled) {
      await enableTiltControls(race);
    }
    race.lapsToWin = Number(ui.lapCountOptions.find((option) => option.checked)?.value || 3);
    race.phase = "countdown";
    race.countdown = CONFIG.countdownStart;
    race.lastCountdownCue = null;
    race.signalReleaseDelay = 2 + Math.random();
    race.startSequenceElapsed = 0;
    race.waitingForLaunchPress = true;
    raceStartedWithAudio = false;
    ui.startOverlay.classList.add("hidden");
    updateStartSignal(0, race.startGate);
    updateMobileControlUI(race);
  });

  ui.enableTiltButton.addEventListener("click", async () => {
    await enableTiltControls(race);
  });

  ui.loadGhostButton.addEventListener("click", async () => {
    const ghostId = ui.ghostIdInput.value.trim().toUpperCase();
    if (!ghostId) {
      ui.loadGhostStatus.textContent = "Enter a Ghost ID.";
      return;
    }

    ui.loadGhostStatus.textContent = "Loading ghost...";
    try {
      await loadSharedGhost(race, ghostId);
      ui.loadGhostStatus.textContent = `Loaded Ghost ${ghostId}`;
      ui.activeGhostLabel.textContent = `Rival Ghost: ${ghostId}`;
      ui.activeGhostLabel.classList.remove("hidden");
    } catch (error) {
      ui.loadGhostStatus.textContent = error.message;
    }
  });

  ui.saveGhostButton.addEventListener("click", async () => {
    if (race.ghostSamples.length < 2) {
      ui.saveGhostStatus.textContent = "No ghost data to save yet.";
      return;
    }

    ui.saveGhostStatus.textContent = "Saving ghost...";
    ui.sharedGhostWrap.classList.add("hidden");
    try {
      const ghostId = await saveSharedGhost(race);
      ui.sharedGhostId.textContent = `Ghost ID: ${ghostId}`;
      ui.sharedGhostWrap.classList.remove("hidden");
      ui.saveGhostStatus.textContent = "Ghost saved. Share this ID.";
    } catch (error) {
      ui.saveGhostStatus.textContent = error.message;
    }
  });

  ui.copyGhostButton.addEventListener("click", async () => {
    const ghostId = ui.sharedGhostId.textContent.replace("Ghost ID:", "").trim();
    if (!ghostId) {
      return;
    }

    try {
      await navigator.clipboard.writeText(ghostId);
      ui.saveGhostStatus.textContent = "Ghost ID copied.";
    } catch (error) {
      ui.saveGhostStatus.textContent = "Could not copy automatically.";
    }
  });

  const bindTouchDrive = (button, mobileKey) => {
    const press = (event) => {
      event.preventDefault();
      unlockAudioContext();
      button.setPointerCapture?.(event.pointerId);
      if (mobileKey === "accelPressed" && race.phase === "running") {
        race.rocketStartQueued = true;
      }
      race.mobile[mobileKey] = true;
    };
    const release = (event) => {
      event.preventDefault();
      race.mobile[mobileKey] = false;
    };
    button.addEventListener("pointerdown", press);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
    button.addEventListener("touchstart", press, { passive: false });
    button.addEventListener("touchend", release, { passive: false });
    button.addEventListener("touchcancel", release, { passive: false });
  };

  bindTouchDrive(ui.accelButton, "accelPressed");
  bindTouchDrive(ui.brakeButton, "brakePressed");

  window.addEventListener("deviceorientation", (event) => {
    if (!race.mobile.tiltEnabled) {
      race.mobile.steerAxis = 0;
      return;
    }

    const gamma = typeof event.gamma === "number" ? event.gamma : 0;
    const orientationAngle = typeof window.orientation === "number"
      ? window.orientation
      : (screen.orientation?.angle ?? 0);
    const adjustedGamma = orientationAngle === 180 || orientationAngle === -180 ? -gamma : gamma;
    const magnitude = Math.abs(adjustedGamma);
    if (magnitude < MOBILE_STEER_DEADZONE) {
      race.mobile.steerAxis = 0;
      return;
    }

    const normalized = BABYLON.Scalar.Clamp(adjustedGamma / MOBILE_STEER_RANGE, -1, 1);
    race.mobile.steerAxis = normalized;
  });

  window.addEventListener("keydown", (event) => {
    unlockAudioContext();
    const key = event.key.toLowerCase();
    if ((key === "w" || key === "arrowup") && race.phase === "running" && !race.input[key]) {
      race.rocketStartQueued = true;
    }
    race.input[key] = true;

    if (event.key === "Escape") {
      event.preventDefault();
      if (race.phase === "running" || race.phase === "paused") {
        race.phase = race.phase === "paused" ? "running" : "paused";
        ui.pause.classList.toggle("hidden", race.phase !== "paused");
      }
    }

    if (event.key.toLowerCase() === "r") {
      resetRaceState(race);
    }
  });

  window.addEventListener("keyup", (event) => {
    race.input[event.key.toLowerCase()] = false;
  });

  window.addEventListener("pointerdown", unlockAudioContext, { passive: true });
}

function updateRace(race, dt) {
  if (race.phase === "ready") {
    updateCamera(race);
    updateHUD(race);
    drawMiniMap(race);
    return;
  }

  if (race.phase === "paused") {
    updateCamera(race);
    updateHUD(race);
    return;
  }

  if (race.phase === "countdown") {
    if (!audioUnlocked && !raceStartedWithAudio) {
      updateStartSignal(0, race.startGate);
    } else {
      raceStartedWithAudio = true;
      race.countdown -= dt;
      race.startSequenceElapsed += dt;
      const activeLights = getActiveStartLights(race);
      const cueLights = getActiveStartLightsAtElapsed(race.startSequenceElapsed + START_CUE_LEAD, race.signalReleaseDelay);
      if (cueLights !== race.lastCountdownCue) {
        if ((race.lastCountdownCue ?? 0) < cueLights) {
          playCountdownCue(false);
        } else if (cueLights === 0 && race.lastCountdownCue === 5) {
          playCountdownCue(true);
        }
        race.lastCountdownCue = cueLights;
      }
      if (race.startSequenceElapsed >= 5 + race.signalReleaseDelay) {
        race.phase = "running";
      }
    }
  }

  if (race.phase === "running") {
    race.elapsed += dt;
    race.input.arrowup = race.mobile.isTouchDevice ? race.mobile.accelPressed : race.input.arrowup;
    race.input.arrowdown = race.mobile.isTouchDevice ? race.mobile.brakePressed : race.input.arrowdown;
    race.input.steerAxis = race.mobile.isTouchDevice ? race.mobile.steerAxis : 0;
    if (race.waitingForLaunchPress && race.rocketStartQueued) {
      race.waitingForLaunchPress = false;
    }
    if (!race.waitingForLaunchPress && race.rocketStartQueued && race.elapsed <= ROCKET_START_WINDOW) {
      race.playerCar.rocketBoostTime = ROCKET_START_DURATION;
    }
    const playerInput = race.waitingForLaunchPress
      ? { ...race.input, w: false, arrowup: false }
      : race.input;
    race.rocketStartQueued = false;
    updatePlayerCar(race.playerCar, playerInput, dt);
    updateWrongWayState(race.playerCar, dt);
    updateGhostRecording(race, dt);
    updateGhostCar(race, race.ghostCar, dt);
    updateLapTracking(race, race.playerCar, race.elapsed);
    if (race.ghostActive) {
      updateLapTracking(race, race.ghostCar, race.elapsed);
    }
    updateRanking(race);
  }

  updateCamera(race);
  updateHUD(race);
  drawMiniMap(race);
}

function drawMiniMap(race) {
  const { ctx, width, height } = race.miniMap;
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "rgba(8, 19, 32, 0.18)";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

  const startPoint = projectMiniMapPoint(race.miniMap, START_LINE.center);

  ctx.beginPath();
  TRACK_POINTS.forEach((point, index) => {
    const mapped = projectMiniMapPoint(race.miniMap, point);
    if (index === 0) {
      ctx.moveTo(mapped.x, mapped.y);
    } else {
      ctx.lineTo(mapped.x, mapped.y);
    }
  });
  ctx.closePath();
  ctx.strokeStyle = "#7ae6ff";
  ctx.lineWidth = 10;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  ctx.beginPath();
  TRACK_POINTS.forEach((point, index) => {
    const mapped = projectMiniMapPoint(race.miniMap, point);
    if (index === 0) {
      ctx.moveTo(mapped.x, mapped.y);
    } else {
      ctx.lineTo(mapped.x, mapped.y);
    }
  });
  ctx.closePath();
  ctx.strokeStyle = "#0d1520";
  ctx.lineWidth = 6;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(startPoint.x - 3, startPoint.y - 3, 6, 6);

  if (race.ghostActive) {
    drawMiniMapCar(race.miniMap, race.ghostCar.root.position, "#ff6b4a", 4);
  }
  drawMiniMapCar(race.miniMap, race.playerCar.root.position, "#4ddcff", 5);
}

function projectMiniMapPoint(miniMap, point) {
  return {
    x: miniMap.offsetX + (point.x - miniMap.minX) * miniMap.scale,
    y: miniMap.height - (miniMap.offsetY + (point.z - miniMap.minZ) * miniMap.scale)
  };
}

function drawMiniMapCar(miniMap, position, color, radius) {
  const { ctx } = miniMap;
  const mapped = projectMiniMapPoint(miniMap, position);
  ctx.beginPath();
  ctx.arc(mapped.x, mapped.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "rgba(4, 12, 21, 0.85)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function updatePlayerCar(car, input, dt) {
  const accelerating = input.w || input.arrowup;
  const braking = input.s || input.arrowdown;
  const digitalSteer = ((input.d || input.arrowright) ? 1 : 0) - ((input.a || input.arrowleft) ? 1 : 0);
  const analogSteer = typeof input.steerAxis === "number" ? input.steerAxis : 0;
  let steerInput = Math.abs(analogSteer) > Math.abs(digitalSteer) ? analogSteer : digitalSteer;
  const wrongWayAccelScale = car.wrongWayTime >= 1 ? 0.28 : 1;

  if (accelerating) {
    car.speed += CONFIG.player.accel * wrongWayAccelScale * dt;
  } else if (braking && car.speed > 0) {
    car.speed -= CONFIG.player.brake * dt;
  } else if (braking) {
    car.speed -= CONFIG.player.reverse * dt;
  }

  car.speed *= CONFIG.player.drag;
  car.speed = BABYLON.Scalar.Clamp(car.speed, CONFIG.player.reverseMax, CONFIG.player.maxSpeed);

  const gripState = getSurfaceState(car.root.position);
  if (gripState.isGrass) {
    car.speed *= CONFIG.grassDrag;
  }

  if (car.wrongWayTime >= 5 && car.speed > 2.78) {
    car.speed = Math.max(2.78, car.speed - 42 * dt);
  }

  if (car.rocketBoostTime > 0 && accelerating) {
    car.speed += ROCKET_START_ACCEL_BONUS * dt;
    car.rocketBoostTime = Math.max(0, car.rocketBoostTime - dt);
  }
  if (car.rocketSmoke) {
    car.rocketSmoke.emitRate = car.rocketBoostTime > 0 && accelerating ? 180 : 0;
  }

  if (car.speed < -0.5) {
    steerInput *= -1;
  }

  const steeringScale = BABYLON.Scalar.Clamp(1.4 - Math.abs(car.speed) / 30, 0.55, 1.35);
  car.yaw += steerInput * CONFIG.player.turnRate * steeringScale * dt;

  moveCar(car, dt, {
    lateralGrip: gripState.isGrass ? CONFIG.player.grassGrip : CONFIG.player.lateralGrip,
    drag: gripState.isGrass ? 0.992 : 1
  });
}

function updateGhostRecording(race, dt) {
  if (race.elapsed - race.lastGhostSampleTime < CONFIG.ghost.sampleInterval && race.ghostSamples.length > 0) {
    return;
  }

  race.lastGhostSampleTime = race.elapsed;
  race.ghostSamples.push({
    time: race.elapsed,
    position: race.playerCar.root.position.clone(),
    yaw: race.playerCar.yaw,
    speed: race.playerCar.speed,
    lap: race.playerCar.lap,
    nextCheckpoint: race.playerCar.nextCheckpoint,
    progress: race.playerCar.progress
  });
}

function updateGhostCar(race, car) {
  if (!race.ghostActive || race.previousGhostSamples.length < 2) {
    car.root.setEnabled(false);
    return;
  }

  car.root.setEnabled(true);

  while (
    race.ghostPlaybackIndex < race.previousGhostSamples.length - 2 &&
    race.previousGhostSamples[race.ghostPlaybackIndex + 1].time <= race.elapsed
  ) {
    race.ghostPlaybackIndex += 1;
  }

  const current = race.previousGhostSamples[race.ghostPlaybackIndex];
  const next = race.previousGhostSamples[Math.min(race.ghostPlaybackIndex + 1, race.previousGhostSamples.length - 1)];
  const span = Math.max(0.0001, next.time - current.time);
  const t = BABYLON.Scalar.Clamp((race.elapsed - current.time) / span, 0, 1);
  const interpolatedPosition = BABYLON.Vector3.Lerp(current.position, next.position, t);

  car.previousPosition.copyFrom(car.root.position);
  car.root.position.copyFrom(interpolatedPosition);
  car.sweptPosition.copyFrom(car.root.position);
  car.yaw = BABYLON.Scalar.LerpAngle(current.yaw, next.yaw, t);
  car.root.rotation.y = car.yaw;
  car.speed = BABYLON.Scalar.Lerp(current.speed, next.speed, t);
  car.previousProgress = car.progress;
  car.previousTrackDistance = car.trackDistance;
  car.previousRelativeTrackDistance = car.relativeTrackDistance;
  car.progress = computeProgressOnTrack(car.root.position);
  car.trackDistance = computeTrackDistance(car.root.position);
  car.relativeTrackDistance = getRelativeTrackDistance(car.trackDistance);
  car.lap = t < 0.5 ? current.lap : next.lap;
  car.nextCheckpoint = t < 0.5 ? current.nextCheckpoint : next.nextCheckpoint;
}

function moveCar(car, dt, modifiers) {
  const forward = new BABYLON.Vector3(Math.sin(car.yaw), 0, Math.cos(car.yaw));
  const right = new BABYLON.Vector3(forward.z, 0, -forward.x);
  const forwardVelocity = BABYLON.Vector3.Dot(car.velocity, forward);
  const lateralVelocity = BABYLON.Vector3.Dot(car.velocity, right);
  const adjustedLateral = BABYLON.Scalar.Lerp(lateralVelocity, 0, BABYLON.Scalar.Clamp(modifiers.lateralGrip * dt, 0, 1));

  car.velocity = forward.scale(forwardVelocity + (car.speed - forwardVelocity) * 0.2)
    .add(right.scale(adjustedLateral))
    .scale(modifiers.drag);

  if (car.velocity.lengthSquared() < 0.0001) {
    car.velocity = forward.scale(car.speed);
  }

  car.previousPosition.copyFrom(car.root.position);
  car.root.position.addInPlace(car.velocity.scale(dt));
  car.sweptPosition.copyFrom(car.root.position);
  car.root.rotation.y = car.yaw;

  handleTrackCollision(car);
  snapCarToTrack(car);
  car.previousProgress = car.progress;
  car.previousTrackDistance = car.trackDistance;
  car.previousRelativeTrackDistance = car.relativeTrackDistance;
  car.progress = computeProgressOnTrack(car.root.position);
  car.trackDistance = computeTrackDistance(car.root.position);
  car.relativeTrackDistance = getRelativeTrackDistance(car.trackDistance);
}

function handleTrackCollision(car) {
  const offsetInfo = getTrackOffset(car.root.position);
  const threshold = CONFIG.roadWidth * 0.5 - CONFIG.wallInset;
  if (Math.abs(offsetInfo.distance) > threshold) {
    const clampedDistance = BABYLON.Scalar.Clamp(offsetInfo.distance, -threshold, threshold);
    const correctedPosition = offsetInfo.closest.add(offsetInfo.normal.scale(clampedDistance));
    car.root.position.x = correctedPosition.x;
    car.root.position.y = correctedPosition.y;
    car.root.position.z = correctedPosition.z;

    const normalVelocity = BABYLON.Vector3.Dot(car.velocity, offsetInfo.normal);
    const tangentVelocity = car.velocity.subtract(offsetInfo.normal.scale(normalVelocity));
    car.velocity = tangentVelocity.subtract(offsetInfo.normal.scale(normalVelocity * 0.35));
    car.speed *= CONFIG.wallBounce;
    car.velocity.scaleInPlace(0.7);
  }
}

function snapCarToTrack(car) {
  const trackInfo = getTrackOffset(car.root.position);
  car.root.position.y = trackInfo.closest.y + 0.02;
}

function getSurfaceState(position) {
  const offsetInfo = getTrackOffset(position);
  return {
    isGrass: Math.abs(offsetInfo.distance) > CONFIG.roadWidth * 0.38
  };
}

function getTrackOffset(position) {
  let nearest = null;
  let minDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < TRACK_POINTS.length; i += 1) {
    const a = TRACK_POINTS[i];
    const b = TRACK_POINTS[(i + 1) % TRACK_POINTS.length];
    const projected = projectToSegment(position, a, b);
    if (projected.euclideanDistance < minDistance) {
      minDistance = projected.euclideanDistance;
      nearest = projected;
    }
  }

  return nearest;
}

function projectToSegment(point, a, b) {
  const segment = b.subtract(a);
  const toPoint = point.subtract(a);
  const lengthSq = segment.lengthSquared();
  const t = BABYLON.Scalar.Clamp(BABYLON.Vector3.Dot(toPoint, segment) / lengthSq, 0, 1);
  const closest = a.add(segment.scale(t));
  const delta = point.subtract(closest);
  const flatDirection = new BABYLON.Vector3(segment.x, 0, segment.z).normalize();
  const normal = new BABYLON.Vector3(-flatDirection.z, 0, flatDirection.x);
  const flatDelta = new BABYLON.Vector3(delta.x, 0, delta.z);
  const signedDistance = BABYLON.Vector3.Dot(flatDelta, normal);

  return {
    closest,
    distance: signedDistance,
    euclideanDistance: delta.length(),
    normal,
    progressT: t
  };
}

function computeProgressOnTrack(position) {
  let bestProgress = 0;
  let bestAbsDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < TRACK_POINTS.length; i += 1) {
    const a = TRACK_POINTS[i];
    const b = TRACK_POINTS[(i + 1) % TRACK_POINTS.length];
    const projection = projectToSegment(position, a, b);
    const absDistance = Math.abs(projection.distance);
    if (absDistance < bestAbsDistance) {
      bestAbsDistance = absDistance;
      bestProgress = i + projection.progressT;
    }
  }

  return bestProgress;
}

function computeTrackDistance(position) {
  let bestDistanceAlongTrack = 0;
  let bestAbsDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < TRACK_POINTS.length; i += 1) {
    const a = TRACK_POINTS[i];
    const b = TRACK_POINTS[(i + 1) % TRACK_POINTS.length];
    const projection = projectToSegment(position, a, b);
    const absDistance = Math.abs(projection.distance);
    if (absDistance < bestAbsDistance) {
      bestAbsDistance = absDistance;
      const segmentLength = BABYLON.Vector3.Distance(a, b);
      bestDistanceAlongTrack = TRACK_DISTANCE_DATA.cumulative[i] + segmentLength * projection.progressT;
    }
  }

  return bestDistanceAlongTrack;
}

function getTrackTangentAtProgress(progress) {
  const index = Math.floor(progress) % TRACK_POINTS.length;
  const previous = TRACK_POINTS[(index - 1 + TRACK_POINTS.length) % TRACK_POINTS.length];
  const next = TRACK_POINTS[(index + 1) % TRACK_POINTS.length];
  return next.subtract(previous).normalize();
}

function getRelativeTrackDelta(previousDistance, currentDistance) {
  let delta = currentDistance - previousDistance;
  if (delta > TRACK_DISTANCE_DATA.totalLength * 0.5) {
    delta -= TRACK_DISTANCE_DATA.totalLength;
  } else if (delta < -TRACK_DISTANCE_DATA.totalLength * 0.5) {
    delta += TRACK_DISTANCE_DATA.totalLength;
  }
  return delta;
}

function updateWrongWayState(car, dt) {
  const tangent = getTrackTangentAtProgress(car.progress);
  const carForward = new BABYLON.Vector3(Math.sin(car.yaw), 0, Math.cos(car.yaw));
  const directionScore = BABYLON.Vector3.Dot(carForward, tangent);
  const trackDelta = getRelativeTrackDelta(car.previousRelativeTrackDistance, car.relativeTrackDistance);
  const velocityAlongTrack = BABYLON.Vector3.Dot(car.velocity, tangent);
  const movingBackwardAlongTrack = trackDelta < -0.06 || velocityAlongTrack < -4.2;
  const movingMeaningfully = Math.abs(car.speed) > 9 || Math.abs(velocityAlongTrack) > 4.2;
  const wrongWay = movingMeaningfully && movingBackwardAlongTrack && directionScore < -0.62;

  car.isWrongWay = wrongWay;
  if (wrongWay) {
    car.wrongWayTime += dt;
  } else {
    car.wrongWayTime = Math.max(0, car.wrongWayTime - dt * 2.2);
  }
}

function updateLapTracking(race, car, elapsed) {
  const movingForward = car.speed > 1;
  if (!movingForward) {
    return;
  }

  for (let i = 0; i < race.world.checkpoints.length; i += 1) {
    const checkpoint = race.world.checkpoints[i];
    const crossed = detectLineCross(car, checkpoint.p1, checkpoint.p2, car.lineSides.checkpoints, i);
    if (car.nextCheckpoint === i && crossed) {
      completeSection(race, car, elapsed, i);
      car.nextCheckpoint += 1;
    }
  }

  const crossedStart = detectLineCross(car, START_LINE.p1, START_LINE.p2, car.lineSides, "start");
  if (car.nextCheckpoint === SECTION_DISTANCE_THRESHOLDS.length && crossedStart && elapsed - car.lastLapMarkTime > 4) {
    completeSection(race, car, elapsed, 3);
    car.lap += 1;
    car.nextCheckpoint = 0;
    const lapTime = elapsed - car.lapStartTime;
    car.lapStartTime = elapsed;
    car.lapTimes.push(lapTime);
    car.currentSectionIndex = 0;
    car.currentSectionStartTime = elapsed;
    car.lastLapMarkTime = elapsed;
    if (car.lap >= race.lapsToWin && !car.finished) {
      car.finished = true;
    } else {
      car.sectionTimes = Array(4).fill(null);
    }
  }
}

function completeSection(race, car, elapsed, sectionIndex) {
  const sectionTime = elapsed - car.currentSectionStartTime;
  car.sectionTimes[sectionIndex] = sectionTime;
  car.currentSectionIndex = Math.min(sectionIndex + 1, 3);
  car.currentSectionStartTime = elapsed;

  if (car === race.playerCar) {
    const currentBest = race.bestSectionTimes[sectionIndex];
    if (currentBest === null || sectionTime < currentBest) {
      race.bestSectionTimes[sectionIndex] = sectionTime;
    }
  }
}

function worldSegmentForCheckpoint(index) {
  const pointIndex = CHECKPOINT_INDICES[index];
  return {
    from: TRACK_POINTS[pointIndex],
    to: TRACK_POINTS[(pointIndex + 1) % TRACK_POINTS.length]
  };
}

function orientation2D(a, b, c) {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function onSegment2D(a, b, c) {
  return (
    Math.min(a.x, c.x) - 0.001 <= b.x &&
    b.x <= Math.max(a.x, c.x) + 0.001 &&
    Math.min(a.z, c.z) - 0.001 <= b.z &&
    b.z <= Math.max(a.z, c.z) + 0.001
  );
}

function segmentsIntersect2D(a1, a2, b1, b2) {
  const o1 = orientation2D(a1, a2, b1);
  const o2 = orientation2D(a1, a2, b2);
  const o3 = orientation2D(b1, b2, a1);
  const o4 = orientation2D(b1, b2, a2);

  if (Math.sign(o1) !== Math.sign(o2) && Math.sign(o3) !== Math.sign(o4)) {
    return true;
  }

  if (Math.abs(o1) < 0.001 && onSegment2D(a1, b1, a2)) return true;
  if (Math.abs(o2) < 0.001 && onSegment2D(a1, b2, a2)) return true;
  if (Math.abs(o3) < 0.001 && onSegment2D(b1, a1, b2)) return true;
  if (Math.abs(o4) < 0.001 && onSegment2D(b1, a2, b2)) return true;

  return false;
}

function pointToSegmentDistance2D(point, a, b) {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const apx = point.x - a.x;
  const apz = point.z - a.z;
  const lengthSq = abx * abx + abz * abz;
  const t = lengthSq < 0.0001 ? 0 : BABYLON.Scalar.Clamp((apx * abx + apz * abz) / lengthSq, 0, 1);
  const closestX = a.x + abx * t;
  const closestZ = a.z + abz * t;
  const dx = point.x - closestX;
  const dz = point.z - closestZ;
  return Math.sqrt(dx * dx + dz * dz);
}

function detectLineCross(car, from, to, container, key) {
  const lineHeight = (from.y + to.y) * 0.5;
  const carHeight = (car.previousPosition.y + car.root.position.y) * 0.5;
  container[key] = true;

  if (Math.abs(carHeight - lineHeight) > 3.5) {
    return false;
  }

  if (segmentsIntersect2D(car.previousPosition, car.root.position, from, to)) {
    return true;
  }

  if (segmentsIntersect2D(car.previousPosition, car.sweptPosition, from, to)) {
    return true;
  }

  const previousDistance = pointToSegmentDistance2D(car.previousPosition, from, to);
  const sweptDistance = pointToSegmentDistance2D(car.sweptPosition, from, to);
  const currentDistance = pointToSegmentDistance2D(car.root.position, from, to);
  const nearestDistance = Math.min(previousDistance, sweptDistance, currentDistance);

  return nearestDistance < 1.8 && (sweptDistance < previousDistance || currentDistance < previousDistance);
}

function updateRanking(race) {
  const rivals = race.ghostActive ? [race.playerCar, race.ghostCar] : [race.playerCar];
  const standings = rivals.sort((a, b) => getRaceMetric(b) - getRaceMetric(a));
  race.playerPlace = standings.indexOf(race.playerCar) + 1;

  standings.forEach((car) => {
    if (car.finished && !race.finishOrder.includes(car.name)) {
      race.finishOrder.push(car.name);
    }
  });

  if (race.phase !== "finished" && race.playerCar.finished) {
    race.phase = "finished";
    storeGhostRun(race);
    showResults(race);
  }
}

function storeGhostRun(race) {
  if (race.ghostSamples.length > 1) {
    race.previousGhostSamples = race.ghostSamples.map((sample) => ({
      ...sample,
      position: sample.position.clone()
    }));
    race.loadedGhostId = null;
    race.loadedGhostLapCount = null;
  }
}

function getRaceMetric(car) {
  return car.lap * TRACK_DISTANCE_DATA.totalLength + car.relativeTrackDistance;
}

function showResults(race) {
  const order = (race.ghostActive ? [race.playerCar, race.ghostCar] : [race.playerCar]).sort((a, b) => {
    if (a.finished !== b.finished) {
      return a.finished ? -1 : 1;
    }
    return getRaceMetric(b) - getRaceMetric(a);
  });
  const playerPlace = order.indexOf(race.playerCar) + 1;
  ui.resultPanel.classList.remove("hidden");
  ui.finishPlace.textContent = playerPlace === 1 ? "1st" : "2nd";
  ui.finishPlace.style.color = playerPlace === 1 ? "var(--success)" : "var(--danger)";
  ui.finishTime.textContent = `Total ${formatTime(race.elapsed)}`;
  ui.lapTimes.innerHTML = "";
  ui.saveGhostStatus.textContent = "";
  ui.sharedGhostId.textContent = "";
  ui.sharedGhostWrap.classList.add("hidden");

  race.playerCar.lapTimes.slice(0, race.lapsToWin).forEach((lapTime, index) => {
    const row = document.createElement("div");
    row.textContent = `Lap ${index + 1}: ${formatTime(lapTime)}`;
    ui.lapTimes.appendChild(row);
  });
}

function updateCamera(race) {
  const car = race.playerCar;
  const forward = new BABYLON.Vector3(Math.sin(car.yaw), 0, Math.cos(car.yaw));
  const desiredPosition = car.root.position
    .subtract(forward.scale(CONFIG.camera.distance))
    .add(new BABYLON.Vector3(0, CONFIG.camera.height, 0));

  race.scene.activeCamera.position = BABYLON.Vector3.Lerp(race.scene.activeCamera.position, desiredPosition, CONFIG.camera.smoothing);
  const lookTarget = car.root.position.add(new BABYLON.Vector3(0, 2.5, 0)).add(forward.scale(6));
  race.scene.activeCamera.setTarget(lookTarget);
}

function updateHUD(race) {
  const displayedLap = race.playerCar.finished ? race.lapsToWin : Math.min(race.playerCar.lap + 1, race.lapsToWin);
  ui.lap.textContent = !race.playerCar.finished && race.playerCar.lap === race.lapsToWin - 1 && race.lapsToWin > 1
    ? "Last Lap"
    : `Lap ${displayedLap} / ${race.lapsToWin}`;
  ui.time.textContent = formatTime(race.elapsed);
  ui.speed.textContent = `${Math.max(0, Math.round(Math.abs(race.playerCar.speed) * 3.6))} km/h`;
  updateSectionHUD(race);

  if (race.phase === "countdown") {
    updateStartSignal(getActiveStartLights(race), race.startGate);
  } else if (race.phase !== "paused") {
    updateStartSignal(0, race.startGate);
  }

  ui.wrongWay.classList.toggle("hidden", !(race.phase === "running" && race.playerCar.wrongWayTime > 0.45));

  if (race.phase === "finished") {
    ui.pause.classList.add("hidden");
  }
}

function updateSectionHUD(race) {
  ui.sectionTimes.innerHTML = "";
  for (let i = 0; i < 4; i += 1) {
    const row = document.createElement("div");
    row.className = "section-row";
    const isActiveSection = !race.playerCar.finished && race.playerCar.currentSectionIndex === i;
    const currentValue = race.playerCar.sectionTimes[i] !== null
      ? race.playerCar.sectionTimes[i]
      : isActiveSection
        ? race.elapsed - race.playerCar.currentSectionStartTime
        : null;
    const current = currentValue !== null ? formatTime(currentValue) : "--:--.---";
    const best = race.bestSectionTimes[i] !== null ? formatTime(race.bestSectionTimes[i]) : "--:--.---";
    row.textContent = `S${i + 1} ${current} / Best ${best}`;
    ui.sectionTimes.appendChild(row);
  }
}

function serializeGhostSamples(samples) {
  return samples.map((sample) => ({
    time: Number(sample.time.toFixed(3)),
    position: {
      x: Number(sample.position.x.toFixed(3)),
      y: Number(sample.position.y.toFixed(3)),
      z: Number(sample.position.z.toFixed(3))
    },
    yaw: Number(sample.yaw.toFixed(6)),
    speed: Number(sample.speed.toFixed(4)),
    lap: sample.lap,
    nextCheckpoint: sample.nextCheckpoint,
    progress: Number(sample.progress.toFixed(4))
  }));
}

function deserializeGhostSamples(rawSamples) {
  return rawSamples.map((sample) => ({
    time: Number(sample.time),
    position: new BABYLON.Vector3(
      Number(sample.position.x),
      Number(sample.position.y),
      Number(sample.position.z)
    ),
    yaw: Number(sample.yaw),
    speed: Number(sample.speed),
    lap: Number(sample.lap),
    nextCheckpoint: Number(sample.nextCheckpoint),
    progress: Number(sample.progress)
  }));
}

async function saveSharedGhost(race) {
  const payload = {
    course_key: COURSE_KEY,
    lap_count: race.lapsToWin,
    total_time_ms: Math.round(race.elapsed * 1000),
    samples: serializeGhostSamples(race.ghostSamples)
  };

  const response = await fetch(SAVE_GHOST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok || !data.ghost_id) {
    throw new Error(data?.error || "Could not save ghost.");
  }

  return data.ghost_id;
}

async function loadSharedGhost(race, ghostId) {
  const response = await fetch(`${LOAD_GHOST_URL}?id=${encodeURIComponent(ghostId)}`);
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok || !data.ghost) {
    throw new Error(data?.error || "Could not load ghost.");
  }

  if (data.ghost.course_key !== COURSE_KEY) {
    throw new Error("This ghost is for a different course.");
  }

  race.previousGhostSamples = deserializeGhostSamples(data.ghost.samples);
  race.ghostActive = race.previousGhostSamples.length > 1;
  race.loadedGhostId = data.ghost.ghost_id;
  race.loadedGhostLapCount = Number(data.ghost.lap_count) || 3;
  updateLapOptionLock(race.loadedGhostLapCount);
}

function getActiveStartLights(race) {
  return getActiveStartLightsAtElapsed(race.startSequenceElapsed, race.signalReleaseDelay);
}

function getActiveStartLightsAtElapsed(elapsed, signalReleaseDelay) {
  if (elapsed < 1) return 0;
  if (elapsed < 2) return 1;
  if (elapsed < 3) return 2;
  if (elapsed < 4) return 3;
  if (elapsed < 5) return 4;
  if (elapsed < 5 + signalReleaseDelay) return 5;
  return 0;
}

function updateStartSignal(activeRedLights, startGate) {
  if (startGate) {
    startGate.signalLights.forEach((light) => {
      light.material = startGate.lightMaterials.redOff;
    });
  }

  for (let i = 0; i < activeRedLights; i += 1) {
    if (startGate?.signalLights[i]) {
      startGate.signalLights[i].material = startGate.lightMaterials.redOn;
    }
  }
}

function ordinalSuffix(value) {
  if (value === 1) return "st";
  if (value === 2) return "nd";
  if (value === 3) return "rd";
  return "th";
}

function formatTime(seconds) {
  const totalMs = Math.max(0, Math.floor(seconds * 1000));
  const minutes = Math.floor(totalMs / 60000);
  const remainingMs = totalMs % 60000;
  const secs = Math.floor(remainingMs / 1000);
  const ms = remainingMs % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}
