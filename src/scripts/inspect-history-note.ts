import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { Note } from "../models/Note";
import { config } from "../config/config";

async function run() {
  await mongoose.connect(config.mongodb.uri);
  const n = await Note.findById("6a8e75420730c18b1aeaf13e");
  if (n) {
    console.log("Note ID:", n._id);
    console.log("Title:", n.title);
    console.log("ImageUrls:", n.imageUrls);
    console.log("Full Raw text:\n", n.rawText);
  }
  await mongoose.disconnect();
}

run();
