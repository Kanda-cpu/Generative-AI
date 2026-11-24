# Groq Streaming Console Chatbot

A beginner-friendly console chatbot built with **Node.js**,
**LangChain**, and **Groq**. It accepts questions in the terminal and
prints the model's response incrementally as chunks arrive.

This project demonstrates:

-   Connecting a Node.js application to a hosted language model through
    LangChain.
-   Keeping API credentials in environment variables.
-   Reading terminal input asynchronously.
-   Sending structured chat messages to a chat model.
-   Understanding the difference between `invoke()` and `stream()`.
-   Consuming an asynchronous stream with `for await...of`.
-   Printing streamed output without unwanted line breaks.

------------------------------------------------------------------------

## 1. How the application works

At a high level, the application follows this cycle:

1.  Read a question from the terminal.
2.  Convert the question into a structured user message.
3.  Send the message to the Groq-hosted model using LangChain.
4.  Receive the model's response as a stream of chunks.
5.  Print each chunk as soon as it arrives.
6.  Print a newline after the response is complete.
7.  Ask for another question.

``` text
User
  |
  v
readline.question()
  |
  v
Structured chat message
  |
  v
ChatGroq / LangChain
  |
  v
Groq-hosted language model
  |
  v
Async stream of message chunks
  |
  v
for await...of
  |
  v
process.stdout.write()
  |
  v
Terminal displays the answer
```

The application sends a new request for each question. It does **not**
automatically retain previous questions or answers as conversation
history.

------------------------------------------------------------------------

## 2. Technologies and dependencies

### Node.js

Node.js runs JavaScript outside the browser. In this project, it
provides the runtime for the chatbot, environment-variable access,
terminal input/output, and asynchronous execution.

### LangChain's `ChatGroq`

`ChatGroq` is LangChain's integration for using chat models served by
Groq. It gives the application a consistent chat-model interface,
including methods such as `invoke()` and `stream()`.

### Groq

Groq provides hosted inference for supported language models. The
application sends requests to Groq using an API key. The model name in
the configuration selects the model to use.

### `dotenv`

The `dotenv/config` import loads variables from a local `.env` file into
`process.env`. This keeps credentials out of the source code.

### `readline/promises`

Node.js provides `readline/promises` for promise-based terminal input.
Its `question()` method can be awaited, so the code can wait for a user
to press Enter without writing a callback.

------------------------------------------------------------------------

## 3. Project setup

### Prerequisites

Install a current supported version of Node.js and npm. You also need a
Groq API key and access to the model specified in the code.

### Initialize the project

``` bash
mkdir groq-streaming-chatbot
cd groq-streaming-chatbot
npm init -y
```

If the project uses ES module `import` syntax in a `.js` file, configure
`package.json` with:

``` json
{
  "type": "module"
}
```

Install the dependencies:

``` bash
npm install @langchain/groq dotenv
```

`readline/promises` and `process` are built into Node.js, so they do not
need to be installed separately.

### Suggested folder structure

``` text
groq-streaming-chatbot/
├── node_modules/
├── .env
├── .env.example
├── .gitignore
├── index.js
├── package.json
└── package-lock.json
```

------------------------------------------------------------------------

## 4. Environment variables and API-key safety

Create a `.env` file in the project root:

``` env
groq_api_key=YOUR_GROQ_API_KEY
```

The application reads this value with:

``` javascript
process.env.groq_api_key
```

Do not commit the real `.env` file to Git. It contains a secret
credential. Add `.env` to `.gitignore`.

For collaborators, provide a safe `.env.example` file:

``` env
groq_api_key=your_groq_api_key_here
```

The example file documents the required variable without exposing a
working key.

**Important:** If a real API key has already been committed or exposed,
adding `.env` to `.gitignore` does not revoke that key or erase it from
Git history. Revoke or rotate the exposed key with the provider, then
remove the secret from the repository history if necessary.

------------------------------------------------------------------------

## 5. Complete implementation

Create `index.js`:

``` javascript
import { ChatGroq } from "@langchain/groq";
import "dotenv/config";
import { stdout } from "process";
import rl from "readline/promises";

// Create an interface for reading from and writing to the terminal.
const readline = rl.createInterface({
  input: process.stdin,
  output: stdout,
});

// Initialize the chat model.
const model = new ChatGroq({
  model: "openai/gpt-oss-120b",
  apiKey: process.env.groq_api_key,
});

// Keep accepting questions until the user enters "exit".
while (true) {
  const userinput = await readline.question("Enter question: ");

  if (userinput.trim().toLowerCase() === "exit") {
    break;
  }

  // Send a structured user message and obtain a stream of response chunks.
  const stream = await model.stream([
    {
      role: "user",
      content: userinput,
    },
  ]);

  // Process each chunk as it becomes available.
  for await (const chunk of stream) {
    process.stdout.write(chunk.content);
  }

  // Move to a new terminal line after the complete response.
  process.stdout.write("\n");
}

// Close the terminal interface when the loop ends.
readline.close();
```

