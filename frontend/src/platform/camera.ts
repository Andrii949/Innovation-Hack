import { Capacitor, registerPlugin } from "@capacitor/core";

export type CapturedPhoto = {
  blob: Blob;
  filename: string;
  mimeType: string;
};

type CameraPluginShape = {
  getPhoto: (options: {
    quality: number;
    resultType: "base64";
    source: "CAMERA";
  }) => Promise<{ base64String?: string; format?: string }>;
};

const CameraPlugin = registerPlugin<CameraPluginShape>("Camera");

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

function captureViaFileInput(): Promise<CapturedPhoto | null> {
  if (typeof document === "undefined") {
    return Promise.resolve(null);
  }

  return new Promise<CapturedPhoto | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png";
    input.capture = "environment";

    let settled = false;
    const finish = (photo: CapturedPhoto | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      input.remove();
      resolve(photo);
    };

    input.addEventListener("change", () => {
      const file = input.files?.item(0) ?? null;
      if (file === null) {
        finish(null);
        return;
      }
      finish({
        blob: file,
        filename: file.name || "photo.jpg",
        mimeType: file.type || "image/jpeg",
      });
    });

    input.addEventListener("cancel", () => finish(null));
    input.click();
  });
}

export async function capturePhoto(): Promise<CapturedPhoto | null> {
  if (Capacitor.isPluginAvailable("Camera")) {
    try {
      const photo = await CameraPlugin.getPhoto({
        quality: 85,
        resultType: "base64",
        source: "CAMERA",
      });
      if (photo.base64String === undefined || photo.base64String === "") {
        return null;
      }
      const ext = photo.format === "png" ? "png" : "jpeg";
      const mimeType = `image/${ext}`;
      return {
        blob: base64ToBlob(photo.base64String, mimeType),
        filename: `photo.${ext === "png" ? "png" : "jpg"}`,
        mimeType,
      };
    } catch {
      return null;
    }
  }

  return captureViaFileInput();
}
