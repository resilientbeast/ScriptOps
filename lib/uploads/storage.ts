import "server-only";

import { Storage } from "@google-cloud/storage";

import { MAX_SOURCE_FILE_BYTES, type UploadReservation } from "@/lib/uploads/contracts";

export type VerifiedSourceObject = {
  objectKey: string;
  generation: string;
  size: number;
  contentType: string;
};

export interface SourceStorage {
  createWriteUrl(reservation: UploadReservation): Promise<string>;
  verifyUploadedObject(reservation: UploadReservation): Promise<VerifiedSourceObject>;
  readVerifiedObject(objectKey: string, generation: string): Promise<Uint8Array>;
}

export class UploadVerificationError extends Error {
  constructor(readonly code: "OBJECT_MISSING" | "OBJECT_SIZE_INVALID" | "OBJECT_TYPE_INVALID") { super(code); }
}

export class ProjectSourceStorage implements SourceStorage {
  constructor(private readonly storage: Storage, private readonly bucketName: string) {}

  async createWriteUrl(reservation: UploadReservation): Promise<string> {
    const [url] = await this.storage.bucket(this.bucketName).file(reservation.objectKey).getSignedUrl({
      version: "v4", action: "write", expires: new Date(reservation.expiresAt), contentType: reservation.contentType,
    });
    return url;
  }

  async verifyUploadedObject(reservation: UploadReservation): Promise<VerifiedSourceObject> {
    const file = this.storage.bucket(this.bucketName).file(reservation.objectKey);
    const [exists] = await file.exists();
    if (!exists) throw new UploadVerificationError("OBJECT_MISSING");
    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size);
    if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_SOURCE_FILE_BYTES || size !== reservation.declaredBytes) throw new UploadVerificationError("OBJECT_SIZE_INVALID");
    if (metadata.contentType !== reservation.contentType || !metadata.generation) throw new UploadVerificationError("OBJECT_TYPE_INVALID");
    return { objectKey: reservation.objectKey, generation: String(metadata.generation), size, contentType: metadata.contentType };
  }

  async readVerifiedObject(objectKey: string, generation: string): Promise<Uint8Array> {
    const [bytes] = await this.storage.bucket(this.bucketName).file(objectKey, { generation }).download();
    return new Uint8Array(bytes);
  }
}
