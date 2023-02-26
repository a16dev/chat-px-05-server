import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const connectToMongoDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(`📡 Conectado ao cluster do MongoDB`);
  } catch (error) {
    console.log(`❌ Erro de conexão do MongoDB : ${error.message}`);
    process.exit(1);
  }
};

export default connectToMongoDB;
