// Cap. 10 controller families. Builds continuous G_c(s) for each family,
// discretizes via Tustin into a runnable difference equation, and analyses
// the closed loop against the inverted-pendulum plant.
// All polynomials are DESCENDING-power coefficient arrays.

const PLANT_NUM = [10];
const PLANT_DEN = [1, 0.1, -9.81];

const conv = (a, b) => { const o = new Array(a.length + b.length - 1).fill(0); for (let i=0;i<a.length;i++) for (let j=0;j<b.length;j++) o[i+j]+=a[i]*b[j]; return o; };
const padd = (a, b) => { const n=Math.max(a.length,b.length), p=(x)=>Array(n-x.length).fill(0).concat(x); const pa=p(a),pb=p(b); return pa.map((v,i)=>v+pb[i]); };
const scale = (a, k) => a.map((v) => v * k);

// ── complex roots (Durand–Kerner) ──
const cmul=(a,b)=>({re:a.re*b.re-a.im*b.im,im:a.re*b.im+a.im*b.re}), csub=(a,b)=>({re:a.re-b.re,im:a.im-b.im});
const cdiv=(a,b)=>{const d=b.re*b.re+b.im*b.im;return{re:(a.re*b.re+a.im*b.im)/d,im:(a.im*b.re-a.re*b.im)/d};};
export const roots = (coeffs) => {
  let a = coeffs.slice(); while (a.length>1 && Math.abs(a[0])<1e-14) a=a.slice(1);
  const n=a.length-1; if(n<=0) return []; if(n===1) return [{re:-a[1]/a[0],im:0}];
  const c=a.map(v=>v/a[0]); const radius=1+Math.max(...c.slice(1).map(Math.abs)); let r=[];
  for(let k=0;k<n;k++){const ang=(2*Math.PI*k)/n+0.4; r.push({re:0.5*radius*Math.cos(ang),im:0.5*radius*Math.sin(ang)});}
  const horner=(x)=>{let acc={re:c[0],im:0};for(let i=1;i<c.length;i++){acc=cmul(acc,x);acc.re+=c[i];}return acc;};
  for(let it=0;it<200;it++){let md=0;r=r.map((ri,i)=>{const num=horner(ri);let den={re:1,im:0};for(let j=0;j<n;j++){if(j===i)continue;den=cmul(den,csub(ri,r[j]));}const dl=cdiv(num,den);md=Math.max(md,Math.hypot(dl.re,dl.im));return csub(ri,dl);});if(md<1e-13)break;}
  return r.map(x=>({re:x.re,im:Math.abs(x.im)<1e-7?0:x.im}));
};