Run it:

``` bash
node index.js
```

Enter a question when prompted. Enter `exit` to stop the application.

> The model identifier shown above is the one used in this example.
> Model availability and naming can change; use a model identifier
> currently supported by your Groq account and the installed
> integration.

------------------------------------------------------------------------

## 6. Code walkthrough

### 6.1 Imports

``` javascript
import { ChatGroq } from "@langchain/groq";
import "dotenv/config";
import { stdout } from "process";
import rl from "readline/promises";
```

-   `ChatGroq` provides the LangChain chat-model integration for Groq.
-   `dotenv/config` loads `.env` variables into `process.env` as the
    module is imported.
-   `stdout` is Node's standard-output stream, used to write text to the
    terminal.
-   `readline/promises` provides promise-based terminal input.

The `process` module is built into Node.js. No separate npm installation
is required.

### 6.2 Creating the readline interface

``` javascript
const readline = rl.createInterface({
  input: process.stdin,
  output: stdout,
});
```

`process.stdin` is the readable stream connected to terminal input.
`stdout` is the writable stream connected to terminal output.

The interface connects these streams so that `readline.question()` can
display a prompt and wait for the user's answer.

``` javascript
const userinput = await readline.question("Enter question: ");
```

`question()` returns a Promise. `await` pauses execution of the current
async context until the user submits an answer. Once resolved,
`userinput` contains the entered string.

### 6.3 Initializing the chat model

``` javascript
const model = new ChatGroq({
  model: "openai/gpt-oss-120b",
  apiKey: process.env.groq_api_key,
});
```

This creates a chat-model client configured with a model identifier and
API key.

The API key is read from the environment rather than hardcoded. This is
important because source code is commonly shared and committed to
version control, while credentials must remain private.

### 6.4 The `while` loop

``` javascript
while (true) {
  // ...
}
```

`while (true)` repeats the chatbot interaction indefinitely. Each
iteration reads one question and sends one model request.

An exit condition is needed so the user can stop the loop:

``` javascript
if (userinput.trim().toLowerCase() === "exit") {
  break;
}
```

-   `trim()` removes whitespace around the input.
-   `toLowerCase()` makes the comparison case-insensitive.
-   `break` exits the loop.

After the loop, `readline.close()` closes the interface.

### 6.5 Structured chat messages

``` javascript
const stream = await model.stream([
  {
    role: "user",
    content: userinput,
  },
]);
```

Chat models accept messages with roles and content. The array represents
the messages supplied for this model request.

Common roles include:

-   `system`: instructions that guide the assistant's behavior.
-   `user`: a message supplied by the user.
-   `assistant`: a message produced by the assistant, often included as
    part of conversation history.

For example, a system instruction can be included before the user
message:

``` javascript
const messages = [
  {
    role: "system",
    content: "You are a helpful programming tutor.",
  },
  {
    role: "user",
    content: userinput,
  },
];

const stream = await model.stream(messages);
```

A system message provides instructions for the request. It does not, by
itself, create persistent memory.

### 6.6 `invoke()` versus `stream()`

Both methods send input to the model, but they expose the result
differently.

#### `invoke()`: receive a completed message

``` javascript
const response = await model.invoke([
  {
    role: "user",
    content: userinput,
  },
]);

console.log(response.content);
```

`invoke()` resolves with a completed message after the model finishes
generating its response. The returned message commonly exposes its text
through `response.content`.

Use it when the application can wait for the complete answer before
processing or displaying it.

#### `stream()`: receive output incrementally

``` javascript
const stream = await model.stream([
  {
    role: "user",
    content: userinput,
  },
]);

for await (const chunk of stream) {
  process.stdout.write(chunk.content);
}
```

`stream()` provides an asynchronous iterable of message chunks. The
application can consume each chunk as it becomes available rather than
waiting for the complete answer.

Streaming improves perceived responsiveness: the user can start seeing
the answer before generation is complete. It does not necessarily make
the model generate the answer faster.

