// Testes automáticos: node tests/run.js (ou npm test). Não tocam som e saem com código 1 se algo falhar.
import { PLAYER, CPU, NX, NZ, ND, CELLS, HP, TORPEDOES, RANGE, LAYOUTS, rng, idx, cellOf, cheb, echoOf, echoMatches, blockOf, inBlock, newGame, applyOrder, isLegal, legalOrders, moveTargets, torpedoTargets, viewFor, alive, subById, judge } from '../js/rules.js';
import { CAPTAINS, chooseOrder, decide, beliefFrom, playGame } from '../js/ai.js';
import { CHALLENGES, setupChallenge, solveChallenge, naive, oppOrder, starsFor } from '../js/challenges.js';

let fails = 0, count = 0;
function ok(cond, msg) { count++; if (!cond) { fails++; console.log('  FALHOU:', msg); } }
process.on('uncaughtException', (e) => { console.log('ERRO:', e); process.exit(1); });
process.on('unhandledRejection', (e) => { console.log('ERRO:', e); process.exit(1); });
setTimeout(() => { console.log('ERRO: os testes passaram de 200 s'); process.exit(1); }, 200000).unref();
const T0 = performance.now();
const S = (id, side, x, z, d, hp) => ({ id, side, x, z, d, hp });
const game = (subs, extra = {}) => newGame({ layout: { rocks: extra.rocks || [] }, subs, ...extra });

console.log('Aquário');
{
  ok(CELLS === 6 * 6 * 4 && cellOf(idx(3, 4, 2)).x === 3 && cellOf(idx(3, 4, 2)).z === 4 && cellOf(idx(3, 4, 2)).d === 2, 'grade 6x6x4 e conversão de casas');
  ok(LAYOUTS.every(l => l.rocks.every(([x, z, h]) => x >= 0 && x < NX && z >= 0 && z < NZ && h >= 1 && h <= 2)), 'rochas só no fundo (1 ou 2 camadas)');
  for (let g = 0; g < 20; g++) {
    const st = newGame({ layout: g % 3, random: rng(g + 1) });
    const okZone = alive(st, PLAYER).every(s => s.z >= 3) && alive(st, CPU).every(s => s.z <= 2) && st.subs.every(s => !st.rocks[idx(s.x, s.z, s.d)]);
    if (!okZone) { ok(false, `partida ${g}: submarinos fora da metade ou em rocha`); break; }
  }
  ok(true, 'cada lado começa na sua metade, fora das rochas');
  const st = newGame({ random: rng(3) });
  ok(st.subs.length === 4 && st.torps.join() === `${TORPEDOES},${TORPEDOES}` && st.subs.every(s => s.hp === HP), '2 submarinos (casco 2) e 8 torpedos para cada lado');
}

