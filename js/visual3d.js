// visual3d.js - utilidades de acabamento visual para Three.js r170 (jogos web do Eduardo).
// Copiar para <Projeto>/js/visual3d.js. O import abaixo segue a estrutura padrão dos projetos
// (js/ ao lado de vendor/three/). Tudo funciona no WebXR (Quest) e no modo PC.
import * as THREE from '../vendor/three/three.module.js';

// Renderer com cor certa, tone mapping e sombra suave. ehQuest baixa a resolução interna.
export function configurarRenderer(renderer, { ehQuest = false, exposicao = 1.0, tonemap = 'agx' } = {}) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = { agx: THREE.AgXToneMapping, aces: THREE.ACESFilmicToneMapping,
    neutro: THREE.NeutralToneMapping }[tonemap] ?? THREE.AgXToneMapping;
  renderer.toneMappingExposure = exposicao;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = ehQuest ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, ehQuest ? 1 : 2));
  if (renderer.xr) {
    renderer.xr.setFoveation?.(ehQuest ? 1 : 0);
  }
  return renderer;
}

// Céu em gradiente (zênite, horizonte, chão) com sol desenhado. Fica sempre atrás de tudo.
export function ceuGradiente({ zenite = '#3d6fb6', horizonte = '#f2c79a', chao = '#6b5a4a',
  dirSol = new THREE.Vector3(0.5, 0.35, -0.8), corSol = '#fff1d0', tamanhoSol = 0.035, raio = 900 } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      zen: { value: new THREE.Color(zenite) }, hor: { value: new THREE.Color(horizonte) },
      chao: { value: new THREE.Color(chao) }, sol: { value: dirSol.clone().normalize() },
      corSol: { value: new THREE.Color(corSol) }, tam: { value: tamanhoSol },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position);
      vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 zen, hor, chao, sol, corSol; uniform float tam; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); float y = d.y;
        vec3 c = y > 0.0 ? mix(hor, zen, 1.0 - pow(1.0 - y, 10.0)) : mix(hor, chao, 1.0 - pow(1.0 + y, 8.0));
        float a = dot(d, sol);
        c += corSol * (smoothstep(1.0 - tam*0.02, 1.0 - tam*0.012, a) * 3.0   // disco
                    + pow(max(a, 0.0), 64.0) * 0.6 + pow(max(a, 0.0), 6.0) * 0.12); // halo
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const ceu = new THREE.Mesh(new THREE.SphereGeometry(raio, 48, 24), mat);
  ceu.renderOrder = -1000; ceu.frustumCulled = false;
  return ceu;
}

// Mapa de ambiente gerado do próprio céu: dá reflexo e luz indireta com direção a todo material
// MeshStandard/MeshPhysical. Chamar uma vez (ou ao trocar de fase). Barato em tempo de jogo.
export function ambienteDoCeu(renderer, scene, opcoesCeu = {}, intensidade = 1.0) {
  const cena = new THREE.Scene();
  const ceu = ceuGradiente({ ...opcoesCeu, raio: 50 });
  ceu.material = ceu.material.clone();
  ceu.material.fragmentShader = ceu.material.fragmentShader
    .replace('#include <tonemapping_fragment>', '').replace('#include <colorspace_fragment>', '');
  cena.add(ceu);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(cena, 0.04);
  pmrem.dispose();
  scene.environment = rt.texture;
  scene.environmentIntensity = intensidade;
  return rt;
}

// Sol com sombra recortada em volta da área jogável (raioArea em metros, centrado em alvo).
export function solPrincipal(scene, { cor = '#ffe2b8', intensidade = 2.6, dir = new THREE.Vector3(0.5, 0.35, -0.8),
  alvo = new THREE.Vector3(), raioArea = 12, mapa = 2048 } = {}) {
  const sol = new THREE.DirectionalLight(cor, intensidade);
  sol.position.copy(alvo).addScaledVector(dir.clone().normalize(), raioArea * 3);
  sol.target.position.copy(alvo);
  sol.castShadow = true;
  const c = sol.shadow.camera;
  c.left = c.bottom = -raioArea; c.right = c.top = raioArea;
  c.near = 0.5; c.far = raioArea * 6;
  sol.shadow.mapSize.set(mapa, mapa);
  sol.shadow.bias = -0.0004; sol.shadow.normalBias = 0.02;
  sol.shadow.radius = 3;
  scene.add(sol, sol.target);
  return sol;
}

// Luz de preenchimento com céu e chão de cores diferentes (sombra fria, rebatida quente).
export function luzCeuChao(scene, { ceu = '#9cc3ff', chao = '#a08060', intensidade = 0.6 } = {}) {
  const h = new THREE.HemisphereLight(ceu, chao, intensidade);
  scene.add(h);
  return h;
}

// Neblina na cor do horizonte (passe a mesma cor usada no céu).
export function neblina(scene, cor = '#f2c79a', inicio = 20, fim = 180) {
  scene.fog = new THREE.Fog(cor, inicio, fim);
  return scene.fog;
}

