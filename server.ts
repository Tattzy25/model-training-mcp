// server.ts
console.log("Starting model training MCP App server...");

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  registerAppTool,
  registerAppResource,
  RESOURCE_MIME_TYPE
} from "@modelcontextprotocol/ext-apps/server";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand
} from "@aws-sdk/client-s3";
import cors from "cors";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";

const s3 = new S3Client({
  region: "auto",
  credentials: {
    accessKeyId: process.env.TIGRIS_ACCESS_KEY!,
    secretAccessKey: process.env.TIGRIS_SECRET_KEY!
  },
  endpoint: process.env.TIGRIS_ENDPOINT || "https://s3.us-west-2.tigrisdev.io"
});

const TIGRIS_BUCKET = process.env.TIGRIS_BUCKET || "zips";
const ARCHIVE_PREFIX = "archive/";

// Standard MCP server instance
const server = new McpServer({
  name: "model training MCP",
  version: "1.0.0"
});

// ui:// resource that hosts will render in a sandboxed iframe
const resourceUri = "ui://model-training-mcp/mcp-app.html";

// ---------- Tool 1: Upload Zip ----------
registerAppTool(
  server,
  "upload_zip",
  {
    title: "Upload Zip Folder",
    description: "Upload a zip folder to Tigris storage",
    inputSchema: {
      type: "object",
      properties: {
        filename: { type: "string", description: "Name of the zip file" },
        size: { type: "number", description: "File size in bytes" },
        data: { type: "string", description: "Base64-encoded file data" }
      },
      required: ["filename", "size", "data"]
    },
    _meta: { ui: { resourceUri } }
  },
  async (args: any) => {
    try {
      const { filename, size, data } = args;
      const buffer = Buffer.from(data, "base64");

      await s3.send(
        new PutObjectCommand({
          Bucket: TIGRIS_BUCKET,
          Key: filename,
          Body: buffer,
          ContentType: "application/zip",
          Metadata: {
            "uploaded-at": new Date().toISOString(),
            "original-size": size.toString()
          }
        })
      );

      return {
        content: [
          {
            type: "text",
            text: `✓ Uploaded ${filename} (${(size / 1024 / 1024).toFixed(
              2
            )} MB) to s3://${TIGRIS_BUCKET}/${filename}`
          }
        ]
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error uploading: ${error.message}` }],
        isError: true
      };
    }
  }
);

// ---------- Tool 2: Download Zip ----------
registerAppTool(
  server,
  "download_zip",
  {
    title: "Download Zip Folder",
    description: "Download a zip folder from Tigris storage",
    inputSchema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "Path to the zip in Tigris (e.g., my-project.zip)"
        }
      },
      required: ["key"]
    },
    _meta: { ui: { resourceUri } }
  },
  async (args: any) => {
    try {
      const { key } = args;
      const response = await s3.send(
        new GetObjectCommand({
          Bucket: TIGRIS_BUCKET,
          Key: key
        })
      );

      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as any) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const base64 = buffer.toString("base64");

      // View decodes this and triggers a browser download
      return {
        content: [
          {
            type: "text",
            text: `base64:${base64}`
          }
        ]
      };
    } catch (error: any) {
      return {
        content: [
          { type: "text", text: `Error downloading ${args.key}: ${error.message}` }
        ],
        isError: true
      };
    }
  }
);

// ---------- Tool 3: Delete Zip ----------
registerAppTool(
  server,
  "delete_zip",
  {
    title: "Delete Zip Folder",
    description: "Delete a zip folder from Tigris storage",
    inputSchema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "Path to the zip folder to delete"
        }
      },
      required: ["key"]
    },
    _meta: { ui: { resourceUri } }
  },
  async (args: any) => {
    try {
      const { key } = args;
      await s3.send(
        new DeleteObjectCommand({
          Bucket: TIGRIS_BUCKET,
          Key: key
        })
      );

      return {
        content: [
          {
            type: "text",
            text: `✓ Deleted ${key} from s3://${TIGRIS_BUCKET}`
          }
        ]
      };
    } catch (error: any) {
      return {
        content: [
          { type: "text", text: `Error deleting ${args.key}: ${error.message}` }
        ],
        isError: true
      };
    }
  }
);

// ---------- Tool 4: Archive Zip ----------
registerAppTool(
  server,
  "archive_zip",
  {
    title: "Archive Zip Folder",
    description:
      "Move zip folder to archive storage in Tigris (copies to archive/ and deletes original)",
    inputSchema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "Path to the zip folder to archive"
        }
      },
      required: ["key"]
    },
    _meta: { ui: { resourceUri } }
  },
  async (args: any) => {
    try {
      const { key } = args;
      const archiveKey = `${ARCHIVE_PREFIX}${key}`;

      await s3.send(
        new CopyObjectCommand({
          Bucket: TIGRIS_BUCKET,
          CopySource: `${TIGRIS_BUCKET}/${key}`,
          Key: archiveKey
        })
      );

      await s3.send(
        new DeleteObjectCommand({
          Bucket: TIGRIS_BUCKET,
          Key: key
        })
      );

      return {
        content: [
          {
            type: "text",
            text: `✓ Archived ${key} → s3://${TIGRIS_BUCKET}/${archiveKey}`
          }
        ]
      };
    } catch (error: any) {
      return {
        content: [
          { type: "text", text: `Error archiving ${args.key}: ${error.message}` }
        ],
        isError: true
      };
    }
  }
);

// ---------- Register UI resource (MCP App View) ----------
registerAppResource(
  server,
  resourceUri,
  resourceUri,
  { mimeType: RESOURCE_MIME_TYPE },
  async () => {
    const html = await fs.readFile(
      path.join(import.meta.dirname, "dist", "mcp-app.html"),
      "utf-8"
    );

    return {
      contents: [
        {
          uri: resourceUri,
          mimeType: RESOURCE_MIME_TYPE,
          text: html
        }
      ]
    };
  }
);

// ---------- Expose MCP server over HTTP (Streamable HTTP) ----------
const expressApp = express();
expressApp.use(cors());
expressApp.use(express.json());

expressApp.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  res.on("close", () => {
    transport.close().catch(() => {});
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const port = parseInt(process.env.PORT ?? "3001", 10);

expressApp.listen(port, (err?: unknown) => {
  if (err) {
    console.error("Error starting server:", err);
    process.exit(1);
  }
  console.log(`Server listening on http://localhost:${port}/mcp`);
  console.log(`Bucket: ${TIGRIS_BUCKET}, archive prefix: ${ARCHIVE_PREFIX}`);
});