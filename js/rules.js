// Regras do Sonar: caça de submarinos num aquário 6x6x4. Sem navegador (roda nos testes).
//
// Casas (x 0..5, z 0..5, d 0..3; d = 0 é a camada de cima). O seu lado começa perto de você (z 3..5),
// o dele do outro lado (z 0..2). Rochas no fundo bloqueiam. Cada lado tem 2 submarinos (2 de casco) e 8
// torpedos. Turnos alternados: na sua vez você dá UMA ordem a UM submarino:
//   mover 1 casa (6 direções, inclusive subir e descer): silencioso;
//   esperar: também silencioso (o outro não sabe se você andou ou esperou);
//   ping: para cada submarino inimigo volta um eco (distância em 3 faixas, direção aproximada em 8
//         rumos e se está mais fundo / no mesmo nível / mais raso), mas o inimigo fica sabendo em que
//         bloco 2x2x2 está o submarino que pingou;
//   torpedo numa casa a até 3 casas: acerto direto afunda, casa colada (de face: 6 vizinhas) avaria
//         (-1 de casco). Também revela o bloco de quem atirou. Vale para os seus também (fogo amigo).
// Escuta: no começo da sua vez, cada submarino seu que tem um inimigo colado (casa vizinha) ouve a hélice.
// Mover para uma casa com submarino inimigo: não anda e descobre onde ele está (contato).
// Fim: afundar os dois do outro. Depois de 40 ordens de cada lado: ganha quem tem mais submarinos, depois
// mais casco.

export const PLAYER = 0, CPU = 1;
export const NX = 6, NZ = 6, ND = 4;
export const HP = 2, TORPEDOES = 8, RANGE = 3, MAX_ROUNDS = 40;
export const CELLS = NX * NZ * ND;
export const DIRS6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
export const DIR8 = ['norte', 'nordeste', 'leste', 'sudeste', 'sul', 'sudoeste', 'oeste', 'noroeste'];
export const VERT = { '-1': 'mais raso', 0: 'mesma profundidade', 1: 'mais fundo' };

// mapas de rochas: lista de [x, z, altura] (altura 1 = só no fundo, 2 = fundo e a camada de cima dele)
export const LAYOUTS = [
  { name: 'Recife', rocks: [[1, 2, 1], [2, 2, 2], [4, 3, 1], [3, 3, 2], [0, 4, 1], [5, 1, 1]] },
  { name: 'Cânion', rocks: [[2, 1, 2], [2, 2, 1], [3, 4, 2], [3, 3, 1], [0, 2, 1], [5, 3, 1], [4, 0, 1], [1, 5, 1]] },
  { name: 'Destroços', rocks: [[1, 1, 1], [4, 4, 1], [2, 3, 2], [3, 2, 2], [5, 2, 1], [0, 3, 1]] },
];

export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
export const idx = (x, z, d) => (d * NZ + z) * NX + x;
export const cellOf = (i) => ({ x: i % NX, z: Math.floor(i / NX) % NZ, d: Math.floor(i / (NX * NZ)) });
export const inside = (x, z, d) => x >= 0 && z >= 0 && d >= 0 && x < NX && z < NZ && d < ND;
export const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z), Math.abs(a.d - b.d));
export const manh = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z) + Math.abs(a.d - b.d);
export const blockOf = (p) => ({ bx: p.x >> 1, bz: p.z >> 1, bd: p.d >> 1 });
export const inBlock = (p, b) => (p.x >> 1) === b.bx && (p.z >> 1) === b.bz && (p.d >> 1) === b.bd;
export const zoneOf = (side) => (side === PLAYER ? [3, 5] : [0, 2]);

export function rockSet(layout) {
  const r = new Array(CELLS).fill(false);
  for (const [x, z, h] of layout.rocks) for (let k = 0; k < h; k++) r[idx(x, z, ND - 1 - k)] = true;
  return r;
}
export const isRock = (st, x, z, d) => st.rocks[idx(x, z, d)];

// eco de b visto de a: faixa de distância (perto 1-2, médio 3-4, longe 5), rumo (0..7 a partir do norte = -z, sentido horário) e vertical
export function echoOf(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const dir = dx === 0 && dz === 0 ? -1 : ((Math.round(Math.atan2(dx, -dz) / (Math.PI / 4)) % 8) + 8) % 8;
  const dist = cheb(a, b);
  return { band: dist <= 2 ? 1 : dist <= 4 ? 2 : 3, dir, vert: Math.sign(b.d - a.d) };
}
export const BANDS = { 1: 'perto (1 a 2 casas)', 2: 'médio (3 a 4 casas)', 3: 'longe (5 casas)' };
export const echoMatches = (a, c, e) => { const k = echoOf(a, c); return k.band === e.band && k.dir === e.dir && k.vert === e.vert; };

