const endpoint = (process.env.SEAWEEDFS_ENDPOINT ?? "http://127.0.0.1:8333").replace(/\/$/, "");
export const bucket = process.env.SEAWEEDFS_BUCKET ?? "discord-attachments";
let bucketReady: Promise<void> | undefined;

async function ensureBucket(): Promise<void> {
  bucketReady ??= (async () => {
    const response = await fetch(`${endpoint}/${bucket}`, { method: "PUT" });
    if (!response.ok && response.status !== 409) {
      throw new Error(`SeaweedFS bucket creation failed: ${response.status} ${await response.text()}`);
    }
  })().catch((error: unknown) => {
    bucketReady = undefined;
    throw error;
  });
  await bucketReady;
}

export async function upload(key: string, bytes: ArrayBuffer, contentType: string): Promise<void> {
  await ensureBucket();
  const response = await fetch(`${endpoint}/${bucket}/${key}`, {
    method: "PUT",
    headers: { "content-type": contentType },
    body: bytes,
  });
  if (!response.ok) throw new Error(`SeaweedFS upload failed: ${response.status} ${await response.text()}`);
}

export async function download(key: string): Promise<ArrayBuffer> {
  const response = await fetch(`${endpoint}/${bucket}/${key}`);
  if (!response.ok) throw new Error(`SeaweedFS download failed: ${response.status} ${await response.text()}`);
  return response.arrayBuffer();
}
