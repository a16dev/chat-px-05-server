import asyncHandler from "express-async-handler";
import UserModel from "../models/UserModel.js";
import cloudinary from "../config/cloudinary.js"; // ( Refatorar para usar qq repositório )
import { deleteFile } from "../utils/deleteFile.js";
import generateToken from "../utils/generateToken.js";

const registerUser = asyncHandler(async (req, res) => {
  const profilePic = req.file;
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    res.status(400);
    throw new Error("Por favor, preencha todos os campos!");
  }

  const existingUser = await UserModel.findOne({ email });
  if (existingUser) {
    res.status(400);
    throw new Error("O usuário já existe!");
  }

  let profilePicDetails;
  // Salva apenas a foto de perfil selecionada no Cloudinary (não salva se não for selecionada pelo usuário)
  if (profilePic) {
    // Faz Upload para Cloudinary e, em seguida, excluir do servidor
    const uploadResponse = await cloudinary.uploader.upload(profilePic.path); // ( Refatorar para usar qq repositório )
    profilePicDetails = {
      avatar_id: uploadResponse.public_id, // ( Refatorar para usar qq repositório )
      profilePic: uploadResponse.secure_url,
    };
    deleteFile(profilePic.path);
  }

  // Usar esta condição como avatar_id e profilePic tem valores padrão, se não for especificado
  const newUserDetails = profilePicDetails
    ? {
        name,
        email,
        password,
        notifications: [],
        ...profilePicDetails,
      }
    : { name, email, password, notifications: [] };

  const createdUser = await UserModel.create(newUserDetails);

  if (!createdUser) {
    res.status(404);
    throw new Error("Usuário não encontrado!");
  }

  res.status(201).json({
    _id: createdUser._id,
    name: createdUser.name,
    email: createdUser.email,
    notifications: createdUser.notifications,
    avatar_id: createdUser.avatar_id, // ( Refatorar para usar qq repositório )
    profilePic: createdUser.profilePic,
    token: generateToken(createdUser._id),
    /* A sessão expira após 1 dia */
    expiryTime: Date.now() + 1 * 24 * 60 * 60 * 1000,
  });
});

const authenticateUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400);
    throw new Error("Parâmetros de solicitação inválidos para login do usuário!");
  }

  // Pesquisa um usuário com o e-mail informado
  const user = await UserModel.findOne({ email }).populate({
    path: "notifications",
    model: "Message",
    populate: [
      {
        path: "sender",
        model: "User",
        select: "name email profilePic",
      },
      {
        path: "chat",
        model: "Chat",
        select: "-groupAdmins -avatar_id", // ( Refatorar para usar qq repositório )
        populate: {
          path: "users",
          model: "User",
          select: "-password -notifications",
        },
      },
    ],
  });

  // Verifique se existe um usuário com e-mail inserido e se a senha digitada
  // corresponde à senha de usuário armazenada no database
  if (user && (await user.matchPasswords(password))) {
    res.status(200).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      notifications: user.notifications,
      avatar_id: user.avatar_id, // ( Refatorar para usar qq repositório )
      profilePic: user.profilePic,
      token: generateToken(user._id),
      /* A sessão expira após 1 dia */
      expiryTime: Date.now() + 1 * 24 * 60 * 60 * 1000,
    });
  } else {
    res.status(401);
    throw new Error("E-mail ou senha inválidos!");
  }
});

const fetchUsers = asyncHandler(async (req, res) => {
  const loggedInUser = req.user?._id;
  //    /api/user?search=abc
  const searchQuery = req.query?.search || "";
  const searchFilter = {
    $or: [
      { name: { $regex: searchQuery, $options: "i" } },
      { email: { $regex: searchQuery, $options: "i" } },
    ],
  };

  // Encontra todos os usuários excluindo o usuário logado - loginInUser, com base no searchFilter
  const users = await UserModel.find(searchFilter)
    .find({
      _id: { $ne: loggedInUser },
    })
    .select("-password -notifications");

  res.status(200).json(users);
});

