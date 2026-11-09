// materiais3d.js - materiais com textura procedural para Three.js r170 (jogos web do Eduardo).
// Copiar para <Projeto>/js/ junto com visual3d.js. Nenhuma imagem externa: as texturas (cor,
// rugosidade/metal e relevo) são geradas em código, emendam sem costura e ficam em cache.
// Todo material aceita { leve: true } para o Quest (sem transmissão/clearcoat, textura 256).
// Vidro, gelo, água e metal PRECISAM de scene.environment (ambienteDoCeu do visual3d.js).
import * as THREE from '../vendor/three/three.module.js';

// ---------------- ruído que emenda (periódico) ----------------
function h2(ix, iy, s) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const md = (a, p) => ((a % p) + p) % p;
const sm = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const frac = (x) => x - Math.floor(x);

function vnoise(x, y, px, py, s) {
  const xi = Math.floor(x), yi = Math.floor(y), ux = sm(x - xi), uy = sm(y - yi);
  const x0 = md(xi, px), x1 = md(xi + 1, px), y0 = md(yi, py), y1 = md(yi + 1, py);
  return lerp(lerp(h2(x0, y0, s), h2(x1, y0, s), ux), lerp(h2(x0, y1, s), h2(x1, y1, s), ux), uy);
}
// fbm em u,v (0..1) com escala fx, fy inteiras para emendar
export function fbm(u, v, fx, fy = fx, s = 1, oit = 5) {
  let t = 0, a = 0.5, f = 1, n = 0;
  for (let o = 0; o < oit; o++) { t += a * vnoise(u * fx * f, v * fy * f, fx * f, fy * f, s + o * 31); n += a; a *= 0.5; f *= 2; }
  return t / n;
}
// Voronoi periódico: f1, f2 (distâncias) e id (0..1) da célula mais próxima
export function voronoi(u, v, n, s = 1, jitter = 1) {
  const x = u * n, y = v * n, xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 9, f2 = 9, id = 0, cx = 0, cy = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const gx = xi + dx, gy = yi + dy, mx = md(gx, n), my = md(gy, n);
    const px = gx + 0.5 + (h2(mx, my, s) - 0.5) * jitter, py = gy + 0.5 + (h2(mx, my, s + 7) - 0.5) * jitter;
    const d = Math.hypot(px - x, py - y);
    if (d < f1) { f2 = f1; f1 = d; id = h2(mx, my, s + 13); cx = px; cy = py; } else if (d < f2) f2 = d;
  }
  return { f1, f2, id, cx: cx / n, cy: cy / n };
}
const rgb = (hex) => { const o = {}; new THREE.Color(hex).getRGB(o, THREE.SRGBColorSpace); return [o.r, o.g, o.b]; };
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

