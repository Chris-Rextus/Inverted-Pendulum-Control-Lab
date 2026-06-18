# Inverted Pendulum Control Lab
### Seminário — Engenharia de Controle (W. Bolton, Caps. 8–10)
**Pedro Augusto de Faria — RA 821124 — UFSCar**

---

## Overview

A single-page, fully interactive web application that demonstrates the three core chapters of the control engineering course through a real-time nonlinear inverted pendulum simulation. The pendulum is inherently unstable (open-loop pole in the right half-plane), making it the ideal physical plant to showcase:

- **Cap. 8** — Poles, zeros, and stability: the pendulum falls without control; pole positions explain why
- **Cap. 9** — Root locus: how varying gain K moves the closed-loop poles and crosses the stability boundary
- **Cap. 10** — Controllers (P, I, PI, PD, PID): each law is applied to the live pendulum and its effect on the root locus, pole-zero map, and time response is shown simultaneously

The entire seminar narrative is embedded in the app: start with an unstable open-loop system, walk through each controller, and let the professor see the theory come alive.

---

## Technology Stack

| Layer | Technology | Reason |
|---|---|---|
| Framework | React 18 (functional components + hooks) | Reactive state for real-time simulation loop |
| Styling | Tailwind CSS (CDN utility classes only) | Fast layout, no build step required |
| Physics engine | Custom JS — 4th order Runge-Kutta (RK4) | Accurate nonlinear ODE integration at 60fps |
| Pole computation | Custom JS — companion matrix + QR eigenvalue iteration | Compute closed-loop poles live from characteristic polynomial |
| Root locus | Custom JS — Evans method, angle condition sweep | Plot locus without external library |
| Rendering — pendulum | HTML5 Canvas API | Smooth 60fps animation loop |
| Rendering — charts | Recharts (LineChart, ScatterChart) | Declarative SVG charts in React |
| Math utilities | mathjs (CDN) | Polynomial arithmetic, matrix operations |
| Build | None — single .html file or Vite dev server | Zero-friction demo environment |

### Why no Python/Streamlit?
The simulation loop must run at 60fps with sub-millisecond controller computation. Python over HTTP cannot achieve this latency for a smooth pendulum animation. Pure browser JS is the correct tool.

### Why custom root locus instead of a library?
No maintained JS root locus library exists with the required quality. The Evans construction is mathematically self-contained and implementing it demonstrates mastery of the material — which is precisely the point of the seminar.

---

## File Structure

    inverted-pendulum-lab/
    │
    ├── index.html                  ← Single entry point; loads React, Tailwind, mathjs from CDN
    │
    ├── src/
    │   ├── main.jsx                ← React root, mounts <App />
    │   │
    │   ├── App.jsx                 ← Top-level layout: header + 4-panel dashboard grid
    │   │
    │   ├── physics/
    │   │   ├── pendulum.js         ← Nonlinear ODE: θ̈ = (g/l)sin(θ) − (b/ml²)θ̇ + u/(ml²)
    │   │   ├── rk4.js              ← Generic 4th-order Runge-Kutta integrator, step h=1/600s
    │   │   └── linearization.js   ← Computes linearized A,B,C,D matrices around θ=0
    │   │
    │   ├── control/
    │   │   ├── pid.js              ← Discrete PID with anti-windup
    │   │   ├── controllers.js      ← Exports P, I, PI, PD, PID as strategy objects with TF metadata
    │   │   └── closedLoopPoles.js  ← Given open-loop TF + K, returns closed-loop pole array
    │   │
    │   ├── math/
    │   │   ├── polynomial.js       ← Multiply, add, evaluate polynomials as coefficient arrays
    │   │   ├── eigenvalues.js      ← QR algorithm for companion matrix → eigenvalues
    │   │   └── rootLocus.js        ← Evans root locus: sweeps K, collects pole trajectories,
    │   │                              computes asymptotes, centroid, jω crossing, breakaway points
    │   │
    │   ├── components/
    │   │   ├── PendulumCanvas.jsx  ← Panel 1: HTML5 Canvas, 60fps via requestAnimationFrame
    │   │   │                          Draws rod, bob, angle arc, instability warning flash
    │   │   │
    │   │   ├── PoleZeroMap.jsx     ← Panel 2: Recharts ScatterChart
    │   │   │                          Open-loop poles (×, gray), closed-loop poles (×, colored),
    │   │   │                          zeros (○), jω axis, Cap. 8 annotation tooltips
    │   │   │
    │   │   ├── RootLocusPlot.jsx   ← Panel 3: Recharts LineChart + ScatterChart overlay
    │   │   │                          Locus branches, asymptote lines (dashed), centroid marker,
    │   │   │                          jω crossing + K_cr label, live K dot (yellow), breakaway point
    │   │   │
    │   │   ├── ResponseGraph.jsx   ← Panel 4: Recharts LineChart, rolling 10s window
    │   │   │                          θ(t) in degrees, setpoint line, u(t) on secondary axis,
    │   │   │                          shaded danger zone |θ| > 30°
    │   │   │
    │   │   └── ControlPanel.jsx    ← Bottom bar: controller selector + parameter sliders
    │   │                              Pill buttons [P] [I] [PI] [PD] [PID]
    │   │                              Sliders: Kp, Ki, Kd with live numeric readout
    │   │                              Info box: G_c(s) text, system type, e_ss to step and ramp
    │   │                              Buttons: Run, Pause, Reset, Disturbance
    │   │
    │   ├── hooks/
    │   │   ├── useSimulation.js    ← Central simulation loop hook
    │   │   │                          State: θ, θ_dot, t, u, history[]
    │   │   │                          requestAnimationFrame loop at 600Hz (10 steps per frame)
    │   │   │
    │   │   └── useRootLocus.js     ← Memoized hook: recomputes locus only when gains change
    │   │                              Heavy computation (~50ms) debounced 200ms
    │   │
    │   └── constants/
    │       ├── physics.js          ← g=9.81, l=1.0m, m=0.1kg, b=0.01, M=1.0kg
    │       └── defaults.js         ← Default gains: P{Kp:5}, PI{Kp:8,Ki:2}, PD{Kp:10,Kd:2}, PID{Kp:15,Ki:3,Kd:3}
    │
    ├── public/
    │   └── favicon.ico
    │
    ├── package.json
    ├── vite.config.js
    └── README.md

