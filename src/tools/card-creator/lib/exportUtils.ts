const EXPORT_PLACEHOLDER_IMAGE =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="100%" height="100%" fill="#1f2937"/><text x="50%" y="50%" fill="#9ca3af" font-size="18" font-family="sans-serif" dominant-baseline="middle" text-anchor="middle">Изображение недоступно при экспорте</text></svg>`
  );

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { mode: "cors", signal: controller.signal });
    if (!response.ok) throw new Error(`Failed to load ${url} (${response.status})`);
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function toDataUrl(url: string, timeoutMs: number) {
  const response = await fetchWithTimeout(url, timeoutMs);
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

type InlineOptions = {
  timeoutMs?: number;
};

async function inlineImage(img: HTMLImageElement, options: InlineOptions, restoreCallbacks: Array<() => void>) {
  const timeoutMs = options.timeoutMs ?? 8000;
  const src = img.currentSrc || img.getAttribute("src");
  if (!src || src.startsWith("data:") || src.startsWith("blob:")) {
    return;
  }

  const originalSrc = img.getAttribute("src") ?? "";
  const originalSrcSet = img.getAttribute("srcset");
  const originalCrossOrigin = img.getAttribute("crossorigin");

  const applyPlaceholder = () => {
    if (originalSrcSet) img.removeAttribute("srcset");
    img.setAttribute("src", EXPORT_PLACEHOLDER_IMAGE);
    restoreCallbacks.push(() => {
      img.setAttribute("src", originalSrc);
      if (originalSrcSet) {
        img.setAttribute("srcset", originalSrcSet);
      } else {
        img.removeAttribute("srcset");
      }
      if (originalCrossOrigin) {
        img.setAttribute("crossorigin", originalCrossOrigin);
      } else {
        img.removeAttribute("crossorigin");
      }
    });
  };

  try {
    let dataUrl: string | null = null;

    dataUrl = await toDataUrl(src, timeoutMs);

    if (!dataUrl) {
      applyPlaceholder();
      return;
    }

    img.setAttribute("crossorigin", "anonymous");
    if (originalSrcSet) img.removeAttribute("srcset");
    img.setAttribute("src", dataUrl);

    restoreCallbacks.push(() => {
      img.setAttribute("src", originalSrc);
      if (originalSrcSet) {
        img.setAttribute("srcset", originalSrcSet);
      } else {
        img.removeAttribute("srcset");
      }
      if (originalCrossOrigin) {
        img.setAttribute("crossorigin", originalCrossOrigin);
      } else {
        img.removeAttribute("crossorigin");
      }
    });
  } catch (error) {
    console.warn("Failed to inline image", error);
    applyPlaceholder();
  }
}

export async function inlineExternalImages(root: HTMLElement, options: InlineOptions = {}) {
  const images = Array.from(root.querySelectorAll<HTMLImageElement>("img"));
  const restoreCallbacks: Array<() => void> = [];

  for (const img of images) {
    // sequential to avoid saturating the network
    // eslint-disable-next-line no-await-in-loop
    await inlineImage(img, options, restoreCallbacks);
  }

  return () => {
    restoreCallbacks.forEach((restore) => restore());
  };
}

export function buildSafeFileName(title?: string | null, fallback = "карта") {
  const trimmed = String(title ?? "").trim() || fallback;
  const sanitized = trimmed.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ");
  return sanitized.slice(0, 80);
}

export async function exportCardAsPng(cardElement: HTMLElement, title?: string | null) {
  let restoreImages: (() => void) | undefined;
  try {
    restoreImages = await inlineExternalImages(cardElement);
    const { toPng } = await import("html-to-image");
    const dataUrl = await toPng(cardElement, {
      pixelRatio: 2,
      backgroundColor: "transparent",
      skipFonts: false,
    });

    const link = document.createElement("a");
    const safeTitle = buildSafeFileName(title);
    link.download = `${safeTitle}-карта.png`;
    link.href = dataUrl;
    link.click();
  } finally {
    restoreImages?.();
  }
}
