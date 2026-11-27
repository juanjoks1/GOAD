// Descenso subterráneo: escalera de concreto, pasillo estrecho y húmedo con bombillas
// (una fundida), tubería, y al fondo una puerta metálica moderna que no debería estar ahí.
import * as THREE from 'three';
import { createRng } from '../../core/rng.js';
import { HUT, FLOOR_Y, STAIRS, CORRIDOR, CORRIDOR_Y, METAL_DOOR, stairHeightAt } from '../../world/layout.js';
import { bake, merge, tubeGeometry } from '../builders.js';
import { UNDERGROUND_LIGHTS, tunnelOcclusion } from './lighting.js';

const X = HUT.x;
const Z = HUT.z;
const HW = STAIRS.halfWidth;
const CEIL = CORRIDOR_Y + CORRIDOR.height;
const BAKE = { ...UNDERGROUND_LIGHTS, occlusion: tunnelOcclusion };

/** Techo sobre la escalera (inclinado) y sobre el pasillo (plano). */
const ceilingAt = (lz) => (lz > STAIRS.zBottom ? stairHeightAt(lz) + STAIRS.clearance : CEIL);
/** Parte baja visible de los muros. */
const wallBottomAt = (lz) => (lz > STAIRS.zBottom ? stairHeightAt(lz) - 0.35 : CORRIDOR_Y);

/**
 * Rejilla genérica: `point(u, v)` → [x, y, z] (u, v en 0..1), con normal fija y UV en metros.
 * Se dibuja por ambas caras; la normal solo se usa para hornear la luz.
 */
function gridSurface(cols, rows, point, normal, uvFn) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const p = point(i / cols, j / rows);
      positions.push(...p);
      normals.push(...normal);
      uvs.push(...uvFn(p, i / cols, j / rows));
    }
  }
  const w = cols + 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * w + i;
      indices.push(a, a + 1, a + w, a + w, a + 1, a + w + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

/** Muro lateral entre z0 y z1 (locales), con borde inferior y superior variables. */
function sideWall(side, z0, z1, topFn) {
  const len = Math.abs(z1 - z0);
  const cols = Math.max(2, Math.round(len / 0.3));
  return gridSurface(
    cols,
    7,
    (u, v) => {
      const lz = z0 + (z1 - z0) * u;
      const y0 = wallBottomAt(lz);
      const y1 = topFn(lz);
      return [X + side * HW, y0 + (y1 - y0) * v, Z + lz];
    },
    [-side, 0, 0],
    (p, u) => {
      const lz = z0 + (z1 - z0) * u;
      return [p[2] / 1.6, (p[1] - wallBottomAt(lz)) / 2.2];
    },
  );
}

function horizontal(z0, z1, yFn, normalY, cellZ = 0.3) {
  const cols = 5;
  const rows = Math.max(2, Math.round(Math.abs(z1 - z0) / cellZ));
  return gridSurface(
    cols,
    rows,
    (u, v) => {
      const lz = z0 + (z1 - z0) * v;
      return [X - HW + u * HW * 2, yFn(lz), Z + lz];
    },
    [0, normalY, 0],
    (p) => [p[0] / 1.6, -p[2] / 1.6],
  );
}

function vertical(lz, y0, y1, normalZ, rows = 4) {
  return gridSurface(
    5,
    rows,
    (u, v) => [X - HW + u * HW * 2, y0 + (y1 - y0) * v, Z + lz],
    [0, 0, normalZ],
    (p) => [p[0] / 1.6, (p[1] - CORRIDOR_Y) / 2.2],
  );
}

function baked(geos, map, extra = {}) {
  const geo = merge(geos);
  bake(geo, BAKE);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map, vertexColors: true, side: THREE.DoubleSide, ...extra }));
}

function stepsGeometry() {
  const rng = createRng(808);
  const parts = [];
  const run = (STAIRS.zTop - STAIRS.zBottom) / STAIRS.steps;
  const rise = STAIRS.depth / STAIRS.steps;
  for (let i = 0; i < STAIRS.steps; i++) {
    const top = FLOOR_Y - (i + 0.5) * rise;
    const zc = STAIRS.zTop - (i + 0.5) * run;
    const g = new THREE.BoxGeometry(HW * 2, rise + 0.06, run, 5, 1, 1);
    g.translate(X, top - (rise + 0.06) / 2, Z + zc + rng.spread(0.004));
    parts.push(g);
  }
  return parts;
}

