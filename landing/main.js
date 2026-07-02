/* =========================================================================
   landing-clone — Three.js stage + UI
   Structure / interaction study of johwska.com, with the SecondB head mascot.

   The head uses one high-quality front render as a billboard. The whole head
   follows the cursor with a subtle 2.5D transform, while the screen face is
   rebuilt as separate eye/mouth layers so it can track and emote cleanly.
   ========================================================================= */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { HorizontalBlurShader } from "three/addons/shaders/HorizontalBlurShader.js";
import { VerticalBlurShader } from "three/addons/shaders/VerticalBlurShader.js";

const HEAD_TEXTURE_URL =
  "./assets/head-angle-v2/secondb_head_angle_v2_r02_level_c01_front.png";
const HEAD_DEBUG_VERSION = "head-follow-v7c";
const HEAD_PAGE_QUERY = "?head-follow-v7c";

// QA: ?expr=<key> / ?age=<band> force a state for screenshot verification.
// Read before the replaceState below wipes the query string.
const QA_EXPR = new URLSearchParams(location.search).get("expr");
const QA_AGE = new URLSearchParams(location.search).get("age");
const QA_LVLUP = new URLSearchParams(location.search).get("lvlup"); // O-27 burst demo

if (location.search !== HEAD_PAGE_QUERY) {
  history.replaceState(null, "", `${location.pathname}${HEAD_PAGE_QUERY}${location.hash}`);
}

const FACE = {
  screen: { x: 0.5, y: 0.587, w: 0.46, h: 0.225 },
  leftEye: { x: 0.385, y: 0.595 },
  rightEye: { x: 0.615, y: 0.595 },
  mouth: { x: 0.5, y: 0.648 },
  eyePx: { w: 56, h: 72 },
  mouthPx: { w: 72, h: 18 },
  travel: { x: 0.032, y: 0.018 },
};

const EXPRESSIONS = [
  { key: "neutral", eyeScaleX: 1, eyeScaleY: 1, eyeTilt: 0, mouth: "flat", mouthScaleX: 1, mouthScaleY: 1, mouthOffsetY: 0, mouthMotion: "idle", blinkMin: 0.08 },
  { key: "happy", eyeScaleX: 1.08, eyeScaleY: 0.68, eyeTilt: 0, mouth: "smile", mouthScaleX: 1.2, mouthScaleY: 1.05, mouthOffsetY: 0.006, mouthMotion: "mumble", blinkMin: 0.1 },
  { key: "curious", eyeScaleX: 0.9, eyeScaleY: 1.08, eyeTilt: 0.12, mouth: "curious", mouthScaleX: 0.9, mouthScaleY: 0.9, mouthOffsetY: -0.002, mouthMotion: "idle", blinkMin: 0.08 },
  { key: "excited", eyeScaleX: 1.08, eyeScaleY: 1.04, eyeTilt: -0.04, mouth: "grin", mouthScaleX: 1.24, mouthScaleY: 1.18, mouthOffsetY: 0.006, mouthMotion: "talk", blinkMin: 0.12 },
  { key: "surprised", eyeScaleX: 1.1, eyeScaleY: 1.14, eyeTilt: 0, mouth: "dot", mouthScaleX: 0.62, mouthScaleY: 1.6, mouthOffsetY: 0.004, mouthMotion: "breath", blinkMin: 0.1 },
  { key: "sad", eyeScaleX: 1.04, eyeScaleY: 0.58, eyeTilt: -0.12, mouth: "frown", mouthScaleX: 1.02, mouthScaleY: 1, mouthOffsetY: 0.006, mouthMotion: "slow", blinkMin: 0.07 },
  { key: "annoyed", eyeScaleX: 1.12, eyeScaleY: 0.42, eyeTilt: 0.16, mouth: "flat", mouthScaleX: 0.92, mouthScaleY: 0.72, mouthOffsetY: 0.002, mouthMotion: "none", blinkMin: 0.06 },
  { key: "sleepy", eyeScaleX: 1.12, eyeScaleY: 0.26, eyeTilt: -0.04, mouth: "sleepy", mouthScaleX: 0.86, mouthScaleY: 0.64, mouthOffsetY: 0.004, mouthMotion: "slow", blinkMin: 0.04 },
  { key: "yawn", eyeScaleX: 1.1, eyeScaleY: 0.2, eyeTilt: -0.02, mouth: "yawn", mouthScaleX: 1.08, mouthScaleY: 1.9, mouthOffsetY: 0.012, mouthMotion: "yawn", blinkMin: 0.05 },
  // O-17 #3: Duolingo-style variety. Event-only (NOT in the idle mood pool) so the
  // character reacts to context instead of just cycling through emotions. All reuse
  // existing mouth styles — no new mouth textures needed.
  { key: "angry", eyeScaleX: 1.15, eyeScaleY: 0.4, eyeTilt: 0.22, mouth: "frown", mouthScaleX: 0.85, mouthScaleY: 0.72, mouthOffsetY: 0.004, mouthMotion: "none", blinkMin: 0.05 },
  { key: "proud", eyeScaleX: 1.0, eyeScaleY: 0.72, eyeTilt: -0.06, mouth: "smile", mouthScaleX: 1.26, mouthScaleY: 1.12, mouthOffsetY: 0.006, mouthMotion: "idle", blinkMin: 0.1 },
  { key: "love", eyeScaleX: 1.14, eyeScaleY: 1.14, eyeTilt: 0, mouth: "grin", mouthScaleX: 1.2, mouthScaleY: 1.16, mouthOffsetY: 0.006, mouthMotion: "mumble", blinkMin: 0.12 },
  { key: "thinking", eyeScaleX: 0.92, eyeScaleY: 1.0, eyeTilt: 0.14, mouth: "curious", mouthScaleX: 0.84, mouthScaleY: 0.85, mouthOffsetY: -0.002, mouthMotion: "idle", blinkMin: 0.08 },
  { key: "laughing", eyeScaleX: 1.05, eyeScaleY: 0.42, eyeTilt: -0.05, mouth: "grin", mouthScaleX: 1.3, mouthScaleY: 1.24, mouthOffsetY: 0.008, mouthMotion: "talk", blinkMin: 0.12 },
  { key: "determined", eyeScaleX: 1.0, eyeScaleY: 0.55, eyeTilt: 0.08, mouth: "flat", mouthScaleX: 1.0, mouthScaleY: 0.8, mouthOffsetY: 0.002, mouthMotion: "none", blinkMin: 0.07 },
  { key: "shy", eyeScaleX: 0.85, eyeScaleY: 0.7, eyeTilt: -0.1, mouth: "sleepy", mouthScaleX: 0.8, mouthScaleY: 0.72, mouthOffsetY: 0.004, mouthMotion: "idle", blinkMin: 0.1 },
];

// O-17 #2: idle mood pool stays calm/lifelike (ambient drift). Dramatic emotions
// fire only on events via react(), so the face responds to context — not a slideshow.
const IDLE_MOODS = ["neutral", "curious", "happy", "sleepy"];

// O-20 #2: age as an orthogonal MODIFIER layer over the 16 expressions (not a 16x4
// matrix). Each band scales pose/motion so the SAME emotion reads younger/older:
// child = big round eyes + bouncy + frequent blinks; adult = composed + calmer.
// Keeps Duolingo-style variety with no new sprites (asset-limit friendly).
const AGE_PROFILES = {
  child: { eyeScale: 1.16, eyeRound: 0.20, tilt: 0.7, motion: 1.4, bob: 1.7, blink: 1.45, label: "아이" },
  teen:  { eyeScale: 1.05, eyeRound: 0.07, tilt: 1.2, motion: 1.12, bob: 1.15, blink: 1.12, label: "청소년" },
  young: { eyeScale: 1.0,  eyeRound: 0.0,  tilt: 1.0, motion: 1.0, bob: 1.0, blink: 1.0, label: "청년" },
  adult: { eyeScale: 0.9,  eyeRound: -0.06, tilt: 0.85, motion: 0.78, bob: 0.68, blink: 0.85, label: "어른" },
};
const AGE_KEY = "secondb.age.v1";
let ageBand = "young";
function currentAge() { return AGE_PROFILES[ageBand] || AGE_PROFILES.young; }
function setAge(band) {
  if (!AGE_PROFILES[band]) return false;
  ageBand = band;
  try { localStorage.setItem(AGE_KEY, band); } catch (_) {}
  document.querySelectorAll("#age-chips .age-chip").forEach((c) => {
    c.classList.toggle("is-active", c.dataset.age === band);
  });
  return true;
}

