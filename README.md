# Max Perf WebGL2 — Instanced Batch Renderer

One draw call. 100k–200k colored rectangles at 60 fps.

## Why

Traditional DOM / SVG dies around a few thousand nodes.  
Naive WebGL (expand every quad to 6 vertices on CPU every frame) works but wastes bandwidth.

**This version uses true instancing:**

- Static unit quad (6 vertices, once)
- Instance buffer: `x y w h r g b a` (8 floats per rect)
- `gl.drawArraysInstanced(..., count)` → GPU expands

CPU only writes 8 floats per object. Perfect for layout engines, particle systems, infinite canvases, dashboards.

## Live

After enabling GitHub Pages (Settings → Pages → Deploy from `main` / root):

`https://artsrun.github.io/max-perf-webgl/`

## Controls

- Slider: live count (1k → 200k)
- Physics toggle
- FPS + count HUD

## Stack

- Pure WebGL2 (no libs)
- High-DPI aware
- `desynchronized: true` + `powerPreference: high-performance`
- Zero GC in the hot path

## Next possible

- Texture atlas / SDF text
- Color picking / hit testing
- Viewport culling before packing
- WebGPU port

---

Refined from a batch-renderer investigation. Original had a fatal `gl.width` viewport bug and expanded geometry on CPU.
