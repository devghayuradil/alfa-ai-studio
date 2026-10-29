import { AppError } from "@/lib/errors";
import { jsonError, jsonOk } from "@/lib/http";
import { clientKey, uploadLimiter } from "@/lib/rate-limit";
import { getImageStorage } from "@/lib/storage/image-storage";
import { IMAGE_CONSTRAINTS } from "@/lib/video/capabilities";

/** Multipart overhead allowance on top of the image size limit. */
const MAX_REQUEST_BYTES = IMAGE_CONSTRAINTS.maxBytes + 256 * 1024;

/** Upload a reference image (multipart field "file"). Returns an opaque image ID. */
export async function POST(request: Request) {
  try {
    uploadLimiter.enforce(clientKey(request), "uploads");
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > MAX_REQUEST_BYTES) {
      throw new AppError("PAYLOAD_TOO_LARGE", `Images must be ${IMAGE_CONSTRAINTS.maxBytes / 1024 / 1024} MB or smaller.`);
    }
    if (!(request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      throw new AppError("UNSUPPORTED_MEDIA_TYPE", "Expected a multipart/form-data upload.");
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new AppError("VALIDATION_ERROR", "Could not read the uploaded file.");
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new AppError("VALIDATION_ERROR", "No image file was provided.");
    }
    if (file.size > IMAGE_CONSTRAINTS.maxBytes) {
      throw new AppError("PAYLOAD_TOO_LARGE", `Images must be ${IMAGE_CONSTRAINTS.maxBytes / 1024 / 1024} MB or smaller.`);
    }

    const image = await getImageStorage().save(new Uint8Array(await file.arrayBuffer()));
    return jsonOk({ image }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
