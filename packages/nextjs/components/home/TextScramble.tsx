"use client";

import { useEffect, useState, useCallback, useRef } from "react";

interface TextScrambleProps {
  phrases: string[];
  /** Time to display each phrase in ms (default: 3000) */
  displayDuration?: number;
  /** Time to reveal the text in ms (default: 750) */
  revealDuration?: number;
  /** CSS class for the text */
  className?: string;
}

// Mixed character set: crypto/hacker symbols + some alphanumeric
const CHARS = "@#$%&*!?<>[]{}ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

const getRandomChar = () => CHARS[Math.floor(Math.random() * CHARS.length)];

export const TextScramble = ({
  phrases,
  displayDuration = 3000,
  revealDuration = 750,
  className = "",
}: TextScrambleProps) => {
  const [displayText, setDisplayText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const frameRef = useRef<number | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isAnimatingRef = useRef(false);

  const scrambleText = useCallback(
    (targetText: string) => {
      const length = targetText.length;
      const startTime = performance.now();
      isAnimatingRef.current = true;
      
      // Store current scrambled chars so they persist between frames
      const scrambledChars = targetText.split("").map((char) => 
        char === " " ? " " : getRandomChar()
      );
      let lastScrambleTime = 0;
      const scrambleInterval = 50; // Change random chars every 50ms (20 changes/sec)

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / revealDuration, 1);

        // Number of characters revealed from the RIGHT side
        const revealedCount = Math.floor(progress * length);
        // Index where revealed section starts (counting from right)
        const revealStartIndex = length - revealedCount;
        
        // Only update scrambled characters every scrambleInterval ms
        if (currentTime - lastScrambleTime > scrambleInterval) {
          lastScrambleTime = currentTime;
          // Randomize non-revealed characters (left side, not yet revealed)
          for (let i = 0; i < revealStartIndex; i++) {
            if (targetText[i] !== " ") {
              scrambledChars[i] = getRandomChar();
            }
          }
        }

        // Build the display string - reveal from RIGHT to LEFT
        let result = "";
        for (let i = 0; i < length; i++) {
          if (targetText[i] === " ") {
            result += " ";
          } else if (i >= revealStartIndex) {
            // This character is revealed (right side)
            result += targetText[i];
          } else {
            // This character is still scrambling (left side)
            result += scrambledChars[i];
          }
        }

        setDisplayText(result);

        if (progress < 1) {
          frameRef.current = requestAnimationFrame(animate);
        } else {
          // Ensure final text is exactly correct
          setDisplayText(targetText);
          isAnimatingRef.current = false;
          
          // Schedule next phrase
          timeoutRef.current = setTimeout(() => {
            setCurrentIndex((prev) => (prev + 1) % phrases.length);
          }, displayDuration);
        }
      };

      frameRef.current = requestAnimationFrame(animate);
    },
    [revealDuration, displayDuration, phrases.length]
  );

  // Trigger animation when currentIndex changes
  useEffect(() => {
    if (phrases.length === 0) return;
    
    const currentPhrase = phrases[currentIndex];
    scrambleText(currentPhrase);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [currentIndex, phrases, scrambleText]);

  // Initialize with first phrase's length in scrambled chars
  useEffect(() => {
    if (phrases.length > 0 && !displayText) {
      const initialScrambled = phrases[0]
        .split("")
        .map((char) => (char === " " ? " " : getRandomChar()))
        .join("");
      setDisplayText(initialScrambled);
    }
  }, [phrases, displayText]);

  return (
    <span className={className}>
      {displayText}
    </span>
  );
};

export default TextScramble;
