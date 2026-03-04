/**
 * Client-side 3D bin packer using an extreme-point algorithm.
 *
 * Supports the same custom rules as the Java backend:
 *   - Same-type stacking preference
 *   - No overhang (must fit within a single supporter)
 *   - Category grouping (prefer adjacent same-category)
 *   - Max stack height limit
 *   - Per-item canBeStacked / canHaveOnTop constraints
 *   - Gravity enforcement (no floating boxes)
 */

// ── Extreme-point 3D bin packer ─────────────────────────────────────────────

/**
 * An available placement point with remaining space envelope.
 */
class EP {
  constructor(x, y, z, maxX, maxY, maxZ) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.maxX = maxX;
    this.maxY = maxY;
    this.maxZ = maxZ;
  }
  fitsDx() { return this.maxX - this.x; }
  fitsDy() { return this.maxY - this.y; }
  fitsDz() { return this.maxZ - this.z; }
}

/**
 * Generate orientations for a box.  When flip=false only the original
 * orientation is used.  When flip=true all 6 axis-aligned rotations are tried.
 */
function orientations(box) {
  const { dx, dy, dz } = box;
  if (!box.flip) return [{ dx, dy, dz }];
  const set = new Set();
  const out = [];
  for (const [a, b, c] of [[dx,dy,dz],[dx,dz,dy],[dy,dx,dz],[dy,dz,dx],[dz,dx,dy],[dz,dy,dx]]) {
    const key = `${a},${b},${c}`;
    if (!set.has(key)) { set.add(key); out.push({ dx: a, dy: b, dz: c }); }
  }
  return out;
}

/**
 * Check if two axis-aligned boxes overlap in XY at a given Z.
 */
function overlapsXY(a, b) {
  return a.x < b.x + b.dx && a.x + a.dx > b.x &&
         a.y < b.y + b.dy && a.y + a.dy > b.y;
}

/**
 * Check if point (px,py) is inside the XY footprint of a placed box.
 */
function pointInFootprint(px, py, p) {
  return px >= p.x && px <= p.x + p.dx - 1 &&
         py >= p.y && py <= p.y + p.dy - 1;
}

// ── Rule checks ─────────────────────────────────────────────────────────────

function hasGravitySupport(x, y, z, dx, dy, placements) {
  if (z === 0) return true;
  for (const p of placements) {
    if (p.z + p.dz !== z) continue;
    const ox = Math.max(0, Math.min(x + dx, p.x + p.dx) - Math.max(x, p.x));
    const oy = Math.max(0, Math.min(y + dy, p.y + p.dy) - Math.max(y, p.y));
    if (ox > 0 && oy > 0) return true;
  }
  return false;
}

function fitsWithinSingleSupporter(x, y, z, dx, dy, placements) {
  if (z === 0) return true;
  for (const p of placements) {
    if (p.z + p.dz !== z) continue;
    if (p.x <= x && p.x + p.dx >= x + dx && p.y <= y && p.y + p.dy >= y + dy) return true;
  }
  return false;
}

function countStackLevel(x, y, z, placements) {
  if (z === 0) return 1;
  let level = 1;
  let curZ = z;
  while (curZ > 0) {
    level++;
    let found = false;
    for (const p of placements) {
      if (p.z + p.dz - 1 !== curZ - 1) continue;
      if (pointInFootprint(x, y, p)) {
        curZ = p.z;
        found = true;
        break;
      }
    }
    if (!found) break;
  }
  return level;
}

function supporterForbidsTop(x, y, z, dx, dy, placements) {
  if (z === 0) return false;
  for (const p of placements) {
    if (p.z + p.dz !== z) continue;
    const ox = Math.max(0, Math.min(x + dx, p.x + p.dx) - Math.max(x, p.x));
    const oy = Math.max(0, Math.min(y + dy, p.y + p.dy) - Math.max(y, p.y));
    if (ox > 0 && oy > 0 && p.canHaveOnTop === false) return true;
  }
  return false;
}

