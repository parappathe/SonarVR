// Desafios do Sonar: afundar os submarinos do Capitão Fixo, que segue uma regra escrita no desafio,
// com poucas ordens. Estrelas pelo número de ordens suas até afundar todos (menos é melhor). O robô é
// o próprio Almirante Tales jogando do seu lado, sem espiar (só com o que você veria). Sem navegador.
import { newGame, applyOrder, isLegal, alive, viewFor, blockOf, inBlock, cellOf, CELLS, cheb, PLAYER, CPU, RANGE, rng, idx } from './rules.js';
import { CAPTAINS, decide } from './ai.js';

const S = (id, side, x, z, d) => ({ id, side, x, z, d });
// enemy: { [id]: regra } — 'still' (parado), { patrol: [[x, z, d], ...] } (vai e volta pela lista), 'answer'
// (atira no bloco que você revelou por último, se alcançar; senão fica parado)
export const CHALLENGES = [
  { name: 'Primeiro ping', limit: 14, torps: 8, rocks: [[0, 2, 1], [5, 3, 1]],
    subs: [S(1, PLAYER, 2, 4, 1), S(5, CPU, 3, 1, 2)], enemy: { 5: 'still' },
    desc: 'Um submarino parado do outro lado. Pingue, leia o eco e atire.' },
  { name: 'Dois parados', limit: 16, torps: 8, rocks: [[2, 2, 2], [3, 3, 1]],
    subs: [S(1, PLAYER, 1, 4, 0), S(2, PLAYER, 4, 4, 2), S(5, CPU, 1, 1, 3), S(6, CPU, 4, 0, 1)], enemy: { 5: 'still', 6: 'still' },
    desc: 'Dois alvos parados. Um ping mostra os dois ecos de uma vez.' },
  { name: 'Patrulha', limit: 16, torps: 8, rocks: [[1, 3, 1], [4, 3, 1]],
    subs: [S(1, PLAYER, 2, 4, 1), S(5, CPU, 0, 1, 1)], enemy: { 5: { patrol: [[0, 1, 1], [1, 1, 1], [2, 1, 1], [3, 1, 1], [4, 1, 1], [5, 1, 1]] } },
    desc: 'Ele anda de um lado para o outro, sempre na mesma linha. Ache a linha e espere ele passar.' },
  { name: 'Atrás das rochas', limit: 16, torps: 8, rocks: [[1, 2, 2], [2, 2, 2], [3, 2, 2], [4, 2, 2], [2, 1, 1], [3, 0, 1]],
    subs: [S(1, PLAYER, 3, 4, 0), S(5, CPU, 2, 0, 3)], enemy: { 5: 'still' },
    desc: 'Um paredão de rochas no fundo. Ele está escondido lá embaixo, atrás dele.' },
  { name: 'Ele responde', limit: 16, torps: 8, rocks: [[0, 3, 1], [5, 2, 1]],
    subs: [S(1, PLAYER, 2, 3, 1), S(2, PLAYER, 4, 5, 3), S(5, CPU, 3, 1, 0)], enemy: { 5: 'answer' },
    desc: 'Ele fica quieto, mas atira no bloco de quem pingar ou atirar. Não fique parado depois de se revelar.' },
  { name: 'Poucos torpedos', limit: 16, torps: 2, rocks: [[1, 1, 1], [4, 1, 1], [2, 3, 1]],
    subs: [S(1, PLAYER, 3, 4, 2), S(5, CPU, 4, 2, 2)], enemy: { 5: 'still' },
    desc: 'Só 2 torpedos. Pingue até ter certeza antes de atirar.' },
  { name: 'Mergulhador', limit: 16, torps: 8, rocks: [[0, 0, 1], [5, 5, 1]],
    subs: [S(1, PLAYER, 1, 4, 1), S(5, CPU, 3, 1, 0)], enemy: { 5: { patrol: [[3, 1, 0], [3, 1, 1], [3, 1, 2], [3, 1, 3]] } },
    desc: 'Ele sobe e desce sem parar na mesma coluna. O eco diz se está mais fundo ou mais raso.' },
  { name: 'Cerco', limit: 18, torps: 8, rocks: [[2, 2, 1], [3, 2, 1]],
    subs: [S(1, PLAYER, 0, 5, 0), S(2, PLAYER, 5, 5, 3), S(5, CPU, 2, 1, 1)], enemy: { 5: { patrol: [[2, 1, 1], [3, 1, 1], [3, 2, 0], [2, 2, 0]] } },
    desc: 'Ele dá voltas num quadradinho no meio. Feche o cerco com os dois submarinos.' },
  { name: 'Dupla', limit: 20, torps: 8, rocks: [[1, 3, 2], [4, 2, 1]],
    subs: [S(1, PLAYER, 1, 5, 1), S(2, PLAYER, 4, 4, 2), S(5, CPU, 0, 1, 2), S(6, CPU, 4, 0, 0)],
    enemy: { 5: { patrol: [[0, 1, 2], [1, 1, 2], [2, 1, 2], [3, 1, 2]] }, 6: 'answer' },
    desc: 'Um patrulha, o outro responde aos seus pings atirando no seu bloco. Afunde os dois.' },
  { name: 'Caçada final', limit: 22, torps: 6, rocks: [[2, 2, 2], [3, 3, 2], [0, 2, 1], [5, 3, 1]],
    subs: [S(1, PLAYER, 2, 4, 0), S(2, PLAYER, 3, 5, 3), S(5, CPU, 1, 0, 3), S(6, CPU, 4, 1, 1)],
    enemy: { 5: 'answer', 6: { patrol: [[4, 1, 1], [4, 1, 2], [5, 1, 2], [5, 1, 1]] } },
    desc: 'Dois submarinos, 6 torpedos: um responde aos seus pings, o outro patrulha num cantinho.' },
];
// metas: ordens suas até afundar todos (menos é melhor). A terceira estrela é o que o robô conseguiu.
const STARS = [[12, 9, 6], [14, 10, 7], [14, 10, 6], [15, 12, 9], [12, 8, 4], [12, 8, 4], [14, 11, 9], [17, 15, 13], [18, 13, 9], [20, 14, 10]];
CHALLENGES.forEach((c, i) => { c.stars = STARS[i]; });

