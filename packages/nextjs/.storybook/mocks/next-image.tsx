import React from "react";

// Mock next/image for Storybook
const Image = ({
  src,
  alt,
  width,
  height,
  className,
  style,
  ...props
}: {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
  [key: string]: unknown;
}) => {
  // Handle StaticImageData objects
  const imgSrc = typeof src === "object" && src !== null && "src" in src
    ? (src as { src: string }).src
    : src;

  return (
    <img
      src={imgSrc}
      alt={alt}
      width={width}
      height={height}
      className={className}
      style={style}
      {...props}
    />
  );
};

export default Image;
export { Image };
