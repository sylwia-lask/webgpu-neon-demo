import { useEffect, useRef } from "react";
import type { MouseState } from "./types";

export function useSimMouse(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  simWidth: number,
  simHeight: number
) {
  const mouseRef = useRef<MouseState>({
    x: 0,
    y: 0,
    down: false,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onEnter = () => {
      mouseRef.current.down = true;
    };

    const onLeave = () => {
      mouseRef.current.down = false;
    };

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;

      mouseRef.current.x = nx * simWidth;
      mouseRef.current.y = ny * simHeight;
    };

    canvas.addEventListener("mouseenter", onEnter);
    canvas.addEventListener("mouseleave", onLeave);
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerenter", onEnter);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.style.touchAction = "none";

    return () => {
      canvas.removeEventListener("mouseenter", onEnter);
      canvas.removeEventListener("mouseleave", onLeave);
      canvas.removeEventListener("mousemove", onMove);
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerenter", onEnter);
      canvas.addEventListener("pointerleave", onLeave);
    };
  }, [canvasRef, simWidth, simHeight]);

  return mouseRef;
}
