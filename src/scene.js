import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createNoise2D } from 'simplex-noise';

/* ------------------------------------------------------------------ */
/*  Palette                                                           */
/* ------------------------------------------------------------------ */
const C = {
  night: new THREE.Color('#070b14'),
  fog: new THREE.Color('#0a0f1c'),
  cream: new THREE.Color('#f2ebdd'),
  accent: new THREE.Color('#ff5a36'),
  gold: new THREE.Color('#f5b861'),
  sea: new THREE.Color('#25365a'),
};

// deterministic random
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(7);
const noise2D = createNoise2D(rand);
const fbm = (x, y) => {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < 4; i++) { v += a * noise2D(x * f, y * f); f *= 2.03; a *= 0.5; }
  return v;
};
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const damp = (a, b, l, dt) => THREE.MathUtils.lerp(a, b, 1 - Math.exp(-l * dt));

/* ------------------------------------------------------------------ */
/*  Route                                                             */
/* ------------------------------------------------------------------ */
export const WAYPOINTS = [
  { name: 'Napoli', code: 'NAP', x: 0, z: 0 },
  { name: 'Capri', code: 'Isola', x: 34, z: 72 },
  { name: 'Stromboli', code: 'Vulcano', x: -12, z: 168 },
  { name: 'Palermo', code: 'PMO', x: -104, z: 232 },
  { name: 'Cagliari', code: 'CAG', x: -236, z: 168 },
];
const ALT = 15;

/* ------------------------------------------------------------------ */
/*  Fuselage livery texture                                           */
/* ------------------------------------------------------------------ */
function fuselageProfile() {
  // [radius, axial z]  from tail (-) to nose (+)
  return [
    [0.0, -5.3], [0.1, -5.22], [0.22, -4.95], [0.36, -4.4], [0.48, -3.7], [0.57, -2.9],
    [0.62, -2.1], [0.62, -1.0], [0.62, 0.0], [0.62, 1.0], [0.62, 2.0], [0.62, 3.0],
    [0.61, 3.55], [0.58, 4.0], [0.52, 4.42], [0.43, 4.78], [0.31, 5.05], [0.17, 5.24], [0.0, 5.32],
  ];
}

function liveryTexture(profile) {
  const W = 2048, H = 1024;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const n = profile.length - 1;
  // z -> v (piecewise linear on lathe index)
  const zToV = (z) => {
    for (let i = 0; i < n; i++) {
      const a = profile[i][1], b = profile[i + 1][1];
      if (z >= a && z <= b) return (i + (z - a) / (b - a)) / n;
    }
    return z < profile[0][1] ? 0 : 1;
  };
  const Y = (z) => (1 - zToV(z)) * H; // canvas y for axial z
  const X = (u) => u * W;

  // base
  g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, W, H);
  // navy belly (u around 0 / 1 is bottom)
  g.fillStyle = '#101a2e';
  g.fillRect(X(0), 0, X(0.16), H);
  g.fillRect(X(0.84), 0, X(0.16), H);
  // accent cheatline
  g.fillStyle = '#ff5a36';
  g.fillRect(X(0.16), 0, X(0.022), H);
  g.fillRect(X(0.818), 0, X(0.022), H);
  g.fillStyle = '#f5b861';
  g.fillRect(X(0.182), 0, X(0.006), H);
  g.fillRect(X(0.812), 0, X(0.006), H);

  // windows (XL "Panorama" windows)
  const winRow = [0.272, 0.728];
  g.fillStyle = '#0b1322';
  for (let z = 2.75; z > -2.85; z -= 0.27) {
    for (const u of winRow) {
      const y0 = Y(z + 0.075), y1 = Y(z - 0.075);
      const w = X(0.036);
      const r = Math.min(w, Math.abs(y1 - y0)) * 0.45;
      g.beginPath();
      g.roundRect(X(u) - w / 2, Math.min(y0, y1), w, Math.abs(y1 - y0), r);
      g.fill();
    }
  }
  // doors
  g.strokeStyle = 'rgba(16,26,46,.45)'; g.lineWidth = 3;
  for (const z of [3.45, -3.05]) {
    for (const u of winRow) {
      const y0 = Y(z + 0.17), y1 = Y(z - 0.17);
      g.beginPath();
      g.roundRect(X(u) - X(0.06), Math.min(y0, y1), X(0.12), Math.abs(y1 - y0), 8);
      g.stroke();
    }
  }
  // cockpit windows
  g.fillStyle = '#0a111e';
  const cz0 = 4.42, cz1 = 4.72;
  const panes = [[0.36, 0.42], [0.43, 0.49], [0.51, 0.57], [0.58, 0.64]];
  for (const [u0, u1] of panes) {
    g.beginPath();
    g.moveTo(X(u0), Y(cz0)); g.lineTo(X(u1), Y(cz0));
    g.lineTo(X(u1 - 0.008), Y(cz1)); g.lineTo(X(u0 + 0.008), Y(cz1));
    g.closePath(); g.fill();
  }

  // brand name along both sides (text runs along the fuselage axis)
  const drawName = (u, flip) => {
    g.save();
    const yMid = Y(0.15);
    g.translate(X(u), yMid);
    g.rotate(flip ? -Math.PI / 2 : Math.PI / 2);
    g.fillStyle = '#101a2e';
    g.font = '600 64px "Space Grotesk Variable", "Space Grotesk", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if ('letterSpacing' in g) g.letterSpacing = '22px';
    g.fillText('ALTURA', 0, 0);
    g.restore();
  };
  drawName(0.355, false);
  drawName(0.645, true);

  // subtle panel lines
  g.strokeStyle = 'rgba(16,26,46,.08)'; g.lineWidth = 2;
  for (let z = -4; z < 4.2; z += 0.9) { g.beginPath(); g.moveTo(0, Y(z)); g.lineTo(W, Y(z)); g.stroke(); }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function tailLogoTexture() {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 512;
  const g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 512, 0, 0);
  grd.addColorStop(0, '#ff5a36'); grd.addColorStop(1, '#f5b861');
  g.fillStyle = grd; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = '#f2ebdd'; g.lineWidth = 34; g.lineCap = 'round';
  g.beginPath(); g.moveTo(110, 360); g.quadraticCurveTo(256, 60, 402, 360); g.stroke();
  g.fillStyle = '#101a2e';
  g.beginPath(); g.arc(256, 330, 36, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------------ */
/*  Procedural airliner                                               */
/* ------------------------------------------------------------------ */
function surfaceGeo(pts, depth, bevel = 0.03) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(s, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 8,
  });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

