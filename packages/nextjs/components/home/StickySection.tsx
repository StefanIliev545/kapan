"use client";

import { ReactNode } from "react";
import { motion, MotionValue, useTransform } from "framer-motion";
import { TextScramble } from "./TextScramble";

export interface SectionData {
  tag: string;
  title: string;
  description: string;
  content?: ReactNode;
  /** If true, use smaller text and tighter spacing to make room for larger content */
  compactHeader?: boolean;
  /** If provided, cycles through these titles with scramble effect */
  titlePhrases?: string[];
}

interface StickySectionProps {
  section: SectionData;
  index: number;
  total: number;
  scrollYProgress: MotionValue<number>;
}

export const StickySection = ({
  section,
  index,
  total,
  scrollYProgress,
}: StickySectionProps) => {
  const center = index / (total - 1);
  const neighborDistance = 1 / (total - 1);
  const inputRange = [center - neighborDistance, center, center + neighborDistance];

  // Opacity: fade in and out as we scroll through
  const opacity = useTransform(
    scrollYProgress,
    [center - neighborDistance * 0.4, center, center + neighborDistance * 0.4],
    [0, 1, 0]
  );

  // Scale: slightly smaller when not in focus
  const scale = useTransform(scrollYProgress, inputRange, [0.95, 1, 0.95]);
  
  // Y position: slide up as we scroll
  const y = useTransform(scrollYProgress, inputRange, [40, 0, -40]);

  // Pointer events: only interactive when visible
  const pointerEvents = useTransform(opacity, (v) => (v > 0.5 ? "auto" : "none"));

  const isCompact = section.compactHeader;

  return (
    <motion.div
      style={{
        opacity,
        scale,
        y,
        zIndex: index,
        pointerEvents,
      }}
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
    >
      <div className={`w-full ${isCompact ? "max-w-7xl" : "max-w-5xl"} px-6 md:px-8 flex flex-col items-center text-center`}>
        {/* Tag + Title + Description */}
        <div className={`flex flex-col items-center ${isCompact ? "gap-2 md:gap-3 mb-4 md:mb-6" : "gap-4 md:gap-6 mb-8 md:mb-12"}`}>
          {/* Decorative line */}
          <motion.div
            initial={{ width: 0 }}
            whileInView={{ width: "40px" }}
            className="h-[1px] bg-base-content/20"
          />
          
          {/* Section tag */}
          <span className="landing-tag text-base-content/40">
            {section.tag}
          </span>
          
          {/* Main title */}
          <h2 className={`landing-title text-base-content ${isCompact ? "text-3xl sm:text-4xl md:text-5xl lg:text-6xl" : "text-5xl sm:text-6xl md:text-7xl lg:text-8xl"}`}>
            {section.titlePhrases ? (
              <TextScramble 
                phrases={section.titlePhrases} 
                displayDuration={3000}
                revealDuration={750}
              />
            ) : (
              section.title
            )}
          </h2>
        </div>

        {/* Description */}
        <p className={`text-base-content/60 leading-relaxed font-light max-w-2xl ${isCompact ? "text-base md:text-lg mb-4 md:mb-6" : "text-lg md:text-xl lg:text-2xl mb-8 md:mb-12"}`}>
          {section.description}
        </p>

        {/* Optional content (mock components, CTA, etc.) */}
        {section.content && (
          <div className="w-full flex justify-center">
            {section.content}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default StickySection;
