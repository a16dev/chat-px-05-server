import dotenv from "dotenv";
dotenv.config();

import asyncHandler from "express-async-handler";
import ChatModel from "../models/ChatModel.js";
import cloudinary from "../config/cloudinary.js"; // ( Refatorar para usar qq repositório )
import { deleteFile } from "../utils/deleteFile.js";

const createOrRetrieveChat = asyncHandler(async (req, res) => {
  const receiverUserId = req.body?.userId;
  const loggedInUserId = req.user?._id;

  if (!receiverUserId) {
    res.status(400);
    throw new Error("UserId não enviado no corpo da solicitação!");
  }

  // Primeiro verifique se existe um chat com os usuários acima
  const existingChats = await ChatModel.find({
    $and: [
      { isGroupChat: false },
      { users: { $elemMatch: { $eq: receiverUserId } } },
      { users: { $elemMatch: { $eq: loggedInUserId } } },
    ],
  })
    .populate("users", "-password -notifications")
    .populate({
      path: "lastMessage",
      model: "Message",
      populate: {
        path: "sender",
        model: "User",
        select: "name email profilePic",
      },
    });

  if (existingChats.length > 0) {
    res.status(200).json(existingChats[0]);
  } else {
    // Se não existir, crie um novo chat
    const createdChat = await ChatModel.create({
      chatName: "reciever",
      isGroupChat: false,
      users: [receiverUserId, loggedInUserId],
    });

    const populatedChat = await ChatModel.findById(createdChat._id).populate({
      path: "users",
      model: "User",
      select: "-password -notifications",
    });
    res.status(201).json(populatedChat);
  }
});

const fetchChats = asyncHandler(async (req, res) => {
  const loggedInUserId = req.user?._id;

  // Buscar todos os chats para o usuário conectado no momento
  const chats = await ChatModel.find({
    users: { $elemMatch: { $eq: loggedInUserId } },
  })
    .populate("users", "-password -notifications")
    .populate("groupAdmins", "-password -notifications")
    .populate({
      path: "lastMessage",
      model: "Message",
      // Preenchimento aninhado no Mongoose
      populate: {
        path: "sender",
        model: "User",
        select: "name email profilePic",
      },
    })
    .sort({ updatedAt: "desc" }); // (da mais recente para a mais antiga)

  res.status(200).json(chats);
});

const createGroupChat = asyncHandler(async (req, res) => {
  const displayPic = req.file;
  let { chatName, users } = req.body;
  const loggedInUserId = req.user?._id;

  if (!chatName || !users) {
    res.status(400);
    throw new Error("Por favor, preencha todos os campos!");
  }
  // Como a matriz de usuários foi 'stringificada' antes de enviá-la
  users = JSON.parse(users);

  if (users.length < 2) {
    res.status(400);
    throw new Error("Mínimo de 3 usuários necessários para criar um grupo!");
  }
  // O grupo também inclui o usuário conectado ( loginInUser )
  users = [loggedInUserId, ...users];

  let displayPicData;
  // Se a imagem de exibição não estiver selecionada, defina-a como padrão
  if (!displayPic) {
    displayPicData = {
      cloudinary_id: "", // ( Refatorar para usar qq repositório )
      chatDisplayPic: process.env.DEFAULT_GROUP_DP,
    };
  } else {
    const uploadResponse = await cloudinary.uploader.upload(displayPic.path); //( Refatorar para usar qq repositório )
    displayPicData = {
      cloudinary_id: uploadResponse.public_id, // ( Refatorar para usar qq repositório )
      chatDisplayPic: uploadResponse.secure_url,
    };
    deleteFile(displayPic.path);
  }

  const createdGroup = await ChatModel.create({
    chatName,
    users,
    isGroupChat: true,
    groupAdmins: [loggedInUserId],
    ...displayPicData,
  });

  const populatedGroup = await ChatModel.findById(createdGroup._id)
    .populate("users", "-password -notifications")
    .populate("groupAdmins", "-password -notifications");

  res.status(201).json(populatedGroup);
});

