import { useEffect, useRef, useState } from 'react';

/**
 * Measure a container's width so an SVG can be drawn at crisp device pixels (no
 * viewBox scaling) and pointer-x maps straight to plot coordinates. Returns a ref
 * to attach to the container and its current width (0 until first measured).
 */
export function useMeasuredWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect.width ?? 0));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}