console.log('Ordens');
{
  let st = game([S(1, PLAYER, 2, 4, 1), S(2, PLAYER, 4, 4, 3), S(5, CPU, 2, 1, 1), S(6, CPU, 5, 0, 0)], { rocks: [[3, 4, 1]] });
  const s1 = subById(st, 1);
  ok(moveTargets(st, s1).length === 6, 'mover: 6 direções, inclusive subir e descer');
  const s2 = subById(st, 2);
  ok(!moveTargets(st, s2).some(c => c.x === 3 && c.z === 4 && c.d === 3) && !moveTargets(st, s2).some(c => c.d === 4), 'rocha e fundo do aquário bloqueiam');
  ok(torpedoTargets(st, s1).every(c => cheb(c, s1) <= RANGE && cheb(c, s1) >= 1) && torpedoTargets(st, s1).length > 50, `torpedo só até ${RANGE} casas`);
  ok(!isLegal(st, { type: 'move', sub: 5, x: 2, z: 2, d: 1 }) && !isLegal(st, { type: 'ping', sub: 9 }), 'não dá ordem ao submarino do outro (nem fora da vez)');
  ok(legalOrders(st).every(o => isLegal(st, o)), 'todas as ordens listadas são válidas');
  // mover é silencioso; esperar também (para o outro, os dois são iguais)
  let r = applyOrder(st, { type: 'move', sub: 1, x: 2, z: 3, d: 1 });
  const seenMove = viewFor(r.st, CPU).log.at(-2), r2 = applyOrder(st, { type: 'wait', sub: 1 });
  const seenWait = viewFor(r2.st, CPU).log.at(-2);
  ok(subById(r.st, 1).z === 3 && JSON.stringify(seenMove) === JSON.stringify(seenWait), 'mover e esperar parecem iguais para o outro');
  ok(r.st.turn === CPU && r.st.log.at(-1).kind === 'hear' && r.st.log.at(-1).to === CPU, 'passa a vez e o outro faz a escuta');
  // ping: eco para cada inimigo, revela o bloco de quem pingou
  r = applyOrder(st, { type: 'ping', sub: 1 });
  const e = r.ev;
  ok(e.priv.echoes.length === 2 && e.priv.echoes.every(x => echoMatches(subById(st, 1), subById(st, x.target), x)), 'ping: um eco certo para cada submarino dele');
  ok(e.block.bx === 1 && e.block.bz === 2 && e.block.bd === 0 && !('priv' in viewFor(r.st, CPU).log.find(x => x.kind === 'ping')), 'o outro só fica sabendo o bloco 2x2x2 de quem pingou (os ecos são seus)');
  const k = echoOf({ x: 0, z: 5, d: 0 }, { x: 0, z: 1, d: 2 });
  ok(k.band === 2 && k.dir === 0 && k.vert === 1, 'eco: 4 casas ao norte e mais fundo = médio, norte, mais fundo');
  ok(echoOf({ x: 0, z: 0, d: 0 }, { x: 1, z: 1, d: 0 }).dir === 3 && echoOf({ x: 0, z: 0, d: 0 }, { x: 5, z: 0, d: 0 }).band === 3, 'eco: rumo sudeste; 5 casas = longe');
  // torpedo: direto afunda, colado avaria, revela o bloco
  st = game([S(1, PLAYER, 2, 4, 1), S(2, PLAYER, 4, 5, 3), S(5, CPU, 2, 2, 1), S(6, CPU, 3, 2, 1)]);
  r = applyOrder(st, { type: 'torpedo', sub: 1, x: 2, z: 2, d: 1 });
  ok(!subById(r.st, 5).alive && subById(r.st, 6).hp === HP - 1 && r.st.torps[PLAYER] === TORPEDOES - 1, 'torpedo: acerto direto afunda, casa colada avaria, gasta 1 torpedo');
  ok(r.ev.results.length === 2 && r.ev.block && r.ev.target, 'o resultado e o bloco de quem atirou são públicos');
  const diag = applyOrder(game([S(1, PLAYER, 2, 4, 1), S(5, CPU, 3, 3, 1)]), { type: 'torpedo', sub: 1, x: 2, z: 2, d: 1 });
  ok(subById(diag.st, 5).hp === HP, 'diagonal não pega (só as 6 casas coladas)');
  const ff = applyOrder(game([S(1, PLAYER, 2, 4, 1), S(2, PLAYER, 2, 3, 1), S(5, CPU, 0, 0, 0)]), { type: 'torpedo', sub: 1, x: 2, z: 2, d: 1 });
  ok(subById(ff.st, 2).hp === HP - 1, 'fogo amigo: o seu colado também avaria');
  const two = applyOrder(applyOrder(applyOrder(game([S(1, PLAYER, 2, 4, 1), S(5, CPU, 2, 2, 0), S(6, CPU, 5, 0, 3)]), { type: 'torpedo', sub: 1, x: 2, z: 2, d: 1 }).st, { type: 'wait', sub: 6 }).st, { type: 'torpedo', sub: 1, x: 2, z: 2, d: 1 });
  ok(!subById(two.st, 5).alive, 'duas avarias afundam');
  // escuta e contato
  st = game([S(1, PLAYER, 2, 3, 1), S(5, CPU, 2, 2, 1), S(6, CPU, 5, 0, 3)]);
  ok(st.log[0].kind === 'hear' && st.log[0].priv.heard.includes(1), 'escuta: inimigo colado é ouvido no começo da vez');
  r = applyOrder(st, { type: 'move', sub: 1, x: 2, z: 2, d: 1 });
  ok(subById(r.st, 1).z === 3 && r.ev.priv.contact?.id === 5, 'mover para a casa dele: não anda e descobre onde ele está');
  // fim
  let fin = applyOrder(game([S(1, PLAYER, 2, 4, 1), S(5, CPU, 2, 2, 1)]), { type: 'torpedo', sub: 1, x: 2, z: 2, d: 1 }).st;
  ok(fin.over && fin.winner === PLAYER, 'afundou todos: ganhou');
  let lim = game([S(1, PLAYER, 2, 4, 1), S(5, CPU, 2, 0, 1, 1)], { maxRounds: 2 });
  while (!lim.over) lim = applyOrder(lim, { type: 'wait', sub: alive(lim, lim.turn)[0].id }).st;
  ok(lim.over && lim.winner === PLAYER && judge(lim) === PLAYER, 'fim das ordens: ganha quem tem mais casco');
  ok(inBlock({ x: 3, z: 2, d: 1 }, blockOf({ x: 2, z: 3, d: 0 })), 'bloco 2x2x2');
}