const updateUserName = asyncHandler(async (req, res) => {
  const { newUserName } = req.body;
  const loggedInUser = req.user?._id;

  if (!newUserName) {
    res.status(400);
    throw new Error("Parâmetros de solicitação inválidos para atualizar nome de usuário!");
  }

  const updatedUser = await UserModel.findByIdAndUpdate(
    loggedInUser,
    { name: newUserName },
    { new: true }
  )
    .select("-password")
    .populate({
      path: "notifications",
      model: "Message",
      populate: [
        {
          path: "sender",
          model: "User",
          select: "name email profilePic",
        },
        {
          path: "chat",
          model: "Chat",
          select: "-groupAdmins -avatar_id", // ( Refatorar para usar qq repositório )
          populate: {
            path: "users",
            model: "User",
            select: "-password -notifications",
          },
        },
      ],
    });

  if (!updatedUser) {
    res.status(404);
    throw new Error("Usuário não encontrado!");
  }

  res.status(200).json(updatedUser);
});

const updateUserPassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const loggedInUser = req.user?._id;

  if (!currentPassword || !newPassword) {
    res.status(400);
    throw new Error("Parâmetros de solicitação inválidos para atualizar a senha do usuário!");
  }

  if (currentPassword === newPassword) {
    res.status(400);
    throw new Error("A nova senha deve ser diferente da senha atual!");
  }

  // Encontra o usuário logado por seu id
  const user = await UserModel.findById(loggedInUser);

  // Verifique se o usuário existe
  if (!user) {
    res.status(404);
    throw new Error("Usuário não encontrado!");
  }

  // Agora verifique se a 'senha atual' inserida corresponde à senha armazenada no database
  if (!(await user.matchPasswords(currentPassword))) {
    res.status(400);
    throw new Error("Senha Atual Inválida!");
  }

  await UserModel.updateOne(
    { _id: loggedInUser },
    {
      $set: { password: newPassword },
    }
  );

  res
    .status(200)
    .json({ status: "success", message: "Senha atualizada com sucesso" });
});

const updateUserProfilePic = asyncHandler(async (req, res) => {
  const newProfilePic = req.file;
  const { currentProfilePic, avatar_id } = req.body; // ( Refatorar para usar qq repositório )
  const loggedInUser = req.user?._id;

  if (!newProfilePic || !currentProfilePic) {
    res.status(400);
    throw new Error("Parâmetros de solicitação inválidos para atualizar a foto do perfil do usuário!");
  }
  // Exclui a foto de perfil existente somente se não for a padrão
  if (!currentProfilePic.endsWith(process.env.REACT_APP_DEFAULT_USER_DP)) {
    cloudinary.uploader.destroy(avatar_id); // ( Refatorar para usar qq repositório )
  }
  const uploadResponse = await cloudinary.uploader.upload(newProfilePic.path); // ( Refatorar para usar qq repositório )
  deleteFile(newProfilePic.path);

  const updatedUser = await UserModel.findByIdAndUpdate(
    loggedInUser,
    {
      avatar_id: uploadResponse.public_id, // ( Refatorar para usar qq repositório )
      profilePic: uploadResponse.secure_url,
    },
    { new: true }
  )
    .select("-password")
    .populate({
      path: "notifications",
      model: "Message",
      populate: [
        {
          path: "sender",
          model: "User",
          select: "name email profilePic",
        },
        {
          path: "chat",
          model: "Chat",
          select: "-groupAdmins -avatar_id", // ( Refatorar para usar qq repositório )
          populate: {
            path: "users",
            model: "User",
            select: "-password -notifications",
          },
        },
      ],
    });

  if (!updatedUser) {
    res.status(404);
    throw new Error("Usuário não encontrado!");
  }

  res.status(200).json(updatedUser);
});

