import { ChatGroq } from "@langchain/groq";
import "dotenv/config";
import { stdout } from "process";
import rl from "readline/promises";

import * as z from "zod";
import { tool, createAgent } from "langchain";

const readline = rl.createInterface({
  input: process.stdin,
  output: stdout,
});

const model = new ChatGroq({
  model: "openai/gpt-oss-120b",
  apiKey: process.env.groq_api_key,
});

const events = [];
const messages = [];

const createEventTool = tool(
  async ({ date, title, description }) => {
    console.log("\nCreating event ", { date, title, description });
    events.push({ date, title, description });
    return "Event Created";
  },
  {
    name: "Create_Event",
    description: "Create a new event with date, title and description",
    schema: z.object({
      date: z.string(),
      title: z.string(),
      description: z.string(),
    }),
  },
);

const getEventTool = tool(
  async () => JSON.stringify(events), // return a string
  {
    name: "Get_Events",
    description: "Retrieve all events the user has created",
    schema: z.object({}),
  },
);

const agent = createAgent({
  model,
  tools: [createEventTool, getEventTool],
  // systemPrompt:
  //   "You are a helpful assistant that manages the user's calendar events. " +
  //   "Always use Get_Events to list events and Create_Event to add them. " +
  //   "Never invent events.",
});

while (true) {
  const userinput = await readline.question("\nEnter your input : ");

  if (userinput.trim().toLowerCase() === "exit") break;

  messages.push({ role: "user", content: userinput });

  const stream = await agent.stream({ messages }, { streamMode: "values" });

  let finalMessages = messages;
  for await (const chunk of stream) {
    finalMessages = chunk.messages;
  }

  // Print only the final assistant reply
  const last = finalMessages[finalMessages.length - 1];
  console.log(last.content);

  // Replace history with the full result (includes tool calls + tool results)
  messages.length = 0;
  messages.push(...finalMessages);
}

readline.close();