A chunk is not guaranteed to be one word or one token. Chunk boundaries
depend on the model, provider, and integration.

  -----------------------------------------------------------------------
  `invoke()`                          `stream()`
  ----------------------------------- -----------------------------------
  Resolves to a completed message     Provides an async iterable of
                                      chunks

  Process the answer after completion Process output incrementally

  Straightforward for one-shot        Useful for live output interfaces
  requests                            
  -----------------------------------------------------------------------

### 6.7 Understanding `for await...of`

``` javascript
for await (const chunk of stream) {
  process.stdout.write(chunk.content);
}
```

The value returned by `stream()` is an asynchronous iterable. Its next
item may not be ready immediately because the model is still generating
output.

`for await...of` consumes that iterable asynchronously:

1.  Request the next item from the iterable.
2.  Wait until that item is available.
3.  Assign it to `chunk`.
4.  Execute the loop body.
5.  Repeat until the stream is complete.

This is different from a regular `for...of` loop, which consumes
synchronous iterables.

### 6.8 `process.stdout.write()` versus `console.log()`

This distinction is essential for terminal streaming.

`console.log()` automatically appends a newline:

``` javascript
console.log("Hello");
console.log("World");
```

Output:

``` text
Hello
World
```

`process.stdout.write()` writes the supplied data without automatically
appending a newline:

``` javascript
process.stdout.write("Hello");
process.stdout.write("World");
```

Output:

``` text
HelloWorld
```

That behavior is useful for streaming because consecutive chunks should
usually appear together as one continuous response.

### 6.9 Why `"\n"` is needed

After the stream finishes, the cursor is generally positioned at the end
of the last printed chunk. The next prompt would appear on that same
line unless the application adds a line break.

``` javascript
process.stdout.write("\n");
```

In JavaScript, `\n` is an escape sequence representing a line-feed
character.

Do not confuse it with `/n`:

``` javascript
process.stdout.write("/n"); // Prints the literal characters / and n
process.stdout.write("\n"); // Writes a newline
```

The newline belongs **after** the `for await...of` loop. Putting it
inside the loop would move to a new line after every chunk, breaking the
continuous streaming display.

------------------------------------------------------------------------

## 7. Important limitation: this is not yet a memory-enabled chatbot

The loop accepts multiple questions, but each model request contains
only the current user message:

``` javascript
const stream = await model.stream([
  {
    role: "user",
    content: userinput,
  },
]);
```

For example:

``` text
User: My name is Alex.
AI: Nice to meet you, Alex.

User: What is my name?
AI: I don't know.
```

The second request does not include the first exchange. The model does
not automatically receive the previous iteration's messages just because
the same `model` instance is reused.

To support conversation history, an application must retain relevant
messages and send them with subsequent requests. For a simple
implementation, this can be an in-memory array. More advanced
applications can use LangChain's message-history abstractions or
persistent storage.

Conversation history and model streaming are separate concepts:

-   **Streaming** controls how the response is delivered.
-   **Conversation history** controls which previous messages are
    included in a request.


## 8. Key concepts recap

  -----------------------------------------------------------------------
  Concept                             What it means in this project
  ----------------------------------- -----------------------------------
  `ChatGroq`                          LangChain integration for Groq chat
                                      models

  `readline.question()`               Promise-based terminal input

  `process.stdin`                     Standard input stream

  `process.stdout`                    Standard output stream

  Structured messages                 Role/content messages sent to a
                                      chat model

  `invoke()`                          Wait for a complete model response

  `stream()`                          Consume a response incrementally

  Async iterable                      A sequence of values that become
                                      available asynchronously

  `for await...of`                    Asynchronously consumes an async
                                      iterable

  `stdout.write()`                    Writes terminal output without
                                      automatically adding a newline

  `\n`                                Newline escape sequence

  Conversation history                Previous messages explicitly
                                      included in later requests
  -----------------------------------------------------------------------


## 9. Final takeaway

This project demonstrates the basic lifecycle of a streaming LLM request
in a Node.js console application:

**Terminal input → structured messages → LangChain chat model → Groq
inference → streamed chunks → terminal output.**

The most important distinction to remember is:

-   `invoke()` gives your application the completed response.
-   `stream()` lets your application process the response incrementally.
-   `for await...of` consumes the asynchronous stream.
-   `process.stdout.write()` prints chunks continuously.
-   `"\n"` moves the terminal cursor to a new line after generation
    finishes.

This is a foundational pattern for building more advanced LLM
applications, including web-based chat interfaces and streaming backend
APIs.
