import AWS from "aws-sdk"; // ( Refatorar para usar qq repositório )
import { config } from "dotenv";
config();

AWS.config.update({ // ( Refatorar para usar qq repositório )
  accessKeyId: process.env.S3_ACCESS_KEY_ID, // ( Refatorar para usar qq repositório )
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY, // ( Refatorar para usar qq repositório )
  region: process.env.S3_REGION, // ( Refatorar para usar qq repositório )
});
const s3 = new AWS.S3(); // ( Refatorar para usar qq repositório )
const s3_bucket = process.env.S3_BUCKET; // ( Refatorar para usar qq repositório )

export { s3, s3_bucket }; // ( Refatorar para usar qq repositório )