// ---------------- gerador de mapas ----------------
// fn(u, v) devolve { c:[r,g,b] sRGB 0..1, h: altura 0..1, r: rugosidade, m: metal, e: emissão 0..1 }
const cacheMapas = new Map();
export function gerarMapas(chave, tam, fn, forcaRelevo = 2) {
  const k = `${chave}_${tam}_${forcaRelevo}`;
  if (cacheMapas.has(k)) return cacheMapas.get(k);
  const N = tam * tam, cor = new Uint8ClampedArray(N * 4), orm = new Uint8ClampedArray(N * 4),
    nor = new Uint8ClampedArray(N * 4), alt = new Float32Array(N);
  let emi = null;
  for (let y = 0; y < tam; y++) for (let x = 0; x < tam; x++) {
    const i = y * tam + x, p = fn((x + 0.5) / tam, (y + 0.5) / tam);
    alt[i] = p.h ?? 0.5;
    cor[i * 4] = p.c[0] * 255; cor[i * 4 + 1] = p.c[1] * 255; cor[i * 4 + 2] = p.c[2] * 255; cor[i * 4 + 3] = 255;
    orm[i * 4] = 255; orm[i * 4 + 1] = (p.r ?? 0.5) * 255; orm[i * 4 + 2] = (p.m ?? 0) * 255; orm[i * 4 + 3] = 255;
    if (p.e !== undefined) { emi ??= new Uint8ClampedArray(N * 4); const e = p.ec ?? [1, 0.4, 0.1];
      emi[i * 4] = e[0] * p.e * 255; emi[i * 4 + 1] = e[1] * p.e * 255; emi[i * 4 + 2] = e[2] * p.e * 255; emi[i * 4 + 3] = 255; }
  }
  const kk = forcaRelevo * tam / 256;
  for (let y = 0; y < tam; y++) for (let x = 0; x < tam; x++) {
    const a = (xx, yy) => alt[md(yy, tam) * tam + md(xx, tam)];
    const dx = (a(x + 1, y) - a(x - 1, y)) * kk, dy = (a(x, y + 1) - a(x, y - 1)) * kk;
    const l = Math.hypot(dx, dy, 1), i = (y * tam + x) * 4;
    nor[i] = (-dx / l * 0.5 + 0.5) * 255; nor[i + 1] = (dy / l * 0.5 + 0.5) * 255; nor[i + 2] = (1 / l * 0.5 + 0.5) * 255; nor[i + 3] = 255;
  }
  const tex = (dados, srgb) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = tam;
    cv.getContext('2d').putImageData(new ImageData(dados, tam, tam), 0, 0);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const r = { cor: tex(cor, true), orm: tex(orm, false), normal: tex(nor, false), emissao: emi ? tex(emi, true) : null };
  cacheMapas.set(k, r);
  return r;
}

// Material Standard/Physical com os mapas aplicados e repetição própria (texturas compartilhadas).
function montar(mapas, { repete = [1, 1], fisico = false, relevo = 1, ...props }) {
  const rep = (t) => { if (!t) return null; const c = t.clone(); c.repeat.set(repete[0], repete[1]); c.needsUpdate = true; return c; };
  const M = fisico ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  if (!fisico) for (const k of ['clearcoat', 'clearcoatRoughness', 'sheen', 'sheenColor', 'sheenRoughness', 'transmission',
    'thickness', 'ior', 'attenuationColor', 'attenuationDistance', 'specularIntensity']) delete props[k];
  const orm = rep(mapas.orm);
  const m = new M({ map: rep(mapas.cor), roughnessMap: orm, metalnessMap: orm, normalMap: rep(mapas.normal),
    normalScale: new THREE.Vector2(relevo, relevo), roughness: 1, metalness: 1, ...props });
  if (mapas.emissao) { m.emissiveMap = rep(mapas.emissao); m.emissive = new THREE.Color('#ffffff'); }
  return m;
}
const tamTex = (leve, t = 512) => (leve ? Math.min(256, t) : t);

// Coordenadas de textura pelo tamanho real (projeção de caixa): 1 repetição a cada `metros`.
// Use em caixas, paredes, pisos e peças esticadas, senão a textura estica nas faces finas
// (uma lateral de 2,6 m x 0,25 m espreme a textura 10x e vira listras com cara de metal).
export function uvMundo(geo, metros = 1) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (ax >= ay && ax >= az) uv.setXY(i, z * Math.sign(n.getX(i)) / metros, y / metros);
    else if (ay >= az) uv.setXY(i, x / metros, z * Math.sign(n.getY(i)) / metros);
    else uv.setXY(i, x * Math.sign(n.getZ(i)) / metros, y / metros);
  }
  uv.needsUpdate = true;
  return geo;
}

