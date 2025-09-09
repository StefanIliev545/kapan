import Image from "next/image";

interface VesuLogoProps {
  width: number;
  height: number;
  className?: string;
}

export const VesuLogo = ({ width, height, className = "" }: VesuLogoProps) => (
  <>
    <Image
      src="/logos/vesu.svg"
      alt="Vesu"
      width={width}
      height={height}
      className={`${className} hidden dark:inline`}
    />
    <Image
      src="/logos/vesu.svg"
      alt="Vesu"
      width={width}
      height={height}
      className={`${className} dark:hidden`}
      style={{ filter: "invert(1)" }}
    />
  </>
);

export default VesuLogo;