const deleteGroupDP = asyncHandler(async (req, res) => {
  const { currentDP, cloudinary_id, chatId } = req.body; // ( Refatorar para usar qq repositório )

  if (!currentDP || !chatId) {
    res.status(400);
    throw new Error("Parâmetros de solicitação inválidos para excluir a Foto grupo!");
  }

  // Excluir a Foto existente somente se não for a Foto padrão
  if (currentDP.endsWith(process.env.DEFAULT_GROUP_DP)) {
    res.status(400);
    throw new Error("Não é possível excluir a Foto do grupo!");
  }

  const deletePromise = cloudinary.uploader.destroy(cloudinary_id); // ( Refatorar para usar qq repositório )
  const updatePromise = ChatModel.findByIdAndUpdate(
    chatId,
    {
      cloudinary_id: "", // ( Refatorar para usar qq repositório )
      chatDisplayPic: process.env.DEFAULT_GROUP_DP,
    },
    { new: true }
  )
    .populate("users", "-password -notifications")
    .populate("groupAdmins", "-password -notifications");

  // Execução paralela de promessas independentes usando Promise.all()
  const [updatedGroup] = await Promise.all([updatePromise, deletePromise]);

  if (!updatedGroup) {
    res.status(404);
    throw new Error("Grupo não encontrado!");
  }
  res.status(200).json(updatedGroup);
});

const updateGroupDP = asyncHandler(async (req, res) => {
  const displayPic = req.file;
  const { currentDP, cloudinary_id, chatId } = req.body; // ( Refatorar para usar qq repositório )

  if (!displayPic || !currentDP || !chatId) {
    res.status(400);
    throw new Error("Parâmetros de solicitação inválidos para atualização da Foto do grupo!");
  }

  const uploadPromise = cloudinary.uploader.upload(displayPic.path); // ( Refatorar para usar qq repositório )
  // Exclua a Imagem de Exibição (Display Pic = DP) existente somente se não for o Imagem de Exibição (Display Pic = DP) padrão
  const destroyPromise = !currentDP.endsWith(process.env.DEFAULT_GROUP_DP)
    ? cloudinary.uploader.destroy(cloudinary_id) // ( Refatorar para usar qq repositório )
    : Promise.resolve();

  const [uploadResponse] = await Promise.all([uploadPromise, destroyPromise]);

  const deletePromise = deleteFile(displayPic.path);
  const updatePromise = ChatModel.findByIdAndUpdate(
    chatId,
    {
      cloudinary_id: uploadResponse.public_id, // ( Refatorar para usar qq repositório )
      chatDisplayPic: uploadResponse.secure_url,
    },
    { new: true }
  )
    .populate("users", "-password -notifications")
    .populate("groupAdmins", "-password -notifications");

  const [updatedGroup] = await Promise.all([updatePromise, deletePromise]);

  if (!updatedGroup) {
    res.status(404);
    throw new Error("Grupo não encontrado!");
  }

  res.status(200).json(updatedGroup);
});

const updateGroupName = asyncHandler(async (req, res) => {
  const { groupName, chatId } = req.body;

  if (!groupName || !chatId) {
    res.status(400);
    throw new Error("Parâmetros de solicitação inválidos para atualizar o nome do grupo!");
  }

  const updatedGroup = await ChatModel.findByIdAndUpdate(
    chatId,
    {
      chatName: groupName,
    },
    { new: true }
  )
    .populate("users", "-password -notifications")
    .populate("groupAdmins", "-password -notifications");

  if (!updatedGroup) {
    res.status(404);
    throw new Error("Grupo não encontrado!");
  }

  res.status(200).json(updatedGroup);
});

