// Foundry Yard: the map of Emberworks. An industrial yard at dusk, 44 m by
// 40 m. Attackers (Vanguard) spawn south and push up three lanes — A-long
// east, mid centre, B-long west — to two bomb sites in the north: A (east,
// container pad) and B (west, warehouse corner). Defenders (Rogue) hold the
// sites and mid. Every entry is data; world.js turns it into geometry and
// colliders, bots.js walks the waypoint graph.
//
// Coordinate system: x east, z south (so the attackers' spawn is +z and the
// defenders' is -z). y is up. A box is [width, height, depth, x, y, z, material].

export const MAP = {
  name: 'Foundry Yard',
  bounds: { minX: -22, maxX: 22, minZ: -20, maxZ: 20 },
  // Bomb sites: a circle on the ground the bomb can be planted in.
  sites: {
    A: { x: 15.5, z: -12.5, radius: 3.6, label: 'A', color: '#ff7a1a' },
    B: { x: -15.5, z: -12.5, radius: 3.6, label: 'B', color: '#37b6c9' },
  },
  spawns: {
    attack: [
      { x: -4, z: 17.5, yaw: 0 },
      { x: -1.5, z: 18, yaw: 0 },
      { x: 1, z: 17.5, yaw: 0 },
      { x: 3.5, z: 18, yaw: 0 },
    ],
    defend: [
      { x: -8, z: -16, yaw: Math.PI },
      { x: -2.5, z: -18, yaw: Math.PI },
      { x: 3, z: -17.5, yaw: Math.PI },
      { x: 9, z: -16, yaw: Math.PI },
    ],
  },
  boxes: [
    // Floor and perimeter walls (5 m high, open to the dusk sky).
    [44.4, 0.4, 40.4, 0, -0.2, 0, 'canvas'],
    [0.4, 5, 40.4, -22.2, 2.5, 0, 'surface'],
    [0.4, 5, 40.4, 22.2, 2.5, 0, 'surface'],
    [44.4, 5, 0.4, 0, 2.5, -20.2, 'surface'],
    [44.4, 5, 0.4, 0, 2.5, 20.2, 'surface'],
    // Mid: a furnace pillar splitting the lane, crates to crouch behind.
    // The crates sit wide of the lane so the mid waypoints run clear.
    [1.8, 3.4, 1.8, 0, 1.7, 0, 'hairline'],
    [2.2, 1.1, 1.2, -6.5, 0.55, 4.5, 'hairline'],
    [2.2, 1.1, 1.2, 6.5, 0.55, -4.5, 'hairline'],
    [1.2, 1.1, 2.2, -6.5, 0.55, -3.5, 'hairline'],
    [1.2, 1.1, 2.2, 6.5, 0.55, 4.5, 'hairline'],
    [1.6, 0.7, 1.6, -6.5, 0.35, -8, 'hairline'],
    [1.6, 0.7, 1.6, 6.5, 0.35, -8, 'hairline'],
    // Mid doors: two low walls forming a choke at z = -8.
    [6, 1.2, 0.8, -7.5, 0.6, -8, 'surface'],
    [6, 1.2, 0.8, 7.5, 0.6, -8, 'surface'],
    // Connector at z = 8: a cross passage between the longs. Each side wall
    // leaves a wide doorway at z 6-10.5 so the longs connect to mid.
    [1.2, 2.6, 1, -11, 1.3, 5.5, 'hairline'],
    [1.2, 2.6, 1, -11, 1.3, 11, 'hairline'],
    [1.2, 2.6, 1, 11, 1.3, 5.5, 'hairline'],
    [1.2, 2.6, 1, 11, 1.3, 11, 'hairline'],
    [2.4, 0.9, 1.2, -14, 0.45, 8, 'hairline'],
    [2.4, 0.9, 1.2, 14, 0.45, 8, 'hairline'],
    // A-long (east edge): a crate and a container to break the sightline.
    [1.6, 1.1, 1.6, 20.5, 0.55, 9, 'hairline'],
    [2.6, 2.6, 2.6, 20.5, 1.3, -3, 'ember'],
    // B-long (west edge): same, mirrored.
    [1.6, 1.1, 1.6, -20.5, 0.55, 9, 'hairline'],
    [2.6, 2.6, 2.6, -20.5, 1.3, -3, 'teal'],
    // A site (east pad): containers along the east and north edges so the
    // site centre itself stays open ground.
    [2.4, 2.6, 6, 20.2, 1.3, -13, 'ember'],
    [4, 2.6, 2.4, 13, 1.3, -18.5, 'surface'],
    [1.6, 1.1, 1.6, 14.5, 0.55, -9.5, 'hairline'],
    [1.2, 0.7, 1.2, 19.5, 0.35, -17.5, 'hairline'],
    // B site (west pad): warehouse corner, container stack, crates.
    [4, 2.6, 2.4, -13, 1.3, -18.5, 'surface'],
    [2.4, 2.6, 6, -20.2, 1.3, -13, 'teal'],
    [1.6, 1.1, 1.6, -14.5, 0.55, -9.5, 'hairline'],
    [1.2, 0.7, 1.2, -19.5, 0.35, -17.5, 'hairline'],
    // Defender backline: a low wall and crates behind each site.
    [4, 1.1, 1, 8, 0.55, -17.5, 'hairline'],
    [4, 1.1, 1, -8, 0.55, -17.5, 'hairline'],
    // Attacker spawn cover: crates against the south wall, clear of the lanes.
    [2.4, 0.9, 1.2, -8, 0.45, 18.5, 'hairline'],
    [2.4, 0.9, 1.2, 8, 0.45, 18.5, 'hairline'],
    // Pipes along the west wall and a vent stack east (dressing that is also cover).
    [0.8, 2.2, 0.8, -20.5, 1.1, -10, 'muted'],
    [0.8, 2.2, 0.8, -20.5, 1.1, 2, 'muted'],
    [0.8, 2.2, 0.8, 20.5, 1.1, -10, 'muted'],
    [0.8, 2.2, 0.8, 20.5, 1.1, 2, 'muted'],
  ],
};