// ---------------- madeira ----------------
// tabuas: 0 = peça maciça; n = n tábuas na largura (piso, deck, caixote). verniz 0..1.
export function madeira({ clara = '#c08a55', escura = '#6e4223', tabuas = 4, verniz = 0.2, nos = true,
  repete, leve = false, semente = 3 } = {}) {
  const cC = rgb(clara), cE = rgb(escura);
  const mapas = gerarMapas(`madeira${clara}${escura}${tabuas}${verniz}${nos}${semente}`, tamTex(leve), (u, v) => {
    const n = Math.max(1, tabuas), pi = Math.floor(u * n), lu = frac(u * n), s = h2(pi, 0, semente);
    const lv = frac(v * 2 + s * 0.73), juntaV = tabuas ? Math.min(lv, 1 - lv) : 1;
    // anéis esticados no comprimento (v), deformados por ruído
    let anel = (lu * 0.9 + s * 4) * 11 + fbm(lu, v, 3, 2, semente + pi * 17, 4) * 1.6 + fbm(lu, v, 8, 6, semente + pi, 3) * 0.5;
    if (nos) { const nx = 0.3 + 0.4 * h2(pi, 1, semente), ny = h2(pi, 2, semente), d = Math.hypot((lu - nx) * 1.6, (frac(v - ny + 0.5) - 0.5) * 3);
      anel += 0.5 / (d * 6 + 0.25) - 0.15; }
    const tardio = Math.pow(frac(anel), 3.2);
    const fibra = fbm(lu, v, 90, 4, semente + 5, 3), poro = fbm(lu, v, 200, 12, semente + 6, 2);
    let c = mix3(cC, cE, clamp01(tardio * 0.45 + (fibra - 0.5) * 0.7 + (poro - 0.5) * 0.25 + (s - 0.5) * 0.3));
    let h = 0.55 - tardio * 0.12 + (fibra - 0.5) * 0.08, r = lerp(0.72, 0.25, verniz) + tardio * 0.1;
    if (tabuas) {
      const borda = Math.min(lu, 1 - lu) * 1.0 / n * 100, b = smooth(0.15, 0.6, Math.min(borda, juntaV * 60));
      c = mul3(c, lerp(0.5, 1, b)); h *= lerp(0.0, 1, b); r = lerp(0.9, r, b);
      c = mul3(c, 0.9 + 0.2 * h2(pi, Math.floor(v * 2 + s * 0.73), semente));
    }
    return { c, h, r, m: 0 };
  }, 3);
  return montar(mapas, { repete, fisico: !leve && verniz > 0.3, clearcoat: verniz, clearcoatRoughness: 0.15, relevo: 1 });
}

// ---------------- metal ----------------
const METAIS = { // cor do reflexo (sRGB) e rugosidade base
  aco: ['#d2d4d6', 0.32], ferro: ['#b9bbbc', 0.45], aluminio: ['#eceeef', 0.28], cromo: ['#d8d9da', 0.06],
  ouro: ['#ffd98a', 0.22], cobre: ['#f4b49a', 0.28], latao: ['#ecd59a', 0.3], bronze: ['#d8a878', 0.36],
};
// escovado: 0..1 (riscos finos numa direção). arranhoes: 0..1. ferrugem/patina: 0..1. sujeira 0..1.
export function metal({ tipo = 'aco', escovado = 0.5, arranhoes = 0.4, ferrugem = 0, sujeira = 0.3,
  repete, leve = false, semente = 5 } = {}) {
  const [hex, rug] = METAIS[tipo] ?? METAIS.aco, cM = rgb(hex);
  const oxido = tipo === 'cobre' || tipo === 'bronze' || tipo === 'latao'
    ? [rgb('#4f9a83'), rgb('#2f6e5c')] : [rgb('#8a3f1a'), rgb('#3e1a0c')];   // pátina verde x ferrugem
  // arranhões: muitos, curtos e finos, quase todos numa direção (uso), riscados num buffer
  const tam = tamTex(leve), risco = new Float32Array(tam * tam);
  const dirBase = h2(0, 9, semente) * Math.PI;
  for (let i = 0; i < 260 * arranhoes; i++) {
    const a = dirBase + (h2(i, 3, semente) - 0.5) * (h2(i, 5, semente) < 0.75 ? 0.5 : 3);
    const l = (0.015 + Math.pow(h2(i, 4, semente), 3) * 0.12) * tam, f = 0.3 + h2(i, 6, semente) * 0.7;
    let x = h2(i, 1, semente) * tam, y = h2(i, 2, semente) * tam;
    for (let k = 0; k < l; k++) {
      const j = md(Math.round(y), tam) * tam + md(Math.round(x), tam);
      risco[j] = Math.max(risco[j], f * Math.sin((k / l) * Math.PI));
      x += Math.cos(a); y += Math.sin(a);
    }
  }
  const mapas = gerarMapas(`metal${tipo}${escovado}${arranhoes}${ferrugem}${sujeira}${semente}`, tam, (u, v) => {
    const fio = fbm(u, v, 2, 300, semente, 3), mancha = fbm(u, v, 3, 3, semente + 9, 4);
    let r = rug + (fio - 0.5) * 0.18 * escovado + (mancha - 0.5) * 0.25 * sujeira, h = 0.5 + (fio - 0.5) * 0.06 * escovado;
    let c = mul3(cM, 1 - (1 - mancha) * 0.12 * sujeira), m = 1;
    const rk = risco[Math.floor(v * tam) * tam + Math.floor(u * tam)];
    h -= rk * 0.12; r -= rk * 0.1; c = mul3(c, 1 + rk * 0.06);
    if (ferrugem > 0) {
      const base = fbm(u, v, 4, 4, semente + 3, 5), fino = fbm(u, v, 24, 24, semente + 4, 3);
      const k = smooth(1 - ferrugem - 0.08, 1 - ferrugem + 0.08, base * 0.85 + fino * 0.3);
      c = mix3(c, mix3(oxido[0], oxido[1], fino), k); m = 1 - k; r = lerp(r, 0.85 + fino * 0.1, k); h += k * (fino - 0.3) * 0.5;
    }
    return { c, h, r: clamp01(r), m };
  }, 2);
  return montar(mapas, { repete, relevo: 0.6 });
}

