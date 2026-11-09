// Fumaça do main.js: carrega o jogo inteiro no Node com um navegador de mentira (sem WebGL, sem som)
// e confere menu, partida (clique do PC, teclas, controle de VR de mentira), robô e desafios. Não toca som.
import * as nodeModule from 'node:module';

// ---- navegador de mentira ----
function fakeCtx() {
  const fn = () => proxy;
  const proxy = new Proxy(fn, {
    get(_, k) {
      if (k === 'measureText') return (t) => ({ width: String(t).length * 12 });
      if (k === 'canvas') return null;
      return fn;
    },
    set() { return true; },
    apply() { return proxy; },
  });
  return proxy;
}
function fakeElement(tag = 'div') {
  const listeners = {};
  return {
    tagName: tag.toUpperCase(), style: {}, dataset: {}, children: [], textContent: '', innerHTML: '', width: 300, height: 150,
    listeners,
    addEventListener(t, f) { (listeners[t] ||= []).push(f); },
    removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    getContext() { return fakeCtx(); },
    setPointerCapture() {}, releasePointerCapture() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; },
    dispatch(t, e) { for (const f of listeners[t] || []) f(e); },
  };
}
export function installDom() {
  const els = {};
  const winListeners = {};
  const store = new Map();
  const doc = {
    createElement: (t) => fakeElement(t),
    createElementNS: (_, t) => fakeElement(t),
    getElementById: (id) => (els[id] ||= fakeElement('div')),
    body: fakeElement('body'),
    addEventListener() {},
  };
  const win = {
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, isSecureContext: false,
    addEventListener(t, f) { (winListeners[t] ||= []).push(f); },
    removeEventListener() {},
    dispatch(t, e) { for (const f of winListeners[t] || []) f(e); },
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  };
  globalThis.window = win;
  globalThis.document = doc;
  globalThis.self = win;
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node-teste' }, configurable: true, writable: true });
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  globalThis.requestAnimationFrame = win.requestAnimationFrame;
  globalThis.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };
  return { els, win, store };
}

// Troca só o WebGLRenderer do Three.js por um de mentira (o resto do Three.js é o de verdade).
export function installThreeStub() {
  const stub = new URL('./three-stub.js', import.meta.url).href;
  const resolve = (spec, ctx, next) => {
    if (spec.endsWith('vendor/three/three.module.js') && !String(ctx.parentURL || '').endsWith('three-stub.js')) return { url: stub, shortCircuit: true };
    return next(spec, ctx);
  };
  if (nodeModule.registerHooks) nodeModule.registerHooks({ resolve });
  else throw new Error('Node sem module.registerHooks (precisa do Node 22.15 ou mais novo)');
}

