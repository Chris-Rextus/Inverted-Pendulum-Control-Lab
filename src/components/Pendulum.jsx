import React, { useEffect, useRef } from 'react';

const DT = 1 / 600;
const STEPS_PER_FRAME = 10;

// Companion (controllable canonical) matrix of a monic'd descending poly.
function buildCompanion(den) {
  let d = den.slice();
  const lead = d[0] || 1;
  d = d.map((v) => v / lead);
  const n = d.length - 1;
  const A = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n - 1; i++) A[i][i + 1] = 1;
  for (let j = 0; j < n; j++) A[n - 1][j] = -d[n - j];
  return { A, n };
}

export default function Pendulum({
  gravity = 9.81, length = 1.0, mass = 0.1, damping = 0.01,
  initialAngle = 8, initialOmega = 0,
  inputTorque = 0, setpoint = 0, controlFn = null, uMax = 50,
  running = false, resetSignal = 0, disturbSignal = 0, disturbDeg = 15,
  onSample = null, showArc = true, showTrail = true,
  mode = 'nonlinear',   // 'nonlinear' = physical plant | 'linear' = s-plane natural response
  linearDen = null,     // descending char-poly coeffs, used when mode === 'linear'
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const sizeRef = useRef({ w: 300, h: 300, dpr: 1 });

  const thetaRef = useRef((initialAngle * Math.PI) / 180);
  const omegaRef = useRef(initialOmega);
  const tRef = useRef(0);
  const uRef = useRef(0);
  const trailRef = useRef([]);
  const xRef = useRef(null);   // linear-mode state vector

  const p = useRef({});
  p.current = { gravity, length, mass, damping, inputTorque, setpoint,
    controlFn, uMax, running, showArc, showTrail, onSample, mode, linearDen };

  const initLinear = () => {
    if (!linearDen || linearDen.length < 2) { xRef.current = null; return; }
    const n = linearDen.length - 1;
    const x = new Array(n).fill(0);
    x[0] = (initialAngle * Math.PI) / 180; // θ₀ displacement
    xRef.current = x;
  };

  // explicit reset
  useEffect(() => {
    thetaRef.current = (initialAngle * Math.PI) / 180;
    omegaRef.current = initialOmega;
    tRef.current = 0; trailRef.current = [];
    if (mode === 'linear') initLinear();
  }, [resetSignal]); // eslint-disable-line

  // re-init linear state when mode or polynomial changes
  useEffect(() => {
    if (mode === 'linear') { initLinear(); tRef.current = 0; trailRef.current = []; thetaRef.current = (initialAngle * Math.PI) / 180; }
  }, [mode, linearDen]); // eslint-disable-line

  // dialing θ₀ while paused repositions the rod (both modes)
  useEffect(() => {
    if (!running) {
      thetaRef.current = (initialAngle * Math.PI) / 180;
      omegaRef.current = initialOmega; trailRef.current = [];
      if (mode === 'linear') initLinear();
    }
  }, [initialAngle, initialOmega, running]); // eslint-disable-line

  useEffect(() => {
    if (disturbSignal > 0) {
      const kick = (disturbDeg * Math.PI) / 180;
      thetaRef.current += kick;
      if (mode === 'linear' && xRef.current) xRef.current[0] += kick;
    }
  }, [disturbSignal]); // eslint-disable-line

  useEffect(() => {
    const ro = new ResizeObserver(([entry]) => {
      const cr = entry.contentRect;
      const dpr = window.devicePixelRatio || 1;
      sizeRef.current = { w: cr.width, h: cr.height, dpr };
      const cv = canvasRef.current;
      if (cv) { cv.width = cr.width * dpr; cv.height = cr.height * dpr; }
    });
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let raf, lastSample = 0;
    const loop = () => {
      const c = p.current;
      if (c.running) {
        for (let i = 0; i < STEPS_PER_FRAME; i++) {
          if (c.mode === 'linear' && c.linearDen && xRef.current) {
            const { A, n } = buildCompanion(c.linearDen);
            const x = xRef.current;
            const f = (xx) => A.map((row) => row.reduce((s, aij, j) => s + aij * xx[j], 0));
            const k1 = f(x);
            const k2 = f(x.map((v, j) => v + (DT / 2) * k1[j]));
            const k3 = f(x.map((v, j) => v + (DT / 2) * k2[j]));
            const k4 = f(x.map((v, j) => v + DT * k3[j]));
            for (let j = 0; j < n; j++) x[j] += (DT / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]);
            thetaRef.current = x[0];
            omegaRef.current = n > 1 ? x[1] : 0;
            uRef.current = 0;
            tRef.current += DT;
            if (!isFinite(x[0]) || Math.abs(x[0]) > 1e3) { c.running = false; }
          } else {
            const ml2 = c.mass * c.length * c.length;
            const beta = c.damping / ml2;          // damping rate (the stiff one)
            const alpha = c.gravity / c.length;    // gravity term
            const e = (c.setpoint * Math.PI) / 180 - thetaRef.current;
            let u = c.inputTorque;
            if (c.controlFn) u += c.controlFn(thetaRef.current, omegaRef.current, tRef.current, e);
            u = Math.max(-c.uMax, Math.min(c.uMax, u));
            uRef.current = u;

            // Adaptive sub-stepping driven by the fastest timescale (damping or
            // pendulum rate). u is held constant across sub-steps so the discrete
            // controller still samples at exactly 1/600 Hz.
            const rate = beta + Math.sqrt(Math.abs(alpha)) + 1e-6;
            const sub = Math.max(1, Math.min(2000, Math.ceil((DT * rate) / 0.25)));
            const h = DT / sub;
            let th = thetaRef.current, om = omegaRef.current;
            for (let s = 0; s < sub; s++) {
              // Semi-implicit Euler with IMPLICIT damping: unconditionally stable
              // for any beta, so arbitrarily large b can't make it diverge.
              om = (om + h * (alpha * Math.sin(th) + u / ml2)) / (1 + h * beta);
              th = th + h * om;
            }
            thetaRef.current = th;
            omegaRef.current = om;
            tRef.current += DT;
          }
        }
      }
      draw();
      const now = performance.now();
      if (c.onSample && now - lastSample > 50) {
        lastSample = now;
        c.onSample({ t: tRef.current, theta: thetaRef.current, omega: omegaRef.current, u: uRef.current });
      }
      raf = requestAnimationFrame(loop);
    };

    const draw = () => {
      const cv = canvasRef.current;
      if (!cv) return;
      const ctx = cv.getContext('2d');
      const { w, h, dpr } = sizeRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const c = p.current;
      const theta = thetaRef.current;
      const px = w / 2, py = h / 2;
      const L = Math.min(w, h) * 0.40;
      const sp = (c.setpoint * Math.PI) / 180;
      const err = Math.atan2(Math.sin(theta - sp), Math.cos(theta - sp)); // wrapped error from setpoint
      const danger = Math.abs(err) > Math.PI / 4;
      const bx = px + L * Math.sin(theta), by = py - L * Math.cos(theta);

      ctx.fillStyle = danger ? '#180f14' : '#0b1220';
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(148,163,184,0.30)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + L * Math.sin(sp), py - L * Math.cos(sp)); ctx.stroke();
      ctx.setLineDash([]);

      if (c.showTrail && c.running) { trailRef.current.push({ x: bx, y: by }); if (trailRef.current.length > 60) trailRef.current.shift(); }
      if (c.showTrail && trailRef.current.length > 1) {
        ctx.strokeStyle = 'rgba(56,189,248,0.22)'; ctx.lineWidth = 2; ctx.beginPath();
        trailRef.current.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y))); ctx.stroke();
      }
      if (c.showArc) {
        ctx.strokeStyle = 'rgba(56,189,248,0.6)'; ctx.lineWidth = 2; ctx.beginPath();
        ctx.arc(px, py, Math.max(22, L * 0.18), -Math.PI / 2, -Math.PI / 2 + theta, theta < 0); ctx.stroke();
      }

      const bobR = Math.max(8, Math.min(30, L * 0.05 + c.mass * 40));
      ctx.lineCap = 'round';
      ctx.strokeStyle = danger ? '#ef4444' : '#e2e8f0'; ctx.lineWidth = Math.max(3, L * 0.025);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(bx, by); ctx.stroke();
      ctx.fillStyle = danger ? '#ef4444' : '#38bdf8';
      ctx.beginPath(); ctx.arc(bx, by, bobR, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = '#94a3b8'; ctx.beginPath(); ctx.arc(px, py, 5, 0, 2 * Math.PI); ctx.fill();

      ctx.font = '13px ui-monospace, monospace';
      ctx.fillStyle = danger ? '#fca5a5' : '#7dd3fc';
      ctx.fillText(`θ = ${(theta * 180 / Math.PI).toFixed(1)}°`, 12, 22);
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`ω = ${omegaRef.current.toFixed(2)} rad/s`, 12, 40);
      if (c.mode === 'linear') ctx.fillText('linear mode (natural response)', 12, 58);
      else ctx.fillText(`u = ${uRef.current.toFixed(1)} N·m`, 12, 58);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={wrapRef} className="w-full h-full">
      <canvas ref={canvasRef} className="block w-full h-full rounded" />
    </div>
  );
}