function buildPlane() {
  const plane = new THREE.Group();
  const profile = fuselageProfile();

  const white = new THREE.MeshPhysicalMaterial({ color: 0xf4f1ea, roughness: 0.3, metalness: 0.12, clearcoat: 1, clearcoatRoughness: 0.12 });
  const navy = new THREE.MeshPhysicalMaterial({ color: 0x101a2e, roughness: 0.38, metalness: 0.35, clearcoat: 0.7 });
  const accent = new THREE.MeshPhysicalMaterial({ color: 0xff5a36, roughness: 0.32, metalness: 0.1, clearcoat: 1 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xc4c9d2, roughness: 0.22, metalness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x07090f, roughness: 0.7, metalness: 0.2 });

  /* fuselage */
  const fusGeo = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), 72);
  fusGeo.rotateX(Math.PI / 2); // lathe axis Y -> Z (nose +Z)
  const pos = fusGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const f = smooth(-1.6, -5.3, z); // upswept tail cone
    pos.setY(i, pos.getY(i) * (1 - 0.3 * f) + 0.36 * f);
    const fn = smooth(3.4, 5.32, z); // nose droop
    pos.setY(i, pos.getY(i) - 0.08 * fn);
  }
  fusGeo.computeVertexNormals();
  const fusMat = white.clone();
  fusMat.map = liveryTexture(profile);
  const fuselage = new THREE.Mesh(fusGeo, fusMat);
  plane.add(fuselage);

  /* wing-body fairing */
  const fairing = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), navy);
  fairing.scale.set(0.66, 0.34, 2.2);
  fairing.position.set(0, -0.36, 0.1);
  plane.add(fairing);

  /* main wings: shape in (span, chord) */
  const wingPts = (s) => [[0.3 * s, 1.55], [5.7 * s, -1.95], [5.75 * s, -2.55], [0.3 * s, -1.25]];
  for (const s of [1, -1]) {
    const geo = surfaceGeo(wingPts(s), 0.1, 0.045);
    geo.rotateX(Math.PI / 2);
    const wing = new THREE.Mesh(geo, white);
    wing.position.set(0, -0.36, 0.25);
    wing.rotation.z = s * THREE.MathUtils.degToRad(6);
    plane.add(wing);

    // leading-edge accent strip
    const strip = new THREE.Mesh(surfaceGeo([[0.6 * s, 1.36], [5.65 * s, -1.9], [5.68 * s, -2.05], [0.6 * s, 1.15]], 0.115, 0.02), metal);
    strip.geometry.rotateX(Math.PI / 2);
    wing.add(strip);

    // winglet
    const wl = new THREE.Mesh(surfaceGeo([[0, 0], [0.62, 0.95], [0.86, 0.95], [0.5, 0]], 0.05, 0.02), accent);
    wl.rotation.y = -Math.PI / 2;
    wl.position.set(5.72 * s, 0.03, -2.45);
    wl.rotation.z = s * -0.18;
    wing.add(wl);

    // nav light
    const nl = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ color: s > 0 ? 0x2bff88 : 0xff3344 }));
    nl.position.set(5.74 * s, 0.05, -2.0);
    wing.add(nl);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: s > 0 ? 0x2bff88 : 0xff3344, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(0.9);
    nl.add(glow);

    /* engine */
    const eng = new THREE.Group();
    const nacProfile = [[0.3, -1.2], [0.36, -0.95], [0.42, -0.2], [0.44, 0.45], [0.43, 0.75], [0.4, 0.86], [0.34, 0.88]];
    const nacGeo = new THREE.LatheGeometry(nacProfile.map(([r, z]) => new THREE.Vector2(r, z)), 48);
    nacGeo.rotateX(Math.PI / 2);
    const nac = new THREE.Mesh(nacGeo, white);
    nac.material = white.clone(); nac.material.side = THREE.DoubleSide;
    eng.add(nac);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.035, 12, 48), metal);
    lip.position.z = 0.86;
    eng.add(lip);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.012, 8, 48), accent);
    ring.position.z = 0.55;
    eng.add(ring);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.36, 32), dark);
    inner.position.z = 0.6;
    eng.add(inner);
    // fan
    const fan = new THREE.Group();
    const bladeGeo = new THREE.BoxGeometry(0.06, 0.3, 0.012);
    bladeGeo.translate(0, 0.19, 0);
    for (let i = 0; i < 22; i++) {
      const b = new THREE.Mesh(bladeGeo, metal);
      b.rotation.z = (i / 22) * Math.PI * 2;
      b.rotateY(0.55);
      fan.add(b);
    }
    const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 24), navy);
    spinner.rotation.x = Math.PI / 2;
    spinner.position.z = 0.08;
    fan.add(spinner);
    fan.position.z = 0.66;
    eng.add(fan);
    eng.userData.fan = fan;
    // exhaust
    const ex = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 24), metal);
    ex.rotation.x = -Math.PI / 2;
    ex.position.z = -1.35;
    eng.add(ex);
    // pylon
    const pyl = new THREE.Mesh(surfaceGeo([[0.6, 0], [-0.9, 0], [-0.6, 0.42], [0.2, 0.42]], 0.07, 0.02), white);
    pyl.rotation.y = -Math.PI / 2;
    pyl.position.set(0, 0.3, 0);
    eng.add(pyl);

    eng.position.set(2.0 * s, -0.95, 0.75);
    plane.add(eng);
    plane.userData.engines = plane.userData.engines || [];
    plane.userData.engines.push(eng);
  }

  /* horizontal stabilisers */
  for (const s of [1, -1]) {
    const geo = surfaceGeo([[0.1 * s, -3.75], [2.1 * s, -4.85], [2.12 * s, -5.2], [0.1 * s, -4.75]], 0.06, 0.025);
    geo.rotateX(Math.PI / 2);
    const st = new THREE.Mesh(geo, white);
    st.position.y = 0.38;
    st.rotation.z = s * THREE.MathUtils.degToRad(5);
    plane.add(st);
  }

  /* vertical fin  (x = -z, y = height) */
  const finGeo = surfaceGeo([[2.6, 0], [4.75, 0], [5.25, 2.25], [4.55, 2.25]], 0.08, 0.03);
  finGeo.rotateY(Math.PI / 2);
  const finMat = new THREE.MeshPhysicalMaterial({ map: tailLogoTexture(), roughness: 0.3, clearcoat: 1 });
  // planar UVs for the logo
  const fp = finGeo.attributes.position, uv = finGeo.attributes.uv;
  for (let i = 0; i < fp.count; i++) uv.setXY(i, (fp.getZ(i) + 5.25) / 2.65, fp.getY(i) / 2.25);
  const fin = new THREE.Mesh(finGeo, finMat);
  fin.position.y = 0.42;
  plane.add(fin);

  // tail strobe
  const strobe = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  strobe.position.set(0, 0.5, -5.3);
  strobe.scale.setScalar(1.4);
  plane.add(strobe);
  plane.userData.strobe = strobe;

  plane.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return plane;
}

