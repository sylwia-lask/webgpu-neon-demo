import { NeonSmokeCanvas } from "./components/NeonSmokeCanvas";

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6">
      <div className="w-full max-w-4xl space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">WebGPU</p>
            <h1 className="text-3xl font-semibold">Neon Smoke Fluid</h1>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-fuchsia-900/40 text-fuchsia-200 border border-fuchsia-800">
            Live
          </span>
        </header>

        <NeonSmokeCanvas />

        <p className="text-sm text-slate-400">
          If you see nothing, try Chrome or Edge with WebGPU enabled in browser flags.
        </p>
      </div>
    </div>
  );
}
