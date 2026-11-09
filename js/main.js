// Liga as regras e a IA à cena, ao Quest (controles e mãos) e ao mouse/teclado.
import * as THREE from '../vendor/three/three.module.js';
import { PLAYER, CPU, NX, NZ, ND, RANGE, DIR8, VERT, BANDS, LAYOUTS, TORPEDOES, newGame, applyOrder, isLegal, alive, subById, moveTargets, torpedoTargets, viewFor, cellOf, rng, cheb } from './rules.js';
import { CAPTAINS, chooseOrder, beliefFrom } from './ai.js';
import { CHALLENGES, setupChallenge, oppOrder, measure, starsFor, goalText, metricName, robotOrder, ROBOT_SEED, solveChallenge } from './challenges.js';
import { buildWorld, TANK, SIZE, C, STAND, localOf, cellAtLocal, GREEN, AMBER, RED } from './scene.js';
import { createShell } from './shell.js';
import { setTheme } from './ui.js';
import { Sfx } from './audio.js';
import { loadSave, storeSave } from './save.js';

setTheme({
  bg: 'rgba(8,26,20,0.96)', edge: '#5fe08a', text: '#d8f5e0', dim: '#7fa890', btn: '#1e3a2e', btnHover: '#2f6a4a',
  btnOn: '#ffb347', btnOnText: '#1a1a10', lock: '#14241e', star: '#ffc34a', labelBg: 'rgba(8,26,20,0.9)',
  title: 'bold 60px monospace',
});

const save = loadSave();
const sfx = new Sfx();
sfx.on = save.sound;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const TOUCH = 0.05;

const scene = new THREE.Scene();
const shell = createShell({ scene, sfx, save, storeSave, stand: STAND, exposure: 1.4, statusPos: new THREE.Vector3(TANK.x, TANK.y + 0.5, TANK.z - 0.3), statusWidth: 0.7, hooks: {} });
const { renderer, camera, panel } = shell;
const world = buildWorld(scene, renderer);
shell.orbit.target.set(TANK.x, TANK.y - 0.1, TANK.z + 0.16);
shell.orbit.dist = 0.82; shell.orbit.pitch = 0.5; shell.orbit.keys = 'wasd'; shell.orbit.minPitch = 0.05; shell.orbit.maxPitch = 1.3;
const menuCam = (t) => ({ pos: new THREE.Vector3(Math.sin(t * 0.15) * 0.7, 1.45, 0.75), look: new THREE.Vector3(TANK.x, TANK.y, TANK.z) });

// ---------- Estado ----------
let app = 'menu', mode = 'match', st = null, ch = null, oppIndex = 0;
let phase = 'idle';          // 'intro' | 'player' | 'anim' | 'think' | 'over'
let time = 0, random = rng((Date.now() % 100000) + 1), robotRandom = rng(ROBOT_SEED);
let selSub = null, action = null, layer = 0, hover = null;
let reveals = [];            // blocos que ele revelou: { bx, bz, bd, age }
let lines = [], msg = null, chResult = null, timerAuto = 0;
let grab = null;             // girar o aquário: { entry, q0, t0 } (VR) ou { mouse, x, y } (PC)
const tankRot = { yaw: 0, pitch: 0 };
const timers = [];
const later = (sec, fn) => timers.push({ at: time + sec, fn });
const subMeshes = new Map();
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();
const opponent = () => CAPTAINS[oppIndex];
const oppName = () => (mode === 'match' ? opponent().name : 'Capitão Fixo');
const mine = () => (st ? alive(st, PLAYER) : []);
const label = (s) => (st.subs.filter(x => x.side === s.side).sort((a, b) => a.id - b.id).indexOf(s) + 1);
const say = (text, color = GREEN) => { lines.unshift({ text, color }); lines = lines.slice(0, 4); world.drawLog(lines); };
const worldOf = (c) => world.content.localToWorld(localOf(c));

// ---------- Submarinos na cena ----------
function clearAll() {
  for (const g of subMeshes.values()) world.content.remove(g);
  subMeshes.clear(); timers.length = 0; reveals = []; action = null; hover = null; grab = null;
  world.setGhosts([]); world.setReach([]); world.cursor.visible = false; world.setBlocks([]); world.setHeat(null);
}
function buildSubs() {
  for (const s of st.subs) {
    const own = s.side === PLAYER;
    const g = world.makeSub(s, label(s), own);
    localOf(s, g.position);
    g.rotation.y = own ? 0 : Math.PI;
    g.visible = own;
    world.content.add(g); subMeshes.set(s.id, g);
  }
}
function syncSubs() {
  for (const s of st.subs) {
    const g = subMeshes.get(s.id); if (!g) continue;
    if (s.side === PLAYER && s.alive) { g.userData.to = localOf(s); g.visible = true; }
    g.userData.ring.visible = s.side === PLAYER && s.alive && s.id === selSub && phase === 'player';
  }
}
function sinkSub(id) {
  const s = subById(st, id), g = subMeshes.get(id); if (!g) return;
  g.visible = true; localOf(s, g.position); g.userData.sinking = 0.001; world.wreck(g);
  world.bubbles(g.position, 14, 0.03);
}

