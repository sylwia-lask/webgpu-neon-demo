import { useEffect, useMemo, useRef } from "react";
import type { MouseState } from "./types";

export function useSimMouse(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  simWidth: number,
  simHeight: number
) {
  const mouseRef = useRef<MouseState>({ x: 0, y: 0, down: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onDown = () => (mouseRef.current.down = true);
    const onUp = () => (mouseRef.current.down = false);

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      mouseRef.current.x = nx * simWidth;
      mouseRef.current.y = ny * simHeight;
    };

    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    canvas.addEventListener("mousemove", onMove);

    return () => {
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("mousemove", onMove);
    };
  }, [canvasRef, simWidth, simHeight]);

  return useMemo(() => mouseRef, []);
}
