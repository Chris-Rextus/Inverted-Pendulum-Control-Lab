import React, { useMemo, useRef, useState } from 'react';

const VB = 380, CX = 150, CY = 190, SCALE = 26;

// ── local polynomial / root helpers (self-contained) ──
const conv = (a, b) => { const o = new Array(a.length + b.length - 1).fill(0); for (let i=0;i<a.length;i++) for (let j=0;j<b.length;j++) o[i+j]+=a[i]*b[j]; return o; };
const padd = (a, b) => { const n=Math.max(a.length,b.length), p=(x)=>Array(n-x.length).fill(0).concat(x); const pa=p(a),pb=p(b); return pa.map((v,i)=>v+pb[i]); };
const scale = (a, k) => a.map((v) => v * k);
const cmul=(a,b)=>({re:a.re*b.re-a.im*b.im,im:a.re*b.im+a.im*b.re}), csub=(a,b)=>({re:a.re-b.re,im:a.im-b.im});
const cdiv=(a,b)=>{const d=b.re*b.re+b.im*b.im;return{re:(a.re*b.re+a.im*b.im)/d,im:(a.im*b.re-a.re*b.im)/d};};
const polyRoots = (coeffs) => {
  let a = coeffs.slice(); while (a.length>1 && Math.abs(a[0])<1e-14) a=a.slice(1);
  const n=a.length-1; if(n<=0) return []; if(n===1) return [{re:-a[1]/a[0],im:0}];
  const c=a.map(v=>v/a[0]); const radius=1+Math.max(...c.slice(1).map(Math.abs)); let r=[];
  for(let k=0;k<n;k++){const ang=(2*Math.PI*k)/n+0.4; r.push({re:0.5*radius*Math.cos(ang),im:0.5*radius*Math.sin(ang)});}
  const horner=(x)=>{let acc={re:c[0],im:0};for(let i=1;i<c.length;i++){acc=cmul(acc,x);acc.re+=c[i];}return acc;};
  for(let it=0;it<200;it++){let md=0;r=r.map((ri,i)=>{const num=horner(ri);let den={re:1,im:0};for(let j=0;j<n;j++){if(j===i)continue;den=cmul(den,csub(ri,r[j]));}const dl=cdiv(num,den);md=Math.max(md,Math.hypot(dl.re,dl.im));return csub(ri,dl);});if(md<1e-13)break;}
  return r.map(x=>({re:x.re,im:Math.abs(x.im)<1e-7?0:x.im}));
};

function openLoop(ctrlType, gains, plantNum, plantDen) {
  let cNum, cDen;
  switch (ctrlType) {
    case 'P':   cNum = [1];                          cDen = [1];    break;
    case 'I':   cNum = [1];                          cDen = [1, 0]; break;
    case 'PI':  cNum = [1, gains.Ki / (gains.Kp||1)];cDen = [1, 0]; break;
    case 'PD':  cNum = [1, gains.Kp / (gains.Kd||1)];cDen = [1];    break;
    case 'PID': cNum = [1, gains.Kp/(gains.Kd||1), gains.Ki/(gains.Kd||1)]; cDen = [1, 0]; break;
    default:    cNum = [1];                          cDen = [1];
  }
  return { num: conv(cNum, plantNum), den: conv(cDen, plantDen) };
}

function matchOrder(prev, roots) {
  if (!prev) return roots.slice().sort((a, b) => a.re - b.re || a.im - b.im);
  const used = new Array(roots.length).fill(false), out = [];
  for (let i = 0; i < prev.length; i++) {
    let best = -1, bd = Infinity;
    for (let j = 0; j < roots.length; j++) {
      if (used[j]) continue;
      const d = (roots[j].re - prev[i].re) ** 2 + (roots[j].im - prev[i].im) ** 2;
      if (d < bd) { bd = d; best = j; }
    }
    used[best] = true; out.push(roots[best]);
  }
  return out;
}

