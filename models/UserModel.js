import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, unique: true },
    password: { type: String, required: true, trim: true },
    notifications: [{ type: ObjectId, ref: "Message" }],
    avatar_id: { type: String, trim: true, default: "" }, // ( Refatorar para usar qq repositório )
    profilePic: {
      type: String,
      trim: true,
      default: process.env.REACT_APP_DEFAULT_USER_DP, // Imagem Padrão = ( Refatorar para usar qq repositório )
    },
  },
  { timestamps: true }
);

// A seta fn não funcionará aqui, pois 'this' na seta fn apontará para 'module.exports'
// mas no fn regular, 'this' apontará para 'userSchema', que é o que quero

// Checking if entered password by user during login is authentic
userSchema.methods.matchPasswords = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.pre("save", async function (next) {
  // Criptografa a senha somente se ela for modificada ou criada
  if (this.isModified("password")) {
    try {
      const salt = await bcrypt.genSalt();
      this.password = await bcrypt.hash(this.password, salt);
      return;
    } catch (error) {
      next(error);
    }
  }
  next();
});

userSchema.pre("updateOne", async function (next) {
  // Criptografa a senha atualizada
  const updatedPassword = this.getUpdate().$set.password;
  if (updatedPassword) {
    try {
      const salt = await bcrypt.genSalt();
      this.getUpdate().$set.password = await bcrypt.hash(updatedPassword, salt);
      return;
    } catch (error) {
      next(error);
    }
  }
  next();
});

export default mongoose.model("User", userSchema);
