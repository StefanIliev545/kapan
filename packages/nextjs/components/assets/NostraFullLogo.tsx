import Image from "next/image";

interface LogoProps {
  width: number;
  height: number;
  className?: string;
}

const NostraFullLogo = ({ width, height, className = "" }: LogoProps) => (
  <>
    <Image
      src="/logos/nostra_full_dark.svg"
      alt="Nostra"
      width={width}
      height={height}
      className={`${className} hidden dark:inline`}
    />
    <Image
      src="/logos/nostra_full.svg"
      alt="Nostra"
      width={width}
      height={height}
      className={`${className} dark:hidden`}
    />
  </>
);

export default NostraFullLogo;
