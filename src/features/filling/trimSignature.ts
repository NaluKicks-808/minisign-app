/**
 * A PNG of only the inked part of the canvas, so a drawn signature fills its box.
 * The library's getTrimmedCanvas throws under Vite: its trim-canvas import resolves to a non-function.
 */
export function trimmedSignaturePng(canvas: HTMLCanvasElement): string {
  const { width, height } = canvas;
  const context = canvas.getContext('2d');
  if (!context) return canvas.toDataURL('image/png');

  const { data } = context.getImageData(0, 0, width, height);
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3]) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  if (right < 0) return canvas.toDataURL('image/png');

  const copy = document.createElement('canvas');
  copy.width = right - left + 1;
  copy.height = bottom - top + 1;
  copy
    .getContext('2d')
    ?.drawImage(canvas, left, top, copy.width, copy.height, 0, 0, copy.width, copy.height);
  return copy.toDataURL('image/png');
}
