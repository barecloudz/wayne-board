import { S3Client } from "@aws-sdk/client-s3";
import https from "https";
import { NodeHttpHandler } from "@smithy/node-http-handler";

// R2 requires TLS 1.2 explicitly · Node.js on some platforms negotiates incorrectly otherwise.
const agent = new https.Agent({ secureProtocol: "TLSv1_2_method" });

export const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  requestHandler: new NodeHttpHandler({ httpsAgent: agent }),
});

export const R2_BUCKET = process.env.R2_BUCKET_NAME!;
export const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL!;
