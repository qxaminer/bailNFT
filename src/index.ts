import * as THREE from "three";
import * as dat from "dat.gui";
import { gsap } from "gsap";
import videoSrc from "./assets/bailNFT.mp4";

// ---- Renderer ----
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.autoClear = false; // manual clear so we can render two scenes
document.body.appendChild(renderer.domElement);

// ---- Sky palettes — picked randomly each load ----
const SKY_MOODS = [
  { name: "day",   deep: [0.102, 0.431, 0.710], mid: [0.529, 0.808, 0.922], haze: [0.784, 0.910, 0.961] },
  { name: "dawn",  deep: [0.561, 0.220, 0.490], mid: [0.941, 0.549, 0.310], haze: [0.988, 0.839, 0.690] },
  { name: "dusk",  deep: [0.110, 0.082, 0.251], mid: [0.741, 0.290, 0.290], haze: [0.980, 0.620, 0.380] },
  { name: "storm", deep: [0.098, 0.118, 0.157], mid: [0.310, 0.380, 0.439], haze: [0.569, 0.600, 0.620] },
  { name: "golden",deep: [0.290, 0.180, 0.059], mid: [0.871, 0.620, 0.200], haze: [0.988, 0.890, 0.608] },
];

const mood = SKY_MOODS[Math.floor(Math.random() * SKY_MOODS.length)];
const initSpeed    = 0.6 + Math.random() * 1.6;   // 0.6 – 2.2
const initHorizon  = 0.35 + Math.random() * 0.45; // 0.35 – 0.8
const initPlayback = 0.75 + Math.random() * 0.75; // 0.75 – 1.5

// ---- Background: full-screen quad with scrolling GLSL gradient ----
const bgScene = new THREE.Scene();
const bgCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const bgUniforms = {
  uTime:      { value: 0.0 },
  uSpeed:     { value: initSpeed },
  uHorizon:   { value: initHorizon },
  uDeepBlue:  { value: new THREE.Vector3(...mood.deep) },
  uSkyBlue:   { value: new THREE.Vector3(...mood.mid)  },
  uHazeWhite: { value: new THREE.Vector3(...mood.haze) },
};

const bgMaterial = new THREE.ShaderMaterial({
  uniforms: bgUniforms,
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      // Bypass projection — position is already in clip space for a 2×2 quad
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform float uSpeed;
    uniform float uHorizon;
    uniform vec3 uDeepBlue;
    uniform vec3 uSkyBlue;
    uniform vec3 uHazeWhite;
    varying vec2 vUv;

    void main() {
      // Diagonal scroll: plane moves up-left, so air rushes down-right
      float scrollX = uTime * uSpeed * 0.3;
      float scrollY = uTime * uSpeed * 0.4;
      vec2 uv = vec2(vUv.x + scrollX, vUv.y + scrollY);

      // Sky gradient: remap vUv.y around the horizon control point
      // uHorizon=0.5 → horizon in the middle; higher pushes it up
      float gradT = clamp((vUv.y - (1.0 - uHorizon)) / uHorizon + 0.5, 0.0, 1.0);

      vec3 skyColor;
      if (gradT > 0.5) {
        skyColor = mix(uSkyBlue, uDeepBlue, (gradT - 0.5) * 2.0);
      } else {
        skyColor = mix(uHazeWhite, uSkyBlue, gradT * 2.0);
      }

      // Cloud streaks — subtle horizontal bands scrolling diagonally
      vec3 streakColor = vec3(0.910, 0.957, 0.973); // #e8f4f8
      float streak1 = sin(uv.y * 18.0 + 1.2) * sin(uv.x * 3.0 - 0.5);
      float streak2 = sin(uv.y * 26.0 - 2.1) * sin(uv.x * 2.2 + 1.1);
      float streak3 = sin(uv.y * 11.0 + 3.7) * sin(uv.x * 4.1 - 2.3);
      float streaks  = clamp(streak1 * 0.5 + streak2 * 0.35 + streak3 * 0.4, 0.0, 1.0);
      float streakOpacity = mix(0.15, 0.25, streaks);

      vec3 color = mix(skyColor, streakColor, streakOpacity * streaks);

      gl_FragColor = vec4(color, 1.0);
    }
  `,
  depthTest:  false,
  depthWrite: false,
});

const bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMaterial);
bgMesh.renderOrder = -1;
bgScene.add(bgMesh);

// ---- Main scene ----
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 0, 5);

// ---- Video element ----
const video = document.createElement("video");
video.src = videoSrc;
video.autoplay = true;
video.muted = true;
video.loop = true;
video.playsInline = true;
video.playbackRate = initPlayback;
video.play().catch(() => {
  // Autoplay blocked — texture will update once user interacts
});

const videoTexture = new THREE.VideoTexture(video);
videoTexture.colorSpace = THREE.SRGBColorSpace;

// ---- Video plane (default 16/9, corrected on metadata load) ----
const VIDEO_HEIGHT = 3.0;

const videoUniforms = {
  uVideoTexture: { value: videoTexture },
  uThreshold:    { value: 0.85 },
};

const videoMaterial = new THREE.ShaderMaterial({
  uniforms: videoUniforms,
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D uVideoTexture;
    uniform float uThreshold;
    varying vec2 vUv;

    void main() {
      vec4 texel = texture2D(uVideoTexture, vUv);
      if (texel.r > uThreshold && texel.g > uThreshold && texel.b > uThreshold) {
        discard;
      }
      gl_FragColor = texel;
    }
  `,
  transparent: true,
  depthWrite:  false,
  side:        THREE.DoubleSide,
});

let videoPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(VIDEO_HEIGHT * (16 / 9), VIDEO_HEIGHT),
  videoMaterial
);
videoPlane.position.x = -8; // off-screen left — GSAP will slide it in
scene.add(videoPlane);

function onMetadata(): void {
  const aspect = video.videoWidth / video.videoHeight;
  videoPlane.geometry.dispose();
  videoPlane.geometry = new THREE.PlaneGeometry(VIDEO_HEIGHT * aspect, VIDEO_HEIGHT);

  gsap.to(videoPlane.position, {
    x: 0,
    duration: 1.2,
    ease: "back.out(1.7)",
  });
}

// Handle both: metadata already available vs. still loading
if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
  onMetadata();
} else {
  video.addEventListener("loadedmetadata", onMetadata, { once: true });
}

// ---- dat.GUI ----
const gui = new dat.GUI();

const params = {
  mood:           mood.name,
  bgSpeed:        initSpeed,
  horizon:        initHorizon,
  playbackRate:   initPlayback,
  videoScale:     1.0,
  whiteThreshold: 0.85,
};

gui.add(params, "mood").name("sky mood").listen();

gui
  .add(params, "bgSpeed", 0.0, 3.0, 0.01)
  .name("wind speed")
  .onChange((v: number) => { bgUniforms.uSpeed.value = v; });

gui
  .add(params, "horizon", 0.0, 1.0, 0.01)
  .name("horizon")
  .onChange((v: number) => { bgUniforms.uHorizon.value = v; });

gui
  .add(params, "playbackRate", 0.25, 2.0, 0.05)
  .name("Playback Rate")
  .onChange((v: number) => { video.playbackRate = v; });

gui
  .add(params, "videoScale", 0.5, 2.0, 0.01)
  .name("Video Scale")
  .onChange((v: number) => { videoPlane.scale.setScalar(v); });

gui
  .add(params, "whiteThreshold", 0.7, 1.0, 0.01)
  .name("White Threshold")
  .onChange((v: number) => { videoUniforms.uThreshold.value = v; });

// ---- Resize handler ----
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Animation loop ----
const clock = new THREE.Clock();

function animate(): void {
  requestAnimationFrame(animate);

  bgUniforms.uTime.value = clock.getElapsedTime();

  // Push new video frame to GPU when one is ready
  if (video.readyState >= video.HAVE_CURRENT_DATA) {
    videoTexture.needsUpdate = true;
  }

  renderer.clear();
  renderer.render(bgScene, bgCamera); // background first
  renderer.render(scene, camera);     // video plane on top
}

animate();
