import { useEffect, useState } from "react";

export function useLandingPresentation() {
  const [isCinematic, setIsCinematic] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(
      "(min-width: 1024px) and (min-height: 800px) and (prefers-reduced-motion: no-preference)",
    );
    const updatePresentation = () => setIsCinematic(query.matches);

    updatePresentation();
    query.addEventListener("change", updatePresentation);
    return () => query.removeEventListener("change", updatePresentation);
  }, []);

  return isCinematic;
}
