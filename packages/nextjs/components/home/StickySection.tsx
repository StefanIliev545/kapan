"use client";

import { ReactNode, cloneElement, isValidElement, useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
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
  /** When false, the title scramble decodes once and settles on the last phrase (default loops). */
  loopTitle?: boolean;
  /** Heading tag for the title. Defaults to "h2"; the hero section uses "h1" for SEO/a11y. */
  headingLevel?: "h1" | "h2";
}

// Props that can be injected into content components
export interface SectionContentProps {
  isActive?: boolean;
}

// Static animation props for motion.div to avoid creating new objects on each render
const decorativeLineInitial = { width: 0 };
const decorativeLineWhileInView = { width: "40px" };

interface StickySectionProps {
  section: SectionData;
  index: number;
}

export const StickySection = ({ section, index }: StickySectionProps) => {
  const sectionRef = useRef<HTMLElement>(null);
  const hasBeenVisible = useInView(sectionRef, { once: true, amount: 0.15 });
  const reduceMotion = useReducedMotion();

  const isCompact = section.compactHeader;

  // Hero renders its title as <h1> (SEO/a11y); all other sections stay <h2>.
  const Heading = section.headingLevel ?? "h2";

  // Split the eyebrow tag ("00 / KAPAN") so the index reads in the accent color — a striking
  // hit that uses an existing theme token (no new hues), with the label kept legible at /60.
  const tagParts = section.tag.split(" / ");

  // Clone content element and inject isActive prop if it accepts it
  const contentWithProps = section.content && isValidElement(section.content)
    ? cloneElement(section.content as React.ReactElement<SectionContentProps>, { isActive: hasBeenVisible || !!reduceMotion })
    : section.content;

  return (
    <section
      ref={sectionRef}
      id={`landing-section-${index}`}
      aria-labelledby={`landing-heading-${index}`}
      className="relative flex min-h-[100svh] w-full scroll-mt-24 items-center justify-center pb-20 pt-28 md:pt-32"
    >
      <div className={`w-full ${isCompact ? "max-w-7xl" : "max-w-5xl"} flex flex-col items-center px-6 text-center md:px-8`}>
        {/* Tag + Title + Description */}
        <div className={`flex flex-col items-center ${isCompact ? "mb-4 gap-2 md:mb-6 md:gap-3" : "mb-8 gap-4 md:mb-12 md:gap-6"}`}>
          {/* Decorative line */}
          <motion.div
            initial={reduceMotion ? false : decorativeLineInitial}
            whileInView={decorativeLineWhileInView}
            className="bg-base-content/20 h-[1px]"
          />
          
          {/* Section tag */}
          <span className="landing-tag">
            {tagParts.length === 2 ? (
              <>
                <span className="text-accent">{tagParts[0]}</span>
                <span className="text-base-content/60"> / {tagParts[1]}</span>
              </>
            ) : (
              <span className="text-base-content/70">{section.tag}</span>
            )}
          </span>

          {/* Main title */}
          <Heading id={`landing-heading-${index}`} className={`landing-title text-balance text-base-content ${isCompact ? "text-3xl sm:text-4xl md:text-5xl lg:text-6xl" : "text-[2.75rem] sm:text-6xl md:text-7xl lg:text-8xl"}`}>
            {section.titlePhrases ? (
              <TextScramble
                phrases={section.titlePhrases}
                displayDuration={3000}
                revealDuration={750}
                loop={section.loopTitle ?? true}
              />
            ) : (
              section.title
            )}
          </Heading>
        </div>

        {/* Description */}
        <p className={`text-base-content/80 max-w-2xl font-normal leading-relaxed ${isCompact ? "mb-4 text-base md:mb-6 md:text-lg" : "mb-8 text-lg md:mb-12 md:text-xl lg:text-2xl"}`}>
          {section.description}
        </p>

        {/* Optional content (mock components, CTA, etc.) */}
        {section.content && (
          <div className="flex w-full justify-center">
            {contentWithProps}
          </div>
        )}
      </div>
    </section>
  );
};

export default StickySection;