// ---------- Partidas e desafios ----------
function newMatch(i) {
  mode = 'match';
  oppIndex = clamp(i, 0, CAPTAINS.length - 1);
  const layout = Math.floor(random() * LAYOUTS.length);
  st = newGame({ layout, random, starter: random() < 0.5 ? PLAYER : CPU });
  ch = null;
  startGame();
  say(`Mar: ${LAYOUTS[layout].name}. Contra ${opponent().name}.`, AMBER);
  say(st.starter === PLAYER ? 'Sorteio: você começa.' : `Sorteio: ${opponent().name} começa.`);
}
function newChallenge(i, skipIntro = false) {
  mode = 'challenge';
  const k = clamp(i, 0, CHALLENGES.length - 1);
  ch = { i: k };
  st = setupChallenge(CHALLENGES[k]);
  robotRandom = rng(ROBOT_SEED); chResult = null;
  startGame(true);
  say(`Desafio ${k + 1}: ${CHALLENGES[k].name}`, AMBER);
  if (skipIntro || dev.autoplay) { shell.hidePanel(); nextTurn(); } else { phase = 'intro'; showScreen('chIntro'); }
}
function startGame(noTurn = false) {
  app = 'play'; shell.hidePanel();
  clearAll();
  lines = []; world.drawLog([]);
  world.setRocks(st.rocks);
  buildSubs();
  tankRot.yaw = 0; tankRot.pitch = 0;
  layer = 0; world.setLayer(0);
  selSub = mine()[0]?.id ?? null;
  shell.orbit.menu = null; shell.orbit.snap = true;
  if (shell.vr && !rigPlaced) { shell.recenter(); rigPlaced = true; }
  updateHeat();
  if (!noTurn) nextTurn();
}
let rigPlaced = false;
function nextTurn() {
  if (st.over) { endOfGame(); return; }
  if (st.turn === CPU) {
    phase = 'think';
    later(mode === 'match' ? opponent().think : 0.8, () => cpuAct());
  } else {
    phase = 'player';
    if (!subById(st, selSub)?.alive) selSub = mine()[0]?.id ?? null;
    // escuta: algum dos seus ouviu hélice colada?
    const h = st.log[st.log.length - 1];
    if (h?.kind === 'hear' && h.to === PLAYER && h.priv.heard.length) {
      sfx.hear(); shell.pulseAll(0.4, 80);
      say(`Escuta: hélice colada no seu ${h.priv.heard.map(id => `submarino ${label(subById(st, id))}`).join(' e ')}!`, RED);
      msg = { text: 'Um inimigo está numa casa vizinha de um dos seus submarinos!', t: 3 };
    }
  }
  setAction(null);
  updateHint();
}
function cpuAct() {
  if (app !== 'play' || phase !== 'think' || st.over) return;
  const o = mode === 'match' ? chooseOrder(st, CPU, opponent(), random) : oppOrder(CHALLENGES[ch.i], st);
  play(o);
}
function play(o) {
  if (!isLegal(st, o)) return false;
  const who = st.turn;
  const before = st;
  const r = applyOrder(st, o);
  st = r.st;
  phase = 'anim';
  const dur = animate(r.ev, before);
  for (const rv of reveals) if (who === CPU) rv.age++;
  reveals = reveals.filter(x => x.age < 4);
  later(dur, () => { updateHeat(); nextTurn(); });
  updateHint();
  return true;
}
// mostra o que aconteceu; devolve quanto tempo leva
function animate(ev, before) {
  const by = ev.by;
  if (ev.kind === 'silent') {
    if (by === PLAYER) {
      if (ev.priv.action === 'move') {
        sfx.move();
        if (ev.priv.contact) { const k = ev.priv.contact; say(`Contato! O submarino ${label(subById(st, k.id))} dele está bem na frente (casa bloqueada).`, RED); sfx.alarm(); }
        else say(`Submarino ${label(subById(st, ev.priv.sub))} manobrou em silêncio.`);
      } else say('Você esperou em silêncio.');
      return 0.7;
    }
    say('Silêncio... ele manobrou ou esperou.', AMBER);
    return 0.6;
  }
  if (ev.kind === 'ping') {
    if (by === PLAYER) {
      const me = subById(st, ev.sub);
      world.wave(localOf(me), GREEN); sfx.ping();
      say(`Ping do seu ${label(me)}: ele agora sabe o seu bloco.`);
      for (const e of ev.priv.echoes) {
        const foe = subById(st, e.target);
        sfx.echo(worldOf(foe), 0.25 + e.band * 0.22);
        say(`Eco do ${label(foe)} dele: ${BANDS[e.band].split(' ')[0]}, ${e.dir < 0 ? 'logo ' + (e.vert < 0 ? 'acima' : 'abaixo') : `${DIR8[e.dir]}, ${VERT[e.vert]}`}`, AMBER);
      }
      return 1.3;
    }
    reveals.unshift({ ...ev.block, age: 0 });
    world.wave(localOf({ x: ev.block.bx * 2 + 0.5, z: ev.block.bz * 2 + 0.5, d: ev.block.bd * 2 + 0.5 }), RED); sfx.enemyPing();
    say(`Ping inimigo! O ${label(subById(st, ev.sub))} dele está no bloco vermelho. Ele ouviu os seus ecos.`, RED);
    msg = { text: 'Ele pingou: sabe mais ou menos onde você está. Bom momento para mudar de casa.', t: 3.5 };
    return 1.2;
  }
  // torpedo
  const from = by === PLAYER ? localOf(subById(before, ev.sub)) : localOf({ x: ev.block.bx * 2 + 0.5, z: ev.block.bz * 2 + 0.5, d: ev.block.bd * 2 + 0.5 });
  const to = localOf(ev.target);
  if (by === CPU) reveals.unshift({ ...ev.block, age: 0 });
  world.torpedo(from, to, 0.8); sfx.launch();
  later(0.8, () => {
    world.flash(to); world.bubbles(to, 12, 0.03);
    const near = ev.results.some(r => r.side === PLAYER);
    sfx.boom(near); shell.pulseAll(near ? 0.8 : 0.3, near ? 120 : 50);
    if (!ev.results.length) say(by === PLAYER ? 'Torpedo na água: nada por perto.' : 'Torpedo dele explodiu longe dos seus.', by === PLAYER ? GREEN : AMBER);
    for (const r of ev.results) {
      const s = subById(st, r.id), mineS = r.side === PLAYER;
      if (r.res === 'sunk') { sinkSub(r.id); sfx.sink(); say(mineS ? `Seu submarino ${label(s)} foi afundado!` : `Afundou o submarino ${label(s)} dele!`, mineS ? RED : GREEN); }
      else { if (mineS) { sfx.alarm(); const g = subMeshes.get(r.id); if (g) g.userData.shake = 0.6; } say(mineS ? `Seu submarino ${label(s)} foi avariado (casco 1)!` : `Avariou o submarino ${label(s)} dele!`, mineS ? RED : GREEN); }
    }
  });
  if (by === CPU) msg = { text: 'Torpedo! O bloco vermelho mostra de onde ele atirou.', t: 3 };
  return 1.9;
}
function endOfGame() {
  phase = 'over';
  // mostra onde estavam os que sobraram dele
  for (const s of alive(st, CPU)) { const g = subMeshes.get(s.id); if (g) { g.visible = true; localOf(s, g.position); } }
  if (mode === 'challenge') { finishChallenge(); return; }
  save.games[oppIndex]++;
  if (st.winner === PLAYER) { save.wins[oppIndex]++; sfx.fanfare(); } else if (st.winner === CPU) sfx.bad();
  storeSave(save);
  timerAuto = 3;
  showScreen('over');
  updateHint();
}
function finishChallenge() {
  const c = CHALLENGES[ch.i];
  const value = measure(c, st), stars = starsFor(c, value);
  chResult = { stars, value };
  save.ch[ch.i] = Math.max(save.ch[ch.i] || 0, stars);
  storeSave(save);
  for (let k = 0; k < stars; k++) later(0.25 * k, () => sfx.star(k));
  if (stars === 3) later(0.8, () => sfx.fanfare());
  timerAuto = 2.5;
  showScreen('chResult');
}
function goMenu() {
  app = 'menu'; phase = 'idle';
  shell.orbit.menu = menuCam; shell.orbit.snap = true;
  mode = 'match'; ch = null;
  st = newGame({ layout: 0, random: rng(4) });
  clearAll(); world.setRocks(st.rocks); buildSubs();
  lines = []; world.drawLog([{ text: 'SONAR PRONTO', color: GREEN }, { text: 'Escolha uma partida ou um desafio', color: AMBER }]);
  if (shell.vr) shell.recenter();
  showScreen('main');
  updateHint();
}
function togglePause() {
  if (app === 'play' && !panel.visible) { app = 'paused'; grab = null; showScreen('pause'); }
  else if (app === 'paused') { app = 'play'; shell.hidePanel(); }
  updateHint();
}

