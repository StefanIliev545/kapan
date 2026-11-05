// @vitest-environment node
import { createElement } from "react";
import { resolveAppUrl, useAppUrl } from "../common/useAppUrl";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

describe("resolveAppUrl", () => {
  it.each(["https://kapan.finance", "https://www.kapan.finance", "http://kapan.finance"])(
    "opens the HTTPS production app from %s",
    origin => {
      expect(resolveAppUrl(new URL(origin))).toBe("https://app.kapan.finance");
    },
  );

  it("keeps the existing production app origin", () => {
    expect(resolveAppUrl(new URL("https://app.kapan.finance/markets"))).toBe("https://app.kapan.finance");
  });

  it.each([
    "https://kapan-git-landing-team.vercel.app",
    "https://app.kapan-preview.vercel.app",
    "http://localhost",
    "http://localhost:3000",
    "http://localhost:4173",
    "http://app.localhost:3000",
    "http://127.0.0.1",
    "http://127.0.0.1:4173",
  ])("keeps %s on the current deployment", origin => {
    const location = new URL(origin);
    const appUrl = resolveAppUrl(location);

    expect(appUrl).toBe("/app");
    expect(new URL(appUrl, location).href).toBe(`${location.origin}/app`);
  });
});

describe("useAppUrl", () => {
  it("renders a working relative app link without a browser", () => {
    const AppLink = () => createElement("a", { href: useAppUrl() }, "Launch app");

    expect(typeof window).toBe("undefined");
    expect(renderToString(createElement(AppLink))).toBe('<a href="/app">Launch app</a>');
  });
});
