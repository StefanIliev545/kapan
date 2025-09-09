import Image from "next/image";

interface LogoProps {
  width: number;
  height: number;
  className?: string;
}

const VesuFullLogo = ({ width, height, className = "" }: LogoProps) => (
  <>
    <Image
      src="/logos/vesu_full_dark.svg"
      alt="Vesu"
      width={width}
      height={height}
      className={`${className} hidden dark:inline`}
    />
    <Image
      src="/logos/vesu_full.svg"
      alt="Vesu"
      width={width}
      height={height}
      className={`${className} dark:hidden`}
    />
  </>
);

export default VesuFullLogo;
