// The player: movement with acceleration, friction, gravity, crouch and
// jump, resolved as a box against the world's colliders one axis at a time,
// plus health and armour. Movement speed follows the carried weapon, and
// walking slowly keeps the aim true.
import * as THREE from 'three';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.4;
const WALK_SLOW_SPEED = 2.9;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 6.2;
const MAX_HEALTH = 100;

export function createPlayer(colliders) {
  const player = {
    position: new THREE.Vector3(0, 0, 17.5),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: STAND_EYE,
    onGround: true,
    crouching: false,
    walking: false,
    height: STAND_HEIGHT,
    health: MAX_HEALTH,
    armor: 0,
    alive: true,
  };
  const probe = new THREE.Box3();
  const wish = new THREE.Vector3();
  let stepPhase = 0;
  let stepAcc = 0;

  // lift keeps the feet and the crown out of the horizontal tests, so standing
  // on the floor is not read as walking into a wall.
  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }

  function look(dx, dy, sensitivity = 0.0022) {
    player.yaw -= dx * sensitivity;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    player.pitch = Math.min(1.45, player.pitch + pitchKick);
    player.yaw += yawKick;
  }

  function step(dt, keys, speedMul = 1) {
    if (!player.alive) return;
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    player.walking = keys.has('ShiftLeft') || keys.has('ShiftRight');
    if (crouching && !player.crouching) {
      player.crouching = true;
      player.height = CROUCH_HEIGHT;
    } else if (!crouching && player.crouching && !overlaps(player.position.x, player.position.y, player.position.z, STAND_HEIGHT, 0.02)) {
      player.crouching = false;
      player.height = STAND_HEIGHT;
    }
    const eyeTarget = player.crouching ? CROUCH_EYE : STAND_EYE;
    player.eye += (eyeTarget - player.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }

    let speed = player.crouching ? CROUCH_SPEED : WALK_SPEED;
    if (player.walking) speed = Math.min(speed, WALK_SLOW_SPEED);
    speed *= speedMul;
    const blend = Math.min(1, (player.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
    player.velocity.x += (wish.x * speed - player.velocity.x) * blend;
    player.velocity.z += (wish.z * speed - player.velocity.z) * blend;
    if (player.onGround && !wish.lengthSq()) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      player.velocity.x *= damp;
      player.velocity.z *= damp;
    }

    if (keys.has('Space') && player.onGround) {
      player.velocity.y = JUMP_SPEED;
      player.onGround = false;
    }
    player.velocity.y -= GRAVITY * dt;

    const nextX = player.position.x + player.velocity.x * dt;
    if (!overlaps(nextX, player.position.y, player.position.z, player.height, 0.04)) player.position.x = nextX;
    else player.velocity.x = 0;
    const nextZ = player.position.z + player.velocity.z * dt;
    if (!overlaps(player.position.x, player.position.y, nextZ, player.height, 0.04)) player.position.z = nextZ;
    else player.velocity.z = 0;

    player.position.y += player.velocity.y * dt;
    player.onGround = false;
    const hit = overlaps(player.position.x, player.position.y, player.position.z, player.height, 0);
    if (hit && player.velocity.y <= 0) {
      player.position.y = hit.max.y;
      player.velocity.y = 0;
      player.onGround = true;
    } else if (hit) {
      player.position.y = hit.min.y - player.height;
      player.velocity.y = 0;
    }
    if (player.position.y < 0) {
      player.position.y = 0;
      player.velocity.y = 0;
      player.onGround = true;
    }
    player.velocity.y = Math.max(-30, player.velocity.y);

    // Footstep phase: main.js reads it for sound and view-model bob.
    const speedNow = Math.hypot(player.velocity.x, player.velocity.z);
    if (player.onGround && speedNow > 0.5) {
      const prev = stepPhase;
      stepPhase += dt * speedNow * 1.6;
      stepAcc = Math.floor(stepPhase) - Math.floor(prev) > 0 ? 1 : stepAcc;
    }
  }

  // Armour absorbs half the damage until it runs out; the rest hits health.
  function damage(amount) {
    if (!player.alive) return 0;
    let remaining = amount;
    if (player.armor > 0) {
      const absorbed = Math.min(player.armor, remaining * 0.5);
      player.armor -= absorbed;
      remaining -= absorbed;
    }
    player.health = Math.max(0, player.health - remaining);
    if (player.health <= 0) player.alive = false;
    return remaining;
  }

  function reset(spawn) {
    player.position.set(spawn.x, 0, spawn.z);
    player.velocity.set(0, 0, 0);
    player.yaw = spawn.yaw ?? 0;
    player.pitch = 0;
    player.eye = STAND_EYE;
    player.height = STAND_HEIGHT;
    player.crouching = false;
    player.health = MAX_HEALTH;
    player.armor = 0;
    player.alive = true;
    stepPhase = 0;
    stepAcc = 0;
  }

  return {
    state: player,
    step,
    look,
    recoil,
    damage,
    reset,
    groundSpeed() {
      return Math.hypot(player.velocity.x, player.velocity.z);
    },
    bobPhase() {
      return stepPhase;
    },
    tookStep() {
      if (stepAcc === 1) {
        stepAcc = 0;
        return true;
      }
      return false;
    },
  };
}
