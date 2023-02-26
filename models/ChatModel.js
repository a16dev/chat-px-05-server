import mongoose from "mongoose";

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const chatSchema = new Schema(
  {
    chatName: { type: String, trim: true, required: true },
    isGroupChat: { type: Boolean, default: false },
    users: [{ type: ObjectId, ref: "User" }],
    groupAdmins: [{ type: ObjectId, ref: "User" }],
    lastMessage: { type: ObjectId, ref: "Message" },
    avatar_id: { type: String, trim: true }, // ( Refatorar para usar qq repositório )
    chatDisplayPic: { type: String, trim: true },
  },
  { timestamps: true }
);

export default mongoose.model("Chat", chatSchema);
