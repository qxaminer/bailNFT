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
  uTime:  { value: 0.0 },
  uSpeed: { value: 1.0 },
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
    varying vec2 vUv;

    void main() {
      // Scroll horizontally over time
      float offset = uTime * uSpeed * 0.08;
      float t = fract(vUv.x + offset);

      // Warm hand-drawn palette: cream → gold → coral → cream
      vec3 cream = vec3(1.000, 0.973, 0.910); // #FFF8E8
      vec3 gold  = vec3(1.000, 0.820, 0.400); // #FFD166
      vec3 coral = vec3(0.937, 0.545, 0.353); // #EF8B5A

      vec3 color;
      if (t < 0.33) {
        color = mix(cream, gold,  t / 0.33);
      } else if (t < 0.66) {
        color = mix(gold,  coral, (t - 0.33) / 0.33);
      } else {
        color = mix(coral, cream, (t - 0.66) / 0.34);
      }

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
  playbackRate:   1.0,
  videoScale:     1.0,
  whiteThreshold: 0.85,
};

gui
  .add(params, "bgSpeed", 0.0, 3.0, 0.01)
  .name("BG Scroll Speed")
  .onChange((v: number) => { bgUniforms.uSpeed.value = v; });

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
