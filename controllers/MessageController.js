import asyncHandler from "express-async-handler";
import MessageModel from "../models/MessageModel.js";
import ChatModel from "../models/ChatModel.js";
import { deleteFile, deleteExistingAttachment } from "../utils/deleteFile.js";
import cloudinary from "../config/cloudinary.js"; // ( Refatorar para usar qq repositório )
import { s3, s3_bucket } from "../config/aws_S3.js"; // ( Refatorar para usar qq repositório )

const fetchMessages = asyncHandler(async (req, res) => {
  const { chatId } = req.params;

  if (!chatId) {
    res.status(400);
    throw new Error("ChatId inválido para pesquisar mensagens!");
  }
  const messages = await MessageModel.find({ chat: chatId })
    .populate({
      path: "sender",
      model: "User",
      select: "-password -notifications",
    })
    .sort({ createdAt: "desc" });
  // Do mais recente para o mais antigo aqui, mas do mais antigo para o mais recente no frontend
  // como é 'd-flex flex-column-reverse' para lista de msg
  res.status(200).json(messages);
});

const sendMessage = asyncHandler(async (req, res) => {
  const attachment = req.file;
  const { mediaDuration, content, chatId } = req.body;
  const loggedInUser = req.user?._id;

  if ((!content && !attachment) || !chatId) {
    res.status(400);
    throw new Error("Parâmetros de solicitação inválidos para enviar uma mensagem!");
  }

  let attachmentData;
  if (!attachment) {
    attachmentData = {
      fileUrl: null,
      file_id: null,
      file_name: null,
    };
  } else if (
    /(\.png|\.jpg|\.jpeg|\.gif|\.svg|\.webp)$/.test(attachment.originalname)
  ) {
    const uploadResponse = await cloudinary.uploader.upload(attachment.path); // ( Refatorar para usar qq repositório )
    attachmentData = {
      fileUrl: uploadResponse.secure_url,
      file_id: uploadResponse.public_id,
      file_name: attachment.originalname,
    };
    deleteFile(attachment.path);
  } else {
    // Para qualquer outro tipo de arquivo, ele será carregado por meio do middleware uploadToS3 ( Refatorar para usar qq repositório )
    attachmentData = {
      fileUrl: attachment.location || "",
      file_id: attachment.key || "",
      file_name:
        attachment.originalname +
        "===" +
        (mediaDuration !== "undefined"
          ? `${mediaDuration}+++${attachment.size}`
          : attachment.size),
    };
  }

  const createdMessage = await MessageModel.create({
    sender: loggedInUser,
    ...attachmentData,
    content: content || "",
    chat: chatId,
  });

  if (!createdMessage) {
    res.status(404);
    throw new Error("Mensagem não encontrada!");
  }
  // Atualiza a última mensagem do chat atual com a mensagem recém criada
  const updateChatPromise = ChatModel.findByIdAndUpdate(chatId, {
    lastMessage: createdMessage._id,
  });

  const populatedMsgPromise = MessageModel.findById(createdMessage._id)
    .populate({
      path: "sender",
      model: "User",
      select: "-password -notifications",
    })
    .populate({
      path: "chat",
      model: "Chat",
      select: "-groupAdmins -avatar_id", // ( Refatorar para usar qq repositório )
    });
  // Execução paralela de promessas independentes
  const [updatedChat, populatedMessage] = await Promise.all([
    updateChatPromise,
    populatedMsgPromise,
  ]);

  if (!updatedChat) {
    res.status(404);
    throw new Error("Bate-papo não encontrado ao atualizar lastMessage!");
  }
  res.status(201).json(populatedMessage);
});

