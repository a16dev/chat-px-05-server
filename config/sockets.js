import { Server } from "socket.io";
import {
  addNotification,
  deleteNotifOnMsgDelete,
} from "../controllers/UserController.js";

// Escutando os eventos de mensagens
const configureMsgEvents = (socket) => {
  socket.on("new_msg_sent", async (newMsg) => {
    const { chat } = newMsg;
    if (!chat) return;

    await Promise.all(
      chat.users.map(async (userId) => {
        // Envia 'newMsg' para todos os usuários, exceto o remetente 'newMsg'
        if (userId !== newMsg.sender._id) {
          const { notifications } = await addNotification(newMsg._id, userId);
          socket.to(userId).emit("new_msg_received", newMsg, notifications);
        }
      })
    );
  });

  socket.on("msg_deleted", async (deletedMsgData) => {
    const { deletedMsgId, senderId, chat } = deletedMsgData;
    if (!deletedMsgId || !senderId || !chat) return;

    // Envia um soquete para deletar, 'deletedMsg', para todos os usuários do chat, exceto para o remetente de 'deletedMsg'
    await Promise.all(
      chat.users.map(async (user) => {
        if (user._id !== senderId) {
          await deleteNotifOnMsgDelete(deletedMsgId, user._id);
          socket.to(user._id).emit("remove_deleted_msg", deletedMsgData);
        }
      })
    );
  });

  socket.on("msg_updated", (updatedMsg) => {
    const { sender, chat } = updatedMsg;
    if (!sender || !chat) return;

    chat.users.forEach((userId) => {
      if (userId !== sender._id) {
        socket.to(userId).emit("update_modified_msg", updatedMsg);
      }
    });
  });
};

// Ouvindo os eventos de grupo
const configureGroupEvents = (socket) => {
  socket.on("new_grp_created", (newGroupData) => {
    const { admin, newGroup } = newGroupData;
    if (!admin || !newGroup) return;

    newGroup.users.forEach((user) => {
      if (user._id !== admin._id) {
        socket.to(user._id).emit("display_new_grp");
      }
    });
  });

  socket.on("grp_updated", (updatedGroupData) => {
    // 'updater' é quem atualizou o grupo (admin/non-admin)
    const { updater, updatedGroup } = updatedGroupData;
    if (!updater || !updatedGroup) return;
    const { removedUser } = updatedGroup;

    updatedGroup.users.forEach((user) => {
      if (user._id !== updater._id) {
        socket.to(user._id).emit("display_updated_grp", updatedGroupData);
      }
    });
    if (removedUser) {
      socket.to(removedUser._id).emit("display_updated_grp", updatedGroupData);
    }
  });

  socket.on("grp_deleted", (deletedGroupData) => {
    // 'admin' é quem atualizou o grupo
    const { admin, deletedGroup } = deletedGroupData;
    if (!admin || !deletedGroup) return;

    deletedGroup.users.forEach((user) => {
      if (user._id !== admin._id) {
        socket.to(user._id).emit("remove_deleted_grp", deletedGroup);
      }
    });
  });
};

// Escutando os eventos 'Digitando'
const configureTypingEvents = (socket) => {
  socket.on("typing", (chat, typingUser) => {
    if (!chat || !typingUser) return;
    chat.users?.forEach((user) => {
      if (user?._id !== typingUser?._id) {
        socket.to(user?._id).emit("display_typing", chat, typingUser);
      }
    });
  });

  socket.on("stop_typing", (chat, typingUser) => {
    if (!chat || !typingUser) return;
    chat.users?.forEach((user) => {
      if (user?._id !== typingUser?._id) {
        socket.to(user?._id).emit("hide_typing", chat, typingUser);
      }
    });
  });
};

// Escutando os eventos 'Desconectar'
const configureDisconnectEvents = (socket) => {
  socket.on("disconnect", () => {
    console.log("user disconnected");
  });

  socket.off("init_user", (userId) => {
    console.log("User socket disconnected");
    socket.leave(userId);
  });
};

const configureSocketEvents = (server) => {
  // Configuração dos 'Sockets'
  const io = new Server(server, {
    pingTimeout: 120000,
    cors: { origin: process.env.CLIENT_ADDRESS_URL }, //// refatorar para usar * ou mais de uma URL
  });

  io.on("connection", (socket) => {
    // Inicializa 'user'
    socket.on("init_user", (userId) => {
      socket.join(userId);
      socket.emit(`user_connected`);
      console.log("user initialized: ", userId);
    });

    // Inicializa 'chat'
    socket.on("join_chat", (chatId) => {
      socket.join(chatId);
      console.log(`User joined chat : ${chatId}`);
    });

    configureMsgEvents(socket);
    configureGroupEvents(socket);
    configureTypingEvents(socket);
    configureDisconnectEvents(socket);
  });
};

export default configureSocketEvents;
