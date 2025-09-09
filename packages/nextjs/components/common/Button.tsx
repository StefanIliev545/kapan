import Link from "next/link";
import clsx from "clsx";
import { AnchorHTMLAttributes, ButtonHTMLAttributes, PropsWithChildren } from "react";

export type ButtonProps = {
  href?: string;
  variant?: "primary" | "outline" | "ghost";
} & ButtonHTMLAttributes<HTMLButtonElement> & AnchorHTMLAttributes<HTMLAnchorElement>;

const baseClasses = "btn";
const variantClasses: Record<string, string> = {
  primary: "btn-primary",
  outline: "btn-outline",
  ghost: "btn-ghost",
};

const Button = ({ href, variant = "primary", className, children, ...rest }: PropsWithChildren<ButtonProps>) => {
  const classes = clsx(baseClasses, variantClasses[variant], className);
  if (href) {
    return (
      <Link href={href} className={classes} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
};

export default Button;
