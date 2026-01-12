import { useEffect, useRef, useState } from "react";
import { NeonSmokeRenderer } from "../webgpu/renderer";
import { SIM_HEIGHT, SIM_WIDTH } from "../webgpu/constants";
import { useSimMouse } from "../webgpu/mouse";
import type { SimParams } from "../webgpu/params";

type Props = {
  params: SimParams;
};

export function NeonSmokeCanvasView({ params }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<NeonSmokeRenderer | null>(null);
  const mouseRef = useSimMouse(canvasRef, SIM_WIDTH, SIM_HEIGHT);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    rendererRef.current?.setParams(params);
  }, [params]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new NeonSmokeRenderer(canvas);
    rendererRef.current = renderer;

    let disposed = false;

    (async () => {
      try {
        await renderer.init();
        if (disposed) return;
        renderer.setParams(params);
        renderer.start(() => mouseRef.current);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
      }
    })();

    return () => {
      disposed = true;
      rendererRef.current = null;
      renderer.destroy();
    };
  }, [mouseRef, params]);

  return (
    <div className="relative aspect-video rounded-2xl overflow-hidden border border-slate-800/60 shadow-[0_0_120px_rgba(236,72,153,0.35)]">
      <canvas ref={canvasRef} className="h-full w-full block" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-slate-950/70 via-transparent to-fuchsia-500/10" />

      {error && (
        <div className="absolute left-4 right-4 bottom-4 rounded-xl border border-rose-800/60 bg-rose-900/30 px-4 py-3 text-rose-100">
          {error}
        </div>
      )}
    </div>
  );
}