// Caixa com cantos arredondados (chanfro): a aresta pega luz e some a "cara de protótipo".
// k = segmentos por curva (2 no Quest, 3-4 no PC). Normais suaves já calculadas.
export function caixaArredondada(w = 1, h = 1, d = 1, r = 0.05, k = 3) {
  const n = 2 * k + 1;
  const g = new THREE.BoxGeometry(1, 1, 1, n, n, n);
  const half = [w / 2, h / 2, d / 2];
  r = Math.max(0.0001, Math.min(r, ...half));
  const pos = g.attributes.position, nor = g.attributes.normal;
  const v = new THREE.Vector3(), dir = new THREE.Vector3(), inner = [0, 0, 0], a = [0, 0, 0];
  for (let idx = 0; idx < pos.count; idx++) {
    v.fromBufferAttribute(pos, idx);
    for (let ax = 0; ax < 3; ax++) {
      const i = Math.round((v.getComponent(ax) + 0.5) * n);
      if (i <= k) { inner[ax] = -(half[ax] - r); a[ax] = -(1 - i / k); }
      else { inner[ax] = half[ax] - r; a[ax] = (i - (k + 1)) / k; }
    }
    dir.set(a[0], a[1], a[2]).normalize();
    pos.setXYZ(idx, inner[0] + dir.x * r, inner[1] + dir.y * r, inner[2] + dir.z * r);
    nor.setXYZ(idx, dir.x, dir.y, dir.z);
  }
  pos.needsUpdate = nor.needsUpdate = true;
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

// Escurece a base da peça por cor de vértice (oclusão falsa no contato com o chão).
// O material precisa de vertexColors: true. forca 0..1.
export function escurecerBase(geo, { altura = 0.4, forca = 0.45, topo = 1.0 } = {}) {
  geo.computeBoundingBox();
  const y0 = geo.boundingBox.min.y, pos = geo.attributes.position;
  const cores = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.smoothstep(pos.getY(i) - y0, 0, altura);
    const f = THREE.MathUtils.lerp(1 - forca, topo, t);
    cores[i * 3] = cores[i * 3 + 1] = cores[i * 3 + 2] = f;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cores, 3));
  return geo;
}

// Varia cor de cada instância de um InstancedMesh (matiz, saturação e brilho).
export function variarCores(mesh, corBase, { matiz = 0.02, sat = 0.06, luz = 0.07, semente = 1 } = {}) {
  let s = semente; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const base = new THREE.Color(corBase), hsl = {}, c = new THREE.Color();
  base.getHSL(hsl);
  for (let i = 0; i < mesh.count; i++) {
    c.setHSL((hsl.h + rnd() * matiz + 1) % 1, THREE.MathUtils.clamp(hsl.s + rnd() * sat, 0, 1),
      THREE.MathUtils.clamp(hsl.l + rnd() * luz, 0, 1));
    mesh.setColorAt(i, c);
  }
  mesh.instanceColor.needsUpdate = true;
  return mesh;
}

function texturaRadial(stops) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const ctx = cv.getContext('2d'), gr = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [p, c] of stops) gr.addColorStop(p, c);
  ctx.fillStyle = gr; ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let _texSombra, _texHalo;

// Sombra de contato macia embaixo de um objeto (mais barata que sombra real, soma com ela).
export function sombraContato(largura = 1, profundidade = largura, opacidade = 0.45) {
  _texSombra ??= texturaRadial([[0, 'rgba(0,0,0,1)'], [0.5, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0)']]);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(largura, profundidade),
    new THREE.MeshBasicMaterial({ map: _texSombra, transparent: true, opacity: opacidade, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.003; m.renderOrder = 1;
  return m;
}

// Halo aditivo: o "bloom" que funciona no WebXR. Pôr em lâmpadas, cristais, tiros, sol.
export function halo(cor = '#ffd27a', tamanho = 1, forca = 1) {
  _texHalo ??= texturaRadial([[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,255,255,0.45)'],
    [0.5, 'rgba(255,255,255,0.1)'], [1, 'rgba(255,255,255,0)']]);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: _texHalo, color: new THREE.Color(cor).multiplyScalar(forca),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  s.scale.setScalar(tamanho);
  return s;
}

// Espalha props com variação de escala/rotação num InstancedMesh (chão nunca vazio).
// pontoValido(x, z) opcional para não pôr nada em cima da área de jogo.
export function espalhar(geo, mat, quantos, { raio = 20, raioMin = 0, escala = [0.6, 1.4], semente = 7,
  pontoValido = null, alturaY = 0, sombra = false } = {}) {
  let s = semente; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const mesh = new THREE.InstancedMesh(geo, mat, quantos);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const e = new THREE.Euler();
  let n = 0, tent = 0;
  while (n < quantos && tent++ < quantos * 20) {
    const ang = rnd() * Math.PI * 2, rr = Math.sqrt(THREE.MathUtils.lerp(raioMin ** 2 / raio ** 2, 1, rnd())) * raio;
    const x = Math.cos(ang) * rr, z = Math.sin(ang) * rr;
    if (pontoValido && !pontoValido(x, z)) continue;
    const k = THREE.MathUtils.lerp(escala[0], escala[1], rnd());
    q.setFromEuler(e.set((rnd() - 0.5) * 0.3, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.3));
    m.compose(p.set(x, alturaY, z), q, sc.set(k, k * THREE.MathUtils.lerp(0.8, 1.2, rnd()), k));
    mesh.setMatrixAt(n++, m);
  }
  mesh.count = n;
  mesh.castShadow = sombra; mesh.receiveShadow = true;
  return mesh;
}
