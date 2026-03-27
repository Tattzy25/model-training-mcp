// src/mcp-app.ts
import { App } from "@modelcontextprotocol/ext-apps";

const uploadFileInput = document.getElementById("upload-file") as HTMLInputElement;
const uploadBtn = document.getElementById("upload-btn") as HTMLButtonElement;
const uploadStatus = document.getElementById("upload-status") as HTMLDivElement;

const downloadKeyInput = document.getElementById("download-key") as HTMLInputElement;
const downloadBtn = document.getElementById("download-btn") as HTMLButtonElement;
const downloadStatus = document.getElementById("download-status") as HTMLDivElement;

const deleteKeyInput = document.getElementById("delete-key") as HTMLInputElement;
const deleteBtn = document.getElementById("delete-btn") as HTMLButtonElement;
const deleteStatus = document.getElementById("delete-status") as HTMLDivElement;

const archiveKeyInput = document.getElementById("archive-key") as HTMLInputElement;
const archiveBtn = document.getElementById("archive-btn") as HTMLButtonElement;
const archiveStatus = document.getElementById("archive-status") as HTMLDivElement;

function setStatus(el: HTMLDivElement, message: string, kind: "ok" | "err" | "info") {
  el.textContent = message;
  el.style.color = kind === "ok" ? "green" : kind === "err" ? "red" : "inherit";
}

// Create App instance and connect to host (MCP Apps pattern)
const app = new App({ name: "model training MCP", version: "1.0.0" });

// Optional: handle initial tool result pushed by host
app.ontoolresult = (result: any) => {
  console.log("Initial tool result from host:", result);
};

// Connect once on load
app.connect();

// ---------- Upload ----------
uploadBtn.addEventListener("click", async () => {
  const file = uploadFileInput.files?.[0];
  if (!file) {
    setStatus(uploadStatus, "Please select a .zip file", "err");
    return;
  }

  setStatus(uploadStatus, "Reading file...", "info");

  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const arrayBuffer = reader.result as ArrayBuffer;
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      setStatus(uploadStatus, "Uploading...", "info");

      const result = await app.callServerTool({
        name: "upload_zip",
        arguments: {
          filename: file.name,
          size: file.size,
          data: base64
        }
      });

      const msg =
        (result.content?.find((c: any) => c.type === "text") as any)?.text ??
        "Upload finished (no message)";
      setStatus(uploadStatus, msg, "ok");
      uploadFileInput.value = "";
    } catch (err: any) {
      setStatus(uploadStatus, `Error: ${err?.message ?? String(err)}`, "err");
    }
  };

  reader.onerror = () => {
    setStatus(uploadStatus, "Failed to read file", "err");
  };

  reader.readAsArrayBuffer(file);
});

// ---------- Download ----------
downloadBtn.addEventListener("click", async () => {
  const key = downloadKeyInput.value.trim();
  if (!key) {
    setStatus(downloadStatus, "Enter a key/path to download", "err");
    return;
  }

  setStatus(downloadStatus, "Requesting download...", "info");

  try {
    const result = await app.callServerTool({
      name: "download_zip",
      arguments: { key }
    });

    const text =
      (result.content?.find((c: any) => c.type === "text") as any)?.text ?? "";
    if (!text.startsWith("base64:")) {
      setStatus(downloadStatus, "Unexpected response from server", "err");
      return;
    }

    const base64 = text.slice("base64:".length);
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const blob = new Blob([bytes], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = key.split("/").pop() || "download.zip";
    a.click();
    URL.revokeObjectURL(url);

    setStatus(downloadStatus, "✓ Download started", "ok");
  } catch (err: any) {
    setStatus(downloadStatus, `Error: ${err?.message ?? String(err)}`, "err");
  }
});

// ---------- Delete ----------
deleteBtn.addEventListener("click", async () => {
  const key = deleteKeyInput.value.trim();
  if (!key) {
    setStatus(deleteStatus, "Enter a key/path to delete", "err");
    return;
  }

  setStatus(deleteStatus, "Deleting...", "info");

  try {
    const result = await app.callServerTool({
      name: "delete_zip",
      arguments: { key }
    });

    const msg =
      (result.content?.find((c: any) => c.type === "text") as any)?.text ??
      "Delete finished (no message)";
    setStatus(deleteStatus, msg, "ok");
    deleteKeyInput.value = "";
  } catch (err: any) {
    setStatus(deleteStatus, `Error: ${err?.message ?? String(err)}`, "err");
  }
});

// ---------- Archive ----------
archiveBtn.addEventListener("click", async () => {
  const key = archiveKeyInput.value.trim();
  if (!key) {
    setStatus(archiveStatus, "Enter a key/path to archive", "err");
    return;
  }

  setStatus(archiveStatus, "Archiving...", "info");

  try {
    const result = await app.callServerTool({
      name: "archive_zip",
      arguments: { key }
    });

    const msg =
      (result.content?.find((c: any) => c.type === "text") as any)?.text ??
      "Archive finished (no message)";
    setStatus(archiveStatus, msg, "ok");
    archiveKeyInput.value = "";
  } catch (err: any) {
    setStatus(archiveStatus, `Error: ${err?.message ?? String(err)}`, "err");
  }
});