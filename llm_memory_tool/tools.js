import "dotenv/config";
import { ChatGroq } from "@langchain/groq";
import rl from "readline/promises";
import * as z from "zod";

import { tool, createAgent } from "langchain";

const readline = rl.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const model = new ChatGroq({
  model: "openai/gpt-oss-120b",
  apiKey: process.env.groq_api_key,
});

const event = [];

const createEventTool = tool(
  async function ({ date, title, description }) {
    console.log("Event created -> ", { date, title, description });

    event.push({ date, title, description });
    return "Event created";
  },
  {
    name: "CreateEvent",
    description: "Create an event with date, title,description",
    schema: z.object({
      date: z.string(),
      title: z.string(),
      description: z.string(),
    }),
  },
);

const getEventTool = tool(
  async function ({}) {
    console.log("Event Retrived ", event);
    return event;
  },
  {
    name: "getEvents",
    description: "Retrive all the events",
    schema: z.object({}),
  },
);

const agent = createAgent({
  model,
  tools: [createEventTool, getEventTool],
});

while (true) {
  const userinput = await readline.question("Enter your input : ");

  const stream = await agent.stream(
    {
      messages: [
        {
          role: "user",
          content: userinput,
        },
      ],
    },
    { streamMode: "messages" },
  );

  for await (const [chunk] of stream) {
    process.stdout.write(chunk.content);
  }

  process.stdout.write("\n");
}
