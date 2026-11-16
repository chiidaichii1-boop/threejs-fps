// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. Emberworks is Vanguard (the player, attacking) against
// Rogue (bots, defending) on Foundry Yard: plant the bomb at A or B, or wipe
// the defenders out. First to five rounds takes the match.
// ?shot=start|play|end with &seed=N sets up a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { MAP } from './map.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createArsenal, WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';
import { createBots } from './bots.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createMatch, BUY_SECONDS, BOMB_SECONDS } from './match.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const PLAYER_TEAM = 'attack';

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 28, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 140);
scene.add(camera);

const world = createWorld(scene);
const audio = createAudio();
const hud = createHud();
const player = createPlayer(world.colliders);
const arsenal = createArsenal(camera, audio, world);
const bots = createBots(scene, world, camera, audio, Math.random);
const match = createMatch();
const input = createInput(renderer.domElement, onLockChange);

const raycaster = new THREE.Raycaster();
raycaster.far = 80;
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const hitPoint = new THREE.Vector3();
const _v = new THREE.Vector3();

// The bomb: carried by the player at round start, dropped when the carrier
// dies, planted at a site, then defused or detonated.
const bomb = {
  state: 'carried', // carried | dropped | planted | done
  carrier: 'player', // 'player' | bot | null
  pos: new THREE.Vector3(0, 0, 17.5),
  site: null,
  fuse: 0,
  plantT: 0,
  beepT: 0,
};
const bombMesh = new THREE.Group();
{
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.22, 0.22),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#1a1512'), roughness: 0.5, metalness: 0.5 }),
  );
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) }),
  );
  light.position.set(0, 0.14, 0);
  bombMesh.add(body, light);
  bombMesh.visible = false;
  scene.add(bombMesh);
}
const explosionLight = new THREE.PointLight(new THREE.Color('#ff9a3c'), 0, 30);
scene.add(explosionLight);
const explosionSphere = new THREE.Mesh(
  new THREE.SphereGeometry(1, 16, 12),
  new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9a3c'), transparent: true, opacity: 0 }),
);
explosionSphere.visible = false;
scene.add(explosionSphere);

const body = player.state;
const owned = new Set(['pistol']);
let spectating = false;
let frozen = false;
let started = false;
let elapsed = 0;
let accumulator = 0;
let lastTime = performance.now();
let prevFiring = false;
let shake = 0;
let fovTarget = 74;
let buyOpen = false;
let roundSetupDone = false;
let matchOverShown = false;
let explosionT = 0;

hud.setAmmo(arsenal.state.mag, arsenal.state.reserve, WEAPONS.pistol.name.toUpperCase());
hud.setHealth(100, 0);
hud.setMoney(match.state.money);
hud.setScore(0, 0, 1);
hud.setTimer(BUY_SECONDS, 'buy');
hud.setAlive(4, 4);
hud.setBombCarrier(true);
hud.onPlay(() => {
  audio.unlock();
  if (shot) return;
  if (match.state.phase === 'matchover') {
    restartMatch();
    input.requestLock();
    return;
  }
  if (!player.state.alive) {
    hud.hideOverlay();
    spectating = true;
    return;
  }
  input.requestLock();
});

function restartMatch() {
  match.state.phase = 'buy';
  match.state.phaseT = BUY_SECONDS;
  match.state.round = 1;
  match.state.score.attack = 0;
  match.state.score.defend = 0;
  match.state.money = 800;
  match.state.lossStreak = 0;
  match.state.kills = 0;
  match.state.deaths = 0;
  match.state.winner = null;
  matchOverShown = false;
  owned.clear();
  owned.add('pistol');
  arsenal.equip('pistol');
  arsenal.state.grenades = 0;
  setupRound(1);
}

