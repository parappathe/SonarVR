// Casca comum do jogo: render, câmera, VR (controles e mãos), mouse e teclado, painel de menu,
// placas de status, FPS e o laço principal. O jogo (main.js) só cuida das regras e da cena dele,
// recebendo os eventos pelos "hooks".
import * as THREE from '../vendor/three/three.module.js';
import { Panel, Label } from './ui.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (k, dt) => 1 - Math.exp(-k * dt);

export function createShell({ scene, sfx, save, storeSave, stand, hooks = {}, panelWidth = 0.9, exposure = 1.05, statusPos, statusWidth = 0.62, shadows = false }) {
  const IS_QUEST = /OculusBrowser|Quest/i.test(navigator.userAgent || '');
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: !IS_QUEST });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_QUEST ? 1 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  if (shadows && renderer.shadowMap) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  renderer.xr.setFoveation?.(1);
  document.getElementById('app').appendChild(renderer.domElement);

  const rig = new THREE.Group();
  scene.add(rig);
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.03, 60);
  rig.add(camera);
  const UP = new THREE.Vector3(0, 1, 0);

  const panel = new Panel(panelWidth);
  const fpsLabel = new Label(0.12);
  fpsLabel.mesh.position.set(0.16, -0.14, -0.6);
  fpsLabel.mesh.visible = false;
  camera.add(fpsLabel.mesh);
  const statusLabel = new Label(statusWidth, 1024, 200);
  if (statusPos) statusLabel.mesh.position.copy(statusPos);
  statusLabel.mesh.rotation.x = -0.12;
  statusLabel.mesh.visible = false;
  scene.add(statusLabel.mesh);

  const raycaster = new THREE.Raycaster();
  const shell = {
    renderer, scene, camera, rig, panel, statusLabel, raycaster, IS_QUEST, hooks,
    ctrls: [], mouse: { ndc: new THREE.Vector2(-9, -9), right: false, left: false, lx: 0, ly: 0, x: 0, y: 0 },
    keys: new Set(), time: 0, fps: 0,
    orbit: { yaw: 0, pitch: 0.75, dist: 1.3, target: new THREE.Vector3(0, 0.9, -0.5), minPitch: 0.2, maxPitch: 1.4, minDist: 0.6, maxDist: 2.6, keys: true, snap: true, menu: null },
    get vr() { return renderer.xr.isPresenting; },
    showPinch: false,
  };

  // ---------- Painel ----------
  function fitPC() {
    if (renderer.xr.isPresenting) return;
    const aspect = window.innerWidth / window.innerHeight;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (panel.mesh.parent !== camera) camera.add(panel.mesh);
    const half = THREE.MathUtils.degToRad(camera.fov / 2);
    const visH = 2 * 0.8 * Math.tan(half), visW = visH * aspect;
    panel.mesh.position.set(0, 0, -0.8);
    panel.mesh.quaternion.identity();
    const h = panelWidth * 720 / 1024;
    panel.mesh.scale.setScalar(Math.min(1, visW * 0.94 / panelWidth, visH * 0.92 / h));
  }
  function placePanelVR() {
    const head = new THREE.Vector3(), hq = new THREE.Quaternion();
    camera.getWorldPosition(head);
    camera.getWorldQuaternion(hq);
    const yaw = new THREE.Euler().setFromQuaternion(hq, 'YXZ').y;
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    panel.mesh.position.copy(head).addScaledVector(fwd, 0.95);
    panel.mesh.position.y = head.y - 0.05;
    panel.mesh.rotation.set(0, yaw, 0);
  }
  shell.showPanel = (drawFn) => { if (renderer.xr.isPresenting) placePanelVR(); panel.show(drawFn); };
  shell.hidePanel = () => panel.hide();

  // Põe a cabeça do jogador no ponto (x, z), olhando na direção yaw (0 = para -z).
  function placeRig(x, z, yaw = 0) {
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    rig.rotation.set(0, yaw - e.y, 0);
    const head = camera.position.clone().setY(0).applyAxisAngle(UP, rig.rotation.y);
    rig.position.set(x - head.x, 0, z - head.z);
    rig.updateMatrixWorld(true);
  }
  shell.placeRig = placeRig;
  shell.recenter = () => { if (renderer.xr.isPresenting) placeRig(stand.x, stand.z, stand.yaw || 0); };

  // ---------- Controles do VR ----------
  const markMat = new THREE.MeshStandardMaterial({ color: 0xf0c27a, roughness: 0.3, metalness: 0.5 });
  const laserMat = new THREE.LineBasicMaterial({ color: 0xffffff });
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffe08a });
  const laserGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
  for (let i = 0; i < 2; i++) {
    const ctrl = renderer.xr.getController(i);
    const grip = renderer.xr.getControllerGrip(i);
    const hand = renderer.xr.getHand ? renderer.xr.getHand(i) : null;
    rig.add(ctrl, grip);
    if (hand) rig.add(hand);
    const laser = new THREE.Line(laserGeo, laserMat);
    laser.visible = false;
    ctrl.add(laser);
    const mark = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), markMat);
    grip.add(mark);
    const pinchDot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 6), dotMat);
    pinchDot.visible = false;
    scene.add(pinchDot);
    const entry = {
      i, ctrl, grip, hand, laser, mark, pinchDot, source: null, side: null, prevButtons: [], hoverIndex: -1,
      trigger: false, squeeze: false, axes: [0, 0], laserLen: 0,
      get isHand() { return !!this.source?.hand; },
    };
    shell.ctrls.push(entry);
    ctrl.addEventListener('connected', (e) => { entry.source = e.data; entry.side = e.data.handedness; });
    ctrl.addEventListener('disconnected', () => { hooks.disconnected?.(entry); entry.source = null; entry.side = null; });
    ctrl.addEventListener('selectstart', () => {
      entry.trigger = true;
      sfx.unlock();
      if (panel.visible) {
        const a = entry.hoverIndex >= 0 ? panel.actionAt(entry.hoverIndex) : null;
        if (a) { sfx.click(); a(); }
        entry.menuClick = true;
        return;
      }
      entry.menuClick = false;
      hooks.selectStart?.(entry);
    });
    ctrl.addEventListener('selectend', () => { entry.trigger = false; if (!entry.menuClick) hooks.selectEnd?.(entry); entry.menuClick = false; });
    ctrl.addEventListener('squeezestart', () => { entry.squeeze = true; sfx.unlock(); if (!panel.visible) hooks.squeezeStart?.(entry); });
    ctrl.addEventListener('squeezeend', () => { entry.squeeze = false; hooks.squeezeEnd?.(entry); });
  }
  shell.entryFor = (side) => shell.ctrls.find(e => e.side === side && e.source);
  shell.pulse = (entryOrSide, v, ms) => {
    const e = typeof entryOrSide === 'string' ? shell.entryFor(entryOrSide) : entryOrSide;
    try { e?.source?.gamepad?.hapticActuators?.[0]?.pulse?.(clamp(v, 0, 1), ms); } catch { /* sem vibração */ }
  };
  shell.pulseAll = (v, ms) => { for (const e of shell.ctrls) shell.pulse(e, v, ms); };

  const _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _off = new THREE.Vector3();
  // Ponto de pegar: no controle, a empunhadura; nas mãos, o meio entre o polegar e o indicador.
  shell.grabPoint = (entry, out = new THREE.Vector3()) => {
    if (entry.isHand && entry.hand?.joints) {
      const a = entry.hand.joints['index-finger-tip'], b = entry.hand.joints['thumb-tip'];
      if (a && b && a.visible !== false) {
        a.getWorldPosition(out); b.getWorldPosition(_v2);
        return out.add(_v2).multiplyScalar(0.5);
      }
    }
    entry.grip.getWorldPosition(out);
    if (!entry.isHand) out.add(_off.set(0, -0.02, -0.04).applyQuaternion(entry.grip.getWorldQuaternion(_q)));
    return out;
  };
  // Raio do controle (ou da mão): origem e direção no mundo.
  shell.entryRay = (entry) => {
    entry.ctrl.getWorldPosition(_v2);
    entry.ctrl.getWorldQuaternion(_q);
    raycaster.set(_v2, new THREE.Vector3(0, 0, -1).applyQuaternion(_q));
    return raycaster;
  };
  // Direção para onde o controle aponta, no plano do chão (para escolher direção de peça).
  shell.entryYaw = (entry) => {
    entry.ctrl.getWorldQuaternion(_q);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(_q);
    return Math.atan2(-f.x, -f.z);
  };

  function pollButtons(dt) {
    for (const e of shell.ctrls) {
      const gp = e.source?.gamepad;
      if (!gp || e.isHand) { e.axes[0] = e.axes[1] = 0; continue; }
      const b = gp.buttons.map(x => x.pressed);
      if (b[5] && !e.prevButtons[5]) hooks.pause?.();    // B ou Y
      for (const k of [4]) if (b[k] && !e.prevButtons[k]) hooks.button?.(e, k);   // A ou X
      e.prevButtons = b;
      e.axes[0] = gp.axes?.[2] ?? 0;
      e.axes[1] = gp.axes?.[3] ?? 0;
    }
  }

  // ---------- Mouse e teclado ----------
  const mouse = shell.mouse, keys = shell.keys;
  const setNdc = (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.ndc.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1); };
  shell.mouseRay = () => { raycaster.setFromCamera(mouse.ndc, camera); return raycaster; };
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault?.());
  // evento disparado por script (testes, ferramentas) não liga o som: só clique e tecla de verdade
  const realInput = (e) => e.isTrusted !== false;
  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (realInput(e)) sfx.unlock();
    setNdc(e);
    if (e.button === 2) { mouse.right = true; mouse.lx = e.clientX; mouse.ly = e.clientY; return; }
    if (panel.visible) {
      const a = panel.actionAt(panel.pick(shell.mouseRay().intersectObject(panel.mesh)[0]?.uv));
      if (a) { sfx.click(); a(); }
      return;
    }
    if (renderer.xr.isPresenting) return;
    mouse.left = true;
    hooks.pointerDown?.(e);
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    setNdc(e);
    if (mouse.right && shell.orbit.keys !== 'locked') {
      shell.orbit.yaw -= (e.clientX - mouse.lx) * 0.006;
      shell.orbit.pitch = clamp(shell.orbit.pitch + (e.clientY - mouse.ly) * 0.004, shell.orbit.minPitch, shell.orbit.maxPitch);
      mouse.lx = e.clientX; mouse.ly = e.clientY;
    }
    hooks.pointerMove?.(e);
  });
  window.addEventListener('pointerup', (e) => { mouse.right = false; if (mouse.left) { mouse.left = false; if (!panel.visible) hooks.pointerUp?.(e); } });
  renderer.domElement.addEventListener('wheel', (e) => {
    e.preventDefault?.();
    if (hooks.wheel?.(e.deltaY)) return;
    shell.orbit.dist = clamp(shell.orbit.dist + e.deltaY * 0.001, shell.orbit.minDist, shell.orbit.maxDist);
  }, { passive: false });
  window.addEventListener('blur', () => { keys.clear(); mouse.right = false; mouse.left = false; hooks.blur?.(); });
  window.addEventListener('keydown', (e) => {
    if (realInput(e)) sfx.unlock();
    const k = (e.key || '').toLowerCase();
    if (hooks.key?.(k, e)) return;
    if (k === 'escape' || k === 'p') { hooks.pause?.(); return; }
    if (k === 'f') { save.fps = !save.fps; storeSave(save); return; }
    keys.add(k);
  });
  window.addEventListener('keyup', (e) => { const k = (e.key || '').toLowerCase(); keys.delete(k); hooks.keyUp?.(k, e); });
  window.addEventListener('resize', () => { renderer.setSize(window.innerWidth, window.innerHeight); fitPC(); });

  // ---------- Câmera do PC (órbita em volta do alvo) ----------
  const pcCam = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  function updatePCCamera(dt) {
    if (renderer.xr.isPresenting) return;
    const o = shell.orbit;
    if (o.keys === true) {
      if (keys.has('a') || keys.has('arrowleft')) o.yaw += 1.4 * dt;
      if (keys.has('d') || keys.has('arrowright')) o.yaw -= 1.4 * dt;
      if (keys.has('w') || keys.has('arrowup')) o.pitch = clamp(o.pitch + 0.8 * dt, o.minPitch, o.maxPitch);
      if (keys.has('s') || keys.has('arrowdown')) o.pitch = clamp(o.pitch - 0.8 * dt, o.minPitch, o.maxPitch);
    } else if (o.keys === 'wasd') {
      if (keys.has('a')) o.yaw += 1.4 * dt;
      if (keys.has('d')) o.yaw -= 1.4 * dt;
      if (keys.has('w')) o.pitch = clamp(o.pitch + 0.8 * dt, o.minPitch, o.maxPitch);
      if (keys.has('s')) o.pitch = clamp(o.pitch - 0.8 * dt, o.minPitch, o.maxPitch);
    }
    let pos, look;
    if (o.menu) ({ pos, look } = o.menu(shell.time));
    else {
      look = o.target;
      pos = new THREE.Vector3(o.target.x + Math.sin(o.yaw) * Math.cos(o.pitch) * o.dist, o.target.y + Math.sin(o.pitch) * o.dist, o.target.z + Math.cos(o.yaw) * Math.cos(o.pitch) * o.dist);
    }
    if (o.snap) { pcCam.pos.copy(pos); pcCam.look.copy(look); o.snap = false; }
    pcCam.pos.lerp(pos, damp(6, dt));
    pcCam.look.lerp(look, damp(6, dt));
    camera.position.copy(pcCam.pos);
    camera.lookAt(pcCam.look);
  }

  // ---------- Sessão VR ----------
  let recenterIn = 0;
  renderer.xr.addEventListener('sessionstart', () => {
    recenterIn = 5;
    if (panel.mesh.parent) panel.mesh.parent.remove(panel.mesh);
    scene.add(panel.mesh);
    panel.mesh.scale.setScalar(1);
    hooks.sessionStart?.();
  });
  renderer.xr.addEventListener('sessionend', () => {
    rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
    camera.position.set(0, 1.6, 0.5); camera.quaternion.identity();
    shell.orbit.snap = true;
    fitPC();
    hooks.sessionEnd?.();
  });

  // ---------- Raios dos menus e lasers ----------
  function updateRays() {
    const vr = renderer.xr.isPresenting;
    let hover = -1;
    for (const e of shell.ctrls) {
      e.hoverIndex = -1;
      if (!vr || !e.source) { e.laser.visible = false; e.laserLen = 0; continue; }
      if (panel.visible) {
        const hit = shell.entryRay(e).intersectObject(panel.mesh)[0];
        e.laser.visible = true;
        e.laser.scale.z = hit ? hit.distance : 2;
        e.hoverIndex = panel.pick(hit?.uv);
        if (e.hoverIndex >= 0) hover = e.hoverIndex;
      } else {
        e.laser.visible = e.laserLen > 0;
        if (e.laserLen > 0) e.laser.scale.z = e.laserLen;
      }
      e.laserLen = 0;
    }
    if (!vr && panel.visible) {
      hover = panel.pick(shell.mouseRay().intersectObject(panel.mesh)[0]?.uv);
      renderer.domElement.style.cursor = hover >= 0 && panel.actionAt(hover) ? 'pointer' : 'default';
    }
    if (panel.visible) panel.setHover(hover);
  }

  // ---------- HUD (PC: caixa de texto; VR: placa acima da mesa) ----------
  const hintEl = document.getElementById('hint');
  const hudEl = document.getElementById('hud');
  const fpsEl = document.getElementById('fps');
  shell.setHint = (t) => {
    const html = renderer.xr.isPresenting || !t ? '' : `<span>${t}</span>`;
    if (hintEl.dataset.last !== html) { hintEl.innerHTML = html; hintEl.dataset.last = html; }
  };
  // status: null (escondido) ou { a, b, msg }
  shell.setStatus = (s) => {
    const vr = renderer.xr.isPresenting;
    const show = !!s && !panel.visible;
    if (!vr) {
      statusLabel.mesh.visible = false;
      hudEl.style.display = show ? 'block' : 'none';
      if (show) {
        const html = `<b>${s.a}</b>${s.b ? `<br>${s.b}` : ''}${s.msg ? `<br><em>${s.msg}</em>` : ''}`;
        if (hudEl.dataset.last !== html) { hudEl.innerHTML = html; hudEl.dataset.last = html; }
      }
      return;
    }
    hudEl.style.display = 'none';
    statusLabel.mesh.visible = show;
    if (show) statusLabel.set([{ text: s.a, size: 0.34, color: '#ffe7a8' }, { text: s.msg || s.b || '', size: 0.3, bold: false }]);
  };

  // ---------- Botão de VR ----------
  const vrBtn = document.getElementById('vr');
  (async () => {
    const ok = navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
    if (!ok) {
      vrBtn.textContent = window.isSecureContext ? 'VR não disponível neste navegador' : 'VR precisa de HTTPS';
      vrBtn.disabled = true;
      return;
    }
    vrBtn.textContent = 'Entrar em VR';
    vrBtn.disabled = false;
    vrBtn.onclick = async () => {
      sfx.unlock();
      if (renderer.xr.isPresenting) { renderer.xr.getSession()?.end(); return; }
      try {
        const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
        await renderer.xr.setSession(session);
        vrBtn.textContent = 'Sair do VR';
        session.addEventListener('end', () => { vrBtn.textContent = 'Entrar em VR'; });
      } catch (err) {
        vrBtn.textContent = 'Erro ao entrar em VR';
        console.error(err);
      }
    };
  })();

  // ---------- Laço ----------
  let lastT = performance.now();
  let fpsFrames = 0, fpsTime = 0;
  shell.step = (dt) => {
    shell.time += dt;
    const vr = renderer.xr.isPresenting;
    if (recenterIn > 0 && --recenterIn === 0) { shell.recenter(); if (panel.visible) placePanelVR(); hooks.recentered?.(); }
    pollButtons(dt);
    rig.updateMatrixWorld(true);
    hooks.tick?.(dt);
    updatePCCamera(dt);
    updateRays();
    for (const e of shell.ctrls) {
      e.mark.visible = vr && !!e.source && !e.isHand;
      e.pinchDot.visible = vr && e.isHand && shell.showPinch && !panel.visible;
      if (e.pinchDot.visible) shell.grabPoint(e, e.pinchDot.position);
    }
    sfx.updateAmbience?.(dt);
    fpsFrames++; fpsTime += dt;
    if (fpsTime >= 0.5) {
      shell.fps = Math.round(fpsFrames / fpsTime);
      fpsFrames = 0; fpsTime = 0;
      fpsEl.style.display = save.fps && !vr ? 'block' : 'none';
      fpsEl.textContent = `${shell.fps} FPS`;
      fpsLabel.mesh.visible = save.fps && vr;
      fpsLabel.set(`${shell.fps} FPS`);
    }
  };
  shell.render = () => renderer.render(scene, camera);
  shell.resetClock = () => { lastT = performance.now(); };
  shell.start = () => {
    fitPC();
    renderer.setAnimationLoop(() => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      shell.step(dt);
      shell.render();
    });
  };
  shell.fitPC = fitPC;
  return shell;
}
