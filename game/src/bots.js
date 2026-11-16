// The bots: both teams, driven by one finite state machine each. A bot
// walks the waypoint graph to its site or hold, scans for enemies with a
// line-of-sight check, and when it sees one it reacts (a beat late, like a
// person), aims with an error that grows with distance and target speed,
// and fires in bursts. Attackers carry the plan to a site; defenders hold
// and rotate. One bot per side can plant or defuse the bomb.
import * as THREE from 'three';
import { MAP, WAYPOINTS, findPath, nearestWaypoint } from './map.js';
import { WEAPONS } from './weapons.js';

const BOT_RADIUS = 0.34;
const BOT_HEIGHT = 1.72;
const BOT_EYE = 1.5;
const BODY_TOP = 1.32;
const HEAD_Y = 1.56;
const HEAD_R = 0.19;
const REACTION_MIN = 0.5;
const REACTION_MAX = 0.9;
const PERCEIVE_EVERY = 0.15;
const PLANT_SECONDS = 3;
const DEFUSE_SECONDS = 5;

const NAMES = {
  attack: ['Vex', 'Havoc', 'Mira', 'Juno'],
  defend: ['Sable', 'Rook', 'Ivy', 'Dagger'],
};

export function createBots(scene, world, camera, audio, rng) {
  const bots = [];
  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();
  const _chest = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _ray = new THREE.Ray();
  const _to = new THREE.Vector3();
  const probe = new THREE.Box3();

  function makeMesh(team, weaponId) {
    const group = new THREE.Group();
    const teamColor = team === 'attack' ? 0xff7a1a : 0x37b6c9;
    const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), roughness: 0.7, metalness: 0.05 });
    const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#221d18'), roughness: 0.8 });
    const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9a184'), roughness: 0.6 });
    const gunMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#14161a'), roughness: 0.5, metalness: 0.4 });
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.72, 0.18), dark);
    legL.position.set(-0.11, 0.36, 0);
    const legR = legL.clone();
    legR.position.x = 0.11;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), cloth);
    torso.position.y = 1.08;
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.4, 0.34), dark);
    vest.position.y = 1.12;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), skin);
    head.position.y = HEAD_Y;
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.185, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), roughness: 0.5 }));
    helmet.position.y = HEAD_Y + 0.02;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), gunMat);
    gun.position.set(0.2, 1.25, -0.25);
    group.add(legL, legR, torso, vest, head, helmet, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    // Health bar above the head, billboarded to the camera each frame.
    const barBg = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.07), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.7, depthWrite: false }));
    barBg.position.y = 1.95;
    const barFg = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.05), new THREE.MeshBasicMaterial({ color: 0x51d88a, transparent: true, opacity: 0.95, depthWrite: false }));
    barFg.position.set(0, 1.95, 0.01);
    group.add(barBg, barFg);
    return { group, torso, head, gun, barFg, barBg };
  }

  function collides(x, y, z) {
    probe.min.set(x - BOT_RADIUS, y + 0.04, z - BOT_RADIUS);
    probe.max.set(x + BOT_RADIUS, y + BOT_HEIGHT - 0.04, z + BOT_RADIUS);
    for (const box of world.colliders) if (probe.intersectsBox(box)) return true;
    return false;
  }

  function spawnBot(team, index, weaponId, spawn) {
    const mesh = makeMesh(team, weaponId);
    mesh.group.position.set(spawn.x, 0, spawn.z);
    scene.add(mesh.group);
    const bot = {
      id: `${team}-${index}`,
      name: NAMES[team][index % NAMES[team].length],
      team,
      weaponId,
      mesh,
      health: 100,
      alive: true,
      speed: 3.3 + rng() * 0.9,
      skill: 0.62 + rng() * 0.3,
      yaw: spawn.yaw ?? 0,
      state: 'advance',
      path: [],
      pathIndex: 0,
      targetSite: null,
      holdId: null,
      holdYaw: 0,
      scanT: rng() * 2,
      perceiveT: rng() * PERCEIVE_EVERY,
      target: null,
      targetIsPlayer: false,
      seenT: 0,
      reactionT: 0,
      burstLeft: 0,
      burstT: 0,
      pauseT: 0,
      strafeDir: 1,
      strafeT: 0,
      channelT: 0,
      channelKind: null,
      hasBomb: false,
      heard: null,
      heardT: 0,
      fall: 0,
      vel: new THREE.Vector3(),
    };
    mesh.group.rotation.y = bot.yaw;
    bots.push(bot);
    return bot;
  }

  // Place the round's bots. `plan` is the site the attackers will push
  // (the other site gets a feint). Returns the bots.
  function spawnRound(planSite) {
    for (const bot of bots) scene.remove(bot.mesh.group);
    bots.length = 0;
    const otherSite = planSite === 'A' ? 'B' : 'A';
    const attackSpawns = world.spawns.attack;
    const defendSpawns = world.spawns.defend;
    const attackWeapons = ['rifle', 'rifle', 'smg', 'smg'];
    const defendWeapons = ['rifle', 'rifle', 'smg', 'smg'];
    for (let i = 0; i < 4; i += 1) {
      const bot = spawnBot('attack', i, attackWeapons[i], attackSpawns[i]);
      // Three push the plan site, one feints the other.
      bot.targetSite = i === 3 ? otherSite : planSite;
      bot.state = 'advance';
      bot.path = findPath(nearestWaypoint(bot.mesh.group.position.x, bot.mesh.group.position.z), bot.targetSite === 'A' ? 'ASite' : 'BSite');
      bot.pathIndex = 0;
    }
    for (let i = 0; i < 4; i += 1) {
      const bot = spawnBot('defend', i, defendWeapons[i], defendSpawns[i]);
      // Two hold each site; the fourth holds mid.
      bot.holdId = i < 2 ? (i === 0 ? 'AH1' : 'AH2') : (i === 2 ? 'BH1' : 'M3');
      if (i === 3) bot.holdId = 'BH2';
      bot.state = 'advance';
      bot.path = findPath(nearestWaypoint(bot.mesh.group.position.x, bot.mesh.group.position.z), bot.holdId);
      bot.pathIndex = 0;
    }
    return bots;
  }

  function setPath(bot, toId) {
    const from = nearestWaypoint(bot.mesh.group.position.x, bot.mesh.group.position.z);
    bot.path = findPath(from, toId);
    bot.pathIndex = 0;
  }

  function moveAlongPath(bot, dt) {
    if (bot.pathIndex >= bot.path.length) return true;
    const node = WAYPOINTS[bot.path[bot.pathIndex]];
    if (!node) {
      bot.pathIndex += 1;
      return false;
    }
    const dx = node.x - bot.mesh.group.position.x;
    const dz = node.z - bot.mesh.group.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.4) {
      bot.pathIndex += 1;
      return bot.pathIndex >= bot.path.length;
    }
    const step = bot.speed * dt;
    const nx = bot.mesh.group.position.x + (dx / dist) * step;
    const nz = bot.mesh.group.position.z + (dz / dist) * step;
    if (!collides(nx, bot.mesh.group.position.y, bot.mesh.group.position.z)) bot.mesh.group.position.x = nx;
    if (!collides(bot.mesh.group.position.x, bot.mesh.group.position.y, nz)) bot.mesh.group.position.z = nz;
    const targetYaw = Math.atan2(-dx, -dz);
    let diff = targetYaw - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));
    bot.mesh.group.rotation.y = bot.yaw;
    return false;
  }

  // Can this bot see that point? Range, a forward cone, and a clear line.
  function canSee(bot, point, maxDist = 42) {
    _a.copy(point);
    _a.y = 1.2;
    _b.copy(bot.mesh.group.position);
    _b.y = BOT_EYE;
    const dist = _a.distanceTo(_b);
    if (dist > maxDist || dist < 0.01) return dist < 0.01 ? true : false;
    _dir.copy(_a).sub(_b).normalize();
    const forward = new THREE.Vector3(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
    if (_dir.dot(forward) < 0.15 && dist > 3) return false;
    return world.losClear(_b, _a);
  }

  function eyePos(bot, out) {
    out.copy(bot.mesh.group.position);
    out.y = BOT_EYE;
    return out;
  }

  function chestPos(bot, out) {
    out.copy(bot.mesh.group.position);
    out.y = 1.15;
    return out;
  }

  function damage(bot, amount, part) {
    if (!bot.alive) return false;
    bot.health -= amount;
    if (bot.health > 0) return false;
    bot.health = 0;
    bot.alive = false;
    bot.fall = 0;
    bot.channelKind = null;
    bot.channelT = 0;
    return true;
  }

  // Ray against every living bot: body box, then head sphere. Returns the
  // nearest hit or null. main.js compares it with the wall hit.
  function hitTest(origin, dir, maxDist) {
    let best = null;
    for (const bot of bots) {
      if (!bot.alive) continue;
      const pos = bot.mesh.group.position;
      _ray.set(origin, dir);
      // Body: a box from the ground to the shoulders.
      probe.min.set(pos.x - 0.3, pos.y, pos.z - 0.3);
      probe.max.set(pos.x + 0.3, pos.y + BODY_TOP, pos.z + 0.3);
      const bodyHit = _ray.intersectBox(probe, _to);
      let bodyDist = Infinity;
      if (bodyHit) bodyDist = _to.distanceTo(origin);
      // Head: a sphere at the top.
      _a.set(pos.x, pos.y + HEAD_Y, pos.z);
      const headHit = _ray.intersectSphere(new THREE.Sphere(_a, HEAD_R), _to);
      let headDist = Infinity;
      if (headHit) headDist = _to.distanceTo(origin);
      const dist = Math.min(bodyDist, headDist);
      if (dist < maxDist && (!best || dist < best.dist)) {
        best = { bot, part: headDist <= bodyDist ? 'head' : 'torso', dist };
      }
    }
    return best;
  }

  function aliveCount(team) {
    let n = 0;
    for (const bot of bots) if (bot.alive && bot.team === team) n += 1;
    return n;
  }

  function carrier() {
    for (const bot of bots) if (bot.alive && bot.hasBomb) return bot;
    return null;
  }

  // One bot's turn. ctx is the live game state main.js owns.
  function stepBot(bot, dt, ctx) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.mesh.group.rotation.x = -bot.fall * 1.5;
      bot.mesh.group.position.y = -bot.fall * 0.1;
      return;
    }
    // Health bar faces the camera and shrinks with health.
    bot.mesh.barFg.scale.x = Math.max(0.001, bot.health / 100);
    bot.mesh.barFg.position.x = -0.29 * (1 - bot.health / 100);
    bot.mesh.barBg.lookAt(camera.position);
    bot.mesh.barFg.lookAt(camera.position);

    bot.perceiveT -= dt;
    bot.scanT -= dt;
    if (bot.heardT > 0) bot.heardT -= dt;

    // --- Perception: find the nearest visible enemy. ---
    if (bot.perceiveT <= 0) {
      bot.perceiveT = PERCEIVE_EVERY;
      let best = null;
      let bestDist = Infinity;
      // The player, when alive and on the other team.
      if (ctx.playerAlive && ctx.playerTeam !== bot.team) {
        _a.copy(ctx.playerPos);
        if (canSee(bot, _a)) {
          best = { isPlayer: true, bot: null, dist: _a.distanceTo(bot.mesh.group.position) };
          bestDist = best.dist;
        }
      }
      for (const other of bots) {
        if (!other.alive || other.team === bot.team) continue;
        chestPos(other, _a);
        if (canSee(bot, _a)) {
          const dist = _a.distanceTo(bot.mesh.group.position);
          if (dist < bestDist) {
            bestDist = dist;
            best = { isPlayer: false, bot: other, dist };
          }
        }
      }
      if (best) {
        if (!bot.target || bot.targetIsPlayer !== best.isPlayer || bot.target?.bot !== best.bot) {
          bot.reactionT = REACTION_MIN + rng() * (REACTION_MAX - REACTION_MIN);
          bot.seenT = 0;
        }
        bot.target = best;
        bot.targetIsPlayer = best.isPlayer;
        bot.seenT += PERCEIVE_EVERY;
      } else {
        bot.target = null;
        bot.seenT = 0;
      }
    }

    // --- Bomb channels: planting and defusing. ---
    if (bot.channelKind) {
      bot.channelT -= dt;
      const site = MAP.sites[bot.channelKind === 'plant' ? bot.targetSite : ctx.bomb.site];
      const dx = bot.mesh.group.position.x - site.x;
      const dz = bot.mesh.group.position.z - site.z;
      const inside = Math.hypot(dx, dz) <= site.radius + 0.5;
      if (!inside) {
        bot.channelKind = null;
        bot.channelT = 0;
      } else if (bot.channelT <= 0) {
        if (bot.channelKind === 'plant') {
          bot.channelKind = null;
          bot.hasBomb = false;
          ctx.onBombPlanted(bot.targetSite);
        } else {
          bot.channelKind = null;
          ctx.onBombDefused(bot);
        }
      }
      return;
    }

    // --- Engaging: aim, react, fire in bursts. ---
    if (bot.target) {
      // Aim at the chest, not the feet: a dedicated vector, so fireAt's eye
      // position never clobbers the target.
      const targetPos = bot.targetIsPlayer
        ? _chest.copy(ctx.playerPos).setY(ctx.playerPos.y + 1.2)
        : chestPos(bot.target.bot, _chest);
      const dist = bot.target.dist;
      // Face the target.
      const dx = targetPos.x - bot.mesh.group.position.x;
      const dz = targetPos.z - bot.mesh.group.position.z;
      const wantYaw = Math.atan2(-dx, -dz);
      let diff = wantYaw - bot.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      bot.yaw += Math.max(-5 * dt, Math.min(5 * dt, diff));
      bot.mesh.group.rotation.y = bot.yaw;

      bot.reactionT -= dt;
      if (bot.reactionT <= 0) {
        // Strafe while firing so the bot is not a standing target.
        bot.strafeT -= dt;
        if (bot.strafeT <= 0) {
          bot.strafeDir = rng() < 0.5 ? -1 : 1;
          bot.strafeT = 0.5 + rng() * 0.8;
        }
        const strafeSpeed = 1.6;
        const sx = Math.cos(bot.yaw) * bot.strafeDir * strafeSpeed * dt;
        const sz = -Math.sin(bot.yaw) * bot.strafeDir * strafeSpeed * dt;
        const nx = bot.mesh.group.position.x + sx;
        const nz = bot.mesh.group.position.z + sz;
        if (!collides(nx, bot.mesh.group.position.y, bot.mesh.group.position.z)) bot.mesh.group.position.x = nx;
        if (!collides(bot.mesh.group.position.x, bot.mesh.group.position.y, nz)) bot.mesh.group.position.z = nz;

        bot.burstT -= dt;
        bot.pauseT -= dt;
        if (bot.burstLeft <= 0 && bot.pauseT <= 0) {
          bot.burstLeft = 3 + Math.floor(rng() * 3);
          bot.pauseT = 0.5 + rng() * 0.5;
        }
        if (bot.burstLeft > 0 && bot.burstT <= 0) {
          bot.burstLeft -= 1;
          bot.burstT = 60 / WEAPONS[bot.weaponId].rpm;
          fireAt(bot, targetPos, dist, ctx);
        }
      }
      return;
    }

    // --- No enemy: follow the round's job. ---
    if (ctx.bomb.state === 'planted') {
      if (bot.team === 'defend') {
        // Rush the planted site, then defuse.
        const site = MAP.sites[ctx.bomb.site];
        const dx = bot.mesh.group.position.x - site.x;
        const dz = bot.mesh.group.position.z - site.z;
        if (Math.hypot(dx, dz) < 1.6) {
          bot.channelKind = 'defuse';
          bot.channelT = DEFUSE_SECONDS;
          audio.defuseBeep();
        } else {
          setPathIfNeeded(bot, ctx.bomb.site === 'A' ? 'ASite' : 'BSite');
          moveAlongPath(bot, dt);
        }
      } else {
        // Attackers fall back and guard the planted bomb.
        const site = MAP.sites[ctx.bomb.site];
        const guardId = ctx.bomb.site === 'A' ? (bot.id.endsWith('0') || bot.id.endsWith('1') ? 'AH1' : 'ASite') : (bot.id.endsWith('0') || bot.id.endsWith('1') ? 'BH1' : 'BSite');
        setPathIfNeeded(bot, guardId);
        if (!moveAlongPath(bot, dt)) {
          bot.scanT = 0;
        } else if (bot.scanT <= 0) {
          bot.yaw += 0.6 * dt;
          bot.mesh.group.rotation.y = bot.yaw;
          if (bot.scanT < -3) bot.scanT = 2;
        }
      }
      return;
    }

    if (ctx.bomb.state === 'dropped' && bot.team === 'attack') {
      const dx = bot.mesh.group.position.x - ctx.bomb.pos.x;
      const dz = bot.mesh.group.position.z - ctx.bomb.pos.z;
      if (Math.hypot(dx, dz) < 1.2) {
        bot.hasBomb = true;
        ctx.onBombPickup(bot);
        bot.path = findPath(nearestWaypoint(bot.mesh.group.position.x, bot.mesh.group.position.z), bot.targetSite === 'A' ? 'ASite' : 'BSite');
        bot.pathIndex = 0;
        bot.state = 'advance';
      } else {
        // Walk straight at the dropped bomb (it is on open ground).
        const dist = Math.hypot(dx, dz);
        const stepLen = bot.speed * dt;
        const nx = bot.mesh.group.position.x - (dx / dist) * stepLen;
        const nz = bot.mesh.group.position.z - (dz / dist) * stepLen;
        if (!collides(nx, bot.mesh.group.position.y, bot.mesh.group.position.z)) bot.mesh.group.position.x = nx;
        if (!collides(bot.mesh.group.position.x, bot.mesh.group.position.y, nz)) bot.mesh.group.position.z = nz;
        bot.yaw = Math.atan2(dx, dz);
        bot.mesh.group.rotation.y = bot.yaw;
      }
      return;
    }

    if (bot.team === 'attack') {
      // Push to the site; plant when the carrier arrives and it is quiet.
      const arrived = moveAlongPath(bot, dt);
      if (arrived) {
        const site = MAP.sites[bot.targetSite];
        const dx = bot.mesh.group.position.x - site.x;
        const dz = bot.mesh.group.position.z - site.z;
        if (bot.hasBomb && Math.hypot(dx, dz) <= site.radius && ctx.bomb.state === 'carried') {
          bot.channelKind = 'plant';
          bot.channelT = PLANT_SECONDS;
          audio.plantBeep();
        } else if (bot.scanT <= 0) {
          bot.yaw += 0.5 * dt;
          bot.mesh.group.rotation.y = bot.yaw;
          if (bot.scanT < -3) bot.scanT = 2;
        }
      }
    } else {
      // Defenders: reach the hold, then scan.
      const arrived = moveAlongPath(bot, dt);
      if (arrived) {
        if (bot.scanT <= 0) {
          bot.yaw += 0.7 * dt;
          bot.mesh.group.rotation.y = bot.yaw;
          if (bot.scanT < -4) bot.scanT = 2.5;
        }
      }
    }
  }

  function setPathIfNeeded(bot, toId) {
    const last = bot.path[bot.path.length - 1];
    if (last !== toId) setPath(bot, toId);
  }

  // One bot shot: an angular error, a ray, damage if it lands, a tracer
  // either way. Accuracy falls with distance and target speed.
  function fireAt(bot, targetPos, dist, ctx) {
    const def = WEAPONS[bot.weaponId];
    eyePos(bot, _a);
    _dir.copy(targetPos).sub(_a);
    const len = _dir.length();
    if (len < 0.01) return;
    _dir.multiplyScalar(1 / len);
    const moving = bot.targetIsPlayer ? ctx.playerSpeed : 2.5;
    // Angular error: wide enough that a still target at 8 m is hit about
    // two in five shots, a moving one less, and long range is hard. The
    // target's half-width is ~0.32/dist radians; the error must be of that
    // order, not far smaller, or the bots never miss.
    const error = (0.04 + dist * 0.005 + moving * 0.012) * (1.35 - bot.skill);
    _dir.x += (rng() * 2 - 1) * error;
    _dir.y += (rng() * 2 - 1) * error;
    _dir.z += (rng() * 2 - 1) * error;
    _dir.normalize();
    const wallDist = world.rayWorld(_a, _dir, 80);
    const end = _b.copy(_a).addScaledVector(_dir, Math.min(wallDist, 80));
    ctx.tracer(_a, end);
    audio.shot(def.sound, true);
    // Did the shot land on the target? Test the ray against the target's box.
    let hit = false;
    let headshot = false;
    if (bot.targetIsPlayer) {
      const p = ctx.playerPos;
      probe.min.set(p.x - 0.32, p.y, p.z - 0.32);
      probe.max.set(p.x + 0.32, p.y + 1.55, p.z + 0.32);
      _ray.set(_a, _dir);
      if (_ray.intersectBox(probe, _to)) {
        const d = _to.distanceTo(_a);
        if (d < wallDist) {
          hit = true;
          headshot = _to.y > p.y + 1.38;
        }
      }
    } else {
      const victim = bot.target.bot;
      if (victim && victim.alive) {
        const pos = victim.mesh.group.position;
        probe.min.set(pos.x - 0.3, pos.y, pos.z - 0.3);
        probe.max.set(pos.x + 0.3, pos.y + BODY_TOP, pos.z + 0.3);
        _ray.set(_a, _dir);
        if (_ray.intersectBox(probe, _to)) {
          const d = _to.distanceTo(_a);
          if (d < wallDist) {
            hit = true;
            headshot = _to.y > pos.y + 1.4;
          }
        }
      }
    }
    if (!hit) return;
    // Bots hit a little softer than the player's own guns, so a burst is
    // survivable and a fight lasts more than a second.
    const amount = def.damage * (headshot ? def.headMult : 1) * 0.75;
    if (bot.targetIsPlayer) {
      ctx.damagePlayer(amount, bot.mesh.group.position);
    } else if (bot.target.bot) {
      const killed = damage(bot.target.bot, amount, headshot ? 'head' : 'torso');
      ctx.onBotShot(bot, bot.target.bot, amount, headshot, killed);
      if (killed) ctx.onBotKilled(bot.target.bot, bot);
    }
  }

  function step(dt, ctx) {
    for (const bot of bots) stepBot(bot, dt, ctx);
  }

  return {
    bots,
    spawnRound,
    step,
    damage,
    hitTest,
    aliveCount,
    carrier,
    reset() {
      for (const bot of bots) scene.remove(bot.mesh.group);
      bots.length = 0;
    },
  };
}