const LOOK = {
  exposure: 1.0,
  bloom: { strength: 0.0, radius: 0.5, threshold: 0.8 },
  blur: 0.0,
  aberration: 0.0,
  turnMax: 0.3,
  pitchMax: 0.18,
  driftX: 0.24,
  driftY: 0.12,
  ease: 0.085,
  eyeEase: 0.18,
  bob: 0.035, // O-20 #1: gentle breathing float (world units, scaled by head size)
  charHeight: 4.9,
  fallbackBg: 0x080a14,
};

const head = { yaw: 0, pitch: 0, x: 0, y: 0 };
const eyes = { x: 0, y: 0 };

// O-13: hero <-> nav state machine. In 'nav' the head retreats to the top-left
// and shrinks while the home UI (speech bubble + function menu) reveals.
const ui = { mode: "hero", screen: null }; // hero | nav | screen
const NAV = { scale: 0.46 };     // nav head shrink
const SCREEN = { scale: 0.3 };   // screen-mode head shrink (small companion)
const ART = 0.86;                // head art occupies ~86% of its plane
const headRender = { x: 0, y: 0, s: 1 }; // eased actual head transform
let fitScale = 1;                // responsive base (recomputed in onResize)
let worldHalfW = 1;
let worldHalfH = 1;
const expressionPose = {
  eyeScaleX: 1,
  eyeScaleY: 1,
  eyeTilt: 0,
  mouthScaleX: 1,
  mouthScaleY: 1,
  mouthOffsetY: 0,
};
const faceMotion = {
  blink: 1,
  mouthScaleX: 1,
  mouthScaleY: 1,
  mouthOffsetY: 0,
  yawnAmount: 0,
  winkLeft: 1,  // O-26 #4: per-eye close (1 = open) for a one-eyed wink
  winkRight: 1,
};
const behavior = {
  blinkStart: 0,
  blinkDuration: 150,
  nextBlinkAt: Date.now() + randomBetween(900, 2200),
  nextMoodAt: Date.now() + randomBetween(6500, 9500),
  yawnStart: 0,
  yawnDuration: 2800,
  nextYawnAt: Date.now() + randomBetween(16000, 24000),
  previousExpression: 0,
  isYawning: false,
  reactionUntil: 0, // O-17 #2: while > now, an event reaction is held (idle drift paused)
  winkStart: 0,     // O-26 #4: one-eye wink overlay (0 = not winking)
  winkSide: "right",
  winkDuration: 300,
};

let headGroup = null;
let headMesh = null;
let headTexture = null;
let faceGroup = null;
const eyeMeshes = [];
let mouthMesh = null;
const mouthTextures = new Map();
let expressionIndex = 0;

document.documentElement.dataset.secondBHeadModule = HEAD_DEBUG_VERSION;
document.documentElement.dataset.secondBHeadState = "loading";

const canvas = document.getElementById("stage");
const veil = document.getElementById("veil");

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = LOOK.exposure;

const scene = new THREE.Scene();
scene.background = new THREE.Color(LOOK.fallbackBg);

const camera = new THREE.PerspectiveCamera(38, aspect(), 0.1, 100);
camera.position.set(0, 0, 6);

const pivot = new THREE.Group();
scene.add(pivot);

loadHeadTexture()
  .then((texture) => {
    headTexture = texture;
    initHeadBillboard();
    updateHeadAnimation();
    revealStage();
  })
  .catch((error) => {
    console.warn("Head texture loading failed; showing fallback orb.", error);
    setHeadDebugStatus({ error: String(error) });
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(1.15, 48, 48),
      new THREE.MeshBasicMaterial({ color: 0x7b5cff })
    );
    pivot.add(orb);
    revealStage();
  });

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const hBlur = new ShaderPass(HorizontalBlurShader);
const vBlur = new ShaderPass(VerticalBlurShader);
composer.addPass(hBlur);
composer.addPass(vBlur);

const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  LOOK.bloom.strength,
  LOOK.bloom.radius,
  LOOK.bloom.threshold
);
composer.addPass(bloom);

