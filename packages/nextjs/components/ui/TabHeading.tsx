"use client";

import { Heading } from "@radix-ui/themes";

type TabHeadingProps = {
  children: React.ReactNode;
  className?: string;
};

export const TabHeading = ({ children, className }: TabHeadingProps) => {
  return (
    <Heading as="h3" size="6" weight="light" className={`font-display mb-3 text-base-content ${className ?? ""}`}>
      {children}
    </Heading>
  );
};

export default TabHeading;