// Waypoints: a graph the bots walk. id -> {x, z, links:[ids]}. Every edge
// was checked against the map: no edge passes through a solid box, and the
// mid lane runs east of the furnace pillar (M2/M3 at x=3.5).
export const WAYPOINTS = {
  AS: { x: 0, z: 17, links: ['AL1', 'M1', 'BL1'] },
  AL1: { x: 18, z: 12, links: ['AS', 'AL2', 'C2'] },
  AL2: { x: 17, z: 2, links: ['AL1', 'AL3'] },
  AL3: { x: 17, z: -6, links: ['AL2', 'ASite', 'M3'] },
  ASite: { x: 15.5, z: -12.5, links: ['AL3', 'AH1', 'AH2', 'M4'] },
  BL1: { x: -18, z: 12, links: ['AS', 'BL2', 'C1'] },
  BL2: { x: -17, z: 2, links: ['BL1', 'BL3'] },
  BL3: { x: -17, z: -6, links: ['BL2', 'BSite', 'M3'] },
  BSite: { x: -15.5, z: -12.5, links: ['BL3', 'BH1', 'BH2', 'M4'] },
  M1: { x: 0, z: 10, links: ['AS', 'M2', 'C1', 'C2'] },
  M2: { x: 3.5, z: 2, links: ['M1', 'M3'] },
  // M3 reaches the holds via M4: the direct diagonal crosses the mid-door wall.
  M3: { x: 3.5, z: -6, links: ['M2', 'M4', 'AL3', 'BL3'] },
  M4: { x: 0, z: -12, links: ['M3', 'DS', 'ASite', 'BSite'] },
  C1: { x: -8, z: 8, links: ['M1', 'BL1'] },
  C2: { x: 8, z: 8, links: ['M1', 'AL1'] },
  DS: { x: 0, z: -17, links: ['M4', 'AH1', 'BH1'] },
  AH1: { x: 11, z: -14, links: ['DS', 'ASite'] },
  AH2: { x: 18, z: -16, links: ['ASite'] },
  BH1: { x: -11, z: -14, links: ['DS', 'BSite'] },
  BH2: { x: -18, z: -16, links: ['BSite'] },
};

// Breadth-first path on the waypoint graph. Returns an array of waypoint ids
// from the start (exclusive) to the goal (inclusive), or [] when unreachable.
export function findPath(fromId, toId) {
  if (fromId === toId) return [toId];
  const prev = new Map([[fromId, null]]);
  const queue = [fromId];
  while (queue.length > 0) {
    const id = queue.shift();
    const node = WAYPOINTS[id];
    if (!node) continue;
    for (const next of node.links) {
      if (prev.has(next)) continue;
      prev.set(next, id);
      if (next === toId) {
        const path = [next];
        let at = id;
        while (at !== null) {
          path.unshift(at);
          at = prev.get(at);
        }
        return path.slice(1);
      }
      queue.push(next);
    }
  }
  return [];
}

export function nearestWaypoint(x, z) {
  let best = null;
  let bestDist = Infinity;
  for (const [id, node] of Object.entries(WAYPOINTS)) {
    const dx = node.x - x;
    const dz = node.z - z;
    const dist = dx * dx + dz * dz;
    if (dist < bestDist) {
      bestDist = dist;
      best = id;
    }
  }
  return best;
}
