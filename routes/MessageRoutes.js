import { Router } from "express";
import authorizeUser from "../middleware/AuthMiddleware.js";
import { upload, uploadToS3 } from "../utils/multer.js";
import {
  fetchMessages,
  deleteMessages,
  updateMessage,
  sendMessage,
  accessAttachment,
} from "../controllers/MessageController.js";

const router = Router();

/*   Rota Base: /api/message   */
router.post("/", authorizeUser, upload.single("attachment"), sendMessage);
router.post(
  "/upload-to-s3", // ( Refatorar para usar qq repositório )
  authorizeUser,
  uploadToS3.single("attachment"),
  sendMessage
);
router.get("/:chatId", authorizeUser, fetchMessages);

router.put(
  "/update",
  authorizeUser,
  upload.single("attachment"),
  updateMessage
);
router.put(
  "/update-in-s3", // ( Refatorar para usar qq repositório )
  authorizeUser,
  uploadToS3.single("attachment"),
  updateMessage
);
router.put("/delete", authorizeUser, deleteMessages);
router.get("/files/:filename", authorizeUser, accessAttachment);

export default router;
