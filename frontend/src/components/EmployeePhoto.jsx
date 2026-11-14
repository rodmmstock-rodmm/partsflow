import { useEffect, useRef, useState } from "react";

/**
 * Load employee photos only while their avatar is near the viewport.
 * Removing the source when it leaves view pauses animated GIF network/decode
 * work; it reloads and resumes automatically when visible again.
 */
export default function EmployeePhoto({ src, alt = "", className = "", style }) {
  const imageRef = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = imageRef.current;
    if (!node) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "80px", threshold: 0.01 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [src]);

  return (
    <img
      ref={imageRef}
      src={visible && src ? src : undefined}
      alt={alt}
      className={className}
      style={style}
      loading="lazy"
      decoding="async"
    />
  );
}
