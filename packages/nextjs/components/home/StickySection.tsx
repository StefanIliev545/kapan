"use client";

import { ReactNode, cloneElement, isValidElement, useState, useEffect } from "react";
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

// Props that can be injected into content components
export interface SectionContentProps {
  isActive?: boolean;
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
  
  // Track if this section is active (opacity > 0.8)
  const [isActive, setIsActive] = useState(false);
  const [hasBeenActive, setHasBeenActive] = useState(false);
  
  useEffect(() => {
    const unsubscribe = opacity.on("change", (v) => {
      const active = v > 0.8;
      setIsActive(active);
      if (active && !hasBeenActive) {
        setHasBeenActive(true);
      }
    });
    return () => unsubscribe();
  }, [opacity, hasBeenActive]);

  const isCompact = section.compactHeader;
  
  // Clone content element and inject isActive prop if it accepts it
  const contentWithProps = section.content && isValidElement(section.content)
    ? cloneElement(section.content as React.ReactElement<SectionContentProps>, { isActive: hasBeenActive })
    : section.content;

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
      <div className={`w-full ${isCompact ? "max-w-7xl" : "max-w-5xl"} flex flex-col items-center px-6 text-center md:px-8`}>
        {/* Tag + Title + Description */}
        <div className={`flex flex-col items-center ${isCompact ? "mb-4 gap-2 md:mb-6 md:gap-3" : "mb-8 gap-4 md:mb-12 md:gap-6"}`}>
          {/* Decorative line */}
          <motion.div
            initial={{ width: 0 }}
            whileInView={{ width: "40px" }}
            className="bg-base-content/20 h-[1px]"
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
        <p className={`text-base-content/60 max-w-2xl font-light leading-relaxed ${isCompact ? "mb-4 text-base md:mb-6 md:text-lg" : "mb-8 text-lg md:mb-12 md:text-xl lg:text-2xl"}`}>
          {section.description}
        </p>

        {/* Optional content (mock components, CTA, etc.) */}
        {section.content && (
          <div className="flex w-full justify-center">
            {contentWithProps}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default StickySection;
