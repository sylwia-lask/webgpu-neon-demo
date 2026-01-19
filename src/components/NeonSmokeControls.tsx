// src/components/NeonSmokeControls.tsx
import type { SimParams } from "../webgpu/params";

type Props = {
  params: SimParams;
  onChange: (next: SimParams) => void;
  onReset: () => void;
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function Control(props: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-200">{props.label}</span>
        <span className="text-[11px] text-slate-400 tabular-nums">
          {props.display}
        </span>
      </div>
      <input
        type="range"
        className="w-full h-1 accent-fuchsia-400"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function NeonSmokeControls({ params, onChange, onReset }: Props) {
  const hueDegrees = Math.round(params.baseHue * 360);

  return (
    <aside className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-3 shadow-[0_0_60px_rgba(0,0,0,0.35)] lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] overflow-auto">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-semibold">Controls</h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Real-time simulation tuning
          </p>
        </div>
        <button
          className="text-[11px] px-2 py-0.5 rounded-md border border-slate-700/60 bg-slate-950/40 hover:bg-slate-950/70"
          onClick={onReset}
        >
          Reset
        </button>
      </div>

      <div className="mt-3 space-y-3">
        <Control
          label="Trail (fade)"
          value={params.fade}
          display={params.fade.toFixed(4)}
          min={0.97}
          max={0.9995}
          step={0.0005}
          onChange={(v) => onChange({ ...params, fade: v })}
        />

        <Control
          label="Brush size"
          value={params.radius}
          display={`${Math.round(params.radius)} px`}
          min={2}
          max={60}
          step={1}
          onChange={(v) => onChange({ ...params, radius: v })}
        />

        <Control
          label="Color intensity"
          value={params.intensity}
          display={params.intensity.toFixed(2)}
          min={0}
          max={3}
          step={0.05}
          onChange={(v) => onChange({ ...params, intensity: v })}
        />

        <Control
          label="Swirl strength"
          value={params.swirlStrength}
          display={params.swirlStrength.toFixed(2)}
          min={0}
          max={3}
          step={0.05}
          onChange={(v) => onChange({ ...params, swirlStrength: v })}
        />

        <Control
          label="Base hue"
          value={hueDegrees}
          display={`${hueDegrees}°`}
          min={0}
          max={360}
          step={1}
          onChange={(deg) =>
            onChange({ ...params, baseHue: clamp(deg / 360, 0, 1) })
          }
        />

        <Control
          label="Hue speed"
          value={params.hueSpeed}
          display={params.hueSpeed.toFixed(2)}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => onChange({ ...params, hueSpeed: v })}
        />
      </div>
    </aside>
  );
}
