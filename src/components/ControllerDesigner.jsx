import React, { useMemo, useState } from 'react';
import { FAMILIES, analyze, stepResponse, controllerZeros } from '../control/compensator.js';

const PRESETS = [
  { name: 'Stabilising PD', family: 'PD', params: { Kp: 12, Kd: 3, N: 20 } },
  { name: 'Aggressive PID', family: 'PID', params: { Kp: 22, Ki: 4, Kd: 5, N: 40 } },
  { name: 'Lead compensator', family: 'Lead', params: { K: 24, z: 2.5, p: 16 } },
  { name: 'Lag (watch it fall)', family: 'Lag', params: { K: 3, z: 4, p: 0.5 } },
  { name: 'Integral only (unstable)', family: 'I', params: { Ki: 4 } },
];

function Field({ p, value, onChange }) {
  const commit = (raw) => {
    if (raw === '' || raw === '-' || raw === '.') return;
    const v = parseFloat(raw);
    if (!Number.isNaN(v)) onChange(v);
  };
  return (
    <div>
      <div className="flex justify-between items-center text-[11px] mb-0.5">
        <span className="text-slate-300">{p.label}</span>
        <span className="flex items-center gap-1">
          <input
            type="number" step={p.step} value={value}
            onChange={(e) => commit(e.target.value)}
            className="w-16 px-1 py-0.5 text-right font-mono text-amber-300 bg-slate-800 border border-slate-700 rounded
                       focus:outline-none focus:border-amber-500 [appearance:textfield]
                       [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          {p.unit && <span className="text-slate-500">{p.unit}</span>}
        </span>
      </div>
      <input
        type="range" min={p.min} max={p.max} step={p.step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-amber-500"
      />
    </div>
  );
}

export default function ControllerDesigner({ currentDesign, onRunLive, onSendPoles, onClose }) {
  const [family, setFamily] = useState(currentDesign?.family || 'PD');
  const [params, setParams] = useState(currentDesign?.params || FAMILIES.PD.def);

  const pickFamily = (f) => { setFamily(f); setParams({ ...FAMILIES[f].def }); };
  const setParam = (k, v) => setParams((p) => ({ ...p, [k]: v }));
  const loadPreset = (pr) => { setFamily(pr.family); setParams({ ...pr.params }); };

  const a = useMemo(() => analyze(family, params), [family, params]);
  const step = useMemo(() => stepResponse(family, params), [family, params]);
  const zeros = useMemo(() => controllerZeros(family, params), [family, params]);

  const verdict = a.stable ? 'stable' : a.onAxis && a.rhp === 0 ? 'marginal' : 'unstable';
  const vColor = { stable: 'text-emerald-400', marginal: 'text-amber-400', unstable: 'text-red-400' }[verdict];

  // step chart geometry
  const yvals = step.pts.map((d) => d.y);
  const ylo = Math.min(0, ...yvals), yhi = Math.max(1.2, ...yvals);
  const span = Math.max(0.5, yhi - ylo);
  const sx = (t) => (t / 8) * 300;
  const sy = (y) => 110 - ((y - ylo) / span) * 100;
  const spath = step.pts.map((d, i) => `${i ? 'L' : 'M'}${sx(d.t).toFixed(1)},${sy(d.y).toFixed(1)}`).join(' ');

  // pole-zero mini map
  const pz = [...a.poles, ...zeros];
  const R = Math.max(6, ...pz.map((p) => Math.max(Math.abs(p.re), Math.abs(p.im)))) * 1.2;
  const pcx = 90, pcy = 70, psc = 60 / R;
  const px = (re) => pcx + re * psc, py = (im) => pcy - im * psc;

  const speedWord = !a.stable ? '—' : a.ts < 1 ? 'fast' : a.ts < 3 ? 'moderate' : 'slow';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-slate-700">
          <div>
            <h2 className="text-sm font-bold text-amber-400">Controller Designer — Cap. 10: P · I · PI · PD · PID · Lead · Lag · Lead-Lag</h2>
            <p className="text-[11px] text-slate-500">Design and inspect a controller, then commit it to the plant. Realizable forms (filtered derivative).</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-lg leading-none">✕</button>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-[260px_1fr] gap-3 p-3 overflow-y-auto">
          {/* design column */}
          <div className="space-y-3">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-cyan-400 font-bold mb-1">Family</div>
              <div className="flex flex-wrap gap-1">
                {Object.keys(FAMILIES).map((f) => (
                  <button key={f} onClick={() => pickFamily(f)}
                    className={`px-2 py-1 rounded text-xs font-semibold ${family === f ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                    {FAMILIES[f].label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-500 mt-1 leading-tight">{FAMILIES[family].blurb}</p>
            </div>

            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wide text-cyan-400 font-bold">Parameters</div>
              {FAMILIES[family].params.map((p) => (
                <Field key={p.key} p={p} value={params[p.key]} onChange={(v) => setParam(p.key, v)} />
              ))}
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wide text-cyan-400 font-bold mb-1">Presets</div>
              <div className="flex flex-col gap-1">
                {PRESETS.map((pr) => (
                  <button key={pr.name} onClick={() => loadPreset(pr)} className="text-left px-2 py-1 rounded text-[11px] bg-slate-800 hover:bg-slate-700">{pr.name}</button>
                ))}
              </div>
            </div>
          </div>

          {/* analysis column */}
          <div className="min-w-0 space-y-3 text-xs">
            <div className="rounded-lg border border-slate-800 p-2">
              <div className="font-mono text-[12px] text-cyan-300 break-words">G_c(s) = {FAMILIES[family].display(params)}</div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-slate-800 p-2">
                <div className="text-slate-400 text-[10px] uppercase">Stability</div>
                <div className={`font-bold uppercase ${vColor}`}>{verdict}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {a.rhp > 0 ? `${a.rhp} RHP pole(s)` : a.onAxis ? 'pole on jω axis' : 'all poles in LHP'}
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 p-2">
                <div className="text-slate-400 text-[10px] uppercase">Convergence</div>
                <div className="font-bold text-slate-100">{isFinite(a.ts) ? `${a.ts.toFixed(2)} s` : '∞'}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">t_s (2%) · {speedWord}</div>
              </div>
              <div className="rounded-lg border border-slate-800 p-2">
                <div className="text-slate-400 text-[10px] uppercase">Overshoot</div>
                <div className="font-bold text-slate-100">{a.Mp > 0 ? `${(a.Mp * 100).toFixed(0)} %` : a.stable ? '0 %' : '—'}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">t_p {isFinite(a.tp) ? `${a.tp.toFixed(2)} s` : '—'}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-800 p-2 grid grid-cols-2 gap-x-2 gap-y-0.5">
                <span className="text-slate-400">ωₙ (dominant)</span><span className="font-mono text-right">{a.wn.toFixed(2)}</span>
                <span className="text-slate-400">ζ (dominant)</span><span className="font-mono text-right">{a.zeta.toFixed(3)}</span>
                <span className="text-slate-400">System type</span><span className="font-mono text-right">{a.type}</span>
                <span className="text-slate-400">e_ss step</span><span className="font-mono text-right">{isFinite(a.essStep) ? `${(a.essStep * 100).toFixed(1)} %` : '—'}</span>
              </div>
              <div className="rounded-lg border border-slate-800 p-2">
                <div className="text-cyan-400 font-bold mb-1 text-[11px]">Closed-loop poles</div>
                <div className="font-mono text-[10px] space-y-0.5 max-h-20 overflow-y-auto">
                  {a.poles.map((r, i) => (
                    <div key={i} className={r.re > 1e-6 ? 'text-red-400' : ''}>
                      {r.re.toFixed(2)} {r.im >= 0 ? '+' : '−'} {Math.abs(r.im).toFixed(2)}j
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-800 p-2">
                <div className="text-cyan-400 font-bold mb-1 text-[11px]">Closed-loop poles / controller zeros</div>
                <svg viewBox="0 0 180 140" className="w-full bg-slate-950 rounded">
                  <rect x="0" y="0" width={px(0)} height="140" fill="#10b98112" />
                  <rect x={px(0)} y="0" width={180 - px(0)} height="140" fill="#ef444412" />
                  <line x1="0" y1={pcy} x2="180" y2={pcy} stroke="#475569" strokeWidth="1" />
                  <line x1={px(0)} y1="0" x2={px(0)} y2="140" stroke="#64748b" strokeWidth="1.5" />
                  {zeros.map((z, i) => <circle key={`z${i}`} cx={px(z.re)} cy={py(z.im)} r="4" fill="none" stroke="#60a5fa" strokeWidth="2" />)}
                  {a.poles.map((p, i) => (
                    <g key={`p${i}`} stroke={p.re > 1e-6 ? '#f87171' : '#34d399'} strokeWidth="2">
                      <line x1={px(p.re) - 4} y1={py(p.im) - 4} x2={px(p.re) + 4} y2={py(p.im) + 4} />
                      <line x1={px(p.re) - 4} y1={py(p.im) + 4} x2={px(p.re) + 4} y2={py(p.im) - 4} />
                    </g>
                  ))}
                </svg>
              </div>
              <div className="rounded-lg border border-slate-800 p-2">
                <div className="text-cyan-400 font-bold mb-1 text-[11px]">Step response (θ to reference step)</div>
                <svg viewBox="0 0 300 130" className="w-full bg-slate-950 rounded">
                  <line x1="0" y1={sy(1)} x2="300" y2={sy(1)} stroke="#334155" strokeWidth="1" strokeDasharray="4 4" />
                  <line x1="0" y1={sy(0)} x2="300" y2={sy(0)} stroke="#475569" strokeWidth="1" />
                  {spath && <path d={spath} fill="none" stroke={a.stable ? '#fbbf24' : '#f87171'} strokeWidth="1.5" />}
                  <text x="4" y={sy(1) - 3} fontSize="8" fill="#64748b">setpoint</text>
                </svg>
              </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-t border-slate-700">
          <button onClick={() => onRunLive({ family, params: { ...params } })}
            className="px-3 py-1.5 rounded text-sm font-semibold bg-emerald-500 text-slate-900">
            ▶ Run live on pendulum →
          </button>
          <button onClick={() => onSendPoles(a.charPoly)}
            className="px-3 py-1.5 rounded text-sm font-semibold bg-amber-500 text-slate-900">
            Send poles → linear mode
          </button>
          <span className="text-[11px] text-slate-500">Run live = nonlinear plant with this controller. Linear mode = replay the closed-loop natural response.</span>
          <button onClick={onClose} className="ml-auto px-3 py-1.5 rounded text-sm bg-slate-700 hover:bg-slate-600">Close</button>
        </div>
      </div>
    </div>
  );
}