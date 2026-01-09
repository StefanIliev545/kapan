"use client";

import { Heading } from "@radix-ui/themes";

type TabHeadingProps = {
  children: React.ReactNode;
  className?: string;
};

export const TabHeading = ({ children, className }: TabHeadingProps) => {
  return (
    <Heading as="h3" size="6" weight="light" className={`font-display text-base-content mb-3 ${className ?? ""}`}>
      {children}
    </Heading>
  );
};

export default TabHeading;


