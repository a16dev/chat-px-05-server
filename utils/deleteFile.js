import fs from "fs";
import { promisify } from "util";
import cloudinary from "../config/cloudinary.js"; // ( Refatorar para usar qq repositório )
import { s3, s3_bucket } from "../config/aws_S3.js"; // ( Refatorar para usar qq repositório )

// Método assíncrono para excluir um arquivo deste servidor
const deleteFile = promisify(fs.unlink);

// Exclui o arquivo existente de seu respectivo local
const deleteExistingAttachment = async (fileUrl, file_id) => {
  return fileUrl.startsWith("https://res.cloudinary.com") // ( Refatorar para usar qq repositório )
    ? cloudinary.uploader.destroy(file_id)
    : s3.deleteObject({ Bucket: s3_bucket, Key: file_id }).promise(); // ( Refatorar para usar qq repositório )
};

export { deleteFile, deleteExistingAttachment };
