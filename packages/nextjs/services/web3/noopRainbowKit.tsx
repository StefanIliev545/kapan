import React from "react";

export const RainbowKitProvider = ({ children }: { children: React.ReactNode; [key: string]: any }) => <>{children}</>;
export const darkTheme = () => ({ });
export const lightTheme = () => ({ });

type RenderProps = {
  account: any;
  chain: any;
  openConnectModal: () => void;
  mounted: boolean;
};
type ConnectButtonProps = { children: (props: RenderProps) => React.ReactNode };
export const ConnectButton = {
  Custom: ({ children }: ConnectButtonProps) => (
    <>{children({ account: null, chain: { unsupported: false, id: 0 }, openConnectModal: () => {}, mounted: false })}</>
  ),
};

export type AvatarComponent = React.FC<any>;