const Aberration = {
  uniforms: { tDiffuse: { value: null }, amount: { value: LOOK.aberration } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float amount;
    varying vec2 vUv;
    void main() {
      vec2 dir = vUv - 0.5;
      float d = dot(dir, dir);
      vec2 off = dir * amount * (0.35 + d * 4.0);
      float r = texture2D(tDiffuse, vUv + off).r;
      float g = texture2D(tDiffuse, vUv - off).g;
      float b = texture2D(tDiffuse, vUv + off).b;
      float a = texture2D(tDiffuse, vUv).a;
      gl_FragColor = vec4(r, g, b, a);
    }`,
};
composer.addPass(new ShaderPass(Aberration));
composer.addPass(new OutputPass());

/* =========================================================================
   O-17 #1 — deep-space backdrop ("파란빛 우주", AG-recommended candidate 2).
   The character's cyan rim-light bleeds into a faint simplex-noise nebula with
   a thin layer of slowly drifting blue star-dust. Both are plain scene objects
   behind the head, so the existing composer pipeline renders them untouched
   (non-destructive: no new passes; bloom/aberration stay at 0).
   ========================================================================= */
let nebulaMat = null;
let nebulaMesh = null;
let starfield = null;
const NEBULA_Z = -14;

function buildBackdrop() {
  // --- nebula glow plane (farthest back, fills the frame at any aspect) ---
  nebulaMat = new THREE.ShaderMaterial({
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uAspect: { value: aspect() },
      uCore: { value: new THREE.Color(0x1a4878) }, // dim cyan-blue glow behind the head
      uMid: { value: new THREE.Color(0x0b2142) },  // mid blue
      uEdge: { value: new THREE.Color(0x05070e) }, // deep-space (keeps the negative space dark)
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uAspect;
      uniform vec3 uCore;
      uniform vec3 uMid;
      uniform vec3 uEdge;
      vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
      vec2 mod289(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}
      vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}
      float snoise(vec2 v){
        const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
        vec2 i=floor(v+dot(v,C.yy));
        vec2 x0=v-i+dot(i,C.xx);
        vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);
        vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1;
        i=mod289(i);
        vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
        vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);
        m=m*m; m=m*m;
        vec3 x=2.0*fract(p*C.www)-1.0;
        vec3 h=abs(x)-0.5;
        vec3 ox=floor(x+0.5);
        vec3 a0=x-ox;
        m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
        vec3 g;
        g.x=a0.x*x0.x+h.x*x0.y;
        g.yz=a0.yz*x12.xz+h.yz*x12.yw;
        return 130.0*dot(m,g);
      }
      float fbm(vec2 p){
        float s=0.0, a=0.5;
        for(int i=0;i<4;i++){ s+=a*snoise(p); p*=2.0; a*=0.5; }
        return s;
      }
      void main(){
        vec2 p = vUv - vec2(0.5, 0.46);         // glow sits just behind the head
        p.x *= uAspect;                         // keep the glow circular
        float r = length(p);
        vec2 q = p*2.1 + vec2(0.0, uTime*0.03);
        float n = fbm(q + fbm(q*1.7 - uTime*0.02));
        n = 0.5 + 0.5*n;
        float glow = pow(smoothstep(0.62, 0.0, r), 2.4); // soft central glow -> deep-space edges
        float density = glow * (0.28 + 0.55*n);
        vec3 col = mix(uEdge, uMid, clamp(density*1.25, 0.0, 1.0));
        col = mix(col, uCore, clamp((density-0.52)*1.5, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  nebulaMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), nebulaMat);
  nebulaMesh.position.z = NEBULA_Z;
  nebulaMesh.renderOrder = -2;
  scene.add(nebulaMesh);
  sizeNebula();

  // --- star-dust: a thin layer of slow cyan/blue points behind the head ---
  const STAR_COUNT = 150;
  const positions = new Float32Array(STAR_COUNT * 3);
  const colors = new Float32Array(STAR_COUNT * 3);
  const cyan = new THREE.Color(0x7fe3ff);
  const blue = new THREE.Color(0x3b7bff);
  const tmp = new THREE.Color();
  for (let i = 0; i < STAR_COUNT; i++) {
    positions[i * 3] = (pseudoRandom(i * 3 + 1) * 2 - 1) * 11;       // x
    positions[i * 3 + 1] = (pseudoRandom(i * 3 + 2) * 2 - 1) * 7;    // y
    positions[i * 3 + 2] = -3 - pseudoRandom(i * 3 + 3) * 6;         // z: -3..-9 (behind head)
    tmp.copy(cyan).lerp(blue, pseudoRandom(i * 7 + 5));
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  starGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const starMat = new THREE.PointsMaterial({
    size: 0.09,
    map: makeStarSprite(),
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  starfield = new THREE.Points(starGeo, starMat);
  starfield.renderOrder = -1;
  scene.add(starfield);
}

// scale the 1x1 nebula plane to exactly fill the frame at its depth (+5% overscan)
function sizeNebula() {
  if (!nebulaMesh) return;
  const dist = camera.position.z - NEBULA_Z;
  const halfH = Math.tan((camera.fov * Math.PI) / 360) * dist;
  nebulaMesh.scale.set(halfH * 2 * camera.aspect * 1.05, halfH * 2 * 1.05, 1);
}

// deterministic [0,1) so the starfield is identical every load (no Math.random)
function pseudoRandom(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// soft round sprite (white core -> transparent) for additive star glow
function makeStarSprite() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.35, "rgba(255,255,255,0.55)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

buildBackdrop();

const pointer = { x: 0, y: 0 };
let lastInputAt = Date.now(); // O-22 #1: timestamp of the last real pointer/touch input
// O-26 #1: is a finger/pointer currently held down? While held we keep tracking the
// touch (no idle-recenter), so that when an emotion ends mid-touch the head can resume
// tracking the live touch position instead of having drifted back to front.
let pointerActive = false;

function setPointerFromClient(clientX, clientY) {
  pointer.x = (clientX / window.innerWidth) * 2 - 1;
  pointer.y = (clientY / window.innerHeight) * 2 - 1;
  lastInputAt = Date.now();
}

window.addEventListener("pointermove", (event) => {
  setPointerFromClient(event.clientX, event.clientY);
});
window.addEventListener("mousemove", (event) => {
  setPointerFromClient(event.clientX, event.clientY);
});
window.addEventListener("touchmove", (event) => {
  const touch = event.touches[0];
  if (touch) setPointerFromClient(touch.clientX, touch.clientY);
}, { passive: true });

// O-26 #1: press-down begins an active touch (immediately gaze toward it); lift ends it.
window.addEventListener("pointerdown", (event) => {
  pointerActive = true;
  setPointerFromClient(event.clientX, event.clientY);
});
window.addEventListener("touchstart", (event) => {
  const touch = event.touches[0];
  if (touch) { pointerActive = true; setPointerFromClient(touch.clientX, touch.clientY); }
}, { passive: true });
// Lift just clears the "held" flag. Touch lift also recenters (handler below); mouse
// release stays sticky-hover on purpose (desktop keeps following the cursor).
window.addEventListener("pointerup", () => { pointerActive = false; });
window.addEventListener("pointercancel", () => { pointerActive = false; });

// O-18 / O-17#4: head returns to front (gaze re-centers) when the finger lifts
// or the cursor leaves the window. The animate() ease(LOOK.ease) handles the
// smooth glide back — we only have to null the pointer target.
// Desktop hover stays "sticky" on purpose; we only re-center when the pointer
// truly leaves the window (touchend / blur / mouseleave), not on every move.
function recenterGaze() {
  pointer.x = 0;
  pointer.y = 0;
  pointerActive = false; // O-26 #1: the touch is gone — stop holding the gaze target
  lastInputAt = Date.now();
}
// O-22 #1: robust front-return — if there's no input for a beat (finger lifted, cursor
// idle/left), guarantee the gaze eases back to centre even if a touchend was missed.
const IDLE_RECENTER_MS = 2200;
window.addEventListener("touchend", recenterGaze, { passive: true });
window.addEventListener("touchcancel", recenterGaze, { passive: true });
window.addEventListener("blur", recenterGaze);
document.addEventListener("mouseleave", recenterGaze);
document.addEventListener("pointerleave", recenterGaze);

function animate() {
  requestAnimationFrame(animate);
  const now = Date.now();

  // O-22 #1: no input for a beat -> null the gaze target so the head eases to front.
  // O-26 #1: but NOT while a finger is held down — a still finger is still "touching",
  // so we keep its position as the target and resume tracking it after any emotion.
  if (!pointerActive && (pointer.x !== 0 || pointer.y !== 0) && now - lastInputAt > IDLE_RECENTER_MS) {
    pointer.x = 0;
    pointer.y = 0;
  }

  // O-17 #1: drive the nebula + drift the star-dust (slow, ambient — no slop)
  if (nebulaMat) nebulaMat.uniforms.uTime.value = now * 0.001;
  if (starfield) {
    starfield.rotation.z = now * 0.00002;
    starfield.position.y = Math.sin(now * 0.0002) * 0.18;
    starfield.material.opacity = 0.7 + 0.15 * Math.sin(now * 0.0009);
  }

  // O-26 #1: while an emotion expression is held, the character faces FRONT (gaze target
  // = centre) so the expression reads clearly head-on. When the hold ends, the target
  // snaps back to the live pointer below — so if the finger is still down the head
  // immediately resumes tracking the touch (pointerActive kept it from recentering).
  const facingFront = now < behavior.reactionUntil;
  // O-26 #3: tracking pivots on the HEAD, not the screen centre. Measure the touch
  // RELATIVE to the head's current on-screen position so the gaze is correct even when
  // the head has retreated to the nav/screen corner (headRender world pos -> screen NDC).
  const headNdcX = worldHalfW ? headRender.x / worldHalfW : 0;
  const headNdcY = worldHalfH ? -headRender.y / worldHalfH : 0; // world +y up -> screen +y down
  const gx = facingFront ? 0 : pointer.x - headNdcX;
  const gy = facingFront ? 0 : pointer.y - headNdcY;

  const targetYaw = clamp(gx * LOOK.turnMax, -LOOK.turnMax, LOOK.turnMax);
  const targetPitch = clamp(gy * LOOK.pitchMax, -LOOK.pitchMax, LOOK.pitchMax);
  const targetX = clamp(gx * LOOK.driftX, -LOOK.driftX, LOOK.driftX);
  const targetY = clamp(-gy * LOOK.driftY, -LOOK.driftY, LOOK.driftY);
  const targetEyeX = clamp(gx * FACE.travel.x, -FACE.travel.x, FACE.travel.x);
  const targetEyeY = clamp(-gy * FACE.travel.y, -FACE.travel.y, FACE.travel.y);

  head.yaw += (targetYaw - head.yaw) * LOOK.ease;
  head.pitch += (targetPitch - head.pitch) * LOOK.ease;
  head.x += (targetX - head.x) * LOOK.ease;
  head.y += (targetY - head.y) * LOOK.ease;
  eyes.x += (targetEyeX - eyes.x) * LOOK.eyeEase;
  eyes.y += (targetEyeY - eyes.y) * LOOK.eyeEase;

  // O-14: ease the head toward its current-mode target (hero center / nav+screen top-left)
  const ht = currentHeadTarget();
  headRender.x += (ht.x - headRender.x) * 0.14;
  headRender.y += (ht.y - headRender.y) * 0.14;
  headRender.s += (ht.s - headRender.s) * 0.14;

  updateFaceBehavior(now);
  updateExpressionPose();
  updateHeadAnimation();
  composer.render();
}
animate();

window.addEventListener("resize", onResize);
onResize();

// O-20 #4: only a tap on the HEAD changes mode — empty space is ignored.
// Raycast the click against the head billboard (plane bbox) instead of treating
// any canvas click as a hit (the previous behavior was the opposite of the spec).
const headRaycaster = new THREE.Raycaster();
const ndcPoint = new THREE.Vector2();
function headHitTest(clientX, clientY) {
  if (!headMesh) return false;
  ndcPoint.x = (clientX / window.innerWidth) * 2 - 1;
  ndcPoint.y = -(clientY / window.innerHeight) * 2 + 1;
  headRaycaster.setFromCamera(ndcPoint, camera);
  return headRaycaster.intersectObject(headMesh, true).length > 0;
}
window.addEventListener("click", (event) => {
  if (event.target.closest?.("#panel")) return;
  if (event.target.closest?.("#home-ui")) return;  // menu/bubble handle their own
  if (event.target.closest?.("#screens")) return;   // screen UI handles its own
  if (event.target.closest?.("#subview")) return;    // sub-view handles its own
  // O-22: in hero the menu is hidden + non-clickable, so ANY tap reveals nav (a tap
  // where the menu sits no longer fires it). In nav/screen, keep O-20 #4: only a tap
  // on the head transitions — empty space is ignored (no accidental collapse/back).
  if (ui.mode === "hero") { setMode("nav"); return; }
  if (!headHitTest(event.clientX, event.clientY)) return;
  if (ui.mode === "screen") setMode("nav");
  else setMode("hero"); // nav -> hero
});
window.setSecondBExpression = setExpression;

function aspect() { return window.innerWidth / window.innerHeight; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function onResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height);
  composer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  // O-14: responsive fit — head art fills ~80% of viewport width (capped ~78% height),
  // scaling from narrow phones (360) to wide desktops (1280+). 10% margins each side.
  worldHalfH = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
  worldHalfW = worldHalfH * camera.aspect;
  const fitW = (0.8 * 2 * worldHalfW) / (LOOK.charHeight * ART);
  const fitH = (0.78 * 2 * worldHalfH) / (LOOK.charHeight * ART);
  fitScale = Math.min(fitW, fitH);
  hBlur.uniforms.h.value = (LOOK.blur / width) * renderer.getPixelRatio();
  vBlur.uniforms.v.value = (LOOK.blur / height) * renderer.getPixelRatio();
  bloom.setSize(width, height);
  if (nebulaMat) nebulaMat.uniforms.uAspect.value = camera.aspect;
  sizeNebula();
}

function revealStage() {
  veil.classList.add("is-hidden");
}

function loadTexture(url) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        resolve(texture);
      },
      undefined,
      () => reject(new Error(`Failed to load ${url}`))
    );
  });
}

function loadHeadTexture() {
  return loadTexture(HEAD_TEXTURE_URL);
}

function initHeadBillboard() {
  headGroup = new THREE.Group();
  pivot.add(headGroup);

  const material = new THREE.MeshBasicMaterial({
    map: headTexture,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: true,
  });
  headMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(LOOK.charHeight, LOOK.charHeight),
    material
  );
  headMesh.renderOrder = 1;
  headGroup.add(headMesh);

  initFaceOverlay();
}

function initFaceOverlay() {
  const [screenX, screenY] = toHeadPlane(FACE.screen.x, FACE.screen.y);
  const patch = new THREE.Mesh(
    new THREE.PlaneGeometry(FACE.screen.w * LOOK.charHeight, FACE.screen.h * LOOK.charHeight),
    new THREE.MeshBasicMaterial({
      map: makeScreenPatch(),
      transparent: true,
      depthWrite: false,
      toneMapped: true,
    })
  );
  patch.position.set(screenX, screenY, 0.018);
  patch.renderOrder = 2;
  headGroup.add(patch);

  faceGroup = new THREE.Group();
  faceGroup.position.z = 0.034;
  faceGroup.renderOrder = 3;
  headGroup.add(faceGroup);

  for (const expression of EXPRESSIONS) {
    mouthTextures.set(expression.mouth, makeMouthTexture(expression.mouth));
  }

  const leftEye = makeFaceSprite("eye", FACE.leftEye, FACE.eyePx, 16, "left");
  const rightEye = makeFaceSprite("eye", FACE.rightEye, FACE.eyePx, 16, "right");
  eyeMeshes.push(leftEye, rightEye);
  faceGroup.add(leftEye);
  faceGroup.add(rightEye);

  mouthMesh = makeFaceSprite("mouth", FACE.mouth, FACE.mouthPx, 12);
  faceGroup.add(mouthMesh);
  setExpression(0);
}

function toHeadPlane(nx, ny) {
  return [(nx - 0.5) * LOOK.charHeight, (0.5 - ny) * LOOK.charHeight];
}

function makeFaceSprite(kind, anchor, corePx, pad, side = "center") {
  const texture = kind === "mouth"
    ? mouthTextures.get("flat") || makeMouthTexture("flat")
    : makeGlow(corePx.w, corePx.h, pad, [70, 182, 255], [204, 250, 255]);
  const width = ((corePx.w + pad * 4) / 1254) * LOOK.charHeight;
  const height = ((corePx.h + pad * 4) / 1254) * LOOK.charHeight;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      toneMapped: true,
    })
  );
  const [x, y] = toHeadPlane(anchor.x, anchor.y);
  mesh.userData.baseX = x;
  mesh.userData.baseY = y;
  mesh.userData.side = side;
  mesh.position.set(x, y, 0);
  mesh.renderOrder = 3;
  return mesh;
}

function currentExpression() {
  return EXPRESSIONS[expressionIndex] || EXPRESSIONS[0];
}

function setExpression(value, options = {}) {
  const nextIndex = typeof value === "string"
    ? EXPRESSIONS.findIndex((expression) => expression.key === value)
    : value;
  if (nextIndex < 0 || nextIndex >= EXPRESSIONS.length) return;
  if (options.manual) {
    behavior.isYawning = false;
    behavior.nextMoodAt = Date.now() + randomBetween(7000, 11000);
    behavior.nextYawnAt = Date.now() + randomBetween(16000, 26000);
  }
  expressionIndex = nextIndex;
  const expression = currentExpression();
  if (mouthMesh) {
    mouthMesh.material.map = mouthTextures.get(expression.mouth);
    mouthMesh.material.needsUpdate = true;
  }
}

function cycleExpression() {
  setExpression((expressionIndex + 1) % EXPRESSIONS.length, { manual: true });
}

function updateFaceBehavior(now) {
  if (!behavior.isYawning && now >= behavior.reactionUntil && now >= behavior.nextYawnAt) {
    behavior.isYawning = true;
    behavior.yawnStart = now;
    behavior.previousExpression = expressionIndex;
    setExpression("yawn");
  }

  if (behavior.isYawning) {
    const yawnProgress = clamp((now - behavior.yawnStart) / behavior.yawnDuration, 0, 1);
    faceMotion.yawnAmount = Math.sin(yawnProgress * Math.PI);
    if (yawnProgress >= 1) {
      behavior.isYawning = false;
      faceMotion.yawnAmount = 0;
      setExpression(behavior.previousExpression);
      behavior.nextYawnAt = now + randomBetween(18000, 28000);
      behavior.nextMoodAt = now + randomBetween(5000, 8000);
    }
  } else {
    faceMotion.yawnAmount *= 0.82;
  }

  // O-17 #2: hold an event reaction; only drift idle moods once it expires
  if (!behavior.isYawning && now >= behavior.reactionUntil && now >= behavior.nextMoodAt) {
    setExpression(randomExpressionIndex());
    behavior.nextMoodAt = now + randomBetween(6500, 10500);
  }

  const expression = currentExpression();
  if (!behavior.blinkStart && now >= behavior.nextBlinkAt) {
    behavior.blinkStart = now;
    behavior.blinkDuration = expression.key === "sleepy" ? randomBetween(220, 320) : randomBetween(120, 180);
  }

  if (behavior.blinkStart) {
    const blinkProgress = clamp((now - behavior.blinkStart) / behavior.blinkDuration, 0, 1);
    faceMotion.blink = lerp(1, expression.blinkMin ?? 0.08, Math.sin(blinkProgress * Math.PI));
    if (blinkProgress >= 1) {
      behavior.blinkStart = 0;
      faceMotion.blink = 1;
      const baseDelay = expression.key === "sleepy" ? randomBetween(800, 1800) : randomBetween(2200, 4700);
      behavior.nextBlinkAt = now + baseDelay / currentAge().blink; // O-20 #2: younger blinks more

    }
  } else {
    faceMotion.blink += (1 - faceMotion.blink) * 0.4;
  }

  // O-26 #4: one-eye wink overlay — a quick close of a single eye, independent of the
  // symmetric blink, so a button tap can read as a playful wink.
  if (behavior.winkStart) {
    const winkProgress = clamp((now - behavior.winkStart) / behavior.winkDuration, 0, 1);
    const close = lerp(1, 0.06, Math.sin(winkProgress * Math.PI));
    faceMotion.winkLeft = behavior.winkSide === "left" ? close : 1;
    faceMotion.winkRight = behavior.winkSide === "right" ? close : 1;
    if (winkProgress >= 1) {
      behavior.winkStart = 0;
      faceMotion.winkLeft = 1;
      faceMotion.winkRight = 1;
    }
  } else {
    faceMotion.winkLeft += (1 - faceMotion.winkLeft) * 0.4;
    faceMotion.winkRight += (1 - faceMotion.winkRight) * 0.4;
  }

  const t = now * 0.001;
  const talk = (Math.sin(t * 10.5) + Math.sin(t * 17.0)) * 0.5;
  const slow = Math.sin(t * 2.6);
  const breath = Math.sin(t * 4.0);

  let mouthPulse = 0;
  if (expression.mouthMotion === "talk") mouthPulse = Math.abs(talk) * 0.34;
  else if (expression.mouthMotion === "mumble") mouthPulse = Math.abs(talk) * 0.18;
  else if (expression.mouthMotion === "slow") mouthPulse = Math.max(0, slow) * 0.1;
  else if (expression.mouthMotion === "breath") mouthPulse = Math.max(0, breath) * 0.12;
  // O-20 #1: even "idle" gets a faint 오물오물 (two slow sines) so the face is never
  // fully frozen — ambient liveliness independent of emotion.
  else if (expression.mouthMotion === "idle") mouthPulse = Math.abs(Math.sin(t * 1.8)) * 0.045 + Math.abs(Math.sin(t * 3.3)) * 0.02;

  mouthPulse *= currentAge().motion; // O-20 #2: younger = bouncier mouth motion
  faceMotion.mouthScaleY = 1 + mouthPulse + faceMotion.yawnAmount * 0.5;
  faceMotion.mouthScaleX = 1 - mouthPulse * 0.08 + faceMotion.yawnAmount * 0.04;
  faceMotion.mouthOffsetY = faceMotion.yawnAmount * 0.01;
}

function updateExpressionPose() {
  const expression = currentExpression();
  const age = currentAge();
  const ease = 0.14;
  // O-20 #2: age modulates the eye targets (bigger/rounder for younger, composed for older)
  const tgtEyeX = expression.eyeScaleX * age.eyeScale;
  const tgtEyeY = expression.eyeScaleY * age.eyeScale + age.eyeRound;
  const tgtTilt = expression.eyeTilt * age.tilt;
  expressionPose.eyeScaleX += (tgtEyeX - expressionPose.eyeScaleX) * ease;
  expressionPose.eyeScaleY += (tgtEyeY - expressionPose.eyeScaleY) * ease;
  expressionPose.eyeTilt += (tgtTilt - expressionPose.eyeTilt) * ease;
  expressionPose.mouthScaleX += (expression.mouthScaleX - expressionPose.mouthScaleX) * ease;
  expressionPose.mouthScaleY += (expression.mouthScaleY - expressionPose.mouthScaleY) * ease;
  expressionPose.mouthOffsetY += (expression.mouthOffsetY - expressionPose.mouthOffsetY) * ease;
}

function randomExpressionIndex() {
  // O-17 #2: drift only among calm idle moods (dramatic emotions are event-only)
  const choices = EXPRESSIONS
    .map((expression, index) => ({ expression, index }))
    .filter((item) => IDLE_MOODS.includes(item.expression.key) && item.index !== expressionIndex);
  return choices[Math.floor(Math.random() * choices.length)]?.index ?? 0;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

/* =========================================================================
   O-17 #2 — contextual reactions. App events (save ok/fail, chat tone, …) call
   react()/reactToChat(), which holds an emotional expression for a beat, then
   lets the calm idle drift resume. Repeated failures escalate annoyed -> angry.
   Exposed on window.secondB so the host app (or the demo screens) can drive it.
   ========================================================================= */
const REACTIONS = {
  saveSuccess: { key: "excited", hold: 2600 },
  saveOk:      { key: "happy",   hold: 2200 },
  saveFail:    { key: "annoyed", hold: 2400 },
  repeatedFail:{ key: "angry",   hold: 2800 },
  celebrate:   { key: "proud",   hold: 3000 },
  thinking:    { key: "thinking",hold: 2200 },
  love:        { key: "love",    hold: 2600 },
  laugh:       { key: "laughing",hold: 2400 },
  focus:       { key: "determined", hold: 2600 },
  shy:         { key: "shy",     hold: 2200 },
  surprised:   { key: "surprised", hold: 1800 },
  sad:         { key: "sad",     hold: 2600 },
};
let failStreak = 0;

function react(eventName) {
  let entry;
  if (eventName === "saveFail") {
    failStreak += 1;
    entry = failStreak >= 2 ? REACTIONS.repeatedFail : REACTIONS.saveFail;
  } else {
    if (eventName === "saveSuccess" || eventName === "saveOk") failStreak = 0;
    entry = REACTIONS[eventName];
  }
  if (!entry) return false;
  setExpression(entry.key, { manual: true });
  behavior.reactionUntil = Date.now() + entry.hold;
  behavior.nextMoodAt = behavior.reactionUntil + randomBetween(400, 1200);
  return true;
}

/* =========================================================================
   O-26 #4 — every button press gets a light emotion (smile / wink / "오!").
   Kept short (~900ms) and front-facing (reactionUntil drives the face-front in
   animate()), so it punctuates the tap without hijacking the gaze. Buttons that
   already fire a richer reaction (save/chat/avatar) override this on their click.
   ========================================================================= */
function triggerWink() {
  const now = Date.now();
  behavior.winkStart = now;
  behavior.winkDuration = 300;
  behavior.winkSide = Math.random() < 0.5 ? "left" : "right";
  setExpression("happy", { manual: true }); // a small smile carries the wink
  behavior.reactionUntil = now + 900;
  behavior.nextMoodAt = behavior.reactionUntil + randomBetween(300, 800);
}
const LIGHT_TAPS = ["smile", "wink", "oh"];
function lightTapReact() {
  const kind = LIGHT_TAPS[Math.floor(Math.random() * LIGHT_TAPS.length)];
  if (kind === "wink") { triggerWink(); return; }
  setExpression(kind === "oh" ? "surprised" : "happy", { manual: true });
  const now = Date.now();
  behavior.reactionUntil = now + 900;
  behavior.nextMoodAt = behavior.reactionUntil + randomBetween(300, 800);
}
// Fire on any real button press. pointerdown (not click) lands the instant the finger
// goes down; capture phase so element handlers that stopPropagation on click can't
// suppress it. Every interactive control on this page is a <button> element.
window.addEventListener("pointerdown", (event) => {
  const el = event.target;
  if (el && el.closest && el.closest("button")) lightTapReact();
}, true);

// O-20 #3: classify a chat line's emotional tone (shared by user + bot-reply paths).
function classifyTone(text) {
  const t = String(text || "").toLowerCase().trim();
  if (!t) return "neutral";
  const positive = /(고마|좋|사랑|행복|기뻐|최고|^ㅎ|ㅎㅎ|ㅋㅋ|happy|love|thank|great|nice|😊|😄|❤|🥰)/.test(t);
  const negative = /(싫|화나|짜증|슬프|우울|힘들|최악|안돼|망했|sad|angry|hate|terrible|awful|😢|😭|😠)/.test(t);
  const question = /[?？]\s*$/.test(t);
  if (negative) return "negative";
  if (positive) return "positive";
  if (question) return "question";
  return "neutral";
}
function reactToTone(tone) {
  if (tone === "negative") return react("sad");   // gentle, empathetic concern
  if (tone === "positive") return react("love");
  if (tone === "question") return react("thinking");
  return react("saveOk");
}
// Back-compat: react to one line's own tone.
function reactToChat(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  return reactToTone(classifyTone(t));
}
// O-20 #3: the prototype generates a mock SecondB *reply*, and the robot's face
// reflects the reply's tone (its own emotion) — not the user's text directly.
// Real reply generation/tone lives in the 2nd-B app (src/lib/llm/gemini.ts).
const MOCK_REPLIES = {
  positive: ["그 마음 참 좋다 — 꼭 기록해둘게 ㅎㅎ", "오, 좋은 순간이었네! 잊지 않게 남겨둘게."],
  negative: ["많이 힘들었겠다… 천천히 말해줘, 내가 들을게.", "그런 날도 있지. 오늘 네 마음, 잘 적어둘게."],
  question: ["음… 그건 같이 천천히 생각해볼까?", "흠, 그건 이렇게도 볼 수 있어 — 어떻게 느껴?"],
  neutral: ["응, 차분히 적어뒀어.", "그렇구나, 기록해뒀어."],
};
let mockReplyTick = 0;
function mockSecondBReply(userText) {
  const bank = MOCK_REPLIES[classifyTone(userText)] || MOCK_REPLIES.neutral;
  return bank[(mockReplyTick++) % bank.length];
}

window.secondB = {
  react,
  reactToChat,
  setExpression,
  setAge,
  wink: triggerWink,    // O-26 #4
  tap: lightTapReact,   // O-26 #4
  name: "세컨비",        // O-26 #2: the character's name
  expressions: () => EXPRESSIONS.map((e) => e.key),
  ages: () => Object.keys(AGE_PROFILES),
};

// O-20 #2: restore saved age band; ?age=<band> QA override (QA_AGE read up top).
try { const savedAge = localStorage.getItem(AGE_KEY); if (savedAge) setAge(savedAge); } catch (_) {}
if (QA_AGE) window.setTimeout(() => setAge(QA_AGE), 80);

if (QA_EXPR) {
  window.setTimeout(() => {
    setExpression(QA_EXPR, { manual: true });
    behavior.reactionUntil = Date.now() + 60000; // hold steady for the QA screenshot
    behavior.nextMoodAt = Date.now() + 60000;
    behavior.nextYawnAt = Date.now() + 60000;
  }, 600);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function setHeadDebugStatus(debug) {
  window.__secondBHeadDebug = debug;

  const root = document.documentElement;
  root.dataset.secondBHeadModule = HEAD_DEBUG_VERSION;
  if (debug.error) {
    root.dataset.secondBHeadState = "error";
    root.dataset.secondBHeadError = debug.error;
    return;
  }

  root.dataset.secondBHeadState = "ready";
  root.dataset.secondBHeadYaw = debug.yaw.toFixed(3);
  root.dataset.secondBHeadPitch = debug.pitch.toFixed(3);
  root.dataset.secondBHeadX = debug.x.toFixed(3);
  root.dataset.secondBHeadY = debug.y.toFixed(3);
  root.dataset.secondBFaceX = debug.faceX.toFixed(3);
  root.dataset.secondBFaceY = debug.faceY.toFixed(3);
  root.dataset.secondBExpression = debug.expression;
  root.dataset.secondBBlink = debug.blink.toFixed(3);
  root.dataset.secondBYawn = debug.yawn.toFixed(3);
  root.dataset.secondBHeadActive = debug.active;
}

function updateHeadAnimation() {
  if (!headGroup || !headMesh) return;

  // O-14: eased head transform (hero center / nav+screen top-left); gaze stays live
  // O-20 #1: + a slow breathing bob so the character is always subtly alive
  const breathBob = Math.sin(Date.now() * 0.0015) * LOOK.bob * headRender.s * currentAge().bob;
  headGroup.position.x = headRender.x + head.x * headRender.s;
  headGroup.position.y = headRender.y + head.y * headRender.s + breathBob;
  headGroup.scale.set(headRender.s, headRender.s, 1);
  headGroup.rotation.x = head.pitch;
  headGroup.rotation.y = head.yaw;
  headGroup.rotation.z = head.yaw * 0.035;

  for (const eye of eyeMeshes) {
    const side = eye.userData.side === "left" ? -1 : 1;
    eye.position.x = eye.userData.baseX + eyes.x * LOOK.charHeight;
    eye.position.y = eye.userData.baseY
      + eyes.y * LOOK.charHeight
      + faceMotion.yawnAmount * LOOK.charHeight * 0.004;
    const wink = eye.userData.side === "left" ? faceMotion.winkLeft : faceMotion.winkRight;
    const eyeScaleY = Math.max(
      0.035,
      expressionPose.eyeScaleY * faceMotion.blink * wink * (1 - faceMotion.yawnAmount * 0.42)
    );
    eye.scale.set(expressionPose.eyeScaleX, eyeScaleY, 1);
    eye.rotation.z = expressionPose.eyeTilt * side;
  }

  if (mouthMesh) {
    mouthMesh.position.x = mouthMesh.userData.baseX + eyes.x * LOOK.charHeight * 0.38;
    mouthMesh.position.y = mouthMesh.userData.baseY
      + eyes.y * LOOK.charHeight * 0.38
      + (expressionPose.mouthOffsetY + faceMotion.mouthOffsetY) * LOOK.charHeight;
    mouthMesh.scale.set(
      expressionPose.mouthScaleX * faceMotion.mouthScaleX,
      expressionPose.mouthScaleY * faceMotion.mouthScaleY,
      1
    );
    mouthMesh.rotation.z = expressionPose.eyeTilt * 0.18;
  }

  setHeadDebugStatus({
    yaw: head.yaw,
    pitch: head.pitch,
    x: head.x,
    y: head.y,
    faceX: eyes.x,
    faceY: eyes.y,
    expression: currentExpression().key,
    blink: faceMotion.blink,
    yawn: faceMotion.yawnAmount,
    active: "level:front:continuous-transform+face-track+emotions",
  });
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function makeScreenPatch() {
  const width = 640;
  const height = 310;
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d");

  ctx.shadowColor = "rgba(0, 8, 35, 0.9)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "rgb(0, 4, 20)";
  roundRect(ctx, 18, 18, width - 36, height - 36, 54);
  ctx.fill();
  ctx.fill();

  ctx.shadowBlur = 0;
  for (const hx of [0.14, 0.86]) {
    const g = ctx.createRadialGradient(width * hx, height * 0.18, 2, width * hx, height * 0.18, width * 0.14);
    g.addColorStop(0, "rgba(190, 205, 255, 0.18)");
    g.addColorStop(1, "rgba(190, 205, 255, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

function makeMouthTexture(style) {
  const width = 260;
  const height = 120;
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d");
  const cyan = "rgb(95, 212, 255)";

  ctx.shadowBlur = 0;   // crisp mouth, no glow/glare
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = cyan;
  ctx.fillStyle = cyan;
  ctx.lineWidth = 18;

  if (style === "smile") {
    ctx.beginPath();
    ctx.arc(width / 2, height * 0.28, width * 0.22, 0.22 * Math.PI, 0.78 * Math.PI);
    ctx.stroke();
  } else if (style === "grin") {
    roundRect(ctx, width / 2 - 58, height / 2 - 13, 116, 26, 13);
    ctx.fill();
    ctx.globalCompositeOperation = "destination-out";
    roundRect(ctx, width / 2 - 43, height / 2 - 5, 86, 10, 5);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  } else if (style === "dot") {
    roundRect(ctx, width / 2 - 26, height / 2 - 28, 52, 56, 24);
    ctx.fill();
  } else if (style === "yawn") {
    ctx.beginPath();
    ctx.ellipse(width / 2, height / 2, 36, 46, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (style === "curious") {
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(-0.16);
    roundRect(ctx, -42, -8, 84, 16, 8);
    ctx.fill();
    ctx.restore();
  } else if (style === "frown") {
    ctx.beginPath();
    ctx.arc(width / 2, height * 0.78, width * 0.22, 1.22 * Math.PI, 1.78 * Math.PI);
    ctx.stroke();
  } else if (style === "sleepy") {
    roundRect(ctx, width / 2 - 34, height / 2 - 5, 68, 10, 5);
    ctx.fill();
  } else {
    roundRect(ctx, width / 2 - 46, height / 2 - 8, 92, 16, 8);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

function makeGlow(coreW, coreH, pad, rgb, inner) {
  const scale = 3;
  const margin = pad * 2;
  const width = (coreW + 2 * margin) * scale;
  const height = (coreH + 2 * margin) * scale;
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d");
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(coreW, coreH) * scale * 0.34;

  ctx.shadowBlur = 0;   // crisp eyes, no glow/glare
  ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  roundRect(ctx, cx - (coreW * scale) / 2, cy - (coreH * scale) / 2, coreW * scale, coreH * scale, radius);
  ctx.fill();

  if (inner) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = `rgb(${inner[0]}, ${inner[1]}, ${inner[2]})`;
    const innerWidth = coreW * scale * 0.58;
    const innerHeight = coreH * scale * 0.6;
    roundRect(ctx, cx - innerWidth / 2, cy - innerHeight / 2, innerWidth, innerHeight, radius * 0.6);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

const panel = document.getElementById("panel");
const toggle = document.getElementById("toggle");
const grid = document.getElementById("grid");

const TILE_GRADIENTS = [
  "conic-gradient(from 210deg, #6d5cc0, #b86fd0, #5aa0d6, #6d5cc0)",
  "linear-gradient(135deg, #14162a, #3a3f78 70%)",
  "radial-gradient(circle at 60% 40%, #b07cf0, #3a2f6b)",
  "conic-gradient(from 30deg, #5f74d6, #a86fd0, #6f9cd8, #5f74d6)",
  "linear-gradient(160deg, #5ad0e0, #2f5f9f)",
  "radial-gradient(circle at 40% 30%, #c9a8ff, #3e2f6e)",
  "linear-gradient(135deg, #7a5cd0, #b78fff)",
  "conic-gradient(from 90deg, #5c6ce4, #b36fd8, #5fb0cf, #5c6ce4)",
  "radial-gradient(circle at 50% 50%, #6c7cf0, #1b2038)",
  "linear-gradient(150deg, #b06cff, #5a3f9f)",
  "conic-gradient(from 250deg, #8a6ce0, #5fb0d6, #c86fe0, #8a6ce0)",
  "radial-gradient(circle at 55% 35%, #9a7cff, #2a2452)",
  "linear-gradient(135deg, #5c8ce2, #6a4f9f)",
  "radial-gradient(circle at 45% 45%, #c879ff, #4a2f80)",
  "conic-gradient(from 160deg, #6c8ce0, #b070d8, #6fd0c4, #6c8ce0)",
];

TILE_GRADIENTS.forEach((background, index) => {
  const li = document.createElement("li");
  li.style.background = background;
  li.title = `Project ${String(index + 1).padStart(2, "0")}`;
  grid.appendChild(li);
});

let dragMoved = false;
toggle.addEventListener("click", () => {
  if (dragMoved) {
    dragMoved = false;
    return;
  }
  const collapsed = panel.classList.toggle("is-collapsed");
  toggle.setAttribute("aria-expanded", String(!collapsed));
  if (!collapsed) setView(panel.dataset.view === "info" ? "info" : "work");
});

function setView(name) {
  panel.dataset.view = name;
  panel.querySelectorAll("[data-view-panel]").forEach((element) => {
    element.hidden = element.dataset.viewPanel !== name;
  });
  panel.querySelectorAll(".panel__link").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.go === name);
  });
}

panel.querySelectorAll(".panel__link").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.go));
});
setView("work");

let pDrag = null;
toggle.addEventListener("pointerdown", (event) => {
  if (panel.classList.contains("is-collapsed")) return;
  const rect = panel.getBoundingClientRect();
  pDrag = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
  dragMoved = false;
  panel.classList.add("is-dragging");
  toggle.setPointerCapture(event.pointerId);
});

toggle.addEventListener("pointermove", (event) => {
  if (!pDrag) return;
  dragMoved = true;
  const x = clamp(event.clientX - pDrag.dx, 8, window.innerWidth - panel.offsetWidth - 8);
  const y = clamp(event.clientY - pDrag.dy, 8, window.innerHeight - panel.offsetHeight - 8);
  panel.style.left = `${x}px`;
  panel.style.top = `${y}px`;
  panel.style.bottom = "auto";
});

toggle.addEventListener("pointerup", () => {
  pDrag = null;
  panel.classList.remove("is-dragging");
});

/* =========================================================================
   O-13 — hero <-> nav mode control + home function menu
   ========================================================================= */
const screensEl = document.getElementById("screens");
const screenSections = screensEl ? Array.from(screensEl.querySelectorAll(".screen")) : [];
const SCREEN_NAMES = screenSections.map((s) => s.dataset.screen);

// head target per mode — hero centred, nav/screen retreated to the 80% content top-left
function currentHeadTarget() {
  if (ui.mode === "hero" || !worldHalfW) return { x: 0, y: 0, s: fitScale };
  const sc = (ui.mode === "screen" ? SCREEN.scale : NAV.scale) * fitScale;
  const half = (LOOK.charHeight * sc * ART) / 2;
  return {
    x: -0.8 * worldHalfW + half + 0.02 * worldHalfW,
    y: 0.8 * worldHalfH - half - 0.02 * worldHalfH,
    s: sc,
  };
}

function applyMode() {
  const m = ui.mode;
  const body = document.body;
  body.classList.toggle("mode-hero", m === "hero");
  body.classList.toggle("mode-nav", m === "nav");
  body.classList.toggle("mode-screen", m === "screen");
  body.classList.toggle("is-nav", m === "nav");   // keeps the panel-declutter + reveal rules
  document.documentElement.dataset.secondBHeadMode = m;
  document.documentElement.dataset.secondBScreen = ui.screen || "";
  const homeUi = document.getElementById("home-ui");
  if (homeUi) homeUi.setAttribute("aria-hidden", m === "nav" ? "false" : "true");
  if (screensEl) screensEl.setAttribute("aria-hidden", m === "screen" ? "false" : "true");
  for (const s of screenSections) s.hidden = !(m === "screen" && s.dataset.screen === ui.screen);
}

function setMode(mode) {
  if (ui.mode === mode && mode !== "screen") return;
  ui.mode = mode;
  if (mode !== "screen") ui.screen = null;
  applyMode();
}

function openScreen(name) {
  if (!SCREEN_NAMES.includes(name)) return;
  ui.mode = "screen";
  ui.screen = name;
  applyMode();
  try { history.pushState({ screen: name }, "", `#${name}`); } catch (_) {}
}

window.addEventListener("popstate", (event) => {
  const st = event.state || {};
  // O-16 Stage④: a #sub-<id> state opens its sub-view; otherwise close any sub-view first
  if (st.sub && SUBVIEWS[st.sub]) { openSubview(st.sub, true); return; }
  closeSubview();
  if (st.screen && SCREEN_NAMES.includes(st.screen)) { ui.mode = "screen"; ui.screen = st.screen; applyMode(); }
  else setMode("nav");
});

// nav menu buttons -> open the matching screen (real client-side view routing)
document.querySelectorAll("#home-menu .home-item").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    button.dataset.pressed = "1";
    window.setTimeout(() => delete button.dataset.pressed, 180);
    openScreen(button.dataset.go);
  });
});

