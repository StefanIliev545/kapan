"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";

type ProtocolItem = {
  name: string;
  icon: string;
};

type ProtocolCycleProps = {
  protocols?: ProtocolItem[];
  intervalMs?: number;
  className?: string;
  iconSizePx?: number;
  minWidthPx?: number;
  minWidthCh?: number;
  padPx?: number;
};

export const ProtocolCycle = ({
  protocols: protocolsProp,
  intervalMs = 2000,
  className,
  iconSizePx = 22,
  minWidthPx,
  minWidthCh,
  padPx = 0,
}: ProtocolCycleProps) => {
  const protocols = useMemo<ProtocolItem[]>(
    () =>
      protocolsProp ?? [
        { name: "Aave", icon: "/logos/aave.svg" },
        { name: "Compound", icon: "/logos/compound.svg" },
        { name: "Vesu", icon: "/logos/vesu.svg" },
        { name: "Nostra", icon: "/logos/nostra.svg" },
        { name: "Venus", icon: "/logos/venus.svg" },
      ],
    [protocolsProp],
  );

  const [index, setIndex] = useState(0);
  const [maxWidth, setMaxWidth] = useState<number | null>(null);
  const [maxHeight, setMaxHeight] = useState<number | null>(null);
  const measureRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex(prev => (prev + 1) % protocols.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [protocols.length, intervalMs]);

  // Measure the widest/ tallest item so the container width/height remains stable
  useLayoutEffect(() => {
    const node = measureRef.current;
    if (!node) return;
    const children = Array.from(node.children) as HTMLElement[];
    if (!children.length) return;

    const widths = children.map(el => el.offsetWidth);
    const heights = children.map(el => el.offsetHeight);
    const nextMaxWidth = Math.max(...widths);
    const nextMaxHeight = Math.max(...heights);
    setMaxWidth(nextMaxWidth);
    setMaxHeight(nextMaxHeight);
  }, [protocols]);

  const current = protocols[index];
  const yDelta = Math.max(12, Math.min(28, (maxHeight ?? 24) * 0.75));

  return (
    <span
      className={"relative inline-flex items-center align-middle overflow-y-hidden overflow-x-visible max-w-full " + (className ?? "")}
      style={{
        width: maxWidth != null ? maxWidth + padPx : undefined,
        minWidth: minWidthPx != null ? minWidthPx : minWidthCh != null ? `${minWidthCh}ch` : undefined,
        maxWidth: "100%",
        height: maxHeight ?? undefined,
      }}
    >
      {/* Invisible measuring container */}
      <span ref={measureRef} className="absolute opacity-0 pointer-events-none">
        {protocols.map(p => (
          <span key={p.name} className="inline-flex items-center gap-2 whitespace-nowrap">
            <Image src={p.icon} alt="" width={iconSizePx} height={iconSizePx} />
            <span className="font-semibold">{p.name}</span>
          </span>
        ))}
      </span>

      {/* Animated content */}
      <AnimatePresence initial={false} mode="wait">
        <motion.span
          key={current.name}
          initial={{ y: yDelta, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -yDelta, opacity: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="absolute inset-0 inline-flex items-center gap-2 whitespace-nowrap"
          aria-live="polite"
        >
          <Image
            src={current.icon}
            alt={`${current.name} logo`}
            width={iconSizePx}
            height={iconSizePx}
            className="object-contain"
          />
          <span className="font-semibold">{current.name}</span>
        </motion.span>
      </AnimatePresence>
    </span>
  );
};

export default ProtocolCycle;


