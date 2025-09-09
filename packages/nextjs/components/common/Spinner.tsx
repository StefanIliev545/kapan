import clsx from "clsx";

export type SpinnerProps = {
  size?: "loading-xs" | "loading-sm" | "loading-md" | "loading-lg";
  className?: string;
};

const Spinner = ({ size = "loading-md", className }: SpinnerProps) => (
  <span className={clsx("loading loading-spinner", size, className)} />
);

export default Spinner;
