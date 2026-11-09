// Capitães do Sonar. A IA recebe só viewFor(st, lado): os próprios submarinos, as rochas e o registro
// do que ela tem direito de saber (os pings e torpedos do outro mostram só o bloco 2x2x2; os ecos e a
// escuta dela mesma). Com isso ela monta um mapa de probabilidade de cada submarino inimigo e decide.
// Nunca a posição real dos seus submarinos (o teste confere). Sem navegador.
import { PLAYER, CPU, NX, NZ, ND, CELLS, RANGE, DIRS6, idx, cellOf, inside, cheb, manh, inBlock, echoMatches, zoneOf, viewFor, blockOf, moveTargets } from './rules.js';
export { rng } from './rules.js';

export const CAPTAINS = [
  {
    id: 'caca', name: 'Capitão Arpão', title: 'o caçador', color: 0xc8502a,
    desc: 'Pinga quase todo turno e vai atrás do eco. Acha você rápido, mas se entrega muito.',
    think: 1.0, pingGap: 1, fireAt: 0.26, revealCost: 0.05, evade: 0.2, approach: 1, noise: 0.05, misses: false, quiet: false,
  },
  {
    id: 'silencio', name: 'Comandante Muda', title: 'a silenciosa', color: 0x4a7aa8,
    desc: 'Quase nunca pinga: escuta, espera você se revelar e atira no bloco que você entregou.',
    think: 1.3, pingGap: 9, fireAt: 0.32, revealCost: 0.12, evade: 0.8, approach: 0, noise: 0.05, misses: false, quiet: true,
  },
  {
    id: 'tatico', name: 'Almirante Tales', title: 'o tático', color: 0x3a9a6a,
    desc: 'Raciocina por probabilidade: soma tudo o que ouviu, atira onde a chance compensa e foge quando se revela.',
    think: 1.6, pingGap: 1, fireAt: 0.26, revealCost: 0.05, evade: 0.2, approach: 0.5, noise: 0.01, smart: true, misses: true, quiet: true,
  },
];
export const ROBOT = { ...CAPTAINS[2], id: 'robo', name: 'Robô', think: 0.25 };

// ---------- mapa de probabilidade (crença) ----------
function freeCell(view, i) { return !view.rocks[i]; }
function normalize(g) { let t = 0; for (let i = 0; i < CELLS; i++) t += g[i]; if (t > 0) for (let i = 0; i < CELLS; i++) g[i] /= t; return t; }
function diffuse(view, g) {
  const out = new Float64Array(CELLS);
  for (let i = 0; i < CELLS; i++) {
    if (!g[i]) continue;
    const c = cellOf(i), nb = [];
    for (const [dx, dd, dz] of DIRS6) { const x = c.x + dx, z = c.z + dz, d = c.d + dd; if (inside(x, z, d) && freeCell(view, idx(x, z, d))) nb.push(idx(x, z, d)); }
    if (!nb.length) { out[i] += g[i]; continue; }
    for (const j of nb) out[j] += g[i] / nb.length;
  }
  return out;
}
// Refaz a crença lendo o registro do começo ao fim (só o que o lado viu).
// opts.misses: usa os torpedos que erraram; opts.quiet: usa a escuta sem barulho ("ninguém colado")
export function beliefFrom(view, opts = { misses: true, quiet: true }) {
  const side = view.viewer;
  const [z0, z1] = zoneOf(1 - side);
  const grids = {};
  for (const f of view.foes) {
    const g = new Float64Array(CELLS);
    for (let i = 0; i < CELLS; i++) { const c = cellOf(i); if (freeCell(view, i) && c.z >= z0 && c.z <= z1) g[i] = 1; }
    normalize(g);
    grids[f.id] = g;
  }
  const dead = new Set();
  const restrict = (id, keep) => { const g = grids[id]; if (!g || dead.has(id)) return; const bak = g.slice(); for (let i = 0; i < CELLS; i++) if (g[i] && !keep(cellOf(i))) g[i] = 0; if (!normalize(g)) grids[id] = bak; };
  let lastInfo = 0, exposed = {};
  view.log.forEach((e, n) => {
    if (e.kind === 'silent' && e.by !== side) {
      const live = view.foes.filter(f => !dead.has(f.id));
      const q = 0.7 / Math.max(1, live.length);
      for (const f of live) { const d = diffuse(view, grids[f.id]); const g = grids[f.id]; for (let i = 0; i < CELLS; i++) g[i] = (1 - q) * g[i] + q * d[i]; }
    } else if ((e.kind === 'ping' || e.kind === 'torpedo') && e.by !== side) {
      restrict(e.sub, c => inBlock(c, e.block)); lastInfo = n;
    }
    if ((e.kind === 'ping' || e.kind === 'torpedo') && e.by === side) exposed[e.sub] = n;
    if (e.kind === 'ping' && e.by === side && e.priv) {
      for (const ec of e.priv.echoes) restrict(ec.target, c => echoMatches(e.priv.from, c, ec));
      lastInfo = n;
    }
    if (e.kind === 'silent' && e.by === side && e.priv?.contact) { const k = e.priv.contact; restrict(k.id, c => c.x === k.x && c.z === k.z && c.d === k.d); lastInfo = n; }
    if (e.kind === 'torpedo') {
      const hitIds = new Set(e.results.map(r => r.id));
      for (const r of e.results) if (r.side !== side) {
        if (r.res === 'sunk') dead.add(r.id);
        else if (e.by === side) restrict(r.id, c => manh(c, e.target) === 1);
      }
      // quem não foi atingido não estava na casa nem em volta dela
      if (opts.misses) for (const f of view.foes) if (!hitIds.has(f.id) && !dead.has(f.id)) restrict(f.id, c => manh(c, e.target) > 1);
    }
    if (e.kind === 'hear' && e.to === side && e.priv) {
      const quiet = opts.quiet ? e.priv.own.filter(o => !e.priv.heard.includes(o.id)) : [];
      for (const f of view.foes) if (!dead.has(f.id)) {
        restrict(f.id, c => !quiet.some(o => cheb(o, c) <= 1) && !e.priv.own.some(o => o.x === c.x && o.z === c.z && o.d === c.d));
        if (e.priv.heard.length) { const g = grids[f.id]; for (let i = 0; i < CELLS; i++) if (g[i]) { const c = cellOf(i); if (e.priv.heard.some(h => { const o = e.priv.own.find(x => x.id === h); return cheb(o, c) === 1; })) g[i] *= 4; } normalize(g); }
      }
      if (e.priv.heard.length) lastInfo = n;
    }
  });
  for (const f of view.foes) if (!f.alive) dead.add(f.id);
  return { grids, dead, lastInfo, exposed, n: view.log.length };
}

