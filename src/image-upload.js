const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function normalizeImageType(file) {
  const raw = String(file?.type || "").toLowerCase().trim();
  if (raw === "image/jpg" || raw === "image/pjpeg") return "image/jpeg";
  if (ALLOWED_IMAGE_TYPES.has(raw)) return raw;
  const ext = String(file?.name || "").toLowerCase().match(/\.(jpe?g|png|webp)$/)?.[1];
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return raw;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob || null), type, quality);
    } catch {
      resolve(null);
    }
  });
}

async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close?.(),
    };
  }
  if (
    typeof Image !== "function" ||
    typeof URL?.createObjectURL !== "function" ||
    /jsdom/i.test(globalThis.navigator?.userAgent || "")
  ) {
    return null;
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      const timer = setTimeout(() => reject(new Error("timeout")), 8000);
      el.onload = () => {
        clearTimeout(timer);
        resolve(el);
      };
      el.onerror = () => {
        clearTimeout(timer);
        reject(new Error("decode_failed"));
      };
      el.src = url;
    });
    return {
      source: img,
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      cleanup: () => {},
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function optimiseImageFile(
  file,
  { maxWidth = 1920, maxHeight = 1440, minResizeBytes = 150 * 1024 } = {},
) {
  if (
    !file ||
    file.size <= minResizeBytes ||
    typeof document === "undefined" ||
    typeof File !== "function"
  ) {
    return file;
  }
  const probe = document.createElement("canvas");
  if (typeof probe.getContext !== "function") return file;

  let decoded = null;
  const canvas = document.createElement("canvas");
  try {
    decoded = await decodeImage(file);
    if (!decoded || !decoded.width || !decoded.height) return file;

    const scale = Math.min(1, maxWidth / decoded.width, maxHeight / decoded.height);
    if (scale === 1 && file.size <= 350 * 1024) return file;

    const targetW = Math.max(1, Math.round(decoded.width * scale));
    const targetH = Math.max(1, Math.round(decoded.height * scale));
    canvas.width = targetW;
    canvas.height = targetH;

    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.drawImage(decoded.source, 0, 0, targetW, targetH);

    let blob = await canvasToBlob(canvas, "image/webp", 0.84);
    if (!blob || blob.type !== "image/webp" || blob.size > 900 * 1024) {
      ctx.save();
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.restore();
      const jpegBlob = await canvasToBlob(canvas, "image/jpeg", 0.85);
      if (jpegBlob && (!blob || jpegBlob.size < blob.size)) {
        blob = jpegBlob;
      }
    }

    if (!blob || !blob.size || !ALLOWED_IMAGE_TYPES.has(blob.type)) return file;
    const resized = targetW < decoded.width || targetH < decoded.height;
    if (blob.size >= file.size && !resized) return file;
    if (resized && blob.size > file.size * 1.1) return file;

    const ext =
      blob.type === "image/webp" ? ".webp" : blob.type === "image/png" ? ".png" : ".jpg";
    const baseName = String(file.name || "photo").replace(/\.[^/.]+$/, "");
    return new File([blob], `${baseName}${ext}`, {
      type: blob.type,
      lastModified: file.lastModified || Date.now(),
    });
  } catch {
    return file;
  } finally {
    decoded?.cleanup?.();
    canvas.width = 0;
    canvas.height = 0;
  }
}

export function createUploadBatches(
  items,
  { maxFiles = 25, maxBytes = 4 * 1024 * 1024 } = {},
) {
  const batches = [];
  let current = [];
  let currentBytes = 0;
  for (const item of items || []) {
    const size = Number(item?.ready?.size ?? item?.size ?? 0);
    if (
      current.length > 0 &&
      (current.length >= maxFiles || currentBytes + size > maxBytes)
    ) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(item);
    currentBytes += size;
  }
  if (current.length) batches.push(current);
  return batches;
}

