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

// ---- Background: full-screen quad with scrolling GLSL gradient ----
const bgScene = new THREE.Scene();
const bgCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const bgUniforms = {
  uTime:    { value: 0.0 },
  uSpeed:   { value: 1.0 },
  uHorizon: { value: 0.5 },
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
    varying vec2 vUv;

    void main() {
      // Diagonal scroll: plane moves up-left, so air rushes down-right
      float scrollX = uTime * uSpeed * 0.3;
      float scrollY = uTime * uSpeed * 0.4;
      vec2 uv = vec2(vUv.x + scrollX, vUv.y + scrollY);

      // Sky gradient: remap vUv.y around the horizon control point
      // uHorizon=0.5 → horizon in the middle; higher pushes it up
      float gradT = clamp((vUv.y - (1.0 - uHorizon)) / uHorizon + 0.5, 0.0, 1.0);

      vec3 deepBlue  = vec3(0.102, 0.431, 0.710); // #1a6eb5 — top
      vec3 skyBlue   = vec3(0.529, 0.808, 0.922); // #87CEEB — mid
      vec3 hazeWhite = vec3(0.784, 0.910, 0.961); // #c8e8f5 — horizon

      vec3 skyColor;
      if (gradT > 0.5) {
        skyColor = mix(skyBlue, deepBlue, (gradT - 0.5) * 2.0);
      } else {
        skyColor = mix(hazeWhite, skyBlue, gradT * 2.0);
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
  bgSpeed:        1.0,
  horizon:        0.5,
  playbackRate:   1.0,
  videoScale:     1.0,
  whiteThreshold: 0.85,
};

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