function calcSameTypeSupport(x, y, z, dx, dy, caseType, placements) {
  if (z === 0) return dx * dy;
  let sum = 0;
  for (const p of placements) {
    if (p.z + p.dz !== z) continue;
    if (p.caseType !== caseType) continue;
    const ox = Math.max(0, Math.min(x + dx, p.x + p.dx) - Math.max(x, p.x));
    const oy = Math.max(0, Math.min(y + dy, p.y + p.dy) - Math.max(y, p.y));
    if (ox > 0 && oy > 0) sum += ox * oy;
  }
  return sum;
}

function isNearSameCategory(x, y, dx, dy, category, placements) {
  if (!category) return false;
  for (const p of placements) {
    if (p.category !== category) continue;
    if (p.x + p.dx + 1 >= x && p.x - 1 <= x + dx &&
        p.y + p.dy + 1 >= y && p.y - 1 <= y + dy) return true;
  }
  return false;
}

// ── Placement scoring (mirrors CasePlacementComparator) ─────────────────────

function scorePlacement(cand, rules) {
  // Lower = better.  We negate things that should be maximized.
  // Priority order: X (section), category, same-type, Z, Y, -area
  const s = [];
  s.push(cand.x);                                                // 1. lower X
  s.push(rules.groupCat && cand.nearCat ? 0 : 1);                // 2. category
  if (rules.sameType && cand.z > 0) {
    s.push(cand.sameTypeSupport > 0 ? 0 : 1);                    // 3a. on same type?
    s.push(-cand.sameTypePct);                                    // 3b. how much %
  } else {
    s.push(0);
    s.push(0);
  }
  s.push(cand.z);                                                 // 4. lower Z
  s.push(cand.y);                                                 // 5. lower Y
  s.push(-(cand.odx * cand.ody));                                 // 6. larger footprint
  return s;
}