function setupRound(round) {
  match.startRound(round);
  const planSite = Math.random() < 0.5 ? 'A' : 'B';
  bots.spawnRound(planSite);
  const spawn = world.spawns.attack[0];
  player.reset(spawn);
  // Keep the bought loadout; refill its ammunition for the new round.
  const def = arsenal.def();
  arsenal.state.mag = def.mag;
  arsenal.state.reserve = def.reserve;
  arsenal.state.reloadLeft = 0;
  arsenal.state.cooldown = 0;
  arsenal.state.scoped = false;
  spectating = false;
  frozen = false;
  buyOpen = false;
  bomb.state = 'carried';
  bomb.carrier = 'player';
  bomb.site = null;
  bomb.fuse = 0;
  bomb.plantT = 0;
  bombMesh.visible = false;
  explosionLight.intensity = 0;
  explosionSphere.visible = false;
  hud.hideSpectate();
  hud.hideBanner();
  hud.clearBomb();
  hud.setBombCarrier(true);
  hud.setHealth(100, player.state.armor);
  hud.setAmmo(arsenal.state.mag, arsenal.state.reserve, def.name.toUpperCase());
  hud.setMoney(match.state.money);
  hud.setScore(match.state.score.attack, match.state.score.defend, round);
  hud.setTimer(BUY_SECONDS, 'buy');
  hud.setAlive(1 + bots.aliveCount('attack'), bots.aliveCount('defend'));
  // Do not auto-open the shop: the player stays locked in and presses B to
  // buy. Nudge them with a banner once they are playing.
  if (!shot && started) hud.showBanner('Buy phase', 'Press B to open the shop.', true);
  roundSetupDone = true;
}

function openBuyMenu() {
  if (match.state.phase !== 'buy') return;
  buyOpen = true;
  if (document.pointerLockElement) document.exitPointerLock();
  const items = [
    { id: 'pistol', key: '1', name: 'P9 Sidearm', desc: 'Reliable. 12 rounds, accurate.', price: 0, owned: owned.has('pistol') },
    { id: 'smg', key: '2', name: 'VK-9 Raptor SMG', desc: 'Fast. 30 rounds, close quarters.', price: WEAPONS.smg.price, owned: owned.has('smg') },
    { id: 'rifle', key: '3', name: 'AR-77 Vanguard', desc: 'The workhorse. 30 rounds, precise.', price: WEAPONS.rifle.price, owned: owned.has('rifle') },
    { id: 'shotgun', key: '4', name: 'BR-12 Breacher', desc: 'Eight pellets. Devastating up close.', price: WEAPONS.shotgun.price, owned: owned.has('shotgun') },
    { id: 'sniper', key: '5', name: 'LS-50 Longshot', desc: 'One shot. Right-click to scope.', price: WEAPONS.sniper.price, owned: owned.has('sniper') },
    { id: 'armor', key: '6', name: 'Kevlar Armour', desc: 'Absorbs half of every hit.', price: ARMOR_PRICE, owned: player.state.armor >= 100 },
    { id: 'grenade', key: '7', name: 'Frag Grenade', desc: 'Throw with G. Blast radius 6 m.', price: GRENADE_PRICE, owned: arsenal.state.grenades >= 2 },
  ];
  hud.showBuyMenu(items, match.state.money, buyItem);
}

function buyItem(id) {
  if (match.state.phase !== 'buy') return;
  if (id === 'armor') {
    if (player.state.armor >= 100) return;
    if (!match.spend(ARMOR_PRICE)) return;
    player.state.armor = 100;
    audio.buy();
  } else if (id === 'grenade') {
    if (arsenal.state.grenades >= 2) return;
    if (!match.spend(GRENADE_PRICE)) return;
    arsenal.state.grenades += 1;
    audio.buy();
  } else {
    const def = WEAPONS[id];
    if (!def) return;
    if (owned.has(id)) {
      arsenal.equip(id, true);
      audio.click();
    } else {
      if (!match.spend(def.price)) return;
      owned.add(id);
      arsenal.equip(id);
      audio.buy();
    }
  }
  hud.setMoney(match.state.money);
  hud.setHealth(player.state.health, player.state.armor);
  hud.setAmmo(arsenal.state.mag, arsenal.state.reserve, arsenal.def().name.toUpperCase());
  openBuyMenu();
}

function closeBuyMenu() {
  buyOpen = false;
  hud.hideBuyMenu();
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    if (buyOpen) closeBuyMenu();
  } else if (!player.state.alive) {
    hud.showOverlay('dead');
  } else if (match.state.phase === 'matchover') {
    hud.showOverlay(match.matchWinner() === 'attack' ? 'matchwin' : 'matchlose', `${match.state.score.attack} — ${match.state.score.defend}`);
  } else if (!buyOpen && started) {
    // The buy menu is its own overlay; do not stack the pause panel on it.
    hud.showOverlay(started ? 'paused' : 'start');
  }
}

