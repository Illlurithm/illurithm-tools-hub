import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({ url: z.string().url() });

function normalize(raw: string): string {
  const url = new URL(raw);
  const host = url.hostname.replace(/^www\./, "");

  // Dropbox share links -> direct download
  if (host === "dropbox.com" || host.endsWith(".dropbox.com")) {
    url.searchParams.set("dl", "1");
    return url.toString();
  }

  // Google Drive share links -> direct download
  if (host === "drive.google.com" || host === "docs.google.com") {
    const byPath = url.pathname.match(/\/d\/([^/]+)/);
    const id = byPath?.[1] ?? url.searchParams.get("id");
    if (id) return `https://drive.usercontent.google.com/download?id=${id}&export=download`;
  }

  return raw;
}

/** Fetches a publicly shared Dropbox / Google Drive / direct file link server-side (avoids CORS). */
export const importRemoteFile = createServerFn({ method: "POST" })
  .inputValidator((data) => schema.parse(data))
  .handler(async ({ data }) => {
    const target = normalize(data.url);
    const res = await fetch(target, { redirect: "follow" });
    if (!res.ok) {
      throw new Error(
        `Could not download that link (${res.status}). Make sure it is shared publicly.`,
      );
    }
    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    if (contentType.includes("text/html")) {
      throw new Error(
        "That link returned a web page instead of a file. Use a direct/public share link.",
      );
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > 25 * 1024 * 1024) throw new Error("File is larger than 25 MB.");

    let binary = "";
    for (let i = 0; i < buf.length; i += 8192) {
      binary += String.fromCharCode(...buf.subarray(i, i + 8192));
    }

    const disposition = res.headers.get("content-disposition") ?? "";
    const fromHeader = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1];
    const fromPath = decodeURIComponent(new URL(target).pathname.split("/").pop() ?? "");
    const name = fromHeader || fromPath || "imported-file";

    return { name, contentType, base64: btoa(binary) };
  });
