import { useEffect, useRef } from 'react';
import { createCarSprite } from '../game/sprites';

export function CarPreview({ color, model, className = '' }: { color: string; model: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const context = canvas.getContext('2d')!;
    context.clearRect(0, 0, 248, 136);
    context.drawImage(createCarSprite(color, model), 0, 0);
  }, [color, model]);
  return <canvas ref={ref} width={248} height={136} className={`car-preview ${className}`} role="img" aria-label={`${model} sports car, rear view`} />;
}