// valor de um torpedo na casa t: chance de afundar + meia chance de avariar, menos o risco para os seus
function torpedoValue(view, bel, t) {
  let v = 0;
  for (const f of view.foes) {
    if (bel.dead.has(f.id)) continue;
    const g = bel.grids[f.id];
    let direct = 0, near = 0;
    direct = g[idx(t.x, t.z, t.d)];
    for (const [dx, dd, dz] of DIRS6) { const x = t.x + dx, z = t.z + dz, d = t.d + dd; if (inside(x, z, d)) near += g[idx(x, z, d)]; }
    v += direct + near * (f.hp <= 1 ? 1 : 0.45);
  }
  for (const o of view.own) if (o.alive && manh(o, t) <= 1) v -= manh(o, t) === 0 ? 5 : 1.2;
  return v;
}
function bestPeak(view, bel) { let m = 0; for (const f of view.foes) if (!bel.dead.has(f.id)) for (const p of bel.grids[f.id]) if (p > m) m = p; return m; }
function centroid(view, bel) {
  let x = 0, z = 0, d = 0, t = 0;
  for (const f of view.foes) { if (bel.dead.has(f.id)) continue; const g = bel.grids[f.id]; for (let i = 0; i < CELLS; i++) if (g[i]) { const c = cellOf(i); x += c.x * g[i]; z += c.z * g[i]; d += c.d * g[i]; t += g[i]; } }
  return t ? { x: x / t, z: z / t, d: d / t } : { x: 2.5, z: 2.5, d: 1.5 };
}
// perigo: quanto o outro sabe de onde está o seu submarino. Sobe quando ele se revela (ping ou torpedo
// dele mesmo), quando o outro pinga (recebeu eco de todos) ou quando um torpedo avaria; zera quando anda.
function exposure(view, sub) {
  let lastReveal = -1, lastMove = -1, block = null;
  view.log.forEach((e, k) => {
    if (e.by === view.viewer && e.kind === 'silent' && e.priv?.sub === sub.id && e.priv.action === 'move') lastMove = k;
    if (e.by === view.viewer && (e.kind === 'ping' || e.kind === 'torpedo') && e.sub === sub.id) { lastReveal = k; block = e.block; }
    if (e.by !== view.viewer && e.kind === 'ping') { lastReveal = k; block = null; }
    if (e.kind === 'torpedo' && e.results.some(r => r.id === sub.id)) { lastReveal = k; block = null; }
  });
  if (lastReveal < 0 || lastMove > lastReveal) return { v: 0, block: null };
  return { v: Math.max(0, 1 - (view.log.length - lastReveal) / 9), block };
}
function danger(view, c, sub) {
  const ex = exposure(view, sub);
  if (!ex.v) return 0;
  if (c.x === sub.x && c.z === sub.z && c.d === sub.d) return ex.v;
  // andou: se o bloco foi revelado e continua nele, ainda corre algum risco
  return ex.block && inBlock(c, ex.block) ? ex.v * 0.5 : ex.v * 0.15;
}

// para onde fugir: casa com menos perigo; o tático também se afasta do outro submarino dele
function pickEscape(view, s, opts, random, smart = true) {
  let bm = null;
  for (const c of opts) {
    let v = -danger(view, c, s) * 2 + (random() - 0.5) * 0.1;
    if (smart) for (const o of view.own) if (o.alive && o.id !== s.id && manh(o, c) <= 2) v -= 0.5;
    if (!bm || v > bm.v) bm = { v, c };
  }
  return bm.c;
}

