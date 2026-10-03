import type { Message } from "discord.js";
import { afterEach, expect, it, vi } from "vitest";

import { addPdfs, loadAttachments } from "@/pipeline/attachments.ts";

afterEach(() => vi.unstubAllGlobals());
it("supplies images and PDFs while refusing oversized and non-CDN files", async () => {
  const fetcher = vi.fn().mockImplementation(async () => new Response("file contents"));
  vi.stubGlobal("fetch", fetcher);
  const files = [
    { name: "image.png", contentType: "image/png", size: 13, url: "https://cdn.discordapp.com/image" },
    { name: "doc.pdf", contentType: "application/pdf", size: 13, url: "https://cdn.discordapp.com/pdf" },
    { name: "large.png", contentType: "image/png", size: 6 * 1024 * 1024, url: "https://cdn.discordapp.com/large" },
  ];
  const result = await loadAttachments({
    attachments: new Map(files.map((f, i) => [String(i), f])),
  } as unknown as Message);
  expect(result.images[0]).toEqual({
    type: "image",
    mimeType: "image/png",
    data: Buffer.from("file contents").toString("base64"),
  });
  const payload = { messages: [{ role: "user", content: "read this" }] };
  addPdfs(payload, result.pdfs);
  expect(payload).toMatchObject({
    plugins: [{ id: "file-parser", pdf: { engine: "mistral-ocr" } }],
    messages: [{ content: [{ type: "text" }, { type: "file" }] }],
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
  const blocked = await loadAttachments({
    attachments: new Map([["x", { ...files[0], url: "https://localhost/private" }]]),
  } as unknown as Message);
  expect(blocked.images).toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