export default function RootLocus({ ctrlType, gains, onApply, onClose }) {
  const plantNum = [10], plantDen = [1, 0.1, -9.81];
  const [Kmax, setKmax] = useState(80);
  const [K, setK] = useState(10);

  const { num, den } = useMemo(() => openLoop(ctrlType, gains, plantNum, plantDen), [ctrlType, gains]);
  const olPoles = useMemo(() => polyRoots(den), [den]);
  const olZeros = useMemo(() => polyRoots(num), [num]);
  const n = den.length - 1, m = num.length - 1;

  const { branches, samples } = useMemo(() => {
    const STEPS = 360, smp = [];
    let prev = null;
    for (let i = 0; i <= STEPS; i++) {
      const k = (i / STEPS) ** 2 * Kmax;
      let roots = polyRoots(padd(den, scale(num, k)));
      roots = matchOrder(prev, roots); prev = roots;
      smp.push({ k, roots });
    }
    const br = [];
    for (let b = 0; b < n; b++) br.push(smp.map((s) => ({ k: s.k, ...s.roots[b] })));
    return { branches: br, samples: smp };
  }, [num, den, Kmax, n]);

  const na = n - m;
  const centroid = na > 0 ? (olPoles.reduce((a, p) => a + p.re, 0) - olZeros.reduce((a, z) => a + z.re, 0)) / na : 0;
  const asymAngles = []; for (let k = 0; k < na; k++) asymAngles.push(((2 * k + 1) * 180) / na);

  let jw = null, Kcr = null;
  for (let i = 1; i < samples.length; i++) {
    const a = Math.max(...samples[i - 1].roots.map((r) => r.re));
    const b = Math.max(...samples[i].roots.map((r) => r.re));
    if (a !== 0 && Math.sign(a) !== Math.sign(b)) {
      const t = a / (a - b);
      Kcr = samples[i - 1].k + t * (samples[i].k - samples[i - 1].k);
      const cr = samples[i].roots.reduce((x, r) => (Math.abs(r.re) < Math.abs(x.re) ? r : x));
      jw = Math.abs(cr.im); break;
    }
  }

  const liverPoles = useMemo(() => polyRoots(padd(den, scale(num, K))), [num, den, K]);
  const liveStable = liverPoles.every((r) => r.re < 1e-6);
  const maxRe = Math.max(...liverPoles.map((r) => r.re));

  // ── geometry ──
  const sx = (re) => CX + re * SCALE;
  const sy = (im) => CY - im * SCALE;
  const path = (br) => br.map((p, i) => `${i ? 'L' : 'M'}${sx(p.re).toFixed(1)},${sy(p.im).toFixed(1)}`).join(' ');
  const branchColors = ['#fbbf24', '#34d399', '#f472b6', '#60a5fa', '#a78bfa'];

  const grid = [];
  for (let v = -10; v <= 4; v += 2) grid.push(<line key={`vx${v}`} x1={sx(v)} y1={0} x2={sx(v)} y2={VB} stroke="#1e293b" strokeWidth="1" />);
  for (let v = -6; v <= 6; v += 2) grid.push(<line key={`hz${v}`} x1={0} y1={sy(v)} x2={VB} y2={sy(v)} stroke="#1e293b" strokeWidth="1" />);

  // direction arrow at ~45% along a branch (points toward increasing K)
  const arrow = (br, color, key) => {
    if (br.length < 6) return null;
    const i = Math.floor(br.length * 0.45);
    const x = sx(br[i].re), y = sy(br[i].im);
    const ang = (Math.atan2(sy(br[i + 1].im) - sy(br[i - 1].im), sx(br[i + 1].re) - sx(br[i - 1].re)) * 180) / Math.PI;
    return <g key={key} transform={`translate(${x},${y}) rotate(${ang})`}><path d="M -5 -3.5 L 4 0 L -5 3.5 Z" fill={color} /></g>;
  };

  // ── plain-language narrative that updates with K ──
  const fmtZeros = olZeros.length ? olZeros.map((z) => `−${(-z.re).toFixed(2)}`).join(', ') : null;
  const whatItAdds = {
    P:  'For P control, the swept gain K is exactly your proportional gain. No controller pole or zero is added — the curve shape comes purely from the pendulum itself.',
    I:  'The integrator adds an extra pole at the origin (the × sitting at 0). It drags branches toward the unstable side — pure integral action fights stability.',
    PI: `The PI controller adds a pole at the origin and a zero at ${fmtZeros || '−Ki/Kp'} (the ○). K then sweeps the overall loop gain on top of that fixed shape.`,
    PD: `The PD controller adds a zero at ${fmtZeros || '−Kp/Kd'} (the ○). That zero pulls the branches leftward — more damping, better relative stability. K sweeps the overall gain.`,
    PID:`The PID controller adds a pole at the origin plus zeros at ${fmtZeros || 'positions set by Kp, Ki, Kd'}. K sweeps the overall gain.`,
  }[ctrlType] || '';

  let narrative, nClass;
  if (liveStable) {
    narrative = `At K = ${K.toFixed(1)}, every closed-loop pole sits in the left half-plane (rightmost at σ = ${maxRe.toFixed(2)}). The pendulum is held upright.` +
      (Kcr != null ? ` You're above the stability boundary K_cr ≈ ${Kcr.toFixed(1)} — turning K back down below it would let it fall again.` : '');
    nClass = 'border-emerald-700 bg-emerald-950/40 text-emerald-200';
  } else if (Kcr != null && K < Kcr) {
    narrative = `At K = ${K.toFixed(1)}, a pole is still in the right half-plane (rightmost at σ = ${maxRe.toFixed(2)} > 0) — the controller is too weak and the pendulum falls. Slide K up past K_cr ≈ ${Kcr.toFixed(1)} and watch the poles cross into the green region.`;
    nClass = 'border-red-800 bg-red-950/40 text-red-200';
  } else {
    narrative = `At K = ${K.toFixed(1)}, a pole is in the right half-plane (σ = ${maxRe.toFixed(2)} > 0) — unstable.` +
      (Kcr == null ? ` This controller's branches never cross into the left half-plane within K ≤ ${Kmax}, so no gain stabilizes it here.` : '');
    nClass = 'border-red-800 bg-red-950/40 text-red-200';
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-slate-700">
          <div>
            <h2 className="text-sm font-bold text-amber-400">Root Locus — Cap. 9 ({ctrlType} controller on the pendulum)</h2>
            <p className="text-[11px] text-slate-500">Where do the closed-loop poles go as you turn the controller gain up?</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-lg leading-none">✕</button>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-[auto_1fr] gap-3 p-3 overflow-y-auto">
          {/* locus plot */}
          <div className="flex flex-col gap-2">
            <svg viewBox={`0 0 ${VB} ${VB}`} width="380" height="380" className="rounded-lg bg-slate-950">
              <rect x="0" y="0" width={sx(0)} height={VB} fill="#10b98112" />
              <rect x={sx(0)} y="0" width={VB - sx(0)} height={VB} fill="#ef444412" />
              {grid}
              <line x1="0" y1={CY} x2={VB} y2={CY} stroke="#475569" strokeWidth="1.5" />
              <line x1={sx(0)} y1="0" x2={sx(0)} y2={VB} stroke="#64748b" strokeWidth="2" />
              <text x={sx(0) + 5} y="13" fontSize="11" fill="#64748b">jω</text>
              <text x={VB - 12} y={CY - 6} fontSize="11" fill="#64748b">σ</text>
              <text x="6" y={VB - 8} fontSize="10" fill="#34d399">stable half-plane</text>
              <text x={sx(0) + 6} y={VB - 8} fontSize="10" fill="#f87171">unstable half-plane</text>

              {asymAngles.map((deg, i) => {
                const rad = (deg * Math.PI) / 180, len = 9;
                return <line key={`as${i}`} x1={sx(centroid)} y1={sy(0)}
                  x2={sx(centroid + len * Math.cos(rad))} y2={sy(len * Math.sin(rad))}
                  stroke="#475569" strokeWidth="1" strokeDasharray="4 4" />;
              })}
              {na > 0 && <circle cx={sx(centroid)} cy={sy(0)} r="3" fill="#94a3b8" />}

              {branches.map((br, i) => (
                <path key={`b${i}`} d={path(br)} fill="none" stroke={branchColors[i % branchColors.length]} strokeWidth="2" opacity="0.85" />
              ))}
              {branches.map((br, i) => arrow(br, branchColors[i % branchColors.length], `ar${i}`))}

              {/* open-loop poles × (= branch starts, K=0) and zeros ○ (= branch ends, K→∞) */}
              {olPoles.map((p, i) => (
                <g key={`op${i}`} stroke="#cbd5e1" strokeWidth="2.5">
                  <line x1={sx(p.re) - 6} y1={sy(p.im) - 6} x2={sx(p.re) + 6} y2={sy(p.im) + 6} />
                  <line x1={sx(p.re) - 6} y1={sy(p.im) + 6} x2={sx(p.re) + 6} y2={sy(p.im) - 6} />
                </g>
              ))}
              {olZeros.map((z, i) => <circle key={`oz${i}`} cx={sx(z.re)} cy={sy(z.im)} r="6" fill="none" stroke="#60a5fa" strokeWidth="2.5" />)}

              {/* jω crossing */}
              {jw != null && jw > 0.01 && (
                <>
                  <circle cx={sx(0)} cy={sy(jw)} r="4" fill="#f87171" />
                  <circle cx={sx(0)} cy={sy(-jw)} r="4" fill="#f87171" />
                </>
              )}

              {/* live poles at current K */}
              {liverPoles.map((p, i) => (
                <circle key={`lp${i}`} cx={sx(p.re)} cy={sy(p.im)} r="6" fill={liveStable ? '#fde047' : '#fb923c'} stroke="#0b1220" strokeWidth="2" />
              ))}
            </svg>
            <div className="text-[10px] text-slate-400 leading-snug space-y-0.5">
              <div><span className="text-slate-200">✕ white</span> = open-loop poles, where each branch <span className="text-slate-200">starts at K = 0</span> (the pendulum's own physics).</div>
              <div><span className="text-blue-400">○ blue</span> = open-loop zeros, where branches <span className="text-slate-200">end as K → ∞</span>. Arrows show the travel direction.</div>
              <div><span className="text-yellow-300">● yellow/orange</span> = your poles right now at K = {K.toFixed(1)}. <span className="text-red-400">● red</span> = the jω crossing.</div>
            </div>
          </div>

          {/* readouts */}
          <div className="min-w-0 space-y-3 text-xs">
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2 text-slate-300 leading-snug">
              <span className="text-cyan-400 font-bold">How to read this. </span>
              Each colored curve is the trajectory of one closed-loop pole as the gain K rises from 0. Closing the loop with more gain drags the poles off their open-loop start (×) toward the zeros (○) or to infinity. The pendulum is stable only while <em>all</em> live poles (yellow) are left of the jω axis.
            </div>

            <div className="rounded-lg border border-slate-800 p-2">
              <div className="flex justify-between mb-1">
                <span className="text-cyan-400 font-bold">Controller authority — gain K</span>
                <span className="font-mono text-amber-300">{K.toFixed(2)}</span>
              </div>
              <input type="range" min={0} max={Kmax} step={Kmax / 400} value={K} onChange={(e) => setK(parseFloat(e.target.value))} className="w-full accent-amber-500" />
              <div className="relative h-5 mt-0.5 text-[9px]">
                <span className="absolute left-0 text-slate-500">0 (no control)</span>
                {Kcr != null && Kcr <= Kmax && (
                  <div className="absolute flex flex-col items-center" style={{ left: `${(Kcr / Kmax) * 100}%`, transform: 'translateX(-50%)' }}>
                    <div className="w-px h-2 bg-red-400" />
                    <span className="text-red-400 whitespace-nowrap">K_cr {Kcr.toFixed(1)}</span>
                  </div>
                )}
                <span className="absolute right-0 text-slate-500">{Kmax}</span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-[11px]">
                <span className="text-slate-400">range:</span>
                <button onClick={() => setKmax((v) => Math.max(10, v - 20))} className="px-1.5 rounded bg-slate-800">−</button>
                <span className="font-mono">0–{Kmax}</span>
                <button onClick={() => setKmax((v) => v + 20)} className="px-1.5 rounded bg-slate-800">+</button>
                <span className={`ml-auto font-bold ${liveStable ? 'text-emerald-400' : 'text-red-400'}`}>{liveStable ? '✓ stable here' : '✗ unstable here'}</span>
              </div>
            </div>

            <div className={`rounded-lg border p-2 leading-snug ${nClass}`}>
              {narrative}
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2 text-slate-300 leading-snug">
              <span className="text-cyan-400 font-bold">What {ctrlType} adds. </span>{whatItAdds}
            </div>

            <div className="rounded-lg border border-slate-800 p-2">
              <div className="text-cyan-400 font-bold mb-1">Locus descriptors (the Cap. 9 construction rules)</div>
              <div className="grid grid-cols-[1fr_auto_1.4fr] gap-x-2 gap-y-0.5 items-baseline">
                <span className="text-slate-400">Branches (n)</span><span className="font-mono text-right">{n}</span><span className="text-[10px] text-slate-500">one per closed-loop pole</span>
                <span className="text-slate-400">Finite zeros (m)</span><span className="font-mono text-right">{m}</span><span className="text-[10px] text-slate-500">where branches terminate</span>
                <span className="text-slate-400">Asymptotes (n−m)</span><span className="font-mono text-right">{na}</span><span className="text-[10px] text-slate-500">branches escaping to ∞</span>
                <span className="text-slate-400">Angles</span><span className="font-mono text-right">{asymAngles.map((a) => a.toFixed(0) + '°').join(',') || '—'}</span><span className="text-[10px] text-slate-500">direction they escape</span>
                <span className="text-slate-400">Centroid σ_c</span><span className="font-mono text-right">{na > 0 ? centroid.toFixed(2) : '—'}</span><span className="text-[10px] text-slate-500">asymptotes meet here</span>
                <span className="text-slate-400">K_cr</span><span className="font-mono text-right">{Kcr != null ? Kcr.toFixed(2) : 'none'}</span><span className="text-[10px] text-slate-500">gain at the jω crossing</span>
                <span className="text-slate-400">ω at crossing</span><span className="font-mono text-right">{jw != null ? jw.toFixed(2) : '—'}</span><span className="text-[10px] text-slate-500">oscillation freq there</span>
              </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-t border-slate-700">
          <button onClick={() => onApply(padd(den, scale(num, K)))}
            className="px-3 py-1.5 rounded text-sm font-semibold bg-amber-500 text-slate-900">
            Send K = {K.toFixed(2)} poles to pendulum →
          </button>
          <span className="text-[11px] text-slate-500">Drops the closed-loop poles at this K into the plant's linear mode so you can watch them play out.</span>
          <button onClick={onClose} className="ml-auto px-3 py-1.5 rounded text-sm bg-slate-700 hover:bg-slate-600">Close</button>
        </div>
      </div>
    </div>
  );
}