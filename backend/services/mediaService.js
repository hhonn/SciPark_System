import crypto from "crypto";
import { S3Client, HeadObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { HttpError } from "../utils/httpError.js";

// User media (vehicle photos) in Amazon S3.
//
// Files never pass through the app servers and never touch their disks:
//  1. the API hands the browser a short-lived presigned POST, scoped to one key,
//     one content type and at most MAX_PHOTO_BYTES;
//  2. the browser uploads straight to S3;
//  3. the API checks the object really exists and records its key.
// Reads go out as presigned GET URLs that expire in minutes, so the bucket
// stays fully private.
//
// That is what keeps the compute tier stateless: an instance can be replaced
// at any moment without losing a single file. Disabled (503) when MEDIA_BUCKET
// is not set, e.g. local development without AWS.

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const UPLOAD_TTL_SECONDS = 300;
const VIEW_TTL_SECONDS = 900;

let client = null;
// Tests swap in a fake client.
export const setS3Client = (fake) => { client = fake; };
const s3 = () => (client ||= new S3Client({ region: process.env.AWS_REGION }));

const bucket = () => process.env.MEDIA_BUCKET;
export const mediaEnabled = () => Boolean(bucket());

// Origins the browser talks to for media, for the Content-Security-Policy.
export const mediaOrigins = () => {
  if (!mediaEnabled()) return [];
  const region = process.env.AWS_REGION || "ap-southeast-2";
  return [`https://${bucket()}.s3.${region}.amazonaws.com`, `https://${bucket()}.s3.amazonaws.com`];
};

const requireMedia = () => {
  if (!mediaEnabled()) throw new HttpError(503, "ระบบเก็บรูปภาพยังไม่เปิดใช้งาน", "media_disabled");
};

// Every photo of one vehicle lives under this prefix.
export const vehiclePhotoPrefix = (userId, vehicleId) => `vehicles/${userId}/${vehicleId}/`;

// A presigned POST the browser can use exactly once, for one image.
export const createPhotoUpload = async ({ userId, vehicleId, contentType }) => {
  requireMedia();
  const ext = PHOTO_TYPES[contentType];
  if (!ext) throw new HttpError(400, "รองรับเฉพาะรูป JPEG, PNG หรือ WebP", "bad_type");

  const key = `${vehiclePhotoPrefix(userId, vehicleId)}${crypto.randomUUID()}.${ext}`;
  const { url, fields } = await createPresignedPost(s3(), {
    Bucket: bucket(),
    Key: key,
    Fields: { "Content-Type": contentType },
    Conditions: [
      ["content-length-range", 1, MAX_PHOTO_BYTES],
      ["eq", "$Content-Type", contentType],
    ],
    Expires: UPLOAD_TTL_SECONDS,
  });
  return { url, fields, key, maxBytes: MAX_PHOTO_BYTES };
};

// Confirm an upload: the key must belong to this user's vehicle, and S3 must
// really hold an image of an allowed size there.
export const verifyPhotoUpload = async ({ userId, vehicleId, key }) => {
  requireMedia();
  if (typeof key !== "string" || !key.startsWith(vehiclePhotoPrefix(userId, vehicleId)) || key.includes("..")) {
    throw new HttpError(400, "ไฟล์นี้ไม่ใช่ของยานพาหนะคันนี้", "bad_key");
  }

  let head;
  try {
    head = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
  } catch (error) {
    if (error?.name === "NotFound" || error?.$metadata?.httpStatusCode === 404) {
      throw new HttpError(400, "ไม่พบไฟล์ที่อัปโหลด กรุณาอัปโหลดใหม่", "upload_missing");
    }
    throw error;
  }

  if (!PHOTO_TYPES[head.ContentType] || !(head.ContentLength > 0) || head.ContentLength > MAX_PHOTO_BYTES) {
    await deleteMedia(key);
    throw new HttpError(400, "ไฟล์ไม่ถูกต้อง (ต้องเป็นรูปภาพไม่เกิน 5 MB)", "bad_file");
  }
  return { size: head.ContentLength, contentType: head.ContentType };
};

// A link to view a private photo, valid for a few minutes.
export const photoUrl = async (key) => {
  if (!key || !mediaEnabled()) return null;
  try {
    return await getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn: VIEW_TTL_SECONDS });
  } catch {
    return null;
  }
};

// Best effort: a leftover file must never fail the request that removes it.
export const deleteMedia = async (key) => {
  if (!key || !mediaEnabled()) return;
  try {
    await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  } catch (error) {
    console.error("S3 delete failed:", error.message);
  }
};

export default {
  MAX_PHOTO_BYTES,
  PHOTO_TYPES,
  setS3Client,
  mediaEnabled,
  mediaOrigins,
  vehiclePhotoPrefix,
  createPhotoUpload,
  verifyPhotoUpload,
  photoUrl,
  deleteMedia,
};