function syncCamera() {
  if (spectating) return;
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  if (shake > 0) {
    camera.rotation.x += (Math.random() - 0.5) * shake * 0.05;
    camera.rotation.y += (Math.random() - 0.5) * shake * 0.05;
  }
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function shoot() {
  if (!arsenal.takeShot()) {
    if (arsenal.state.mag === 0 && !prevFiring) audio.dry();
    return;
  }
  const def = arsenal.def();
  const spread = arsenal.spread(player.groundSpeed(), player.state.crouching, !player.state.onGround);
  camera.getWorldDirection(direction);
  muzzle.copy(camera.position).addScaledVector(direction, 0.6);
  const pellets = def.pellets;
  let hitAny = false;
  let killedAny = false;
  for (let p = 0; p < pellets; p += 1) {
    const dir = new THREE.Vector3(
      direction.x + (random() * 2 - 1) * spread,
      direction.y + (random() * 2 - 1) * spread,
      direction.z + (random() * 2 - 1) * spread,
    ).normalize();
    const wallDist = world.rayWorld(camera.position, dir, 80);
    const botHit = bots.hitTest(camera.position, dir, 80);
    let endDist = Math.min(wallDist, 80);
    if (botHit && botHit.dist < wallDist) {
      endDist = botHit.dist;
      const amount = def.damage * (botHit.part === 'head' ? def.headMult : 1);
      const killed = bots.damage(botHit.bot, amount, botHit.part);
      hitAny = true;
      if (killed) {
        killedAny = true;
        match.addKillReward();
        hud.killfeedAdd('You', botHit.bot.name, botHit.part === 'head', 'attack');
        hud.setMoney(match.state.money);
        if (botHit.bot.hasBomb) dropBomb(botHit.bot.mesh.group.position);
        if (bots.aliveCount('defend') === 0) hud.setAlive(1 + bots.aliveCount('attack'), 0);
      }
    }
    hitPoint.copy(camera.position).addScaledVector(dir, endDist);
    arsenal.addTracer(muzzle, hitPoint);
  }
  if (hitAny) {
    hud.hitMarker(killedAny, killedAny ? 400 : 90);
    if (killedAny) audio.kill();
    else audio.hit();
  }
  player.recoil(def.recoil * (0.9 + random() * 0.2), (random() * 2 - 1) * def.recoil * 0.3);
  hud.setAmmo(arsenal.state.mag, arsenal.state.reserve, def.name.toUpperCase());
}

function dropBomb(pos) {
  bomb.state = 'dropped';
  bomb.carrier = null;
  bomb.pos.copy(pos);
  bomb.pos.y = 0.12;
  bombMesh.position.copy(bomb.pos);
  bombMesh.visible = true;
  hud.setBombCarrier(false);
}

function plantBomb(siteKey) {
  bomb.state = 'planted';
  bomb.site = siteKey;
  bomb.fuse = BOMB_SECONDS;
  bomb.beepT = 0;
  const site = MAP.sites[siteKey];
  bomb.pos.set(site.x, 0.12, site.z);
  bombMesh.position.copy(bomb.pos);
  bombMesh.visible = true;
  hud.setBombCarrier(false);
  hud.setBombPlanted(bomb.fuse);
  hud.showBanner('Bomb planted', `Defend site ${siteKey} until it blows.`, true);
  audio.plantBeep();
  match.addPlantReward();
  hud.setMoney(match.state.money);
  bombPlantedEvent = true;
}

let bombPlantedEvent = false;
let bombDefusedEvent = false;

function explodeBomb() {
  explosionT = 0.9;
  explosionSphere.visible = true;
  explosionSphere.position.copy(bomb.pos);
  explosionLight.position.copy(bomb.pos);
  explosionLight.position.y = 2;
  explosionLight.intensity = 60;
  audio.explosion();
  shake = 1;
  // The blast hurts everyone near it, friend or foe.
  const blast = (pos, isPlayer) => {
    const dist = Math.hypot(pos.x - bomb.pos.x, pos.z - bomb.pos.z);
    if (dist > 9) return;
    const amount = Math.max(20, 120 * (1 - dist / 9));
    if (isPlayer) damagePlayer(amount, bomb.pos);
    return amount;
  };
  blast(body.position, true);
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const amount = blast(bot.mesh.group.position, false);
    if (amount) {
      const killed = bots.damage(bot, amount, 'torso');
      if (killed) hud.killfeedAdd('Bomb', bot.name, false, 'attack');
    }
  }
}