---

## Dashboard Layout

    ┌──────────────────────────────────────────────────────────────────────┐
    │  INVERTED PENDULUM CONTROL LAB     Cap. 8 · 9 · 10 — W. Bolton      │
    │  Pedro Augusto de Faria — RA 821124 — UFSCar                        │
    ├──────────────────────────┬───────────────────────────────────────────┤
    │                          │                                           │
    │   PANEL 1                │   PANEL 2                                 │
    │   Pendulum Animation     │   Pole-Zero Map (Cap. 8)                  │
    │   Canvas 60fps           │   Recharts ScatterChart                   │
    │                          │                                           │
    │   • Nonlinear pendulum   │   • jω axis vertical center line          │
    │   • Rod + bob rendering  │   • Open-loop poles: gray ×               │
    │   • Angle arc display    │   • Closed-loop poles: green or red ×     │
    │   • Red flash |θ| > 45°  │   • Zeros: blue ○                         │
    │   • Background darkens   │   • Stability region shading              │
    │     as angle grows       │   • Live update as gains change           │
    │                          │   • Cap. 8 annotation tooltips            │
    │                          │                                           │
    ├──────────────────────────┼───────────────────────────────────────────┤
    │                          │                                           │
    │   PANEL 3                │   PANEL 4                                 │
    │   Root Locus (Cap. 9)    │   Time Response (Cap. 8 + 10)             │
    │   Line + Scatter         │   LineChart rolling 10s window            │
    │                          │                                           │
    │   • Locus branches       │   • θ(t) in degrees, primary axis         │
    │   • Asymptote dashed     │   • Setpoint θ=0 dashed line              │
    │   • Centroid marker σ_c  │   • u(t) control signal, secondary axis   │
    │   • jω crossing + K_cr   │   • Shaded danger zone |θ| > 30°          │
    │   • Live K dot yellow    │   • Rolling 10s window                    │
    │   • Breakaway marker     │                                           │
    │                          │                                           │
    ├──────────────────────────┴───────────────────────────────────────────┤
    │  CONTROL PANEL (bottom bar)                                          │
    │                                                                      │
    │  Controller:  [P]  [I]  [PI]  [PD]  [PID]                           │
    │                                                                      │
    │  Kp ──●──── 12.0      Ki ──●──── 3.0      Kd ──●──── 2.5           │
    │                                                                      │
    │  G_c(s) = Kp(τ_i·s+1)/(τ_i·s)   Type: 2   e_ss(step)=0  e_ss(ramp)=0  │
    │                                                                      │
    │  [▶ Run]  [⏸ Pause]  [↺ Reset]  [💥 Push Disturbance +15°]         │
    └──────────────────────────────────────────────────────────────────────┘

---

## Physics Model

Full nonlinear inverted pendulum ODE (fixed pivot, no cart):

    θ̈ = (g/l)·sin(θ) − (b/(m·l²))·θ̇ + u/(m·l²)

Parameters:

    g = 9.81 m/s²       rod length  l = 1.0 m
    m = 0.1 kg          damping     b = 0.01
    u = control torque from selected controller

Linearization around θ=0 (for pole and locus analysis):

    θ̈ ≈ (g/l)·θ − (b/(m·l²))·θ̇ + u/(m·l²)

Open-loop transfer function (u → θ):

    G_p(s) = [1/(m·l²)] / (s² − g/l)
           = 10 / (s² − 9.81)