// ---------------- vidro ----------------
// fosco 0..1 (jateado), sujeira 0..1 (manchas na rugosidade), cor = tom do vidro.
export function vidro({ cor = '#e8f4ff', fosco = 0, sujeira = 0.15, espessura = 0.05, leve = false, repete } = {}) {
  const mapas = gerarMapas(`vidro${fosco}${sujeira}`, tamTex(leve, 256), (u, v) => {
    const m = fbm(u, v, 3, 3, 21, 5);
    return { c: [1, 1, 1], h: 0.5 + (m - 0.5) * 0.02, r: clamp01(0.02 + fosco * 0.45 + smooth(0.55, 0.8, m) * 0.2 * sujeira), m: 0 };
  }, 1);
  if (leve) return montar(mapas, { repete, metalness: 0, color: cor, transparent: true, opacity: 0.22 + fosco * 0.4,
    depthWrite: false, envMapIntensity: 1.6, normalMap: null });
  return montar(mapas, { repete, fisico: true, metalness: 0, color: '#ffffff', transmission: 1, thickness: espessura,
    ior: 1.5, attenuationColor: cor, attenuationDistance: 0.5, specularIntensity: 1, normalMap: null, envMapIntensity: 1.2 });
}

// ---------------- gelo ----------------
// rachaduras 0..1 (fraturas brancas por dentro), geada 0..1 (superfície fosca).
export function gelo({ fundo = '#4f9fd6', claro = '#dff4ff', rachaduras = 0.85, geada = 0.6, leve = false, repete, semente = 7 } = {}) {
  const cF = rgb(fundo), cC = rgb(claro);
  const mapas = gerarMapas(`gelo${fundo}${claro}${rachaduras}${geada}${semente}`, tamTex(leve), (u, v) => {
    const w = fbm(u, v, 4, 4, semente, 3) * 0.06;
    const a = voronoi(u + w, v - w, 5, semente), b = voronoi(u - w, v + w, 13, semente + 3);
    const parte = smooth(0.35, 0.55, fbm(u, v, 3, 3, semente + 8, 3));
    const rach = Math.max(1 - smooth(0, 0.025, a.f2 - a.f1), (1 - smooth(0, 0.015, b.f2 - b.f1)) * 0.45) * rachaduras * parte;
    const bolha = h2(Math.floor(u * 160), Math.floor(v * 160), semente + 4) > 0.985 ? 0.6 : 0;
    const gd = fbm(u, v, 10, 10, semente + 2, 5), nuvem = fbm(u, v, 3, 3, semente + 5, 4);
    const c = mix3(mix3(cF, cC, nuvem * 0.55 + gd * geada * 0.35), [0.95, 0.98, 1], Math.max(rach * 0.85, bolha));
    return { c, h: 0.5 + gd * geada * 0.25 - rach * 0.06 + (nuvem - 0.5) * 0.1,
      r: clamp01(0.04 + gd * geada * 0.45 + rach * 0.15), m: 0 };
  }, 3);
  if (leve) return montar(mapas, { repete, metalness: 0, transparent: true, opacity: 0.9, envMapIntensity: 1.4,
    emissive: '#1d4a6e', emissiveIntensity: 0.35 });
  return montar(mapas, { repete, fisico: true, metalness: 0, transmission: 0.45, thickness: 0.6, ior: 1.31,
    attenuationColor: fundo, attenuationDistance: 0.8, clearcoat: 0.7, clearcoatRoughness: 0.06, envMapIntensity: 1.2 });
}

