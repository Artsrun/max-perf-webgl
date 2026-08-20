// @ts-check
/**
 * Max-perf WebGL2 instanced colored rectangles.
 * One static unit-quad + instance buffer (x,y,w,h,r,g,b,a).
 * Single drawArraysInstanced call.
 */

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('c'));
const gl = canvas.getContext('webgl2', {
  alpha: false,
  antialias: false,
  powerPreference: 'high-performance',
  desynchronized: true
});
if (!gl) throw new Error('WebGL2 required');

// ── shaders ──────────────────────────────────────────────
const vsSrc = `#version 300 es
in vec2 a_unit;          // 0..1 unit quad
in vec4 a_posSize;       // x, y, w, h  (instance)
in vec4 a_color;         // r, g, b, a  (instance)

uniform vec2 u_res;

out vec4 v_color;

void main() {
  vec2 pos = a_posSize.xy + a_unit * a_posSize.zw;
  vec2 clip = (pos / u_res) * 2.0 - 1.0;
  gl_Position = vec4(clip * vec2(1.0, -1.0), 0.0, 1.0);
  v_color = a_color;
}`;

const fsSrc = `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 outColor;
void main() { outColor = v_color; }`;

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(s));
    throw new Error('shader compile fail');
  }
  return s;
}

const prog = gl.createProgram();
gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSrc));
gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSrc));
gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
  console.error(gl.getProgramInfoLog(prog));
  throw new Error('program link fail');
}
gl.useProgram(prog);

const uRes = gl.getUniformLocation(prog, 'u_res');
const locUnit = gl.getAttribLocation(prog, 'a_unit');
const locPosSize = gl.getAttribLocation(prog, 'a_posSize');
const locColor = gl.getAttribLocation(prog, 'a_color');

// ── static unit quad (two triangles) ─────────────────────
const unitData = new Float32Array([
  0, 0,  1, 0,  0, 1,
  0, 1,  1, 0,  1, 1
]);
const unitBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, unitBuf);
gl.bufferData(gl.ARRAY_BUFFER, unitData, gl.STATIC_DRAW);
gl.enableVertexAttribArray(locUnit);
gl.vertexAttribPointer(locUnit, 2, gl.FLOAT, false, 0, 0);
gl.vertexAttribDivisor(locUnit, 0);

// ── instance buffer layout: 8 floats ─────────────────────
// 0:x 1:y 2:w 3:h 4:r 5:g 6:b 7:a
const FLOATS_PER_INST = 8;
const BYTES_PER_INST = FLOATS_PER_INST * 4;

let MAX = 200_000;
let count = 50_000;
let instanceData = new Float32Array(MAX * FLOATS_PER_INST);
const instBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
gl.bufferData(gl.ARRAY_BUFFER, instanceData.byteLength, gl.DYNAMIC_DRAW);

// posSize (vec4) — divisor 1
gl.enableVertexAttribArray(locPosSize);
gl.vertexAttribPointer(locPosSize, 4, gl.FLOAT, false, BYTES_PER_INST, 0);
gl.vertexAttribDivisor(locPosSize, 1);

// color (vec4)
gl.enableVertexAttribArray(locColor);
gl.vertexAttribPointer(locColor, 4, gl.FLOAT, false, BYTES_PER_INST, 16);
gl.vertexAttribDivisor(locColor, 1);

// ── simulation state ─────────────────────────────────────
/** @type {{x:number,y:number,w:number,h:number,dx:number,dy:number,r:number,g:number,b:number}[]} */
let boxes = [];
let physics = true;

function seed(n) {
  count = Math.min(n, MAX);
  boxes = new Array(count);
  const W = canvas.width;
  const H = canvas.height;
  for (let i = 0; i < count; i++) {
    const w = 8 + Math.random() * 18;
    const h = 8 + Math.random() * 18;
    boxes[i] = {
      x: Math.random() * (W - w),
      y: Math.random() * (H - h),
      w, h,
      dx: (Math.random() - 0.5) * 3.5,
      dy: (Math.random() - 0.5) * 3.5,
      r: Math.random(),
      g: Math.random(),
      b: Math.random()
    };
  }
  document.getElementById('count').textContent = String(count);
  document.getElementById('countLabel').textContent = String(count);
}

// ── resize ───────────────────────────────────────────────
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width  = Math.floor(window.innerWidth  * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  gl.viewport(0, 0, canvas.width, canvas.height);
}
window.addEventListener('resize', () => {
  resize();
  // keep positions roughly in bounds after resize
  for (const b of boxes) {
    b.x = Math.min(b.x, canvas.width  - b.w);
    b.y = Math.min(b.y, canvas.height - b.h);
  }
});
resize();

// ── UI ───────────────────────────────────────────────────
const slider = /** @type {HTMLInputElement} */ (document.getElementById('countSlider'));
slider.addEventListener('input', () => {
  seed(+slider.value);
});
document.getElementById('togglePhys').addEventListener('click', (e) => {
  physics = !physics;
  e.target.textContent = `Physics: ${physics ? 'ON' : 'OFF'}`;
});

// ── render loop ──────────────────────────────────────────
let last = performance.now();
let frames = 0;
let acc = 0;

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  frames++;
  acc += dt;
  if (acc >= 0.5) {
    document.getElementById('fps').textContent = String(Math.round(frames / acc));
    frames = 0;
    acc = 0;
  }

  const W = canvas.width;
  const H = canvas.height;

  // update + pack
  let o = 0;
  for (let i = 0; i < count; i++) {
    const b = boxes[i];
    if (physics) {
      b.x += b.dx;
      b.y += b.dy;
      if (b.x < 0)          { b.x = 0;          b.dx =  Math.abs(b.dx); }
      if (b.x + b.w > W)    { b.x = W - b.w;    b.dx = -Math.abs(b.dx); }
      if (b.y < 0)          { b.y = 0;          b.dy =  Math.abs(b.dy); }
      if (b.y + b.h > H)    { b.y = H - b.h;    b.dy = -Math.abs(b.dy); }
    }
    instanceData[o++] = b.x;
    instanceData[o++] = b.y;
    instanceData[o++] = b.w;
    instanceData[o++] = b.h;
    instanceData[o++] = b.r;
    instanceData[o++] = b.g;
    instanceData[o++] = b.b;
    instanceData[o++] = 1;
  }

  gl.clearColor(0.04, 0.04, 0.05, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.uniform2f(uRes, W, H);

  gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, instanceData.subarray(0, count * FLOATS_PER_INST));

  gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);

  requestAnimationFrame(frame);
}

seed(count);
requestAnimationFrame(frame);