Poles at s = ±3.13. The positive real pole at +3.13 is the mathematical
signature of instability and the Cap. 8 moment of the seminar. It appears
live in the right half-plane on Panel 2 the instant the app loads.

---

## Control Laws (Discrete, 600 Hz)

All controllers run at dt = 1/600 s.

    P:   u[k] = Kp · e[k]

    I:   u[k] = u[k-1] + Ki · e[k] · dt
         (anti-windup: clamp integral to ±u_max)

    PI:  u[k] = Kp · e[k] + Ki · Σe · dt

    PD:  u[k] = Kp · e[k] + Kd · (e[k] − e[k-1]) / dt
         (derivative filtered: N=10 low-pass to avoid noise amplification)

    PID: u[k] = Kp·e[k] + Ki·Σe·dt + Kd·(e[k]−e[k-1])/dt
         (anti-windup on integral + derivative filter)

---

## Root Locus Algorithm

Computed numerically for the current open-loop TF G_o(s) = G_c(s)·G_p(s):

1. Extract numerator b(s) and denominator a(s) as coefficient arrays
2. Sweep K from 0 to K_max (adaptive — stops when branches leave plot boundary)
3. For each K, form characteristic polynomial: a(s) + K·b(s)
4. Find roots via companion matrix eigenvalues (QR iteration, mathjs)
5. Sort roots by continuity (nearest-neighbor matching between K steps)
6. Collect into branch arrays → rendered as Recharts line series

Derived quantities computed analytically:

    Asymptote angles:  φ_k = (2k−1)·180° / (n−m),  k = 1,...,n−m
    Centroid:          σ_c = (Σpoles − Σzeros) / (n−m)
    jω crossing:       substitute s=jω, solve numerically for ω where Re=0
    Breakaway:         solve dK/ds = 0 numerically, verify with Rule 5

---

## Seminar Narrative Flow

1. **Open loop, no controller** — hit Run, pendulum falls. Point to pole at
   +3.13 on Panel 2. "Cap. 8: a positive real pole means exponential divergence."

2. **P control, low Kp** — pendulum still falls. Root locus on Panel 3 shows
   closed-loop poles still in right half-plane at low K.

3. **Increase Kp via slider** — poles cross jω axis live. Pendulum stabilizes.
   "Cap. 9: we moved the poles into the left half-plane by increasing gain."

4. **Hit disturbance button** — pendulum wobbles. With P only: steady-state
   offset remains or oscillation is visible.

5. **Switch to PD** — zero appears on Panel 2. Locus branches bend left.
   "Cap. 10: the zero attracts branches away from jω — better relative stability."

6. **Switch to PI** — extra pole at origin appears. "Type increases by 1 —
   zero steady-state error. But the locus moves right. We paid in stability."

7. **Switch to PID** — both zeros appear. Tune until one zero cancels the plant
   pole. "The PID buys precision and damping — at the cost of model accuracy."

---

## Key Design Decisions

**Why nonlinear physics?**
The linearized model hides the real challenge: for large angles sin(θ) ≠ θ
and a controller designed via root locus may fail. An aggressive PD that
works for small perturbations can fail on a hard push. The professor sees
the gap between model and reality directly.

**Why RK4 at 600 Hz?**
Euler at 60fps produces visible numerical artifacts in pendulum dynamics.
RK4 at 600Hz (10 physics steps per animation frame) gives smooth, accurate
nonlinear behavior without a heavier solver.

**Why live root locus recomputation?**
When the student moves Kd and watches branches physically move away from the
jω axis, the connection between "add a zero" and "improve stability" becomes
visceral rather than algebraic.

**Why all panels simultaneously?**
The four panels are four projections of the same system. Watching all four
update from a single slider demonstrates that root locus, pole-zero map,
and time response are not separate tools — they are the same information.

---

## Known Limitations

- Root locus computation (~30–80ms) causes brief lag when switching
  controllers; mitigated by debouncing and a loading spinner on Panel 3
- Derivative term amplifies discrete noise in e[k]−e[k-1]; N=10 low-pass
  filter is a practical compromise, not rigorous Tustin discretization
- Pole-zero cancellation in PID is exact only for default plant parameters;
  changing l or m breaks it visibly (intentional — illustrates Cap. 10
  fragility note from the resumo)
- Root locus is computed for the linearized TF; nonlinear simulation diverges
  from locus predictions for |θ| > ~20°

---

## Build and Run

    npm install
    npm run dev       # dev server with hot reload
    npm run build     # production build → dist/index.html

Tested on Chrome 124+, Firefox 125+. Requires Canvas API and ES2020 support.

---

## Dependencies

    react               ^18.3.0
    react-dom           ^18.3.0
    recharts            ^2.12.0
    mathjs              ^13.0.0

    vite                ^5.2.0      (dev)
    @vitejs/plugin-react ^4.2.0     (dev)
    tailwindcss         ^3.4.0      (dev)
    autoprefixer        ^10.4.0     (dev)
    postcss             ^8.4.0      (dev)