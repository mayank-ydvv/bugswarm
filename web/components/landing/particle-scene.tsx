'use client';

import { useEffect, useRef } from 'react';
import { buildParticles, SHAPE_INDEX, type ShapeName } from './shapes';

/**
 * Scroll-driven particle field. Each section declares a scene (shape + placement) in data attributes;
 * as the viewport centre moves between sections, the field morphs from one scene to the next.
 */

export interface Scene {
  shape: ShapeName;
  /** Screen offset of the shape, in NDC units (-1..1). */
  x: number;
  y: number;
  scale: number;
  /** Camera distance: smaller flies into the cloud. */
  camera: number;
  /** Overall brightness. */
  alpha: number;
  /** Base yaw in radians. */
  yaw: number;
}

const VERT = `#version 300 es
precision highp float;
in vec3 a_p0; in vec3 a_p1; in vec3 a_p2; in vec3 a_p3; in vec3 a_p4;
in vec3 a_c0; in vec3 a_c1; in vec3 a_c2; in vec3 a_c3; in vec3 a_c4;
in vec4 a_seed;
uniform float u_from, u_to, u_mix, u_time, u_aspect, u_scale, u_camera, u_dpr, u_alpha, u_motion;
uniform vec2 u_offset, u_rot;
out vec3 v_color; out float v_angle; out float v_alpha;

vec3 pick(float i, vec3 a, vec3 b, vec3 c, vec3 d, vec3 e) {
  return i < 0.5 ? a : i < 1.5 ? b : i < 2.5 ? c : i < 3.5 ? d : e;
}

void main() {
  float t = clamp((u_mix - a_seed.x * 0.35) / 0.65, 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);
  vec3 pa = pick(u_from, a_p0, a_p1, a_p2, a_p3, a_p4);
  vec3 pb = pick(u_to, a_p0, a_p1, a_p2, a_p3, a_p4);
  vec3 p = mix(pa, pb, t);
  // Burst outward mid-morph so shapes dissolve and regroup instead of sliding through each other.
  vec3 dir = normalize(vec3(sin(a_seed.y * 19.0), cos(a_seed.z * 23.0), sin(a_seed.x * 29.0 + 1.0)) + 1e-3);
  float morphing = abs(u_from - u_to) > 0.5 ? 1.0 : 0.0;
  p += dir * sin(3.14159 * t) * 0.9 * morphing;
  // Ambient specks drift slowly around the whole scene.
  if (a_seed.w > 0.5) {
    p.x += sin(u_time * 0.05 + a_seed.y * 30.0) * 0.4 * u_motion;
    p.y += cos(u_time * 0.04 + a_seed.z * 30.0) * 0.3 * u_motion;
  }
  // Shimmer.
  p += 0.012 * u_motion * vec3(
    sin(u_time * 0.9 + a_seed.y * 40.0),
    cos(u_time * 0.7 + a_seed.z * 50.0),
    sin(u_time * 0.8 + a_seed.x * 60.0));
  float cy = cos(u_rot.x), sy = sin(u_rot.x);
  p = vec3(cy * p.x + sy * p.z, p.y, -sy * p.x + cy * p.z);
  float cp = cos(u_rot.y), sp = sin(u_rot.y);
  p = vec3(p.x, cp * p.y - sp * p.z, sp * p.y + cp * p.z);
  if (a_seed.w < 0.5) p *= u_scale;
  float z = p.z + u_camera;
  if (z < 0.15) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  float f = 2.1;
  vec2 ndc = vec2(p.x * f / (z * u_aspect), p.y * f / z) + (a_seed.w < 0.5 ? u_offset : vec2(0.0));
  gl_Position = vec4(ndc, 0.0, 1.0);
  gl_PointSize = clamp((4.6 + a_seed.z * 4.4) * u_dpr * 4.0 / z, 1.5, 80.0 * u_dpr);
  v_color = mix(pick(u_from, a_c0, a_c1, a_c2, a_c3, a_c4), pick(u_to, a_c0, a_c1, a_c2, a_c3, a_c4), t);
  v_angle = a_seed.y * 6.2832 + u_time * 0.25 * (a_seed.x - 0.5) * u_motion;
  // fade particles very close to the camera so fly-throughs don't flash
  v_alpha = u_alpha * smoothstep(0.15, 1.1, z);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec3 v_color; in float v_angle; in float v_alpha;
out vec4 o;
// Signed distance to an equilateral triangle (Inigo Quilez).
float sdTri(vec2 p) {
  const float k = 1.7320508;
  p.x = abs(p.x) - 1.0;
  p.y = p.y + 1.0 / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -2.0, 0.0);
  return -length(p) * sign(p.y);
}
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float c = cos(v_angle), s = sin(v_angle);
  q = mat2(c, -s, s, c) * q;
  float d = sdTri(q * 1.5);
  float outline = 1.0 - smoothstep(0.07, 0.3, abs(d));
  float a = outline * v_alpha;
  if (a < 0.01) discard;
  o = vec4(v_color * a, a);
}`;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader error');
  return s;
}