const updateMessage = asyncHandler(async (req, res) => {
  const updatedAttachment = req.file;
  const { msgFileRemoved, mediaDuration, updatedContent, messageId } = req.body;
  const fileRemoved = msgFileRemoved === "true";

  if (!messageId) {
    res.status(404);
    throw new Error("ID da mensagem inválida!");
  }
  const existingMessage = await MessageModel.findById(messageId);

  if (!existingMessage) {
    res.status(404);
    throw new Error("Mensagem não encontrada!");
  }

  const { file_id, fileUrl, file_name } = existingMessage;
  let attachmentData = { fileUrl, file_id, file_name };

  if (!(updatedAttachment || (file_id && !fileRemoved)) && !updatedContent) {
    res.status(400);
    throw new Error(
      "Uma mensagem deve conter um arquivo ou algum conteúdo de texto ou emoji!"
    );
  }

  if (!updatedAttachment) {
    // O anexo já existe, mas foi excluído pelo usuário durante a atualização
    if (file_id && fileRemoved) {
      deleteExistingAttachment(fileUrl, file_id);
      attachmentData = {
        fileUrl: null,
        file_id: null,
        file_name: null,
      };
    }
  } else if (
    /(\.png|\.jpg|\.jpeg|\.gif|\.svg|\.webp)$/.test(
      updatedAttachment.originalname
    )
  ) {
    // O anexo atualizado é do tipo: imagem/gif
    if (file_id) deleteExistingAttachment(fileUrl, file_id);

    // Carrega o anexo atualizado para o Cloudinary e exclui do servidor
    const uploadResponse = await cloudinary.uploader.upload( // ( Refatorar para usar qq repositório )
      updatedAttachment.path
    );
    attachmentData = {
      fileUrl: uploadResponse.secure_url,
      file_id: uploadResponse.public_id,
      file_name: updatedAttachment.originalname,
    };
    deleteFile(updatedAttachment.path);
  } else {
    // Para qualquer outro tipo de arquivo, ele será carregado por meio do middleware uploadToS3 ( Refatorar para usar qq repositório )
    attachmentData = {
      fileUrl: updatedAttachment.location || "",
      file_id: updatedAttachment.key || "",
      file_name:
        updatedAttachment.originalname +
        "===" +
        (mediaDuration !== "undefined"
          ? `${mediaDuration}+++${updatedAttachment.size}`
          : updatedAttachment.size),
    };
    if (file_id) deleteExistingAttachment(fileUrl, file_id);
  }

  const updatedMessage = await MessageModel.findByIdAndUpdate(
    messageId,
    { ...attachmentData, content: updatedContent || "" },
    { new: true }
  )
    .populate({
      path: "sender",
      model: "User",
      select: "name email profilePic",
    })
    .populate({
      path: "chat",
      model: "Chat",
      select: "-groupAdmins -avatar_id", // ( Refatorar para usar qq repositório )
    });

  if (!updatedMessage) {
    res.status(404);
    throw new Error("Mensagem atualizada não encontrada!");
  }
  res.status(200).json(updatedMessage);
});

const deleteMessages = asyncHandler(async (req, res) => {
  let { messageIds, isDeleteGroupRequest } = req.body;
  messageIds = JSON.parse(messageIds);

  if (!messageIds?.length) {
    res.status(400);
    throw new Error("MessageIds inválidos para excluir mensagem(s)!");
  }
  const resolvedMessage = "Mensagem excluída com sucesso!";

  // Excluindo cada anexo de mensagem, mensagem em paralelo
  await Promise.all(
    messageIds.map(async (msgId) => {
      const existingMessage = await MessageModel.findById(msgId);

      if (!existingMessage) {
        res.status(404);
        throw new Error("Mensagem a ser apagada não encontrada!");
      }
      const { file_id, fileUrl } = existingMessage;

      if (file_id) deleteExistingAttachment(fileUrl, file_id);

      const deletedMessage = await MessageModel.findByIdAndDelete(msgId)
        .populate({
          path: "sender",
          model: "User",
          select: "name email",
        })
        .populate({
          path: "chat",
          model: "Chat",
        });

      // Se a mensagem excluída for a última mensagem do bate-papo atual, faça o seguinte:
      if (
        !isDeleteGroupRequest &&
        JSON.stringify(msgId) ===
          JSON.stringify(deletedMessage.chat.lastMessage)
      ) {
        // Recupera a mensagem anterior
        const latestMessages = await MessageModel.find({
          chat: deletedMessage.chat._id,
        }).sort({ createdAt: "desc" }); // (da mais recente para a mais antiga)

        // Se não houver mensagem anterior, não atualize lastMessage
        if (latestMessages.length === 0) return resolvedMessage;

        // Uma vez que lastMessage foi excluído, PreviousMessage será o último
        const previousMessage = latestMessages[0];

        // Atualiza a última mensagem do bate-papo atual com a mensagem anterior
        const updatedChat = await ChatModel.findByIdAndUpdate(
          deletedMessage.chat._id,
          { lastMessage: previousMessage._id },
          { new: true }
        );

        if (!updatedChat) {
          res.status(404);
          throw new Error("Bate-papo não encontrado ao atualizar lastMessage!");
        }
      }
      return resolvedMessage;
    })
  );
  res.status(200).json({ status: "Mensagem(ns) excluída(s) com sucesso!" });
});

const accessAttachment = asyncHandler(async (req, res) => {
  const { filename } = req.params;
  const params = { Bucket: s3_bucket, Key: filename }; // ( Refatorar para usar qq repositório )
  const fileObj = await s3.getObject(params).promise(); // ( Refatorar para usar qq repositório )
  res.status(200).send(fileObj.Body);
});

export {
  fetchMessages,
  sendMessage,
  updateMessage,
  deleteMessages,
  accessAttachment,
};
