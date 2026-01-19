import { useState } from "react";
import { NeonSmokeCanvasView } from "./NeonSmokeCanvasView";
import { NeonSmokeControls } from "./NeonSmokeControls";
import type { SimParams } from "../webgpu/params";

const DEFAULT_PARAMS: SimParams = {
  fade: 0.985,
  swirlStrength: 0.9,
  radius: 18,
  intensity: 1.2,
  baseHue: 0.85,
  hueSpeed: 0.25,
};

export function NeonSmokeScene() {
  const [params, setParams] = useState<SimParams>(DEFAULT_PARAMS);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px] gap-4">
      <NeonSmokeCanvasView params={params} />
      <NeonSmokeControls
        params={params}
        onChange={setParams}
        onReset={() => setParams(DEFAULT_PARAMS)}
      />
    </div>
  );
}