// ---------- Menus ----------
const challengeUnlocked = (i) => i === 0 || (save.ch[i - 1] || 0) >= 1;
function showScreen(name) {
  const vr = shell.vr;
  shell.showPanel((p) => {
    if (name === 'main') {
      p.title('Sonar', 72);
      p.text('Caça de submarinos num aquário: escute, pingue, atire', 512, 130, { size: 26, color: '#7fa890' });
      p.button('Partida contra o computador', () => showScreen('opponents'), 212, 172, 600, 92, { size: 36 });
      p.button('Desafios', () => showScreen('challenges'), 212, 280, 600, 80);
      p.button('Como jogar', () => showScreen('help'), 212, 376, 600, 80);
      p.button(`Som: ${save.sound ? 'sim' : 'não'}`, () => { save.sound = !save.sound; sfx.setOn(save.sound); storeSave(save); showScreen('main'); }, 212, 474, 190, 66, { size: 26 });
      p.button(`Mapa: ${save.preview ? 'sim' : 'não'}`, () => { save.preview = !save.preview; storeSave(save); updateHeat(); showScreen('main'); }, 417, 474, 190, 66, { size: 26 });
      p.button(`FPS: ${save.fps ? 'sim' : 'não'}`, () => { save.fps = !save.fps; storeSave(save); showScreen('main'); }, 622, 474, 190, 66, { size: 26 });
      const stars = Object.values(save.ch).reduce((a, b) => a + b, 0);
      p.text(`Vitórias: ${save.wins.reduce((a, b) => a + b, 0)}   ·   Estrelas nos desafios: ${stars} de ${CHALLENGES.length * 3}`, 512, 594, { size: 26, color: '#ffb347' });
      p.text(vr ? 'Aponte com o controle e aperte o gatilho' : 'No Quest: abra esta página no navegador do óculos e aperte "Entrar em VR"', 512, 656, { size: 22, color: '#7fa890' });
    } else if (name === 'opponents') {
      p.title('Escolha o capitão', 62);
      CAPTAINS.forEach((o, i) => p.button(`${o.name}  ·  ${o.title}`, () => newMatch(i), 72, 116 + i * 156, 880, 136, { size: 34, sub: o.desc.slice(0, o.desc.indexOf('.') + 1) }));
      p.text(`2 submarinos e ${TORPEDOES} torpedos para cada lado. Vitórias: ${save.wins.join(' / ')}`, 512, 600, { size: 24, color: '#7fa890' });
      p.button('Voltar', () => showScreen('main'), 362, 632, 300, 66, { size: 28 });
    } else if (name === 'challenges') {
      p.title('Desafios', 56);
      CHALLENGES.forEach((c, i) => p.tile(52 + (i % 5) * 186, 110 + Math.floor(i / 5) * 200, 172, 176, { num: i + 1, name: c.name, stars: save.ch[i] || 0, done: save.ch[i] != null, locked: !challengeUnlocked(i), action: () => newChallenge(i) }));
      p.text('Passe um desafio (1 estrela) para liberar o próximo.', 512, 540, { size: 24, color: '#7fa890' });
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 362, 600, 300, 70, { size: 30 });
    } else if (name === 'help') {
      p.title('Como jogar', 60);
      const rows = [
        'Cada lado tem 2 submarinos escondidos no aquário. Afunde os dois dele.',
        'Na sua vez, uma ordem para um submarino: mover 1 casa, ping, torpedo ou esperar.',
        'Ping: eco de cada inimigo (perto/médio/longe, rumo, mais fundo ou raso),',
        'mas ele descobre o bloco 2x2x2 onde você está. Torpedo também revela.',
        `Torpedo até ${RANGE} casas: acerto direto afunda, casa colada avaria (2 avarias afundam).`,
        'Escuta: se ele encostar num dos seus, você ouve a hélice. Rochas bloqueiam.',
        vr ? 'VR: aperte os botões da mesa; segure o aquário (botão lateral) para girar.' : 'PC: botões da mesa ou M, P, T, E; arraste o aquário para girar; roda = camada.',
        vr ? 'Torpedo: aponte numa casa da camada verde, ou toque a casa com a mão.' : 'Torpedo: escolha a camada (1 a 4 ou roda) e clique na casa. Esc: pausa.',
      ];
      rows.forEach((t, i) => p.text(t, 40, 124 + i * 54, { size: 23, align: 'left' }));
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 362, 586, 300, 80);
    } else if (name === 'pause') {
      p.title('Pausa', 66);
      p.text(mode === 'match' ? `Contra ${opponent().name} · ordem ${st.acts[PLAYER] + 1}` : `Desafio ${ch.i + 1}: ${CHALLENGES[ch.i].name}`, 512, 130, { size: 28, color: '#7fa890' });
      p.button('Continuar', () => togglePause(), 262, 176, 500, 84);
      p.button(mode === 'match' ? 'Recomeçar a partida' : 'Recomeçar o desafio', () => (mode === 'match' ? newMatch(oppIndex) : newChallenge(ch.i, true)), 262, 276, 500, 84);
      p.button('Como jogar', () => showScreen('help'), 262, 376, 245, 84, { size: 30 });
      p.button('Recentralizar', () => { togglePause(); shell.recenter(); }, 517, 376, 245, 84, { size: 30, locked: !vr });
      p.button('Menu principal', () => goMenu(), 262, 476, 500, 84);
    } else if (name === 'over') {
      const w = st.winner;
      p.title(w === PLAYER ? 'Vitória!' : w === CPU ? `${opponent().name} venceu` : 'Empate!', 72);
      p.text(`Submarinos: você ${alive(st, PLAYER).length} x ${alive(st, CPU).length} ${opponent().name}`, 512, 150, { size: 36, bold: true });
      p.text(`Suas ordens: ${st.acts[PLAYER]} · torpedos usados: ${TORPEDOES - st.torps[PLAYER]}`, 512, 208, { size: 26, color: '#7fa890' });
      p.text(`Contra ${opponent().name}: ${save.wins[oppIndex]} vitória(s) em ${save.games[oppIndex]} partida(s)`, 512, 256, { size: 24, color: '#7fa890' });
      p.button('Jogar de novo', () => newMatch(oppIndex), 262, 310, 500, 92, { size: 36 });
      p.button('Outro capitão', () => showScreen('opponents'), 262, 420, 500, 80);
      p.button('Menu principal', () => goMenu(), 262, 520, 500, 80);
    } else if (name === 'chIntro') {
      const c = CHALLENGES[ch.i];
      p.title(`Desafio ${ch.i + 1}: ${c.name}`, 62);
      const cut = c.desc.length > 70 ? c.desc.lastIndexOf(' ', 70) : -1;
      p.text(cut > 0 ? c.desc.slice(0, cut) : c.desc, 512, 140, { size: 25 });
      if (cut > 0) p.text(c.desc.slice(cut + 1), 512, 176, { size: 25 });
      p.text(`Você: ${c.subs.filter(s => s.side === PLAYER).length} submarino(s), ${c.torps} torpedos, até ${c.limit} ordens.`, 512, 222, { size: 23, color: '#7fa890' });
      p.text(goalText(c), 512, 266, { size: 21, color: '#ffb347' });
      p.button('Começar', () => { shell.hidePanel(); nextTurn(); }, 262, 320, 500, 96, { size: 38 });
      p.button('Desafios', () => showScreen('challenges'), 262, 440, 500, 80);
    } else if (name === 'chResult') {
      const c = CHALLENGES[ch.i];
      p.title(chResult.stars ? 'Desafio cumprido!' : 'Não foi dessa vez', 66);
      p.stars(chResult.stars, 512, 160, 80);
      p.text(chResult.value === Infinity ? 'Não afundou todos a tempo' : `${metricName(c)}: ${chResult.value}`, 512, 232, { size: 30, bold: true });
      p.text(goalText(c), 512, 276, { size: 21, color: '#7fa890' });
      p.text(`Melhor: ${save.ch[ch.i] || 0} estrela(s)`, 512, 314, { size: 24 });
      p.button('Tentar de novo', () => newChallenge(ch.i, true), 262, 350, 245, 84, { size: 30 });
      p.button('Próximo', () => newChallenge(ch.i + 1), 517, 350, 245, 84, { size: 30, locked: ch.i >= CHALLENGES.length - 1 || !challengeUnlocked(ch.i + 1) });
      p.button('Desafios', () => showScreen('challenges'), 262, 454, 500, 80);
      p.button('Menu principal', () => goMenu(), 262, 554, 500, 80);
    }
  });
  updateHint();
}

