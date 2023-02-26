import asyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import UserModel from "../models/UserModel.js";
import dotenv from "dotenv";
dotenv.config();

const authorizeUser = asyncHandler(async (req, res, next) => {
  const bearerToken = req.headers?.authorization;

  if (bearerToken?.startsWith("Bearer")) {
    try {
      // 'Bearer asdfasdflnk45y390240' => 'asdfasdflnk45y390240'
      const token = bearerToken.split(" ")[1];

      // Decodificando o usuário 'jwt-signed' do token usando 'jwt-secret'
      const decodedUser = jwt.verify(token, process.env.JWT_SECRET);

      // Anexando o usuário atualmente 'conectado' ao objeto de solicitação, sem senha
      req.user = await UserModel.findById(decodedUser.id).select("-password");

      next();
    } catch (error) {
      res.status(401);
      throw new Error(
        "Não autorizado, token falhou ou expirou! Por favor, saia e faça login novamente."
      );
    }
  } else {
    res.status(401);
    throw new Error("Não autorizado, nenhum token recebido!");
  }
});

export default authorizeUser;
