// Cenário do Sonar: sala de sonar de um navio, meia-luz verde e âmbar, painéis com telas de varredura,
// canos no teto. Na frente do jogador, sobre um pedestal, o aquário de vidro 6x6x4 (gira com a mão) com
// rochas no fundo e os submarinos; embaixo, a mesa de comando com os botões das ordens.
import * as THREE from '../vendor/three/three.module.js';
import { NX, NZ, ND, CELLS, cellOf, idx } from './rules.js';
import { ceuGradiente, ambienteDoCeu, luzCeuChao, caixaArredondada, sombraContato, halo } from './visual3d.js';
import { metal, pedra } from './materiais3d.js';

const LEVE = /OculusBrowser|Quest|node-teste/i.test(globalThis.navigator?.userAgent || '');
export const C = 0.07;
export const TANK = new THREE.Vector3(0, 1.24, -0.44);
export const DESK = { y: 0.93, z: 0.0 };
export const STAND = { x: 0, z: 0.4 };
export const SIZE = new THREE.Vector3(NX * C, ND * C, NZ * C);
// casa -> posição local no aquário
export const localOf = (c, out = new THREE.Vector3()) => out.set((c.x - (NX - 1) / 2) * C, ((ND - 1) / 2 - c.d) * C, (c.z - (NZ - 1) / 2) * C);
// posição local -> casa (ou null)
export function cellAtLocal(p) {
  const x = Math.round(p.x / C + (NX - 1) / 2), z = Math.round(p.z / C + (NZ - 1) / 2), d = Math.round((ND - 1) / 2 - p.y / C);
  return x >= 0 && z >= 0 && d >= 0 && x < NX && z < NZ && d < ND ? { x, z, d } : null;
}
export const GREEN = '#5fe08a', AMBER = '#ffb347', RED = '#ff4a3a';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function ctex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
export function mergeGeos(parts) {
  const pos = [], nor = [], uv = [];
  for (const [geo, m] of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (m) g.applyMatrix4(m);
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
    if (g.attributes.uv) uv.push(...g.attributes.uv.array); else for (let i = 0; i < g.attributes.position.count; i++) uv.push(0, 0);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}
const M4 = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

// tela de sonar animada (varredura circular)
function sweepScreen(w, h) {
  const c = canvas(256, 256), g = c.getContext('2d'), tex = ctex(c);
  const blips = Array.from({ length: 5 }, () => ({ a: Math.random() * 6.28, r: 30 + Math.random() * 80, t: 0 }));
  let ang = 0;
  const draw = (dt) => {
    ang += dt * 1.6;
    g.fillStyle = 'rgba(4,22,14,0.25)'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(95,224,138,0.35)'; g.lineWidth = 2;
    for (const r of [40, 80, 120]) { g.beginPath(); g.arc(128, 128, r, 0, Math.PI * 2); g.stroke(); }
    g.beginPath(); g.moveTo(8, 128); g.lineTo(248, 128); g.moveTo(128, 8); g.lineTo(128, 248); g.stroke();
    g.strokeStyle = 'rgba(140,255,170,0.9)'; g.lineWidth = 3; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(ang) * 122, 128 + Math.sin(ang) * 122); g.stroke();
    for (const b of blips) { const d = Math.abs(((ang - b.a) % 6.283 + 6.283) % 6.283); if (d < 0.08) b.t = 1; if (b.t > 0) { b.t -= dt * 0.5; g.fillStyle = `rgba(160,255,180,${b.t})`; g.beginPath(); g.arc(128 + Math.cos(b.a) * b.r, 128 + Math.sin(b.a) * b.r, 4, 0, 6.28); g.fill(); } }
    tex.needsUpdate = true;
  };
  g.fillStyle = '#04160e'; g.fillRect(0, 0, 256, 256);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  return { mesh: m, draw };
}