function damagePlayer(amount, fromPos) {
  if (!player.state.alive) return;
  player.damage(amount);
  hud.setHealth(player.state.health, player.state.armor);
  hud.damageFlash();
  audio.hurt();
  shake = Math.min(1, shake + 0.4);
  if (!player.state.alive) {
    match.recordDeath();
    spectating = true;
    if (document.pointerLockElement) document.exitPointerLock();
    hud.showSpectate('You were eliminated — your team fights on.');
    hud.showOverlay('dead');
    if (bomb.carrier === 'player') dropBomb(body.position);
    hud.setAlive(bots.aliveCount('attack'), bots.aliveCount('defend'));
  }
}

function step(dt) {
  elapsed += dt;
  // The match clock does not run until the player has clicked in once.
  if (!started && !shot) return;
  const phase = match.state.phase;

  // --- Match clock and round events. ---
  const events = {
    bombPlanted: bombPlantedEvent,
    bombDefused: bombDefusedEvent,
    defendersDead: phase !== 'buy' && bots.aliveCount('defend') === 0,
    attackersDead: phase !== 'buy' && !player.state.alive && bots.aliveCount('attack') === 0,
  };
  bombPlantedEvent = false;
  bombDefusedEvent = false;
  const result = match.update(dt, events);
  if (result) {
    if (result.type === 'live') {
      closeBuyMenu();
      hud.showBanner(`Round ${match.state.round}`, 'Plant the bomb at A or B.', true);
      // If the player was buying when the phase went live, they are unlocked:
      // prompt them to click back in.
      if (!shot && !document.pointerLockElement && player.state.alive) hud.showOverlay('paused');
    } else if (result.type === 'planted') {
      hud.setBombPlanted(match.state.phaseT);
    } else if (result.type === 'roundEnd') {
      const won = result.winner === 'attack';
      hud.showBanner(won ? 'Round won' : 'Round lost', result.reason, won);
      if (won) audio.roundWin();
      else audio.roundLose();
      if (result.reason === 'The bomb detonated.') explodeBomb();
      // Stay locked in: the next round's buy phase follows on its own.
      closeBuyMenu();
      hud.clearBomb();
      hud.setBombCarrier(false);
      bomb.state = 'done';
      bombMesh.visible = false;
    } else if (result.type === 'overDone') {
      if (!match.nextRound()) {
        showMatchOver();
      } else {
        setupRound(match.state.round);
      }
    } else if (result.type === 'matchDone') {
      showMatchOver();
    }
  }

  // --- Bomb fuse and beeps. ---
  if (bomb.state === 'planted') {
    bomb.fuse = match.state.phaseT;
    hud.setBombPlanted(Math.max(0, bomb.fuse));
    bomb.beepT -= dt;
    if (bomb.beepT <= 0) {
      bomb.beepT = bomb.fuse <= 10 ? 0.5 : 1;
      audio.plantBeep();
    }
    bombMesh.children[1].material.color.setHex(Math.sin(elapsed * 8) > 0 ? 0xff7a1a : 0x551100);
  }

  // --- Player plant channel (hold E inside a site while carrying the bomb). ---
  if (phase === 'live' && bomb.state === 'carried' && bomb.carrier === 'player' && player.state.alive) {
    const site = siteUnderPlayer();
    if (site && input.state.keys.has('KeyE')) {
      const moving = input.state.keys.has('KeyW') || input.state.keys.has('KeyA') || input.state.keys.has('KeyS') || input.state.keys.has('KeyD');
      if (moving) {
        bomb.plantT = 0;
      } else {
        bomb.plantT += dt;
        hud.setBombCarrier(false);
        if (bomb.plantT >= 3) {
          bomb.plantT = 0;
          plantBomb(site);
        }
      }
    } else {
      bomb.plantT = 0;
    }
  }

  // --- Simulation (frozen during the buy phase and after the match). ---
  if (phase !== 'buy' && phase !== 'matchover' && !matchOverShown) {
    const speedMul = arsenal.def().speed / 5.2;
    player.step(dt, input.state.keys, speedMul);
    if (player.tookStep()) audio.footstep();
    arsenal.step(dt, player.groundSpeed(), player.state.crouching, !player.state.onGround, player.bobPhase());
    arsenal.updateGrenades(dt, (pos) => {
      audio.explosion();
      shake = Math.min(1, shake + 0.6);
      explosionLight.position.copy(pos);
      explosionLight.position.y = 1.5;
      explosionLight.intensity = 40;
      explosionT = 0.5;
      explosionSphere.visible = true;
      explosionSphere.position.copy(pos);
      explosionSphere.position.y = 0.5;
      for (const bot of bots.bots) {
        if (!bot.alive) continue;
        const dist = bot.mesh.group.position.distanceTo(pos);
        if (dist > arsenal.grenadeRadius) continue;
        const amount = arsenal.grenadeMaxDamage * (1 - dist / arsenal.grenadeRadius);
        const killed = bots.damage(bot, amount, 'torso');
        if (killed) {
          match.addKillReward();
          hud.killfeedAdd('You', bot.name, false, 'attack');
          hud.setMoney(match.state.money);
          if (bot.hasBomb) dropBomb(bot.mesh.group.position);
        }
      }
      const playerDist = body.position.distanceTo(pos);
      if (player.state.alive && playerDist < arsenal.grenadeRadius) {
        damagePlayer(arsenal.grenadeMaxDamage * (1 - playerDist / arsenal.grenadeRadius) * 0.7, pos);
      }
    });
    bots.step(dt, botContext());
  }

  // --- Explosion flash decay. ---
  if (explosionT > 0) {
    explosionT -= dt;
    const k = Math.max(0, explosionT / 0.9);
    explosionSphere.scale.setScalar(1 + (1 - k) * 7);
    explosionSphere.material.opacity = k * 0.55;
    explosionLight.intensity = 60 * k;
    if (explosionT <= 0) {
      explosionSphere.visible = false;
      explosionLight.intensity = 0;
    }
  }
  shake = Math.max(0, shake - dt * 2.2);

  // --- Scope (sniper, right mouse held). ---
  const wantScope = input.state.scoped && arsenal.state.weaponId === 'sniper' && player.state.alive;
  if (wantScope !== arsenal.state.scoped) {
    arsenal.state.scoped = wantScope;
    audio.click();
  }
  fovTarget = arsenal.state.scoped ? 30 : 74;
  if (Math.abs(camera.fov - fovTarget) > 0.1) {
    camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 14);
    camera.updateProjectionMatrix();
  }

  // --- HUD, every frame. ---
  hud.setTimer(match.state.phaseT, phase);
  hud.setScore(match.state.score.attack, match.state.score.defend, match.state.round);
  hud.setAlive((player.state.alive ? 1 : 0) + bots.aliveCount('attack'), bots.aliveCount('defend'));
  hud.setCrosshairGap(5 + arsenal.spread(player.groundSpeed(), player.state.crouching, !player.state.onGround) * 900 + (arsenal.state.scoped ? -3 : 0));
}

