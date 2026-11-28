/* The background of usewit.dev: a soap film, the thinnest water there is.
   Its thickness is simulated as a fluid: it drains, so it is black-thin up top (behind the words) and thicker below;
   thin patches rise as plumes and thick ones sink, all at an unhurried pace, and the pointer stirs it gently. Each
   pixel's colour is light interfering with itself across that thickness, worked out over the visible spectrum.
   WebGL2; without it the page keeps a dark gradient. */
(function () {
  var start = /* Background — "Film".
   A soap film, the thinnest water there is, filling the window. Its colours are not painted on: the film's thickness is
   simulated as a fluid (it drains, so it is black-thin at the top and thicker below; thin patches rise as plumes,
   thick ones sink), and each pixel's colour is light interfering with itself across that thickness, worked out over the
   visible spectrum. The pointer stirs it. */
function (cv) {
  var gl = cv.getContext('webgl2', { antialias: false, depth: false, stencil: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl || !gl.getExtension('EXT_color_buffer_float')) { cv.style.background = 'linear-gradient(#040405 0%, #040405 45%, #1a1030 80%, #0a1a20 100%)'; return function () {}; }

  var dead = false, visible = true, raf = 0, ro = null, io = null, offs = [];
  function on(t, e, f, o) { t.addEventListener(e, f, o); offs.push(function () { t.removeEventListener(e, f, o); }); }
  function stop() {
    dead = true; cancelAnimationFrame(raf);
    if (ro) ro.disconnect(); if (io) io.disconnect();
    offs.forEach(function (f) { f(); });
    var lc = gl.getExtension('WEBGL_lose_context'); if (lc) lc.loseContext();
  }
  if (window.IntersectionObserver) { io = new IntersectionObserver(function (e) { visible = e[e.length - 1].isIntersecting; }); io.observe(cv); }


  var EXPO = 2.0, THICK = 0.75, BUOY = 1.2, STIR = 0.06, RELAXR = 0.2, WARM = 300;
  var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  function shader(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(fs) {
    var p = gl.createProgram();
    gl.attachShader(p, shader(gl.VERTEX_SHADER, FULL_VS)); gl.attachShader(p, shader(gl.FRAGMENT_SHADER, '#version 300 es\nprecision highp float;\n' + COMMON + fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) { var name = gl.getActiveUniform(p, i).name; u[name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, name); }
    return { p: p, u: u };
  }
  function target(w, h) {
    var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { tex: t, fb: f, w: w, h: h };
  }
  function pair(w, h) { var a = target(w, h), b = target(w, h); return { r: a, w: b, swap: function () { var x = this.r; this.r = this.w; this.w = x; } }; }

  var FULL_VS = '#version 300 es\nvoid main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}';
  var COMMON = `
uniform vec2 uSize;                 // size of the target being drawn
float h21(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
vec2 UV(){ return gl_FragCoord.xy / uSize; }
// how thick the film wants to be at height y (0 bottom, 1 top), in microns: it drains, so black-thin up top
const float Y0 = 0.42;              // above this the film has drained to black film; below, it thickens downward
float rest(float y, float k){ return y > Y0 ? 0.004 : 0.24 + k * pow((Y0 - y) / Y0, 1.25); }
out vec4 o;
`;

  // move a field along the flow
  var ADVECT = program(`
uniform sampler2D uVel, uSrc;
uniform float uDt, uKeep, uAspect;
void main(){
  vec2 uv = UV();
  vec2 v = texture(uVel, uv).xy;
  vec2 back = uv - uDt * v * vec2(1.0 / uAspect, 1.0);
  o = uKeep * texture(uSrc, back);
}`);
  // stir: slow swirling currents, buoyancy (thin film rises), and the pointer
  var FORCE = program(`
uniform sampler2D uVel, uThick;
uniform float uT, uDt, uAspect, uBuoy, uStir, uK, uDrag, uOn;
uniform vec4 uSeg;                  // the pointer went from (x, y) to (z, w) since the last step, 0..1
uniform vec2 uPV;                   // the speed the film is pulled to under the pointer, screen heights per second
float psi(vec2 p){ return n2(p * 2.2 + vec2(0.0, uT * 0.05)) + 0.5 * n2(p * 4.7 - vec2(uT * 0.04, 0.0) + 7.0) + 0.22 * n2(p * 11.0 + vec2(uT * 0.09, -uT * 0.05) + 3.0); }
void main(){
  vec2 uv = UV(), p = vec2(uv.x * uAspect, uv.y);
  vec2 v = texture(uVel, uv).xy;
  float e = 0.01;
  vec2 curlF = vec2(psi(p + vec2(0.0, e)) - psi(p - vec2(0.0, e)), -(psi(p + vec2(e, 0.0)) - psi(p - vec2(e, 0.0)))) / (2.0 * e);
  float d = texture(uThick, uv).x;
  float buoy = uBuoy * (rest(uv.y, uK) - d);                                // thinner than its neighbours → rises
  v += uDt * (uStir * curlF + vec2(0.0, buoy));
  // the pointer: a wide soft brush along the whole path it moved, easing the film toward a slower copy of its motion
  vec2 a = vec2(uSeg.x * uAspect, uSeg.y), b = vec2(uSeg.z * uAspect, uSeg.w), ab = b - a;
  vec2 dp = p - (a + ab * clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0));
  v = mix(v, uPV, clamp(uDt * 6.0 * uOn * exp(-dot(dp, dp) / 0.011), 0.0, 1.0));
  v *= 1.0 - uDt * uDrag;                                                    // the film's own drag
  o = vec4(v, 0.0, 1.0);
}`);
  var CURL = program(`
uniform sampler2D uVel;
void main(){
  vec2 t = 1.0 / uSize, uv = UV();
  float l = texture(uVel, uv - vec2(t.x, 0.0)).y, r = texture(uVel, uv + vec2(t.x, 0.0)).y;
  float b = texture(uVel, uv - vec2(0.0, t.y)).x, u = texture(uVel, uv + vec2(0.0, t.y)).x;
  o = vec4(0.5 * (r - l - u + b), 0.0, 0.0, 1.0);
}`);
  // keep the small eddies spinning (vorticity confinement)
  var VORT = program(`
uniform sampler2D uVel, uCurl;
uniform float uDt, uAmt;
void main(){
  vec2 t = 1.0 / uSize, uv = UV();
  float l = texture(uCurl, uv - vec2(t.x, 0.0)).x, r = texture(uCurl, uv + vec2(t.x, 0.0)).x;
  float b = texture(uCurl, uv - vec2(0.0, t.y)).x, u = texture(uCurl, uv + vec2(0.0, t.y)).x, c = texture(uCurl, uv).x;
  vec2 f = 0.5 * vec2(abs(u) - abs(b), abs(r) - abs(l));
  f /= length(f) + 1e-4;
  f *= uAmt * c * vec2(1.0, -1.0);
  o = vec4(texture(uVel, uv).xy + f * uDt, 0.0, 1.0);
}`);
  var DIV = program(`
uniform sampler2D uVel;
void main(){
  vec2 t = 1.0 / uSize, uv = UV();
  float l = texture(uVel, uv - vec2(t.x, 0.0)).x, r = texture(uVel, uv + vec2(t.x, 0.0)).x;
  float b = texture(uVel, uv - vec2(0.0, t.y)).y, u = texture(uVel, uv + vec2(0.0, t.y)).y;
  vec2 c = texture(uVel, uv).xy;
  if (uv.x - t.x < 0.0) l = -c.x; if (uv.x + t.x > 1.0) r = -c.x;
  if (uv.y - t.y < 0.0) b = -c.y; if (uv.y + t.y > 1.0) u = -c.y;
  o = vec4(0.5 * (r - l + u - b), 0.0, 0.0, 1.0);
}`);
  var JACOBI = program(`
uniform sampler2D uP, uDiv;
void main(){
  vec2 t = 1.0 / uSize, uv = UV();
  float l = texture(uP, uv - vec2(t.x, 0.0)).x, r = texture(uP, uv + vec2(t.x, 0.0)).x;
  float b = texture(uP, uv - vec2(0.0, t.y)).x, u = texture(uP, uv + vec2(0.0, t.y)).x;
  o = vec4(0.25 * (l + r + b + u - texture(uDiv, uv).x), 0.0, 0.0, 1.0);
}`);
  var GRAD = program(`
uniform sampler2D uP, uVel;
void main(){
  vec2 t = 1.0 / uSize, uv = UV();
  float l = texture(uP, uv - vec2(t.x, 0.0)).x, r = texture(uP, uv + vec2(t.x, 0.0)).x;
  float b = texture(uP, uv - vec2(0.0, t.y)).x, u = texture(uP, uv + vec2(0.0, t.y)).x;
  o = vec4(texture(uVel, uv).xy - 0.5 * vec2(r - l, u - b), 0.0, 1.0);
}`);
  // the film keeps draining toward its resting profile, and is fed a little from the bottom edge
  var RELAX = program(`
uniform sampler2D uThick;
uniform float uDt, uT, uK, uRelax, uLow, uFeed;
void main(){
  vec2 uv = UV();
  float d = texture(uThick, uv).x, r = rest(uv.y, uK);
  d += (r - d) * uDt * uRelax * (uv.y > Y0 ? 1.0 + 6.0 * smoothstep(Y0, Y0 + 0.12, uv.y) : uLow);    // black film eats what rises into it
  d += uFeed * uDt * 0.35 * smoothstep(0.06, 0.0, uv.y) * (n2(vec2(uv.x * 9.0, uT * 0.4)) - 0.35);
  o = vec4(max(d, 0.0), 0.0, 0.0, 1.0);
}`);
  var COPY = program(`
uniform sampler2D uSrc;
void main(){ o = texture(uSrc, UV()); }`);
  var INIT = program(`
uniform float uK, uAspect;
void main(){
  vec2 uv = UV();
  float w = n2(vec2(uv.x * uAspect, uv.y) * 6.0) - 0.5;
  o = vec4(max(rest(uv.y + 0.06 * w, uK), 0.0), 0.0, 0.0, 1.0);
}`);

  // The colour of a soap film of each thickness (0–2 µm): thin-film interference across the visible spectrum (Airy
  // reflectance, the CIE 1931 observer fitted after Wyman, Sloan & Shirley 2013). Worked out once into a strip.
  var SPECTRUM = program(`
float g(float x, float m, float s1, float s2){ float t = (x - m) / (x < m ? s1 : s2); return exp(-0.5 * t * t); }
vec3 cmf(float l){
  return vec3(1.056 * g(l, 599.8, 37.9, 31.0) + 0.362 * g(l, 442.0, 16.0, 26.7) - 0.065 * g(l, 501.1, 20.4, 26.2),
              0.821 * g(l, 568.8, 46.9, 40.5) + 0.286 * g(l, 530.9, 16.3, 31.1),
              1.217 * g(l, 437.0, 11.8, 36.0) + 0.681 * g(l, 459.0, 26.0, 13.8));
}
const mat3 XYZ2RGB = mat3(3.2406, -0.9689, 0.0557, -1.5372, 1.8758, -0.2040, -0.4986, 0.0415, 1.0570);
vec3 film(float dMicron){
  const float n = 1.34, r2 = 0.0213;              // ((n-1)/(n+1))^2
  vec3 xyz = vec3(0.0), wsum = vec3(0.0);
  for (int i = 0; i < 24; i++) {
    float l = 395.0 + float(i) * 14.0;
    float delta = 12.566371 * n * dMicron * 1000.0 / l;
    float c = cos(delta);
    float R = 2.0 * r2 * (1.0 - c) / (1.0 + r2 * r2 - 2.0 * r2 * c);
    vec3 m = cmf(l);
    xyz += R * m; wsum += m;
  }
  return XYZ2RGB * (xyz / wsum.y);
}
void main(){
  float d = 2.0 * (gl_FragCoord.x - 0.5) / (uSize.x - 1.0);
  o = vec4(max(film(d), 0.0), 1.0);
}`);
  // The picture: the film's colour by thickness, lit by a broad soft light.
  var RENDER = program(`
uniform sampler2D uThick, uFilm;
uniform float uT, uAspect, uExpo;
uniform vec2 uHero, uHeroR;
void main(){
  vec2 uv = UV(), p = vec2(uv.x * uAspect, uv.y);
  float d = texture(uThick, uv).x;
  d += 0.010 * (n2(p * 40.0 + uT * 0.05) - 0.5) * smoothstep(0.02, 0.2, d);     // a little fine grain in the colour
  vec3 c = texture(uFilm, vec2(clamp(d / 2.0, 0.0, 1.0), 0.5)).rgb;
  c = mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, 0.86);
  // a broad light above and to the left, and a long soft highlight running across it
  float key = 0.55 + 0.45 * smoothstep(1.6, 0.0, length((p - vec2(uAspect * 0.25, 1.1)) * vec2(0.6, 1.0)));
  vec2 he = (p - uHero) / uHeroR;
  float calm = 0.55 + 0.45 * smoothstep(0.0, 1.0, dot(he, he));
  vec3 col = c * uExpo * key * calm;
  // slope of the film's surfaces (from its thickness) catches the light a little
  vec2 tx = 1.0 / vec2(textureSize(uThick, 0));
  vec2 grad = vec2(texture(uThick, uv + vec2(tx.x, 0.0)).x - texture(uThick, uv - vec2(tx.x, 0.0)).x,
                   texture(uThick, uv + vec2(0.0, tx.y)).x - texture(uThick, uv - vec2(0.0, tx.y)).x);
  col *= 1.0 + 6.0 * dot(grad, normalize(vec2(-0.6, 0.8))) * smoothstep(0.02, 0.15, d);
  vec2 vq = uv - 0.5; col *= 1.0 - 0.6 * dot(vq * vec2(1.0, 1.2), vq * vec2(1.0, 1.2));
  col = 1.0 - exp(-col * 1.2);
  col = pow(col, vec3(1.0 / 2.2));
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  o = vec4(col, 1.0);
}`);

  /* ---------- sizes ---------- */
  var W = 1, H = 1, dpr = 1, aspect = 1, vel, prs, thick, div, curl, sw = 0, sh = 0, tw = 0, th = 0;
  var LEVELS = [2, 1.25, 1], level = 0;              // sharpness cap; steps down by itself if frames run slow
  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, LEVELS[level]);
    W = Math.max(1, cv.clientWidth); H = Math.max(1, cv.clientHeight); aspect = W / H;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    var simRows = 180, dyeRows = Math.min(900, Math.round(H * 0.9));
    var nsw = Math.round(simRows * aspect), nsh = simRows, ntw = Math.round(dyeRows * aspect), nth = dyeRows;
    if (nsw === sw && nsh === sh && ntw === tw && nth === th) return;
    sw = nsw; sh = nsh; tw = ntw; th = nth;
    var old = vel ? { vel: vel, prs: prs, div: div, curl: curl, thick: thick } : null;
    vel = pair(sw, sh); prs = pair(sw, sh); div = target(sw, sh); curl = target(sw, sh); thick = pair(tw, th);
    if (old) {                                        // a resize carries the film over rather than starting again
      draw(COPY, thick.w, function (u, tex) { tex('uSrc', old.thick.r.tex); }); thick.swap();
      draw(COPY, vel.w, function (u, tex) { tex('uSrc', old.vel.r.tex); }); vel.swap();
      [old.vel.r, old.vel.w, old.prs.r, old.prs.w, old.div, old.curl, old.thick.r, old.thick.w].forEach(function (T) { gl.deleteTexture(T.tex); gl.deleteFramebuffer(T.fb); });
    } else {
      draw(INIT, thick.w, function (u) { gl.uniform1f(u.uK, THICK); gl.uniform1f(u.uAspect, aspect); }); thick.swap();
      gl.bindFramebuffer(gl.FRAMEBUFFER, vel.r.fb); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      simT = 0;
    }
  }
  function draw(P, T, set) {
    gl.useProgram(P.p);
    if (T) { gl.bindFramebuffer(gl.FRAMEBUFFER, T.fb); gl.viewport(0, 0, T.w, T.h); gl.uniform2f(P.u.uSize, T.w, T.h); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, cv.width, cv.height); gl.uniform2f(P.u.uSize, cv.width, cv.height); }
    var unit = 0;
    set(P.u, function (name, tex) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(P.u[name], unit); unit++; });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* ---------- pointer ---------- */
  // where the pointer is, where it was at the last step, how fast it is going (raw and smoothed), and when it last moved
  var ptr = { x: 0.5, y: 0.5, ax: 0.5, ay: 0.5, vx: 0, vy: 0, sx: 0, sy: 0 }, px = null, lastMove = -1e9;
  on(window, 'pointermove', function (e) {
    var r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = 1 - (e.clientY - r.top) / r.height, now = performance.now();
    if (px && now - px.t < 200) {
      var dt = Math.max(8, now - px.t) / 1000;
      ptr.vx = (x - px.x) * aspect / dt; ptr.vy = (y - px.y) / dt;
    } else { ptr.ax = x; ptr.ay = y; ptr.vx = 0; ptr.vy = 0; }
    ptr.x = x; ptr.y = y; px = { x: x, y: y, t: now }; lastMove = now;
  }, { passive: true });

  /* ---------- one step of the film ---------- */
  /* The film's own currents: drainage, plumes, slow swirls. It is run for a few seconds while the page loads to give
     it its shape, then keeps going at PACE of real time, so it drifts rather than churns. */
  var FLOW = { buoy: BUOY, stir: STIR, drag: 0.12, vort: 10.0, low: 1.0, feed: 1.0 };
  var DT = 1 / 60, PACE = 0.45, simT = 0;
  function step(M, dt, on) {
    simT += dt;
    var seg = [ptr.ax, ptr.ay, ptr.x, ptr.y];
    ptr.ax = ptr.x; ptr.ay = ptr.y;
    var vx = ptr.vx * 0.2, vy = ptr.vy * 0.2, m = Math.sqrt(vx * vx + vy * vy);   // the film follows the hand only a little
    if (m > 0.5) { vx *= 0.5 / m; vy *= 0.5 / m; }                      // and never faster than this, however quick the hand
    ptr.sx += (vx - ptr.sx) * 0.1; ptr.sy += (vy - ptr.sy) * 0.1;        // eased in and out
    draw(FORCE, vel.w, function (u, tex) { tex('uVel', vel.r.tex); tex('uThick', thick.r.tex); gl.uniform1f(u.uT, simT); gl.uniform1f(u.uDt, dt); gl.uniform1f(u.uAspect, aspect);
      gl.uniform1f(u.uBuoy, M.buoy); gl.uniform1f(u.uStir, M.stir); gl.uniform1f(u.uK, THICK); gl.uniform1f(u.uDrag, M.drag); gl.uniform1f(u.uOn, on);
      gl.uniform4f(u.uSeg, seg[0], seg[1], seg[2], seg[3]); gl.uniform2f(u.uPV, ptr.sx, ptr.sy); }); vel.swap();
    draw(CURL, curl, function (u, tex) { tex('uVel', vel.r.tex); });
    draw(VORT, vel.w, function (u, tex) { tex('uVel', vel.r.tex); tex('uCurl', curl.tex); gl.uniform1f(u.uDt, dt); gl.uniform1f(u.uAmt, M.vort); }); vel.swap();
    draw(DIV, div, function (u, tex) { tex('uVel', vel.r.tex); });
    for (var i = 0; i < 22; i++) { draw(JACOBI, prs.w, function (u, tex) { tex('uP', prs.r.tex); tex('uDiv', div.tex); }); prs.swap(); }
    draw(GRAD, vel.w, function (u, tex) { tex('uP', prs.r.tex); tex('uVel', vel.r.tex); }); vel.swap();
    draw(ADVECT, vel.w, function (u, tex) { tex('uVel', vel.r.tex); tex('uSrc', vel.r.tex); gl.uniform1f(u.uDt, dt); gl.uniform1f(u.uKeep, 0.999); gl.uniform1f(u.uAspect, aspect); }); vel.swap();
    draw(ADVECT, thick.w, function (u, tex) { tex('uVel', vel.r.tex); tex('uSrc', thick.r.tex); gl.uniform1f(u.uDt, dt); gl.uniform1f(u.uKeep, 1.0); gl.uniform1f(u.uAspect, aspect); }); thick.swap();
    draw(RELAX, thick.w, function (u, tex) { tex('uThick', thick.r.tex); gl.uniform1f(u.uDt, dt); gl.uniform1f(u.uT, simT); gl.uniform1f(u.uK, THICK); gl.uniform1f(u.uRelax, RELAXR);
      gl.uniform1f(u.uLow, M.low); gl.uniform1f(u.uFeed, M.feed); }); thick.swap();
  }
  function paint() {
    draw(RENDER, null, function (u, tex) { tex('uThick', thick.r.tex); tex('uFilm', spec.tex); gl.uniform1f(u.uT, simT); gl.uniform1f(u.uAspect, aspect); gl.uniform1f(u.uExpo, EXPO);
      gl.uniform2f(u.uHero, aspect * 0.5, 0.5 + 30 / H); gl.uniform2f(u.uHeroR, Math.min(470, W * 0.55) / H, (W < 700 ? 230 : 175) / H); });
  }

  var spec = target(1024, 1);
  draw(SPECTRUM, spec, function () {});
  layout();
  if (window.ResizeObserver) (ro = new ResizeObserver(function () { layout(); paint(); })).observe(cv);
  for (var w = 0; w < WARM; w++) step(FLOW, DT, 0);       // give the film its shape before it is first seen
  paint();
  if (reduce) return stop;
  var last = performance.now(), acc = 0, slow = 0, seen = 0;
  (function tick(now) {
    if (dead) return;
    raf = requestAnimationFrame(tick);
    var dt = now - last; last = now;
    if (document.hidden || !visible) return;
    var since = now - lastMove;
    var on = Math.max(0, 1 - since / 120);               // the brush only acts while the pointer is actually moving
    if (++seen > 30 && level < LEVELS.length - 1) { slow = slow * 0.95 + (dt > 24 ? 1 : 0) * 0.05; if (slow > 0.5) { level++; slow = 0; seen = 0; layout(); } }
    acc += Math.min(0.1, dt / 1000);
    var n = 0; while (acc >= DT && n < 2) { step(FLOW, DT * PACE, on); acc -= DT; n++; }
    if (n === 2) acc = 0;
    if (since > 120) { ptr.vx *= 0.8; ptr.vy *= 0.8; }
    paint();
  })(last);
  return stop;
};
  var cv = document.getElementById('art');
  if (cv) start(cv);
})();
