import type { PropsWithChildren } from "react";
import { EvmWalletProvider } from "../EvmWalletProvider";
import { useEvmWalletSession } from "../EvmWalletSession";
import { cleanup, render, screen } from "@testing-library/react";
import { afterAll, afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", "");
  return { privyLoaded: vi.fn() };
});

vi.mock("../PrivyWalletProvider", () => {
  mocks.privyLoaded();
  return { default: ({ children }: PropsWithChildren) => children };
});
vi.mock("../ExternalWalletProvider", () => ({
  ExternalWalletProvider: ({
    children,
    reconnectOnMount = true,
  }: PropsWithChildren<{ reconnectOnMount?: boolean }>) => (
    <section data-testid="external-provider" data-reconnect={String(reconnectOnMount)}>
      {children}
    </section>
  ),
}));

afterEach(cleanup);
afterAll(() => {
  vi.unstubAllEnvs();
});

it("keeps normal external wallet behavior without loading Privy when no app ID is configured", () => {
  function Probe() {
    const session = useEvmWalletSession();
    return (
      <span>
        {session.kind}:{String(session.ready)}:{String(Boolean(session.loginWithEmail))}
      </span>
    );
  }

  render(
    <EvmWalletProvider>
      <Probe />
    </EvmWalletProvider>,
  );
  expect(screen.getByTestId("external-provider")).toHaveAttribute("data-reconnect", "true");
  expect(screen.getByText("external:true:false")).toBeInTheDocument();
  expect(mocks.privyLoaded).not.toHaveBeenCalled();
});