// ---------------- água (animada) ----------------
// Duas camadas de ondinha andando em direções diferentes (normalMap + clearcoatNormalMap).
// Devolve { material, atualizar(dt) }. limpida: true = dá para ver o fundo (piscina, riacho).
// profundidade (m): raso deixa ver o fundo; fundo escurece e puxa para a cor `fundo`.
export function agua({ cor = '#2f8fa6', fundo = '#0c4a5c', limpida = false, profundidade = 0.4, velocidade = 0.03, escala = 4,
  ondas = 1, leve = false } = {}) {
  const mapas = gerarMapas(`agua`, tamTex(leve), (u, v) => {
    const h = fbm(u, v, 4, 4, 41, 5) * 0.7 + fbm(u, v, 9, 9, 43, 3) * 0.3;
    return { c: [1, 1, 1], h, r: 0.05, m: 0 };
  }, 4);
  const n1 = mapas.normal.clone(), n2 = mapas.normal.clone();
  n1.repeat.set(escala, escala); n2.repeat.set(escala * 1.7, escala * 1.7); n1.needsUpdate = n2.needsUpdate = true;
  const base = { color: cor, roughness: 0.06, metalness: 0, normalMap: n1, normalScale: new THREE.Vector2(0.6 * ondas, 0.6 * ondas),
    envMapIntensity: 1.3 };
  const material = leve
    ? new THREE.MeshStandardMaterial({ ...base, transparent: !!limpida, opacity: limpida ? THREE.MathUtils.clamp(0.45 + profundidade * 0.3, 0.5, 0.9) : 1 })
    : new THREE.MeshPhysicalMaterial({ ...base, ior: 1.333, clearcoat: 1, clearcoatRoughness: 0.02,
      clearcoatNormalMap: n2, clearcoatNormalScale: new THREE.Vector2(0.35 * ondas, 0.35 * ondas),
      transmission: limpida ? 0.9 : 0, thickness: profundidade, attenuationColor: fundo, attenuationDistance: 0.6 + profundidade,
      specularIntensity: 1 });
  let t = 0;
  return { material, atualizar(dt) {
    t += dt;
    n1.offset.set(t * velocidade, t * velocidade * 0.6);
    n2.offset.set(-t * velocidade * 0.8, t * velocidade * 1.1);
  } };
}

