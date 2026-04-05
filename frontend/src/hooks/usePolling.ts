import { useEffect, useRef } from "react";

export function usePolling(callback: () => void | Promise<void>, delay = 10000) {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    void savedCallback.current();
    const id = window.setInterval(() => {
      void savedCallback.current();
    }, delay);
    return () => window.clearInterval(id);
  }, [delay]);
}