// O-16 req1: profile + settings icons (right of head) -> open their screens
document.querySelectorAll("#home-ui .home-icon").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    openScreen(button.dataset.go);
  });
});

// back affordance inside a screen -> nav
const backBtn = document.getElementById("screen-back");
if (backBtn) {
  backBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    if (history.state && history.state.screen) history.back();
    else setMode("nav");
  });
}

// O-17 #2 demo hooks: drive contextual reactions from the prototype screens so
// the "save success / fail / chat tone" behavior is visible without a real backend.
// O-27: WoW-style level-up burst, eye-cyan. Fires when (a) a datum accumulates or
// (b) a new structure appears. Vertical light pillar + ring burst + sparkles (0.6-1s),
// cyan tokens only. Tier intensity ("core" strong / "data" mini) so it never eats the
// Soul Core. Reduced-motion -> a short static glow pulse (no pillar/particles). Single-
// shot DOM that self-removes (no per-frame work / persistent decoration = low-end safe).
const PREFERS_REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");
function levelUpBurst(anchorEl, tier = "data", forceFull = false) {
  if (!anchorEl) return;
  const rect = anchorEl.getBoundingClientRect();
  const layer = document.createElement("div");
  layer.className = "lvlup" + (tier === "core" ? " lvlup--strong" : "");
  layer.style.left = `${rect.left + rect.width / 2}px`;
  layer.style.top = `${rect.top + rect.height / 2}px`;
  if (PREFERS_REDUCED.matches && !forceFull) {
    layer.classList.add("lvlup--pulse");
    document.body.appendChild(layer);
    window.setTimeout(() => layer.remove(), 440);
    return;
  }
  const pillar = document.createElement("div");
  pillar.className = "lvlup__pillar";
  const ring = document.createElement("div");
  ring.className = "lvlup__ring";
  layer.appendChild(pillar);
  layer.appendChild(ring);
  const strong = tier === "core";
  const n = strong ? 10 : 5;
  for (let i = 0; i < n; i++) {
    const s = document.createElement("div");
    s.className = "lvlup__spark";
    const ang = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 0.5;
    const dist = (strong ? 58 : 34) + Math.random() * 18;
    s.style.setProperty("--dx", `${Math.cos(ang) * dist}px`);
    s.style.setProperty("--dy", `${Math.sin(ang) * dist - (strong ? 28 : 16)}px`);
    layer.appendChild(s);
  }
  document.body.appendChild(layer);
  if (navigator.vibrate) navigator.vibrate(strong ? 18 : 10); // light haptic (RN app: expo-haptics)
  requestAnimationFrame(() => layer.classList.add("is-on"));
  window.setTimeout(() => layer.remove(), strong ? 1000 : 720);
}