// ── controller families ──
// Each: params metadata, tf(params) -> realizable {num,den}, display string.
const fmt = (v) => (Math.round(v * 100) / 100).toString();
export const FAMILIES = {
  P: {
    label: 'P', blurb: 'Pure gain. No poles/zeros added — only repositions the closed-loop poles.',
    params: [{ key: 'Kp', label: 'Kp', unit: '', min: 0, max: 40, step: 0.5, def: 12 }],
    def: { Kp: 12 },
    tf: (p) => ({ num: [p.Kp], den: [1] }),
    display: (p) => `${fmt(p.Kp)}`,
  },
  I: {
    label: 'I', blurb: 'Integrator: pole at origin, type +1. Alone it destabilises this plant.',
    params: [{ key: 'Ki', label: 'Ki', unit: '', min: 0, max: 20, step: 0.5, def: 4 }],
    def: { Ki: 4 },
    tf: (p) => ({ num: [p.Ki], den: [1, 0] }),
    display: (p) => `${fmt(p.Ki)} / s`,
  },
  PI: {
    label: 'PI', blurb: 'Pole at origin + zero at −Ki/Kp. Type +1 with n−m unchanged.',
    params: [
      { key: 'Kp', label: 'Kp', unit: '', min: 0, max: 40, step: 0.5, def: 8 },
      { key: 'Ki', label: 'Ki', unit: '', min: 0, max: 20, step: 0.5, def: 6 },
    ],
    def: { Kp: 8, Ki: 6 },
    tf: (p) => ({ num: [p.Kp, p.Ki], den: [1, 0] }),
    display: (p) => `(${fmt(p.Kp)}s + ${fmt(p.Ki)}) / s`,
  },
  PD: {
    label: 'PD', blurb: 'Adds an attractive zero + a filter pole at −N. Improves relative stability.',
    params: [
      { key: 'Kp', label: 'Kp', unit: '', min: 0, max: 40, step: 0.5, def: 12 },
      { key: 'Kd', label: 'Kd', unit: '', min: 0, max: 15, step: 0.5, def: 3 },
      { key: 'N', label: 'N (deriv. filter)', unit: '', min: 2, max: 100, step: 1, def: 20 },
    ],
    def: { Kp: 12, Kd: 3, N: 20 },
    tf: (p) => ({ num: [p.Kp + p.Kd * p.N, p.Kp * p.N], den: [1, p.N] }),
    display: (p) => `(${fmt(p.Kp + p.Kd * p.N)}s + ${fmt(p.Kp * p.N)}) / (s + ${fmt(p.N)})`,
  },
  PID: {
    label: 'PID', blurb: 'Two zeros + origin pole + filter pole. Buys precision and damping.',
    params: [
      { key: 'Kp', label: 'Kp', unit: '', min: 0, max: 40, step: 0.5, def: 15 },
      { key: 'Ki', label: 'Ki', unit: '', min: 0, max: 20, step: 0.5, def: 3 },
      { key: 'Kd', label: 'Kd', unit: '', min: 0, max: 15, step: 0.5, def: 3 },
      { key: 'N', label: 'N (deriv. filter)', unit: '', min: 2, max: 100, step: 1, def: 20 },
    ],
    def: { Kp: 15, Ki: 3, Kd: 3, N: 20 },
    tf: (p) => ({ num: [p.Kp + p.Kd * p.N, p.Kp * p.N + p.Ki, p.Ki * p.N], den: [1, p.N, 0] }),
    display: (p) => `(${fmt(p.Kp + p.Kd * p.N)}s² + ${fmt(p.Kp * p.N + p.Ki)}s + ${fmt(p.Ki * p.N)}) / (s² + ${fmt(p.N)}s)`,
  },
  Lead: {
    label: 'Lead', blurb: 'K(s+z)/(s+p), p>z: a tamed derivative — phase lead near crossover.',
    params: [
      { key: 'K', label: 'K', unit: '', min: 0, max: 60, step: 0.5, def: 20 },
      { key: 'z', label: 'zero −z', unit: '', min: 0.05, max: 20, step: 0.05, def: 2 },
      { key: 'p', label: 'pole −p', unit: '', min: 0.05, max: 30, step: 0.05, def: 12 },
    ],
    def: { K: 20, z: 2, p: 12 },
    tf: (p) => ({ num: [p.K, p.K * p.z], den: [1, p.p] }),
    display: (p) => `${fmt(p.K)}(s + ${fmt(p.z)}) / (s + ${fmt(p.p)})`,
  },
  Lag: {
    label: 'Lag', blurb: 'K(s+z)/(s+p), z>p: improves steady-state, adds phase lag. Won’t stabilise alone.',
    params: [
      { key: 'K', label: 'K', unit: '', min: 0, max: 60, step: 0.5, def: 3 },
      { key: 'z', label: 'zero −z', unit: '', min: 0.05, max: 20, step: 0.05, def: 4 },
      { key: 'p', label: 'pole −p', unit: '', min: 0.01, max: 20, step: 0.01, def: 0.5 },
    ],
    def: { K: 3, z: 4, p: 0.5 },
    tf: (p) => ({ num: [p.K, p.K * p.z], den: [1, p.p] }),
    display: (p) => `${fmt(p.K)}(s + ${fmt(p.z)}) / (s + ${fmt(p.p)})`,
  },
  LeadLag: {
    label: 'Lead-Lag', blurb: 'Cascaded lead × lag: damping from the lead stage, accuracy from the lag.',
    params: [
      { key: 'K', label: 'K', unit: '', min: 0, max: 60, step: 0.5, def: 18 },
      { key: 'z1', label: 'lead zero −z₁', unit: '', min: 0.05, max: 20, step: 0.05, def: 2 },
      { key: 'p1', label: 'lead pole −p₁', unit: '', min: 0.05, max: 30, step: 0.05, def: 12 },
      { key: 'z2', label: 'lag zero −z₂', unit: '', min: 0.02, max: 10, step: 0.02, def: 0.6 },
      { key: 'p2', label: 'lag pole −p₂', unit: '', min: 0.01, max: 10, step: 0.01, def: 0.1 },
    ],
    def: { K: 18, z1: 2, p1: 12, z2: 0.6, p2: 0.1 },
    tf: (p) => ({
      num: scale(conv([1, p.z1], [1, p.z2]), p.K),
      den: conv([1, p.p1], [1, p.p2]),
    }),
    display: (p) => `${fmt(p.K)}(s+${fmt(p.z1)})(s+${fmt(p.z2)}) / (s+${fmt(p.p1)})(s+${fmt(p.p2)})`,
  },
};