function bulbs(textures) {
  const group = new THREE.Group();
  const cordMat = new THREE.MeshBasicMaterial({ color: 0x0c0c0b });
  const onMat = new THREE.MeshBasicMaterial({ color: 0xffe2b0 });
  const offMat = new THREE.MeshBasicMaterial({ color: 0x3a3833 });
  const glowMat = new THREE.SpriteMaterial({
    map: textures.glow,
    color: 0xffc58a,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: true,
  });
  for (const b of CORRIDOR.bulbs) {
    const y = CEIL - 0.26;
    const cord = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.2, 0.012), cordMat);
    cord.position.set(X, CEIL - 0.1, Z + b.z);
    const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.06, 6), cordMat);
    socket.position.set(X, y + 0.06, Z + b.z);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), b.on ? onMat : offMat);
    bulb.position.set(X, y, Z + b.z);
    group.add(cord, socket, bulb);
    if (b.on) {
      const glow = new THREE.Sprite(glowMat);
      glow.position.copy(bulb.position);
      glow.scale.setScalar(0.8);
      group.add(glow);
    }
  }
  return group;
}

function pipes(textures) {
  const parts = [];
  const px = HW - 0.2;
  const py = CEIL - 0.11;
  const pts = [];
  for (let lz = CORRIDOR.zStart - 0.1; lz >= CORRIDOR.zEnd; lz -= 0.5) pts.push([X + px, py, Z + lz]);
  pts.push([X + px, py, Z + CORRIDOR.zEnd]);
  parts.push(tubeGeometry(pts, pts.map(() => 0.055), { sides: 6, vScale: 1 }));
  // conducto eléctrico fino del otro lado
  const cpts = pts.map((p) => [X - HW + 0.08, CEIL - 0.05, p[2]]);
  parts.push(tubeGeometry(cpts, cpts.map(() => 0.018), { sides: 4, vScale: 1 }));
  for (let lz = CORRIDOR.zStart - 0.6; lz > CORRIDOR.zEnd; lz -= 2.1) {
    const g = new THREE.BoxGeometry(0.03, 0.12, 0.05);
    g.translate(X + px, CEIL - 0.06, Z + lz);
    parts.push(g);
  }
  const drain = new THREE.BoxGeometry(0.32, 0.012, 0.32, 2, 1, 2);
  drain.translate(X - 0.1, CORRIDOR_Y + 0.006, Z - 20.4);
  parts.push(drain);
  return baked(parts, textures.steel);
}

function metalDoor(textures) {
  const group = new THREE.Group();
  const dz = METAL_DOOR.z;
  const dw = METAL_DOOR.width;
  const dh = METAL_DOOR.height;

  // Hoja de la puerta (luz horneada en una rejilla para que reciba la lámpara de emergencia).
  const leaf = new THREE.PlaneGeometry(dw, dh, 4, 10);
  leaf.translate(X, CORRIDOR_Y + 0.015 + dh / 2, Z + dz + 0.035);
  group.add(baked([leaf], textures.metalDoor, { side: THREE.FrontSide }));

  // Marco, manija y placa.
  const frame = [];
  for (const s of [-1, 1]) {
    const g = new THREE.BoxGeometry(0.06, dh + 0.06, 0.1, 1, 6, 1);
    g.translate(X + s * (dw / 2 + 0.03), CORRIDOR_Y + (dh + 0.06) / 2, Z + dz + 0.03);
    frame.push(g);
  }
  const head = new THREE.BoxGeometry(dw + 0.12, 0.06, 0.1, 4, 1, 1);
  head.translate(X, CORRIDOR_Y + dh + 0.06, Z + dz + 0.03);
  frame.push(head);
  const lever = new THREE.BoxGeometry(0.15, 0.024, 0.026);
  lever.translate(X + dw / 2 - 0.16, CORRIDOR_Y + 1.02, Z + dz + 0.09);
  const rose = new THREE.CylinderGeometry(0.03, 0.03, 0.03, 8);
  rose.rotateX(Math.PI / 2);
  rose.translate(X + dw / 2 - 0.1, CORRIDOR_Y + 1.02, Z + dz + 0.06);
  frame.push(lever, rose);
  // Lámpara de emergencia en el techo, frente a la puerta.
  const lamp = new THREE.BoxGeometry(0.34, 0.06, 0.12);
  lamp.translate(X, CEIL - 0.03, Z + dz + 0.45);
  frame.push(lamp);
  group.add(baked(frame, textures.steel));

  const lampFace = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.09), new THREE.MeshBasicMaterial({ color: 0xdfeeff }));
  lampFace.rotation.x = Math.PI / 2;
  lampFace.position.set(X, CEIL - 0.061, Z + dz + 0.45);
  group.add(lampFace);
  const lampGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: textures.glow, color: 0xbfdcff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }),
  );
  lampGlow.position.set(X, CEIL - 0.12, Z + dz + 0.45);
  lampGlow.scale.set(1.1, 0.7, 1);
  group.add(lampGlow);

  // Luz fría que se escapa por debajo de la puerta.
  const leak = new THREE.Mesh(new THREE.PlaneGeometry(dw - 0.04, 0.014), new THREE.MeshBasicMaterial({ color: 0xe4f0ff, fog: true }));
  leak.position.set(X, CORRIDOR_Y + 0.008, Z + dz + 0.04);
  group.add(leak);

  // Letrero en el muro izquierdo.
  const sign = new THREE.PlaneGeometry(0.42, 0.26, 2, 2);
  sign.rotateY(Math.PI / 2);
  sign.translate(X - HW + 0.006, CORRIDOR_Y + 1.55, Z + dz + 0.75);
  group.add(baked([sign], textures.sign, { side: THREE.FrontSide }));

  // Lector de tarjetas con LED verde.
  const reader = new THREE.BoxGeometry(0.03, 0.13, 0.085);
  reader.translate(X + HW - 0.015, CORRIDOR_Y + 1.2, Z + dz + 0.38);
  group.add(new THREE.Mesh(reader, new THREE.MeshBasicMaterial({ color: 0x1a1c1d })));
  const ledMat = new THREE.MeshBasicMaterial({ color: 0x3cff6a });
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.012), ledMat);
  led.position.set(X + HW - 0.032, CORRIDOR_Y + 1.245, Z + dz + 0.38);
  group.add(led);

  return { group, ledMat };
}