const captureCta = document.querySelector('[data-screen="capture"] .screen__cta');
const captureInput = document.querySelector('[data-screen="capture"] .capture-input');
if (captureCta) {
  captureCta.addEventListener("click", (event) => {
    event.stopPropagation();
    const text = ((captureInput && captureInput.value) || "").trim();
    react(text ? "saveSuccess" : "saveFail"); // empty capture -> mild fail (annoyed; repeats -> angry)
    if (text) levelUpBurst(captureCta, "data"); // (a) a datum accumulated -> mini burst
    if (captureInput && text) captureInput.value = "";
  });
}

// O-27 QA: ?lvlup=core|data repeatedly fires a burst at the stage centre for demo capture.
if (QA_LVLUP === "hold") {
  // Static demo: render the burst frozen at a visible mid-frame (animation off) so a
  // headless screenshot reliably captures it. The live effect animates; this is QA-only.
  const a = document.getElementById("stage") || document.body;
  const r = a.getBoundingClientRect();
  const layer = document.createElement("div");
  layer.className = "lvlup lvlup--strong";
  layer.style.left = `${r.left + r.width / 2}px`;
  layer.style.top = `${r.top + r.height / 2}px`;
  const pillar = document.createElement("div");
  pillar.className = "lvlup__pillar";
  pillar.style.cssText = "animation:none;transform:scaleY(0.82);opacity:0.75";
  const ring = document.createElement("div");
  ring.className = "lvlup__ring";
  ring.style.cssText = "animation:none;transform:scale(1.7);opacity:0.6";
  layer.appendChild(pillar);
  layer.appendChild(ring);
  for (let i = 0; i < 10; i++) {
    const s = document.createElement("div");
    s.className = "lvlup__spark";
    const ang = (Math.PI * 2 * i) / 10;
    s.style.cssText = `animation:none;opacity:0.85;transform:translate(${Math.cos(ang) * 42}px,${Math.sin(ang) * 42 - 26}px)`;
    layer.appendChild(s);
  }
  document.body.appendChild(layer);
} else if (QA_LVLUP) {
  // forceFull so the demo shows the full pillar/ring/sparkle even where the headless
  // browser reports prefers-reduced-motion (the real reduced fallback is the pulse).
  const fire = () => levelUpBurst(document.getElementById("stage") || document.body, QA_LVLUP === "core" ? "core" : "data", true);
  window.setTimeout(fire, 300);
  window.setInterval(fire, 850);
}