export function setupChallenge(c) {
  return newGame({ layout: { rocks: c.rocks }, subs: c.subs, torpedoes: [c.torps, 8], maxRounds: c.limit, starter: PLAYER });
}
const asCell = ([x, z, d]) => ({ x, z, d });
// ordem do Capitão Fixo: um submarino por turno, revezando (só usa o que é público ou dele mesmo)
export function oppOrder(c, st) {
  const mine = alive(st, CPU);
  const k = st.acts[CPU] % mine.length;
  const order = [...mine.slice(k), ...mine.slice(0, k)];
  // quem tem regra 'answer' e um bloco seu revelado ao alcance atira primeiro
  const view = viewFor(st, CPU);
  let lastBlock = null, lastAt = -1;
  view.log.forEach((e, n) => { if (e.by === PLAYER && (e.kind === 'ping' || e.kind === 'torpedo')) { lastBlock = e.block; lastAt = n; } });
  const answered = view.log.some((e, n) => n > lastAt && e.by === CPU && e.kind === 'torpedo');
  if (lastBlock && !answered && st.torps[CPU] > 0) {
    for (const s of mine) {
      if (c.enemy[s.id] !== 'answer') continue;
      for (let i = 0; i < CELLS; i++) {
        const t = cellOf(i);
        if (!inBlock(t, lastBlock) || st.rocks[i]) continue;
        const o = { type: 'torpedo', sub: s.id, ...t };
        if (isLegal(st, o)) return o;
      }
    }
  }
  for (const s of order) {
    const rule = c.enemy[s.id];
    if (rule?.patrol) {
      const path = rule.patrol.map(asCell), n = path.length;
      const seq = []; for (let i = 0; i < n; i++) seq.push(i); for (let i = n - 2; i >= 1; i--) seq.push(i);
      const m = st.log.filter(e => e.by === CPU && e.kind === 'silent' && e.priv.sub === s.id && e.priv.action === 'move' && !e.priv.contact).length;
      const o = { type: 'move', sub: s.id, ...path[seq[(m + 1) % seq.length]] };
      if (isLegal(st, o)) return o;
    }
  }
  return { type: 'wait', sub: order[0].id };
}
// pontos: ordens suas até afundar todos (Infinity se não conseguiu)
export const measure = (c, st) => (st.over && !alive(st, CPU).length && alive(st, PLAYER).length ? st.acts[PLAYER] : Infinity);
export function starsFor(c, v) { let n = 0; for (const t of c.stars) if (v <= t) n++; return n; }
export const metricName = () => 'ordens até afundar';
export const goalText = (c) => `Estrelas por ordens até afundar tudo: ${c.stars.map((t, i) => `${'★'.repeat(i + 1)} até ${t}`).join('   ')}`;
export function runOpp(c, st) { let s = st; while (!s.over && s.turn === CPU) s = applyOrder(s, oppOrder(c, s)).st; return s; }

// O robô joga o desafio como você jogaria: o Almirante Tales decidindo só com viewFor(st, você).
export const ROBOT_SEED = 7;
export function robotOrder(st, random) { return decide(viewFor(st, PLAYER), CAPTAINS[2], random); }
export function solveChallenge(c) {
  const random = rng(ROBOT_SEED);
  let st = setupChallenge(c);
  const orders = [];
  while (!st.over) {
    if (st.turn === CPU) { st = runOpp(c, st); continue; }
    const o = robotOrder(st, random);
    orders.push(o);
    st = applyOrder(st, o).st;
  }
  const value = measure(c, st);
  return { value, stars: starsFor(c, value), orders, st };
}
// jogada "boba": atira a esmo (casas sorteadas ao alcance), sem pingar
export function naive(c) {
  const random = rng(3);
  let st = setupChallenge(c);
  while (!st.over) {
    if (st.turn === CPU) { st = runOpp(c, st); continue; }
    const me = alive(st, PLAYER)[0];
    let o = { type: 'wait', sub: me.id };
    if (st.torps[PLAYER] > 0) for (let k = 0; k < 50; k++) { const t = cellOf(Math.floor(random() * CELLS)); const cand = { type: 'torpedo', sub: me.id, ...t }; if (isLegal(st, cand) && cheb(t, me) > 1) { o = cand; break; } }
    st = applyOrder(st, o).st;
  }
  return measure(c, st);
}
export { blockOf, RANGE, idx, asCell };