// ---------- Ordens do jogador ----------
const canAct = () => app === 'play' && phase === 'player' && !panel.visible;
const canHuman = () => canAct() && !dev.autoplay;
function setAction(a) {
  action = a;
  const s = subById(st || { subs: [] }, selSub);
  world.setGhosts(a === 'move' && s ? moveTargets(st, s) : []);
  world.setReach(a === 'torpedo' && s ? torpedoTargets(st, s).filter(c => c.d === layer) : []);
  world.cursor.visible = false;
}
function selectSub(id) {
  if (!canHuman()) return;
  const s = subById(st, id);
  if (!s || s.side !== PLAYER || !s.alive) { sfx.deny(); return; }
  selSub = id; sfx.pick(); setAction(action);
}
function setLayer(d) { layer = clamp(d, 0, ND - 1); world.setLayer(layer); if (action === 'torpedo') setAction('torpedo'); }
function press(id) {
  if (!canHuman()) { if (id === 'up' || id === 'down') setLayer(layer + (id === 'up' ? -1 : 1)); return; }
  sfx.click();
  if (id === 'sub1' || id === 'sub2') { const s = st.subs.filter(x => x.side === PLAYER).sort((a, b) => a.id - b.id)[id === 'sub1' ? 0 : 1]; if (s) selectSub(s.id); }
  else if (id === 'up' || id === 'down') setLayer(layer + (id === 'up' ? -1 : 1));
  else if (id === 'move') setAction(action === 'move' ? null : 'move');
  else if (id === 'torpedo') { if (st.torps[PLAYER] <= 0) { sfx.deny(); msg = { text: 'Sem torpedos.', t: 2 }; return; } setAction(action === 'torpedo' ? null : 'torpedo'); }
  else if (id === 'ping') play({ type: 'ping', sub: selSub });
  else if (id === 'wait') play({ type: 'wait', sub: selSub });
}
function moveTo(c) { if (canHuman() && action === 'move') play({ type: 'move', sub: selSub, ...c }); }
function fireAt(c) {
  if (!canHuman() || action !== 'torpedo' || !c) return false;
  const o = { type: 'torpedo', sub: selSub, ...c };
  if (!isLegal(st, o)) { sfx.deny(); msg = { text: `Fora do alcance (até ${RANGE} casas do submarino escolhido) ou rocha.`, t: 2.5 }; return false; }
  return play(o);
}