export const controllerTF = (family, params) => FAMILIES[family].tf(params);

export function openLoop(family, params) {
  const c = controllerTF(family, params);
  return { num: conv(c.num, PLANT_NUM), den: conv(c.den, PLANT_DEN) };
}
export function closedLoopPoles(family, params) {
  const ol = openLoop(family, params);
  return roots(padd(ol.den, ol.num));
}
export function controllerZeros(family, params) {
  return roots(controllerTF(family, params).num);
}

const valueAt0 = (poly) => poly[poly.length - 1] || 0;       // constant term = P(0)
const originPoles = (den) => { let c = 0; for (let i = den.length - 1; i >= 0; i--) { if (Math.abs(den[i]) < 1e-9) c++; else break; } return c; };

// Full closed-loop analysis used by the designer's "info before applying".
export function analyze(family, params) {
  const ol = openLoop(family, params);
  const charPoly = padd(ol.den, ol.num);
  const poles = roots(charPoly);
  const rhp = poles.filter((r) => r.re > 1e-6).length;
  const onAxis = poles.some((r) => Math.abs(r.re) < 1e-6);
  const stable = rhp === 0 && !onAxis;
  const dom = poles.reduce((a, b) => (b.re > a.re ? b : a), poles[0] || { re: 0, im: 0 });
  const wn = Math.hypot(dom.re, dom.im);
  const zeta = wn > 1e-9 ? -dom.re / wn : 0;
  const osc = Math.abs(dom.im) > 1e-6;
  const ts = stable && Math.abs(dom.re) > 1e-6 ? 4 / Math.abs(dom.re) : Infinity;
  const Mp = stable && osc && zeta > 0 && zeta < 1 ? Math.exp((-Math.PI * zeta) / Math.sqrt(1 - zeta * zeta)) : 0;
  const tp = osc ? Math.PI / Math.abs(dom.im) : Infinity;
  const type = originPoles(ol.den);
  const dcGain = valueAt0(ol.num) / (valueAt0(ol.den) + valueAt0(ol.num)); // closed-loop r→θ at s=0
  const essStep = stable ? Math.abs(1 - dcGain) : Infinity;
  return { charPoly, poles, rhp, onAxis, stable, dom, wn, zeta, ts, Mp, tp, type, dcGain, essStep, osc };
}