// ---------------- pedra: rocha, calçada (pedras), lajota ----------------
export function pedra({ tipo = 'calcada', cor = '#8f8a82', escura = '#5d5853', rejunte, pedras = 6,
  repete, leve = false, semente = 11 } = {}) {
  rejunte ??= tipo === 'lajota' ? '#8e877c' : '#4a4540';
  const c1 = rgb(cor), c2 = rgb(escura), cJ = rgb(rejunte);
  const mapas = gerarMapas(`pedra${tipo}${cor}${escura}${rejunte}${pedras}${semente}`, tamTex(leve), (u, v) => {
    const g = fbm(u, v, 8, 8, semente, 5), gg = fbm(u, v, 32, 32, semente + 1, 3);
    if (tipo === 'rocha') {
      const vv = voronoi(u, v, 4, semente + 2), fenda = 1 - smooth(0, 0.03, vv.f2 - vv.f1);
      const c = mul3(mix3(c1, c2, g * 0.8 + vv.id * 0.3), 1 - fenda * 0.45);
      return { c, h: g * 0.7 + gg * 0.2 - fenda * 0.4, r: 0.82 + gg * 0.12, m: 0 };
    }
    const n = tipo === 'lajota' ? Math.max(2, Math.round(pedras / 2)) : pedras;
    const vv = voronoi(u, v, n, semente + 2, tipo === 'lajota' ? 0 : 0.85);
    const e = vv.f2 - vv.f1, borda = smooth(0.03, tipo === 'lajota' ? 0.05 : 0.16, e);
    const grao = h2(Math.floor(u * 900), Math.floor(v * 900), semente + 9), pinta = grao > 0.93 ? 0.75 : grao < 0.06 ? 1.2 : 1;
    let tom = mix3(c1, c2, clamp01(vv.id * 0.7 + (g - 0.5) * 0.6));
    tom = [tom[0] * (0.96 + vv.id * 0.08), tom[1], tom[2] * (1.04 - vv.id * 0.08)];
    const domo = tipo === 'lajota' ? 1 : 1 - smooth(0.15, 0.6, vv.f1);
    const c = mix3(mul3(cJ, 0.85 + gg * 0.2), mul3(tom, (0.84 + gg * 0.2 + domo * 0.1) * pinta), smooth(0.02, 0.05, e));
    return { c: mul3(c, lerp(0.72, 1, borda)), h: borda * 0.5 + domo * 0.3 + g * 0.12 + gg * 0.06, r: lerp(0.95, 0.7 + g * 0.15, borda), m: 0 };
  }, 4);
  return montar(mapas, { repete, relevo: 1.2 });
}

// ---------------- tijolo ----------------
export function tijolo({ cor = '#a4523a', variacao = '#7d3a28', rejunte = '#bdb3a5', fileiras = 8, repete,
  leve = false, semente = 13 } = {}) {
  const c1 = rgb(cor), c2 = rgb(variacao), cJ = rgb(rejunte);
  const mapas = gerarMapas(`tijolo${cor}${variacao}${rejunte}${fileiras}${semente}`, tamTex(leve), (u, v) => {
    const fy = v * fileiras, linha = Math.floor(fy), ly = frac(fy);
    const fx = u * (fileiras / 2) + (linha % 2) * 0.5, col = Math.floor(fx), lx = frac(fx);
    const s = h2(md(col, fileiras / 2), linha, semente);
    const bx = Math.min(lx, 1 - lx) * 2, by = Math.min(ly, 1 - ly);
    const g = fbm(u, v, 16, 16, semente, 4), grao = fbm(u, v, 96, 96, semente + 5, 2);
    const lasca = smooth(0.7, 0.8, fbm(u, v, 40, 40, semente + 3, 3)) * smooth(0.5, 0.7, fbm(u, v, 6, 6, semente + 4, 2));
    const dentro = smooth(0.035, 0.07, Math.min(bx * 0.5, by) + (g - 0.5) * 0.03);
    const tom = mul3(mix3(c1, c2, s * 0.8 + (g - 0.5) * 0.5), (0.9 + h2(col, linha, semente + 1) * 0.2) * (0.92 + grao * 0.16));
    const c = mix3(mul3(cJ, 0.75 + g * 0.2 + grao * 0.15), mul3(tom, 1 - lasca * 0.12), dentro);
    return { c, h: dentro * (0.8 - lasca * 0.15) + g * 0.06 + grao * 0.06, r: lerp(0.95, 0.8 + grao * 0.1, dentro), m: 0 };
  }, 4);
  return montar(mapas, { repete, relevo: 1.2 });
}