export function buildWorld(scene, renderer) {
  const world = { scene };
  scene.background = new THREE.Color('#1c2e30');
  if (renderer?.capabilities) {
    try { ambienteDoCeu(renderer, scene, { zenite: '#2a4a50', horizonte: '#3a5a50', chao: '#141c1c', dirSol: new THREE.Vector3(0, 1, 0), corSol: '#a0ffc0', tamanhoSol: 0.2 }, 0.5); } catch { /* sem ambiente */ }
  }
  void ceuGradiente;
  scene.fog = new THREE.Fog('#1c2e30', 5, 14);
  luzCeuChao(scene, { ceu: '#8fd0c8', chao: '#5a4a34', intensidade: 2.0 });
  const key = new THREE.DirectionalLight('#ffcf8a', 2.6); key.position.set(-1.2, 3, 1.5); key.target.position.copy(TANK); scene.add(key, key.target);
  const fill = new THREE.PointLight('#5fe08a', 1.6, 4, 1.5); fill.position.set(0.9, 1.5, -0.2); scene.add(fill);
  const back = new THREE.PointLight('#ffa850', 3, 6, 1.2); back.position.set(0, 2.2, -2); scene.add(back);

  // ---------- sala ----------
  // parede de aço pintado (tinta fosca: não é metal cru, senão fica preta na meia-luz)
  const wallMat = new THREE.MeshStandardMaterial({ color: '#5d7c76', roughness: 0.75, metalness: 0 });
  const floorMat = new THREE.MeshStandardMaterial({ color: '#4a5652', roughness: 0.6, metalness: 0.15 });
  const room = new THREE.Group(); scene.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6).rotateX(-Math.PI / 2), floorMat); floor.position.set(0, 0, -0.5); room.add(floor);
  // grade do piso (linhas)
  const gpts = []; for (let k = -15; k <= 15; k++) { gpts.push(k * 0.2, 0.002, -3.5, k * 0.2, 0.002, 2.5, -3, 0.002, k * 0.2 - 0.5, 3, 0.002, k * 0.2 - 0.5); }
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(gpts, 3));
  room.add(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: '#1a2422' })));
  const walls = new THREE.Mesh(mergeGeos([
    [new THREE.PlaneGeometry(6, 3), M4(0, 1.5, -2.6)], [new THREE.PlaneGeometry(6, 3), M4(-2.4, 1.5, -0.5, 0, Math.PI / 2)],
    [new THREE.PlaneGeometry(6, 3), M4(2.4, 1.5, -0.5, 0, -Math.PI / 2)], [new THREE.PlaneGeometry(6, 3), M4(0, 1.5, 2.2, 0, Math.PI)],
    [new THREE.PlaneGeometry(6, 6), M4(0, 2.6, -0.5, Math.PI / 2)],
  ]), wallMat); room.add(walls);
  // nervuras e canos
  const ribMat = new THREE.MeshStandardMaterial({ color: '#466460', roughness: 0.55, metalness: 0.2 });
  const ribs = [];
  for (let k = -2; k <= 2; k++) ribs.push([caixaArredondada(0.12, 3, 0.1, 0.02, 1), M4(k * 1.1, 1.5, -2.55)]);
  for (const s of [-1, 1]) for (let k = -2; k <= 1; k++) ribs.push([caixaArredondada(0.1, 3, 0.12, 0.02, 1), M4(s * 2.35, 1.5, k * 1.2 - 0.5)]);
  room.add(new THREE.Mesh(mergeGeos(ribs), ribMat));
  const pipeMat = new THREE.MeshStandardMaterial({ color: '#8a6a3a', roughness: 0.35, metalness: 1 });
  room.add(new THREE.Mesh(mergeGeos([
    [new THREE.CylinderGeometry(0.06, 0.06, 6, 12), M4(-0.8, 2.45, -0.5, Math.PI / 2)], [new THREE.CylinderGeometry(0.04, 0.04, 6, 12), M4(-0.6, 2.5, -0.5, Math.PI / 2)],
    [new THREE.CylinderGeometry(0.05, 0.05, 4.8, 12), M4(0, 2.4, -2.4, 0, 0, Math.PI / 2)], [new THREE.CylinderGeometry(0.035, 0.035, 2.6, 10), M4(2.25, 1.3, -1.6)],
  ]), pipeMat));
  // painéis com telas de sonar e lâmpadas âmbar
  world.screens = [];
  const panelMat = new THREE.MeshStandardMaterial({ color: '#3a4c48', roughness: 0.55, metalness: 0.2 });
  const consoleGeo = mergeGeos([[caixaArredondada(0.9, 1.0, 0.45, 0.03, 2), M4(0, 0.5, 0)], [caixaArredondada(0.9, 0.7, 0.12, 0.03, 2), M4(0, 1.35, -0.17, -0.25)]]);
  for (const [x, z, ry] of [[-1.7, -1.6, 0.6], [1.7, -1.6, -0.6], [-2.05, 0.1, Math.PI / 2], [2.05, 0.1, -Math.PI / 2]]) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; room.add(g);
    g.add(new THREE.Mesh(consoleGeo, panelMat));
    const sc = sweepScreen(0.5, 0.5); sc.mesh.position.set(0, 1.37, -0.1); sc.mesh.rotation.x = -0.25; g.add(sc.mesh); world.screens.push(sc);
    const glow = halo(GREEN, 0.9, 0.25); glow.position.set(0, 1.37, -0.05); g.add(glow);
  }
  world.lamps = [];
  const lampMat = new THREE.MeshStandardMaterial({ color: '#ffd28a', emissive: '#ffa23a', emissiveIntensity: 2.2 });
  for (const [x, z] of [[-1.1, -2.5], [1.1, -2.5], [-2.3, -1.4], [2.3, -1.4]]) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), lampMat); l.position.set(x, 2.1, z); room.add(l);
    const h = halo(AMBER, 0.6, 0.6); h.position.copy(l.position); room.add(h); world.lamps.push(h);
  }

  // ---------- pedestal e mesa de comando ----------
  const steel = metal({ tipo: 'aco', escovado: 0.6, arranhoes: 0.3, sujeira: 0.3, leve: LEVE });
  const pedestal = new THREE.Mesh(mergeGeos([
    [new THREE.CylinderGeometry(0.12, 0.2, TANK.y - SIZE.y / 2 - 0.04, 20), M4(0, (TANK.y - SIZE.y / 2 - 0.04) / 2, 0)],
    [new THREE.CylinderGeometry(0.3, 0.32, 0.05, 28), M4(0, 0.025, 0)],
  ]), steel); pedestal.position.set(TANK.x, 0, TANK.z); scene.add(pedestal);
  const shadow = sombraContato(0.9, 0.9, 0.5); shadow.position.set(TANK.x, 0.004, TANK.z); scene.add(shadow);
  const deskMat = new THREE.MeshStandardMaterial({ color: '#46605a', roughness: 0.5, metalness: 0.2 });
  const desk = new THREE.Mesh(mergeGeos([
    [caixaArredondada(0.86, 0.04, 0.34, 0.012, 2), M4(0, DESK.y - 0.02, DESK.z, -0.28)],
    [caixaArredondada(0.8, DESK.y - 0.06, 0.1, 0.02, 2), M4(0, (DESK.y - 0.06) / 2, DESK.z - 0.05)],
  ]), deskMat); scene.add(desk);

  // ---------- aquário ----------
  const tank = new THREE.Group(); tank.position.copy(TANK); scene.add(tank);
  world.tank = tank;
  const content = new THREE.Group(); tank.add(content);
  world.content = content;
  const pad = 0.012;
  const frameMat = new THREE.MeshStandardMaterial({ color: '#b08a4a', roughness: 0.35, metalness: 1 });
  const W = SIZE.x + pad * 2, H = SIZE.y + pad * 2, D = SIZE.z + pad * 2;
  const bars = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bars.push([new THREE.BoxGeometry(0.012, H + 0.012, 0.012), M4(sx * W / 2, 0, sz * D / 2)]);
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) bars.push([new THREE.BoxGeometry(W + 0.012, 0.012, 0.012), M4(0, sy * H / 2, sz * D / 2)]);
    for (const sx of [-1, 1]) bars.push([new THREE.BoxGeometry(0.012, 0.012, D + 0.012), M4(sx * W / 2, sy * H / 2, 0)]);
  }
  tank.add(new THREE.Mesh(mergeGeos(bars), frameMat));
  const base = new THREE.Mesh(caixaArredondada(W + 0.03, 0.03, D + 0.03, 0.008, 2), steel); base.position.y = -H / 2 - 0.016; tank.add(base);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#5e5a4c', roughness: 0.95 }));
  sand.position.y = -H / 2 + 0.001; tank.add(sand);
  // vidro e água (por fora, transparente, sem escrever profundidade)
  const glass = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), new THREE.MeshStandardMaterial({ color: '#7fd8c8', transparent: true, opacity: 0.13, roughness: 0.08, metalness: 0, depthWrite: false, side: THREE.DoubleSide }));
  glass.renderOrder = 5; tank.add(glass);
  const surf = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#5fc8b8', transparent: true, opacity: 0.18, roughness: 0.1, depthWrite: false, side: THREE.DoubleSide }));
  surf.position.y = H / 2 - 0.006; surf.renderOrder = 6; tank.add(surf);
  world.glass = glass;
  // grade de cada camada (pontinhos nas casas) e a camada ativa
  const dotPts = [];
  for (let i = 0; i < CELLS; i++) { const p = localOf(cellOf(i)); dotPts.push(p.x, p.y, p.z); }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(dotPts, 3));
  const dots = new THREE.Points(dg, new THREE.PointsMaterial({ color: '#7fe0b0', size: 0.004, transparent: true, opacity: 0.55, depthWrite: false }));
  content.add(dots);
  const layerGeo = (() => {
    const pts = [];
    for (let k = 0; k <= NX; k++) { const x = (k - NX / 2) * C; pts.push(x, 0, -SIZE.z / 2, x, 0, SIZE.z / 2); }
    for (let k = 0; k <= NZ; k++) { const z = (k - NZ / 2) * C; pts.push(-SIZE.x / 2, 0, z, SIZE.x / 2, 0, z); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); return g;
  })();
  world.layerLines = new THREE.LineSegments(layerGeo, new THREE.LineBasicMaterial({ color: GREEN, transparent: true, opacity: 0.55, depthWrite: false }));
  content.add(world.layerLines);
  world.layerPlane = new THREE.Mesh(new THREE.PlaneGeometry(SIZE.x, SIZE.z).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide }));
  world.layerPlane.userData = { kind: 'layer' }; content.add(world.layerPlane);
  world.setLayer = (d) => { const y = ((ND - 1) / 2 - d) * C; world.layerLines.position.y = y; world.layerPlane.position.y = y; world.layer = d; };
  world.setLayer(0);
  // rochas
  const rockMat = pedra({ tipo: 'rocha', cor: '#6a6458', escura: '#3e3a34', leve: LEVE, repete: [1, 1] });
  const rockGeo = (() => { const g = new THREE.IcosahedronGeometry(C * 0.5, 1), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const f = 0.85 + Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1) * 0.3; p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.9, p.getZ(i) * f); } g.computeVertexNormals(); return g; })();
  world.rocks = new THREE.InstancedMesh(rockGeo, rockMat, CELLS); world.rocks.count = 0; content.add(world.rocks);
  world.setRocks = (rocks) => {
    let n = 0;
    for (let i = 0; i < CELLS; i++) if (rocks[i]) { const p = localOf(cellOf(i)); world.rocks.setMatrixAt(n++, M4(p.x, p.y, p.z, i * 0.7, i * 1.3, 0, 1.0 + (i % 3) * 0.06)); }
    world.rocks.count = n; world.rocks.instanceMatrix.needsUpdate = true;
  };

  // ---------- submarinos ----------
  const hullGeo = mergeGeos([
    [new THREE.CapsuleGeometry(0.011, 0.034, 6, 12), M4(0, 0, 0, Math.PI / 2)],
    [caixaArredondada(0.008, 0.012, 0.016, 0.003, 1), M4(0, 0.013, 0.002)],
    [new THREE.BoxGeometry(0.022, 0.0015, 0.006), M4(0, 0, 0.022)], [new THREE.BoxGeometry(0.0015, 0.016, 0.006), M4(0, 0, 0.022)],
  ]);
  const ownMat = new THREE.MeshStandardMaterial({ color: '#7ad89a', roughness: 0.4, metalness: 0.2, emissive: '#2a9a50', emissiveIntensity: 1.1 });
  const foeMat = new THREE.MeshStandardMaterial({ color: '#b04a3a', roughness: 0.45, metalness: 0.3, emissive: '#5a1a10', emissiveIntensity: 0.6 });
  const wreckMat = new THREE.MeshStandardMaterial({ color: '#3a3430', roughness: 0.9 });
  const numTex = (n, col) => { const c = canvas(64, 64), g = c.getContext('2d'); g.fillStyle = col; g.beginPath(); g.arc(32, 32, 28, 0, 6.28); g.fill(); g.fillStyle = '#0a1a10'; g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 32, 34); return ctex(c); };
  world.makeSub = (s, label, own) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(hullGeo, own ? ownMat : foeMat); g.add(m);
    m.userData = { kind: 'sub', id: s.id };
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: numTex(label, own ? GREEN : RED), depthTest: false, transparent: true }));
    tag.scale.setScalar(0.024); tag.position.y = 0.03; tag.renderOrder = 9; g.add(tag);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.0018, 6, 28).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffe066', toneMapped: false }));
    ring.visible = false; g.add(ring);
    g.userData = { id: s.id, mesh: m, tag, ring, own, sinking: 0 };
    return g;
  };
  world.wreck = (g) => { g.userData.mesh.material = wreckMat; g.userData.tag.visible = false; };

  // ---------- marcas: suspeita, alvos de mover, cursor, bloco revelado ----------
  world.heat = new THREE.InstancedMesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false }), CELLS);
  world.heat.count = 0; world.heat.frustumCulled = false; content.add(world.heat);
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  world.setHeat = (grid) => { // grid: Float64Array(CELLS) somando todos os inimigos, ou null
    let n = 0;
    if (grid) for (let i = 0; i < CELLS; i++) { const p = grid[i]; if (p < 0.012) continue; localOf(cellOf(i), _p); const k = 0.5 + Math.min(1.6, Math.sqrt(p) * 2.2); _m.compose(_p, _q, _s.set(k, k, k)); world.heat.setMatrixAt(n++, _m); }
    world.heat.count = n; world.heat.instanceMatrix.needsUpdate = true;
  };
  const ghostGeo = new THREE.BoxGeometry(C * 0.8, C * 0.8, C * 0.8);
  const ghostMat = new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false });
  world.ghosts = [];
  for (let k = 0; k < 6; k++) {
    const gm = new THREE.Mesh(ghostGeo, ghostMat); gm.visible = false; content.add(gm);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(ghostGeo), new THREE.LineBasicMaterial({ color: GREEN })); gm.add(edges);
    world.ghosts.push(gm);
  }
  world.setGhosts = (cells) => { world.ghosts.forEach((g, k) => { const c = cells[k]; g.visible = !!c; if (c) { localOf(c, g.position); g.userData = { kind: 'moveTo', ...c }; } }); };
  world.cursor = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(C * 0.95, C * 0.95, C * 0.95)), new THREE.LineBasicMaterial({ color: RED, toneMapped: false }));
  world.cursor.visible = false; content.add(world.cursor);
  world.reach = new THREE.InstancedMesh(new THREE.BoxGeometry(C * 0.9, 0.002, C * 0.9), new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.14, depthWrite: false, toneMapped: false }), NX * NZ);
  world.reach.count = 0; world.reach.frustumCulled = false; content.add(world.reach);
  world.setReach = (cells) => { let n = 0; for (const c of cells) { localOf(c, _p); _m.compose(_p, _q, _s.set(1, 1, 1)); world.reach.setMatrixAt(n++, _m); } world.reach.count = n; world.reach.instanceMatrix.needsUpdate = true; };
  world.blocks = [];
  const blockGeo = new THREE.BoxGeometry(C * 2, C * 2, C * 2);
  for (let k = 0; k < 4; k++) {
    const b = new THREE.Mesh(blockGeo, new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.12, depthWrite: false, toneMapped: false }));
    b.add(new THREE.LineSegments(new THREE.EdgesGeometry(blockGeo), new THREE.LineBasicMaterial({ color: RED, transparent: true, opacity: 0.8 })));
    b.visible = false; content.add(b); world.blocks.push(b);
  }
  world.setBlocks = (list) => { // [{ bx, bz, bd, age }]
    world.blocks.forEach((b, k) => {
      const v = list[k]; b.visible = !!v; if (!v) return;
      localOf({ x: v.bx * 2 + 0.5, z: v.bz * 2 + 0.5, d: v.bd * 2 + 0.5 }, b.position);
      b.material.opacity = 0.16 * (1 - v.age / 4); b.children[0].material.opacity = 0.9 * (1 - v.age / 4);
    });
  };

  // ---------- efeitos: onda de ping, torpedo, explosão, bolhas ----------
  const waves = [];
  for (let k = 0; k < 3; k++) { const w = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshBasicMaterial({ color: GREEN, wireframe: true, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })); w.visible = false; content.add(w); waves.push({ m: w, t: 1 }); }
  world.wave = (local, color = GREEN) => { const w = waves.find(x => x.t >= 1) || waves[0]; w.t = 0; w.m.visible = true; w.m.position.copy(local); w.m.material.color.set(color); };
  const torp = new THREE.Mesh(new THREE.CapsuleGeometry(0.0035, 0.014, 4, 8).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#d0d0c8', metalness: 1, roughness: 0.3 }));
  torp.visible = false; content.add(torp);
  const torpState = { t: 1, a: new THREE.Vector3(), b: new THREE.Vector3(), dur: 0.8 };
  world.torpedo = (a, b, dur = 0.8) => { torpState.t = 0; torpState.a.copy(a); torpState.b.copy(b); torpState.dur = dur; torp.visible = true; torp.position.copy(a); torp.lookAt(content.localToWorld(b.clone())); };
  const flashes = [];
  for (let k = 0; k < 3; k++) { const h = halo('#ffb050', 0.1, 1.6); h.visible = false; content.add(h); flashes.push({ s: h, t: 1 }); }
  world.flash = (local, size = 0.18) => { const f = flashes.find(x => x.t >= 1) || flashes[0]; f.t = 0; f.size = size; f.s.visible = true; f.s.position.copy(local); };
  const bubC = canvas(32, 32), bg2 = bubC.getContext('2d'); bg2.strokeStyle = 'rgba(220,255,250,0.9)'; bg2.lineWidth = 3; bg2.beginPath(); bg2.arc(16, 16, 11, 0, 6.28); bg2.stroke();
  const bubTex = ctex(bubC);
  const bubbles = [];
  for (let k = 0; k < 30; k++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubTex, transparent: true, depthWrite: false })); s.visible = false; s.scale.setScalar(0.006); content.add(s); bubbles.push({ s, t: 1, v: 0 }); }
  world.bubbles = (local, n = 8, spread = 0.02) => { for (let k = 0; k < n; k++) { const b = bubbles.find(x => x.t >= 1); if (!b) return; b.t = 0; b.s.visible = true; b.s.position.copy(local).add(new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread)); b.v = 0.04 + Math.random() * 0.05; } };
  world.busy = () => torpState.t < 1;

  // ---------- botões da mesa ----------
  world.buttons = {};
  const btnGeo = caixaArredondada(0.11, 0.022, 0.06, 0.008, 2);
  const capGeo = new THREE.PlaneGeometry(0.1, 0.05).rotateX(-Math.PI / 2);
  const deskTop = new THREE.Group(); deskTop.position.set(0, DESK.y + 0.002, DESK.z); deskTop.rotation.x = -0.28; scene.add(deskTop);
  world.deskTop = deskTop;
  const BTN = [
    ['sub1', 'Sub 1', -0.3, -0.115], ['sub2', 'Sub 2', -0.17, -0.115], ['up', 'Subir camada', 0.17, -0.115], ['down', 'Descer camada', 0.3, -0.115],
    ['move', 'Mover', -0.3, -0.04], ['ping', 'Ping', -0.1, -0.04], ['torpedo', 'Torpedo', 0.1, -0.04], ['wait', 'Esperar', 0.3, -0.04],
  ];
  const btnMats = {};
  for (const [id, label, x, z] of BTN) {
    const c = canvas(256, 128);
    const mat = new THREE.MeshStandardMaterial({ color: '#4a5a58', roughness: 0.45, metalness: 0.3, emissive: '#000000' });
    const b = new THREE.Mesh(btnGeo, mat); b.position.set(x, 0.011, z); deskTop.add(b);
    const cap = new THREE.Mesh(capGeo, new THREE.MeshBasicMaterial({ map: ctex(c), transparent: true, toneMapped: false })); cap.position.set(x, 0.0225, z); deskTop.add(cap);
    b.userData = { kind: 'button', id }; cap.userData = { kind: 'button', id };
    world.buttons[id] = { mesh: b, cap, c, label, key: '' };
    btnMats[id] = mat;
  }
  world.drawButton = (id, { text, on = false, off = false, sub = '' }) => {
    const B = world.buttons[id]; const key = `${text}|${on}|${off}|${sub}`;
    if (B.key === key) return; B.key = key;
    const g = B.c.getContext('2d');
    g.clearRect(0, 0, 256, 128);
    g.fillStyle = off ? '#5a6664' : on ? '#ffd25a' : '#d8f5e0'; g.font = `bold ${text.length > 10 ? 34 : 44}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (on) { g.fillStyle = '#1a2a20'; }
    g.fillText(text, 128, sub ? 50 : 64);
    if (sub) { g.font = '28px sans-serif'; g.fillText(sub, 128, 98); }
    B.cap.material.map.needsUpdate = true;
    btnMats[id].color.set(on ? '#ffc34a' : off ? '#2e3836' : '#3f6a58');
    btnMats[id].emissive.set(on ? '#7a4a00' : '#000000');
  };
  // tela de mensagens (ecos) na mesa
  const logC = canvas(1024, 200);
  const logScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.129), new THREE.MeshBasicMaterial({ map: ctex(logC), toneMapped: false }));
  logScreen.position.set(0, 0.0235, 0.088); logScreen.rotation.x = -Math.PI / 2; deskTop.add(logScreen);
  world.drawLog = (lines) => {
    const g = logC.getContext('2d');
    g.fillStyle = '#04160e'; g.fillRect(0, 0, 1024, 200);
    g.strokeStyle = '#2a7a4a'; g.lineWidth = 6; g.strokeRect(3, 3, 1018, 194);
    g.textAlign = 'left'; g.textBaseline = 'middle';
    lines.slice(0, 4).forEach((l, i) => { g.fillStyle = l.color || GREEN; g.font = `${i === 0 ? 'bold ' : ''}${Math.min(36, Math.floor(1700 / Math.max(1, l.text.length)))}px monospace`; g.fillText(l.text, 18, 28 + i * 47); });
    logScreen.material.map.needsUpdate = true;
  };
  // placa do placar (atrás do aquário)
  const boardC = canvas(1024, 192);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.15), new THREE.MeshBasicMaterial({ map: ctex(boardC), toneMapped: false, transparent: true }));
  board.position.set(TANK.x, TANK.y + 0.36, TANK.z - 0.32); scene.add(board);
  world.drawBoard = (d) => {
    const g = boardC.getContext('2d');
    g.clearRect(0, 0, 1024, 192);
    g.fillStyle = 'rgba(4,22,14,0.92)'; g.beginPath(); g.roundRect ? g.roundRect(4, 4, 1016, 184, 20) : g.rect(4, 4, 1016, 184); g.fill();
    g.strokeStyle = '#2a7a4a'; g.lineWidth = 5; g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = GREEN; g.font = 'bold 50px monospace'; g.fillText(d.title, 512, 60);
    g.fillStyle = AMBER; g.font = '36px monospace'; g.fillText(d.line, 512, 136);
    board.material.map.needsUpdate = true;
  };

  world.animate = (dt, time) => {
    for (const s of world.screens) s.draw(dt);
    for (const w of waves) { if (w.t >= 1) continue; w.t = Math.min(1, w.t + dt / 1.2); w.m.scale.setScalar(0.01 + w.t * 0.45); w.m.material.opacity = 0.5 * (1 - w.t); if (w.t >= 1) w.m.visible = false; }
    if (torpState.t < 1) { torpState.t = Math.min(1, torpState.t + dt / torpState.dur); torp.position.lerpVectors(torpState.a, torpState.b, torpState.t); if (Math.random() < 0.5) world.bubbles(torp.position, 1, 0.004); if (torpState.t >= 1) torp.visible = false; }
    for (const f of flashes) { if (f.t >= 1) continue; f.t = Math.min(1, f.t + dt * 2.5); f.s.scale.setScalar(f.size * (0.5 + f.t)); f.s.material.opacity = 1 - f.t; if (f.t >= 1) f.s.visible = false; }
    for (const b of bubbles) { if (b.t >= 1) continue; b.t = Math.min(1, b.t + dt / 1.4); b.s.position.y += b.v * dt; b.s.position.x += Math.sin(time * 6 + b.v * 100) * 0.0004; if (b.s.position.y > SIZE.y / 2 || b.t >= 1) { b.t = 1; b.s.visible = false; } }
    for (const l of world.lamps) l.material.opacity = 0.8 + Math.sin(time * 3 + l.position.x * 5) * 0.12;
  };
  void idx;
  return world;
}
