import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import connectToMongoDB from "./config/db.js";
import UserRoutes from "./routes/UserRoutes.js";
import ChatRoutes from "./routes/ChatRoutes.js";
import MessageRoutes from "./routes/MessageRoutes.js";
import path from "path";
import {
  notFoundHandler,
  appErrorHandler,
} from "./middleware/ErrorMiddleware.js";
import configureSocketEvents from "./config/sockets.js";

connectToMongoDB();

const app = express();
const DIRNAME = path.resolve();
const PORT = process.env.PORT || 5001;

// Middlewares de configuração personalizados
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rotas para os aplicativos conectados
app.use("/api/user", UserRoutes);
app.use("/api/chat", ChatRoutes);
app.use("/api/message", MessageRoutes);

// ====================  Deployment ========================= //
if (process.env.NODE_ENV === "production") {
  // Estabelece o caminho para o frontend web (mais importante)
  app.use(express.static(path.join(DIRNAME, "/frontend/build")));
  app.get("*", (req, res) =>
    res.sendFile(path.join(DIRNAME, "/frontend/build/index.html"))
  );
}
// ====================  Deployment ========================= //

// Middlewares de erros personalizados
app.all("*", notFoundHandler);
app.use(appErrorHandler);

const server = app.listen(PORT, () =>
  console.log(`🔥 Servidor iniciado na porta ${PORT}`)
);

// Configuração do servidor de socket.io
configureSocketEvents(server);