// O-27 (b): tapping a graph node fires a level-up burst — core node = strong tier,
// the rest = mini (so tier-1 Soul Core/큰 구조물 reads as the bigger moment).
document.querySelectorAll('[data-screen="graph"] .graph-node').forEach((node) => {
  node.addEventListener("click", (event) => {
    event.stopPropagation();
    levelUpBurst(node, node.classList.contains("graph-node--core") ? "core" : "data");
  });
});
const chatSend = document.querySelector('[data-screen="secondb"] .chat__send');
const chatField = document.querySelector('[data-screen="secondb"] .chat__field');
const chatBox = document.querySelector('[data-screen="secondb"] .chat');
function appendChatMsg(text, who) {
  if (!chatBox) return;
  const div = document.createElement("div");
  div.className = "chat__msg chat__msg--" + who;
  div.textContent = text;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}
if (chatSend && chatField) {
  const sendChat = () => {
    const text = chatField.value.trim();
    if (!text) return;
    appendChatMsg(text, "me");
    chatField.value = "";
    // O-20 #3: SecondB replies, and the face mirrors the REPLY's tone (its emotion).
    const reply = mockSecondBReply(text);
    window.setTimeout(() => {
      appendChatMsg(reply, "bot");
      reactToTone(classifyTone(reply));
    }, 480);
  };
  chatSend.addEventListener("click", (event) => { event.stopPropagation(); sendChat(); });
  chatField.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); sendChat(); }
  });
}

