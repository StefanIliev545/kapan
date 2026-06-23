import type { Metadata } from "next";

const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : `http://localhost:${process.env.PORT || 3000}`;
const titleTemplate = "%s | Kapan";

export const getMetadata = ({
  title,
  description,
  imageRelativePath = "/thumbnail.png",
  canonicalPath,
}: {
  title: string;
  description: string;
  imageRelativePath?: string;
  /** Relative self-canonical path (e.g. "/rates/arbitrum/usdc"). metadataBase prefixes it. */
  canonicalPath?: string;
}): Metadata => {
  const imageUrl = `${baseUrl}${imageRelativePath}`;

  return {
    metadataBase: new URL(baseUrl),
    alternates: canonicalPath ? { canonical: canonicalPath } : undefined,
    title: {
      default: title,
      template: titleTemplate,
    },
    description: description,
    applicationName: "Kapan Finance",
    openGraph: {
      title: {
        default: title,
        template: titleTemplate,
      },
      description: description,
      siteName: "Kapan Finance",
      type: "website",
      locale: "en_US",
      url: baseUrl,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      site: "@KapanFinance",
      creator: "@KapanFinance",
      title: {
        default: title,
        template: titleTemplate,
      },
      description: description,
      images: [imageUrl],
    },
    icons: {
      // TODO: the declared 32x32 is actually a full-size image (~560KB). Generate real 32x32 /
      // 16x16 favicons + a 180x180 apple-touch-icon and point to them here.
      icon: [{ url: "/favicon.png", sizes: "32x32", type: "image/png" }],
      apple: [{ url: "/favicon.png", sizes: "180x180", type: "image/png" }],
    },
  };
};
