// The arsenal: five guns and a frag grenade. One definition per weapon, so
// the buy menu, the bots and the player all read the same numbers. The
// arsenal owns the view model, the muzzle flash, tracers and grenade
// projectiles; main.js owns the ray and the damage.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', short: 'P9', price: 0, damage: 30, headMult: 2,
    mag: 12, reserve: 60, rpm: 320, auto: false, pellets: 1,
    spreadStill: 0.004, spreadMove: 0.02, spreadAir: 0.035,
    recoil: 0.007, kick: 0.03, speed: 5.4, sound: 'pistol', zoom: 1,
  },
  smg: {
    id: 'smg', name: 'VK-9 Raptor', short: 'VK-9', price: 1200, damage: 21, headMult: 2,
    mag: 30, reserve: 120, rpm: 750, auto: true, pellets: 1,
    spreadStill: 0.008, spreadMove: 0.03, spreadAir: 0.045,
    recoil: 0.004, kick: 0.02, speed: 5.2, sound: 'smg', zoom: 1,
  },
  rifle: {
    id: 'rifle', name: 'AR-77 Vanguard', short: 'AR-77', price: 2700, damage: 33, headMult: 2,
    mag: 30, reserve: 90, rpm: 600, auto: true, pellets: 1,
    spreadStill: 0.003, spreadMove: 0.025, spreadAir: 0.04,
    recoil: 0.009, kick: 0.05, speed: 5.0, sound: 'rifle', zoom: 1,
  },
  shotgun: {
    id: 'shotgun', name: 'BR-12 Breacher', short: 'BR-12', price: 1400, damage: 11, headMult: 1.5,
    mag: 6, reserve: 24, rpm: 75, auto: false, pellets: 8,
    spreadStill: 0.045, spreadMove: 0.06, spreadAir: 0.07,
    recoil: 0.032, kick: 0.12, speed: 5.2, sound: 'shotgun', zoom: 1,
  },
  sniper: {
    id: 'sniper', name: 'LS-50 Longshot', short: 'LS-50', price: 4750, damage: 95, headMult: 4,
    mag: 5, reserve: 15, rpm: 50, auto: false, pellets: 1,
    spreadStill: 0.001, spreadMove: 0.03, spreadAir: 0.05,
    recoil: 0.05, kick: 0.16, speed: 4.8, sound: 'sniper', zoom: 2.6,
  },
};

export const GRENADE_PRICE = 300;
export const ARMOR_PRICE = 650;
const GRENADE_FUSE = 1.6;
const GRENADE_RADIUS = 6.5;
const GRENADE_MAX_DAMAGE = 95;
const GRAVITY = 14;