// ---------- Entrada ----------
function pickables() {
  const out = [];
  for (const b of Object.values(world.buttons)) out.push(b.mesh, b.cap);
  for (const g of world.ghosts) if (g.visible) out.push(g);
  for (const s of mine()) { const g = subMeshes.get(s.id); if (g) out.push(g.userData.mesh); }
  if (action === 'torpedo') out.push(world.layerPlane);
  return out;
}
function activate(hit) {
  const ud = hit.object.userData;
  if (ud.kind === 'button') press(ud.id);
  else if (ud.kind === 'moveTo') moveTo(ud);
  else if (ud.kind === 'sub') selectSub(ud.id);
  else if (ud.kind === 'layer') fireAt(cellAtLocal(world.content.worldToLocal(hit.point.clone())));
}
function rayPick(rc) { const hits = rc.intersectObjects(pickables(), false); return hits.find(h => h.object.userData.kind !== 'layer' || action === 'torpedo') || null; }
function nearTank(p) { const l = world.tank.worldToLocal(p.clone()); return Math.abs(l.x) < SIZE.x / 2 + 0.08 && Math.abs(l.y) < SIZE.y / 2 + 0.08 && Math.abs(l.z) < SIZE.z / 2 + 0.08; }
function insideTank(p) { const l = world.content.worldToLocal(p.clone()); return Math.abs(l.x) < SIZE.x / 2 && Math.abs(l.y) < SIZE.y / 2 && Math.abs(l.z) < SIZE.z / 2 ? l : null; }
// tocar com a mão/controle: botão perto, alvo de mover, casa do torpedo; senão, segurar o aquário
function touch(e) {
  const p = shell.grabPoint(e);
  let best = null, bd = TOUCH;
  for (const b of Object.values(world.buttons)) { b.mesh.getWorldPosition(_v); const d = _v.distanceTo(p); if (d < bd) { bd = d; best = { object: b.mesh }; } }
  for (const g of world.ghosts) if (g.visible) { g.getWorldPosition(_v); const d = _v.distanceTo(p); if (d < C * 0.6 && d < bd) { bd = d; best = { object: g }; } }
  if (best) { activate(best); shell.pulse(e, 0.3, 20); return true; }
  const l = insideTank(p);
  if (l && action === 'torpedo' && canHuman()) { if (fireAt(cellAtLocal(l))) shell.pulse(e, 0.5, 40); return true; }
  if (l && canHuman()) { const c = cellAtLocal(l); const s = c && mine().find(x => x.x === c.x && x.z === c.z && x.d === c.d); if (s) { selectSub(s.id); return true; } }
  if (nearTank(p)) { grab = { entry: e, q0: e.grip.getWorldQuaternion(new THREE.Quaternion()).invert(), t0: world.tank.quaternion.clone() }; sfx.pick(); return true; }
  return false;
}
const hooks = {
  tick,
  pause: () => togglePause(),
  squeezeStart: (e) => { if (!e.isHand) touch(e); },
  squeezeEnd: (e) => { if (grab?.entry === e) grab = null; },
  selectStart: (e) => {
    if (e.isHand && touch(e)) return;
    const h = rayPick(shell.entryRay(e));
    if (h) activate(h);
  },
  selectEnd: (e) => { if (grab?.entry === e) grab = null; },
  disconnected: (e) => { if (grab?.entry === e) grab = null; },
  sessionStart: () => { rigPlaced = false; updateHint(); },
  sessionEnd: () => { grab = null; updateHint(); },
  pointerDown: (e) => {
    const h = rayPick(shell.mouseRay());
    if (h) { activate(h); return; }
    grab = { mouse: true, x: e.clientX, y: e.clientY };
  },
  pointerMove: (e) => {
    if (grab?.mouse && shell.mouse.left) {
      tankRot.yaw += (e.clientX - grab.x) * 0.01; tankRot.pitch = clamp(tankRot.pitch + (e.clientY - grab.y) * 0.008, -1.1, 1.1);
      grab.x = e.clientX; grab.y = e.clientY;
    }
  },
  pointerUp: () => { if (grab?.mouse) grab = null; },
  wheel: (dy) => { if (app === 'play' && !panel.visible) { setLayer(layer + (dy > 0 ? 1 : -1)); return true; } return false; },
  button: () => { if (canHuman()) setLayer((layer + 1) % ND); },
  key: (k) => {
    if (k === 'm') { press('move'); return true; }
    if (k === 'p') { press('ping'); return true; }
    if (k === 't') { press('torpedo'); return true; }
    if (k === 'e') { press('wait'); return true; }
    if (k === 'tab') { const ss = mine(); if (ss.length > 1 && canHuman()) selectSub(ss.find(s => s.id !== selSub).id); return true; }
    if (k >= '1' && k <= '4') { setLayer(+k - 1); return true; }
    if (k === 'r') { tankRot.yaw = 0; tankRot.pitch = 0; return true; }
    if (k === 'enter' && action === 'torpedo' && hover) { fireAt(hover); return true; }
    if (k === 'escape' && action && app === 'play' && !panel.visible) { setAction(null); return true; }
    return false;
  },
};
Object.assign(shell.hooks, hooks);