function compareCandidates(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

// ── Extreme-point maintenance ───────────────────────────────────────────────

function addExtremePoints(eps, placed, containerDx, containerDy, containerDz) {
  const { x, y, z, dx, dy, dz } = placed;
  // On top
  eps.push(new EP(x, y, z + dz, containerDx, containerDy, containerDz));
  // Right side
  eps.push(new EP(x, y + dy, z, containerDx, containerDy, containerDz));
  // In front
  eps.push(new EP(x + dx, y, z, containerDx, containerDy, containerDz));
}

function isPointValid(ep, placed) {
  const box = { x: ep.x, y: ep.y, dx: 1, dy: 1 };
  for (const p of placed) {
    if (ep.x >= p.x && ep.x < p.x + p.dx &&
        ep.y >= p.y && ep.y < p.y + p.dy &&
        ep.z >= p.z && ep.z < p.z + p.dz) {
      return false;
    }
  }
  return true;
}

function collidesWithAny(x, y, z, dx, dy, dz, placed) {
  for (const p of placed) {
    if (x < p.x + p.dx && x + dx > p.x &&
        y < p.y + p.dy && y + dy > p.y &&
        z < p.z + p.dz && z + dz > p.z) return true;
  }
  return false;
}

// ── Main packer ─────────────────────────────────────────────────────────────

/**
 * Pack a list of box items into containers.
 *
 * @param {Object[]} items  - Array of { name, category, caseType, dx, dy, dz,
 *                             weight, flip, canBeStacked, canHaveOnTop }
 * @param {Object}   container - { name, dx, dy, dz, maxWeight }
 * @param {Object}   rules  - { sameType, noOverhang, groupCat, maxHeight }
 * @param {number}   maxContainers - max number of containers to try
 * @returns {Object} JSON structure matching the Java visualizer output
 */
export function packItems(items, container, rules, maxContainers = 10) {
  let remaining = items.map((item, idx) => ({ ...item, _idx: idx }));
  const containers = [];

  for (let c = 0; c < maxContainers && remaining.length > 0; c++) {
    const result = packOneContainer(remaining, container, rules);
    containers.push(formatContainer(result.placed, container, c));
    const placedIdxs = new Set(result.placed.map(p => p._idx));
    remaining = remaining.filter(r => !placedIdxs.has(r._idx));
  }

  return { containers };
}

function packOneContainer(items, container, rules) {
  const { dx: cDx, dy: cDy, dz: cDz } = container;
  const placed = [];
  let eps = [new EP(0, 0, 0, cDx, cDy, cDz)];
  const used = new Set();

  let changed = true;
  while (changed) {
    changed = false;
    let bestScore = null;
    let bestCandidate = null;

    for (let i = 0; i < items.length; i++) {
      if (used.has(items[i]._idx)) continue;
      const item = items[i];

      for (const ori of orientations(item)) {
        for (const ep of eps) {
          if (ori.dx > cDx - ep.x || ori.dy > cDy - ep.y || ori.dz > cDz - ep.z) continue;

          const x = ep.x, y = ep.y, z = ep.z;

          if (collidesWithAny(x, y, z, ori.dx, ori.dy, ori.dz, placed)) continue;

          // Gravity
          if (!hasGravitySupport(x, y, z, ori.dx, ori.dy, placed)) continue;

          // No overhang
          if (rules.noOverhang && !fitsWithinSingleSupporter(x, y, z, ori.dx, ori.dy, placed)) continue;

          // Max height
          if (rules.maxHeight > 0 && countStackLevel(x, y, z, placed) > rules.maxHeight) continue;

          // Per-item: canBeStacked
          if (z > 0 && item.canBeStacked === false) continue;

          // Per-item: supporter forbids top
          if (supporterForbidsTop(x, y, z, ori.dx, ori.dy, placed)) continue;

          const area = ori.dx * ori.dy;
          const sameTypeSupport = calcSameTypeSupport(x, y, z, ori.dx, ori.dy, item.caseType, placed);
          const sameTypePct = area > 0 ? Math.round((sameTypeSupport / area) * 100) : 0;
          const nearCat = isNearSameCategory(x, y, ori.dx, ori.dy, item.category, placed);

          const cand = {
            _idx: item._idx, item, x, y, z,
            odx: ori.dx, ody: ori.dy, odz: ori.dz,
            sameTypeSupport, sameTypePct, nearCat,
          };

          const score = scorePlacement(cand, rules);
          if (!bestScore || compareCandidates(score, bestScore) < 0) {
            bestScore = score;
            bestCandidate = cand;
          }
        }
      }
    }

    if (bestCandidate) {
      const bc = bestCandidate;
      const p = {
        _idx: bc._idx,
        x: bc.x, y: bc.y, z: bc.z,
        dx: bc.odx, dy: bc.ody, dz: bc.odz,
        name: bc.item.name,
        caseType: bc.item.caseType,
        category: bc.item.category,
        canHaveOnTop: bc.item.canHaveOnTop,
        canBeStacked: bc.item.canBeStacked,
      };
      placed.push(p);
      used.add(bc._idx);
      addExtremePoints(eps, p, cDx, cDy, cDz);
      // Prune invalid EPs
      eps = eps.filter(ep => isPointValid(ep, placed));
      changed = true;
    }
  }

  return { placed };
}

// ── Format output to match Java visualizer JSON ─────────────────────────────

function formatContainer(placed, container, index) {
  const placements = placed.map((p, step) => ({
    step: step + 1,
    plugins: [],
    x: p.x,
    y: p.y,
    z: p.z,
    stackable: {
      step: step + 1,
      plugins: [],
      id: p.caseType + "-" + p.category + "-" + p._idx,
      name: p.name + " (" + p.category + ")",
      dx: p.dx,
      dy: p.dy,
      dz: p.dz,
      type: "box",
    },
    points: [],
  }));

  return {
    step: 0,
    plugins: [],
    id: container.name + "-" + (index + 1),
    name: container.name,
    dx: container.dx,
    dy: container.dy,
    dz: container.dz,
    loadDx: container.dx,
    loadDy: container.dy,
    loadDz: container.dz,
    stack: { placements },
    type: "container",
  };
}