export function createUnderground(textures) {
  const group = new THREE.Group();
  group.name = 'subterraneo';

  // Escalones.
  group.add(baked(stepsGeometry(), textures.wetFloor));

  // Muros laterales: tramo bajo la abertura (hasta el piso), tramo con techo y pasillo.
  const walls = [];
  for (const s of [-1, 1]) {
    walls.push(sideWall(s, STAIRS.zTop, STAIRS.openingEnd, () => FLOOR_Y));
    walls.push(sideWall(s, STAIRS.openingEnd, STAIRS.zBottom, ceilingAt));
    walls.push(sideWall(s, CORRIDOR.zStart, CORRIDOR.zEnd, () => CEIL));
  }
  // Bordes de la losa: labio sur (arriba de la escalera) y frente norte (inicio del techo).
  walls.push(vertical(STAIRS.zTop, FLOOR_Y - 0.4, FLOOR_Y, -1, 1));
  walls.push(vertical(STAIRS.openingEnd, ceilingAt(STAIRS.openingEnd), FLOOR_Y, 1, 1));
  // Muro del fondo (detrás de la puerta).
  walls.push(vertical(CORRIDOR.zEnd, CORRIDOR_Y, CEIL, 1, 7));
  group.add(baked(walls, textures.dampWall));

  // Techos.
  const ceilings = [horizontal(STAIRS.openingEnd, STAIRS.zBottom, ceilingAt, -1), horizontal(CORRIDOR.zStart, CORRIDOR.zEnd, () => CEIL, -1)];
  group.add(baked(ceilings, textures.dampWall));

  // Piso del pasillo.
  group.add(baked([horizontal(CORRIDOR.zStart, CORRIDOR.zEnd - 0.01, () => CORRIDOR_Y, 1, 0.25)], textures.wetFloor));

  group.add(bulbs(textures));
  group.add(pipes(textures));
  const door = metalDoor(textures);
  group.add(door.group);

  // Todo lo iluminado del subterráneo, para poder apagar la luz (el LED tiene batería propia).
  const lit = [];
  group.traverse((o) => {
    if (!o.material || o.material === door.ledMat) return;
    lit.push({ material: o.material, color: o.material.color.clone(), opacity: o.material.opacity });
  });
  let lightLevel = 1;

  return {
    group,
    /** 1 = bombillas encendidas, ~0 = apagón. */
    setLightLevel(k) {
      if (k === lightLevel) return;
      lightLevel = k;
      for (const l of lit) {
        l.material.color.copy(l.color).multiplyScalar(k);
        if (l.material.isSpriteMaterial) l.material.opacity = l.opacity * k;
      }
    },
    update(time) {
      // El LED parpadea despacio, como si esperara una tarjeta.
      const on = Math.floor(time * 0.7) % 3 !== 2;
      door.ledMat.color.setHex(on ? 0x3cff6a : 0x0a3014);
    },
  };
}