/* ------------------------------------------------------------------ */
/*  Textures                                                          */
/* ------------------------------------------------------------------ */
let _glow;
function glowTexture() {
  if (_glow) return _glow;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  _glow = new THREE.CanvasTexture(cv);
  return _glow;
}
function cloudTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  for (let i = 0; i < 18; i++) {
    const x = 70 + rand() * 116, y = 90 + rand() * 76, r = 30 + rand() * 50;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,.22)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  }
  return new THREE.CanvasTexture(cv);
}
function skyTexture() {
  const cv = document.createElement('canvas');
  cv.width = 4; cv.height = 512;
  const g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, '#04060c');
  grd.addColorStop(0.55, '#0a0f1c');
  grd.addColorStop(0.8, '#1b1626');
  grd.addColorStop(1, '#2a1a22');
  g.fillStyle = grd; g.fillRect(0, 0, 4, 512);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------------ */
/*  Dot-matrix map                                                    */
/* ------------------------------------------------------------------ */
function landValue(x, z) {
  const n = fbm(x * 0.012, z * 0.012);
  // mainland coast (north-east side)
  const coast = 18 + 0.42 * x + n * 22 - z;
  let v = coast / 30;
  // Sicily-like island
  const sx = (x + 92) / 92, sz = (z - 262) / 34;
  v = Math.max(v, 1 - Math.sqrt(sx * sx + sz * sz) + n * 0.35);
  // Sardinia-like island
  const dx = (x + 252) / 36, dz = (z - 98) / 74;
  v = Math.max(v, 1 - Math.sqrt(dx * dx + dz * dz) + n * 0.35);
  // small islands at waypoints
  for (const w of WAYPOINTS.slice(1, 3)) {
    const d = Math.hypot(x - w.x, z - w.z);
    v = Math.max(v, 1 - d / 7 + n * 0.2);
  }
  // scattered islets
  const isl = fbm(x * 0.05 + 40, z * 0.05 - 12);
  v = Math.max(v, (isl - 0.52) * 3);
  return v;
}