/** Read every section's scene; mobile layouts get their own placement (shape centred, dimmer). */
function readScenes(mobile: boolean): { center: number; scene: Scene }[] {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-scene]'));
  return nodes.map((el) => {
    const raw = JSON.parse(el.dataset.scene!) as Scene & { mobile?: Partial<Scene> };
    const scene = mobile && raw.mobile ? { ...raw, ...raw.mobile } : raw;
    const rect = el.getBoundingClientRect();
    return { center: rect.top + window.scrollY + rect.height / 2, scene };
  });
}

export function ParticleScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: true, alpha: true });
    if (!gl) {
      canvas.dataset.fallback = 'true';
      return;
    }
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mobileQuery = window.matchMedia('(max-width: 900px)');
    const count = mobileQuery.matches ? 4500 : 9000;
    const data = buildParticles(count);

    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link error');
    gl.useProgram(program);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const attach = (name: string, array: Float32Array, size: number) => {
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, array, gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };
    data.positions.forEach((arr, i) => attach(`a_p${i}`, arr, 3));
    data.colors.forEach((arr, i) => attach(`a_c${i}`, arr, 3));
    attach('a_seed', data.seeds, 4);

    const u = (name: string) => gl.getUniformLocation(program, name);
    const U = {
      from: u('u_from'), to: u('u_to'), mix: u('u_mix'), time: u('u_time'), aspect: u('u_aspect'),
      scale: u('u_scale'), camera: u('u_camera'), dpr: u('u_dpr'), alpha: u('u_alpha'), motion: u('u_motion'),
      offset: u('u_offset'), rot: u('u_rot'),
    };
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE); // additive: overlapping triangles glow
    gl.uniform1f(U.motion, reduceMotion ? 0 : 1);

    let scenes = readScenes(mobileQuery.matches);
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      scenes = readScenes(mobileQuery.matches);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(document.body);
    window.addEventListener('resize', resize);

    // Gentle parallax from the pointer.
    let pointerX = 0;
    let pointerY = 0;
    const onPointer = (e: PointerEvent) => {
      pointerX = (e.clientX / window.innerWidth - 0.5) * 2;
      pointerY = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('pointermove', onPointer, { passive: true });

    const start = performance.now();
    const INTRO_MS = 2600;
    let raf = 0;
    let smoothX = 0;
    let smoothY = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (scenes.length === 0) return;
      const time = (now - start) / 1000;
      const probe = window.scrollY + window.innerHeight / 2;

      // Find the pair of sections around the viewport centre.
      let i = 0;
      while (i < scenes.length - 1 && probe > scenes[i + 1]!.center) i++;
      const a = scenes[i]!;
      const b = scenes[Math.min(i + 1, scenes.length - 1)]!;
      let t = b === a ? 0 : (probe - a.center) / (b.center - a.center);
      t = Math.min(1, Math.max(0, t));
      // Hold each shape while its section is being read; morph in the gap between sections.
      const k = smooth(Math.min(1, Math.max(0, (t - 0.2) / 0.6)));
      let from = SHAPE_INDEX[a.scene.shape];
      let to = SHAPE_INDEX[b.scene.shape];
      let mixT = k;

      // On load the swarm assembles from the field into the first shape.
      const intro = reduceMotion ? 1 : Math.min(1, (now - start) / INTRO_MS);
      if (intro < 1 && i === 0 && k < 0.01) {
        from = SHAPE_INDEX.field;
        to = SHAPE_INDEX[a.scene.shape];
        mixT = smooth(intro);
      }

      const s = { x: lerp(a.scene.x, b.scene.x, k), y: lerp(a.scene.y, b.scene.y, k) };
      smoothX += (pointerX - smoothX) * 0.04;
      smoothY += (pointerY - smoothY) * 0.04;

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(U.from, from);
      gl.uniform1f(U.to, to);
      gl.uniform1f(U.mix, mixT);
      gl.uniform1f(U.time, reduceMotion ? 0 : time);
      gl.uniform1f(U.aspect, canvas.width / canvas.height);
      gl.uniform1f(U.scale, lerp(a.scene.scale, b.scene.scale, k));
      gl.uniform1f(U.camera, lerp(a.scene.camera, b.scene.camera, k));
      gl.uniform1f(U.dpr, dpr);
      gl.uniform1f(U.alpha, lerp(a.scene.alpha, b.scene.alpha, k) * (reduceMotion ? 1 : Math.min(1, 0.25 + intro)));
      gl.uniform2f(U.offset, s.x, s.y);
      const yaw = lerp(a.scene.yaw, b.scene.yaw, k) + (reduceMotion ? 0 : Math.sin(time * 0.12) * 0.18) + smoothX * 0.12;
      gl.uniform2f(U.rot, yaw, smoothY * 0.08);
      gl.drawArrays(gl.POINTS, 0, data.count);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointer);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 h-dvh w-full data-[fallback=true]:hidden"
    />
  );
}