const removeUserFromGroup = asyncHandler(async (req, res) => {
  const { userToBeRemoved, isGroupAdmin, chatId } = req.body;

  if (!userToBeRemoved || !chatId) {
    res.status(400);
    throw new Error("Parâmetros de solicitação inválidos para remover usuário do grupo!");
  }
  const updateCriteria = isGroupAdmin
    ? {
        $pull: { users: userToBeRemoved, groupAdmins: userToBeRemoved },
      }
    : { $pull: { users: userToBeRemoved } };

  const updatedGroup = await ChatModel.findByIdAndUpdate(
    chatId,
    updateCriteria,
    { new: true }
  )
    .populate("users", "-password -notifications")
    .populate("groupAdmins", "-password -notifications");

  if (!updatedGroup) {
    res.status(404);
    throw new Error("Grupo não encontrado!");
  }

  res.status(200).json(updatedGroup);
});

const addUsersToGroup = asyncHandler(async (req, res) => {
  let { usersToBeAdded, chatId } = req.body;
  usersToBeAdded = JSON.parse(usersToBeAdded);

  if (!usersToBeAdded?.length || !chatId) {
    res.status(400);
    throw new Error("Parâmetros de solicitação inválidos para adicionar usuário(s) ao grupo!");
  }
  const updatedGroup = await ChatModel.findByIdAndUpdate(
    chatId,
    { $push: { users: { $each: usersToBeAdded } } },
    { new: true }
  )
    .populate("users", "-password -notifications")
    .populate("groupAdmins", "-password -notifications");

  if (!updatedGroup) {
    res.status(404);
    throw new Error("Grupo não encontrado!");
  }

  res.status(200).json(updatedGroup);
});

const deleteGroupChat = asyncHandler(async (req, res) => {
  const { currentDP, cloudinary_id, chatId } = req.body; // ( Refatorar para usar qq repositório )

  if (!currentDP || !chatId) {
    res.status(400);
    throw new Error("Parâmetros de solicitação inválidos para excluir grupo!");
  }

  const deleteDpPromise = !currentDP.endsWith(process.env.DEFAULT_GROUP_DP)
    ? cloudinary.uploader.destroy(cloudinary_id) // ( Refatorar para usar qq repositório )
    : Promise.resolve();
  const deleteGroupPromise = ChatModel.findByIdAndDelete(chatId);

  const [deletedGroup] = await Promise.all([
    deleteGroupPromise,
    deleteDpPromise,
  ]);

  if (!deletedGroup) {
    res.status(404);
    throw new Error("Grupo não encontrado!");
  }
  res.status(200).json({ status: "Grupo excluído com sucesso!" });
});

const makeGroupAdmin = asyncHandler(async (req, res) => {
  let { userId, chatId } = req.body;

  if (!userId || !chatId) {
    res.status(400);
    throw new Error("Parâmetros de solicitação inválidos para ser o administrador do grupo!");
  }

  const updatedGroup = await ChatModel.findByIdAndUpdate(
    chatId,
    { $push: { groupAdmins: userId } },
    { new: true }
  )
    .populate("users", "-password -notifications")
    .populate("groupAdmins", "-password -notifications");

  if (!updatedGroup) {
    res.status(404);
    throw new Error("Grupo não encontrado!");
  }
  res.status(200).json(updatedGroup);
});

const dismissAsAdmin = asyncHandler(async (req, res) => {
  let { userId, chatId } = req.body;

  if (!userId || !chatId) {
    res.status(400);
    throw new Error("Parâmetros de solicitação inválidos para dispensar o administrador do grupo!");
  }

  const updatedGroup = await ChatModel.findByIdAndUpdate(
    chatId,
    { $pull: { groupAdmins: userId } },
    { new: true }
  )
    .populate("users", "-password -notifications")
    .populate("groupAdmins", "-password -notifications");

  if (!updatedGroup) {
    res.status(404);
    throw new Error("Grupo não encontrado!");
  }
  res.status(200).json(updatedGroup);
});

export {
  createOrRetrieveChat,
  fetchChats,
  createGroupChat,
  deleteGroupDP,
  updateGroupDP,
  updateGroupName,
  removeUserFromGroup,
  addUsersToGroup,
  makeGroupAdmin,
  dismissAsAdmin,
  deleteGroupChat,
};