// ---------------- neve (com brilhinho) ----------------
export function neve({ repete, leve = false, semente = 17 } = {}) {
  const mapas = gerarMapas(`neve${semente}`, tamTex(leve), (u, v) => {
    const g = fbm(u, v, 4, 4, semente, 5), fino = fbm(u, v, 40, 40, semente + 1, 2);
    const brilho = h2(Math.floor(u * 512), Math.floor(v * 512), semente) > 0.985 ? 1 : 0;
    const c = mix3(rgb('#c9d8ee'), rgb('#f7faff'), smooth(0.25, 0.7, g));
    return { c, h: g * 0.8 + fino * 0.2, r: brilho ? 0.08 : 0.82 + fino * 0.1, m: 0 };
  }, 2);
  return montar(mapas, { repete, relevo: 0.8 });
}

// ---------------- lava (animada) ----------------
export function lava({ repete, leve = false, semente = 19 } = {}) {
  const mapas = gerarMapas(`lava${semente}`, tamTex(leve), (u, v) => {
    const w = fbm(u, v, 3, 3, semente, 3) * 0.1, vv = voronoi(u + w, v + w, 8, semente);
    const e = vv.f2 - vv.f1, fenda = 1 - smooth(0.0, 0.12, e), brasa = 1 - smooth(0.0, 0.3, e), g = fbm(u, v, 20, 20, semente + 2, 3);
    const crosta = mix3(rgb('#1e1716'), rgb('#57504c'), g * g);
    return { c: mix3(crosta, rgb('#ff9a3a'), fenda), h: (1 - fenda) * 0.6 + g * 0.3, r: lerp(0.96, 0.6, fenda), m: 0,
      e: clamp01(fenda + brasa * 0.25), ec: [1, 0.42, 0.1] };
  }, 3);
  const material = montar(mapas, { repete, emissiveIntensity: 3, relevo: 1.5 });
  let t = 0;
  return { material, atualizar(dt) { t += dt; material.emissiveIntensity = 3 + Math.sin(t * 1.3) * 0.6 + Math.sin(t * 3.7) * 0.25; } };
}

// ---------------- tecido ----------------
export function tecido({ cor = '#8a3a4a', fios = 64, repete, leve = false, semente = 23 } = {}) {
  const c1 = rgb(cor);
  const mapas = gerarMapas(`tecido${cor}${fios}${semente}`, tamTex(leve), (u, v) => {
    const a = u * fios, b = v * fios, xa = frac(a), yb = frac(b);
    const trama = (Math.floor(a) + Math.floor(b)) % 2 === 0;
    const fio = trama ? Math.sin(xa * Math.PI) * (0.6 + 0.4 * Math.sin(yb * Math.PI)) : Math.sin(yb * Math.PI) * (0.6 + 0.4 * Math.sin(xa * Math.PI));
    const g = fbm(u, v, 6, 6, semente, 4);
    return { c: mul3(c1, 0.75 + fio * 0.3 + (g - 0.5) * 0.15), h: fio * 0.7 + g * 0.2, r: 0.85 + (1 - fio) * 0.1, m: 0 };
  }, 2);
  return montar(mapas, { repete, fisico: !leve, sheen: 1, sheenColor: new THREE.Color(cor).lerp(new THREE.Color('#ffffff'), 0.4),
    sheenRoughness: 0.5, relevo: 0.8 });
}

// ---------------- plástico / brinquedo / cerâmica ----------------
// brilho: 0 fosco .. 1 brinquedo envernizado (clearcoat).
export function plastico({ cor = '#e04a3a', brilho = 0.5, leve = false, repete } = {}) {
  const mapas = gerarMapas(`plastico${brilho}`, tamTex(leve, 256), (u, v) => {
    const g = fbm(u, v, 4, 4, 29, 4);
    return { c: [1, 1, 1], h: 0.5 + (g - 0.5) * 0.03, r: clamp01(lerp(0.55, 0.25, brilho) + (g - 0.5) * 0.08), m: 0 };
  }, 1);
  return montar(mapas, { repete, color: cor, map: null, fisico: !leve && brilho > 0.5, clearcoat: brilho, clearcoatRoughness: 0.08 });
}
