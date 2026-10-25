/* ========= Global crash-to-HUD safety ========= */
window.addEventListener('error', (e)=>{
  const hud = document.getElementById('hud');
  const msg = (e && e.message) || e;
  const where = (e && e.filename) ? ` @ ${e.filename}:${e.lineno || 0}` : '';
  if (hud) hud.textContent = 'ERROR: ' + msg + where;
  console.error(e);
});
window.addEventListener('unhandledrejection', (e)=>{
  const hud = document.getElementById('hud');
  const reason = e && e.reason;
  if (hud) hud.textContent = 'PROMISE ERROR: ' + ((reason && reason.message) || reason || e);
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
  const MAX_DUNGEON_FLOOR = 26;
  const AMULET_FLOOR = 26;

  const SAVE_KEY = 'rogue_modern_v2_save';

  // Tiles
  const WALL = '#', FLOOR = '.', DOOR_CLOSED = '+', DOOR_OPEN = '/', STAIRS_DOWN = '>', STAIRS_UP = '<';

  // Items
  const GL_POTION='!', GL_SCROLL='?', GL_FOOD='%', GL_WEAPON=')', GL_ARMOR=']', GL_WAND=':', GL_RING='=', GL_GOLD='*', GL_AMULET=',';

  // =========================================================
  // DOM
  // =========================================================
  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d', { alpha:false });

  const hudEl = document.getElementById('hud');
  const logLines = document.getElementById('logLines');

  const chipFloor = document.getElementById('chipFloor');
  const chipHP    = document.getElementById('chipHP');
  const chipFood  = document.getElementById('chipFood');
  const chipMode  = document.getElementById('chipMode');

  const sHP = document.getElementById('sHP');
  const sAD = document.getElementById('sAD');
  const sFood = document.getElementById('sFood');
  const sFT = document.getElementById('sFT');
  const sW  = document.getElementById('sW');
  const sA  = document.getElementById('sA');
  const sR  = document.getElementById('sR');

  const inputModeSel = document.getElementById('inputMode');
  const keymapText = document.getElementById('keymapText');
  const aimHint = document.getElementById('aimHint');

  // Minimap
  const miniCv = document.getElementById('minimap');
  const miniCtx = miniCv.getContext('2d', { alpha:true });

  // Modal
  const modal = document.getElementById('modal');
  const modalTitle = document.getElementById('modalTitle');
  const modalHint  = document.getElementById('modalHint');
  const modalBody  = document.getElementById('modalBody');
  function onClick(id, handler){
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', handler);
  }
  onClick('btnClose', closeModal);
  modal.addEventListener('click', (e)=>{ if (e.target===modal) closeModal(); });

  // Buttons
  onClick('btnInv', () => toggleInventory());
  onClick('btnHelp', () => openHelpModal());
  onClick('btnRestart', () => newRun(false));
  onClick('btnSave', () => saveGame());
  onClick('btnLoad', () => {
    if (!loadGame()) log('No save found.');
  });
  onClick('btnLegend', () => openLegendModal());
  onClick('btnTraps', () => openTrapInfoModal());

  onClick('btnWait', () => waitTurn());
  onClick('btnPickup', () => pickUp());
  onClick('btnSearch', () => searchAction());
  onClick('btnDown', () => descend());
  onClick('btnUp', () => ascend());
  document.querySelectorAll('button[data-m]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const [dx,dy] = btn.getAttribute('data-m').split(',').map(Number);
      tryMove(dx,dy,{fromUI:true});
    });
  });

  // =========================================================
  // Utils
  // =========================================================
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  const randInt = (a,b)=> (Math.random()*(b-a+1)|0)+a;
  const clamp = (v,a,b)=> Math.max(a, Math.min(b, v));
  const key = (x,y)=> `${x},${y}`;
  const dirs8 = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
  const dirs4 = [[-1,0],[1,0],[0,-1],[0,1]];
  function inBounds(x,y){ return x>=0 && x<MAP_W && y>=0 && y<MAP_H; }
  function makeGrid(fill){
    return Array.from({length: MAP_H}, ()=> Array.from({length: MAP_W}, ()=> fill));
  }
  function escapeHtml(s){
    return String(s).split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;');
  }

  // =========================================================
  // Canvas sizing + camera
  // =========================================================
  let cell=16, offX=0, offY=0;
  function fitCanvas(){
    const wrap = document.getElementById('gameWrap');
    const rect = wrap.getBoundingClientRect();
    const aspect = (MAP_W / MAP_H);
    const w = Math.floor(rect.width - 20);
    const h = Math.floor(w / aspect);
    const cw = Math.max(560, w);
    const ch = Math.max(360, h);
    cv.style.width = cw + 'px';
    cv.style.height = ch + 'px';
    cv.width = Math.floor(cw * dpr);
    cv.height = Math.floor(ch * dpr);

    // compute cell + offsets for grid fit
    const vw = cw;
    const vh = ch;
    const cellW = Math.floor(vw / MAP_W);
    const cellH = Math.floor(vh / MAP_H);
    cell = Math.max(12, Math.min(cellW, cellH));
    offX = Math.floor((vw - cell*MAP_W)/2);
    offY = Math.floor((vh - cell*MAP_H)/2);
  }
  window.addEventListener('resize', ()=>{ fitCanvas(); drawFrame(true); });

  // camera shake
  let shake = {t:0, a:0};
  function addShake(amount, timeMs){
    shake.t = Math.max(shake.t, timeMs);
    shake.a = Math.max(shake.a, amount);
  }

  // =========================================================
  // Game state
  // =========================================================
  let inputMode = 'hjkl';
  let floors = new Map();
  let floorN = 1;
  let turn = 0;

  let map, explored, visible;
  let items, traps, secrets, monsters;
  let player;

  let logs = [];
  let gameOver = false;

  // Auto-walk
  let autoPath = null;
  let autoTimer = null;
  let lastPointerDest = null;

  // Prompts
  let prompt = null; // {type:'dir'|'choose', title, hint, filterFn, onResolve}
  let aiming = null; // {type:'fight'|'close'|'zap', payload}

  // Modern FX
  let fx = {
    t: 0,
    pops: [],     // {x,y,text,life,vy}
    flashes: [],  // {x,y,life}
    trails: [],   // {x0,y0,x1,y1,life}
    fades: 0,     // low HP pulse
  };

  // Smooth movement
  let anim = {
    p: {x:0,y:0, sx:0,sy:0, t:1},         // player lerp
    m: new Map(),                         // monsterId-> {sx,sy,x,y,t}
  };
  let monsterIdSeq = 1;

  // =========================================================
  // Logging
  // =========================================================
  function log(msg){
    logs.unshift(msg);
    logs = logs.slice(0, MAX_LOG);
    logLines.innerHTML = logs.map(s => `<div class="line">窶｢ ${escapeHtml(s)}</div>`).join('');
  }

  // =========================================================
  // Modal (Esc closes EVERYTHING)
  // =========================================================
  function openModal(title, hint, bodyHtml){
    modalTitle.textContent = title;
    modalHint.textContent = hint || '';
    modalBody.innerHTML = bodyHtml;
    modal.classList.add('show');
  }
  function closeModal(){
    modal.classList.remove('show');
  }
  function isModalOpen(){
    return modal.classList.contains('show');
  }
  function cancelAll(){
    // Esc behavior: aiming -> prompt -> modal
    if (aiming){
      aiming = null;
      aimHint.classList.remove('show');
      log('Cancelled.');
      return true;
    }
    if (prompt){
      prompt = null;
      closeModal();
      log('Cancelled.');
      return true;
    }
    if (isModalOpen()){
      closeModal();
      return true;
    }
    return false;
  }
  function toggleInventory(){
    if (isModalOpen()) { closeModal(); return; }
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
    return false;
  }
  function isWalkable(x,y){
    const t = tile(x,y);
    if (t===WALL) return false;
    if (t===DOOR_CLOSED) return false;
    return true;
  }

  function entityAt(x,y){
    if (player && player.x===x && player.y===y) return {type:'player', ref:player};
    if (!Array.isArray(monsters)) monsters = [];
    for (const m of monsters){
      if (m && m.hp>0 && m.x===x && m.y===y) return {type:'monster', ref:m};
    }
    return null;
  }

  // =========================================================
  // Dungeon generation
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
    for (let tries=0; tries<1200; tries++){
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
    let candidates = [];
    for (let y=2;y<MAP_H-2;y++){
      for (let x=2;x<MAP_W-2;x++){
        if (tile(x,y)!==FLOOR) continue;
        let inside=false;
        for (const r of rooms){
          if (x>=r.x+1 && x<=r.x+r.w-2 && y>=r.y+1 && y<=r.y+r.h-2) { inside=true; break; }
        }
        if (inside) continue;
        const n = dirs4.map(([dx,dy]) => tile(x+dx,y+dy)===FLOOR).filter(Boolean).length;
        if (n===2) candidates.push({x,y});
      }
    }
    const doorCount = 10 + Math.floor(floorN*0.7);
    for (let i=0;i<doorCount && candidates.length;i++){
      const p = candidates.splice(randInt(0,candidates.length-1),1)[0];
      setTile(p.x,p.y,DOOR_CLOSED);
    }

    secrets = new Map();
    let secretCandidates=[];
    for (let y=2;y<MAP_H-2;y++){
      for (let x=2;x<MAP_W-2;x++){
        if (tile(x,y)!==WALL) continue;
        const floorAdj = dirs4.some(([dx,dy]) => {
          const t = tile(x+dx,y+dy);
          return (t===FLOOR || t===DOOR_CLOSED || t===DOOR_OPEN);
        });
        if (!floorAdj) continue;
        secretCandidates.push({x,y});
      }
    }
    const secretCount = 6 + Math.floor(floorN*0.3);
    for (let i=0;i<secretCount && secretCandidates.length;i++){
      const p = secretCandidates.splice(randInt(0,secretCandidates.length-1),1)[0];
      secrets.set(key(p.x,p.y), {type:'door', revealed:false});
    }
  }

  // =========================================================
  // Items
  // =========================================================
  function chooseWeighted(list){
    let sum = 0;
    for (const it of list) sum += it.w;
    let r = Math.random() * sum;
    for (const it of list){
      r -= it.w;
      if (r<=0) return it;
    }
    return list[list.length-1];
  }
  function chooseByDepth(list){
    const available = list.filter(it => (it.minFloor || 1) <= floorN);
    return chooseWeighted(available.length ? available : list);
  }
  function floorLootProfile(){
    if (floorN <= 4){
      return {
        itemCount: 7 + Math.floor(floorN/2),
        foodWeight: 28,
        potionWeight: 18,
        scrollWeight: 18,
        wandWeight: 7,
        ringWeight: 4,
        weaponWeight: 11,
        armorWeight: 10,
        goldWeight: 10,
      };
    }
    if (floorN <= 12){
      return {
        itemCount: 9 + Math.floor((floorN-4)*0.55),
        foodWeight: 20,
        potionWeight: 18,
        scrollWeight: 17,
        wandWeight: 10,
        ringWeight: 7,
        weaponWeight: 13,
        armorWeight: 12,
        goldWeight: 15,
      };
    }
    return {
      itemCount: 13 + Math.floor((floorN-12)*0.45),
      foodWeight: 12,
      potionWeight: 16,
      scrollWeight: 15,
      wandWeight: 13,
      ringWeight: 10,
      weaponWeight: 16,
      armorWeight: 15,
      goldWeight: 24,
    };
  }
  function placeSpecificItem(kind, avoid){
    const p = placeOnFloor(avoid);
    if (!p) return false;
    items.set(key(p.x,p.y), makeItem(kind));
    avoid.add(key(p.x,p.y));
    return true;
  }
  function makeItem(kind){
    const unid = (nm)=> ({identified:false, unidName:nm});
    if (kind==='potion'){
      const potionTable = [
        {effect:'heal', idName:'Potion of Healing', minFloor:1, w:60},
        {effect:'extraHeal', idName:'Potion of Extra Healing', minFloor:8, w:28},
        {effect:'strength', idName:'Potion of Strength', minFloor:4, w:22},
      ];
      const p = chooseByDepth(potionTable);
      if (p.effect==='strength'){
        const gain = 1 + (floorN>=18 ? 1 : 0);
        return {kind, ch:GL_POTION, ...unid(['Crimson vial','Azure vial','Emerald vial','Ivory vial'][randInt(0,3)]), idName:`${p.idName} (+${gain} ATK)`, effect:p.effect, gain};
      }
      const heal = (p.effect==='extraHeal' ? 10 : 6) + Math.floor(floorN*1.0);
      return {kind, ch:GL_POTION, ...unid(['Crimson vial','Azure vial','Emerald vial','Ivory vial'][randInt(0,3)]), idName:`${p.idName} (+${heal} HP)`, effect:p.effect, heal};
    }
    if (kind==='scroll'){
      const scrollTable = [
        {effect:'mapping', idName:'Scroll of Magic Mapping', minFloor:1, w:24},
        {effect:'fear', idName:'Scroll of Scare Monster', minFloor:1, w:20},
        {effect:'identify', idName:'Scroll of Identify', minFloor:1, w:30},
        {effect:'enchantWeapon', idName:'Scroll of Enchant Weapon', minFloor:4, w:16},
        {effect:'enchantArmor', idName:'Scroll of Enchant Armor', minFloor:6, w:12},
      ];
      const s = chooseByDepth(scrollTable);
      return {kind, ch:GL_SCROLL, ...unid(['Scribbled scroll','Wax-sealed scroll','Ancient parchment'][randInt(0,2)]), idName:s.idName, effect:s.effect};
    }
    if (kind==='food'){
      const food = ['Ration','Dried meat','Biscuit'][randInt(0,2)];
      const foodValue = 280 + randInt(0,120);
      return {kind, ch:GL_FOOD, identified:true, idName:`${food} (+${foodValue} food)`, unidName:`${food}`, foodValue};
    }
    if (kind==='weapon'){
      const weaponTable = [
        {name:'Mace', base:1, minFloor:1, w:26},
        {name:'Dagger', base:1, minFloor:1, w:20},
        {name:'Short Sword', base:2, minFloor:4, w:18},
        {name:'Long Sword', base:3, minFloor:8, w:14},
        {name:'Two-Handed Sword', base:4, minFloor:13, w:9},
      ];
      const w = chooseByDepth(weaponTable);
      const enchant = randInt(0, Math.floor(floorN/10));
      const atk = w.base + enchant;
      return {kind, ch:GL_WEAPON, identified:true, idName:`${w.name} (+${atk} ATK)`, unidName:w.name, atk};
    }
    if (kind==='armor'){
      const armorTable = [
        {name:'Leather Armor', base:1, minFloor:1, w:24},
        {name:'Ring Mail', base:2, minFloor:5, w:18},
        {name:'Scale Mail', base:3, minFloor:8, w:14},
        {name:'Chain Mail', base:4, minFloor:11, w:12},
        {name:'Banded Mail', base:5, minFloor:15, w:8},
        {name:'Plate Mail', base:6, minFloor:19, w:5},
      ];
      const a = chooseByDepth(armorTable);
      const enchant = randInt(0, Math.floor(floorN/12));
      const def = a.base + enchant;
      return {kind, ch:GL_ARMOR, identified:true, idName:`${a.name} (+${def} DEF)`, unidName:a.name, def};
    }
    if (kind==='wand'){
      const wandTable = [
        {effect:'sleep', minFloor:1, w:40},
        {effect:'bolt', minFloor:3, w:60},
      ];
      const w = chooseByDepth(wandTable);
      const effect = w.effect;
      const charges = 3 + randInt(0,2) + Math.floor(floorN/12);
      const idName = effect==='bolt' ? `Wand of Bolt (${charges})` : `Wand of Sleep (${charges})`;
      return {kind, ch:GL_WAND, ...unid(['Wooden wand','Glass wand','Twisted wand'][randInt(0,2)]), idName, effect, charges};
    }
    if (kind==='ring'){
      const ringTable = [
        {effect:'atk', minFloor:1, w:32},
        {effect:'def', minFloor:3, w:32},
        {effect:'fov', minFloor:8, w:18},
      ];
      const r = chooseByDepth(ringTable);
      const effect = r.effect;
      const bonus = 1 + randInt(0,1) + Math.floor(floorN/6);
      const idName = effect==='atk' ? `Ring of Power (+${bonus} ATK)` : effect==='def' ? `Ring of Protection (+${bonus} DEF)` : `Ring of Vision (+${bonus})`;
      return {kind, ch:GL_RING, ...unid(['Plain ring','Obsidian ring','Silver ring'][randInt(0,2)]), idName, effect, bonus};
    }
    if (kind==='gold'){
      const amount = 6 + floorN*3 + randInt(0, floorN*2 + 18);
      return {kind, ch:GL_GOLD, identified:true, idName:`${amount} gold`, unidName:`${amount} gold`, amount};
    }
    if (kind==='amulet'){
      return {kind, ch:GL_AMULET, identified:true, idName:'Amulet of Yendor', unidName:'Amulet of Yendor'};
    }
    return {kind, ch:'?', identified:true, idName:'Unknown', unidName:'Unknown'};
  }
  function itemName(it){ return it.identified ? it.idName : it.unidName; }
  function spawnItems(){
    items = new Map();
    const avoid = new Set([key(player.x,player.y)]);
    const prof = floorLootProfile();
    const count = prof.itemCount;
    for (let i=0;i<count;i++){
      const p = placeOnFloor(avoid);
      if (!p) continue;
      const category = chooseWeighted([
        {kind:'food', w:prof.foodWeight},
        {kind:'potion', w:prof.potionWeight},
        {kind:'scroll', w:prof.scrollWeight},
        {kind:'wand', w:prof.wandWeight},
        {kind:'ring', w:prof.ringWeight},
        {kind:'weapon', w:prof.weaponWeight},
        {kind:'armor', w:prof.armorWeight},
        {kind:'gold', w:prof.goldWeight},
      ]);
      const k = category.kind;
      items.set(key(p.x,p.y), makeItem(k));
      avoid.add(key(p.x,p.y));
    }
    // Floor-based guaranteed drops to mimic classic progression pressure.
    if (floorN <= 3) placeSpecificItem('food', avoid);
    if (floorN % 4 === 0) placeSpecificItem('scroll', avoid);
    if (floorN >= 10) placeSpecificItem('gold', avoid);
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
    const scaleHP  = Math.floor(floorN*1.25);
    const scaleATK = Math.floor(floorN*0.55);
    const scaleDEF = Math.floor(floorN/5);
    const table = [
      { ch:'k', name:'Kobold',  baseHP:6,  baseATK:2, baseDEF:0, fov:ENEMY_FOV_BASE+1, minFloor:1,  w:24 },
      { ch:'g', name:'Goblin',  baseHP:8,  baseATK:3, baseDEF:0, fov:ENEMY_FOV_BASE,   minFloor:1,  w:24 },
      { ch:'o', name:'Orc',     baseHP:12, baseATK:4, baseDEF:1, fov:ENEMY_FOV_BASE-1, minFloor:4,  w:18 },
      { ch:'w', name:'Wraith',  baseHP:14, baseATK:5, baseDEF:1, fov:ENEMY_FOV_BASE-1, minFloor:9,  w:14 },
      { ch:'T', name:'Troll',   baseHP:18, baseATK:6, baseDEF:2, fov:ENEMY_FOV_BASE-2, minFloor:12, w:12 },
      { ch:'D', name:'Dragon',  baseHP:24, baseATK:8, baseDEF:3, fov:ENEMY_FOV_BASE-2, minFloor:18, w:7  },
    ];
    const base = chooseByDepth(table);
    return {
      id: monsterIdSeq++,
      ch:base.ch, name:base.name,
      x:0,y:0,
      hp: base.baseHP+scaleHP,
      atk: base.baseATK+scaleATK,
      def: base.baseDEF+scaleDEF,
      fov: Math.max(4, base.fov),
      state:'idle', lastSeen:null,
      sleep:0,
    };
  }
  function spawnMonsters(){
    monsters = [];
    const count = 5 + Math.floor(floorN*0.9);
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
  // Combat & stats + FX
  // =========================================================
  function totalAtk(){
    const ringAtk = (player.ring && player.ring.effect==='atk') ? player.ring.bonus : 0;
    return player.baseAtk + ((player.weapon && player.weapon.atk) || 0) + ringAtk;
  }
  function totalDef(){
    const ringDef = (player.ring && player.ring.effect==='def') ? player.ring.bonus : 0;
    return player.baseDef + ((player.armor && player.armor.def) || 0) + ringDef;
  }
  function rollDamage(atk, def){
    const base = Math.max(0, atk - def);
    return Math.max(1, base + randInt(-1,1));
  }
  function addPop(x,y,text){
    fx.pops.push({x,y,text:String(text), life:520, vy:-0.9});
  }
  function addFlash(x,y){
    fx.flashes.push({x,y,life:160});
  }
  function addTrail(x0,y0,x1,y1){
    fx.trails.push({x0,y0,x1,y1,life:180});
  }

  function attack(att, def, attackerName, defenderName){
    const aAtk = (att===player) ? totalAtk() : att.atk;
    const dDef = (def===player) ? totalDef() : def.def;
    const dmg = rollDamage(aAtk, dDef);
    def.hp -= dmg;

    // FX
    addFlash(def.x, def.y);
    addPop(def.x, def.y, dmg);
    addShake(def===player ? 4 : 2, 120);

    if (def.hp<=0){
      def.hp=0;
      log(`${attackerName} hits ${defenderName} for ${dmg}. ${defenderName} dies.`);
      // death puff
      fx.pops.push({x:def.x,y:def.y,text:'x',life:380,vy:-0.6});
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
    player.food -= 1;
    if (player.food === 120) log('You are getting hungry.');
    if (player.food === 0) log('You are starving!');
    if (player.food < 0 && (turn % 8 === 0)){
      player.hp = Math.max(0, player.hp - 1);
      log('Starvation hurts you (-1 HP).');
      addPop(player.x, player.y, '-1');
      addShake(3,120);
      if (player.hp<=0) gameOver = true;
    }
  }

  // =========================================================
  // Search / doors
  // =========================================================
  function searchAction(){
    if (gameOver) return;
    stopAutoWalk();
    let found = 0;
    for (let dy=-1; dy<=1; dy++){
      for (let dx=-1; dx<=1; dx++){
        const x = player.x+dx, y = player.y+dy;
        if (!inBounds(x,y)) continue;
        const sk = key(x,y);
        const sec = secrets.get(sk);
        if (sec && !sec.revealed){
          if (Math.random() < 0.35){
            sec.revealed = true;
            setTile(x,y,DOOR_CLOSED);
            found++;
            addFlash(x,y);
          }
        }
        const tr = traps.get(sk);
        if (tr && !tr.revealed && !tr.triggered){
          if (Math.random() < 0.35){
            tr.revealed = true;
            found++;
            addFlash(x,y);
          }
        }
      }
    }
    log(found ? `You search... found ${found} thing(s).` : 'You search... nothing found.');
    endPlayerAction();
  }
  function openDoorAt(x,y){
    if (tile(x,y)!==DOOR_CLOSED) return false;
    setTile(x,y,DOOR_OPEN);
    addFlash(x,y);
    log('You open the door.');
    return true;
  }
  function closeDoorAt(x,y){
    if (tile(x,y)!==DOOR_OPEN) { log('No open door there.'); return false; }
    if (entityAt(x,y)) { log('Something blocks the door.'); return false; }
    setTile(x,y,DOOR_CLOSED);
    addFlash(x,y);
    log('You close the door.');
    return true;
  }

  // =========================================================
  // Inventory / items use
  // =========================================================
  function pickUp(){
    if (gameOver) return;
    stopAutoWalk();
    const it = items.get(key(player.x,player.y));
    if (!it){ log('Nothing here.'); return; }
    items.delete(key(player.x,player.y));
    if (it.kind==='gold'){
      const amount = it.amount || 0;
      player.gold += amount;
      log(`Picked up ${amount} gold.`);
      addPop(player.x, player.y, `+${amount}g`);
      endPlayerAction();
      return;
    }
    player.inv.push(it);
    if (it.kind==='amulet') log('You found the Amulet of Yendor!');
    else log(`Picked up ${itemName(it)}.`);
    addPop(player.x, player.y, it.ch);
    endPlayerAction();
  }

  function dropItemByIndex(idx){
    const it = player.inv[idx];
    if (!it) return;
    const k = key(player.x,player.y);
    if (items.has(k)){ log('There is already something on the ground.'); return; }
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
    addPop(player.x, player.y, '+FOOD');
    log(`You eat. (${foodStatus()})`);
    endPlayerAction();
  }

  function quaffPotionByIndex(idx){
    const it = player.inv[idx];
    if (!it || it.kind!=='potion') return;
    player.inv.splice(idx,1);
    it.identified = true;
    if (it.effect==='strength'){
      player.baseAtk += it.gain || 1;
      addPop(player.x, player.y, `+${it.gain || 1} ATK`);
      log(`You quaff ${itemName(it)}. You feel stronger.`);
    } else {
      const heal = it.heal || 0;
      const before = player.hp;
      player.hp = Math.min(player.maxHp, player.hp + heal);
      addPop(player.x, player.y, `+${player.hp-before}`);
      log(`You quaff ${itemName(it)} (HP ${before}->${player.hp}).`);
    }
    endPlayerAction();
  }

  function readScrollByIndex(idx){
    const it = player.inv[idx];
    if (!it || it.kind!=='scroll') return;
    player.inv.splice(idx,1);
    it.identified = true;

    if (it.effect==='mapping'){
      for (let y=0;y<MAP_H;y++){
        for (let x=0;x<MAP_W;x++){
          if (tile(x,y)!==WALL) explored[y][x]=true;
        }
      }
      log(`You read ${itemName(it)}. The map is revealed!`);
    } else if (it.effect==='fear'){
      for (const m of monsters){
        if (m.hp<=0) continue;
        const dx = m.x - player.x;
        const dy = m.y - player.y;
        if (Math.abs(dx)+Math.abs(dy) <= 10){
          const sx = dx===0 ? 0 : (dx>0 ? 1 : -1);
          const sy = dy===0 ? 0 : (dy>0 ? 1 : -1);
          const nx = m.x + sx;
          const ny = m.y + sy;
          if (inBounds(nx,ny) && isWalkable(nx,ny) && !entityAt(nx,ny)){
            m.x=nx; m.y=ny;
            addTrail(player.x,player.y,nx,ny);
          }
        }
      }
      log(`You read ${itemName(it)}. Monsters recoil!`);
    } else if (it.effect==='identify'){
      let c=0;
      for (const a of player.inv){
        if (!a.identified && (a.kind==='potion'||a.kind==='scroll'||a.kind==='wand'||a.kind==='ring')){
          a.identified = true; c++;
        }
      }
      log(`You read ${itemName(it)}. Identified ${c} item(s).`);
    } else if (it.effect==='enchantWeapon'){
      if (player.weapon){
        player.weapon.atk += 1;
        player.weapon.idName = player.weapon.idName.replace(/\(\+\d+ ATK\)/, `(+${player.weapon.atk} ATK)`);
        addPop(player.x, player.y, '+1 ATK');
        log(`You read ${itemName(it)}. Your weapon glows.`);
      } else {
        log(`You read ${itemName(it)}. But you have no weapon equipped.`);
      }
    } else if (it.effect==='enchantArmor'){
      if (player.armor){
        player.armor.def += 1;
        player.armor.idName = player.armor.idName.replace(/\(\+\d+ DEF\)/, `(+${player.armor.def} DEF)`);
        addPop(player.x, player.y, '+1 DEF');
        log(`You read ${itemName(it)}. Your armor hardens.`);
      } else {
        log(`You read ${itemName(it)}. But you have no armor equipped.`);
      }
    } else {
      log(`You read ${itemName(it)}. Nothing happens.`);
    }
    endPlayerAction();
  }

  function wieldWeaponByIndex(idx){
    const it = player.inv[idx];
    if (!it || it.kind!=='weapon') return;
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
    if (player.ring) player.inv.push(player.ring);
    player.ring = it;
    player.inv.splice(idx,1);
    log(`You put on ${itemName(it)}.`);
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
    if (it.charges<=0){ log('The wand has no charges.'); return; }
    it.identified = true;
    it.charges -= 1;

    let x=player.x, y=player.y;
    for (let i=0;i<10;i++){
      const px=x, py=y;
      x += dx; y += dy;
      if (!inBounds(x,y)) break;
      if (blocksSight(x,y)) break;
      addTrail(px,py,x,y);

      const ent = entityAt(x,y);
      if (ent && ent.type==='monster'){
        if (it.effect==='bolt'){
          const dmg = 6 + Math.floor(floorN*0.7);
          ent.ref.hp = Math.max(0, ent.ref.hp - dmg);
          addPop(x,y,dmg);
          addFlash(x,y);
          addShake(3,120);
          log(`Bolt hits ${ent.ref.name} for ${dmg}.`);
          if (ent.ref.hp<=0) log(`${ent.ref.name} dies.`);
        } else if (it.effect==='sleep'){
          ent.ref.sleep = 4 + randInt(0,3);
          addPop(x,y,'Zz');
          log(`${ent.ref.name} falls asleep!`);
        }
        break;
      }
      explored[y][x] = true;
    }
    endPlayerAction();
  }

  // =========================================================
  // Inventory modal + choose prompt
  // =========================================================
  function invLetter(idx){
    return String.fromCharCode('a'.charCodeAt(0) + idx);
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
            <div class="muted">Choose by letter when prompted</div>
          </div>
          <div style="margin-top:10px;">${list}</div>
        </div>
        <div class="box">
          <b>Equipped</b>
          <div style="margin-top:10px;">
            <div class="itemRow"><div class="itemLeft"><div class="badge">)</div><div>${escapeHtml(weapon)}</div></div></div>
            <div class="itemRow"><div class="itemLeft"><div class="badge">]</div><div>${escapeHtml(armor)}</div></div></div>
            <div class="itemRow"><div class="itemLeft"><div class="badge">=</div><div>${escapeHtml(ring)}</div></div></div>
            <div class="muted" style="margin-top:10px">Food: ${player.food} (${foodStatus()})</div>
          </div>
        </div>
      </div>
      `
    );

    modalBody.querySelectorAll('button[data-act]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        if (gameOver) return;
        const act = btn.getAttribute('data-act');
        const idx = parseInt(btn.getAttribute('data-idx'),10);
        closeModal();

        if (act==='drop') dropItemByIndex(idx);
        if (act==='eat')  eatFoodByIndex(idx);
        if (act==='quaff') quaffPotionByIndex(idx);
        if (act==='read') readScrollByIndex(idx);
        if (act==='wield') wieldWeaponByIndex(idx);
        if (act==='wear')  wearArmorByIndex(idx);
        if (act==='ring')  putOnRingByIndex(idx);
        if (act==='zap')   startZapPrompt(idx);
      });
    });
  }

  function startChoosePrompt(title, hint, filterFn, onChoose){
    prompt = { type:'choose', title, hint, filterFn, onChoose };
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
    if (idx<0 || idx>=player.inv.length) return true;
    const it = player.inv[idx];
    if (!prompt.filterFn(it)) return true;
    closeModal();
    const fn = prompt.onChoose;
    prompt = null;
    fn(idx);
    return true;
  }

  // =========================================================
  // Aim prompts (modern: show hint + direction by hjkl/yubn/arrows)
  // =========================================================
  const hjklMove = {
    'h':[-1,0],'j':[0,1],'k':[0,-1],'l':[1,0],
    'y':[-1,-1],'u':[1,-1],'b':[-1,1],'n':[1,1],
    'ArrowLeft':[-1,0],'ArrowDown':[0,1],'ArrowUp':[0,-1],'ArrowRight':[1,0],
  };

  function startAim(type, hintText, payload=null){
    aiming = {type, payload};
    aimHint.textContent = hintText;
    aimHint.classList.add('show');
    log(hintText);
  }

  function resolveAim(dx,dy){
    if (!aiming) return false;
    const a = aiming;
    aiming = null;
    aimHint.classList.remove('show');

    if (a.type==='close'){
      closeDoorAt(player.x+dx, player.y+dy);
      endPlayerAction();
      return true;
    }
    if (a.type==='fight'){
      const x = player.x+dx, y = player.y+dy;
      const ent = entityAt(x,y);
      if (!ent || ent.type!=='monster'){ log('No enemy there.'); endPlayerAction(); return true; }
      attack(player, ent.ref, 'You', ent.ref.name);
      endPlayerAction();
      return true;
    }
    if (a.type==='zap'){
      zapWandByIndexAndDir(a.payload.wandIdx, dx, dy);
      return true;
    }
    return true;
  }

  function startCloseDoorPrompt(){ if (!gameOver) { stopAutoWalk(); startAim('close','Close door: choose direction (hjklyubn)'); } }
  function startFightPrompt(){ if (!gameOver) { stopAutoWalk(); startAim('fight','Fight: choose direction (hjklyubn)'); } }
  function startZapPrompt(wandIdx){ if (!gameOver) { stopAutoWalk(); startAim('zap','Zap: choose direction (hjklyubn)', {wandIdx}); } }

  // =========================================================
  // Auto-walk (A*)
  // =========================================================
  function heuristic(a,b){ return Math.abs(a.x-b.x)+Math.abs(a.y-b.y); }
  function canPathThrough(x,y){
    const t = tile(x,y);
    if (t===WALL) return false;
    if (t===DOOR_CLOSED) return false;
    const entity = entityAt(x,y);
    if (entity && entity.type==='monster') return false;
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
        const f = fScore.has(k) ? fScore.get(k) : Infinity;
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
        const tentative = (gScore.has(curK) ? gScore.get(curK) : Infinity) + 1;
        if (!open.has(nk) || tentative < (gScore.has(nk) ? gScore.get(nk) : Infinity)){
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
      if (!autoPath || !autoPath.length){ stopAutoWalk(); return; }
      if (monsters.some(m=>m.hp>0 && visible[m.y] && visible[m.y][m.x])){ stopAutoWalk('Auto-walk stopped: enemy spotted.'); return; }
      const [nx,ny] = autoPath.shift();
      if (!canPathThrough(nx,ny)){ stopAutoWalk('Auto-walk stopped: path blocked.'); return; }
      tryMove(nx-player.x, ny-player.y, {fromAuto:true, silent:true});
      if (autoPath && !autoPath.length){ stopAutoWalk(); }
    }, 80);
  }

  function canvasToGrid(clientX, clientY){
    const rect = cv.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const w = rect.width, h = rect.height;
    const gx = Math.floor((px - offX)/cell);
    const gy = Math.floor((py - offY)/cell);
    if (!inBounds(gx,gy)) return null;
    return {x:gx,y:gy};
  }

  function handlePointer(clientX, clientY){
    if (inputMode!=='pointer') return;
    if (gameOver) return;
    if (isModalOpen() || prompt || aiming) return;

    const g = canvasToGrid(clientX, clientY);
    if (!g) return;

    if (lastPointerDest && lastPointerDest.x===g.x && lastPointerDest.y===g.y){
      stopAutoWalk('Auto-walk cancelled.');
      return;
    }
    startAutoWalkTo(g.x,g.y);
  }
  cv.addEventListener('click', e => handlePointer(e.clientX, e.clientY));
  cv.addEventListener('touchend', (e)=>{
    const t = e.changedTouches && e.changedTouches[0];
    if (t) handlePointer(t.clientX, t.clientY);
  }, {passive:true});

  // =========================================================
  // Monster AI (enemy FOV chase/search)
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
        if (!isWalkable(nx,ny)) continue;
        if (dist[ny][nx] <= d+1) continue;
        dist[ny][nx]=d+1;
        q.push([nx,ny]);
      }
    }
    return dist;
  }

  function monsterTurn(){
    if (player.hp<=0) return;
    const distToPlayer = buildDistanceMap(player.x, player.y);

    for (const m of monsters){
      if (m.hp<=0) continue;
      if (m.sleep && m.sleep>0){ m.sleep -= 1; continue; }

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

      const mVis = computeFOVFor(m.x,m.y,m.fov);
      const sees = !!(mVis[player.y] && mVis[player.y][player.x]===true);
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
          if (!isWalkable(nx,ny)) continue;
          if (entityAt(nx,ny)) continue;
          const nd = dist[ny][nx];
          if (nd < bestD){
            bestD=nd; best=[nx,ny];
          }
        }
        if (best){
          // animate monster move
          setMonsterAnim(m.id, m.x, m.y, best[0], best[1]);
          m.x=best[0]; m.y=best[1];
        }
      } else {
        if (Math.random()<0.55) continue;
        const [vx,vy] = dirs4[randInt(0,3)];
        const nx=m.x+vx, ny=m.y+vy;
        if (!inBounds(nx,ny)) continue;
        if (!isWalkable(nx,ny)) continue;
        if (entityAt(nx,ny)) continue;
        setMonsterAnim(m.id, m.x, m.y, nx, ny);
        m.x=nx; m.y=ny;
      }
    }
  }

  // =========================================================
  // Turn lifecycle
  // =========================================================
  function endPlayerAction(){
    turn += 1;
    consumeFoodTick();
    if (player.hp<=0){ gameOver=true; }

    player.fov = PLAYER_FOV + ((player.ring && player.ring.effect==='fov') ? player.ring.bonus : 0);

    monsterTurn();
    computePlayerFOV();

    const tr = traps.get(key(player.x,player.y));
    if (tr && !tr.triggered){
      tr.triggered=true;
      tr.revealed=true;
      player.hp = Math.max(0, player.hp - tr.dmg);
      log(`Trap! You take ${tr.dmg} damage.`);
      addPop(player.x, player.y, tr.dmg);
      addFlash(player.x, player.y);
      addShake(6,160);
      if (player.hp<=0){
        gameOver=true;
        log('You died. Press New Run.');
      }
    }

    drawFrame(false);
  }

  // =========================================================
  // Movement + smooth anim + corner-cut prevention
  // =========================================================
  function setPlayerAnim(fromX,fromY,toX,toY){
    anim.p = {x:toX, y:toY, sx:fromX, sy:fromY, t:0};
  }
  function setMonsterAnim(id, fromX,fromY,toX,toY){
    anim.m.set(id, {x:toX,y:toY,sx:fromX,sy:fromY,t:0});
  }

  function tryMove(dx,dy, opts={}){
    if (gameOver) return;
    if (!player) return;
    if (!opts.fromAuto) stopAutoWalk();

    const nx=player.x+dx, ny=player.y+dy;
    if (!inBounds(nx,ny)) return;

    // diagonal corner-cut prevention
    if (dx!==0 && dy!==0){
      const side1Blocked = !isWalkable(player.x+dx, player.y);
      const side2Blocked = !isWalkable(player.x, player.y+dy);
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
      addShake(2,80);
      return;
    }
    if (t===DOOR_CLOSED){
      openDoorAt(nx,ny);
      endPlayerAction();
      return;
    }
    if (!isWalkable(nx,ny)){
      if (!opts.silent) log('Blocked.');
      return;
    }

    // smooth move FX
    setPlayerAnim(player.x, player.y, nx, ny);

    player.x=nx; player.y=ny;
    endPlayerAction();
  }

  function waitTurn(){
    if (gameOver) return;
    stopAutoWalk();
    log('You wait.');
    endPlayerAction();
  }

  // =========================================================
  // Stairs multi-floor snapshots
  // =========================================================
  let stairsUp = null, stairsDown = null;
  function playerHasAmulet(){
    return !!player.inv.find(it => it && it.kind==='amulet');
  }

  function snapshotFloor(){
    floors.set(floorN, {
      floorN, turn,
      map, explored,
      items: Array.from(items.entries()),
      traps: Array.from(traps.entries()),
      secrets: Array.from(secrets.entries()),
      monsters: monsters.map(m=>({...m})),
      stairsUp, stairsDown,
      playerPos:{x:player.x,y:player.y}
    });
  }

  function restoreFloor(n){
    const snap = floors.get(n);
    if (!snap) return false;
    floorN = n;
    turn = snap.turn;

    map = snap.map;
    explored = snap.explored;
    items = new Map(snap.items);
    traps = new Map(snap.traps);
    secrets = new Map(snap.secrets);
    monsters = Array.isArray(snap.monsters) ? snap.monsters : [];
    stairsUp = snap.stairsUp;
    stairsDown = snap.stairsDown;

    player.x = snap.playerPos.x;
    player.y = snap.playerPos.y;

    computePlayerFOV();
    drawFrame(true);
    return true;
  }

  function descend(){
    if (gameOver) return;
    stopAutoWalk();
    if (tile(player.x,player.y)!==STAIRS_DOWN){ log('You are not on stairs down (>).'); return; }
    if (floorN>=MAX_DUNGEON_FLOOR){ log('No stairs lead deeper from here.'); return; }
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
    if (tile(player.x,player.y)!==STAIRS_UP){ log('You are not on stairs up (<).'); return; }
    if (floorN<=1){
      if (playerHasAmulet()){
        gameOver = true;
        log('You escaped with the Amulet of Yendor. Victory!');
        drawFrame(true);
        return;
      }
      log('You cannot leave without the Amulet of Yendor.');
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
    map = makeGrid(WALL);
    explored = makeGrid(false);
    visible = makeGrid(false);

    // reset anim caches
    anim.m.clear();

    const rooms=[];
    for (let i=0;i<ROOMS_TRY;i++){
      const w=randInt(ROOM_MIN,ROOM_MAX);
      const h=randInt(ROOM_MIN,ROOM_MAX);
      const x=randInt(1, MAP_W-w-2);
      const y=randInt(1, MAP_H-h-2);
      const r={x,y,w,h,cx:(x+(w/2|0)),cy:(y+(h/2|0))};
      let ok=true;
      for (const o of rooms) if (intersects(r,o)){ ok=false; break; }
      if (!ok) continue;
      carveRoom(r);
      if (rooms.length){
        const p=rooms[rooms.length-1];
        carveCorridor(p.cx,p.cy,r.cx,r.cy);
      }
      rooms.push(r);
    }
    if (!rooms.length){
      const r={x:10,y:6,w:40,h:18,cx:30,cy:15};
      carveRoom(r); rooms.push(r);
    }

    const first = rooms[0];
    const last  = rooms[rooms.length-1];
    stairsUp = {x:first.cx, y:first.cy};
    stairsDown = (floorN>=MAX_DUNGEON_FLOOR) ? null : {x:last.cx, y:last.cy};
    setTile(stairsUp.x, stairsUp.y, STAIRS_UP);
    if (stairsDown) setTile(stairsDown.x, stairsDown.y, STAIRS_DOWN);

    placeDoorsAndSecrets(rooms);

    if (comingFrom==='up'){
      player.x = stairsUp.x;
      player.y = stairsUp.y;
    } else {
      player.x = stairsUp.x;
      player.y = stairsUp.y;
    }

    // init containers first (avoid 窶從ot iterable窶・
    monsters = [];
    items = new Map();
    traps = new Map();
    secrets = secrets || new Map();

    spawnItems();
    if (floorN===AMULET_FLOOR){
      const avoid = new Set([key(player.x,player.y)]);
      const p = placeOnFloor(avoid);
      if (p){
        items.set(key(p.x,p.y), makeItem('amulet'));
        log('A distant aura calls from somewhere on this floor...');
      }
    }
    spawnTraps();
    spawnMonsters();

    computePlayerFOV();
    snapshotFloor();
    drawFrame(true);
  }

  // =========================================================
  // UI modals
  // =========================================================
  function openLegendModal(){
    openModal('Legend', 'Symbols', `
      <div class="grid2">
        <div class="box">
          <b>Terrain</b>
          <div class="itemRow"><div class="itemLeft"><div class="badge">#</div><div>Wall</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">.</div><div>Floor</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">+</div><div>Closed Door</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">/</div><div>Open Door</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">&lt;</div><div>Stairs Up</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">&gt;</div><div>Stairs Down</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">^</div><div>Trap (hidden)</div></div></div>
        </div>
        <div class="box">
          <b>Items</b>
          <div class="itemRow"><div class="itemLeft"><div class="badge">*</div><div>Gold</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">!</div><div>Potion</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">?</div><div>Scroll</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">%</div><div>Food</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">)</div><div>Weapon</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">]</div><div>Armor</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">:</div><div>Wand</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">=</div><div>Ring</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">,</div><div>Amulet of Yendor</div></div></div>
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

  function openHelpModal(){
    openModal('Help / Keymap', 'Esc closes any window / cancels aiming', `
      <div class="grid2">
        <div class="box">
          <b>Movement</b>
          <div class="itemRow"><div class="itemLeft"><div class="badge">h j k l</div><div>left / down / up / right</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">y u b n</div><div>diagonals (corner-cut blocked)</div></div></div>
          <div class="muted">Pointer: click/tap to auto-walk (A*)</div>
        </div>
        <div class="box">
          <b>Classic Commands (HJKL mode)</b>
          <div class="itemRow"><div class="itemLeft"><div class="badge">i</div><div>inventory (toggle)</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">,</div><div>pick up</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">d</div><div>drop (choose letter)</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">e</div><div>eat (choose letter)</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">q</div><div>quaff (choose letter)</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">r</div><div>read (choose letter)</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">w</div><div>wield (choose letter)</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">W</div><div>wear (choose letter)</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">T</div><div>take off ring</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">f</div><div>fight (direction)</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">z</div><div>zap (choose letter -> direction)</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">c</div><div>close door (direction)</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">s</div><div>search</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">&gt; / &lt;</div><div>stairs down / up</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">/</div><div>legend</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">^</div><div>trap info</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">.</div><div>wait</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">S</div><div>save</div></div></div>
          <div class="itemRow"><div class="itemLeft"><div class="badge">Q</div><div>quit</div></div></div>
        </div>
      </div>
    `);
  }

  // =========================================================
  // Save/Load (safe)
  // =========================================================
  function serialize(){
    return JSON.stringify({
      inputMode, floorN, turn, logs, player,
      floors: Array.from(floors.entries()).map(([k,v])=>[k,v])
    });
  }
  function deserialize(s){
    const data = JSON.parse(s);
    inputMode = data.inputMode || 'hjkl';
    floorN = data.floorN || 1;
    turn = data.turn || 0;
    logs = data.logs || [];

    player = data.player;
    if (typeof player.gold!=='number') player.gold = 0;
    floors = new Map(Array.isArray(data.floors) ? data.floors : []);

    // restore current floor (rebuild maps/arrays)
    const snap = floors.get(floorN);
    if (!snap) return false;

    map = snap.map;
    explored = snap.explored;
    items = new Map(snap.items || []);
    traps = new Map(snap.traps || []);
    secrets = new Map(snap.secrets || []);
    monsters = Array.isArray(snap.monsters) ? snap.monsters : [];
    stairsUp = snap.stairsUp;
    stairsDown = snap.stairsDown;
    player.x = snap.playerPos.x;
    player.y = snap.playerPos.y;

    // fix IDs if missing
    for (const m of monsters){
      if (!m.id) m.id = monsterIdSeq++;
    }

    gameOver = false;
    computePlayerFOV();
    drawFrame(true);
    log('Loaded game.');
    return true;
  }
  function saveGame(){
    try{
      snapshotFloor();
      localStorage.setItem(SAVE_KEY, serialize());
      log('Game saved.');
    }catch(e){
      console.error(e);
      log('Save failed.');
    }
  }
  function loadGame(){
    const s = localStorage.getItem(SAVE_KEY);
    if (!s) return false;
    try{
      return !!deserialize(s);
    }catch(e){
      console.error(e);
      // incompatible save: drop it
      localStorage.removeItem(SAVE_KEY);
      log('Save was incompatible. Starting new run.');
      return false;
    }
  }

  // =========================================================
  // Input mode + keymap bar
  // =========================================================
  function renderKeymapBar(){
    if (!keymapText) return;
    if (inputMode==='hjkl'){
      keymapText.textContent =
        `MODERN v2 FX: smooth move / popups / minimap / FOV fade | Goal: recover the Amulet on floor 26 and return to floor 1 | HJKL: Move hjklyubn | i inv | d drop | e eat | q quaff | r read | w wield | W wear | T take off | f fight | z zap | c close | , get | s search | > < stairs | . wait | S save | Q quit | : debug`;
    } else if (inputMode==='wasd'){
      keymapText.textContent =
        `WASD: Move WASD/Arrows | i inv | , get | . wait | > < stairs | F1 help | S save | Q quit (Full commands in HJKL mode)`;
    } else {
      keymapText.textContent =
        `Pointer: Click/Tap to auto-walk (A*) | Tap same tile cancel | i inv | , get | . wait | F1 help | S save | Q quit`;
    }
  }
  function setInputMode(mode){
    inputMode = mode;
    inputModeSel.value = mode;
    stopAutoWalk();
    renderKeymapBar();
    log(`Input mode: ${mode.toUpperCase()}`);
    drawFrame(true);
  }
  inputModeSel.addEventListener('change', ()=> setInputMode(inputModeSel.value));

  // =========================================================
  // Debug command
  // =========================================================
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
      drawFrame(true);
      return;
    }
    if (cmd==='gold'){
      const v = Number(arg);
      if (!Number.isFinite(v)){ log('Debug: usage -> gold <number>'); return; }
      player.gold = Math.max(0, Math.floor(v));
      log(`Debug: Gold set to ${player.gold}.`);
      drawFrame(true);
      return;
    }
    if (cmd==='floor'){
      const v = Number(arg);
      if (!Number.isFinite(v)){ log('Debug: usage -> floor <number>'); return; }
      const f = Math.max(1, Math.min(MAX_DUNGEON_FLOOR, Math.floor(v)));
      if (f===floorN){ log(`Debug: already on floor ${floorN}.`); return; }
      snapshotFloor();
      if (floors.has(f)){
        restoreFloor(f);
      } else {
        floorN = f;
        newFloor({comingFrom:'up'});
      }
      log(`Debug: moved to floor ${floorN}.`);
      drawFrame(true);
      return;
    }
    if (cmd==='state'){
      log(`Debug: floor=${floorN}, hp=${player.hp}/${player.maxHp}, gold=${player.gold}, food=${player.food}`);
      return;
    }
    if (cmd==='help'){
      log('Debug commands: hp <n>, gold <n>, floor <n>, state');
      return;
    }
    log(`Debug: unknown command "${text}"`);
  }

  // =========================================================
  // Keyboard handling (Esc closes all)
  // =========================================================
  const wasdMove = {'w':[0,-1],'a':[-1,0],'s':[0,1],'d':[1,0],
                    'ArrowLeft':[-1,0],'ArrowDown':[0,1],'ArrowUp':[0,-1],'ArrowRight':[1,0]};
  function isLetterKey(ch){ return ch>='a' && ch<='z'; }

  window.addEventListener('keydown', (e)=>{
    const k = e.key;
    const lower = (k.length===1) ? k.toLowerCase() : k;

    if (k === 'F1'){ e.preventDefault(); openHelpModal(); return; }

    if (lower === 'escape'){
      e.preventDefault();
      if (cancelAll()) { drawFrame(true); return; }
      return;
    }

    // Choose prompt letter
    if (prompt && prompt.type==='choose'){
      if (isLetterKey(lower)){ resolveChooseByLetter(lower); return; }
      return;
    }

    // Aim prompt direction
    if (aiming){
      if (lower in hjklMove){
        const [dx,dy]=hjklMove[lower];
        resolveAim(dx,dy);
        return;
      }
      return;
    }

    // Inventory toggle always available
    if (lower === 'i'){ toggleInventory(); return; }
    if (isModalOpen()) return;

    if (gameOver){
      if (lower==='r'){ newRun(false); return; }
      return;
    }

    // Global
    if (k === ':'){
      const raw = window.prompt('Debug command', 'hp 10000');
      if (raw !== null) runDebugCommand(raw);
      return;
    }
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
        drawFrame(true);
      });
      document.getElementById('btnQuitNo').addEventListener('click', closeModal);
      return;
    }

    // Movement + commands
    if (inputMode==='hjkl'){
      if (lower in hjklMove){
        const [dx,dy]=hjklMove[lower];
        tryMove(dx,dy);
        return;
      }
      if (lower === 's'){ searchAction(); return; }
      if (lower === 'c'){ startCloseDoorPrompt(); return; }
      if (lower === 'f'){ startFightPrompt(); return; }
      if (k === 'T' || lower==='t'){ takeOffRing(); return; }

      if (lower === 'd'){ startChoosePrompt('Drop', 'd', it=>true, (idx)=> dropItemByIndex(idx)); return; }
      if (lower === 'e'){ startChoosePrompt('Eat', 'e', it=>it.kind==='food', (idx)=> eatFoodByIndex(idx)); return; }
      if (lower === 'q'){ startChoosePrompt('Quaff', 'q', it=>it.kind==='potion', (idx)=> quaffPotionByIndex(idx)); return; }
      if (lower === 'r'){ startChoosePrompt('Read', 'r', it=>it.kind==='scroll', (idx)=> readScrollByIndex(idx)); return; }
      if (lower === 'w'){ startChoosePrompt('Wield', 'w', it=>it.kind==='weapon', (idx)=> wieldWeaponByIndex(idx)); return; }
      if (k === 'W'){ startChoosePrompt('Wear', 'W', it=>it.kind==='armor', (idx)=> wearArmorByIndex(idx)); return; }
      if (lower === 'z'){ startChoosePrompt('Zap', 'z', it=>it.kind==='wand', (idx)=> startZapPrompt(idx)); return; }

      return;
    }

    if (inputMode==='wasd'){
      if (lower in wasdMove){
        const [dx,dy]=wasdMove[lower];
        tryMove(dx,dy);
        return;
      }
      // keep WASD mode minimal
      return;
    }

    if (inputMode==='pointer'){
      // allow arrows
      if (k in hjklMove){
        const [dx,dy]=hjklMove[k];
        tryMove(dx,dy);
        return;
      }
    }
  });

  // =========================================================
  // Minimap render
  // =========================================================
  function drawMinimap(){
    // simple: explored=dark gray; visible=white; walls slightly darker
    const w=miniCv.width, h=miniCv.height;
    miniCtx.clearRect(0,0,w,h);
    const sx = w / MAP_W;
    const sy = h / MAP_H;

    for (let y=0;y<MAP_H;y++){
      for (let x=0;x<MAP_W;x++){
        if (!explored[y][x]) continue;
        const t = tile(x,y);
        const v = visible[y][x];
        // grayscale without manual colors? we use alpha only; base white and rely on alpha
        miniCtx.globalAlpha = v ? 0.9 : 0.35;
        miniCtx.fillStyle = '#fff';
        // darken walls
        if (t===WALL) miniCtx.globalAlpha *= 0.55;
        miniCtx.fillRect(x*sx, y*sy, Math.ceil(sx), Math.ceil(sy));
      }
    }
    // player marker
    miniCtx.globalAlpha = 1;
    miniCtx.fillStyle = '#fff';
    miniCtx.fillRect(player.x*sx, player.y*sy, Math.max(2,sx), Math.max(2,sy));
    miniCtx.globalAlpha = 1;
  }

  // =========================================================
  // Render (modern: smooth lerp + FX + FOV fade)
  // =========================================================
  function refreshStatsUI(){
    hudEl.textContent = `Floor ${floorN}/${MAX_DUNGEON_FLOOR}  Turn ${turn}  HP ${player.hp}/${player.maxHp}  Food ${foodStatus()}  Gold ${player.gold}  ${gameOver?'(GAME OVER)':''}`;
    chipFloor.textContent = `Floor ${floorN}`;
    chipHP.textContent = `HP ${player.hp}/${player.maxHp}`;
    chipFood.textContent = `Food ${foodStatus()}`;
    chipMode.textContent = `MODE ${inputMode.toUpperCase()}`;

    sHP.textContent = `${player.hp}/${player.maxHp}`;
    sAD.textContent = `${totalAtk()} / ${totalDef()}`;
    sFood.textContent = `${player.food} (${foodStatus()})`;
    sFT.textContent = `${floorN} / ${turn}`;
    sW.textContent = player.weapon ? itemName(player.weapon) : 'None';
    sA.textContent = player.armor ? itemName(player.armor) : 'None';
    sR.textContent = player.ring ? itemName(player.ring) : 'None';
  }

  function gridToPxCenter(x,y){
    return {
      x: offX + x*cell + cell/2,
      y: offY + y*cell + cell/2
    };
  }

  let lastTs = performance.now();
  function drawFrame(force){
    if (!player) return;
    // ensure sizes
    fitCanvas();

    const now = performance.now();
    const dt = Math.min(50, now - lastTs);
    lastTs = now;
    fx.t += dt;

    // decay shake
    if (shake.t>0){
      shake.t = Math.max(0, shake.t - dt);
      if (shake.t===0) shake.a=0;
    }

    // animate player/monsters
    const speed = 0.012; // lerp speed per ms
    anim.p.t = clamp(anim.p.t + dt*speed, 0, 1);
    for (const [id,a] of anim.m){
      a.t = clamp(a.t + dt*speed, 0, 1);
      if (a.t>=1) anim.m.delete(id);
    }

    // decay pops/flashes/trails
    fx.pops = fx.pops.map(p=>({...p, life:p.life-dt, y:p.y + (p.vy*dt/1000)})).filter(p=>p.life>0);
    fx.flashes = fx.flashes.map(f=>({...f, life:f.life-dt})).filter(f=>f.life>0);
    fx.trails = fx.trails.map(t=>({...t, life:t.life-dt})).filter(t=>t.life>0);

    // low HP pulse amount
    fx.fades = (player.hp / player.maxHp < 0.25) ? 1 : 0;

    // draw
    const vw = cv.clientWidth;
    const vh = cv.clientHeight;

    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,vw,vh);
    ctx.fillStyle = '#000';
    ctx.fillRect(0,0,vw,vh);

    // screen shake offset
    let sx=0, sy=0;
    if (shake.t>0 && shake.a>0){
      const p = shake.t/1000;
      sx = (Math.random()*2-1) * shake.a;
      sy = (Math.random()*2-1) * shake.a;
    }
    ctx.translate(sx,sy);

    // font: centered baseline to avoid glyph drift
    const fontSize = Math.floor(cell * 0.9);
    ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Helper draw char
    function drawChar(x,y,ch,alpha=1){
      const p = gridToPxCenter(x,y);
      ctx.globalAlpha = alpha;
      ctx.fillText(ch, p.x, p.y);
      ctx.globalAlpha = 1;
    }

    // FOV fade: visible=1, explored=dim, unseen=0
    for (let y=0;y<MAP_H;y++){
      for (let x=0;x<MAP_W;x++){
        if (!explored[y][x]) continue;

        const vis = visible[y][x];
        const t = tile(x,y);

        // base alpha
        const a = vis ? 1.0 : 0.30;
        ctx.fillStyle = '#fff';
        drawChar(x,y,t,a);

        // revealed traps dim if not visible
        const tr = traps.get(key(x,y));
        if (tr && tr.revealed){
          drawChar(x,y,'^', vis ? 1.0 : 0.30);
        }

        // items on visible tiles
        if (vis){
          const it = items.get(key(x,y));
          if (it) drawChar(x,y,it.ch,1.0);
        }
      }
    }

    // pointer destination marker
    if (lastPointerDest){
      const {x,y} = lastPointerDest;
      if (inBounds(x,y) && explored[y][x]){
        drawChar(x,y,'窶｢', visible[y][x] ? 0.55 : 0.2);
      }
    }

    // monsters (visible only) with smooth anim
    for (const m of monsters){
      if (m.hp<=0) continue;
      if (!(visible[m.y] && visible[m.y][m.x])) continue;

      const a = anim.m.get(m.id);
      const t = a ? a.t : 1;
      const gx = a ? (a.sx + (a.x-a.sx)*t) : m.x;
      const gy = a ? (a.sy + (a.y-a.sy)*t) : m.y;

      // flash highlight if hit
      const flash = fx.flashes.some(f=>f.x===m.x && f.y===m.y);
      const alpha = flash ? 1 : 1;

      // draw at interpolated position using pixel coords
      const p = gridToPxCenter(0,0);
      const px = offX + gx*cell + cell/2;
      const py = offY + gy*cell + cell/2;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#fff';
      ctx.fillText(m.ch, px, py);
      ctx.globalAlpha = 1;
    }

    // player smooth
    const tp = anim.p.t;
    const px = anim.p.sx + (player.x - anim.p.sx)*tp;
    const py = anim.p.sy + (player.y - anim.p.sy)*tp;
    const ppx = offX + px*cell + cell/2;
    const ppy = offY + py*cell + cell/2;
    ctx.fillStyle = '#fff';
    ctx.fillText('@', ppx, ppy);

    // trails (zap)
    for (const t of fx.trails){
      const a = clamp(t.life/180, 0, 1);
      ctx.globalAlpha = a;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      const p0 = gridToPxCenter(t.x0,t.y0);
      const p1 = gridToPxCenter(t.x1,t.y1);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // flashes (tile highlight)
    for (const f of fx.flashes){
      const a = clamp(f.life/160, 0, 1) * 0.65;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#fff';
      ctx.fillRect(offX + f.x*cell, offY + f.y*cell, cell, cell);
      ctx.globalAlpha = 1;
    }

    // popups
    for (const p of fx.pops){
      const a = clamp(p.life/520, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#fff';
      const pp = gridToPxCenter(p.x, p.y);
      ctx.fillText(p.text, pp.x, pp.y - cell*0.8);
      ctx.globalAlpha = 1;
    }

    // low HP vignette pulse (alpha overlay)
    if (fx.fades){
      const pulse = 0.12 + 0.08*Math.sin(now/160);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0,0,vw,vh);
      ctx.globalAlpha = 1;
    }

    // undo shake translate
    ctx.setTransform(dpr,0,0,dpr,0,0);

    // minimap
    drawMinimap();

    // stats UI
    refreshStatsUI();
    renderKeymapBar();

    // loop
    if (!force) requestAnimationFrame(()=>drawFrame(false));
  }

  // =========================================================
  // New run
  // =========================================================
  function newRun(tryLoadFirst=false){
    // hard reset
    stopAutoWalk();
    prompt=null; aiming=null;
    closeModal();
    aimHint.classList.remove('show');

    logs=[];
    floors = new Map();
    floorN=1; turn=0;
    gameOver=false;

    monsters = [];
    items = new Map();
    traps = new Map();
    secrets = new Map();

    player = {
      x:0,y:0,
      maxHp:22, hp:22,
      baseAtk:5, baseDef:1,
      fov: PLAYER_FOV,
      food: 650,
      gold: 0,
      inv:[],
      weapon:{kind:'weapon', ch:GL_WEAPON, identified:true, idName:'Mace (+1 ATK)', unidName:'Mace', atk:1},
      armor:{kind:'armor', ch:GL_ARMOR, identified:true, idName:'Leather Armor (+1 DEF)', unidName:'Leather Armor', def:1},
      ring:null,
    };
    player.inv.push({kind:'food', ch:GL_FOOD, identified:true, idName:'Ration (+300 food)', unidName:'Ration', foodValue:300});
    anim.p = {x:0,y:0,sx:0,sy:0,t:1};
    anim.m.clear();
    fx.pops=[]; fx.flashes=[]; fx.trails=[];
    shake={t:0,a:0};

    log('New run started.');
    setInputMode(inputModeSel.value || 'hjkl');

    if (tryLoadFirst && loadGame()){
      drawFrame(true);
      return;
    }
    newFloor({comingFrom:null});
    computePlayerFOV();
    drawFrame(true);
  }

  // =========================================================
  // Startup
  // =========================================================
  fitCanvas();
  // Prefer clean start if save incompatible; safe loader handles it.
  newRun(false);

})();

