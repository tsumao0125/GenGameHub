
window.addEventListener('error', (e)=>{
  const hud = document.getElementById('hud');
  if (hud) hud.textContent = 'ERROR: ' + (e?.message || e);
  console.error(e);
});
window.addEventListener('unhandledrejection', (e)=>{
  const hud = document.getElementById('hud');
  if (hud) hud.textContent = 'PROMISE ERROR: ' + (e?.reason?.message || e?.reason || e);
  console.error(e);
});




(() => {
  // =========================================================
  // Config
  // =========================================================
  const MAP_W = 64, MAP_H = 32;
  const ROOMS_TRY = 13, ROOM_MIN = 5, ROOM_MAX = 12;
  const MAX_LOG = 7;

  const PLAYER_FOV = 10;
  const ENEMY_FOV_BASE = 8;

  const SAVE_KEY = 'rogue_rebuilt_save_v1';
  const MAX_INVENTORY = 22;

  const ID_EFFECTS = {
    potion: ['heal'],
    scroll: ['mapping', 'fear', 'identify'],
    wand: ['bolt', 'sleep'],
    ring: ['atk', 'def', 'fov'],
  };
  const UNID_LABEL_POOLS = {
    potion: ['Crimson vial', 'Azure vial', 'Emerald vial', 'Ivory vial'],
    scroll: ['Scribbled scroll', 'Wax-sealed scroll', 'Ancient parchment'],
    wand: ['Wooden wand', 'Glass wand', 'Twisted wand'],
    ring: ['Plain ring', 'Obsidian ring', 'Silver ring'],
  };

  // Tiles
  const WALL = '#', FLOOR = '.', DOOR_CLOSED = '+', DOOR_OPEN = '/', STAIRS_DOWN = '>', STAIRS_UP = '<';

  // Items (map glyphs)
  // Rogue-ish set: potion(!), scroll(?), food(%), weapon()), armor(]), wand(:), ring(=), gold(*)
  const GL_POTION='!', GL_SCROLL='?', GL_FOOD='%', GL_WEAPON=')', GL_ARMOR=']', GL_WAND=':', GL_RING='=', GL_GOLD='*';

  // =========================================================
  // DOM
  // =========================================================
  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d', { alpha: false });
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));

  const hudEl = document.getElementById('hud');
  const logLines = document.getElementById('logLines');

  const sHP = document.getElementById('sHP');
  const sAD = document.getElementById('sAD');
  const sFood = document.getElementById('sFood');
  const sG  = document.getElementById('sG');
  const sFT = document.getElementById('sFT');
  const sW  = document.getElementById('sW');
  const sA  = document.getElementById('sA');
  const sR  = document.getElementById('sR');

  const inputModeSel = document.getElementById('inputMode');
  const languageSel = document.getElementById('languageSelect');
  const keymapText = document.getElementById('keymapText');
  const i18n = window.RogueI18n || {
    getLang: () => 'en',
    setLang: ()=>{},
    onChange: ()=>{},
    t: (k)=>k,
    tr: (s)=>s,
  };

  // Modal
  const modal = document.getElementById('modal');
  const modalTitle = document.getElementById('modalTitle');
  const modalHint  = document.getElementById('modalHint');
  const modalBody  = document.getElementById('modalBody');

  // Buttons
  document.getElementById('btnClose').addEventListener('click', closeModal);
  modal.addEventListener('click', (e)=>{ if (e.target===modal) closeModal(); });

  document.getElementById('btnInv').addEventListener('click', () => toggleInventory());
  document.getElementById('btnHelp').addEventListener('click', () => openHelpModal());
  document.getElementById('btnRestart').addEventListener('click', () => newRun(false));
  document.getElementById('btnSave').addEventListener('click', () => saveGame());
  document.getElementById('btnLoad').addEventListener('click', () => {
    if (!loadGame()) log('No save found.');
  });

  document.getElementById('btnLegend').addEventListener('click', () => openLegendModal());
  document.getElementById('btnTraps').addEventListener('click', () => openTrapInfoModal());

  document.getElementById('btnWait').addEventListener('click', () => waitTurn());
  document.getElementById('btnPickup').addEventListener('click', () => pickUp());
  document.getElementById('btnSearch').addEventListener('click', () => searchAction());
  document.getElementById('btnDown').addEventListener('click', () => descend());
  document.getElementById('btnUp').addEventListener('click', () => ascend());

  document.querySelectorAll('button[data-m]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const [dx,dy] = btn.getAttribute('data-m').split(',').map(Number);
      tryMove(dx,dy,{fromUI:true});
    });
  });

  // =========================================================
  // Utility
  // =========================================================
  const randInt = (a,b)=> (Math.random()*(b-a+1)|0)+a;
  const clamp = (v,a,b)=> Math.max(a, Math.min(b, v));
  const key = (x,y)=> `${x},${y}`;
  const dirs8 = [
    [-1,0],[1,0],[0,-1],[0,1],
    [-1,-1],[1,-1],[-1,1],[1,1]
  ];
  const dirs4 = [[-1,0],[1,0],[0,-1],[0,1]];
  function inBounds(x,y){ return x>=0 && x<MAP_W && y>=0 && y<MAP_H; }
  function escapeHtml(s){
    return s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  }
  function makeGrid(fill){
    return Array.from({length: MAP_H}, ()=> Array.from({length: MAP_W}, ()=> fill));
  }
  function shuffled(list){
    const arr = list.slice();
    for (let i=arr.length-1;i>0;i--){
      const j = randInt(0, i);
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // =========================================================
  // Rendering scale
  // =========================================================
  function fitCanvas(){
    const wrap = document.getElementById('gameWrap');
    const rect = wrap.getBoundingClientRect();
    const aspect = (MAP_W / MAP_H);
    const w = Math.floor(rect.width - 20);
    const h = Math.floor(w / aspect);
    const cw = Math.max(520, w);
    const ch = Math.max(320, h);
    cv.style.width = cw + 'px';
    cv.style.height = ch + 'px';
    cv.width = Math.floor(cw * dpr);
    cv.height = Math.floor(ch * dpr);
  }
  window.addEventListener('resize', ()=>{ fitCanvas(); render(); });

  // =========================================================
  // Game state (multi-floor)
  // =========================================================
  let inputMode = 'hjkl';
  let floors = new Map(); // floorN -> snapshot
  let floorN = 1;
  let turn = 0;

  let map, explored, visible;
  let items;  // Map key -> item
  let traps;  // Map key -> trap
  let secrets; // Map key -> {type:'door', revealed:false}
  let monsters;
  let player;

  let logs = [];
  let logHistory = [];
  let gameOver = false;

  // Auto-walk
  let autoPath = null;
  let autoTimer = null;
  let lastPointerDest = null;
  let itemIdentity = null; // per-run unidentified label mapping
  let itemCalls = {}; // per-run player notes for unidentified item types

  // Prompt mode (direction or item select)
  let prompt = null; // {type:'dir'|'choose', title, hint, filterFn, onResolve}
  function resetItemIdentity(){
    itemIdentity = {};
    for (const kind of Object.keys(ID_EFFECTS)){
      const effects = ID_EFFECTS[kind];
      const labels = shuffled(UNID_LABEL_POOLS[kind] || []);
      itemIdentity[kind] = {};
      for (let i=0;i<effects.length;i++){
        itemIdentity[kind][effects[i]] = labels[i % labels.length] || `${kind} item`;
      }
    }
  }
  function getUnidentifiedLabel(kind, effect){
    if (!itemIdentity || !itemIdentity[kind]){
      resetItemIdentity();
    }
    return itemIdentity[kind][effect] || `${kind} item`;
  }
  function getItemCallLabel(it){
    return itemCalls?.[it.kind]?.[it.effect] || '';
  }
  function maybeAskItemCall(it){
    if (!it || it.identified) return;
    if (!itemCalls[it.kind]) itemCalls[it.kind] = {};
    const current = getItemCallLabel(it);
    const answer = window.prompt('Name this item type?', current);
    if (answer === null) return;
    const note = String(answer).trim();
    if (note){
      itemCalls[it.kind][it.effect] = note;
    } else {
      delete itemCalls[it.kind][it.effect];
    }
  }
  // =========================================================
  // Logging
  // =========================================================
  function log(msg){
    const text = i18n.tr(msg);
    logs.unshift(text);
    logs = logs.slice(0, MAX_LOG);
    logHistory.unshift(text);
    logHistory = logHistory.slice(0, 200);
    logLines.innerHTML = logs.map(s => `<div class="line">• ${escapeHtml(s)}</div>`).join('');
  }

  // =========================================================
  // Modal
  // =========================================================
  function openModal(title, hint, bodyHtml){
    modalTitle.textContent = i18n.tr(title);
    modalHint.textContent = i18n.tr(hint || '');
    modalBody.innerHTML = i18n.tr(bodyHtml);
    const closeBtn = document.getElementById('btnClose');
    if (closeBtn) closeBtn.textContent = i18n.t('btn_close');
    modal.classList.add('show');
  }
  function closeModal(){
    modal.classList.remove('show');
  }
  function isModalOpen(){
    return modal.classList.contains('show');
  }

  // Inventory toggle rule requested: Esc and i both close
  function toggleInventory(){
    if (isModalOpen()) { if (prompt && prompt.type==='inv') prompt=null; closeModal(); return; }
    openInventoryModal();
  }

  // =========================================================
  // Map helpers
  // =========================================================
  function tile(x,y){ return map[y][x]; }
  function setTile(x,y,t){ map[y][x]=t; }

  function blocksSight(x,y){
    const t = tile(x,y);
    if (t===WALL) return true;
    if (t===DOOR_CLOSED) return true;
    // secret doors are stored as WALL until revealed -> treat as wall by tile()
    return false;
  }

  function isWalkable(x,y, forMonster=false){
    const t = tile(x,y);
    if (t===WALL) return false;
    if (t===DOOR_CLOSED) return false;      // closed door blocks movement (classic: needs open first)
    // open door, floors, stairs are walkable
    return true;
  }

  function entityAt(x,y){
    if (player && player.x===x && player.y===y) return {type:'player', ref:player};

    // 笘・ｮ牙・陬・ｽｮ・嗄onsters縺碁・蛻励〒縺ｪ縺・譛ｪ蛻晄悄蛹悶〒繧り誠縺｡縺ｪ縺・ｈ縺・↓縺吶ｋ
    if (!Array.isArray(monsters)) monsters = [];

    for (const m of monsters){
      if (m && m.hp>0 && m.x===x && m.y===y) return {type:'monster', ref:m};
    }
    return null;
  }

  // =========================================================
  // Dungeon generation (rooms + corridors)
  // =========================================================
  function intersects(a,b){
    return !(a.x+a.w+1 < b.x || b.x+b.w+1 < a.x || a.y+a.h+1 < b.y || b.y+b.h+1 < a.y);
  }
  function carveRoom(r){
    for (let y=r.y; y<r.y+r.h; y++)
      for (let x=r.x; x<r.x+r.w; x++)
        setTile(x,y,FLOOR);
  }
  function carveH(x1,x2,y){
    const a=Math.min(x1,x2), b=Math.max(x1,x2);
    for (let x=a; x<=b; x++) if(inBounds(x,y)) setTile(x,y,FLOOR);
  }
  function carveV(y1,y2,x){
    const a=Math.min(y1,y2), b=Math.max(y1,y2);
    for (let y=a; y<=b; y++) if(inBounds(x,y)) setTile(x,y,FLOOR);
  }
  function carveCorridor(ax,ay,bx,by){
    if (Math.random()<0.5){ carveH(ax,bx,ay); carveV(ay,by,bx); }
    else { carveV(ay,by,ax); carveH(ax,bx,by); }
  }

  function placeOnFloor(avoid = new Set()){
    for (let tries=0; tries<800; tries++){
      const x = randInt(1, MAP_W-2);
      const y = randInt(1, MAP_H-2);
      if (tile(x,y)!==FLOOR) continue;
      if (avoid.has(key(x,y))) continue;
      if (entityAt(x,y)) continue;
      return {x,y};
    }
    return null;
  }

  function placeDoorsAndSecrets(rooms){
    // Doors: put some at corridor choke points.
    let candidates = [];
    for (let y=2;y<MAP_H-2;y++){
      for (let x=2;x<MAP_W-2;x++){
        if (tile(x,y)!==FLOOR) continue;
        // not inside rooms (avoid)
        let inside=false;
        for (const r of rooms){
          if (x>=r.x+1 && x<=r.x+r.w-2 && y>=r.y+1 && y<=r.y+r.h-2) { inside=true; break; }
        }
        if (inside) continue;
        // Avoid corner doors: only allow straight 2-way choke points,
        // and never place a door on a room corner tile.
        let isRoomCorner = false;
        for (const r of rooms){
          const corners = [
            [r.x, r.y],
            [r.x + r.w - 1, r.y],
            [r.x, r.y + r.h - 1],
            [r.x + r.w - 1, r.y + r.h - 1],
          ];
          if (corners.some(([cx,cy]) => cx===x && cy===y)) { isRoomCorner = true; break; }
        }
        if (isRoomCorner) continue;

        const n = tile(x, y-1)===FLOOR;
        const s = tile(x, y+1)===FLOOR;
        const w = tile(x-1, y)===FLOOR;
        const e = tile(x+1, y)===FLOOR;
        const floorCount = (n?1:0) + (s?1:0) + (w?1:0) + (e?1:0);
        const straightPass = (n && s && !w && !e) || (w && e && !n && !s);
        if (floorCount===2 && straightPass) candidates.push({x,y});
      }
    }
    const doorCount = 10 + Math.floor(floorN*0.7);
    for (let i=0;i<doorCount && candidates.length;i++){
      const p = candidates.splice(randInt(0,candidates.length-1),1)[0];
      // don't block stairs or start
      if (player && p.x===player.x && p.y===player.y) continue;
      setTile(p.x,p.y,DOOR_CLOSED);
    }

    // Secret doors: choose some walls adjacent to corridors/rooms; store in secrets; keep tile as WALL until revealed.
    secrets = new Map();
    let secretCandidates=[];
    for (let y=2;y<MAP_H-2;y++){
      for (let x=2;x<MAP_W-2;x++){
        if (tile(x,y)!==WALL) continue;
        const floorAdj = dirs4.some(([dx,dy]) => tile(x+dx,y+dy)===FLOOR || tile(x+dx,y+dy)===DOOR_CLOSED || tile(x+dx,y+dy)===DOOR_OPEN);
        if (!floorAdj) continue;
        secretCandidates.push({x,y});
      }
    }
    const secretCount = 6 + Math.floor(floorN*0.3);
    for (let i=0;i<secretCount && secretCandidates.length;i++){
      const p = secretCandidates.splice(randInt(0,secretCandidates.length-1),1)[0];
      secrets.set(key(p.x,p.y), {type:'door', revealed:false});
      // stays WALL visually
    }
  }

  // =========================================================
  // Items
  // =========================================================
  function makeItem(kind){
    // Identification: potions/scrolls/wands/rings start unidentified
    const unid = (nm)=> ({identified:false, unidName:nm});

    if (kind==='potion'){
      const effect = 'heal';
      const heal = 6 + Math.floor(floorN*1.2);
      return {kind, ch:GL_POTION, ...unid(getUnidentifiedLabel('potion', effect)), idName:`Potion (+${heal} HP)`, effect, heal};
    }
    if (kind==='scroll'){
      const effects = ID_EFFECTS.scroll;
      const effect = effects[randInt(0, effects.length-1)];
      const mapName = {mapping:'Scroll of Mapping', fear:'Scroll of Fear', identify:'Scroll of Identify'}[effect];
      return {kind, ch:GL_SCROLL, ...unid(getUnidentifiedLabel('scroll', effect)), idName:mapName, effect};
    }
    if (kind==='food'){
      const food = ['Ration','Apple','Jerky'][randInt(0,2)];
      const foodValue = 280 + randInt(0,120);
      return {kind, ch:GL_FOOD, identified:true, idName:`${food} (+${foodValue} food)`, unidName:`${food}`, foodValue};
    }
    if (kind==='gold'){
      const amount = 8 + randInt(0, 18) + Math.floor(floorN * 1.5);
      return {kind, ch:GL_GOLD, identified:true, idName:`Gold (${amount})`, unidName:'Gold', amount};
    }
    if (kind==='weapon'){
      const bonus = 1 + Math.floor(floorN/2);
      const nm = ['Dagger','Short Sword','Falchion','Long Sword'][randInt(0,3)];
      return {kind, ch:GL_WEAPON, identified:true, idName:`${nm} (+${bonus} ATK)`, unidName:nm, atk:bonus};
    }
    if (kind==='armor'){
      // Manual-aligned armor base DEF
      const armorTable = [
        {name:'Leather armor', def:2},
        {name:'Studded leather', def:3},
        {name:'Ring mail', def:3},
        {name:'Scale mail', def:4},
        {name:'Chain mail', def:5},
        {name:'Banded mail', def:6},
        {name:'Splint mail', def:6},
        {name:'Plate mail', def:7}
      ];
      const pick = armorTable[randInt(0, armorTable.length-1)];
      return {kind, ch:GL_ARMOR, identified:true, idName:`${pick.name} (${pick.def} DEF)`, unidName:pick.name, def:pick.def};
    }
    if (kind==='wand'){
      const effects = ID_EFFECTS.wand;
      const effect = effects[randInt(0, effects.length-1)];
      const charges = 3 + randInt(0,2);
      const idName = effect==='bolt' ? `Wand of Bolt (${charges})` : `Wand of Sleep (${charges})`;
      return {kind, ch:GL_WAND, ...unid(getUnidentifiedLabel('wand', effect)), idName, effect, charges};
    }
    if (kind==='ring'){
      const effects = ID_EFFECTS.ring;
      const effect = effects[randInt(0, effects.length-1)];
      const bonus = 1 + randInt(0,1) + Math.floor(floorN/6);
      const idName = effect==='atk' ? `Ring of Power (+${bonus} ATK)` : effect==='def' ? `Ring of Protection (+${bonus} DEF)` : `Ring of Vision (+${bonus})`;
      return {kind, ch:GL_RING, ...unid(getUnidentifiedLabel('ring', effect)), idName, effect, bonus};
    }
    return {kind, ch:'?', identified:true, idName:'Unknown', unidName:'Unknown'};
  }

  function itemName(it){
    if (it.identified) return it.idName;
    const called = getItemCallLabel(it);
    return called ? `${it.unidName} called "${called}"` : it.unidName;
  }

  function spawnItems(){
    items = new Map();
    const avoid = new Set([key(player.x,player.y)]);
    const count = 10 + Math.floor(floorN*1.0);
    const kinds = ['gold','potion','scroll','food','weapon','armor','wand','ring'];
    for (let i=0;i<count;i++){
      const p = placeOnFloor(avoid);
      if (!p) continue;
      const r = Math.random();
      let k;
      if (r<0.15) k='gold';
      else if (r<0.31) k='food';
      else if (r<0.49) k='potion';
      else if (r<0.62) k='scroll';
      else if (r<0.74) k='wand';
      else if (r<0.87) k='ring';
      else if (r<0.95) k='weapon';
      else k='armor';
      items.set(key(p.x,p.y), makeItem(k));
      avoid.add(key(p.x,p.y));
    }
  }

  // =========================================================
  // Traps
  // =========================================================
  function spawnTraps(){
    traps = new Map();
    const count = 6 + Math.floor(floorN*0.8);
    const avoid = new Set([key(player.x,player.y)]);
    for (let i=0;i<count;i++){
      const p = placeOnFloor(avoid);
      if (!p) continue;
      const dmg = 3 + Math.floor(floorN*0.9) + randInt(0,2);
      traps.set(key(p.x,p.y), {revealed:false, triggered:false, dmg});
      avoid.add(key(p.x,p.y));
    }
  }

  // =========================================================
  // Monsters
  // =========================================================
  function makeMonster(){
    const scaleHP  = Math.floor(floorN*1.6);
    const scaleATK = Math.floor(floorN*0.65);
    const scaleDEF = Math.floor(floorN/4);

    const table = [
      { ch:'g', name:'Goblin', baseHP:8,  baseATK:3, baseDEF:0, fov:ENEMY_FOV_BASE, weight:5 },
      { ch:'o', name:'Orc',    baseHP:12, baseATK:4, baseDEF:1, fov:ENEMY_FOV_BASE-1, weight:3 },
      { ch:'T', name:'Troll',  baseHP:18, baseATK:6, baseDEF:2, fov:ENEMY_FOV_BASE-2, weight:1 },
    ];
    const floorBias = Math.min(1, floorN/8);
    const weights = table.map(m => m.weight + (m.name==='Troll' ? floorBias*3 : 0));
    const sum = weights.reduce((a,b)=>a+b,0);
    let r = Math.random()*sum, idx=0;
    for (; idx<weights.length; idx++){ r -= weights[idx]; if (r<=0) break; }
    const base = table[Math.min(idx, table.length-1)];

    return {
      ch:base.ch, name:base.name,
      x:0,y:0,
      hp: base.baseHP+scaleHP,
      atk: base.baseATK+scaleATK,
      def: base.baseDEF+scaleDEF,
      fov: Math.max(4, base.fov),
      state:'idle', lastSeen:null,
    };
  }

  function spawnMonsters(){
    monsters = [];
    const count = 8 + Math.floor(floorN*1.1);
    const avoid = new Set([key(player.x,player.y)]);
    for (let i=0;i<count;i++){
      const p = placeOnFloor(avoid);
      if (!p) continue;
      const m = makeMonster();
      m.x=p.x; m.y=p.y;
      monsters.push(m);
      avoid.add(key(p.x,p.y));
    }
  }

  // =========================================================
  // Shadowcasting FOV
  // =========================================================
  function computeFOVFor(originX, originY, radius){
    const vis = makeGrid(false);
    const setVis = (x,y)=>{ if (inBounds(x,y)) vis[y][x]=true; };
    setVis(originX, originY);

    function castLight(row, start, end, xx, xy, yx, yy){
      if (start < end) return;
      let newStart = start;
      for (let i=row; i<=radius; i++){
        let blocked = false;
        let dx = -i - 1;
        let dy = -i;
        while (dx <= 0){
          dx++;
          const X = originX + dx*xx + dy*xy;
          const Y = originY + dx*yx + dy*yy;

          const lSlope = (dx - 0.5) / (dy + 0.5);
          const rSlope = (dx + 0.5) / (dy - 0.5);

          if (start < rSlope) continue;
          if (end > lSlope) break;

          if (!inBounds(X,Y)) continue;

          if (dx*dx + dy*dy <= radius*radius){
            setVis(X,Y);
          }

          if (blocked){
            if (blocksSight(X,Y)){
              newStart = rSlope;
              continue;
            } else {
              blocked = false;
              start = newStart;
            }
          } else {
            if (blocksSight(X,Y) && i < radius){
              blocked = true;
              castLight(i+1, start, lSlope, xx,xy,yx,yy);
              newStart = rSlope;
            }
          }
        }
        if (blocked) break;
      }
    }

    const mult = [
      [ 1, 0, 0, 1],[ 0, 1, 1, 0],[ 0, 1,-1, 0],[-1, 0, 0, 1],
      [-1, 0, 0,-1],[ 0,-1,-1, 0],[ 0,-1, 1, 0],[ 1, 0, 0,-1],
    ];
    for (const [xx,xy,yx,yy] of mult) castLight(1, 1.0, 0.0, xx,xy,yx,yy);
    return vis;
  }

  function computePlayerFOV(){
    visible = makeGrid(false);
    const vis = computeFOVFor(player.x, player.y, player.fov);
    for (let y=0;y<MAP_H;y++){
      for (let x=0;x<MAP_W;x++){
        if (vis[y][x]){
          visible[y][x]=true;
          explored[y][x]=true;
        }
      }
    }
  }

  // =========================================================
  // Combat & stats
  // =========================================================
  function totalAtk(){
    const ringAtk = (player.ring && player.ring.effect==='atk') ? player.ring.bonus : 0;
    return player.baseAtk + (player.weapon?.atk || 0) + ringAtk;
  }
  function totalDef(){
    const ringDef = (player.ring && player.ring.effect==='def') ? player.ring.bonus : 0;
    return player.baseDef + (player.armor?.def || 0) + ringDef;
  }

  function rollDamage(atk, def){
    const base = Math.max(0, atk - def);
    return Math.max(1, base + randInt(-1,1));
  }

  function attack(att, def, attackerName, defenderName){
    const aAtk = (att===player) ? totalAtk() : att.atk;
    const dDef = (def===player) ? totalDef() : def.def;
    const dmg = rollDamage(aAtk, dDef);
    def.hp -= dmg;
    if (def.hp<=0){
      def.hp=0;
      log(`${attackerName} hits ${defenderName} for ${dmg}. ${defenderName} dies.`);
      return {dmg, killed:true};
    } else {
      log(`${attackerName} hits ${defenderName} for ${dmg}.`);
      return {dmg, killed:false};
    }
  }

  // =========================================================
  // Hunger / food
  // =========================================================
  function foodStatus(){
    if (player.food > 700) return 'Full';
    if (player.food > 350) return 'Okay';
    if (player.food > 120) return 'Hungry';
    if (player.food > 0) return 'Starving';
    return 'Fainted';
  }

  function consumeFoodTick(){
    // each turn reduces food; starving hurts
    player.food -= 1;
    if (player.food === 120) log('You are getting hungry.');
    if (player.food === 0) log('You are starving!');
    if (player.food < 0 && (turn % 8 === 0)){
      player.hp = Math.max(0, player.hp - 1);
      log('Starvation hurts you (-1 HP).');
      if (player.hp<=0) gameOver = true;
    }
  }

  // =========================================================
  // Search (s): reveal nearby secrets/traps (classic feel)
  // =========================================================
  function searchAction(){
    if (gameOver) return;
    stopAutoWalk();
    // attempt to reveal secrets in 1-tile radius
    let found = 0;
    for (let dy=-1; dy<=1; dy++){
      for (let dx=-1; dx<=1; dx++){
        const x = player.x+dx, y = player.y+dy;
        if (!inBounds(x,y)) continue;

        const sk = key(x,y);
        const sec = secrets.get(sk);
        if (sec && !sec.revealed){
          // chance-based discovery
          if (Math.random() < 0.35){
            sec.revealed = true;
            // reveal as door (closed)
            setTile(x,y,DOOR_CLOSED);
            found++;
          }
        }
        const tr = traps.get(sk);
        if (tr && !tr.revealed && !tr.triggered){
          if (Math.random() < 0.35){
            tr.revealed = true;
            found++;
          }
        }
      }
    }
    if (found) log(`You search... found ${found} thing(s).`);
    else log('You search... nothing found.');
    endPlayerAction();
  }

  // =========================================================
  // Doors: open by bumping into closed door; close with 'c' + direction
  // =========================================================
  function openDoorAt(x,y){
    if (tile(x,y)!==DOOR_CLOSED) return false;
    setTile(x,y,DOOR_OPEN);
    log('You open the door.');
    return true;
  }
  function closeDoorAt(x,y){
    if (tile(x,y)!==DOOR_OPEN) { log('No open door there.'); return false; }
    // can't close if someone on it
    if (entityAt(x,y)) { log('Something blocks the door.'); return false; }
    setTile(x,y,DOOR_CLOSED);
    log('You close the door.');
    return true;
  }

  // =========================================================
  // Items: pickup, drop, use, equip
  // =========================================================
  function isInventoryFull(){
    return player.inv.length >= MAX_INVENTORY;
  }
  function promptInventoryFullChoice(groundKey){
    const groundItem = items.get(groundKey);
    if (!groundItem) return false;
    log(`Your pack is full (${MAX_INVENTORY}).`);
    openModal('Pack full', 'Drop or give up', `
      <div class="box">
        <div style="margin-bottom:10px;">
          Cannot pick up <b>${escapeHtml(itemName(groundItem))}</b> because your pack is full (${MAX_INVENTORY}).
        </div>
        <div class="small" style="margin-bottom:10px;">
          Drop one inventory item to pick this up, or give up this item.
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button id="btnFullDrop">Drop one item</button>
          <button id="btnFullGiveUp">Give up</button>
        </div>
      </div>
    `);
    const dropBtn = document.getElementById('btnFullDrop');
    const giveUpBtn = document.getElementById('btnFullGiveUp');
    if (dropBtn){
      dropBtn.addEventListener('click', ()=>{
        startChoosePrompt('Drop which item?', 'full', it=>true, (idx)=> dropOneAndPickGround(idx, groundKey));
      });
    }
    if (giveUpBtn){
      giveUpBtn.addEventListener('click', ()=>{
        closeModal();
        log(`You leave ${itemName(groundItem)}.`);
      });
    }
    return true;
  }
  function dropOneAndPickGround(invIdx, groundKey){
    const groundItem = items.get(groundKey);
    const dropItem = player.inv[invIdx];
    if (!groundItem || !dropItem) return;
    player.inv[invIdx] = groundItem;
    items.set(groundKey, dropItem);
    log(`Dropped ${itemName(dropItem)} and picked up ${itemName(groundItem)}.`);
    endPlayerAction();
  }
  function autoPickUpOnStep(skipAutoPickup){
    if (skipAutoPickup) return;
    const k = key(player.x, player.y);
    const it = items.get(k);
    if (!it) return;
    if (it.kind==='gold'){
      items.delete(k);
      player.gold += (it.amount || 0);
      log(`Picked up ${it.amount || 0} gold.`);
      return false;
    }
    if (isInventoryFull()){
      return promptInventoryFullChoice(k);
    }
    items.delete(k);
    player.inv.push(it);
    log(`Picked up ${itemName(it)}.`);
    return false;
  }
  function pickUp(){
    if (gameOver) return;
    stopAutoWalk();
    const it = items.get(key(player.x,player.y));
    if (!it){
      log('Nothing here.');
      return;
    }
    if (it.kind==='gold'){
      items.delete(key(player.x,player.y));
      player.gold += (it.amount || 0);
      log(`Picked up ${it.amount || 0} gold.`);
      endPlayerAction();
      return;
    }
    if (isInventoryFull()){
      promptInventoryFullChoice(key(player.x,player.y));
      return;
    }
    items.delete(key(player.x,player.y));
    player.inv.push(it);
    log(`Picked up ${itemName(it)}.`);
    endPlayerAction();
  }

  function dropItemByIndex(idx){
    const it = player.inv[idx];
    if (!it) return;
    const k = key(player.x,player.y);
    if (items.has(k)){
      log('There is already something on the ground.');
      return;
    }
    player.inv.splice(idx,1);
    items.set(k, it);
    log(`Dropped ${itemName(it)}.`);
    endPlayerAction();
  }

  function eatFoodByIndex(idx){
    const it = player.inv[idx];
    if (!it || it.kind!=='food') return;
    player.inv.splice(idx,1);
    player.food += it.foodValue;
    log(`You eat. (${foodStatus()})`);
    endPlayerAction();
  }

  function quaffPotionByIndex(idx){
    const it = player.inv[idx];
    if (!it || it.kind!=='potion') return;
    player.inv.splice(idx,1);
    it.identified = true;
    const before = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + it.heal);
    log(`You quaff ${itemName(it)} (HP ${before}->${player.hp}).`);
    endPlayerAction();
  }

  function readScrollByIndex(idx){
    const it = player.inv[idx];
    if (!it || it.kind!=='scroll') return;
    player.inv.splice(idx,1);
    it.identified = true;

    if (it.effect==='mapping'){
      // reveal explored for all non-wall
      for (let y=0;y<MAP_H;y++){
        for (let x=0;x<MAP_W;x++){
          if (tile(x,y)!==WALL) explored[y][x]=true;
        }
      }
      log(`You read ${itemName(it)}. The map is revealed!`);
    } else if (it.effect==='fear'){
      // push monsters away a bit (simple)
      for (const m of monsters){
        if (m.hp<=0) continue;
        const dx = m.x - player.x;
        const dy = m.y - player.y;
        if (Math.abs(dx)+Math.abs(dy) <= 10){
          // try step away
          const sx = dx===0 ? 0 : (dx>0 ? 1 : -1);
          const sy = dy===0 ? 0 : (dy>0 ? 1 : -1);
          const nx = m.x + sx;
          const ny = m.y + sy;
          if (inBounds(nx,ny) && isWalkable(nx,ny,true) && !entityAt(nx,ny)){
            m.x=nx; m.y=ny;
          }
        }
      }
      log(`You read ${itemName(it)}. Monsters recoil!`);
    } else if (it.effect==='identify'){
      // identify all items in inventory
      let c=0;
      for (const a of player.inv){
        if (!a.identified && (a.kind==='potion'||a.kind==='scroll'||a.kind==='wand'||a.kind==='ring')){
          a.identified = true; c++;
        }
      }
      log(`You read ${itemName(it)}. Identified ${c} item(s).`);
    } else {
      log(`You read ${itemName(it)}. Nothing happens.`);
    }
    endPlayerAction();
  }

  function wieldWeaponByIndex(idx){
    const it = player.inv[idx];
    if (!it || it.kind!=='weapon') return;
    // swap
    if (player.weapon) player.inv.push(player.weapon);
    player.weapon = it;
    player.inv.splice(idx,1);
    log(`You wield ${itemName(it)}.`);
    endPlayerAction();
  }

  function wearArmorByIndex(idx){
    const it = player.inv[idx];
    if (!it || it.kind!=='armor') return;
    if (player.armor) player.inv.push(player.armor);
    player.armor = it;
    player.inv.splice(idx,1);
    log(`You wear ${itemName(it)}.`);
    endPlayerAction();
  }

  function putOnRingByIndex(idx){
    const it = player.inv[idx];
    if (!it || it.kind!=='ring') return;
    const wasUnidentified = !it.identified;
    // only one ring slot for simplicity; swap
    if (player.ring) player.inv.push(player.ring);
    player.ring = it;
    player.inv.splice(idx,1);
    log(`You put on ${itemName(it)}.`);
    // ring of vision affects fov
    if (player.ring.effect==='fov'){
      it.identified = true;
      // apply by recompute on next turn (we still consume action)
    } else if (wasUnidentified){
      maybeAskItemCall(it);
    }
    endPlayerAction();
  }

  function takeOffRing(){
    if (!player.ring){ log('You are not wearing a ring.'); return; }
    player.inv.push(player.ring);
    log(`You take off ${itemName(player.ring)}.`);
    player.ring = null;
    endPlayerAction();
  }

  function zapWandByIndexAndDir(idx, dx, dy){
    const it = player.inv[idx];
    if (!it || it.kind!=='wand') return;
    if (it.charges<=0){
      log('The wand has no charges.');
      return;
    }
    it.identified = true;
    it.charges -= 1;

    // ray step
    let x=player.x, y=player.y;
    for (let i=0;i<10;i++){
      x += dx; y += dy;
      if (!inBounds(x,y)) break;
      if (blocksSight(x,y)) break;
      const ent = entityAt(x,y);
      if (ent && ent.type==='monster'){
        if (it.effect==='bolt'){
          const dmg = 6 + Math.floor(floorN*0.7);
          ent.ref.hp = Math.max(0, ent.ref.hp - dmg);
          log(`Bolt hits ${ent.ref.name} for ${dmg}.`);
          if (ent.ref.hp<=0) log(`${ent.ref.name} dies.`);
        } else if (it.effect==='sleep'){
          ent.ref.sleep = 4 + randInt(0,3);
          log(`${ent.ref.name} falls asleep!`);
        }
        break;
      }
      // also reveals along ray
      explored[y][x] = true;
    }
    endPlayerAction();
  }

  // =========================================================
  // Inventory UI (also used for choose prompts)
  // =========================================================
  function invLetter(idx){
    return String.fromCharCode('a'.charCodeAt(0) + idx);
  }
  function inventoryDefaultActionFor(it){
    if (!it) return null;
    if (it.kind==='food') return 'eat';
    if (it.kind==='potion') return 'quaff';
    if (it.kind==='scroll') return 'read';
    if (it.kind==='weapon') return 'wield';
    if (it.kind==='armor') return 'wear';
    if (it.kind==='ring') return 'ring';
    if (it.kind==='wand') return 'zap';
    return null;
  }
  function executeInventoryAction(act, idx){
    if (gameOver) return;
    closeModal();
    prompt = null;
    if (act==='drop') dropItemByIndex(idx);
    if (act==='eat')  eatFoodByIndex(idx);
    if (act==='quaff') quaffPotionByIndex(idx);
    if (act==='read') readScrollByIndex(idx);
    if (act==='wield') wieldWeaponByIndex(idx);
    if (act==='wear')  wearArmorByIndex(idx);
    if (act==='ring')  putOnRingByIndex(idx);
    if (act==='zap')   startZapPrompt(idx);
  }
  function resolveInventoryByLetter(ch){
    if (!prompt || prompt.type!=='inv') return false;
    const idx = ch.charCodeAt(0) - 'a'.charCodeAt(0);
    if (idx<0 || idx>=player.inv.length) return true;
    const it = player.inv[idx];
    const act = inventoryDefaultActionFor(it);
    if (!act){
      log('No default action for that item.');
      return true;
    }
    executeInventoryAction(act, idx);
    return true;
  }

  function openInventoryModal(){
    const weapon = player.weapon ? itemName(player.weapon) : 'None';
    const armor  = player.armor  ? itemName(player.armor)  : 'None';
    const ring   = player.ring   ? itemName(player.ring)   : 'None';

    const list = player.inv.length ? player.inv.map((it, idx)=>{
      const letter = invLetter(idx);
      const tag = it.identified ? '' : '<span class="muted"> (unidentified)</span>';
      return `
        <div class="itemRow">
          <div class="itemLeft">
            <div class="badge">${letter}</div>
            <div>
              <div>${escapeHtml(itemName(it))}${tag}</div>
              <div class="muted">${escapeHtml(it.kind)} / ${escapeHtml(it.ch)}</div>
            </div>
          </div>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            ${it.kind==='food'   ? `<button data-act="eat" data-idx="${idx}">Eat (e)</button>` : ''}
            ${it.kind==='potion' ? `<button data-act="quaff" data-idx="${idx}">Quaff (q)</button>` : ''}
            ${it.kind==='scroll' ? `<button data-act="read" data-idx="${idx}">Read (r)</button>` : ''}
            ${it.kind==='weapon' ? `<button data-act="wield" data-idx="${idx}">Wield (w)</button>` : ''}
            ${it.kind==='armor'  ? `<button data-act="wear" data-idx="${idx}">Wear (W)</button>` : ''}
            ${it.kind==='ring'   ? `<button data-act="ring" data-idx="${idx}">Put on</button>` : ''}
            ${it.kind==='wand'   ? `<button data-act="zap" data-idx="${idx}">Zap (z)</button>` : ''}
            <button data-act="drop" data-idx="${idx}">Drop (d)</button>
          </div>
        </div>
      `;
    }).join('') : `<div class="muted">Backpack is empty.</div>`;

    openModal(
      'Inventory',
      'Close: Esc / i',
      `
      <div class="grid2">
        <div class="box">
          <div style="display:flex; justify-content:space-between; align-items:baseline;">
            <b>Backpack</b>
            <div class="muted">Select by letter when prompted</div>
          </div>
          <div style="margin-top:10px;" id="invList">${list}</div>
        </div>
        <div class="box">
          <b>Equipped</b>
          <div style="margin-top:10px;">
            <div class="itemRow"><div class="itemLeft"><div class="badge">)</div><div>${escapeHtml(weapon)}</div></div></div>
            <div class="itemRow"><div class="itemLeft"><div class="badge">]</div><div>${escapeHtml(armor)}</div></div></div>
            <div class="itemRow"><div class="itemLeft"><div class="badge">=</div><div>${escapeHtml(ring)}</div></div></div>
            <div class="muted" style="margin-top:10px">
              Food: ${player.food} (${foodStatus()})
              <br/>Gold: ${player.gold || 0}
            </div>
          </div>
        </div>
      </div>
      `
    );
    prompt = { type:'inv' };

    modalBody.querySelectorAll('button[data-act]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const act = btn.getAttribute('data-act');
        const idx = parseInt(btn.getAttribute('data-idx'),10);
        executeInventoryAction(act, idx);
      });
    });
  }

  // =========================================================
  // Prompts (direction & choose)
  // =========================================================
  function startDirectionPrompt(title, hint, onDir){
    prompt = { type:'dir', title, hint, onDir };
    log(`${title} (${hint})`);
  }

  function startChoosePrompt(title, hint, filterFn, onChoose){
    prompt = { type:'choose', title, hint, filterFn, onChoose };
    // open lightweight chooser modal
    const options = player.inv
      .map((it, idx)=> ({it, idx}))
      .filter(({it}) => filterFn(it))
      .map(({it, idx})=>{
        const letter = invLetter(idx);
        const tag = it.identified ? '' : ' (unid)';
        return `<div class="itemRow">
          <div class="itemLeft">
            <div class="badge">${letter}</div>
            <div>${escapeHtml(itemName(it))}<span class="muted">${escapeHtml(tag)}</span></div>
          </div>
        </div>`;
      }).join('');

    openModal(title, hint + ' (press letter; Esc cancels)', options || `<div class="muted">No valid items.</div>`);
  }

  function resolveChooseByLetter(ch){
    if (!prompt || prompt.type!=='choose') return false;
    const idx = ch.charCodeAt(0) - 'a'.charCodeAt(0);
    if (idx<0 || idx>=player.inv.length) return true; // consume but do nothing
    const it = player.inv[idx];
    if (!prompt.filterFn(it)) return true; // invalid choice consumes
    closeModal();
    const fn = prompt.onChoose;
    prompt = null;
    fn(idx);
    return true;
  }

  function resolveDirectionByKey(dx,dy){
    if (!prompt || prompt.type!=='dir') return false;
    const fn = prompt.onDir;
    prompt = null;
    fn(dx,dy);
    return true;
  }

  // =========================================================
  // Commands requiring prompts
  // =========================================================
  function startCloseDoorPrompt(){
    if (gameOver) return;
    stopAutoWalk();
    startDirectionPrompt('Close door', 'direction (hjklyubn)', (dx,dy)=>{
      const x = player.x+dx, y = player.y+dy;
      if (!inBounds(x,y)) { log('Out of bounds.'); return; }
      closeDoorAt(x,y);
      endPlayerAction();
    });
  }

  function startFightPrompt(){
    if (gameOver) return;
    stopAutoWalk();
    startDirectionPrompt('Fight', 'direction (hjklyubn)', (dx,dy)=>{
      const x = player.x+dx, y = player.y+dy;
      const ent = entityAt(x,y);
      if (!ent || ent.type!=='monster'){ log('No enemy there.'); endPlayerAction(); return; }
      attack(player, ent.ref, 'You', ent.ref.name);
      endPlayerAction();
    });
  }

  function startZapPrompt(wandIdx){
    if (gameOver) return;
    stopAutoWalk();
    startDirectionPrompt('Zap', 'direction (hjklyubn)', (dx,dy)=>{
      zapWandByIndexAndDir(wandIdx, dx, dy);
    });
  }

  function placeThrownItemNear(x,y,it){
    const cands = [[x,y], ...dirs8.map(([dx,dy])=>[x+dx,y+dy]), [player.x,player.y]];
    for (const [cx,cy] of cands){
      if (!inBounds(cx,cy)) continue;
      if (!isWalkable(cx,cy,false)) continue;
      if (entityAt(cx,cy)) continue;
      const k = key(cx,cy);
      if (items.has(k)) continue;
      items.set(k, it);
      return true;
    }
    return false;
  }

  function throwItemByIndexAndDir(idx, dx, dy){
    const it = player.inv[idx];
    if (!it){
      log('No such item to throw.');
      return;
    }
    player.inv.splice(idx,1);
    const thrownName = itemName(it);

    let x = player.x, y = player.y;
    let hitMonster = false;

    for (let step=0; step<6; step++){
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx,ny)) break;
      if (tile(nx,ny)===WALL || tile(nx,ny)===DOOR_CLOSED) break;
      x = nx; y = ny;

      const ent = entityAt(x,y);
      if (ent && ent.type==='monster'){
        const base = (it.kind==='weapon') ? (it.atk || 1) : 1;
        const dmg = Math.max(1, base + randInt(0,2));
        ent.ref.hp -= dmg;
        log(`You throw ${thrownName}. It hits ${ent.ref.name} for ${dmg}.`);
        if (ent.ref.hp<=0){
          ent.ref.hp=0;
          log(`${ent.ref.name} dies.`);
        }
        hitMonster = true;
        break;
      }
    }

    if (!hitMonster){
      log(`You throw ${thrownName}.`);
    }

    if (!placeThrownItemNear(x,y,it)){
      log(`${thrownName} is lost.`);
    }
    endPlayerAction();
  }

  function startThrowDirectionPrompt(itemIdx){
    if (gameOver) return;
    stopAutoWalk();
    startDirectionPrompt('Throw', 'direction (hjklyubn)', (dx,dy)=>{
      throwItemByIndexAndDir(itemIdx, dx, dy);
    });
  }

  function startThrowChoosePrompt(){
    if (gameOver) return;
    stopAutoWalk();
    startChoosePrompt('Throw', 't', it=>true, (idx)=> startThrowDirectionPrompt(idx));
  }

  function startMovePrompt(){
    if (gameOver) return;
    stopAutoWalk();
    startDirectionPrompt('Move', 'direction (hjklyubn)', (dx,dy)=> tryMove(dx,dy,{fromUI:true, skipAutoPickup:true}));
  }

  // =========================================================
  // Auto-walk (A*)
  // =========================================================
  function heuristic(a,b){ return Math.abs(a.x-b.x)+Math.abs(a.y-b.y); }
  function canPathThrough(x,y){
    const t = tile(x,y);
    if (t===WALL) return false;
    if (t===DOOR_CLOSED) return false; // auto-walk won't open doors
    if (entityAt(x,y)?.type==='monster') return false;
    return true;
  }
  function aStar(start, goal){
    const startK=key(start.x,start.y), goalK=key(goal.x,goal.y);
    const open=new Map(); const came=new Map(); const gScore=new Map(); const fScore=new Map();
    const closed=new Set();

    open.set(startK, {x:start.x,y:start.y});
    gScore.set(startK,0);
    fScore.set(startK,heuristic(start,goal));

    function popLowest(){
      let bestK=null, bestF=Infinity;
      for (const k of open.keys()){
        const f=fScore.get(k) ?? Infinity;
        if (f<bestF){ bestF=f; bestK=k; }
      }
      if (!bestK) return null;
      const n=open.get(bestK);
      open.delete(bestK);
      return n;
    }

    while (open.size){
      const cur = popLowest(); if (!cur) break;
      const curK = key(cur.x,cur.y);
      if (curK===goalK){
        const path=[];
        let k=curK;
        while (k!==startK){
          const [x,y]=k.split(',').map(Number);
          path.push([x,y]);
          k=came.get(k); if (!k) break;
        }
        path.reverse();
        return path;
      }
      closed.add(curK);

      for (const [dx,dy] of dirs4){
        const nx=cur.x+dx, ny=cur.y+dy;
        if (!inBounds(nx,ny)) continue;
        if (!canPathThrough(nx,ny)) continue;
        const nk=key(nx,ny);
        if (closed.has(nk)) continue;
        const tentative=(gScore.get(curK)??Infinity)+1;
        if (!open.has(nk) || tentative < (gScore.get(nk)??Infinity)){
          came.set(nk,curK);
          gScore.set(nk,tentative);
          fScore.set(nk,tentative+heuristic({x:nx,y:ny},goal));
          open.set(nk,{x:nx,y:ny});
        }
      }
    }
    return null;
  }

  function stopAutoWalk(reason){
    if (autoTimer){ clearInterval(autoTimer); autoTimer=null; }
    autoPath=null; lastPointerDest=null;
    if (reason) log(reason);
  }

  function startAutoWalkTo(destX,destY){
    if (gameOver) return;
    if (!inBounds(destX,destY)) return;
    if (!explored[destY][destX]) { log('Destination must be explored.'); return; }
    if (!canPathThrough(destX,destY)) { log('Cannot path to that tile.'); return; }
    const path = aStar({x:player.x,y:player.y},{x:destX,y:destY});
    if (!path || !path.length){ log('No path found.'); return; }

    autoPath=path;
    lastPointerDest={x:destX,y:destY};

    if (autoTimer) clearInterval(autoTimer);
    autoTimer=setInterval(()=>{
      if (!autoPath || !autoPath.length){ stopAutoWalk(); render(); return; }
      // stop if enemy spotted
      if (monsters.some(m=>m.hp>0 && visible[m.y]?.[m.x])){ stopAutoWalk('Auto-walk stopped: enemy spotted.'); render(); return; }

      const [nx,ny] = autoPath.shift();
      if (!canPathThrough(nx,ny)){ stopAutoWalk('Auto-walk stopped: path blocked.'); render(); return; }
      tryMove(nx-player.x, ny-player.y, {fromAuto:true, silent:true});
      if (autoPath && !autoPath.length){ stopAutoWalk(); render(); }
    }, 60);
  }

  // =========================================================
  // Pointer to grid
  // =========================================================
  function canvasToGrid(clientX, clientY){
    const rect = cv.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;

    const w = rect.width, h = rect.height;
    const cellW = Math.floor(w / MAP_W);
    const cellH = Math.floor(h / MAP_H);
    const cell = Math.max(12, Math.min(cellW, cellH));
    const offX = Math.floor((w - cell*MAP_W)/2);
    const offY = Math.floor((h - cell*MAP_H)/2);

    const gx = Math.floor((px - offX)/cell);
    const gy = Math.floor((py - offY)/cell);
    if (!inBounds(gx,gy)) return null;
    return {x:gx,y:gy};
  }

  function handlePointer(clientX, clientY){
    if (inputMode!=='pointer') return;
    if (gameOver) return;
    if (isModalOpen()) return;

    const g = canvasToGrid(clientX, clientY);
    if (!g) return;

    if (lastPointerDest && lastPointerDest.x===g.x && lastPointerDest.y===g.y){
      stopAutoWalk('Auto-walk cancelled.');
      render();
      return;
    }
    startAutoWalkTo(g.x,g.y);
  }

  cv.addEventListener('click', e => handlePointer(e.clientX, e.clientY));
  cv.addEventListener('touchend', (e)=>{
    const t = e.changedTouches?.[0];
    if (t) handlePointer(t.clientX, t.clientY);
  }, {passive:true});

  // =========================================================
  // Monster AI (enemy FOV + chase/search)
  // =========================================================
  function buildDistanceMap(tx,ty){
    const dist = makeGrid(Infinity);
    const q=[];
    dist[ty][tx]=0; q.push([tx,ty]);
    while(q.length){
      const [x,y]=q.shift();
      const d=dist[y][x];
      for (const [dx,dy] of dirs4){
        const nx=x+dx, ny=y+dy;
        if (!inBounds(nx,ny)) continue;
        if (!isWalkable(nx,ny,true)) continue;
        if (dist[ny][nx] <= d+1) continue;
        dist[ny][nx]=d+1;
        q.push([nx,ny]);
      }
    }
    return dist;
  }

  function monsterTurn(){
    // if player dead, monsters stop
    if (player.hp<=0) return;

    const distToPlayer = buildDistanceMap(player.x, player.y);

    for (const m of monsters){
      if (m.hp<=0) continue;

      // sleep
      if (m.sleep && m.sleep>0){
        m.sleep -= 1;
        continue;
      }

      // adjacent attack
      const dx = player.x - m.x;
      const dy = player.y - m.y;
      if (Math.abs(dx)<=1 && Math.abs(dy)<=1){
        attack(m, player, m.name, 'You');
        if (player.hp<=0){
          gameOver = true;
          log('You died. Press New Run.');
        }
        continue;
      }

      // enemy FOV
      const mVis = computeFOVFor(m.x,m.y,m.fov);
      const sees = mVis[player.y]?.[player.x]===true;

      if (sees){
        m.state='chase';
        m.lastSeen={x:player.x,y:player.y,turn};
      } else if (m.state==='chase'){
        m.state='search';
      }

      let target=null;
      if (m.state==='chase'){
        target={x:player.x,y:player.y};
      } else if (m.state==='search' && m.lastSeen){
        const age = turn - m.lastSeen.turn;
        if (age<=12) target={x:m.lastSeen.x,y:m.lastSeen.y};
        else { m.state='idle'; m.lastSeen=null; }
      }

      if (target){
        const dist = (m.state==='chase') ? distToPlayer : buildDistanceMap(target.x,target.y);
        let best=null, bestD=dist[m.y][m.x];
        for (const [vx,vy] of dirs4){
          const nx=m.x+vx, ny=m.y+vy;
          if (!inBounds(nx,ny)) continue;
          if (!isWalkable(nx,ny,true)) continue;
          if (entityAt(nx,ny)) continue;
          const nd = dist[ny][nx];
          if (nd < bestD){
            bestD=nd; best=[nx,ny];
          }
        }
        if (best){ m.x=best[0]; m.y=best[1]; }
      } else {
        // wander
        if (Math.random()<0.55) continue;
        const [vx,vy] = dirs4[randInt(0,3)];
        const nx=m.x+vx, ny=m.y+vy;
        if (!inBounds(nx,ny)) continue;
        if (!isWalkable(nx,ny,true)) continue;
        if (entityAt(nx,ny)) continue;
        m.x=nx; m.y=ny;
      }
    }
  }

  // =========================================================
  // Turn lifecycle
  // =========================================================
  function endPlayerAction(){
    turn += 1;

    // hunger tick
    consumeFoodTick();
    if (player.hp<=0){ gameOver=true; }

    // apply ring vision
    player.fov = PLAYER_FOV + ((player.ring && player.ring.effect==='fov') ? player.ring.bonus : 0);

    // monsters
    monsterTurn();

    // compute FOV
    computePlayerFOV();

    // trap trigger
    const tr = traps.get(key(player.x,player.y));
    if (tr && !tr.triggered){
      tr.triggered=true;
      tr.revealed=true;
      player.hp = Math.max(0, player.hp - tr.dmg);
      log(`Trap! You take ${tr.dmg} damage.`);
      if (player.hp<=0){
        gameOver=true;
        log('You died. Press New Run.');
      }
    }

    // Passive regeneration: recover 1 HP every 10 turns.
    if (!gameOver && turn % 10 === 0 && player.hp > 0 && player.hp < player.maxHp){
      player.hp = Math.min(player.maxHp, player.hp + 1);
    }

    // if standing on item, do nothing (classic needs ,)
    render();
  }

  // =========================================================
  // Movement (with corner-cut prevention for diagonals)
  // =========================================================
  function tryMove(dx,dy, opts={}){
    if (gameOver) return;
    if (!player) return;

    // any manual move cancels auto-walk
    if (!opts.fromAuto) stopAutoWalk();

    const nx=player.x+dx, ny=player.y+dy;
    if (!inBounds(nx,ny)) return;

    // diagonal corner-cut prevention
    if (dx!==0 && dy!==0){
      const side1Blocked = !isWalkable(player.x+dx, player.y, false);
      const side2Blocked = !isWalkable(player.x, player.y+dy, false);
      if (side1Blocked || side2Blocked){
        if (!opts.silent) log('You cannot move diagonally past a corner.');
        return;
      }
    }

    const ent = entityAt(nx,ny);
    if (ent && ent.type==='monster'){
      attack(player, ent.ref, 'You', ent.ref.name);
      endPlayerAction();
      return;
    }

    const t = tile(nx,ny);

    if (t===WALL){
      if (!opts.silent) log('You bump into a wall.');
      return; // no turn consumed (modern-friendly)
    }

    if (t===DOOR_CLOSED){
      // opening door consumes a turn
      openDoorAt(nx,ny);
      endPlayerAction();
      return;
    }

    if (!isWalkable(nx,ny,false)){
      if (!opts.silent) log('Blocked.');
      return;
    }

    player.x=nx; player.y=ny;
    const waitChoice = autoPickUpOnStep(!!opts.skipAutoPickup);
    if (waitChoice) return;
    endPlayerAction();
  }

  function waitTurn(){
    if (gameOver) return;
    stopAutoWalk();
    log('You wait.');
    endPlayerAction();
  }

  // =========================================================
  // Stairs (multi-floor snapshots)
  // =========================================================
  let stairsUp = null;
  let stairsDown = null;

  function snapshotFloor(){
    floors.set(floorN, {
      floorN,
      turn,
      map,
      explored,
      items,
      traps,
      secrets,
      monsters,
      stairsUp,
      stairsDown,
      // player is stored globally (position changes per floor kept here too)
      playerPos: {x:player.x,y:player.y},
    });
  }

  function restoreFloor(n){
    const snap = floors.get(n);
    if (!snap) return false;
    floorN = n;
    turn = snap.turn;

    map = snap.map;
    explored = snap.explored;
    items = snap.items;
    traps = snap.traps;
    secrets = snap.secrets;
    monsters = snap.monsters;
	if (!Array.isArray(monsters)) monsters = [];
    stairsUp = snap.stairsUp;
    stairsDown = snap.stairsDown;

    player.x = snap.playerPos.x;
    player.y = snap.playerPos.y;

    computePlayerFOV();
    render();
    return true;
  }

  function descend(){
    if (gameOver) return;
    stopAutoWalk();
    if (tile(player.x,player.y)!==STAIRS_DOWN){
      log('You are not on stairs down (>).');
      return;
    }
    snapshotFloor();
    const next = floorN + 1;
    if (floors.has(next)){
      log(`You descend to floor ${next}.`);
      restoreFloor(next);
      endPlayerAction();
      return;
    }
    floorN = next;
    log(`You descend to floor ${floorN}.`);
    newFloor({comingFrom:'up'});
  }

  function ascend(){
    if (gameOver) return;
    stopAutoWalk();
    if (tile(player.x,player.y)!==STAIRS_UP){
      log('You are not on stairs up (<).');
      return;
    }
    if (floorN<=1){
      log('You cannot go above floor 1.');
      return;
    }
    snapshotFloor();
    const prev = floorN - 1;
    log(`You ascend to floor ${prev}.`);
    restoreFloor(prev);
    endPlayerAction();
  }

  // =========================================================
  // New floor
  // =========================================================
  function newFloor({comingFrom}){
    // Build a Rogue-like random floor:
    // - ensure a reasonable room count
    // - guarantee connectivity between rooms
    // - place stairs far apart
    const MIN_ROOMS = 7;
    const GEN_ATTEMPTS = 10;
    let rooms = [];
    let bestRooms = [];
    let bestMap = null;

    function connectToNearest(existingRooms, room){
      if (!existingRooms.length) return;
      let best = existingRooms[0];
      let bestD = Infinity;
      for (const o of existingRooms){
        const dx = o.cx - room.cx;
        const dy = o.cy - room.cy;
        const d = dx*dx + dy*dy;
        if (d < bestD){ bestD = d; best = o; }
      }
      carveCorridor(best.cx, best.cy, room.cx, room.cy);
    }

    function farthestPair(list){
      if (list.length<=1) return [list[0], list[0]];
      let a = list[0], b = list[1], best = -1;
      for (let i=0;i<list.length;i++){
        for (let j=i+1;j<list.length;j++){
          const d = Math.abs(list[i].cx - list[j].cx) + Math.abs(list[i].cy - list[j].cy);
          if (d > best){ best = d; a = list[i]; b = list[j]; }
        }
      }
      return [a,b];
    }

    for (let attempt=0; attempt<GEN_ATTEMPTS; attempt++){
      map = makeGrid(WALL);
      rooms = [];

      for (let i=0;i<ROOMS_TRY;i++){
        const w=randInt(ROOM_MIN,ROOM_MAX);
        const h=randInt(ROOM_MIN,ROOM_MAX);
        const x=randInt(1, MAP_W-w-2);
        const y=randInt(1, MAP_H-h-2);
        const r={x,y,w,h,cx:(x+(w/2|0)),cy:(y+(h/2|0))};

        let ok=true;
        for (const o of rooms){
          if (intersects(r,o)){ ok=false; break; }
        }
        if (!ok) continue;

        carveRoom(r);
        connectToNearest(rooms, r);
        rooms.push(r);
      }

      if (rooms.length > bestRooms.length){
        bestRooms = rooms.map(r => ({...r}));
        bestMap = map.map(row => row.slice());
      }
      if (rooms.length >= MIN_ROOMS) break;
    }

    if (rooms.length < MIN_ROOMS && bestRooms.length){
      rooms = bestRooms;
      map = bestMap;
    }

    if (!rooms.length){
      const r={x:10,y:6,w:40,h:18,cx:30,cy:15};
      map = makeGrid(WALL);
      carveRoom(r);
      rooms=[r];
    }

    explored = makeGrid(false);
    visible = makeGrid(false);

    // stairs placement: choose farthest room centers
    const [upRoom, downRoom] = farthestPair(rooms);
    stairsUp = {x:upRoom.cx, y:upRoom.cy};
    stairsDown = {x:downRoom.cx, y:downRoom.cy};

    // put stairs tiles
    setTile(stairsUp.x, stairsUp.y, STAIRS_UP);
    setTile(stairsDown.x, stairsDown.y, STAIRS_DOWN);

    // place doors & secrets
    placeDoorsAndSecrets(rooms);

    // place player based on entry
    if (comingFrom==='up'){
      // came from above via '>' -> arrive on '<'
      player.x = stairsUp.x;
      player.y = stairsUp.y;
    } else {
      // default start
      player.x = stairsUp.x;
      player.y = stairsUp.y;
    }

    // spawn entities
    spawnItems();
    spawnTraps();
    spawnMonsters();

    computePlayerFOV();
    snapshotFloor(); // store this new floor
    render();
  }

  // =========================================================
  // UI: help / legend / traps
  // =========================================================
  function renderKeymapBar(){
    if (!keymapText) return;

    if (inputMode==='hjkl'){
      keymapText.textContent =
        i18n.tr(`Move: h j k l y u b n | i inv | d drop | e eat | q quaff | r read | w wield | W wear | t throw | P put on ring | R remove ring | f fight | z zap | c close | m move command | , get | s search | > down | < up | ? help | I inv-cat | D discoveries | o options | v version | / legend | ^ traps | . wait | ^P history | ^R redraw | F1 help | S save | Q quit | : debug`);
    } else if (inputMode==='wasd'){
      keymapText.textContent =
        i18n.tr(`Move: WASD / Arrows | i inv | , get | . wait | > down | < up | F1 help | S save | Q quit (Classic commands best in HJKL mode)`);
    } else {
      keymapText.textContent =
        i18n.tr(`Move: Click/Tap (A*) | Tap same tile cancel | i inv | , get | . wait | F1 help | S save | Q quit`);
    }
  }

  function applyStaticTexts(){
    const map = [
      ['lblInput', 'input_label'],
      ['lblLanguage', 'language_label'],
      ['btnInv', 'btn_inventory'],
      ['btnHelp', 'btn_help'],
      ['btnRestart', 'btn_new_run'],
      ['btnLegend', 'btn_legend'],
      ['btnTraps', 'btn_traps'],
      ['statsTitle', 'stats_title'],
      ['quickTitle', 'quick_title'],
      ['quickDesc', 'quick_desc'],
      ['logTitle', 'log_title'],
      ['btnPickup', 'btn_pickup'],
      ['btnSearch', 'btn_search'],
      ['btnDown', 'btn_down'],
      ['btnUp', 'btn_up'],
      ['btnClose', 'btn_close'],
    ];
    for (const [id,keyName] of map){
      const el = document.getElementById(id);
      if (el) el.textContent = i18n.t(keyName);
    }
  }

  function openLegendModal(){
    openModal('Legend', 'Symbols', `
      <div class="grid2">
        <div class="box">
          <b>Terrain</b>
          <div class="itemRow"><div class="itemLeft"><div class="badge">#</div><div>Wall</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">.</div><div>Floor</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">+</div><div>Closed Door (bump to open)</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">/</div><div>Open Door</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">&lt;</div><div>Stairs Up</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">&gt;</div><div>Stairs Down</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">^</div><div>Trap (hidden until found/triggered)</div></div></div>
        </div>
        <div class="box">
          <b>Items</b>
          <div class="itemRow"><div class="itemLeft"><div class="badge">!</div><div>Potion</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">?</div><div>Scroll</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">%</div><div>Food</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">)</div><div>Weapon</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">]</div><div>Armor</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">:</div><div>Wand</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">=</div><div>Ring</div></div></div>
        </div>
      </div>
    `);
  }

  function openTrapInfoModal(){
    const found = [];
    for (const [k,tr] of traps){
      if (tr.revealed){
        const [x,y]=k.split(',').map(Number);
        found.push({x,y,dmg:tr.dmg, triggered:tr.triggered});
      }
    }
    const body = found.length ? found.map(t=>`
      <div class="itemRow">
        <div class="itemLeft">
          <div class="badge">^</div>
          <div>(${t.x},${t.y}) dmg ${t.dmg} ${t.triggered?'<span class="muted">(triggered)</span>':''}</div>
        </div>
      </div>
    `).join('') : `<div class="muted">No traps discovered yet.</div>`;
    openModal('Trap Info', '^ discovered traps', `<div class="box">${body}</div>`);
  }

  function openMessageHistoryModal(){
    const body = logHistory.length
      ? logHistory.slice(0, 30).map((s,idx)=>`
          <div class="itemRow"><div class="itemLeft"><div class="badge">${idx+1}</div><div>${escapeHtml(s)}</div></div></div>
        `).join('')
      : `<div class="muted">No messages yet.</div>`;
    openModal('Message History', '^P recent messages', `<div class="box">${body}</div>`);
  }

  function openInventoryCategoryModal(){
    const groups = [
      ['Food', it=>it.kind==='food'],
      ['Potions', it=>it.kind==='potion'],
      ['Scrolls', it=>it.kind==='scroll'],
      ['Weapons', it=>it.kind==='weapon'],
      ['Armor', it=>it.kind==='armor'],
      ['Wands', it=>it.kind==='wand'],
      ['Rings', it=>it.kind==='ring'],
    ];
    const body = groups.map(([title,fn])=>{
      const arr = player.inv.filter(fn);
      const list = arr.length
        ? arr.map(it=>`<div class="itemRow"><div class="itemLeft"><div class="badge">${escapeHtml(it.ch)}</div><div>${escapeHtml(itemName(it))}</div></div></div>`).join('')
        : `<div class="muted">none</div>`;
      return `<div class="box"><b>${title}</b><div style="margin-top:8px">${list}</div></div>`;
    }).join('');
    openModal('Inventory by Category', 'I', `<div class="grid2">${body}</div>`);
  }

  function openDiscoveredModal(){
    const discovered = {potion:new Set(), scroll:new Set(), wand:new Set(), ring:new Set()};
    const seen = [];
    for (const it of player.inv) seen.push(it);
    if (player.weapon) seen.push(player.weapon);
    if (player.armor) seen.push(player.armor);
    if (player.ring) seen.push(player.ring);
    for (const it of seen){
      if (!it || !it.identified) continue;
      if (it.kind==='potion' || it.kind==='scroll' || it.kind==='wand' || it.kind==='ring'){
        discovered[it.kind].add(itemName(it));
      }
    }
    const section = (title, setVal) => {
      const arr = Array.from(setVal.values()).sort();
      const list = arr.length
        ? arr.map(n=>`<div class="itemRow"><div class="itemLeft"><div class="badge">*</div><div>${escapeHtml(n)}</div></div></div>`).join('')
        : `<div class="muted">none identified yet</div>`;
      return `<div class="box"><b>${title}</b><div style="margin-top:8px">${list}</div></div>`;
    };
    openModal(
      'Discoveries',
      'D',
      `<div class="grid2">${
        section('Potions', discovered.potion) +
        section('Scrolls', discovered.scroll) +
        section('Wands', discovered.wand) +
        section('Rings', discovered.ring)
      }</div>`
    );
  }

  function openOptionsModal(){
    openModal('Options', 'o', `
      <div class="box">
        <div class="itemRow"><div class="itemLeft"><div class="badge">Input</div><div>Current: ${escapeHtml((inputMode||'hjkl').toUpperCase())}</div></div></div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
          <button id="optHjkl">HJKL</button>
          <button id="optWasd">WASD</button>
          <button id="optPointer">Pointer</button>
        </div>
      </div>
    `);
    const bind = (id, mode)=>{
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', ()=>{ closeModal(); setInputMode(mode); });
    };
    bind('optHjkl','hjkl');
    bind('optWasd','wasd');
    bind('optPointer','pointer');
  }

  function openHelpModal(){
    openModal('Help / Keymap', 'Classic Rogue-style keys', `
      <div class="grid2">
        <div class="box">
          <b>Movement</b>
          <div class="itemRow"><div class="itemLeft"><div class="badge">h j k l</div><div>left / down / up / right</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">y u b n</div><div>diagonals (corner-cut blocked)</div></div></div>
        </div>
        <div class="box">
          <b>Items / Commands (HJKL mode)</b>
          <div class="itemRow"><div class="itemLeft"><div class="badge">i</div><div>inventory (toggle)</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">d</div><div>drop (choose letter)</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">e</div><div>eat (choose letter)</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">q</div><div>quaff potion (choose letter)</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">r</div><div>read scroll (choose letter)</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">w</div><div>wield weapon (choose letter)</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">W</div><div>wear armor (choose letter)</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">t</div><div>throw item (choose letter, then direction)</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">P</div><div>put on ring (choose letter)</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">R</div><div>remove ring</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">f</div><div>fight forward (direction)</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">z</div><div>zap wand (choose letter -> direction)</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">c</div><div>close door (direction)</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">,</div><div>pick up item</div></div></div>
        </div>
        <div class="box">
          <b>Explore / Info</b>
          <div class="itemRow"><div class="itemLeft"><div class="badge">s</div><div>search (secrets / traps)</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">&gt;</div><div>descend stairs</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">&lt;</div><div>ascend stairs</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">?</div><div>help</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">I</div><div>inventory by category</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">D</div><div>discoveries</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">o</div><div>options</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">v</div><div>version</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">/</div><div>legend</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">^</div><div>trap info</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">F1</div><div>help</div></div></div>
        </div>
        <div class="box">
          <b>Other</b>
          <div class="itemRow"><div class="itemLeft"><div class="badge">.</div><div>wait 1 turn</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">S</div><div>save (LocalStorage)</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">Q</div><div>quit (confirm)</div></div></div>
        </div>
      </div>
    `);
  }

  // =========================================================
  // Save / Load
  // =========================================================
  function serialize(){
    // Note: functions omitted; pure data only
    return JSON.stringify({
      inputMode, floorN, turn, logs,
      itemIdentity,
      itemCalls,
      player,
      floors: Array.from(floors.entries()).map(([k,v])=>[
        k,
        {
          ...v,
          // grids & maps/sets are plain arrays/objects
          map: v.map,
          explored: v.explored,
          items: Array.from(v.items.entries()),
          traps: Array.from(v.traps.entries()),
          secrets: Array.from(v.secrets.entries()),
          monsters: v.monsters,
        }
      ])
    });
  }

  function deserialize(s){
    const data = JSON.parse(s);
    inputMode = data.inputMode || 'hjkl';
    floorN = data.floorN || 1;
    turn = data.turn || 0;
    logs = data.logs || [];
    itemIdentity = data.itemIdentity || null;
    itemCalls = data.itemCalls || {};

    player = data.player;
    if (!Number.isFinite(player?.gold)) player.gold = 0;
    // rebuild floors map
    floors = new Map();
    for (const [k,v] of (data.floors || [])){
      floors.set(Number(k), {
        ...v,
        items: new Map(v.items),
        traps: new Map(v.traps),
        secrets: new Map(v.secrets),
      });
    }
    // restore current floor snapshot to live vars
    const snap = floors.get(floorN);
    if (!snap) return false;

    map = snap.map;
    explored = snap.explored;
    items = snap.items;
    traps = snap.traps;
    secrets = snap.secrets;
    monsters = snap.monsters;
	if (!Array.isArray(monsters)) monsters = [];
    stairsUp = snap.stairsUp;
    stairsDown = snap.stairsDown;
    player.x = snap.playerPos.x;
    player.y = snap.playerPos.y;

    gameOver = false;
    if (!itemIdentity) resetItemIdentity();
    log('Loaded game.');
    computePlayerFOV();
    render();
    return true;
  }

  function saveGame(){
    try{
      localStorage.setItem(SAVE_KEY, serialize());
      log('Game saved.');
    }catch(e){
      log('Save failed.');
    }
  }
  function loadGame(){
    const s = localStorage.getItem(SAVE_KEY);
    if (!s){ log('No save found.'); return false; }
    try{ return deserialize(s); }
    catch(e){ log('Load failed (corrupt save).'); return false; }
  }

  // =========================================================
  // Input mode switching
  // =========================================================
  function setInputMode(mode){
    inputMode = mode;
    inputModeSel.value = mode;
    stopAutoWalk();
    renderKeymapBar();
    log(`Input mode: ${mode.toUpperCase()}`);
  }
  inputModeSel.addEventListener('change', ()=> setInputMode(inputModeSel.value));
  function runDebugCommand(raw){
    const text = String(raw || '').trim();
    if (!text) return;
    const parts = text.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const arg = parts[1];
    if (cmd==='hp'){
      const v = Number(arg);
      if (!Number.isFinite(v) || v<=0){ log('Debug: usage -> hp <number>'); return; }
      const hp = Math.floor(v);
      player.maxHp = Math.max(player.maxHp, hp);
      player.hp = hp;
      log(`Debug: HP set to ${player.hp}/${player.maxHp}.`);
      render();
      return;
    }
    if (cmd==='food'){
      const v = Number(arg);
      if (!Number.isFinite(v)){ log('Debug: usage -> food <number>'); return; }
      player.food = Math.max(0, Math.floor(v));
      log(`Debug: Food set to ${player.food}.`);
      render();
      return;
    }
    if (cmd==='state'){
      log(`Debug: floor=${floorN}, hp=${player.hp}/${player.maxHp}, food=${player.food}`);
      return;
    }
    log(`Debug: unknown command "${text}"`);
  }
  if (languageSel){
    languageSel.value = i18n.getLang();
    languageSel.addEventListener('change', ()=> i18n.setLang(languageSel.value));
  }
  i18n.onChange(()=>{
    if (languageSel) languageSel.value = i18n.getLang();
    applyStaticTexts();
    render();
  });

  // =========================================================
  // Keyboard handling
  // =========================================================
  const hjklMove = {
    'h':[-1,0],'j':[0,1],'k':[0,-1],'l':[1,0],
    'y':[-1,-1],'u':[1,-1],'b':[-1,1],'n':[1,1],
    'ArrowLeft':[-1,0],'ArrowDown':[0,1],'ArrowUp':[0,-1],'ArrowRight':[1,0],
  };
  const wasdMove = {
    'w':[0,-1],'a':[-1,0],'s':[0,1],'d':[1,0],
    'ArrowLeft':[-1,0],'ArrowDown':[0,1],'ArrowUp':[0,-1],'ArrowRight':[1,0],
  };

  function isLetterKey(ch){ return ch>='a' && ch<='z'; }

  window.addEventListener('keydown', (e)=>{
    const k = e.key;
    const lower = (k.length===1) ? k.toLowerCase() : k;
    const lowerKey = k.toLowerCase();
    const isCtrl = !!(e.ctrlKey || e.metaKey);

    if (isCtrl && lowerKey==='r'){
      render();
      return;
    }
    if (isCtrl && lowerKey==='p'){
      openMessageHistoryModal();
      return;
    }

    // Help
    if (k === 'F1'){
      e.preventDefault();
      openHelpModal();
      return;
    }

    // Close modal via Esc, and also via 'i' toggle rule
    if (lowerKey === 'escape'){
      if (prompt){ prompt=null; log('Cancelled.'); }
      closeModal();
      return;
    }

    // If a choose prompt is active, letters select
    if (prompt && prompt.type==='choose'){
      if (isLetterKey(lower)){
        resolveChooseByLetter(lower);
        return;
      }
      // allow cancel
      if (lowerKey==='escape') { prompt=null; closeModal(); log('Cancelled.'); return; }
      return;
    }
    if (prompt && prompt.type==='inv'){
      if (isLetterKey(lower)){
        resolveInventoryByLetter(lower);
        return;
      }
    }

    // If a direction prompt is active, movement keys provide direction
    if (prompt && prompt.type==='dir'){
      // accept hjkl directions regardless of mode (classic)
      if (k in hjklMove){
        const [dx,dy]=hjklMove[k];
        resolveDirectionByKey(dx,dy);
        return;
      }
      // also accept arrows
      if (k in hjklMove){
        const [dx,dy]=hjklMove[k];
        resolveDirectionByKey(dx,dy);
        return;
      }
      return;
    }

    // If modal open (inventory/help), allow i to close (toggle)
    if (k === 'i'){
      toggleInventory();
      return;
    }
    if (isModalOpen()){
      // allow / and ^ from inside modal too
      if (lower === '/'){ openLegendModal(); return; }
      if (lower === '^'){ openTrapInfoModal(); return; }
      return;
    }

    if (gameOver){
      // allow new run quickly
      if (k==='r'){ newRun(false); return; }
      return;
    }

    // Global command keys (shared)
    if (k === ':'){
      const raw = window.prompt('Debug command', 'hp 10000');
      if (raw !== null) runDebugCommand(raw);
      return;
    }
    if (k === '?' || k === 'F1'){ openHelpModal(); return; }
    if (k === 'I'){ openInventoryCategoryModal(); return; }
    if (k === 'D'){ openDiscoveredModal(); return; }
    if (k === 'o'){ openOptionsModal(); return; }
    if (k === 'v' || k === 'V'){ log('Rogue Rebuilt web edition v1'); return; }
    if (lower === '.'){ waitTurn(); return; }
    if (lower === ','){ pickUp(); return; }
    if (lower === '/'){ openLegendModal(); return; }
    if (lower === '^'){ openTrapInfoModal(); return; }
    if (lower === '>'){ descend(); return; }
    if (lower === '<'){ ascend(); return; }
    if (k === 'S'){ saveGame(); return; }
    if (k === 'Q'){
      openModal('Quit', 'Are you sure?', `
        <div class="box danger">
          <div style="margin-bottom:10px;">Quit the game?</div>
          <button id="btnQuitYes">Quit</button>
          <button id="btnQuitNo">Cancel</button>
        </div>
      `);
      document.getElementById('btnQuitYes').addEventListener('click', ()=>{
        closeModal();
        gameOver = true;
        log('Quit. Press New Run.');
      });
      document.getElementById('btnQuitNo').addEventListener('click', closeModal);
      return;
    }

    // Mode-specific movement first
    if (inputMode==='hjkl'){
      if (k in hjklMove){
        const [dx,dy]=hjklMove[k];
        tryMove(dx,dy);
        return;
      }
      // Classic commands (full)
      if (k === 's'){ searchAction(); return; }
      if (k === 'c'){ startCloseDoorPrompt(); return; }
      if (k === 'f'){ startFightPrompt(); return; }
      if (k === 'm'){ startMovePrompt(); return; }
      if (k === 't'){ startThrowChoosePrompt(); return; }
      if (k === 'T'){ takeOffRing(); return; } // legacy alias
      if (k === 'R'){ takeOffRing(); return; } // manual: remove ring
      if (k === 'P'){ startChoosePrompt('Put on', 'P', it=>it.kind==='ring', (idx)=> putOnRingByIndex(idx)); return; }

      if (k === 'd'){
        startChoosePrompt('Drop', 'd', it=>true, (idx)=> dropItemByIndex(idx));
        return;
      }
      if (k === 'e'){
        startChoosePrompt('Eat', 'e', it=>it.kind==='food', (idx)=> eatFoodByIndex(idx));
        return;
      }
      if (k === 'q'){
        startChoosePrompt('Quaff', 'q', it=>it.kind==='potion', (idx)=> quaffPotionByIndex(idx));
        return;
      }
      if (k === 'r'){
        startChoosePrompt('Read', 'r', it=>it.kind==='scroll', (idx)=> readScrollByIndex(idx));
        return;
      }
      if (k === 'W'){
        startChoosePrompt('Wear', 'W', it=>it.kind==='armor', (idx)=> wearArmorByIndex(idx));
        return;
      }
      if (k === 'w'){
        startChoosePrompt('Wield', 'w', it=>it.kind==='weapon', (idx)=> wieldWeaponByIndex(idx));
        return;
      }
      if (k === 'z'){
        // choose wand then direction
        startChoosePrompt('Zap', 'z', it=>it.kind==='wand', (idx)=> startZapPrompt(idx));
        return;
      }

      return;
    }

    if (inputMode==='wasd'){
      // movement
      if (k in wasdMove){
        const [dx,dy]=wasdMove[k];
        tryMove(dx,dy);
        return;
      }
      // minimal commands in WASD mode to avoid conflicts with w/d/s
      // use UI or inventory buttons for the rest
      if (lower === 's'){ /* conflict: move down */ return; }
      return;
    }

    if (inputMode==='pointer'){
      // keyboard movement optional: arrows work
      if (k in hjklMove){
        const [dx,dy]=hjklMove[k];
        tryMove(dx,dy);
        return;
      }
    }
  });

  // =========================================================
  // Rendering
  // =========================================================
  function refreshStatsUI(){
    const ringName = player.ring ? itemName(player.ring) : 'None';
    hudEl.textContent = `Floor ${floorN}  Turn ${turn}  HP ${player.hp}/${player.maxHp}  Food ${foodStatus()}  ${gameOver?'(GAME OVER)':''}`;
    sHP.textContent = `${player.hp}/${player.maxHp}`;
    sAD.textContent = `${totalAtk()} / ${totalDef()}`;
    sFood.textContent = `${player.food} (${foodStatus()})`;
    if (sG) sG.textContent = `${player.gold || 0}`;
    sFT.textContent = `${floorN} / ${turn}`;
    sW.textContent = player.weapon ? itemName(player.weapon) : 'None';
    sA.textContent = player.armor ? itemName(player.armor) : 'None';
    sR.textContent = ringName;
  }

  function render(){
    if (!player) return; // guard
    fitCanvas();
    ctx.setTransform(dpr,0,0,dpr,0,0);

    const w = cv.clientWidth;
    const h = cv.clientHeight;
    const cellW = Math.floor(w / MAP_W);
    const cellH = Math.floor(h / MAP_H);
    const cell = Math.max(12, Math.min(cellW, cellH));
    const offX = Math.floor((w - cell*MAP_W)/2);
    const offY = Math.floor((h - cell*MAP_H)/2);

    ctx.fillStyle = '#000';
    ctx.fillRect(0,0,w,h);

    const fontSize = Math.floor(cell * 0.9);
    ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle'; // no glyph baseline drift

    function drawChar(x,y,ch,alpha=1){
      const cx = offX + x*cell + cell/2;
      const cy = offY + y*cell + cell/2;
      ctx.globalAlpha = alpha;
      ctx.fillText(ch, cx, cy);
      ctx.globalAlpha = 1;
    }

    // map + fog
    for (let y=0;y<MAP_H;y++){
      for (let x=0;x<MAP_W;x++){
        if (!explored[y][x]) continue;

        const vis = visible[y][x];
        const t = tile(x,y);

        if (vis){
          ctx.fillStyle = '#e2e8f0';
          drawChar(x,y,t,1);
        } else {
          ctx.fillStyle = '#3b4b61';
          drawChar(x,y,t,0.55);
        }

        // traps shown if revealed (even out of sight, dim)
        const tr = traps.get(key(x,y));
        if (tr && tr.revealed){
          ctx.fillStyle = vis ? '#ffffff' : '#3b4b61';
          drawChar(x,y,'^', vis ? 1 : 0.55);
        }

        // items only on visible tiles
        if (vis){
          const it = items.get(key(x,y));
          if (it){
            ctx.fillStyle = '#ffffff';
            drawChar(x,y,it.ch,1);
          }
        }
      }
    }

    // auto destination marker
    if (lastPointerDest){
      const {x,y} = lastPointerDest;
      if (inBounds(x,y) && explored[y][x]){
        ctx.fillStyle = '#ffffff';
        drawChar(x,y,'窶｢', visible[y][x] ? 0.55 : 0.25);
      }
    }

    // monsters visible only
    for (const m of monsters){
      if (m.hp<=0) continue;
      if (!visible[m.y]?.[m.x]) continue;
      ctx.fillStyle = '#ffffff';
      drawChar(m.x,m.y,m.ch,1);
    }

    // player
    ctx.fillStyle = '#ffffff';
    drawChar(player.x, player.y, '@', 1);

    refreshStatsUI();
    renderKeymapBar();
  }

  // =========================================================
  // New run / init
  // =========================================================
  function newRun(tryLoadFirst=false){
	monsters = [];
	items = new Map();
	traps = new Map();
	secrets = new Map();
    stopAutoWalk();
    prompt=null;
    closeModal();
    logs=[];
    itemCalls = {};
    floors = new Map();
    floorN=1; turn=0;
    gameOver=false;
    resetItemIdentity();

    player = {
      x:0,y:0,
      level:1, xp:0,
      maxHp:22, hp:22,
      baseAtk:5, baseDef:1,
      fov: PLAYER_FOV,
      food: 650,
      gold: 0,
      inv:[],
      weapon:null, armor:null, ring:null,
    };

    log('New run started.');
    setInputMode(inputModeSel.value || 'hjkl');

    if (tryLoadFirst && loadGame()){
      // already rendered
      return;
    }

    // generate first floor
    newFloor({comingFrom:null});
    computePlayerFOV();
    render();
  }

  // =========================================================
  // Startup
  // =========================================================
  fitCanvas();
  applyStaticTexts();
  newRun(false);
})();
