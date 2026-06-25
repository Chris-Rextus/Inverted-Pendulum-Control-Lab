// s-plane math: build polynomials from placed roots, Routh–Hurwitz,
// impulse-response simulation, dominant-pole metrics.
// Polynomials are DESCENDING-power coefficient arrays: [a_n, ..., a_1, a_0].
// Roots are stored as "primaries" with im >= 0; conjugates are implicit.

function conv(a, b) {
  const o = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++) o[i + j] += a[i] * b[j];
  return o;
}

// Expand primaries into the full conjugate-closed set.
export function expandConjugates(primaries) {
  const out = [];
  for (const r of primaries) {
    out.push({ re: r.re, im: r.im });
    if (Math.abs(r.im) > 1e-9) out.push({ re: r.re, im: -r.im });
  }
  return out;
}

// Real-coefficient monic polynomial from a set of primaries.
export function polyFromRoots(primaries) {
  let poly = [1];
  for (const r of primaries) {
    if (Math.abs(r.im) < 1e-9) {
      poly = conv(poly, [1, -r.re]);                       // (s - re)
    } else {
      const a = -2 * r.re, b = r.re * r.re + r.im * r.im;
      poly = conv(poly, [1, a, b]);                        // (s² - 2·re·s + |r|²)
    }
  }
  return poly;
}

export function formatPoly(coeffs) {
  const n = coeffs.length - 1;
  const terms = [];
  coeffs.forEach((c, i) => {
    const p = n - i;
    if (Math.abs(c) < 1e-9) return;
    const mag = Math.abs(c).toFixed(2).replace(/\.00$/, '');
    const sign = c < 0 ? '−' : terms.length ? '+' : '';
    let s = `${sign}${Math.abs(c) === 1 && p > 0 ? '' : mag}`;
    if (p > 1) s += `s^${p}`;
    else if (p === 1) s += 's';
    terms.push(s);
  });
  return terms.length ? terms.join(' ') : '0';
}

// Routh–Hurwitz array. Returns rows, first column, sign changes (= RHP roots
// by Routh), and notes for the ε / row-of-zeros special cases.
export function routhArray(coeffsDesc) {
  let a = coeffsDesc.slice();
  while (a.length > 1 && Math.abs(a[0]) < 1e-12) a = a.slice(1);
  const n = a.length - 1;
  if (n < 1) return { rows: [], firstCol: [], signChanges: 0, notes: [], powers: [], n: 0 };

  const width = Math.floor(n / 2) + 1;
  const r0 = [], r1 = [];
  for (let i = 0; i <= n; i++) (i % 2 === 0 ? r0 : r1).push(a[i]);
  while (r0.length < width) r0.push(0);
  while (r1.length < width) r1.push(0);
  const rows = [r0.slice(), r1.slice()];
  const notes = [];

  for (let k = 2; k <= n; k++) {
    const above2 = rows[k - 2];
    let above1 = rows[k - 1];

    if (above1.every((v) => Math.abs(v) < 1e-12)) {
      const auxOrder = n - (k - 2);
      const d = [];
      for (let j = 0; j < above2.length; j++) {
        const power = auxOrder - 2 * j;
        if (power > 0) d.push(above2[j] * power);
      }
      above1 = d.slice();
      while (above1.length < width) above1.push(0);
      rows[k - 1] = above1.slice();
      notes.push(`Row s^${n - (k - 1)} vanished → auxiliary-polynomial derivative used (symmetric roots: marginal or unstable).`);
    }
    if (Math.abs(above1[0]) < 1e-12) {
      above1[0] = 1e-6;
      rows[k - 1] = above1.slice();
      notes.push('Zero in first column → ε-method (small positive ε).');
    }

    const lead = above1[0];
    const newRow = [];
    for (let i = 0; i < width - 1; i++)
      newRow.push((above1[0] * above2[i + 1] - above2[0] * above1[i + 1]) / lead);
    newRow.push(0);
    rows.push(newRow.slice());
  }

  const firstCol = rows.map((r) => r[0]);
  let signChanges = 0;
  for (let i = 1; i < firstCol.length; i++) {
    const a0 = Math.sign(firstCol[i - 1]), a1 = Math.sign(firstCol[i]);
    if (a0 !== 0 && a1 !== 0 && a0 !== a1) signChanges++;
  }
  const powers = rows.map((_, i) => n - i);
  return { rows, firstCol, signChanges, notes, powers, n };
}

// Impulse response of num(s)/den(s) via controllable canonical form (RK4).
// Zeros (from zerosPrimaries) shape this response.
export function impulseResponse(den, zerosPrimaries, { tEnd = 12, n = 240 } = {}) {
  const num = polyFromRoots(zerosPrimaries);
  let d = den.slice();
  const lead = d[0] || 1;
  d = d.map((v) => v / lead);
  const order = d.length - 1;
  if (order < 1) return [];

  const A = Array.from({ length: order }, () => new Array(order).fill(0));
  for (let i = 0; i < order - 1; i++) A[i][i + 1] = 1;
  for (let j = 0; j < order; j++) A[order - 1][j] = -d[order - j];

  const C = new Array(order).fill(0);
  for (let i = 0; i < num.length; i++) {
    const power = num.length - 1 - i;
    if (power < order) C[power] = num[i] / lead;
  }

  let x = new Array(order).fill(0);
  x[order - 1] = 1; // impulse → x(0) = B
  const f = (xx) => A.map((row) => row.reduce((s, aij, j) => s + aij * xx[j], 0));
  const dt = tEnd / n;
  const out = [];
  for (let k = 0; k <= n; k++) {
    const y = C.reduce((s, ci, i) => s + ci * x[i], 0);
    out.push({ t: k * dt, y });
    if (!isFinite(y) || Math.abs(y) > 1e6) break;
    const k1 = f(x);
    const k2 = f(x.map((v, i) => v + (dt / 2) * k1[i]));
    const k3 = f(x.map((v, i) => v + (dt / 2) * k2[i]));
    const k4 = f(x.map((v, i) => v + dt * k3[i]));
    x = x.map((v, i) => v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
  }
  return out;
}

// Dominant (rightmost) pole metrics: ωn, ζ, settling-time estimate.
export function poleMetrics(fullPoles) {
  if (!fullPoles.length) return null;
  const dom = fullPoles.reduce((a, b) => (b.re > a.re ? b : a));
  const wn = Math.hypot(dom.re, dom.im);
  const zeta = wn > 1e-9 ? -dom.re / wn : 0;
  const ts = Math.abs(dom.re) > 1e-6 ? 4 / Math.abs(dom.re) : Infinity;
  return { dom, wn, zeta, ts };
}