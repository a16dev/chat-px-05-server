import dotenv from "dotenv";
dotenv.config();

// Handler de erro de fallback para rotas inválidas
const notFoundHandler = (req, res, next) => {
  const notFoundError = new Error(`Não encontrado : '${req.originalUrl}'`);
  res.status(404);
  next(notFoundError);
};

const appErrorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode || 500;
  const status = `${statusCode}`.startsWith("4")
    ? "Client error"
    : "Server error";

  res.status(statusCode).json({
    status,
    message: err.message,
    stack: process.env.NODE_ENV === "production" ? null : err.stack,
  });
};

export { notFoundHandler, appErrorHandler };
