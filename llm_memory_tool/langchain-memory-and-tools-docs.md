# LLM Memory & Tool-Calling Agents: Project Documentation

This documentation covers two small Node.js projects built with LangChain and Groq:

| Project | File | What it demonstrates |
|---|---|---|
| **Project 1: Chat with Memory** | `index_1.js` | How an LLM "remembers" a conversation, with streamed token-by-token output |
| **Project 2: Tool-Calling Agent** | `tools.js` | How an LLM can call your own functions (a mini calendar) through an agent |

Each project is explained with its requirements, general syntax, a line-by-line walkthrough, and the concepts behind it. A final section shows how the two ideas combine.

---

## Table of Contents

1. [Requirements & Setup](#1-requirements--setup)
2. [Core Concepts](#2-core-concepts)
3. [Project 1: Chat with Memory](#3-project-1-chat-with-memory-index_1js)
4. [Project 2: Tool-Calling Agent](#4-project-2-tool-calling-agent-toolsjs)
5. [Streaming Modes Explained](#5-streaming-modes-explained)
6. [Combining Memory and Tools](#6-combining-memory-and-tools)
7. [Syntax Deep-Dive: Objects, Arrays & Destructuring](#7-syntax-deep-dive-objects-arrays--destructuring)
8. [Small Details Worth Knowing](#8-small-details-worth-knowing)
9. [Glossary](#9-glossary)

---

## 1. Requirements & Setup

### 1.1 Software

- **Node.js 20 or newer** (needed for ES modules and top-level `await`, and recent LangChain versions expect a modern Node).
- **npm** (comes with Node).
- A **Groq API key** from the Groq console.

### 1.2 Dependencies

| Package | Version used | Role |
|---|---|---|
| `langchain` | ^1.6.8 | Main framework. Provides `createAgent` (agent loop) and `tool` (tool wrapper). Built on LangGraph internally. |
| `@langchain/groq` | ^1.3.2 | Integration for Groq-hosted models. Provides the `ChatGroq` class. |
| `zod` | ^4.6.7 | Schema library. Describes the arguments a tool accepts. |
| `dotenv` | ^18.0.10 | Loads variables from a `.env` file into `process.env`. |

Built-in Node modules (no install): `readline/promises` for terminal input, and `process` for stdin/stdout.

Install:

```bash
npm init -y
npm install langchain @langchain/groq zod dotenv
```

### 1.3 `package.json`

Because the code uses `import` syntax and top-level `await`, enable ES modules:

```json
{
  "type": "module"
}
```

### 1.4 Environment file

Create a `.env` file in the project root:

```env
groq_api_key=your_api_key_here
```

The code reads it with `process.env.groq_api_key`. The name in `.env` must match exactly (it is case-sensitive).


### 1.5 Running

```bash
node index_1.js    # Project 1: memory chat
node tools.js      # Project 2: tool-calling agent
```

---

## 2. Core Concepts

### 2.1 What is an LLM call?

A Large Language Model takes a list of messages as input and returns a new message as output. That is all it does. It has **no built-in memory** and **no ability to run code** by itself. Both of those things are added by the program around it:

- **Memory** = your program resends the earlier messages every time.
- **Tools** = your program describes functions to the model, the model asks for one to be called, and your program runs it and reports back.

### 2.2 Message roles

Every message has a `role` and `content`:

| Role | Meaning |
|---|---|
| `system` | Standing instructions ("You are a helpful assistant…"). Optional. |
| `user` | What the human typed. |
| `assistant` | What the model replied. |
| `tool` | The result of a tool call (used in agents). |

```js
{ role: "user", content: "Hello!" }
```

#### What `{ role: "user", content: userinput }` actually is

It is a plain JavaScript **object** with two properties:

| Property | Meaning | In the code |
|---|---|---|
| `role` | **Who is speaking** in this message | `"user"` = the human at the keyboard |
| `content` | **What was said** (the text) | `userinput`, the variable holding whatever the person just typed |

So `{ role: "user", content: userinput }` literally means *"the user said: (whatever they typed)"*. If the user types `hi`, the object becomes `{ role: "user", content: "hi" }`.

This is the standard **chat message format** used by nearly every LLM API. It tells the model *who said what*, so it can tell your questions apart from its own earlier answers. LangChain accepts these plain objects directly and converts them internally into message classes. You can write the same message with the classes if you prefer:

```js
import { HumanMessage } from "@langchain/core/messages"; // installed together with LangChain

new HumanMessage("Hello!");   // same as { role: "user", content: "Hello!" }
```

#### All the roles and what each is used for

| Role | Class equivalent | Who creates it | Purpose |
|---|---|---|---|
| `system` | `SystemMessage` | You (the developer) | Standing instructions: personality, rules, today's date, output style. Usually the **first** message. |
| `user` | `HumanMessage` | The person chatting | Their questions and requests. |
| `assistant` | `AIMessage` | The model | The model's replies. When the model wants to use a tool, its message carries a **tool call request** instead of (or along with) text. |
| `tool` | `ToolMessage` | Your tool function's result | The output of a tool, sent back to the model so it can continue. Linked to the request by a `tool_call_id`. |

LangChain also accepts the aliases `"human"` for `user` and `"ai"` for `assistant`.

#### A complete conversation with a tool call (simplified illustration)

```js
[
  { role: "system",    content: "You are a calendar assistant." },
  { role: "user",      content: "Add gym on 5 Dec" },
  { role: "assistant", content: "", tool_calls: [{ id: "call_1", name: "CreateEvent", args: { date: "5 Dec", title: "Gym", description: "Gym session" } }] },
  { role: "tool",      content: "Event created", tool_call_id: "call_1" },
  { role: "assistant", content: "Done! I've added gym on 5 Dec." },
]
```

#### Why the correct role matters

- The model treats each role differently: `system` is obeyed as instructions, `user` as requests, `assistant` as "things I already said".
- If you stored the model's reply with `role: "user"`, the model would believe **you** said it, and the conversation would become confusing.
- Messages are read in order, so the order of the array is the order of the conversation.
- `content` is normally a string, but it can also be an array of content blocks (for example text plus an image) on models that support it.

### 2.3 Streaming

Instead of waiting for the full answer, **streaming** delivers the response in small pieces (chunks) as the model generates it, so the user sees text appear live, like typing.

---

## 3. Project 1: Chat with Memory (`index_1.js`)

### 3.1 Goal

A terminal chatbot that remembers everything said earlier in the session and prints replies as they stream in.

### 3.2 The key idea

> **The model is stateless. Memory is just an array you keep and resend.**

```
Turn 1:  send [user1]                       → reply1
Turn 2:  send [user1, reply1, user2]        → reply2
Turn 3:  send [user1, reply1, user2, reply2, user3] → reply3
```

On turn 3 the model "remembers" turn 1 only because turn 1 is included in the request.

### 3.3 General syntax

```js
import { ChatGroq } from "@langchain/groq";

// 1. Create the model
const model = new ChatGroq({
  model: "model-id-here",
  apiKey: process.env.YOUR_KEY,
});

// 2. Keep a history array
const messages = [];

// 3. Each turn: add user message, call the model, add assistant reply
messages.push({ role: "user", content: "..." });
const stream = await model.stream(messages);
// ...collect chunks into a string...
messages.push({ role: "assistant", content: fullReply });
```

### 3.4 Code walkthrough

**Imports and setup**

```js
import "dotenv/config";
import { ChatGroq } from "@langchain/groq";
import rl from "readline/promises";
```

- `import "dotenv/config"` runs dotenv immediately, loading `.env` into `process.env`.
- `ChatGroq` is the model wrapper.
- `readline/promises` gives a promise-based way to read terminal input.

**Terminal input**

```js
const readline = rl.createInterface({
  input: process.stdin,
  output: process.stdout,
});
```

Creates an interface that reads from the keyboard and writes prompts to the screen.

**Model**

```js
const model = new ChatGroq({
  model: "openai/gpt-oss-120b",
  apiKey: process.env.groq_api_key,
});
```

- `model`: the Groq model ID.
- `apiKey`: your secret key from `.env`.

**The memory array**

```js
const messages = [];
```

This single array is the entire memory. It lives in RAM, so it disappears when the program stops.

**The chat loop**

```js
while (true) {
  const userinput = await readline.question("Enter your input :  ");
  if (userinput.trim().toLowerCase() === "exit") break;
```

- `await readline.question(...)` pauses until the user presses Enter.
- Typing `exit` ends the loop.

**Step 1: store the user message**

```js
messages.push({ role: "user", content: userinput });
```

**Step 2: call the model with the whole history**

```js
const stream = await model.stream(messages);
```

`model.stream(messages)` sends **all** messages and returns an async iterable of chunks. (`model.invoke(messages)` is the non-streaming version that returns the full reply at once.)

**Step 3: read the stream and build the full reply**

```js
let clankers_response = "";
for await (const chunk of stream) {
  clankers_response += chunk.content;
  process.stdout.write(chunk.content);
}
```

- `for await ... of` loops over chunks as they arrive.
- `chunk.content` is a small piece of text (a few characters or a word).
- `process.stdout.write` prints without a newline, which creates the live typing effect.
- `clankers_response += ...` glues the pieces into the complete reply.

**Step 4: store the assistant reply (this is the memory step)**

```js
messages.push({ role: "assistant", content: clankers_response });
```

Without this line, the model would see only your questions and never its own earlier answers.

**Cleanup**

```js
readline.close();
```

Closes the terminal interface after the loop ends.

### 3.5 Flow diagram

```
┌──────────────┐
│ user types   │
└──────┬───────┘
       ▼
 messages.push(user)
       ▼
 model.stream(messages)  ──►  chunks printed live
       ▼
 join chunks into one string
       ▼
 messages.push(assistant)
       ▼
   next loop turn
```

### 3.6 Things to know about this kind of memory

- It is **session memory**: it is lost when the program exits.
- It **grows every turn**. Very long chats can reach the model's context limit, so real apps trim or summarize old messages.
- A `system` message placed first in the array is the standard way to give the model a personality or rules.

---

## 4. Project 2: Tool-Calling Agent (`tools.js`)

### 4.1 Goal

A terminal assistant that can **create** and **list** calendar events by calling real JavaScript functions, which the model chooses to call by itself.

### 4.2 Key concepts

| Term | Meaning |
|---|---|
| **Tool** | A function plus a name, description and input schema that the model can request to run. |
| **Agent** | A loop that lets the model think, call tools, read the results, and continue until it can give a final answer. |
| **Schema** | A description of the tool's inputs, written with Zod. |

> The model never runs your code. It only produces a **request** ("call `CreateEvent` with these arguments"). The agent runs the function and sends the result back.

### 4.3 General syntax

**Defining a tool**

```js
import { tool } from "langchain";
import * as z from "zod";

const myTool = tool(
  async (args) => {
    // do something with args
    return "result as a string";
  },
  {
    name: "ToolName",
    description: "What this tool does and when to use it",
    schema: z.object({
      field1: z.string(),
      field2: z.number(),
    }),
  },
);
```

**Creating the agent**

```js
import { createAgent } from "langchain";

const agent = createAgent({
  model,                 // the ChatGroq instance
  tools: [myTool],       // list of tools it may call
  // systemPrompt: "..." // optional instructions
});
```

**Running the agent**

```js
const stream = await agent.stream(
  { messages: [{ role: "user", content: "..." }] },  // argument 1: the input
  { streamMode: "messages" },                        // argument 2: the options
);
```

`agent.stream(input, options)` takes **two arguments, and both are objects**. Section 4.8 explains each one.

### 4.4 Code walkthrough

**The data store**

```js
const event = [];
```

A plain array acting as the database. Both tools share it.

**Tool 1: `CreateEvent`**

```js
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
```

- **Function**: receives an object whose shape matches the schema (destructured into `date`, `title`, `description`), saves it, and returns a confirmation string. That return value goes back to the model so it knows the action succeeded.
- **`name`**: the identifier the model uses to request this tool.
- **`description`**: the most important text. The model reads it to decide **when** this tool is appropriate.
- **`schema`**: `z.object({...})` declares the required arguments. LangChain turns it into a JSON schema for the model and validates the model's arguments before running your function.

**Tool 2: `getEvents`**

```js
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
```

- A tool that needs **no input** uses an empty schema: `z.object({})` (explained in section 4.10).
- `async function ({})` has an empty destructuring pattern because there are no arguments to pull out. `async () => { ... }` would work the same way.
- It returns the events so the model can read them and describe them to the user.

**The agent**

```js
const agent = createAgent({
  model,
  tools: [createEventTool, getEventTool],
});
```

Only tools in this list are available to the model.

**The loop**

```js
while (true) {
  const userinput = await readline.question("Enter your input : ");

  const stream = await agent.stream(
    { messages: [{ role: "user", content: userinput }] },
    { streamMode: "messages" },
  );

  for await (const [chunk] of stream) {
    process.stdout.write(chunk.content);
  }

  process.stdout.write("\n");
}
```

- `agent.stream({ messages }, { streamMode })` starts the agent for one user request.
- `streamMode: "messages"` streams **message chunks token by token** (see [section 5](#5-streaming-modes-explained)).
- In this mode each item from the stream is a **tuple** (a 2-element array) `[messageChunk, metadata]`. The `[chunk]` destructuring grabs the first element and ignores the metadata (explained in section 4.9).
- `chunk.content` is the text piece, printed immediately with `process.stdout.write`.

### 4.5 What happens when you type "Add a gym session on 5 Dec"

```
1. Agent sends your message + tool definitions to the model.
2. Model replies with a tool call:
      CreateEvent({ date: "5 Dec", title: "Gym", description: "Gym session" })
3. Agent validates the args against the Zod schema.
4. Agent runs your function  → pushes to `event`, returns "Event created".
5. Agent sends that result back to the model.
6. Model writes the final text: "I've added your gym session on 5 Dec."
7. That text is streamed to your terminal.
```

This **think → act → observe → repeat** cycle is called the **ReAct loop**. The agent keeps cycling until the model answers with plain text and no tool call.

### 4.6 How the model "decides" to use a tool

You do not write `if` conditions. The model chooses based entirely on:

1. The tool `name`
2. The tool `description`
3. The schema (including any `.describe()` on fields)
4. The user's message

So writing clear, specific descriptions is the main way to control tool-use behavior.

### 4.7 Memory in this project

In `tools.js` every loop iteration sends **only the new user message**:

```js
messages: [{ role: "user", content: userinput }]
```

That means each request starts with a fresh conversation, so the agent does not recall earlier turns of chat. The `event` array does persist for the session, which is why `getEvents` can still list events created earlier, because that data lives in your code, not in the model's memory. To give the agent conversational memory as well, use the pattern from Project 1 (see section 6).

### 4.8 Understanding the `agent.stream(...)` call: is `{ streamMode: "messages" }` an object the function accepts?

Yes. `agent.stream(input, options)` takes two arguments, and **both are plain objects**:

```js
agent.stream(
  { messages: [ ... ] },        // 1) input   -> the starting state for the agent
  { streamMode: "messages" },   // 2) options -> HOW to run / stream it
);
```

| Argument | What it is | Details |
|---|---|---|
| **1. input** | The starting state | The key must be named `messages`. Its value is the array of message objects the agent should read. |
| **2. options** | A configuration object | Named settings. `streamMode` is just **one** of the keys you can put in it. |

Why an object and not a plain string or a third positional argument?

- **Named keys are readable.** `{ streamMode: "messages" }` says what the value means. A bare `"messages"` would not.
- **Order doesn't matter and it is extendable.** You can add more settings later without changing the function's shape.
- Other settings that can live in this same options object include things like `configurable` (used for thread IDs when you use a checkpointer for memory), `recursionLimit` (a cap on how many agent steps are allowed) and `signal` (to cancel a running request).

Also note that `agent.stream(...)` returns a **promise** that resolves to an **async iterable**. That is why the code has `await` in front of it and then uses `for await ... of` to read the chunks.

### 4.9 Why do we destructure `[chunk]`?

The curly braces in `{ streamMode: "messages" }` are an **object**. The square brackets in `[chunk]` are something different: **array destructuring** of what the stream gives you.

In `"messages"` mode, every item the stream produces is a **2-element array**: the message piece, and some information about where it came from.

```js
// What one item looks like:
[ messageChunk, metadata ]
```

Destructuring is just a shortcut for picking array elements by position. These two loops do exactly the same thing:

```js
// Long way
for await (const item of stream) {
  const chunk = item[0];      // the message piece (has .content)
  const metadata = item[1];   // info such as which step of the agent produced it
  process.stdout.write(chunk.content);
}

// Shortcut with destructuring
for await (const [chunk] of stream) {
  process.stdout.write(chunk.content);
}
```

- `const [chunk]` takes only the **first** element and ignores the second.
- `const [chunk, metadata]` would take both.
- The stream packs two things into every item, so it hands you an array. If it gave you only the chunk, no destructuring would be needed.

**Common gotcha:** arrays are destructured by **position** with `[ ]`, objects by **name** with `{ }`. Writing `for await (const { chunk } of stream)` would give `undefined`, because the item is an array, not an object.

### 4.10 Why does the second tool have an empty `z.object({})`?

```js
schema: z.object({})
```

**Reason:** every tool has to describe its inputs. LangChain converts the schema into a JSON Schema that is sent to the model together with the tool's name and description. The model uses it to know what arguments it must supply.

- `CreateEvent` needs three inputs (`date`, `title`, `description`), so its schema lists three fields.
- `getEvents` needs **no inputs**. It just returns everything. "Takes zero arguments" is written as an object with no properties: `z.object({})`. Roughly, the model sees `{ type: "object", properties: {} }`.

**Why not leave the schema out?** The APIs expect a tool's parameters to be described as an object, so even a no-argument tool declares an empty one. If you omit the schema, LangChain falls back to a default that expects a single free-text input, which is not what you want for a tool that takes nothing.

**What actually happens at runtime:** the model calls the tool with an empty argument object `{}`, your function runs, and it ignores the input because it doesn't need any.

**When you would fill it in:** if you later wanted to filter events, you would add an optional field:

```js
schema: z.object({
  date: z.string().optional().describe("Only return events on this date"),
})
```

`.describe("...")` adds a short hint on a field that the model can read, which helps it fill in the argument correctly. It is optional but useful on any field.

---

## 5. Streaming Modes Explained

`agent.stream(input, { streamMode })` supports different modes that control **what** each yielded item contains.

| Mode | Each item contains | Typical use |
|---|---|---|
| `"values"` | The **full state** (all messages so far) after each step of the agent loop | Getting the final complete message list, e.g. to save history |
| `"messages"` | `[messageChunk, metadata]` tuples, streamed **token by token** | Live typing effect in the UI |
| `"updates"` | Only what each step **changed** | Debugging and tracing which step did what |

Quick rule:

- Want live text → `"messages"`
- Want the complete state/history → `"values"`
- If you don't need streaming at all → `await agent.invoke({ messages })`, which returns the final state directly.

### The shape of each item differs per mode

This is why the loops in the two projects look different:

```js
// "messages": each item is an ARRAY [chunk, metadata]  -> array destructuring
for await (const [chunk, metadata] of stream) {
  process.stdout.write(chunk.content);
}

// "values": each item is an OBJECT { messages: [...] } -> property access
for await (const state of stream) {
  console.log(state.messages);
}
```

You can also request several modes at once by passing an array, for example `streamMode: ["messages", "values"]`. Each item then arrives as `[modeName, data]`, so you can tell which mode it came from.

---

## 6. Combining Memory and Tools

The two projects solve different problems, and a full assistant needs both. The pattern is: keep a persistent `messages` array (Project 1) and pass it to the agent (Project 2). After each run, replace your history with the full message list the agent returns, because it includes the assistant's tool calls and the tool results, not just the text.

```js
const messages = [];

while (true) {
  const userinput = await readline.question("Enter your input : ");
  if (userinput.trim().toLowerCase() === "exit") break;

  messages.push({ role: "user", content: userinput });

  // "values" mode: every chunk is the full state so far
  const stream = await agent.stream({ messages }, { streamMode: "values" });

  let finalMessages = messages;
  for await (const chunk of stream) {
    finalMessages = chunk.messages;
  }

  console.log(finalMessages[finalMessages.length - 1].content);

  // Save the complete history (user msg + tool calls + tool results + reply)
  messages.length = 0;
  messages.push(...finalMessages);
}
```

### Why `streamMode: "values"` here, and not `"messages"`?

The two projects have **different goals**, so they use different modes:

| | Goal | Mode |
|---|---|---|
| Project 2 | Show the reply live as it is generated | `"messages"` |
| Combined version | Get the **complete conversation** after each turn so it can be saved as memory | `"values"` |

`"messages"` only gives you small text pieces. You would have to stitch them together yourself, and you would not get a tidy list that includes the tool call and tool result messages.

`"values"` gives you the **entire state after every step** of the agent loop. For a turn where a tool is used, the stream looks like this (each chunk also contains all the earlier history):

```
chunk 1 -> messages: [ user ]
chunk 2 -> messages: [ user, assistant (tool call) ]
chunk 3 -> messages: [ user, assistant (tool call), tool result ]
chunk 4 -> messages: [ user, assistant (tool call), tool result, assistant (final text) ]   <- last = complete
```

Because every chunk is already the full state, the code simply overwrites `finalMessages` each time. When the loop ends, `finalMessages` holds the last chunk, which is the complete conversation. A chunk in this mode is an **object**, so you read `chunk.messages` (property access), not `[chunk]`.

**Trade-off:** nothing is printed until the whole turn is finished, so there is no live typing. If you want a final-state result without streaming at all, `invoke` does the same job more simply:

```js
const result = await agent.invoke({ messages });
messages = result.messages;               // needs `let messages` instead of `const`
console.log(result.messages.at(-1).content);
```

### The memory lines explained

| Line | What it does |
|---|---|
| `let finalMessages = messages;` | A fallback starting value, so the variable is never empty even if the stream yields nothing. |
| `finalMessages = chunk.messages;` | Keeps the newest full state; the last one wins. |
| `finalMessages[finalMessages.length - 1]` | The last message in the list, which is the assistant's final text reply. |
| `messages.length = 0;` | Empties the array **in place**. This is needed because `messages` is declared with `const`, so it cannot be reassigned. |
| `messages.push(...finalMessages);` | Refills it. The `...` (spread) expands the array into separate arguments. |

### Why replace the history instead of just pushing the final reply?

The agent's returned list already contains everything that happened this turn, in the right order: the user message, the tool call, the tool result and the final reply. Using it as the new history lets the model see its own earlier tool calls and results in later turns. If you pushed only the final text, those intermediate messages would be lost.

---

## 7. Syntax Deep-Dive: Objects, Arrays & Destructuring

Most of the "weird looking" syntax in these projects is just curly braces and square brackets used in different ways. Here is every appearance in one place.

| Code | What it is | Explanation |
|---|---|---|
| `{ role: "user", content: userinput }` | Object literal | A message. Property names on the left, values on the right. |
| `{ messages }` | Shorthand property | Same as `{ messages: messages }`. When the key and the variable have the same name you can write it once. |
| `createAgent({ model, tools })` | Object of options (with shorthand) | Same as `{ model: model, tools: tools }`. |
| `{ streamMode: "messages" }` | Options object | A configuration object passed as the 2nd argument. |
| `async function ({ date, title, description })` | **Object** destructuring in parameters | The tool receives one object and pulls out three named properties from it. |
| `for await (const [chunk] of stream)` | **Array** destructuring | Takes the first element of a 2-element array by position. |
| `chunk.messages` | Property access | Reads one property from an object. |
| `messages.push(...finalMessages)` | Spread operator | Expands an array into separate arguments. |

Rule of thumb:

- `{ }` → **by name** (objects)
- `[ ]` → **by position** (arrays)

---

## 8. Small Details Worth Knowing

- **`import "dotenv/config"`** is a *side-effect import*: it has no name, it just runs dotenv immediately. It must run before any code reads `process.env`, so keep it near the top.
- **`import * as z from "zod"`** is a *namespace import*: everything Zod exports becomes available under the name `z` (`z.object`, `z.string`, ...).
- **`process.stdout.write()` vs `console.log()`**: `console.log` always adds a newline, while `process.stdout.write` does not. That is why it is used for streaming, so chunks join into one continuous line. The extra `process.stdout.write("\n")` after the loop ends the line.
- **`for await ... of`** loops over something that produces values over time (an *async iterable*). Each pass of the loop waits for the next chunk.
- **Top-level `await`** (using `await` outside a function) works only in ES modules, which is why `"type": "module"` is needed.
- **Tool functions run in your Node process.** A `console.log` inside a tool prints into the terminal at the moment the tool runs, which can appear in the middle of streamed output.
- **Tool return values** should be strings (or JSON turned into a string with `JSON.stringify`) because they become the `content` of a `tool` message the model reads.
- **Tool names** should be simple: letters, numbers, underscores or hyphens, with no spaces, because providers restrict the allowed characters.
- **Schema validation:** the arguments the model produces are checked against your Zod schema before your function runs, so your function receives data in the expected shape.
- **One turn can involve several tool calls.** The model may call a tool more than once, or call different tools in sequence, before giving its final answer. The agent loop handles this automatically.
- **Tool results count towards the context window.** A tool that returns a very large result uses up space for the rest of the conversation.
- **`chunk.content` is usually a string**, but it can be an array of content blocks on some models. Chunks that carry only tool-call data often have an empty `content`.
- **`.trim().toLowerCase()`** on the input makes the `exit` check forgiving of spaces and capital letters (`" EXIT "` still works).
- **`const` arrays can still be changed.** `const` stops you from reassigning the variable, but you can still `push` into the array or set `length = 0`.
- **Variable names are free.** `clankers_response` is just a name chosen for the string that collects the reply; it has no special meaning.
- **Memory only lasts for the session.** `messages` and `event` live in RAM, so they are gone when the program stops. Saving them to a file or database is what makes them permanent.

---

## 9. Glossary

| Term | Definition |
|---|---|
| **LLM** | Large Language Model, a model that predicts text from an input conversation. |
| **Stateless** | Keeps no memory between calls; everything it needs must be sent each time. |
| **Context window** | The maximum amount of text (tokens) a model can read in one request. |
| **Token** | A small unit of text (part of a word) that models read and generate. |
| **Chunk** | One small piece of a streamed response. |
| **Tool / function calling** | The model's ability to request that a defined function be run with specific arguments. |
| **Agent** | A loop combining a model and tools that continues until a final answer is produced. |
| **ReAct loop** | Reason → Act (call a tool) → Observe (read the result) → repeat. |
| **Schema (Zod)** | A declaration of the shape and types of data, used here for tool arguments. |
| **ES modules** | The `import`/`export` module system, enabled with `"type": "module"`. |
| **Top-level await** | Using `await` outside a function, which works in ES modules. |