function siteUnderPlayer() {
  for (const [key, site] of Object.entries(MAP.sites)) {
    const dx = body.position.x - site.x;
    const dz = body.position.z - site.z;
    if (Math.hypot(dx, dz) <= site.radius) return key;
  }
  return null;
}

function showMatchOver() {
  if (matchOverShown) return;
  matchOverShown = true;
  const winner = match.matchWinner();
  hud.showOverlay(winner === 'attack' ? 'matchwin' : 'matchlose', `${match.state.score.attack} — ${match.state.score.defend}`);
  if (document.pointerLockElement) document.exitPointerLock();
  if (winner === 'attack') audio.roundWin();
  else audio.roundLose();
}

function botContext() {
  return {
    playerPos: body.position,
    playerAlive: player.state.alive,
    playerTeam: PLAYER_TEAM,
    playerSpeed: player.groundSpeed(),
    bomb: { state: bomb.state, pos: bomb.pos, site: bomb.site },
    tracer: (from, to) => arsenal.addTracer(from, to),
    damagePlayer: (amount, fromPos) => damagePlayer(amount, fromPos),
    onBotShot: () => {},
    onBotKilled: (victim, killer) => {
      hud.killfeedAdd(killer.name, victim.name, false, killer.team);
      if (victim.hasBomb) dropBomb(victim.mesh.group.position);
    },
    onBombPlanted: (site) => {
      bomb.state = 'planted';
      bomb.site = site;
      bomb.fuse = BOMB_SECONDS;
      bomb.beepT = 0;
      const siteDef = MAP.sites[site];
      bomb.pos.set(siteDef.x, 0.12, siteDef.z);
      bombMesh.position.copy(bomb.pos);
      bombMesh.visible = true;
      hud.setBombPlanted(bomb.fuse);
      hud.showBanner('Bomb planted', `Rogue planted at site ${site}. Defuse it.`, false);
      bombPlantedEvent = true;
    },
    onBombDefused: () => {
      bomb.state = 'done';
      bombMesh.visible = false;
      hud.clearBomb();
      bombDefusedEvent = true;
    },
    onBombPickup: (bot) => {
      bomb.state = 'carried';
      bomb.carrier = bot;
      bombMesh.visible = false;
      hud.setBombCarrier(false);
    },
  };
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (player.state.alive && !spectating) player.look(look.x, look.y);
    // Firing: automatic weapons fire while held; the rest fire on the press.
    const def = arsenal.def();
    if (input.state.firing && player.state.alive && !spectating && match.state.phase !== 'buy') {
      if (def.auto) {
        if (arsenal.ready()) shoot();
      } else if (!prevFiring) {
        shoot();
      }
    }
    prevFiring = input.state.firing;
    if (input.wasPressed('KeyR') && player.state.alive) arsenal.reload();
    if (input.wasPressed('KeyB')) {
      if (buyOpen) {
        closeBuyMenu();
        input.requestLock();
      } else if (match.state.phase === 'buy') {
        openBuyMenu();
      }
    }
    if (input.wasPressed('KeyG') && player.state.alive && match.state.phase !== 'buy') {
      camera.getWorldDirection(direction);
      muzzle.copy(camera.position).addScaledVector(direction, 0.5);
      if (arsenal.throwGrenade(muzzle, direction)) audio.click();
    }
    // Weapon switch keys 1-5 (not while the buy menu is open: there the
    // same keys buy).
    if (!buyOpen) {
      const weaponKeys = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'];
      const weaponIds = ['pistol', 'smg', 'rifle', 'shotgun', 'sniper'];
      for (let i = 0; i < weaponKeys.length; i += 1) {
        if (input.wasPressed(weaponKeys[i]) && owned.has(weaponIds[i])) {
          arsenal.equip(weaponIds[i], true);
          hud.setAmmo(arsenal.state.mag, arsenal.state.reserve, arsenal.def().name.toUpperCase());
          audio.click();
        }
      }
    }
    // Buy-menu number keys while it is open.
    if (buyOpen) {
      const buyKeys = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7'];
      const buyIds = ['pistol', 'smg', 'rifle', 'shotgun', 'sniper', 'armor', 'grenade'];
      for (let i = 0; i < buyKeys.length; i += 1) {
        if (input.wasPressed(buyKeys[i])) buyItem(buyIds[i]);
      }
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    if (spectating) {
      // A slow orbit above the yard while the player watches the round out.
      const t = elapsed * 0.12;
      camera.position.set(Math.sin(t) * 16, 17, Math.cos(t) * 16);
      camera.lookAt(0, 0, -2);
    }
  }
  input.endFrame();
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuyMenu();
  buyOpen = false;
  if (name === 'start') {
    setupRound(1);
    body.position.set(0.6, 0, 8.6);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.5, -6));
    hud.showOverlay('start');
  } else if (name === 'play') {
    setupRound(1);
    // Skip the buy phase: jump straight into a live round.
    match.state.phase = 'live';
    match.state.phaseT = 100;
    closeBuyMenu();
    // A clear lane east of mid: the player shoots a defender crossing it.
    // Armour on, so the player survives the defenders shooting back while
    // the frame is staged.
    body.position.set(5, 0, 6);
    player.state.armor = 100;
    // Put a defender in the lane to shoot at.
    const defender = bots.bots.find((b) => b.team === 'defend');
    if (defender) {
      defender.mesh.group.position.set(5, 0, -2);
      defender.state = 'hold';
      defender.path = [];
    }
    settle(20);
    aimAt(new THREE.Vector3(5, 1.2, -2));
    shoot();
    settle(14);
    aimAt(new THREE.Vector3(5, 1.2, -2));
    shoot();
    settle(14);
    aimAt(new THREE.Vector3(5, 1.2, -2));
    shoot();
    settle(12);
  } else {
    // 'end': the bomb is planted at A and the round is nearly over.
    setupRound(1);
    match.state.phase = 'planted';
    match.state.phaseT = 32;
    closeBuyMenu();
    plantBomb('A');
    bombPlantedEvent = false;
    body.position.set(10, 0, -6);
    settle(20);
    aimAt(new THREE.Vector3(15.5, 1.2, -12.5));
    hud.showBanner('Bomb planted', 'Defend site A until it blows.', true);
    settle(10);
  }
  hud.setAmmo(arsenal.state.mag, arsenal.state.reserve, arsenal.def().name.toUpperCase());
  hud.setHealth(player.state.health, player.state.armor);
  hud.setMoney(match.state.money);
  hud.setScore(match.state.score.attack, match.state.score.defend, match.state.round);
  hud.setTimer(match.state.phaseT, match.state.phase);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

setupRound(1);
syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