// O-20 #5: profile photo upload. The picked image is downscaled on a canvas
// (<=256px JPEG) to stay well under the localStorage quota, persisted, restored on
// load, and shown both on the profile-card avatar and the nav profile icon.
const AVATAR_KEY = "secondb.avatar.v1";
const avatarBtn = document.getElementById("avatar-btn");
const avatarInput = document.getElementById("avatar-input");
const navProfileIcon = document.querySelector('#home-ui .home-icon[data-go="profile"]');
function applyAvatar(dataUrl) {
  if (!dataUrl) return;
  for (const el of [avatarBtn, navProfileIcon]) {
    if (!el) continue;
    el.style.backgroundImage = 'url("' + dataUrl + '")';
    el.classList.add("has-photo"); // CSS: cover the bg, hide the placeholder glyph/SVG
  }
}
try { const saved = localStorage.getItem(AVATAR_KEY); if (saved) applyAvatar(saved); } catch (_) {}
function downscaleToDataUrl(file, maxSize, done) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      try { done(c.toDataURL("image/jpeg", 0.85)); } catch (_) { done(String(reader.result || "")); }
    };
    img.onerror = () => done(String(reader.result || ""));
    img.src = String(reader.result || "");
  };
  reader.readAsDataURL(file);
}
if (avatarBtn && avatarInput) {
  avatarBtn.addEventListener("click", (event) => { event.stopPropagation(); avatarInput.click(); });
  avatarInput.addEventListener("change", () => {
    const file = avatarInput.files && avatarInput.files[0];
    if (!file) return;
    downscaleToDataUrl(file, 256, (dataUrl) => {
      applyAvatar(dataUrl);
      try { localStorage.setItem(AVATAR_KEY, dataUrl); } catch (_) {}
      react("love"); // a little delight when the photo is set
    });
  });
}

