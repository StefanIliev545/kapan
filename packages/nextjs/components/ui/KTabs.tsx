"use client";

import * as React from "react";
import { Tabs } from "@radix-ui/themes";

type WithClassName<T> = T & { className?: string };

export const KTabsRoot = Tabs.Root;

export const KTabsList: React.FC<WithClassName<React.ComponentProps<typeof Tabs.List>>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <Tabs.List
      {...props}
      className={`gap-2 justify-center flex-wrap mx-auto ${className ?? ""}`}
    >
      {children}
    </Tabs.List>
  );
};

export const KTabsTrigger: React.FC<WithClassName<React.ComponentProps<typeof Tabs.Trigger>>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <Tabs.Trigger
      {...props}
      className={`px-3 py-2 rounded-md text-base-content/80 hover:text-base-content border-t-2 border-transparent data-[state=active]:text-primary data-[state=active]:border-primary data-[state=active]:font-semibold ${className ?? ""}`}
    >
      {children}
    </Tabs.Trigger>
  );
};

export const KTabsContent = Tabs.Content;


