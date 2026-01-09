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
      className={`mx-auto flex-wrap justify-center gap-2 ${className ?? ""}`}
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
      className={`text-base-content/80 hover:text-base-content data-[state=active]:text-primary data-[state=active]:border-primary rounded-md border-t-2 border-transparent px-3 py-2 data-[state=active]:font-semibold ${className ?? ""}`}
    >
      {children}
    </Tabs.Trigger>
  );
};

export const KTabsContent = Tabs.Content;


