import { ChatGroq } from "@langchain/groq";
import "dotenv/config";
import { stdout } from "process";
import rl from "readline/promises";

const readline = rl.createInterface({
  input: process.stdin,
  output: stdout,
});

const model = new ChatGroq({
  model: "openai/gpt-oss-120b",
  apiKey: process.env.groq_api_key,
});

while (true) {
  const userinput = await readline.question("Enter question: ");

  // Check exit BEFORE calling the LLM
  if (userinput.trim().toLowerCase() === "exit") {
    break;
  }

  const stream = await model.stream([
    {
      role: "user",
      content: userinput,
    },
  ]);

  // Receive and print response chunks
  for await (const chunk of stream) {
    process.stdout.write(chunk.content);
  }

  // Move cursor to the next line after response completes
  process.stdout.write("\n");
}

readline.close();

/*
  1. INVOKE()

  - Sends a prompt to the LLM and waits for the complete response.
  - Returns an AIMessage object.
  - Access the generated text using response.content.
  - Best suited for simple requests where the complete response
    is needed before proceeding.

  Example:

  const response = await model.invoke(userinput);
  console.log(response.content);


  2. STREAM()

  - Sends a prompt to the LLM and receives the response
    incrementally as chunks.
  - Returns an asynchronous iterable of message chunks.
  - Use for await...of to consume the incoming chunks.
  - Each chunk can be processed as soon as it arrives.
  - Best suited for interactive chat applications where
    users should see the response while it is being generated.

  Example:

  const stream = await model.stream(userinput);

  for await (const chunk of stream) {
    process.stdout.write(chunk.content);
  }


  KEY DIFFERENCE:

  invoke() -> Complete response at once.
  stream()  -> Response delivered incrementally.

  IMPORTANT:

  stream() does not necessarily make LLM generation faster.
  It allows the application to display generated content
  without waiting for the entire response.
*/
