/**
 * Rasterizes a DOM element to a PNG data URL using an inline SVG <foreignObject>.
 *
 * This is used instead of html2canvas because html2canvas cannot parse modern
 * CSS color functions (e.g. oklch) that the app's design tokens use, and it
 * inherits those computed styles from the surrounding page.
 */
export async function rasterizeElement(
  el: HTMLElement,
  width: number,
  height: number,
  scale = 2,
  background = "#ffffff",
): Promise<HTMLCanvasElement> {
  const clone = el.cloneNode(true) as HTMLElement;
  const markup = new XMLSerializer().serializeToString(clone);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<foreignObject x="0" y="0" width="${width}" height="${height}">${markup}</foreignObject>` +
    `</svg>`;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not render the document page."));
    image.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}
