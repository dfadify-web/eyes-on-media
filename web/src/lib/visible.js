import { useEffect, useState } from 'react';

// true mientras el elemento está (o ha estado hace poco) cerca de la pantalla
export function useVisible(ref, margin = '300px') {
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVis(e.isIntersecting), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref.current]);
  return vis;
}