// O-20 #2: age chips in the profile screen switch the companion's age tone.
document.querySelectorAll("#age-chips .age-chip").forEach((chip) => {
  chip.addEventListener("click", (event) => { event.stopPropagation(); setAge(chip.dataset.age); });
});

// O-16 Stage④: every data-skel tile routes to one reusable, deep-linkable sub-view
// overlay (#sub-<id>) — real navigation + back, replacing the Stage③ toast. Content
// is still skeletal but each tile now opens its own titled, back-navigable view.
const SUBVIEWS = {
  wiki:         { label: "위키",      parent: "graph",   body: "내 지식과 노트를 위키처럼 — 노드끼리 링크로 이어져요." },
  record:       { label: "기록",      parent: "graph",   body: "한 줄부터 긴 글까지, 기록을 시간순으로 모아봐요." },
  research:     { label: "리서치",    parent: "graph",   body: "관심 주제를 깊게 파보는 리서치 공간이에요." },
  format:       { label: "형식",      parent: "capture", body: "담을 형식을 골라요 — 메모·할 일·링크·이미지." },
  import:       { label: "가져오기",  parent: "capture", body: "다른 앱이나 파일에서 한 번에 가져와요." },
  inbox:        { label: "받은 항목", parent: "capture", body: "받은 항목을 모아 정리하기 전에 먼저 검토해요." },
  manual:       { label: "수동 입력", parent: "capture", body: "직접 입력해서 그 자리에서 담아요." },
  "core-brain": { label: "소울 코어", parent: "profile", body: "나를 이루는 중심 노드 — 모든 기록이 여기로 모여요." },
  persona:      { label: "나의 모습", parent: "profile", body: "지금의 나를 비추는 화면이에요." },
  insight:      { label: "통찰",      parent: "profile", body: "기록 속에서 발견한 패턴을 보여줘요." },
  big5:         { label: "빅5",       parent: "profile", body: "다섯 요인으로 나의 성격을 들여다봐요." },
  mbti:         { label: "MBTI",      parent: "profile", body: "16가지 유형으로 나를 이해해요." },
  attach:       { label: "애착",      parent: "profile", body: "관계 속 나의 애착 패턴을 살펴봐요." },
  trinity:      { label: "네 영역",   parent: "profile", body: "삶의 네 영역 균형을 점검해요." },
  esm:          { label: "순간기록",  parent: "profile", body: "지금 이 순간의 상태를 가볍게 남겨요." },
  interview:    { label: "인터뷰",    parent: "profile", body: "질문을 따라가며 나를 깊이 탐색해요." },
  selfcheck:    { label: "자기점검",  parent: "profile", body: "오늘의 나를 가볍게 체크해요." },
};
const PARENT_LABEL = { graph: "그래프", capture: "담기", profile: "나", secondb: "세컨비", settings: "설정" };
const subviewEl = document.getElementById("subview");
const subviewKicker = document.getElementById("subview-kicker");
const subviewTitle = document.getElementById("subview-title");
const subviewBody = document.getElementById("subview-body");
function renderSubview(id) {
  const v = SUBVIEWS[id];
  if (!v || !subviewEl) return false;
  if (subviewKicker) subviewKicker.textContent = PARENT_LABEL[v.parent] || "";
  if (subviewTitle) subviewTitle.textContent = v.label;
  if (subviewBody) subviewBody.textContent = v.body;
  subviewEl.classList.add("is-open");
  subviewEl.setAttribute("aria-hidden", "false");
  return true;
}
function openSubview(id, fromPop) {
  const v = SUBVIEWS[id];
  if (!v) return;
  if (ui.screen !== v.parent) { ui.mode = "screen"; ui.screen = v.parent; applyMode(); }
  if (!renderSubview(id)) return;
  if (!fromPop) { try { history.pushState({ screen: v.parent, sub: id }, "", "#sub-" + id); } catch (_) {} }
  react("thinking");
}
function closeSubview() {
  if (!subviewEl) return;
  subviewEl.classList.remove("is-open");
  subviewEl.setAttribute("aria-hidden", "true");
}
document.querySelectorAll(".sub-tile[data-skel]").forEach((tile) => {
  tile.addEventListener("click", (event) => { event.stopPropagation(); openSubview(tile.dataset.skel); });
});
const subviewBack = document.getElementById("subview-back");
if (subviewBack) {
  subviewBack.addEventListener("click", (event) => {
    event.stopPropagation();
    if (history.state && history.state.sub) history.back();
    else closeSubview();
  });
}

applyMode();
window.setSecondBMode = setMode;
window.setSecondBScreen = openScreen;
// QA deep-links: #nav or #<screen> or #sub-<id> (O-16 Stage④)
if (location.hash === "#nav") setMode("nav");
else if (location.hash.startsWith("#sub-") && SUBVIEWS[location.hash.slice(5)]) openSubview(location.hash.slice(5), true);
else if (location.hash && SCREEN_NAMES.includes(location.hash.slice(1))) openScreen(location.hash.slice(1));