// ---------- Visual por quadro ----------
let heatGrid = null;
function updateHeat() {
  if (!st || app === 'menu' || !save.preview) { world.setHeat(null); heatGrid = null; return; }
  // o mapa mostra só o que você sabe (a mesma conta que a IA faz, do seu lado)
  const bel = beliefFrom(viewFor(st, PLAYER));
  const g = new Float64Array(NX * NZ * ND);
  for (const [id, grid] of Object.entries(bel.grids)) if (!bel.dead.has(+id)) for (let i = 0; i < g.length; i++) g[i] += grid[i];
  heatGrid = g; world.setHeat(g);
}
let stickT = 0;
function updateInput(dt) {
  // aquário: girar com a mão (VR) ou com o mouse (PC)
  if (grab?.entry) {
    const q = grab.entry.grip.getWorldQuaternion(_q);
    world.tank.quaternion.copy(q).multiply(grab.q0).multiply(grab.t0);
    const e = new THREE.Euler().setFromQuaternion(world.tank.quaternion, 'YXZ');
    tankRot.yaw = e.y; tankRot.pitch = e.x;
  } else world.tank.quaternion.setFromEuler(new THREE.Euler(tankRot.pitch, tankRot.yaw, 0, 'YXZ'));
  world.tank.updateMatrixWorld(true);
  // manche (VR): cima/baixo troca de camada
  stickT -= dt;
  for (const e of shell.ctrls) { if (!e.source || e.isHand) continue; const y = e.axes[1]; if (Math.abs(y) > 0.7 && stickT <= 0) { setLayer(layer + (y > 0 ? 1 : -1)); stickT = 0.35; } }
  // cursor do torpedo
  hover = null;
  if (action === 'torpedo' && canHuman()) {
    let rc = null;
    if (shell.vr) { for (const e of shell.ctrls) if (e.source) { rc = shell.entryRay(e); const h = rc.intersectObject(world.layerPlane)[0]; if (h) { hover = cellAtLocal(world.content.worldToLocal(h.point.clone())); e.laserLen = h.distance; } } }
    else { const h = shell.mouseRay().intersectObject(world.layerPlane)[0]; if (h) hover = cellAtLocal(world.content.worldToLocal(h.point.clone())); }
  }
  world.cursor.visible = !!hover;
  if (hover) { localOf(hover, world.cursor.position); const ok = isLegal(st, { type: 'torpedo', sub: selSub, ...hover }); world.cursor.material.color.set(ok ? RED : '#6a6a6a'); }
  if (shell.vr && canHuman()) for (const e of shell.ctrls) { if (!e.source || e.laserLen) continue; const h = rayPick(shell.entryRay(e)); if (h) e.laserLen = h.distance; }
}
function animateSubs(dt) {
  for (const g of subMeshes.values()) {
    const u = g.userData;
    if (u.sinking > 0) {
      u.sinking += dt;
      g.position.y = Math.max(-SIZE.y / 2 + 0.012, g.position.y - dt * 0.05);
      g.rotation.z = Math.min(0.6, u.sinking * 0.4);
      continue;
    }
    if (u.to) g.position.lerp(u.to, Math.min(1, dt * 5));
    g.userData.mesh.position.y = Math.sin(time * 1.4 + u.id) * 0.0015;
    if (u.shake > 0) { u.shake -= dt; g.userData.mesh.position.x = Math.sin(time * 70) * 0.003 * u.shake; } else g.userData.mesh.position.x = 0;
    u.ring.rotation.y += dt;
  }
}
function updateButtons() {
  const on = canAct();
  const ss = st ? st.subs.filter(x => x.side === PLAYER).sort((a, b) => a.id - b.id) : [];
  ['sub1', 'sub2'].forEach((id, k) => { const s = ss[k]; world.drawButton(id, { text: s ? `Sub ${k + 1}` : '—', sub: s ? (s.alive ? `casco ${s.hp}` : 'afundou') : '', on: !!s && s.id === selSub && on, off: !s || !s.alive }); });
  world.drawButton('move', { text: 'Mover', on: action === 'move', off: !on });
  world.drawButton('ping', { text: 'Ping', off: !on });
  world.drawButton('torpedo', { text: 'Torpedo', sub: st ? `${st.torps[PLAYER]} de ${mode === 'challenge' ? CHALLENGES[ch.i].torps : TORPEDOES}` : '', on: action === 'torpedo', off: !on || !st || st.torps[PLAYER] <= 0 });
  world.drawButton('wait', { text: 'Esperar', off: !on });
  world.drawButton('up', { text: 'Subir', sub: `camada ${layer + 1}` });
  world.drawButton('down', { text: 'Descer', sub: 'de 4' });
}
function updateHint() {
  let t;
  if (app !== 'play' || panel.visible) t = 'Clique nas opções do painel';
  else if (phase !== 'player') t = 'Arraste o aquário para girar · botão direito: câmera · Esc: pausa';
  else if (action === 'torpedo') t = 'Torpedo: escolha a camada (1 a 4 ou roda do mouse) e clique na casa · Esc cancela · arraste para girar';
  else if (action === 'move') t = 'Mover: clique num cubo verde · Esc cancela';
  else t = 'Botões da mesa ou teclas: M mover, P ping, T torpedo, E esperar, Tab troca o submarino · arraste o aquário para girar · R endireita';
  shell.setHint(t);
}
function statusLines() {
  const who = phase === 'player' ? 'Sua vez: dê uma ordem a um submarino' : phase === 'think' ? `${oppName()} está pensando...` : '';
  if (mode === 'challenge') { const c = CHALLENGES[ch.i]; return { a: `Desafio ${ch.i + 1}: ${c.name} · ordem ${st.acts[PLAYER] + (phase === 'player' ? 1 : 0)} de ${c.limit} · torpedos ${st.torps[PLAYER]}`, b: who }; }
  return { a: `Contra ${opponent().name} · seus ${alive(st, PLAYER).length} x ${alive(st, CPU).length} dele · torpedos ${st.torps[PLAYER]} · camada ${layer + 1}`, b: who };
}
let boardKey = '';
function updateBoard() {
  let d;
  if (!st || app === 'menu') d = { title: 'SONAR', line: 'caça de submarinos' };
  else if (mode === 'challenge') d = { title: `DESAFIO ${ch.i + 1}`, line: `ordens ${st.acts[PLAYER]}/${CHALLENGES[ch.i].limit} · alvos ${alive(st, CPU).length}` };
  else d = { title: `VOCÊ ${alive(st, PLAYER).length} x ${alive(st, CPU).length} ${opponent().name.split(' ').pop().toUpperCase()}`, line: `torpedos ${st.torps[PLAYER]} x ${st.torps[CPU]} · ordem ${st.acts[PLAYER]}` };
  const k = JSON.stringify(d); if (k !== boardKey) { boardKey = k; world.drawBoard(d); }
}
let blocksKey = '';
function tick(dt) {
  const paused = app === 'paused';
  if (!paused) {
    time += dt;
    for (let i = 0; i < timers.length; i++) if (timers[i].at <= time) { const t = timers.splice(i, 1)[0]; i--; t.fn(); }
    if (app === 'play' && st) {
      if (phase === 'player' && dev.autoplay) robotTurn(dt);
      else if (phase === 'over' && dev.autoplay && mode === 'match') { timerAuto -= dt; if (timerAuto <= 0) newMatch(oppIndex); }
    }
  }
  updateInput(dt);
  if (st) { syncSubs(); updateButtons(); }
  const bk = JSON.stringify(reveals); if (bk !== blocksKey) { blocksKey = bk; world.setBlocks(reveals); }
  animateSubs(paused ? 0 : dt);
  shell.showPinch = app === 'play';
  world.animate(paused ? 0 : dt, time);
  const head = camera.getWorldPosition(_v);
  sfx.setListener(head, new THREE.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(_q)), new THREE.Vector3(0, 1, 0).applyQuaternion(_q));
  if (msg) { msg.t -= dt; if (msg.t <= 0) msg = null; }
  shell.setStatus(app === 'play' && st ? { ...statusLines(), msg: msg?.text } : null);
  updateBoard();
}
let robotT = 0;
function robotTurn(dt) {
  robotT += dt;
  if (robotT < 0.25) return;
  robotT = 0;
  const o = mode === 'challenge' ? robotOrder(st, robotRandom) : chooseOrder(st, PLAYER, CAPTAINS[2], random);
  play(o);
}

