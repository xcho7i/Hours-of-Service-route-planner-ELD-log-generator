/**
 * Rasterize an inline <svg> element to a PNG and trigger a download.
 *
 * The log sheets are drawn entirely with vector primitives (no external/raster
 * images), so the canvas never becomes "tainted" and toBlob() works without any
 * CORS issues or third-party libraries.
 */
export function exportSvgToPng(
  svg: SVGSVGElement,
  filename: string,
  scale = 2
): Promise<void> {
  return new Promise((resolve, reject) => {
    const vb = svg.viewBox.baseVal;
    const width = vb && vb.width ? vb.width : svg.clientWidth || 513;
    const height = vb && vb.height ? vb.height : svg.clientHeight || 518;

    // Clone so we can guarantee namespaces / explicit size without mutating
    // what's on screen.
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));

    const xml = new XMLSerializer().serializeToString(clone);
    const svgUrl =
      "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D context unavailable."));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Failed to encode PNG."));
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Revoke a little later so the download has time to start.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        resolve();
      }, "image/png");
    };
    img.onerror = () => reject(new Error("Failed to render SVG to image."));
    img.src = svgUrl;
  });
}