export function createArsenal(camera, audio, world) {
  const gripMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#141210'), roughness: 0.7, metalness: 0.2 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#4a4440'), roughness: 0.5, metalness: 0.45 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#0d0b09'), roughness: 0.55, metalness: 0.4 });

  const model = new THREE.Group();
  model.position.set(0.26, -0.24, -0.5);
  model.scale.setScalar(0.85);
  model.rotation.y = -0.06;
  camera.add(model);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.26, -0.22, -1.0);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.26, -0.2, -0.7);
  camera.add(flashLight);

  // A small warm light on the camera so the view model reads in the dusk.
  const viewLight = new THREE.PointLight(new THREE.Color('#ffd9a0'), 1.5, 3);
  viewLight.position.set(0.2, 0.1, -0.4);
  camera.add(viewLight);

  // A small pool of tracer lines, reused so firing never allocates.
  const tracers = [];
  for (let i = 0; i < 10; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0 }));
    line.frustumCulled = false;
    line.visible = false;
    camera.parent.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIndex = 0;

  const grenades = [];
  const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const grenadeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2e4a2e'), roughness: 0.6, metalness: 0.4 });

  const state = {
    weaponId: 'pistol', mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve,
    cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, bloom: 0,
    grenades: 0, scoped: false, switchLeft: 0,
  };

  function buildModel(def) {
    while (model.children.length > 0) model.remove(model.children[0]);
    const add = (w, h, d, x, y, z, mat) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      model.add(mesh);
      return mesh;
    };
    if (def.id === 'pistol') {
      add(0.05, 0.09, 0.24, 0, 0.02, -0.08, bodyMat);
      add(0.045, 0.11, 0.05, 0, -0.06, 0.02, gripMat);
    } else if (def.id === 'smg') {
      add(0.08, 0.09, 0.4, 0, 0.02, -0.08, bodyMat);
      add(0.04, 0.04, 0.3, 0, 0.03, -0.36, gripMat);
      add(0.06, 0.12, 0.06, 0, -0.05, 0.02, gripMat);
    } else if (def.id === 'rifle') {
      add(0.09, 0.1, 0.44, 0, 0.02, -0.08, bodyMat);
      add(0.045, 0.045, 0.42, 0, 0.03, -0.42, gripMat);
      add(0.07, 0.12, 0.07, 0, -0.06, 0.04, gripMat);
      add(0.03, 0.05, 0.1, 0, 0.09, -0.1, darkMat);
    } else if (def.id === 'shotgun') {
      add(0.1, 0.11, 0.5, 0, 0.02, -0.06, darkMat);
      add(0.07, 0.07, 0.46, 0, 0.06, -0.3, bodyMat);
      add(0.075, 0.09, 0.2, 0, -0.02, 0.3, gripMat);
    } else {
      add(0.09, 0.1, 0.62, 0, 0.02, -0.14, darkMat);
      add(0.05, 0.05, 0.5, 0, 0.04, -0.5, gripMat);
      add(0.06, 0.09, 0.22, 0, 0.1, -0.12, bodyMat);
      add(0.07, 0.13, 0.07, 0, -0.05, 0.08, gripMat);
    }
  }

  function equip(id, keepAmmo = false) {
    const def = WEAPONS[id];
    if (!def) return;
    state.weaponId = id;
    state.scoped = false;
    state.switchLeft = 0.35;
    state.reloadLeft = 0;
    if (!keepAmmo) {
      state.mag = def.mag;
      state.reserve = def.reserve;
    }
    state.cooldown = 0;
    buildModel(def);
  }

  function def() {
    return WEAPONS[state.weaponId];
  }

  function step(dt, moveSpeed, crouched, airborne, bobPhase) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.switchLeft = Math.max(0, state.switchLeft - dt);
    // Bloom: each shot opens the spread; it settles when the shooter stops.
    state.bloom = Math.max(0, state.bloom - dt * 0.09);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.5 + state.kick;
    model.rotation.x = state.kick * 2.2;
    model.visible = !state.scoped;
    // Walk bob, subtle so the aim stays readable.
    const bob = Math.min(1, moveSpeed / 5) * (crouched ? 0.4 : 1);
    model.position.y = -0.24 + Math.sin(bobPhase * 2) * 0.008 * bob;
    model.position.x = 0.26 + Math.cos(bobPhase) * 0.004 * bob;
    flash.visible = state.flash > 0;
    if (state.flash > 0) flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def().reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def().mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
    for (const tracer of tracers) {
      if (tracer.life <= 0) continue;
      tracer.life -= dt;
      tracer.line.material.opacity = Math.max(0, tracer.life / 0.07);
      if (tracer.life <= 0) tracer.line.visible = false;
    }
  }

  function spread(moveSpeed, crouched, airborne) {
    const d = def();
    let base = d.spreadStill + Math.min(1, moveSpeed / 5.2) * (d.spreadMove - d.spreadStill);
    if (airborne) base = Math.max(base, d.spreadAir);
    if (crouched) base *= 0.7;
    if (state.scoped) base *= 0.35;
    return base + state.bloom;
  }

  function takeShot() {
    const d = def();
    if (state.mag <= 0 || state.cooldown > 0 || state.reloadLeft > 0 || state.switchLeft > 0) return false;
    state.mag -= 1;
    state.cooldown = 60 / d.rpm;
    state.flash = 0.06;
    state.kick = 0.05 + d.kick;
    state.bloom = Math.min(0.05, state.bloom + d.recoil * 0.55);
    audio.shot(d.sound);
    return true;
  }

  function reload() {
    const d = def();
    if (state.reloadLeft > 0 || state.mag === d.mag || state.reserve === 0) return;
    state.reloadLeft = d.reloadTime;
    audio.reload();
  }

  function addTracer(from, to) {
    const tracer = tracers[tracerIndex];
    tracerIndex = (tracerIndex + 1) % tracers.length;
    const pos = tracer.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    tracer.line.visible = true;
    tracer.line.material.opacity = 0.9;
    tracer.life = 0.07;
  }

  function throwGrenade(origin, dir) {
    if (state.grenades <= 0) return false;
    state.grenades -= 1;
    const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
    mesh.position.copy(origin);
    mesh.castShadow = true;
    camera.parent.add(mesh);
    grenades.push({
      mesh,
      vel: new THREE.Vector3(dir.x * 13 + 0, dir.y * 13 + 3.2, dir.z * 13),
      fuse: GRENADE_FUSE,
      bounced: 0,
    });
    return true;
  }

  // Grenade physics: gravity, bounce off the world's boxes, fuse then boom.
  // onExplode(pos) is called by main.js, which owns damage and the flash.
  function updateGrenades(dt, onExplode) {
    const probe = new THREE.Box3();
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const g = grenades[i];
      g.fuse -= dt;
      g.vel.y -= GRAVITY * dt;
      const next = g.mesh.position.clone().addScaledVector(g.vel, dt);
      let bounced = false;
      probe.min.set(next.x - 0.09, next.y - 0.09, next.z - 0.09);
      probe.max.set(next.x + 0.09, next.y + 0.09, next.z + 0.09);
      for (const box of world.colliders) {
        if (!probe.intersectsBox(box)) continue;
        const overlapX = Math.min(probe.max.x - box.min.x, box.max.x - probe.min.x);
        const overlapY = Math.min(probe.max.y - box.min.y, box.max.y - probe.min.y);
        const overlapZ = Math.min(probe.max.z - box.min.z, box.max.z - probe.min.z);
        if (overlapY <= overlapX && overlapY <= overlapZ) {
          g.vel.y = Math.abs(g.vel.y) * 0.45;
          next.y = g.vel.y > 0 ? box.max.y + 0.1 : box.min.y - 0.1;
        } else if (overlapX <= overlapZ) {
          g.vel.x = -g.vel.x * 0.45;
          next.x = g.vel.x > 0 ? box.min.x - 0.1 : box.max.x + 0.1;
        } else {
          g.vel.z = -g.vel.z * 0.45;
          next.z = g.vel.z > 0 ? box.min.z - 0.1 : box.max.z + 0.1;
        }
        bounced = true;
        break;
      }
      if (bounced && g.bounced < 3) {
        g.bounced += 1;
        audio.grenadeBounce();
      }
      g.mesh.position.copy(next);
      if (g.fuse <= 0) {
        const pos = g.mesh.position.clone();
        camera.parent.remove(g.mesh);
        grenades.splice(i, 1);
        onExplode(pos);
      }
    }
  }

  // Reload times live beside the fire rates: one place for weapon feel.
  for (const d of Object.values(WEAPONS)) {
    d.reloadTime = d.id === 'pistol' ? 1.4 : d.id === 'shotgun' ? 2.6 : d.id === 'sniper' ? 3.0 : d.id === 'smg' ? 1.7 : 1.9;
  }
  equip('pistol');

  return {
    state,
    def,
    equip,
    step,
    spread,
    takeShot,
    reload,
    addTracer,
    throwGrenade,
    updateGrenades,
    grenadeRadius: GRENADE_RADIUS,
    grenadeMaxDamage: GRENADE_MAX_DAMAGE,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0 && state.switchLeft === 0;
    },
    toggleScope() {
      if (state.weaponId !== 'sniper') return false;
      state.scoped = !state.scoped;
      return state.scoped;
    },
  };
}
