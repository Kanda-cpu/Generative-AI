// memory of LLM

import "dotenv/config";
import { ChatGroq } from "@langchain/groq";
import rl from "readline/promises";

const readline = rl.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const model = new ChatGroq({
  model: "openai/gpt-oss-120b",
  apiKey: process.env.groq_api_key,
});

const messages = [];

while (true) {
  const userinput = await readline.question("Enter your input :  ");

  if (userinput.trim().toLowerCase() === "exit") {
    break;
  }

  messages.push({
    role: "user",
    content: userinput,
  });

  const stream = await model.stream(messages);

  let clankers_response = "";
  for await (const chunk of stream) {
    clankers_response += chunk.content;
    process.stdout.write(chunk.content);
  }

  messages.push({
    role: "assistant",
    content: clankers_response,
  });

  process.stdout.write("\n");
}
readline.close();