// subs: [{ id, side, x, z, d }] (opcional); layout: índice ou { rocks }
export function newGame({ layout = 0, subs = null, random = Math.random, starter = PLAYER, torpedoes = [TORPEDOES, TORPEDOES], maxRounds = MAX_ROUNDS } = {}) {
  const lay = typeof layout === 'number' ? LAYOUTS[layout] : layout;
  const st = {
    layout: typeof layout === 'number' ? layout : -1, rocks: rockSet(lay), rocksList: lay.rocks,
    subs: [], turn: starter, starter, round: 1, maxRounds, torps: torpedoes.slice(), log: [], over: false, winner: null, acts: [0, 0],
  };
  if (subs) st.subs = subs.map(s => ({ id: s.id, side: s.side, x: s.x, z: s.z, d: s.d, hp: s.hp ?? HP, alive: true }));
  else {
    let id = 1;
    for (const side of [PLAYER, CPU]) {
      const [z0, z1] = zoneOf(side);
      for (let k = 0; k < 2; k++) {
        let p;
        do p = { x: Math.floor(random() * NX), z: z0 + Math.floor(random() * (z1 - z0 + 1)), d: Math.floor(random() * ND) };
        while (st.rocks[idx(p.x, p.z, p.d)] || st.subs.some(s => s.x === p.x && s.z === p.z && s.d === p.d));
        st.subs.push({ id: id++, side, ...p, hp: HP, alive: true });
      }
    }
  }
  hearing(st);
  return st;
}
export const cloneSt = (st) => ({ ...st, subs: st.subs.map(s => ({ ...s })), torps: st.torps.slice(), log: st.log.slice(), acts: st.acts.slice() });
export const alive = (st, side) => st.subs.filter(s => s.alive && (side == null || s.side === side));
export const subById = (st, id) => st.subs.find(s => s.id === id);
const free = (st, x, z, d) => inside(x, z, d) && !st.rocks[idx(x, z, d)];

// escuta no começo da vez de st.turn
function hearing(st) {
  const side = st.turn;
  const own = alive(st, side), foes = alive(st, 1 - side);
  const heard = own.filter(s => foes.some(f => cheb(s, f) === 1)).map(s => s.id);
  st.log.push({ kind: 'hear', to: side, priv: { own: own.map(s => ({ id: s.id, x: s.x, z: s.z, d: s.d })), heard } });
}

// ordens possíveis: { type: 'move', sub, x, z, d } | { type: 'wait', sub } | { type: 'ping', sub } | { type: 'torpedo', sub, x, z, d }
export function moveTargets(st, sub) {
  const out = [];
  for (const [dx, dd, dz] of DIRS6) {
    const x = sub.x + dx, z = sub.z + dz, d = sub.d + dd;
    if (!free(st, x, z, d) || alive(st, sub.side).some(o => o.x === x && o.z === z && o.d === d)) continue;
    out.push({ x, z, d });
  }
  return out;
}
export function torpedoTargets(st, sub) {
  if (st.torps[sub.side] <= 0) return [];
  const out = [];
  for (let i = 0; i < CELLS; i++) { const c = cellOf(i); if (!st.rocks[i] && cheb(c, sub) <= RANGE && cheb(c, sub) >= 1) out.push(c); }
  return out;
}
export function isLegal(st, o) {
  if (st.over || !o) return false;
  const s = subById(st, o.sub);
  if (!s || !s.alive || s.side !== st.turn) return false;
  if (o.type === 'wait' || o.type === 'ping') return true;
  if (o.type === 'move') return moveTargets(st, s).some(c => c.x === o.x && c.z === o.z && c.d === o.d);
  if (o.type === 'torpedo') return st.torps[s.side] > 0 && inside(o.x, o.z, o.d) && !st.rocks[idx(o.x, o.z, o.d)] && cheb(o, s) >= 1 && cheb(o, s) <= RANGE;
  return false;
}
export function legalOrders(st) {
  const out = [];
  for (const s of alive(st, st.turn)) {
    out.push({ type: 'wait', sub: s.id }, { type: 'ping', sub: s.id });
    for (const c of moveTargets(st, s)) out.push({ type: 'move', sub: s.id, ...c });
    for (const c of torpedoTargets(st, s)) out.push({ type: 'torpedo', sub: s.id, ...c });
  }
  return out;
}

