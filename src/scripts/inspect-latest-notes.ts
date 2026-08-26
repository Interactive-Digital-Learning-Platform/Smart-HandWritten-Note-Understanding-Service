import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { Note } from "../models/Note";
import { curriculumDbService } from "../services/curriculumDbService";
import { config } from "../config/config";

async function run() {
  await mongoose.connect(config.mongodb.uri);
  const latestNotes = await Note.find().sort({ createdAt: -1 }).limit(5);
  console.log(`Found ${latestNotes.length} latest notes:`);

  for (const n of latestNotes) {
    console.log(`\n================ NOTE: ${n._id} ================`);
    console.log(`Title: ${n.title}`);
    console.log(`Status: ${n.status}`);
    console.log(`Pages: ${n.pageCount}`);
    console.log(`Subject: ${n.analysis?.subject}, Topic: ${n.analysis?.topic}`);
    console.log(`Raw text: ${n.rawText?.slice(0, 300)}...`);
  }

  const books = await curriculumDbService.getUniqueCurriculumTextbooks();
  console.log("\nTextbooks in Neon DB:", books.map(b => b.filename));
  await mongoose.disconnect();
}

run();
