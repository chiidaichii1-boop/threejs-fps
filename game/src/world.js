// The world: turns MAP into geometry, light and collision. Every box is a
// collider for players and bots and a surface a bullet stops on. Plain
// geometry only, no models and no textures. Also owns the two ray queries
// the game needs: line of sight between two points, and the first wall a
// bullet meets.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { MAP, WAYPOINTS } from './map.js';

const _ray = new THREE.Ray();
const _dir = new THREE.Vector3();
const _to = new THREE.Vector3();

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ember' || name === 'teal' ? 0.6 : 0.92,
      metalness: name === 'ember' || name === 'teal' ? 0.25 : 0.03,
    });
  }

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  for (const [w, h, d, x, y, z, mat] of MAP.boxes) box(w, h, d, x, y, z, mat);

  // Site pads: a glowing ring on the ground so a player can read where to plant.
  const siteMarkers = {};
  for (const [key, site] of Object.entries(MAP.sites)) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.radius - 0.18, site.radius, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(site.color), transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.02, site.z);
    group.add(ring);
    const label = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 1.6, 0.1),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(site.color), transparent: true, opacity: 0.9 }),
    );
    label.position.set(site.x, 3.4, site.z);
    group.add(label);
    siteMarkers[key] = { ring, label };
  }

  // Dusk sky: a warm key sun low from the south-west, a cool fill, and a
  // sky/ground gradient so the yard reads at a glance.
  const sky = new THREE.HemisphereLight(new THREE.Color('#a08a70'), new THREE.Color(PALETTE.canvas), 1.5);
  scene.add(sky);

  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb066'), 3.2);
  sun.position.set(-14, 18, 16);
  sun.target.position.set(0, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -26;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  const fill = new THREE.DirectionalLight(new THREE.Color('#5a7a8a'), 0.9);
  fill.position.set(10, 12, -14);
  scene.add(fill);

  // A few warm yard lamps over the sites so the objective reads at night.
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffcf8a') });
  for (const [key, site] of Object.entries(MAP.sites)) {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.15, 4.4, 0.15), materials.hairline);
    pole.position.set(site.x + 2.6, 2.2, site.z + 2.6);
    group.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), lampMat);
    bulb.position.set(site.x + 2.6, 4.5, site.z + 2.6);
    group.add(bulb);
    const light = new THREE.PointLight(new THREE.Color('#ffbf70'), 12, 14);
    light.position.set(site.x + 2.6, 4.3, site.z + 2.6);
    scene.add(light);
  }

  // True when nothing solid stands between a and b.
  function losClear(a, b) {
    _dir.copy(b).sub(a);
    const dist = _dir.length();
    if (dist < 0.001) return true;
    _dir.multiplyScalar(1 / dist);
    _ray.set(a, _dir);
    for (const box of colliders) {
      const hit = _ray.intersectBox(box, _to);
      if (hit && _to.distanceToSquared(a) < dist * dist - 0.01) return false;
    }
    return true;
  }

  // Distance from origin along dir to the first wall, or Infinity.
  function rayWorld(origin, dir, maxDist) {
    _ray.set(origin, dir);
    let best = maxDist;
    for (const box of colliders) {
      const hit = _ray.intersectBox(box, _to);
      if (hit) {
        const d = _to.distanceTo(origin);
        if (d < best) best = d;
      }
    }
    return best;
  }

  return {
    colliders,
    shootables,
    group,
    sites: MAP.sites,
    spawns: MAP.spawns,
    waypoints: WAYPOINTS,
    siteMarkers,
    losClear,
    rayWorld,
  };
}