console.log('IA');
{
  const st = newGame({ layout: 1, random: rng(12) });
  for (const o of CAPTAINS) {
    const t0 = performance.now();
    const c = chooseOrder(applyOrder(st, { type: 'ping', sub: alive(st, st.turn)[0].id }).st, CPU === st.turn ? PLAYER : CPU, o, rng(3));
    const ms = performance.now() - t0;
    ok(c && c.type, `${o.name}: ordem válida`);
    ok(ms < 100, `${o.name}: decide em menos de 100 ms (${ms.toFixed(1)})`);
  }
  // não trapaceia: mesma decisão com os seus submarinos em outro lugar, se o que ela viu é igual
  const mk = (pa, pb) => newGame({ layout: 0, starter: CPU, subs: [S(1, PLAYER, ...pa), S(2, PLAYER, ...pb), S(5, CPU, 2, 1, 1), S(6, CPU, 4, 0, 2)] });
  for (const o of CAPTAINS) {
    const a = chooseOrder(mk([1, 4, 0], [4, 5, 3]), CPU, o, rng(9)), b = chooseOrder(mk([3, 5, 2], [0, 3, 1]), CPU, o, rng(9));
    ok(JSON.stringify(a) === JSON.stringify(b), `${o.name} não vê os seus submarinos: mesma ordem com eles em outro lugar`);
  }
  // armadilha: ler a posição dos seus explode
  const trap = mk([1, 4, 0], [4, 5, 3]);
  for (const s of trap.subs) if (s.side === PLAYER) for (const k of ['x', 'z', 'd']) { let v = s[k]; Object.defineProperty(s, k, { get() { throw new Error('a IA leu a posição do jogador'); }, set(n) { v = n; }, enumerable: true }); void v; }
  let read = false; for (const o of CAPTAINS) { try { chooseOrder(trap, CPU, o, rng(1)); } catch { read = true; } }
  ok(!read, 'nenhum capitão lê a posição real dos seus submarinos (armadilha não disparou)');
  const v = viewFor(newGame({ random: rng(5) }), CPU);
  ok(v.foes.every(f => !('x' in f) && !('z' in f) && !('d' in f)) && v.log.every(e => e.kind !== 'hear' || e.to === CPU), 'o que a IA recebe não tem a posição dos seus nem a sua escuta');
  // a crença só usa o que ela tem direito: depois de um ping seu, o mapa dela cobre o bloco revelado
  let g = newGame({ layout: 0, starter: PLAYER, subs: [S(1, PLAYER, 2, 4, 1), S(2, PLAYER, 4, 5, 3), S(5, CPU, 2, 1, 1), S(6, CPU, 4, 0, 2)] });
  g = applyOrder(g, { type: 'ping', sub: 1 }).st;
  const bel = beliefFrom(viewFor(g, CPU));
  let inside = 0; for (let i = 0; i < CELLS; i++) if (inBlock(cellOf(i), { bx: 1, bz: 2, bd: 0 })) inside += bel.grids[1][i];
  ok(Math.abs(inside - 1) < 1e-9, 'quem pingou fica no bloco revelado no mapa dela (e só lá)');
  ok(decide(viewFor(g, CPU), CAPTAINS[1], rng(2)).type === 'torpedo', 'a Comandante Muda atira no bloco que você entregou');
  // estilos: quanto cada um pinga
  const pings = (o) => { let p = 0, n = 0; const r = rng(4); for (let k = 0; k < 10; k++) { let s = newGame({ layout: k % 3, random: rng(200 + k) }); while (!s.over) { const who = s.turn; const ord = chooseOrder(s, who, who === CPU ? o : CAPTAINS[2], r); if (who === CPU) { n++; if (ord.type === 'ping') p++; } s = applyOrder(s, ord).st; } } return p / Math.max(1, n); };
  const pc = pings(CAPTAINS[0]), ps = pings(CAPTAINS[1]), pt = pings(CAPTAINS[2]);
  console.log(`  quanto pinga: Arpão ${(pc * 100).toFixed(0)}%, Muda ${(ps * 100).toFixed(0)}%, Tales ${(pt * 100).toFixed(0)}% das ordens`);
  ok(pc > ps * 2, 'o Capitão Arpão pinga bem mais que a Comandante Muda');
}

