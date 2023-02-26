import multer from "multer";
import multerS3 from "multer-s3"; // ( Refatorar para usar qq repositório )
import { s3, s3_bucket } from "../config/aws_S3.js"; // ( Refatorar para usar qq repositório )

// Gerando um nome de arquivo exclusivo
const generateUniqueFileName = (file) => {
  return (
    (Date.now() + Math.random()).toString().replace(".", "") +
    "---" +
    file.originalname
  );
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      if (file) {
        cb(null, "backend/messageFiles");
      }
    },
    filename: (req, file, cb) => {
      if (file) {
        cb(null, generateUniqueFileName(file));
      }
    },
  }),
});

const uploadToS3 = multer({ // ( Refatorar para usar qq repositório )
  storage: multerS3({ // ( Refatorar para usar qq repositório )
    s3: s3, // ( Refatorar para usar qq repositório )
    acl: "public-read",
    bucket: s3_bucket, // ( Refatorar para usar qq repositório )
    key: function (req, file, cb) {
      if (file) {
        cb(null, generateUniqueFileName(file));
      }
    },
  }),
});

export { upload, uploadToS3 }; // ( Refatorar para usar qq repositório )
