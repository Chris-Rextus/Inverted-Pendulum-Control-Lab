import React, { useCallback, useEffect, useRef, useState } from 'react';
import Pendulum from './components/Pendulum.jsx';
import PoleZeroDesigner from './components/PoleZeroDesigner.jsx';
import RootLocus from './components/RootLocus.jsx';
import ControllerDesigner from './components/ControllerDesigner.jsx';
import {
  FAMILIES, analyze, closedLoopPoles, discretize, makeDiscreteController, roots,
} from './control/compensator.js';

const U_MAX = 50;
const TS = 1 / 600;

function Field({ label, unit, value, min, max, step, onChange }) {
  const commit = (raw) => {
    if (raw === '' || raw === '-' || raw === '.') return; // mid-typing, ignore
    const v = parseFloat(raw);
    if (!Number.isNaN(v)) onChange(v);
  };
  return (
    <div>
      <div className="flex justify-between items-center text-[11px] mb-0.5">
        <span className="text-slate-300">{label}</span>
        <span className="flex items-center gap-1">
          <input
            type="number" step={step} value={value}
            onChange={(e) => commit(e.target.value)}
            className="w-16 px-1 py-0.5 text-right font-mono text-amber-300 bg-slate-800 border border-slate-700 rounded
                       focus:outline-none focus:border-amber-500 [appearance:textfield]
                       [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          {unit && <span className="text-slate-500">{unit}</span>}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-amber-500"
      />
    </div>
  );
}
function Group({ title, children }) {
  return (
    <div className="border-t border-slate-800 pt-2 mt-2 first:border-0 first:mt-0 first:pt-0">
      <div className="text-[10px] uppercase tracking-wide text-cyan-400 font-bold mb-1.5">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export default function App() {
  // plant
  const [gravity, setGravity] = useState(9.81);
  const [length, setLength] = useState(1.0);
  const [mass, setMass] = useState(0.1);
  const [damping, setDamping] = useState(0.01);
  // initial conditions
  const [initAngle, setInitAngle] = useState(8);
  const [initOmega, setInitOmega] = useState(0);
  // input
  const [setpoint, setSetpoint] = useState(0);
  const [manualTorque, setManualTorque] = useState(0);
  // controller (generic design)
  const [ctrlOn, setCtrlOn] = useState(true);
  const [design, setDesign] = useState({ family: 'PD', params: { ...FAMILIES.PD.def } });
  // sim
  const [running, setRunning] = useState(false);
  const [resetSig, setResetSig] = useState(0);
  const [distSig, setDistSig] = useState(0);
  const [, setLast] = useState(null);
  // windows / linear mode
  const [showPZ, setShowPZ] = useState(false);
  const [showRL, setShowRL] = useState(false);
  const [showCD, setShowCD] = useState(false);
  const [plantMode, setPlantMode] = useState('nonlinear');
  const [linearDen, setLinearDen] = useState(null);

  // discrete controller coefficients, recomputed when the design changes
  const coeffsRef = useRef(discretize(design.family, design.params, TS));
  const ctrlOnRef = useRef(ctrlOn);
  useEffect(() => { ctrlOnRef.current = ctrlOn; }, [ctrlOn]);
  useEffect(() => { coeffsRef.current = discretize(design.family, design.params, TS); }, [design]);

  const ctrl = useRef(makeDiscreteController(() => coeffsRef.current, U_MAX));
  useEffect(() => { ctrl.current.reset(); }, [design.family, ctrlOn]); // family swap / toggle resets history

  const controlFn = (theta, omega, t, e) => (ctrlOnRef.current ? ctrl.current.step(e) : 0);
  const onSample = useCallback((s) => setLast(s), []);

  const pickFamily = (f) => setDesign({ family: f, params: { ...FAMILIES[f].def } });
  const setParam = (k, v) => setDesign((d) => ({ ...d, params: { ...d.params, [k]: v } }));
  const doReset = () => { ctrl.current.reset(); setResetSig((s) => s + 1); };

  const applyLinear = (den) => { setLinearDen(den); setPlantMode('linear'); setShowPZ(false); setShowRL(false); setShowCD(false); setRunning(false); setResetSig((s) => s + 1); };
  const runLive = (d) => { setDesign(d); setCtrlOn(true); setPlantMode('nonlinear'); setShowCD(false); setRunning(false); ctrl.current.reset(); setResetSig((s) => s + 1); };
  const backToPlant = () => { setPlantMode('nonlinear'); setRunning(false); setResetSig((s) => s + 1); };

  const linear = plantMode === 'linear';
  const designPoles = linear && linearDen ? roots(linearDen) : closedLoopPoles(design.family, design.params);
  const a = linear ? null : analyze(design.family, design.params);
  const shownPoles = linear ? designPoles : a.poles;
  const stable = linear ? (shownPoles.length ? shownPoles.every((r) => r.re < 1e-6) : false) : a.stable;

  const pill = (active) => `px-2.5 py-1 rounded text-xs font-semibold ${active ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`;

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-slate-950 text-slate-100">
      <header className="shrink-0 px-4 py-2 border-b border-slate-800 flex items-center justify-between">
        <h1 className="text-sm font-bold text-amber-400">Inverted Pendulum Control Lab</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCD(true)} className="px-2.5 py-1 rounded text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-slate-900">⚙ Controller Designer (Cap. 10)</button>
          <button onClick={() => setShowPZ(true)} className="px-2.5 py-1 rounded text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-slate-900">⊕ Pole–Zero (Cap. 8)</button>
          <button onClick={() => setShowRL(true)} className="px-2.5 py-1 rounded text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-slate-900">⌇ Root Locus (Cap. 9)</button>
        </div>
      </header>

      <main className="flex-1 min-h-0 grid grid-cols-[1fr_340px] gap-3 p-3">
        <section className="min-w-0 min-h-0 flex flex-col rounded-lg border border-slate-800 bg-slate-900/60">
          <div className="shrink-0 flex items-center justify-between px-3 py-1.5 text-[11px] border-b border-slate-800">
            <span className="text-slate-400">
              {linear ? 'Linear mode — natural response of placed/derived poles' : 'The plant — nonlinear inverted pendulum (fixed pivot)'}
            </span>
            <span className={stable ? 'text-emerald-400' : 'text-red-400'}>
              {linear ? (stable ? '● stable' : '● unstable') : ctrlOn ? (stable ? '● closed-loop stable' : '● closed-loop unstable') : '○ open loop'}
            </span>
          </div>
          {linear && (
            <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-cyan-950/40 border-b border-cyan-900 text-[11px]">
              <span className="text-cyan-300">Showing a derived design. Plant params & controller are inactive here.</span>
              <button onClick={backToPlant} className="ml-auto px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600">← Back to physical plant</button>
            </div>
          )}
          <div className="flex-1 min-h-0 p-2">
            <Pendulum
              gravity={gravity} length={length} mass={mass} damping={damping}
              initialAngle={initAngle} initialOmega={initOmega}
              inputTorque={manualTorque} setpoint={setpoint}
              controlFn={controlFn} uMax={U_MAX}
              running={running} resetSignal={resetSig} disturbSignal={distSig}
              onSample={onSample}
              mode={plantMode} linearDen={linearDen}
            />
          </div>
          <div className="shrink-0 flex flex-wrap items-center gap-2 px-3 py-2 border-t border-slate-800">
            <button onClick={() => setRunning((r) => !r)} className={`px-3 py-1 rounded text-xs font-semibold ${running ? 'bg-red-500' : 'bg-emerald-500'} text-slate-900`}>{running ? '⏸ Pause' : '▶ Run'}</button>
            <button onClick={doReset} className="px-3 py-1 rounded text-xs bg-slate-700 hover:bg-slate-600">↺ Reset</button>
            <button onClick={() => setDistSig((s) => s + 1)} className="px-3 py-1 rounded text-xs bg-slate-700 hover:bg-slate-600">💥 Disturb +15°</button>
            <span className="ml-auto font-mono text-[11px] text-slate-400">
              {linear ? 'design' : 'CL'} poles: {shownPoles.map((r) => `${r.re.toFixed(2)}${r.im >= 0 ? '+' : '−'}${Math.abs(r.im).toFixed(2)}j`).join('  ')}
            </span>
          </div>
        </section>

        <aside className={`min-h-0 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/60 p-3 ${linear ? 'opacity-40 pointer-events-none' : ''}`}>
          <Group title="Plant parameters">
            <Field label="Gravity g" unit="m/s²" value={gravity} min={0} max={20} step={0.01} onChange={setGravity} />
            <Field label="Rod length l" unit="m" value={length} min={0.2} max={3} step={0.05} onChange={setLength} />
            <Field label="Bob mass m" unit="kg" value={mass} min={0.05} max={2} step={0.05} onChange={setMass} />
            <Field label="Damping b" unit="N·m·s" value={damping} min={0} max={500} step={0.5} onChange={setDamping} />
          </Group>
          <Group title="Initial conditions">
            <Field label="Initial angle θ₀" unit="°" value={initAngle} min={-90} max={90} step={1} onChange={setInitAngle} />
            <div className="flex flex-wrap gap-1">
              {[['Upright', 0], ['−10°', -10], ['+10°', 10], ['−30°', -30], ['+30°', 30]].map(([l, v]) => (
                <button key={l} onClick={() => setInitAngle(v)} className={pill(initAngle === v)}>{l}</button>
              ))}
            </div>
            <Field label="Initial ω₀" unit="rad/s" value={initOmega} min={-5} max={5} step={0.1} onChange={setInitOmega} />
          </Group>
          <Group title="Input">
            <Field label="Setpoint" unit="°" value={setpoint} min={-45} max={45} step={1} onChange={setSetpoint} />
            <Field label="Manual torque τ" unit="N·m" value={manualTorque} min={-30} max={30} step={0.5} onChange={setManualTorque} />
          </Group>
          <Group title="Controller (Cap. 10)">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={ctrlOn} onChange={(e) => setCtrlOn(e.target.checked)} className="accent-amber-500" />
              Controller {ctrlOn ? 'on' : 'off (open loop)'}
            </label>
            <div className="flex flex-wrap gap-1">
              {Object.keys(FAMILIES).map((f) => (
                <button key={f} onClick={() => pickFamily(f)} className={pill(design.family === f)}>{FAMILIES[f].label}</button>
              ))}
            </div>
            <div className="font-mono text-[11px] text-cyan-300 break-words">G_c(s) = {FAMILIES[design.family].display(design.params)}</div>
            {FAMILIES[design.family].params.map((p) => (
              <Field key={p.key} label={p.label} unit={p.unit} value={design.params[p.key]}
                min={p.min} max={p.max} step={p.step} onChange={(v) => setParam(p.key, v)} />
            ))}
            {!linear && (
              <div className="text-[10px] text-slate-500 leading-tight">
                {a.stable
                  ? <>stable · t_s ≈ {isFinite(a.ts) ? a.ts.toFixed(2) + ' s' : '∞'} · ζ ≈ {a.zeta.toFixed(2)}</>
                  : <span className="text-red-400">unstable with these gains — open the Designer to inspect why.</span>}
              </div>
            )}
            <button onClick={() => setShowCD(true)} className="w-full mt-1 px-2 py-1 rounded text-[11px] bg-emerald-700 hover:bg-emerald-600">Open full Designer →</button>
          </Group>
        </aside>
      </main>

      {showPZ && <PoleZeroDesigner onApply={({ den }) => applyLinear(den)} onClose={() => setShowPZ(false)} />}
      {showRL && <RootLocus ctrlType={['P','I','PI','PD','PID'].includes(design.family) ? design.family : 'PD'} gains={design.params} onApply={(den) => applyLinear(den)} onClose={() => setShowRL(false)} />}
      {showCD && <ControllerDesigner currentDesign={design} onRunLive={runLive} onSendPoles={(den) => applyLinear(den)} onClose={() => setShowCD(false)} />}
    </div>
  );
}