// Escolhe a ordem do lado "side". Recebe o estado inteiro, mas só olha viewFor(st, side).
export function chooseOrder(st, side, o, random = Math.random) {
  const view = viewFor(st, side);          // daqui para baixo, nada da posição real dos seus
  return decide(view, o, random);
}
export function decide(view, o, random = Math.random) {
  const bel = beliefFrom(view, { misses: !!o.misses, quiet: !!o.quiet });
  const mine = view.own.filter(s => s.alive);
  const torps = view.torps[view.viewer];
  // 1) torpedo: melhor casa ao alcance de algum submarino
  let best = null;
  if (torps > 0) {
    for (let i = 0; i < CELLS; i++) {
      if (view.rocks[i]) continue;
      const c = cellOf(i);
      const shooters = mine.filter(s => cheb(s, c) >= 1 && cheb(s, c) <= RANGE);
      if (!shooters.length) continue;
      let v = torpedoValue(view, bel, c) + (random() - 0.5) * o.noise;
      // atirar revela: prefere quem já está revelado ou mais longe da casa de explosão
      const sh = shooters.sort((a, b) => danger(view, b, b) - danger(view, a, a) || cheb(b, c) - cheb(a, c))[0];
      v -= o.revealCost * (1 - danger(view, sh, sh));
      if (o.smart) v -= torps <= 2 ? 0.08 : 0;
      if (!best || v > best.v) best = { v, order: { type: 'torpedo', sub: sh.id, x: c.x, z: c.z, d: c.d } };
    }
  }
  // o tático foge antes de atirar quando foi avariado ou acabou de ser achado (a não ser que o tiro seja quase certo)
  if (o.smart && best && best.v < 0.6) {
    for (const s of mine) {
      if (danger(view, s, s) < 0.75) continue;
      const opts = moveTargets({ rocks: view.rocks, subs: view.own, torps: view.torps }, s);
      if (opts.length) return { type: 'move', sub: s.id, ...pickEscape(view, s, opts, random) };
    }
  }
  if (best && best.v >= o.fireAt) return best.order;
  // 2) fugir se estiver revelado
  const sinceInfo = bel.n - bel.lastInfo;
  const myLast = Math.max(-1, ...Object.values(bel.exposed));
  const sincePing = bel.n - myLast;
  let runner = null;
  for (const s of mine) { const dg = danger(view, s, s); if (dg > 0 && (!runner || dg > runner.dg)) runner = { s, dg }; }
  if (runner && runner.dg * o.evade > 0.35) {
    const opts = moveTargets({ rocks: view.rocks, subs: view.own, torps: view.torps }, runner.s);
    if (opts.length) {
      return { type: 'move', sub: runner.s.id, ...pickEscape(view, runner.s, opts, random, o.smart) };
    }
  }
  // 3) pingar se faz tempo que não sabe nada
  const peak = bestPeak(view, bel);
  // pingar de novo do mesmo lugar não ensina nada: só quem andou desde o último ping dele
  const lastPingFrom = {};
  for (const e of view.log) if (e.by === view.viewer && e.kind === 'ping' && e.priv) lastPingFrom[e.sub] = e.priv.from;
  const fresh = mine.filter(s => { const f = lastPingFrom[s.id]; return !f || f.x !== s.x || f.z !== s.z || f.d !== s.d; });
  let stuck = false;
  if (sincePing > o.pingGap * 2 && (peak < 0.3 || sinceInfo > 6)) {
    // quem pinga: o mais exposto (para não entregar o outro), entre os que andaram
    const s = fresh.sort((a, b) => danger(view, b, b) - danger(view, a, a))[0];
    if (s) return { type: 'ping', sub: s.id };
    stuck = true;
  }
  // 4) aproximar (ou ficar quieto)
  if (o.approach > 0 && (stuck || random() < o.approach)) {
    const tgt = centroid(view, bel);
    let bm = null;
    for (const s of mine) {
      const here = Math.hypot(s.x - tgt.x, s.z - tgt.z, s.d - tgt.d);
      for (const c of moveTargets({ rocks: view.rocks, subs: view.own, torps: view.torps }, s)) {
        const dist = Math.hypot(c.x - tgt.x, c.z - tgt.z, c.d - tgt.d);
        let v = (here - dist) - danger(view, c, s) - (dist < 1.6 ? 1 : 0) + (random() - 0.5) * 0.2;
        if (o.smart) for (const k of mine) if (k.id !== s.id && manh(k, c) <= 2) v -= 0.6;
        if (!bm || v > bm.v) bm = { v, s, c };
      }
    }
    if (bm && bm.v > 0) return { type: 'move', sub: bm.s.id, ...bm.c };
  }
  return { type: 'wait', sub: mine[0].id };
}

// Partida inteira entre dois capitães (para os testes). Devolve o estado final.
export function playGame(st, a, b, random) {
  let s = st, guard = 0;
  while (!s.over && guard++ < 400) s = REF.applyOrder(s, chooseOrder(s, s.turn, s.turn === PLAYER ? a : b, random)).st;
  return s;
}
import * as REF from './rules.js';
export { blockOf, NX, NZ, ND, CPU };