const deleteUserProfilePic = asyncHandler(async (req, res) => {
  const { currentProfilePic, avatar_id } = req.body; // ( Refatorar para usar qq repositório )
  const loggedInUser = req.user?._id;

  if (!currentProfilePic) {
    res.status(400);
    throw new Error("Parâmetros de solicitação inválidos para excluir a foto do perfil do usuário!");
  }

  // Exclua a foto de perfil existente somente se não for a padrão
  if (currentProfilePic.endsWith(process.env.REACT_APP_DEFAULT_USER_DP)) {
    res.status(400);
    throw new Error("Não é possível excluir a foto do perfil de usuário padrão!");
  }

  const deletePromise = cloudinary.uploader.destroy(avatar_id); // ( Refatorar para usar qq repositório )
  const updatePromise = UserModel.findByIdAndUpdate(
    loggedInUser,
    {
      avatar_id: "", // ( Refatorar para usar qq repositório )
      profilePic: process.env.DEFAULT_USER_DP,
    },
    { new: true }
  )
    .select("-password")
    .populate({
      path: "notifications",
      model: "Message",
      populate: [
        {
          path: "sender",
          model: "User",
          select: "name email profilePic",
        },
        {
          path: "chat",
          model: "Chat",
          select: "-groupAdmins -avatar_id", // ( Refatorar para usar qq repositório )
          populate: {
            path: "users",
            model: "User",
            select: "-password -notifications",
          },
        },
      ],
    });
  // Execução paralela de promessas independentes usando Promise.all()
  const [, updatedUser] = await Promise.all([deletePromise, updatePromise]);

  if (!updatedUser) {
    res.status(404);
    throw new Error("Usuário não encontrado!");
  }
  res.status(200).json(updatedUser);
});

// Apenas um 'regular method' regular, NÃO um 'route handler'
const addNotification = async (notificationId, userId) => {
  let userData = { notifications: [] };
  try {
    if (!notificationId || !userId) {
      throw new Error("Parâmetros inválidos para adicionar notificação!");
    }
    userData = await UserModel.findByIdAndUpdate(
      userId,
      { $push: { notifications: notificationId } },
      { new: true }
    )
      .select("notifications")
      .populate({
        path: "notifications",
        model: "Message",
        populate: [
          {
            path: "sender",
            model: "User",
            select: "name email profilePic",
          },
          {
            path: "chat",
            model: "Chat",
            select: "-groupAdmins -avatar_id", // ( Refatorar para usar qq repositório )
            populate: {
              path: "users",
              model: "User",
              select: "-password -notifications",
            },
          },
        ],
      });

    if (!userData) {
      throw new Error("Usuário não encontrado ao adicionar notificação!");
    }
  } catch (error) {
    console.log(error.message);
  }
  return userData;
};

// Apenas um 'regular method' regular, NÃO um 'route handler'
const deleteNotifOnMsgDelete = async (notificationId, userId) => {
  try {
    if (!notificationId || !userId) {
      throw new Error("Parâmetros inválidos para excluir notificação!");
    }
    const userData = await UserModel.findByIdAndUpdate(
      userId,
      { $pull: { notifications: notificationId } },
      { new: true }
    );
    if (!userData) {
      throw new Error("Usuário não encontrado ao deletar notificação!");
    }
    return userData;
  } catch (error) {
    console.log(error.message);
  }
};

const deleteNotifications = asyncHandler(async (req, res) => {
  // Lógica de front-end:
  // if(chat selecionado && chat selecionado === newMsg.chat)
  // => exclui a notificação do array (se presente)
  let { notificationIds } = req.body;
  notificationIds = JSON.parse(notificationIds);
  const loggedInUser = req.user?._id;

  if (!notificationIds?.length) {
    res.status(400);
    throw new Error("Parâmetros inválidos para excluir notificação(ões)!");
  }
  const userData = await UserModel.findByIdAndUpdate(
    loggedInUser,
    { $pullAll: { notifications: notificationIds } },
    { new: true }
  )
    .select("notifications")
    .populate({
      path: "notifications",
      model: "Message",
      populate: [
        {
          path: "sender",
          model: "User",
          select: "name email profilePic",
        },
        {
          path: "chat",
          model: "Chat",
          select: "-groupAdmins -avatar_id", // ( Refatorar para usar qq repositório )
          populate: {
            path: "users",
            model: "User",
            select: "-password -notifications",
          },
        },
      ],
    });

  if (!userData) {
    res.status(404);
    throw new Error("Usuário não encontrado ao excluir a(s) notificação(ões)!");
  }
  res.status(200).json(userData);
});

export {
  registerUser,
  authenticateUser,
  fetchUsers,
  updateUserName,
  updateUserPassword,
  updateUserProfilePic,
  deleteUserProfilePic,
  addNotification,
  deleteNotifOnMsgDelete,
  deleteNotifications,
};
