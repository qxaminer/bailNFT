# threejs-smu — Setup Notes

## What was set up

- **Webpack + TypeScript** pipeline copied from nodeRec template
- **Three.js** scene with:
  - `WebGLRenderer` filling the full window, pixel-ratio aware
  - `PerspectiveCamera` at position (0, 1, 3)
  - `OrbitControls` with damping for smooth mouse interaction
  - `DirectionalLight` + `AmbientLight`
  - Rotating `BoxGeometry` with `MeshStandardMaterial`
  - Window resize handler keeping canvas full-screen
  - `requestAnimationFrame` loop using `THREE.Clock` for delta-time rotation
- **dat.GUI** panel with:
  - Rotation speed slider (0–5)
  - Color picker for the cube
  - Wireframe toggle

## To get started

```bash
cd /Volumes/T7/dev/threejs-smu
npm install
npm run dev
```

Browser should open at `http://localhost:8080`.

## Ideas for what to build next

- [ ] Load GLTF models with `GLTFLoader`
- [ ] Add a floor plane / grid helper for spatial reference
- [ ] Explore `ShaderMaterial` / custom GLSL shaders
- [ ] Try `InstancedMesh` for many objects at low cost
- [ ] Add post-processing with `EffectComposer` (bloom, FXAA)
- [ ] Experiment with `Raycaster` for mouse picking / interaction
- [ ] Swap `dat.GUI` for `lil-gui` (the maintained successor)
