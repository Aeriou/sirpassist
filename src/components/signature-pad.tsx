import { useEffect, useRef, type PointerEvent } from "react";
import { Button } from "./ui/button";

export function SignaturePad({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (dataUrl?: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ratio = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.floor(w * ratio);
    canvas.height = Math.floor(h * ratio);
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#e8eef2";
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, w, h);
      img.src = value;
    }
  }, [value]);

  function pos(e: PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function down(e: PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function move(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function up(e: PointerEvent<HTMLCanvasElement>) {
    drawing.current = false;
    onChange(e.currentTarget.toDataURL("image/png"));
  }

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium tracking-wide text-muted">{label}</p>
      <canvas
        ref={canvasRef}
        className="h-28 w-full touch-none rounded-lg bg-surface-2 shadow-[var(--shadow-border)]"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
      />
      <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={() => onChange(undefined)}>
        Effacer
      </Button>
    </div>
  );
}