function buildMap() {
  const step = 2.1;
  const x0 = -360, x1 = 170, z0 = -120, z1 = 330;
  const positions = [], land = [], rnd = [];
  for (let x = x0; x <= x1; x += step) {
    for (let z = z0; z <= z1; z += step) {
      const v = landValue(x, z);
      const l = smooth(-0.04, 0.06, v);
      const h = l * (0.4 + Math.max(0, fbm(x * 0.03, z * 0.03)) * 3.2);
      // volcano bump at Stromboli
      const ds = Math.hypot(x - WAYPOINTS[2].x, z - WAYPOINTS[2].z);
      const volcano = Math.max(0, 1 - ds / 7) * 5;
      positions.push(x, h + volcano, z);
      land.push(l);
      rnd.push(rand());
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('aLand', new THREE.Float32BufferAttribute(land, 1));
  geo.setAttribute('aRand', new THREE.Float32BufferAttribute(rnd, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uPixel: { value: 1 },
      uPlane: { value: new THREE.Vector3() },
      uLand: { value: C.cream },
      uSea: { value: C.sea },
      uAccent: { value: C.accent },
      uFog: { value: C.fog },
      uReveal: { value: 0 },
      uFadeNear: { value: 120 },
      uFadeFar: { value: 420 },
    },
    vertexShader: /* glsl */ `
      attribute float aLand; attribute float aRand;
      uniform float uTime, uPixel, uReveal, uFadeNear, uFadeFar; uniform vec3 uPlane;
      varying float vLand, vGlow, vFog, vTw;
      void main(){
        vec3 p = position;
        float d = distance(p.xz, uPlane.xz);
        vGlow = smoothstep(26.0, 0.0, d);
        p.y += vGlow * 1.2 * aLand;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = mix(0.8, 3.0, aLand) + vGlow * 1.6;
        size = max(size * uPixel * (95.0 / -mv.z), 1.2) / (uPixel * (95.0 / -mv.z));
        gl_PointSize = size * uPixel * (95.0 / -mv.z);
        vLand = aLand;
        vTw = 0.6 + 0.4 * sin(uTime * 1.5 + aRand * 40.0);
        vFog = smoothstep(uFadeNear, uFadeFar, -mv.z);
        vFog = max(vFog, 1.0 - uReveal);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLand, uSea, uAccent, uFog;
      varying float vLand, vGlow, vFog, vTw;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float r = length(c);
        if (r > 0.5) discard;
        float a = smoothstep(0.5, 0.25, r);
        vec3 col = mix(uSea, uLand, vLand);
        col = mix(col, uAccent, vGlow * 0.75);
        float alpha = mix(0.24 * vTw, 0.95, vLand) + vGlow * 0.3;
        alpha *= a * (1.0 - vFog);
        gl_FragColor = vec4(col, alpha);
      }`,
  });
  return new THREE.Points(geo, mat);
}

/* ------------------------------------------------------------------ */
/*  Route line (draws itself with progress)                           */
/* ------------------------------------------------------------------ */
function routeMaterial(color, dashed) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uProgress: { value: 0 }, uColor: { value: color }, uTime: { value: 0 }, uDashed: { value: dashed ? 1 : 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform float uProgress, uTime, uDashed; uniform vec3 uColor; varying vec2 vUv;
      void main(){
        float drawn = step(vUv.x, uProgress);
        float dash = step(0.5, fract(vUv.x * 160.0 - uTime * 0.6));
        float ahead = (1.0 - drawn) * dash * 0.28 * uDashed;
        float head = smoothstep(0.012, 0.0, abs(vUv.x - uProgress)) * 1.5;
        float a = drawn * 0.95 + ahead + head;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor + head * 0.5, a);
      }`,
  });
}

/* ------------------------------------------------------------------ */
/*  Main scene                                                        */
/* ------------------------------------------------------------------ */
const DEBUG = location.hash === '#debugmap';
export function createScene(canvas) {
  const isMobile = window.matchMedia('(max-width: 760px)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.FogExp2(C.fog, 0.0028);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.85;

  const camera = new THREE.PerspectiveCamera(isMobile ? 52 : 38, window.innerWidth / window.innerHeight, 0.1, 2500);

  // lights
  const sun = new THREE.DirectionalLight(0xffd2a6, 2.6);
  sun.position.set(-60, 50, 30);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x6f8cff, 1.1);
  rim.position.set(40, 20, -60);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xbfd2ff, 0x1a1210, 0.6));

  /* route curves */
  const pts = [
    new THREE.Vector3(WAYPOINTS[0].x, ALT, WAYPOINTS[0].z - 10),
    new THREE.Vector3(WAYPOINTS[0].x, ALT, WAYPOINTS[0].z),
    new THREE.Vector3(22, ALT + 2, 38),
    new THREE.Vector3(WAYPOINTS[1].x, ALT, WAYPOINTS[1].z),
    new THREE.Vector3(28, ALT + 3, 122),
    new THREE.Vector3(WAYPOINTS[2].x, ALT + 4, WAYPOINTS[2].z),
    new THREE.Vector3(-50, ALT + 2, 214),
    new THREE.Vector3(WAYPOINTS[3].x, ALT, WAYPOINTS[3].z),
    new THREE.Vector3(-170, ALT + 2, 222),
    new THREE.Vector3(WAYPOINTS[4].x, ALT, WAYPOINTS[4].z),
    new THREE.Vector3(-290, ALT + 16, 130),
    new THREE.Vector3(-360, ALT + 50, 92),
  ];
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  curve.arcLengthDivisions = 2000;
  const startU = 1 / 1000; // tiny offset so tangent is valid

  // param (arc-length u) of each waypoint
  const sampleU = (target) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i <= 2000; i++) {
      const u = i / 2000;
      const p = curve.getPointAt(u);
      const d = (p.x - target.x) ** 2 + (p.z - target.z) ** 2;
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  };
  const wpU = WAYPOINTS.map((w) => sampleU(w));
  wpU[0] = Math.max(wpU[0], startU);
  const uStart = wpU[0];
  const uEnd = wpU[4];

  // ground route
  const groundPts = curve.getSpacedPoints(600).map((p) => new THREE.Vector3(p.x, 1.2, p.z));
  const groundCurve = new THREE.CatmullRomCurve3(groundPts);
  const routeMat = routeMaterial(C.accent, true);
  const route = new THREE.Mesh(new THREE.TubeGeometry(groundCurve, 900, 0.45, 6, false), routeMat);
  scene.add(route);
  // glow under route
  const routeGlowMat = routeMaterial(C.gold, false);
  routeGlowMat.blending = THREE.AdditiveBlending;
  const routeGlow = new THREE.Mesh(new THREE.TubeGeometry(groundCurve, 900, 1.4, 6, false), routeGlowMat);
  routeGlow.material.uniforms.uColor.value = new THREE.Color('#ff5a36').multiplyScalar(0.25);
  scene.add(routeGlow);

  /* map */
  const map = buildMap();
  scene.add(map);

  /* waypoint markers */
  const markers = [];
  WAYPOINTS.forEach((w) => {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 2.8, 48), new THREE.MeshBasicMaterial({ color: C.accent, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    g.add(ring);
    const pulse = ring.clone();
    pulse.material = ring.material.clone();
    g.add(pulse);
    const beamMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: C.accent } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform vec3 uColor; varying vec2 vUv; void main(){ gl_FragColor=vec4(uColor, vUv.y*0.4); }`,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 9, 8, 1, true), beamMat);
    beam.position.y = 4.5;
    g.userData.beam = beam;
    g.add(beam);
    const y = w === WAYPOINTS[2] ? 6 : 2.2;
    g.position.set(w.x, y, w.z);
    scene.add(g);
    markers.push({ g, ring, pulse, w });
  });

  /* clouds */
  const cloudTex = cloudTexture();
  const clouds = new THREE.Group();
  for (let i = 0; i < 46; i++) {
    const m = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0.1 + rand() * 0.16, fog: true });
    const s = new THREE.Sprite(m);
    const u = rand();
    const p = curve.getPointAt(Math.min(0.99, u));
    s.position.set(p.x + (rand() - 0.5) * 140, 4 + rand() * 7, p.z + (rand() - 0.5) * 140);
    s.scale.setScalar(16 + rand() * 30);
    clouds.add(s);
  }
  scene.add(clouds);

  /* sun on the horizon */
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff7a45, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  sunSprite.scale.setScalar(520);
  sunSprite.position.set(-1100, 70, -260);
  scene.add(sunSprite);
  const sunCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd9a0, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  sunCore.scale.setScalar(130);
  sunCore.position.copy(sunSprite.position);
  scene.add(sunCore);

  /* stars */
  {
    const n = 1400, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = rand() * Math.PI * 2, ph = rand() * Math.PI * 0.42;
      const r = 1500;
      p[i * 3] = Math.cos(th) * Math.sin(ph) * r;
      p[i * 3 + 1] = Math.cos(ph) * r * 0.9 + 60;
      p[i * 3 + 2] = Math.sin(th) * Math.sin(ph) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xf2ebdd, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.55, fog: false })));
  }

  /* plane */
  const plane = buildPlane();
  scene.add(plane);

  /* contrails */
  const TRAIL = 220;
  const trailGeo = new THREE.BufferGeometry();
  const trailPos = new Float32Array(TRAIL * 2 * 3);
  const trailAge = new Float32Array(TRAIL * 2);
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute('aAge', new THREE.BufferAttribute(trailAge, 1));
  const trailMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uPixel: { value: 1 }, uOpacity: { value: 0 } },
    vertexShader: `attribute float aAge; uniform float uPixel; varying float vA;
      void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*mv;
      vA = 1.0 - aAge; gl_PointSize = (1.5 + aAge*7.0) * uPixel * (40.0 / -mv.z); }`,
    fragmentShader: `uniform float uOpacity; varying float vA;
      void main(){ float r = length(gl_PointCoord-0.5); if(r>0.5) discard;
      gl_FragColor = vec4(vec3(0.95,0.92,0.86), smoothstep(0.5,0.0,r) * vA * 0.28 * uOpacity); }`,
  });
  const trail = new THREE.Points(trailGeo, trailMat);
  trail.frustumCulled = false;
  scene.add(trail);
  let trailHead = 0;
  for (let i = 0; i < TRAIL * 2; i++) trailAge[i] = 1;

  /* ---------------------------------------------------------------- */
  /*  State driven from the DOM                                       */
  /* ---------------------------------------------------------------- */
  const state = {
    intro: 0,   // 0 -> 1 after loader
    hero: 0,    // scroll out of hero
    flight: 0,  // along the route
    outro: 0,   // final CTA
    mouse: new THREE.Vector2(),
  };
  const sm = { hero: 0, flight: 0, outro: 0, bank: 0, mx: 0, my: 0 };

  const tmp = {
    p: new THREE.Vector3(), t: new THREE.Vector3(), t2: new THREE.Vector3(),
    camHero: new THREE.Vector3(), camChase: new THREE.Vector3(), look: new THREE.Vector3(),
    lookHero: new THREE.Vector3(), lookChase: new THREE.Vector3(), q: new THREE.Quaternion(),
    m: new THREE.Matrix4(), up: new THREE.Vector3(0, 1, 0), right: new THREE.Vector3(),
    outroCam: new THREE.Vector3(), outroLook: new THREE.Vector3(), v: new THREE.Vector3(),
    eng: new THREE.Vector3(),
  };

  const labelEls = [];
  const telemetry = { lat: 0, lon: 0, alt: 0, gs: 0, hdg: 0, flightU: 0 };

  function setLabels(els) { labelEls.splice(0, labelEls.length, ...els); }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const pr = renderer.getPixelRatio();
    map.material.uniforms.uPixel.value = pr * (h / 900);
    trailMat.uniforms.uPixel.value = pr * (h / 900);
  }
  resize();
  window.addEventListener('resize', resize);

  const clock = new THREE.Clock();
  const ease = (x) => x * x * (3 - 2 * x);

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = clock.elapsedTime;

    sm.hero = damp(sm.hero, state.hero, 6, dt);
    sm.flight = damp(sm.flight, state.flight, 5, dt);
    sm.outro = damp(sm.outro, state.outro, 5, dt);
    sm.mx = damp(sm.mx, state.mouse.x, 3, dt);
    sm.my = damp(sm.my, state.mouse.y, 3, dt);

    // plane param along the route
    const uFlight = THREE.MathUtils.lerp(uStart, uEnd, sm.flight);
    const u = THREE.MathUtils.lerp(uFlight, 0.995, ease(sm.outro));
    curve.getPointAt(u, tmp.p);
    curve.getTangentAt(u, tmp.t).normalize();
    curve.getTangentAt(Math.min(u + 0.012, 1), tmp.t2).normalize();

    // banking from yaw rate
    const a1 = Math.atan2(tmp.t.x, tmp.t.z), a2 = Math.atan2(tmp.t2.x, tmp.t2.z);
    let da = a2 - a1;
    if (da > Math.PI) da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;
    const flying = Math.min(1, sm.hero * 1.2);
    sm.bank = damp(sm.bank, THREE.MathUtils.clamp(-da * 7, -0.75, 0.75) * flying, 3, dt);

    // gentle hover in hero
    const bob = Math.sin(time * 1.1) * 0.18 * (1 - flying);
    plane.position.copy(tmp.p);
    plane.position.y += bob;
    tmp.v.copy(tmp.p).add(tmp.t);
    plane.lookAt(tmp.v.x, tmp.v.y + bob, tmp.v.z);
    plane.rotateZ(sm.bank + Math.sin(time * 0.7) * 0.03);
    plane.rotateX(-Math.sin(time * 0.9) * 0.015 - ease(sm.outro) * 0.12);

    // fans + strobe
    for (const e of plane.userData.engines) e.userData.fan.rotation.z += dt * (14 + state.intro * 20);
    plane.userData.strobe.material.opacity = (time % 1.3) < 0.08 ? 1 : 0;

    /* ---------- camera ---------- */
    const fwd = tmp.t;
    // hero: 3/4 front orbit around the plane, in plane frame (no bank)
    tmp.m.lookAt(new THREE.Vector3(), fwd, tmp.up);
    tmp.q.setFromRotationMatrix(tmp.m);
    const introDist = THREE.MathUtils.lerp(34, 0, ease(state.intro));
    const th = 2.35 + sm.mx * 0.35 + Math.sin(time * 0.12) * 0.08;
    const R = (isMobile ? 24 : 18.5) + introDist;
    tmp.camHero.set(Math.sin(th) * R, 1.6 + sm.my * 1.6 + introDist * 0.18, Math.cos(th) * R).applyQuaternion(tmp.q).add(plane.position);
    // look slightly left of the plane so it sits right of the headline
    tmp.right.copy(plane.position).sub(tmp.camHero).normalize().cross(tmp.up).normalize();
    tmp.lookHero.copy(plane.position).addScaledVector(tmp.right, isMobile ? 0 : -7.5);
    tmp.lookHero.y += isMobile ? -2.2 : 0;

    // chase: behind & above, rising mid-route to reveal the map
    const lift = Math.sin(Math.PI * sm.flight);
    const back = 15 + lift * 18;
    const height = 7 + lift * 26;
    tmp.camChase.copy(plane.position).addScaledVector(fwd, -back);
    tmp.camChase.y += height;
    tmp.camChase.x += 6 * Math.sin(sm.flight * 7.0);
    tmp.right.set(fwd.z, 0, -fwd.x).normalize();
    tmp.lookChase.copy(plane.position).addScaledVector(fwd, 10 + lift * 8);
    tmp.lookChase.y -= 2 + lift * 6;
    tmp.lookChase.addScaledVector(tmp.right, isMobile ? 0 : 4.5 * (1 - lift * 0.4));

    const k = ease(Math.min(1, sm.hero));
    camera.position.lerpVectors(tmp.camHero, tmp.camChase, k);
    tmp.look.lerpVectors(tmp.lookHero, tmp.lookChase, k);

    // outro: camera freezes at the last chase pose while the plane flies into the sunset
    if (sm.outro > 0.001) {
      curve.getPointAt(uEnd, tmp.outroCam);
      const tEnd = curve.getTangentAt(uEnd).normalize();
      tmp.outroLook.copy(tmp.outroCam).addScaledVector(tEnd, 40);
      tmp.outroLook.y += 8;
      tmp.outroCam.addScaledVector(tEnd, -22);
      tmp.outroCam.y += 5;
      const ko = ease(Math.min(1, sm.outro * 1.6));
      camera.position.lerp(tmp.outroCam, ko);
      tmp.v.lerpVectors(tmp.look, tmp.outroLook, ko);
      tmp.look.copy(tmp.v);
    }
    if (DEBUG) { camera.position.set(-110, 520, 110); tmp.look.set(-110, 0, 111); map.material.uniforms.uFadeNear.value = 2000; map.material.uniforms.uFadeFar.value = 3000; map.material.uniforms.uReveal.value = 1; }
    camera.lookAt(tmp.look);

    /* ---------- route & map ---------- */
    const routeP = THREE.MathUtils.clamp((u - uStart) / (1 - uStart), 0, 1) * 1.0;
    routeMat.uniforms.uProgress.value = routeP;
    routeGlowMat.uniforms.uProgress.value = routeP;
    routeMat.uniforms.uTime.value = time;
    map.material.uniforms.uTime.value = time;
    map.material.uniforms.uPlane.value.copy(plane.position);
    map.material.uniforms.uReveal.value = damp(map.material.uniforms.uReveal.value, Math.min(1, 0.25 + sm.hero), 3, dt);

    markers.forEach((m, i) => {
      m.g.visible = flying > 0.02;
      const passed = u >= wpU[i] - 0.01 ? 1 : 0;
      const s = 1 + ((time * 0.6 + i * 0.2) % 1) * 3;
      m.pulse.scale.setScalar(s);
      m.pulse.material.opacity = (1 - (s - 1) / 3) * 0.8;
      m.ring.material.color.copy(passed ? C.gold : C.accent);
    });

    /* ---------- contrail ---------- */
    trailMat.uniforms.uOpacity.value = flying;
    for (let i = 0; i < TRAIL * 2; i++) trailAge[i] = Math.min(1, trailAge[i] + dt * 0.55);
    for (const e of plane.userData.engines) {
      e.getWorldPosition(tmp.eng);
      tmp.eng.addScaledVector(fwd, -1.6);
      const idx = trailHead;
      trailPos[idx * 3] = tmp.eng.x + (Math.random() - 0.5) * 0.15;
      trailPos[idx * 3 + 1] = tmp.eng.y + (Math.random() - 0.5) * 0.15;
      trailPos[idx * 3 + 2] = tmp.eng.z + (Math.random() - 0.5) * 0.15;
      trailAge[idx] = 0;
      trailHead = (trailHead + 1) % (TRAIL * 2);
    }
    trailGeo.attributes.position.needsUpdate = true;
    trailGeo.attributes.aAge.needsUpdate = true;

    /* ---------- labels ---------- */
    const w = window.innerWidth, h = window.innerHeight;
    labelEls.forEach((el, i) => {
      const m = markers[i];
      tmp.v.copy(m.g.position); tmp.v.y += 4;
      const dist = tmp.v.distanceTo(camera.position);
      tmp.v.project(camera);
      const visible = tmp.v.z < 1 && Math.abs(tmp.v.x) < 1.1 && Math.abs(tmp.v.y) < 1.1;
      const near = smooth(380, 120, dist) * flying;
      el.style.opacity = visible ? near.toFixed(3) : '0';
      el.style.transform = `translate3d(${((tmp.v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-tmp.v.y * 0.5 + 0.5) * h).toFixed(1)}px, 0)`;
    });

    /* ---------- telemetry ---------- */
    telemetry.lat = 40.8518 - plane.position.z * 0.0105;
    telemetry.lon = 14.2681 + plane.position.x * 0.0118;
    telemetry.alt = Math.round(THREE.MathUtils.lerp(0, 3048, Math.min(1, sm.hero * 1.4)) + (plane.position.y - ALT) * 60);
    telemetry.gs = Math.round(THREE.MathUtils.lerp(0, 410, Math.min(1, sm.hero * 1.4)) + Math.sin(time * 0.6) * 3);
    let hdg = THREE.MathUtils.radToDeg(Math.atan2(fwd.x, fwd.z));
    telemetry.hdg = Math.round((hdg + 360) % 360);
    telemetry.flightU = routeP;

    renderer.render(scene, camera);
  }

  renderer.setAnimationLoop(frame);

  return {
    state, telemetry, setLabels,
    waypointProgress: wpU.map((x) => (x - uStart) / (uEnd - uStart)),
    compile: () => renderer.compile(scene, camera),
  };
}
