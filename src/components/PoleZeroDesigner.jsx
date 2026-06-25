import React, { useMemo, useRef, useState } from 'react';
import {
  expandConjugates, polyFromRoots, formatPoly,
  routhArray, impulseResponse, poleMetrics,
} from '../math/sPlane.js';

const VB = 360, CX = 180, CY = 180, SCALE = 150;

export default function PoleZeroDesigner({ onApply, onClose }) {
  // seed with the real inverted-pendulum open-loop poles (+3.08 is the RHP one)
  const [poles, setPoles] = useState([{ id: 1, re: 3.08, im: 0 }, { id: 2, re: -3.18, im: 0 }]);
  const [zeros, setZeros] = useState([]);
  const [placeMode, setPlaceMode] = useState('pole');
  const [selected, setSelected] = useState(null); // {type,id}
  const [R, setR] = useState(6);
  const idRef = useRef(3);
  const dragRef = useRef(null);
  const svgRef = useRef(null);

  const toScreen = (re, im) => [CX + (re / R) * SCALE, CY - (im / R) * SCALE];
  const sFromEvent = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * VB;
    const vy = ((e.clientY - rect.top) / rect.height) * VB;
    let re = ((vx - CX) / SCALE) * R;
    let im = -((vy - CY) / SCALE) * R;
    if (Math.abs(im) < 0.25) im = 0;         // snap to real axis
    return { re: +re.toFixed(2), im: Math.abs(+im.toFixed(2)) }; // im >= 0 (conjugate implicit)
  };

  const addPoint = (e) => {
    const s = sFromEvent(e);
    const id = idRef.current++;
    if (placeMode === 'pole') setPoles((p) => [...p, { id, ...s }]);
    else setZeros((z) => [...z, { id, ...s }]);
    setSelected({ type: placeMode, id });
  };
  const startDrag = (e, type, id) => {
    e.stopPropagation();
    setSelected({ type, id });
    dragRef.current = { type, id };
    e.target.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!dragRef.current) return;
    const s = sFromEvent(e);
    const { type, id } = dragRef.current;
    const upd = (arr) => arr.map((pt) => (pt.id === id ? { ...pt, ...s } : pt));
    type === 'pole' ? setPoles(upd) : setZeros(upd);
  };
  const endDrag = () => (dragRef.current = null);
  const removeSelected = () => {
    if (!selected) return;
    selected.type === 'pole'
      ? setPoles((p) => p.filter((x) => x.id !== selected.id))
      : setZeros((z) => z.filter((x) => x.id !== selected.id));
    setSelected(null);
  };

  // ── derived analysis ──
  const den = useMemo(() => polyFromRoots(poles), [poles]);
  const fullPoles = useMemo(() => expandConjugates(poles), [poles]);
  const routh = useMemo(() => routhArray(den), [den]);
  const metrics = useMemo(() => poleMetrics(fullPoles), [fullPoles]);
  const impulse = useMemo(() => impulseResponse(den, zeros), [den, zeros]);

  const AXIS_EPS = 0.02; // dead-band: treat |Re| < this as "on the jω axis"
  const rhpActual = fullPoles.filter((p) => p.re > AXIS_EPS).length;
  const onAxis = fullPoles.some((p) => Math.abs(p.re) <= AXIS_EPS);
  const verdict = rhpActual > 0 ? 'unstable' : onAxis ? 'marginal' : poles.length ? 'stable' : 'empty';
  const verdictColor = { unstable: 'text-red-400', marginal: 'text-amber-400', stable: 'text-emerald-400', empty: 'text-slate-500' }[verdict];

  // impulse chart geometry
  const yMax = Math.max(1e-6, ...impulse.map((d) => Math.abs(d.y)));
  const ix = (t) => (t / 12) * 300;
  const iy = (y) => 50 - (y / yMax) * 42;
  const ipts = impulse.map((d) => `${ix(d.t).toFixed(1)},${iy(d.y).toFixed(1)}`).join(' ');

  const grid = [];
  for (let v = -R; v <= R; v += R / 3) {
    const [x] = toScreen(v, 0), [, y] = toScreen(0, v);
    grid.push(<line key={`gx${v}`} x1={x} y1={0} x2={x} y2={VB} stroke="#1e293b" strokeWidth="1" />);
    grid.push(<line key={`gy${v}`} x1={0} y1={y} x2={VB} y2={y} stroke="#1e293b" strokeWidth="1" />);
  }

  const Marker = ({ pt, type, ghost }) => {
    const [x, y] = toScreen(pt.re, ghost ? -pt.im : pt.im);
    const sel = !ghost && selected && selected.type === type && selected.id === pt.id;
    const color = type === 'pole' ? '#f87171' : '#60a5fa';
    return (
      <g onPointerDown={(e) => !ghost && startDrag(e, type, pt.id)} style={{ cursor: 'grab' }}>
        {sel && <circle cx={x} cy={y} r="11" fill="none" stroke="#fbbf24" strokeWidth="1.5" />}
        {type === 'pole' ? (
          <g stroke={color} strokeWidth="2.5" opacity={ghost ? 0.5 : 1}>
            <line x1={x - 7} y1={y - 7} x2={x + 7} y2={y + 7} />
            <line x1={x - 7} y1={y + 7} x2={x + 7} y2={y - 7} />
          </g>
        ) : (
          <circle cx={x} cy={y} r="7" fill="none" stroke={color} strokeWidth="2.5" opacity={ghost ? 0.5 : 1} />
        )}
        {!ghost && <circle cx={x} cy={y} r="13" fill="transparent" />}
      </g>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col"
           onClick={(e) => e.stopPropagation()}>
        <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-slate-700">
          <div>
            <h2 className="text-sm font-bold text-amber-400">Pole–Zero Designer — Cap. 8: s-plane & Routh–Hurwitz</h2>
            <p className="text-[11px] text-slate-500">Place closed-loop poles (×) and zeros (○). The rod will follow the natural response of your characteristic polynomial.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-lg leading-none">✕</button>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-[auto_1fr] gap-3 p-3 overflow-y-auto">
          {/* s-plane */}
          <div className="flex flex-col gap-2">
            <svg ref={svgRef} viewBox={`0 0 ${VB} ${VB}`} width="360" height="360"
                 className="rounded-lg bg-slate-950 touch-none select-none"
                 onPointerDown={addPoint} onPointerMove={onMove} onPointerUp={endDrag} onPointerLeave={endDrag}>
              <rect x="0" y="0" width={CX} height={VB} fill="#10b98112" />
              <rect x={CX} y="0" width={CX} height={VB} fill="#ef444412" />
              {grid}
              <line x1="0" y1={CY} x2={VB} y2={CY} stroke="#475569" strokeWidth="1.5" />
              <line x1={CX} y1="0" x2={CX} y2={VB} stroke="#64748b" strokeWidth="2" />
              <text x={CX + 6} y="14" fontSize="11" fill="#64748b">jω</text>
              <text x={VB - 14} y={CY - 6} fontSize="11" fill="#64748b">σ</text>
              <text x="8" y={CY - 6} fontSize="10" fill="#34d399">stable</text>
              <text x={CX + 8} y={CY - 6} fontSize="10" fill="#f87171">unstable</text>
              {zeros.map((z) => <React.Fragment key={`z${z.id}`}><Marker pt={z} type="zero" />{z.im > 1e-3 && <Marker pt={z} type="zero" ghost />}</React.Fragment>)}
              {poles.map((p) => <React.Fragment key={`p${p.id}`}><Marker pt={p} type="pole" />{p.im > 1e-3 && <Marker pt={p} type="pole" ghost />}</React.Fragment>)}
            </svg>

            <div className="flex flex-wrap gap-1 text-xs">
              <button onClick={() => setPlaceMode('pole')} className={`px-2 py-1 rounded ${placeMode === 'pole' ? 'bg-red-500 text-slate-900' : 'bg-slate-800'}`}>+ Pole ×</button>
              <button onClick={() => setPlaceMode('zero')} className={`px-2 py-1 rounded ${placeMode === 'zero' ? 'bg-blue-500 text-slate-900' : 'bg-slate-800'}`}>+ Zero ○</button>
              <button onClick={removeSelected} disabled={!selected} className="px-2 py-1 rounded bg-slate-800 disabled:opacity-30">Delete sel.</button>
              <button onClick={() => { setPoles([]); setZeros([]); setSelected(null); }} className="px-2 py-1 rounded bg-slate-800">Clear</button>
              <button onClick={() => setR((r) => Math.min(20, r + 2))} className="px-2 py-1 rounded bg-slate-800">−</button>
              <button onClick={() => setR((r) => Math.max(2, r - 2))} className="px-2 py-1 rounded bg-slate-800">+</button>
              <span className="px-1 py-1 text-slate-500">±{R}</span>
            </div>
            <p className="text-[10px] text-slate-500 leading-tight">Click empty space to add · drag markers to move · off-axis poles auto-mirror as conjugates (keeps coefficients real).</p>
          </div>

          {/* analysis */}
          <div className="min-w-0 space-y-3 text-xs">
            <div className="rounded-lg border border-slate-800 p-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Verdict</span>
                <span className={`font-bold uppercase ${verdictColor}`}>{verdict}</span>
              </div>
              <div className="text-slate-400 mt-1">
                {rhpActual > 0 && <span className="text-red-400">{rhpActual} pole(s) in right half-plane → output grows. </span>}
                {rhpActual === 0 && onAxis && <span className="text-amber-400">Pole(s) on jω axis → sustained oscillation. </span>}
                {verdict === 'stable' && <span className="text-emerald-400">All poles in LHP → output decays to upright.</span>}
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 p-2">
              <div className="text-cyan-400 font-bold mb-1">Inferred characteristic polynomial</div>
              <div className="font-mono text-[11px] text-slate-200 break-words">den(s) = {formatPoly(den)}</div>
              {zeros.length > 0 && <div className="font-mono text-[11px] text-slate-400 break-words mt-1">num(s) = {formatPoly(polyFromRoots(zeros))}</div>}
            </div>

            <div className="rounded-lg border border-slate-800 p-2">
              <div className="text-cyan-400 font-bold mb-1">Routh–Hurwitz array</div>
              <div className="min-h-[150px]">
                {routh.rows.length ? (
                  <table className="font-mono text-[11px]">
                    <tbody>
                      {routh.rows.map((row, i) => (
                        <tr key={i}>
                          <td className="pr-2 text-slate-500">s<sup>{routh.powers[i]}</sup></td>
                          {row.map((v, j) => (
                            <td key={j} className={`px-2 text-right ${j === 0 ? (v < 0 ? 'text-red-400 font-bold' : 'text-slate-200 font-bold') : 'text-slate-400'}`}>
                              {Math.abs(v) < 1e-9 ? '0' : v.toFixed(2)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <span className="text-slate-500">Add poles to build the array.</span>}
              </div>
              <div className="text-slate-400 mt-1">
                First-column sign changes: <span className={routh.signChanges ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>{routh.signChanges}</span>
                {' '}→ Routh predicts {routh.signChanges} RHP root(s){routh.signChanges === rhpActual ? '' : ` (actual: ${rhpActual})`}.
              </div>
              <div className="min-h-[28px] mt-0.5">
                {routh.notes.map((n, i) => <div key={i} className="text-[10px] text-amber-400/80 leading-tight">{n}</div>)}
              </div>
            </div>

            {metrics && (
              <div className="rounded-lg border border-slate-800 p-2 grid grid-cols-2 gap-x-3 gap-y-0.5">
                <div className="text-cyan-400 font-bold col-span-2 mb-0.5">Dominant pole</div>
                <span className="text-slate-400">σ + jω</span><span className="font-mono text-right">{metrics.dom.re.toFixed(2)} {metrics.dom.im >= 0 ? '+' : '−'} {Math.abs(metrics.dom.im).toFixed(2)}j</span>
                <span className="text-slate-400">ωₙ</span><span className="font-mono text-right">{metrics.wn.toFixed(2)} rad/s</span>
                <span className="text-slate-400">ζ</span><span className="font-mono text-right">{metrics.zeta.toFixed(3)}</span>
                <span className="text-slate-400">t_s (2%)</span><span className="font-mono text-right">{isFinite(metrics.ts) ? metrics.ts.toFixed(2) + ' s' : '∞'}</span>
              </div>
            )}

            <div className="rounded-lg border border-slate-800 p-2">
              <div className="text-cyan-400 font-bold mb-1">Impulse response <span className="text-slate-500 font-normal">(zeros shape this; poles decide stability)</span></div>
              <svg viewBox="0 0 300 100" className="w-full bg-slate-950 rounded">
                <line x1="0" y1="50" x2="300" y2="50" stroke="#334155" strokeWidth="1" />
                {ipts && <polyline points={ipts} fill="none" stroke="#fbbf24" strokeWidth="1.5" />}
              </svg>
            </div>
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-t border-slate-700">
          <button
            onClick={() => onApply({ den, poles: poles.slice(), zeros: zeros.slice(), stable: verdict === 'stable' })}
            disabled={!poles.length}
            className="px-3 py-1.5 rounded text-sm font-semibold bg-amber-500 text-slate-900 disabled:opacity-30">
            Apply to pendulum →
          </button>
          <span className="text-[11px] text-slate-500">Switches the plant to linear mode and replays the natural response of these poles.</span>
          <button onClick={onClose} className="ml-auto px-3 py-1.5 rounded text-sm bg-slate-700 hover:bg-slate-600">Close</button>
        </div>
      </div>
    </div>
  );
}