"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

export function RedactedAnalytics() {
  const beforeSend = (event: BeforeSendEvent) => {
    if (
      "data" in event &&
      event.data &&
      typeof event.data === "object" &&
      "address" in event.data
    ) {
      delete (event.data as Record<string, unknown>).address;
    }

    return event;
  };

  return <Analytics beforeSend={beforeSend} />;
}
