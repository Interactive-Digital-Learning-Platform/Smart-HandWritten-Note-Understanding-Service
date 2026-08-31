import axios from "axios";
import { config } from "../config/config";

const models = [
  "microsoft/trocr-base-handwritten",
  "microsoft/trocr-small-handwritten",
  "microsoft/trocr-large-handwritten",
];

async function testModels(): Promise<void> {
  const apiKey = config.huggingFace.apiKey;
  if (!apiKey) {
    throw new Error(
      "HUGGINGFACE_API_KEY must be set before running the OCR model check."
    );
  }

  for (const model of models) {
    try {
      console.log(`Testing model: ${model}...`);
      const response = await axios.get(
        `https://api-inference.huggingface.co/models/${model}`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
        }
      );
      console.log(`\u2705 ${model} is available. Status: ${response.status}`);
    } catch (error: any) {
      console.log(
        `\u274c ${model} failed. Status: ${error.response?.status}, Message: ${
          error.response?.data?.error || error.message
        }`
      );
    }
  }
}

testModels().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