// ---------- Depuração (console do navegador) ----------
// dev.autoplay = true   o robô joga por você      dev.advance(5)   avança 5 s na hora
// dev.state()           resumo                    dev.cheat()      onde estão os submarinos dele
// dev.loadLevel(3)      abre o desafio 3 (1 a 10)  dev.startMatch(2) partida contra o capitão 2 (1 a 3)
// dev.win()             ganha a partida/desafio    dev.screenOf('ping' | { ghost: k } | { cell: { x, z, d } } | { sub: id } | 'vazio')
// dev.resetSave()       apaga o progresso
const dev = {
  _auto: false,
  get autoplay() { return this._auto; },
  set autoplay(v) { this._auto = !!v; grab = null; },
  loadLevel(n) { newChallenge(n - 1, true); return this.state(); },
  startMatch(n = 1) { newMatch(n - 1); return this.state(); },
  advance(sec, stepT = 1 / 60) {
    const frames = Math.round(sec / stepT);
    for (let i = 0; i < frames; i++) shell.step(stepT);
    shell.resetClock(); shell.render();
    return this.state();
  },
  cheat() { return st ? alive(st, CPU).map(s => ({ id: s.id, x: s.x, z: s.z, d: s.d, casco: s.hp })) : null; },
  win() {
    if (mode === 'challenge' && ch) { st = solveChallenge(CHALLENGES[ch.i]).st; timers.length = 0; for (const s of st.subs) if (!s.alive) sinkSub(s.id); endOfGame(); }
    else if (mode === 'match' && st) { timers.length = 0; for (const s of st.subs) if (s.side === CPU) { s.alive = false; s.hp = 0; } st.over = true; st.winner = PLAYER; endOfGame(); }
    return this.state();
  },
  screenOf(what) {
    let p;
    if (what === 'vazio') return { x: 30, y: 200 };
    if (typeof what === 'string') p = world.buttons[what].mesh.getWorldPosition(new THREE.Vector3());
    else if (what.ghost != null) p = world.ghosts[what.ghost].getWorldPosition(new THREE.Vector3());
    else if (what.cell) p = worldOf(what.cell);
    else if (what.sub) p = subMeshes.get(what.sub).getWorldPosition(new THREE.Vector3());
    p.project(camera);
    return { x: (p.x + 1) / 2 * window.innerWidth, y: (1 - p.y) / 2 * window.innerHeight };
  },
  state() {
    const base = { tela: app, modo: mode, fase: phase, painel: panel.visible };
    if (!st || app === 'menu') return base;
    return {
      ...base,
      adversario: mode === 'match' ? opponent().name : null,
      desafio: mode === 'challenge' ? `${ch.i + 1}: ${CHALLENGES[ch.i].name}` : null,
      vez: st.turn === PLAYER ? 'você' : 'ele', ordens: st.acts.slice(), torpedos: st.torps.slice(),
      seus: alive(st, PLAYER).map(s => ({ id: s.id, x: s.x, z: s.z, d: s.d, casco: s.hp })), deles: alive(st, CPU).length,
      escolhido: selSub, acao: action, camada: layer + 1, alvo: hover, giro: { yaw: +tankRot.yaw.toFixed(2), pitch: +tankRot.pitch.toFixed(2) },
      ultimoEco: sfx.lastEcho, blocos: reveals.length, mensagens: lines.map(l => l.text),
      pontos: mode === 'challenge' ? measure(CHALLENGES[ch.i], st) : null,
      estrelas: mode === 'challenge' && chResult ? chResult.stars : null,
      vencedor: mode === 'match' && st.over && phase === 'over' ? (st.winner === PLAYER ? 'você' : st.winner === CPU ? opponent().name : 'empate') : null,
      salvo: { vitorias: save.wins, desafios: save.ch },
    };
  },
  resetSave() { save.wins = [0, 0, 0]; save.games = [0, 0, 0]; save.ch = {}; storeSave(save); },
};
window.dev = dev;
window.sonar = { dev, get st() { return st; }, get challenge() { return ch; }, get heat() { return heatGrid; }, save, sfx, camera, scene, renderer, world, shell, subs: subMeshes, worldOf };
void cheb; void cellOf;

goMenu();
shell.start();
