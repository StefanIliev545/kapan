import { promises as fs } from "fs";
import path from "path";

const PUBLIC_LOGOS_DIR = path.join(process.cwd(), "public", "logos");

async function readFileIfExists(filePath: string) {
  try {
    const data = await fs.readFile(filePath);
    return data;
  } catch {
    return null;
  }
}

export async function GET(_req: Request, { params }: { params: { name: string } }) {
  const raw = (params.name || "").toString();
  const name = raw.toLowerCase();

  const svgPath = path.join(PUBLIC_LOGOS_DIR, `${name}.svg`);
  const pngPath = path.join(PUBLIC_LOGOS_DIR, `${name}.png`);
  const questionPath = path.join(PUBLIC_LOGOS_DIR, "question-mark.svg");

  // Try SVG
  const svg = await readFileIfExists(svgPath);
  if (svg) {
    return new Response(svg, {
      status: 200,
      headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=31536000, immutable" },
    });
  }

  // Try PNG
  const png = await readFileIfExists(pngPath);
  if (png) {
    return new Response(png, {
      status: 200,
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" },
    });
  }

  // Fallback to question mark
  const fallback = await readFileIfExists(questionPath);
  if (fallback) {
    return new Response(fallback, {
      status: 200,
      headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" },
    });
  }

  return new Response("Not found", { status: 404 });
}


