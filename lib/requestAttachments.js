import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const REQUEST_ATTACHMENT_BUCKET = "salary-request-attachments";
export const MAX_REQUEST_IMAGES = 5;
export const MAX_REQUEST_IMAGE_BYTES = 5 * 1024 * 1024;

const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/heic", "heic"],
  ["image/heif", "heif"],
]);

async function ensureBucket() {
  const { data } = await supabaseAdmin.storage.getBucket(
    REQUEST_ATTACHMENT_BUCKET
  );
  if (data) return;

  const { error } = await supabaseAdmin.storage.createBucket(
    REQUEST_ATTACHMENT_BUCKET,
    {
      public: false,
      fileSizeLimit: MAX_REQUEST_IMAGE_BYTES,
      allowedMimeTypes: [...IMAGE_TYPES.keys()],
    }
  );

  if (error && !/already exists|duplicate/i.test(error.message || "")) {
    throw new Error("建立申請附件空間失敗");
  }
}

export function validateRequestImages(files) {
  if (files.length > MAX_REQUEST_IMAGES) {
    throw new Error(`最多只能上傳 ${MAX_REQUEST_IMAGES} 張圖片`);
  }

  for (const file of files) {
    if (!IMAGE_TYPES.has(file.type)) {
      throw new Error("僅支援 JPG、PNG、WebP、GIF、HEIC 圖片");
    }
    if (file.size > MAX_REQUEST_IMAGE_BYTES) {
      throw new Error("每張圖片不得超過 5 MB");
    }
  }
}

export async function uploadRequestImages({ organization, discordId, files }) {
  validateRequestImages(files);
  if (!files.length) return [];

  await ensureBucket();
  const uploaded = [];

  try {
    for (const file of files) {
      const extension = IMAGE_TYPES.get(file.type);
      const path = `${organization}/${discordId}/${randomUUID()}.${extension}`;
      const { error } = await supabaseAdmin.storage
        .from(REQUEST_ATTACHMENT_BUCKET)
        .upload(path, Buffer.from(await file.arrayBuffer()), {
          contentType: file.type,
          upsert: false,
        });
      if (error) throw error;
      uploaded.push({
        path,
        name: String(file.name || `申請圖片.${extension}`).slice(0, 160),
        type: file.type,
        size: file.size,
      });
    }
    return uploaded;
  } catch (error) {
    await removeRequestImages(uploaded.map((item) => item.path));
    console.error("upload request images failed", error);
    throw new Error("圖片上傳失敗，請稍後重試");
  }
}

export async function removeRequestImages(paths) {
  if (!paths.length) return;
  const { error } = await supabaseAdmin.storage
    .from(REQUEST_ATTACHMENT_BUCKET)
    .remove(paths);
  if (error) console.error("remove request images failed", error);
}

export async function signRequestAttachments(requests) {
  return Promise.all(
    requests.map(async (request) => {
      const formData = request.form_data || {};
      const attachments = Array.isArray(formData.attachments)
        ? formData.attachments
        : [];
      const signedAttachments = await Promise.all(
        attachments.map(async (attachment) => {
          if (!attachment?.path) return null;
          const { data, error } = await supabaseAdmin.storage
            .from(REQUEST_ATTACHMENT_BUCKET)
            .createSignedUrl(attachment.path, 60 * 60);
          if (error) {
            console.error("sign request attachment failed", error);
            return null;
          }
          return { ...attachment, url: data.signedUrl };
        })
      );

      return {
        ...request,
        form_data: {
          ...formData,
          attachments: signedAttachments.filter(Boolean),
        },
      };
    })
  );
}