export async function smoke() {
  const out = [];
  const ok = (c, m) => out.push([!!c, m]);
  const { els, win, store } = installDom();
  installThreeStub();
  const errors = [];
  const origErr = console.error;
  console.error = (...a) => errors.push(a.join(' '));
  await import('../js/main.js');
  const dev = window.dev;
  const G = window.sonar;
  const THREE = await import('../vendor/three/three.module.js');
  ok(dev && typeof dev.advance === 'function', 'main.js carregou e criou window.dev');
  let s = dev.advance(0.5);
  ok(s.tela === 'menu' && s.painel, 'abre no menu principal');
  ok(els.vr.textContent.includes('VR'), `botão de VR avisa que não tem VR aqui ("${els.vr.textContent}")`);
  const canvasEl = G.renderer.domElement;
  const click = (what) => { const p = dev.screenOf(what); canvasEl.dispatch('pointermove', { clientX: p.x, clientY: p.y }); dev.advance(0.02); canvasEl.dispatch('pointerdown', { clientX: p.x, clientY: p.y, button: 0 }); win.dispatch('pointerup', {}); return dev.advance(0.02); };
  const key = (k) => { win.dispatch('keydown', { key: k }); win.dispatch('keyup', { key: k }); return dev.advance(0.02); };
  const myTurn = () => { for (let i = 0; i < 200 && dev.state().fase !== 'player' && !dev.state().vencedor; i++) dev.advance(0.25); return dev.advance(0.05); };

  s = dev.startMatch(1);
  dev.advance(0.1);
  const own = G.st.subs.filter(x => x.side === 0), foes = G.st.subs.filter(x => x.side === 1);
  ok(s.tela === 'play' && s.seus.length === 2 && s.deles === 2, 'partida contra o Capitão Arpão: 2 submarinos de cada lado');
  ok(own.every(x => G.subs.get(x.id).visible) && foes.every(x => !G.subs.get(x.id).visible), 'os seus aparecem no aquário, os dele não');
  s = myTurn();
  ok(s.fase === 'player', 'chega a sua vez');
  // ping pelo botão da mesa: eco em áudio 3D vindo da posição real dele
  const foesNow = G.st.subs.filter(x => x.side === 1 && x.alive);
  const nBefore = G.sfx.echoes.length;
  s = click('ping');
  const newEchoes = G.sfx.echoes.slice(nBefore);
  ok(G.st.log.some(e => e.kind === 'ping' && e.by === 0), 'clicar no botão Ping pinga');
  const real = foesNow.map(f => G.worldOf(f));
  ok(newEchoes.length === foesNow.length && newEchoes.every((e, k) => Math.hypot(e.x - real[k].x, e.y - real[k].y, e.z - real[k].z) < 1e-6), `um eco 3D por inimigo, saindo da posição real dele no aquário (${newEchoes.length})`);
  ok(s.mensagens.filter(m => m.startsWith('Eco do')).length === foesNow.length, 'a tela da mesa mostra um eco por inimigo');
  ok(G.heat && G.world.heat.count > 0, `mapa de suspeita aparece no aquário (${G.world.heat.count} pontos)`);
  // girar o aquário arrastando no PC
  s = myTurn();
  const g0 = s.giro.yaw;
  const pv = dev.screenOf('vazio');
  canvasEl.dispatch('pointerdown', { clientX: pv.x, clientY: pv.y, button: 0 });
  canvasEl.dispatch('pointermove', { clientX: pv.x + 80, clientY: pv.y + 20 });
  win.dispatch('pointerup', {});
  s = dev.advance(0.05);
  ok(Math.abs(s.giro.yaw - g0) > 0.5, `arrastar gira o aquário (${g0} -> ${s.giro.yaw})`);
  key('r'); s = dev.advance(0.05);
  ok(s.giro.yaw === 0, 'R endireita o aquário');
  // mover pelo botão e cubo verde
  if (s.fase === 'player') {
    const sub = s.seus.find(x => x.id === s.escolhido);
    s = click('move');
    ok(s.acao === 'move' && G.world.ghosts.some(g => g.visible), 'botão Mover mostra os cubos verdes');
    const gi = G.world.ghosts.findIndex(g => g.visible);
    const target = { ...G.world.ghosts[gi].userData };
    s = click({ ghost: gi });
    const moved = G.st.subs.find(x => x.id === sub.id);
    ok(moved.x === target.x && moved.z === target.z && moved.d === target.d, 'clicar no cubo verde move o submarino');
  } else ok(false, 'não era a sua vez para mover');
  // torpedo: tecla T, camada pela tecla e clique na casa
  s = myTurn();
  if (s.fase === 'player') {
    const me = s.seus.find(x => x.id === s.escolhido);
    const t = { x: me.x, z: Math.max(0, me.z - 2), d: me.d };
    if (t.z === me.z) t.z = me.z + 1;
    key('t');
    key(String(t.d + 1));
    s = dev.advance(0.05);
    ok(s.acao === 'torpedo' && s.camada === t.d + 1, `T escolhe torpedo e a tecla ${t.d + 1} a camada`);
    const before = G.st.torps[0];
    s = click({ cell: t });
    ok(G.st.torps[0] === before - 1 && G.st.log.some(e => e.kind === 'torpedo' && e.by === 0), 'clicar na casa da camada dispara o torpedo');
  } else ok(false, 'não era a sua vez para o torpedo');
  // VR (controle de mentira): segurar o aquário e girar o pulso gira o aquário; tocar o botão com a mão
  s = myTurn();
  const entry = G.shell.ctrls[1];
  entry.source = { handedness: 'right', gamepad: { buttons: [], axes: [0, 0, 0, 0] } };
  entry.side = 'right';
  const rigInv = new THREE.Matrix4().copy(G.shell.rig.matrixWorld).invert();
  const setGrab = (p) => { entry.grip.position.copy(p.clone().add(new THREE.Vector3(0, 0.02, 0.04)).applyMatrix4(rigInv)); entry.ctrl.position.copy(entry.grip.position); entry.grip.quaternion.identity(); G.shell.rig.updateMatrixWorld(true); };
  const tankCorner = G.world.tank.localToWorld(new THREE.Vector3(0.24, 0.0, 0.24));
  setGrab(tankCorner);
  G.shell.hooks.squeezeStart(entry);
  entry.grip.quaternion.setFromEuler(new THREE.Euler(0, 0.8, 0)); G.shell.rig.updateMatrixWorld(true);
  s = dev.advance(0.05);
  ok(Math.abs(s.giro.yaw - 0.8) < 0.05, `VR: segurar o aquário e girar a mão gira junto (${s.giro.yaw})`);
  G.shell.hooks.squeezeEnd(entry);
  entry.grip.quaternion.identity();
  if (s.fase === 'player') {
    const n0 = G.st.log.filter(e => e.kind === 'ping' && e.by === 0).length;
    setGrab(G.world.buttons.ping.mesh.getWorldPosition(new THREE.Vector3()));
    G.shell.hooks.squeezeStart(entry);
    s = dev.advance(0.05);
    G.shell.hooks.squeezeEnd(entry);
    ok(G.st.log.filter(e => e.kind === 'ping' && e.by === 0).length === n0 + 1, 'VR: tocar o botão Ping com a mão pinga');
  } else ok(false, 'não era a sua vez para o VR');
  entry.source = null; entry.side = null;

  // o resto da partida o robô joga
  dev.autoplay = true;
  let guard = 0;
  while (!dev.state().vencedor && guard++ < 4000) s = dev.advance(0.25);
  s = dev.state();
  ok(s.vencedor, `partida terminou sozinha (vencedor: ${s.vencedor}, ordens ${s.ordens?.join(' x ')})`);
  ok(JSON.parse(store.get('sonarvr.v1') || '{"games":[]}').games[0] === 1, 'resultado salvo no localStorage');

  // Desafios pelo mesmo caminho do menu
  const C = await import('../js/challenges.js');
  const stars = [];
  let loadedOk = true;
  for (let n = 1; n <= C.CHALLENGES.length; n++) {
    s = dev.loadLevel(n);
    if (G.subs.size !== C.CHALLENGES[n - 1].subs.length) loadedOk = false;
    let g = 0;
    while (dev.state().estrelas == null && g++ < 1500) dev.advance(0.25);
    stars.push(dev.state().estrelas);
  }
  ok(loadedOk, 'cada desafio aparece montado (submarinos certos)');
  ok(stars.every(x => x === 3), `robô tira 3 estrelas nos ${C.CHALLENGES.length} desafios dentro do jogo (${stars.join(' ')})`);
  ok(Object.keys(JSON.parse(store.get('sonarvr.v1') || '{"ch":{}}').ch).length === C.CHALLENGES.length, 'estrelas dos desafios salvas');

  dev.autoplay = false;
  dev.loadLevel(10);
  s = dev.win();
  ok(s.estrelas === 3, 'dev.win() resolve o desafio');
  dev.startMatch(3);
  ok(dev.cheat() && dev.cheat().length === 2, 'dev.cheat() mostra onde estão os dele');
  s = dev.win();
  ok(s.vencedor === 'você', 'dev.win() ganha a partida');

  dev.startMatch(2);
  dev.advance(0.2);
  win.dispatch('keydown', { key: 'Escape' });
  ok(dev.state().tela === 'paused', 'Esc pausa');
  win.dispatch('keydown', { key: 'Escape' });
  ok(dev.state().tela === 'play', 'Esc de novo continua');
  const loop = G.renderer._loop;
  for (let i = 0; i < 5; i++) loop?.(performance.now() + i * 16);
  ok(typeof loop === 'function', 'laço de animação ligado');
  console.error = origErr;
  ok(errors.length === 0, `sem erros no console (${errors.slice(0, 2).join(' | ')})`);
  return out;
}