// Aplica uma ordem. Devolve { st, ev } (ev = a entrada nova do registro, com a parte particular)
export function applyOrder(st, o) {
  if (!isLegal(st, o)) throw new Error(`ordem inválida ${JSON.stringify(o)}`);
  const s = cloneSt(st);
  const me = subById(s, o.sub), side = me.side;
  let ev;
  if (o.type === 'move' || o.type === 'wait') {
    ev = { kind: 'silent', by: side, priv: { action: o.type, sub: me.id, from: { x: me.x, z: me.z, d: me.d } } };
    if (o.type === 'move') {
      const foe = alive(s, 1 - side).find(f => f.x === o.x && f.z === o.z && f.d === o.d);
      if (foe) ev.priv.contact = { id: foe.id, x: foe.x, z: foe.z, d: foe.d };
      else { me.x = o.x; me.z = o.z; me.d = o.d; }
      ev.priv.to = { x: me.x, z: me.z, d: me.d };
    }
  } else if (o.type === 'ping') {
    const echoes = alive(s, 1 - side).map(f => ({ target: f.id, ...echoOf(me, f) }));
    ev = { kind: 'ping', by: side, sub: me.id, block: blockOf(me), priv: { from: { x: me.x, z: me.z, d: me.d }, echoes } };
  } else {
    s.torps[side]--;
    const t = { x: o.x, z: o.z, d: o.d };
    const results = [];
    for (const v of s.subs) {
      if (!v.alive) continue;
      const k = manh(v, t);
      if (k === 0) { v.hp = 0; v.alive = false; results.push({ id: v.id, side: v.side, res: 'sunk' }); }
      else if (k === 1) { v.hp--; if (v.hp <= 0) { v.alive = false; results.push({ id: v.id, side: v.side, res: 'sunk' }); } else results.push({ id: v.id, side: v.side, res: 'damaged' }); }
    }
    ev = { kind: 'torpedo', by: side, sub: me.id, block: blockOf(me), target: t, results, priv: { from: { x: me.x, z: me.z, d: me.d } } };
  }
  s.log.push(ev);
  s.acts[side]++;
  const a = alive(s, PLAYER).length, b = alive(s, CPU).length;
  if (!a || !b) { s.over = true; s.winner = a ? PLAYER : b ? CPU : -1; return { st: s, ev }; }
  if (s.acts[PLAYER] >= s.maxRounds && s.acts[CPU] >= s.maxRounds) { s.over = true; s.winner = judge(s); return { st: s, ev }; }
  s.turn = 1 - side;
  if (s.turn === s.starter) s.round++;
  hearing(s);
  return { st: s, ev };
}
export function judge(s) {
  const a = alive(s, PLAYER), b = alive(s, CPU);
  if (a.length !== b.length) return a.length > b.length ? PLAYER : CPU;
  const ha = a.reduce((t, x) => t + x.hp, 0), hb = b.reduce((t, x) => t + x.hp, 0);
  return ha > hb ? PLAYER : hb > ha ? CPU : -1;
}

// O que um lado sabe: os próprios submarinos, as rochas, o registro (sem a parte particular do outro) e,
// dos submarinos inimigos, só o que é público (número, se está vivo e o casco, que os torpedos anunciam).
// Nunca a posição deles.
export function viewFor(st, side) {
  return {
    viewer: side, turn: st.turn, round: st.round, maxRounds: st.maxRounds, rocks: st.rocks.slice(), torps: st.torps.slice(), acts: st.acts.slice(), over: st.over,
    own: st.subs.filter(s => s.side === side).map(s => ({ id: s.id, side: s.side, x: s.x, z: s.z, d: s.d, hp: s.hp, alive: s.alive })),
    foes: st.subs.filter(s => s.side !== side).map(s => ({ id: s.id, side: s.side, hp: s.hp, alive: s.alive })),
    log: st.log.map(e => {
      const mine = (e.by ?? e.to) === side;
      if (mine) return e;
      if (e.kind === 'hear') return null;
      const { priv, ...pub } = e;
      return pub;
    }).filter(Boolean),
  };
}
