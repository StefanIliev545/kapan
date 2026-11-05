"use client";

import { Component, type ReactNode } from "react";

/** The optional WebGL decoration must never take down the landing page. */
export class HeroSceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return null;
    }

    return this.props.children;
  }
}