// Closed-loop step response (reference step → θ) via controllable canonical RK4.
export function stepResponse(family, params, { tEnd = 8, N = 320 } = {}) {
  const ol = openLoop(family, params);
  const clDen = padd(ol.den, ol.num);
  const clNum = ol.num;
  let d = clDen.slice(); const lead = d[0] || 1; d = d.map((v) => v / lead);
  const num = clNum.map((v) => v / lead);
  const order = d.length - 1;
  if (order < 1) return { pts: [], yss: 0 };
  const A = Array.from({ length: order }, () => new Array(order).fill(0));
  for (let i = 0; i < order - 1; i++) A[i][i + 1] = 1;
  for (let j = 0; j < order; j++) A[order - 1][j] = -d[order - j];
  const C = new Array(order).fill(0);
  for (let i = 0; i < num.length; i++) { const pw = num.length - 1 - i; if (pw < order) C[pw] = num[i]; }
  let x = new Array(order).fill(0);
  const f = (xx) => A.map((row, ri) => row.reduce((s, aij, j) => s + aij * xx[j], 0) + (ri === order - 1 ? 1 : 0));
  const dt = tEnd / N; const pts = [];
  for (let k = 0; k <= N; k++) {
    const y = C.reduce((s, ci, i) => s + ci * x[i], 0);
    pts.push({ t: k * dt, y });
    if (!isFinite(y) || Math.abs(y) > 1e4) break;
    const k1 = f(x), k2 = f(x.map((v, i) => v + (dt / 2) * k1[i])), k3 = f(x.map((v, i) => v + (dt / 2) * k2[i])), k4 = f(x.map((v, i) => v + dt * k3[i]));
    x = x.map((v, i) => v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
  }
  const a = analyze(family, params);
  return { pts, yss: a.stable ? a.dcGain : NaN };
}

// ── Tustin (bilinear) discretization: continuous {num,den} → {b,a} in z⁻¹ ──
const polyPow = (base, k) => { let r = [1]; for (let i = 0; i < k; i++) r = conv(r, base); return r; };
export function bilinear(numS, denS, Ts) {
  const c = 2 / Ts;
  const N = Math.max(numS.length, denS.length) - 1;
  const pad = (p) => Array(N + 1 - p.length).fill(0).concat(p);
  const ns = pad(numS), ds = pad(denS);
  const oneMinus = [1, -1], onePlus = [1, 1];
  const buildZ = (coeffsS) => {
    const acc = new Array(N + 1).fill(0);
    for (let i = 0; i <= N; i++) {
      const k = N - i;                       // power of s
      const coef = coeffsS[i] * Math.pow(c, k);
      const term = conv(polyPow(oneMinus, k), polyPow(onePlus, N - k));
      for (let j = 0; j < term.length; j++) acc[j] += coef * term[j];
    }
    return acc;
  };
  let b = buildZ(ns), a = buildZ(ds);
  const a0 = a[0] || 1;
  return { b: b.map((v) => v / a0), a: a.map((v) => v / a0) };
}
export const discretize = (family, params, Ts) => { const c = controllerTF(family, params); return bilinear(c.num, c.den, Ts); };

// Generic recursive controller from {b,a} (a[0]=1), read live via getCoeffs.
export function makeDiscreteController(getCoeffs, uMax = 50) {
  let e = [], y = [];
  return {
    reset() { e = []; y = []; },
    step(err) {
      const { b, a } = getCoeffs();
      e.unshift(err); if (e.length > b.length) e.length = b.length;
      let out = 0;
      for (let i = 0; i < b.length; i++) out += b[i] * (e[i] || 0);
      for (let i = 1; i < a.length; i++) out -= a[i] * (y[i - 1] || 0);
      out = Math.max(-uMax, Math.min(uMax, out));
      y.unshift(out); if (y.length > Math.max(1, a.length - 1)) y.length = Math.max(1, a.length - 1);
      return out;
    },
  };
}