console.log('IA contra IA');
{
  const r = rng(3);
  const duel = (i, j, games) => {
    let wa = 0, wb = 0, dr = 0, len = 0;
    for (let g = 0; g < games; g++) {
      const sw = g % 2 === 1, st = newGame({ random: rng(100 + g), layout: g % 3 });
      const s = sw ? playGame(st, CAPTAINS[j], CAPTAINS[i], r) : playGame(st, CAPTAINS[i], CAPTAINS[j], r);
      ok(s.over, 'partida IA x IA até o fim');
      len += s.acts[0] + s.acts[1];
      const w = s.winner === -1 ? -1 : (sw ? 1 - s.winner : s.winner);
      if (w === 0) wa++; else if (w === 1) wb++; else dr++;
    }
    console.log(`  ${CAPTAINS[i].name} ${wa} x ${wb} ${CAPTAINS[j].name} (${dr} empates, ${(len / games).toFixed(1)} ordens por partida)`);
    return [wa, wb];
  };
  const [a, b] = duel(2, 0, 60), [c, d] = duel(2, 1, 60);
  duel(0, 1, 60);
  ok(a > b && c > d, 'Almirante Tales (o mais forte) ganha mais do que perde dos outros dois');
}

console.log('Desafios');
{
  for (const [i, c] of CHALLENGES.entries()) {
    ok(c.desc && c.stars.length === 3 && c.stars[0] > c.stars[1] && c.stars[1] > c.stars[2] && c.stars[0] <= c.limit, `desafio ${i + 1}: texto e metas (menos ordens = mais estrelas)`);
    const st = setupChallenge(c);
    ok(alive(st, PLAYER).every(s => s.z >= 3) && alive(st, CPU).every(s => s.z <= 2) && st.subs.every(s => !st.rocks[idx(s.x, s.z, s.d)]), `desafio ${i + 1}: submarinos nas metades certas, fora das rochas`);
    const t0 = performance.now();
    const best = solveChallenge(c);
    console.log(`  ${i + 1}. ${c.name}: ${'★'.repeat(best.stars)}${'☆'.repeat(3 - best.stars)}  ${best.value} ordens  ${best.orders.map(o => ({ move: 'mover', wait: 'esperar', ping: 'ping', torpedo: 'torpedo' })[o.type]).join(', ')}  (${(performance.now() - t0).toFixed(0)} ms)`);
    ok(best.stars === 3, `robô (sem espiar) tira 3 estrelas no desafio ${i + 1}`);
    ok(starsFor(c, naive(c)) < 3, `desafio ${i + 1}: atirar a esmo sem pingar não dá 3 estrelas`);
    let s2 = st; for (let k = 0; k < 6 && !s2.over; k++) { s2 = applyOrder(s2, s2.turn === PLAYER ? { type: 'wait', sub: alive(s2, PLAYER)[0].id } : oppOrder(c, s2)).st; }
    ok(true, `desafio ${i + 1}: Capitão Fixo dá ordens válidas`);
  }
}

console.log('Fumaça do main.js');
{
  const { smoke } = await import('./smoke.js');
  try {
    const out = await smoke();
    for (const [cond, msg] of out) ok(cond, msg);
    console.log(`  ${out.filter(o => o[0]).length} de ${out.length} conferências do jogo carregado`);
  } catch (e) { ok(false, `main.js quebrou: ${e.stack || e}`); }
}

console.log(`\n${count - fails} de ${count} passaram (${((performance.now() - T0) / 1000).toFixed(1)} s)`);
if (fails) { console.log(`${fails} FALHARAM`); process.exit(1); }
console.log('Tudo certo');
process.exit(0);
