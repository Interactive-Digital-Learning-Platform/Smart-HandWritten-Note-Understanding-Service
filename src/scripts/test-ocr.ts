import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const apiKey = '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'; // from your .env
const models = [
  'microsoft/trocr-base-handwritten',
  'microsoft/trocr-small-handwritten',
  'microsoft/trocr-large-handwritten'
];

async function testModels() {
  for (const model of models) {
    try {
      console.log(`Testing model: ${model}...`);
      const response = await axios.get(`https://api-inference.huggingface.co/models/${model}`, {
        headers: { Authorization: `Bearer ${apiKey}` }
      });
      console.log(`✅ ${model} is available. Status: ${response.status}`);
    } catch (error: any) {
      console.log(`❌ ${model} failed. Status: ${error.response?.status}, Message: ${error.response?.data?.error || error.message}`);
    }
  }
}

testModels();
