export const compressImage = (base64: string, maxWidth = 4096, quality = 0.95): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    // PNG sources keep alpha; JPEG output would flatten transparency to black
    const isPng = /^data:image\/png/i.test(base64) || /\.png(\?|#|$)/i.test(base64);
    // Set crossOrigin to anonymous to avoid tainted canvas when loading from URLs
    if (!base64.startsWith('data:')) {
      img.crossOrigin = "anonymous";
    }
    img.src = base64;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (maxWidth / width) * height;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(isPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', quality));
      } else {
        resolve(base64);
      }
    };
    img.onerror = () => resolve(base64);
  });
};
