  import { FoundryLocalManager } from "foundry-local-sdk";
  import { ChatOpenAI } from "@langchain/openai";
  import { ChatPromptTemplate } from "@langchain/core/prompts";

  const alias = "phi-3.5-mini";

  const foundryLocalManager = new FoundryLocalManager()

  const modelInfo = await foundryLocalManager.init(alias)
  console.log("Model Info:", modelInfo)

  const llm = new ChatOpenAI({
      model: modelInfo.id,
      configuration: {
          baseURL: foundryLocalManager.endpoint,
          apiKey: foundryLocalManager.apiKey
      },
      temperature: 0.6,
      streaming: false,
      maxTokens: 5000
  });

  const prompt = ChatPromptTemplate.fromMessages([
      {
          role: "system",
          content: [
              "You are InsightMapper, an expert that extracts consistent structured data as JSON.",
              "Always answer with VALID JSON using double quotes.",
              "Never add commentary, markdown, or surrounding text.",
              "If a field cannot be determined, output null for that field."
          ].join(" ")
      },
      {
          role: "user",
          content: [
              "Document type: {document_type}",
              "Target JSON schema:",
              "{json_schema}",
              "",
              "Unstructured text:",
              "{input}",
              "",
              "Return ONLY the JSON formatted according to the schema."
          ].join("\n")
      }
  ]);

  const chain = prompt.pipe(llm);

  const demoName = "InsightMapper JSON Extractor";
  const documentType = "customer support email";
  const schemaDefinition = `{
    "documentType": "string",
    "sender": "string",
    "recipient": "string",
    "contactInfo": "string",
    "subject": "string",
    "summary": "string",
    "sentiment": "one of: positive | neutral | negative",
    "actionItems": [
      {
        "owner": "string",
        "description": "string",
        "dueDate": "ISO 8601 date or null"
      }
    ],
    "priority": "one of: low | medium | high"
  }`;

  const messyInput = `Hey Support Team – just checking in.

  Zava Corp here (Amanda from Ops). Our order #49302 still hasn't shipped and the portal shows ''processing'' for 6 days. We promised our retail partner delivery by next Friday, so this is urgent.

  Can someone confirm:
  - When will it leave the warehouse?
  - Do we need to upgrade shipping to hit the deadline?

  Loop in Jessie if you need PO details. Please call me at 555-239-4433.

  Thanks!`;

  console.log(`\nRunning ${demoName}...`);

  chain.invoke({
      document_type: documentType,
      json_schema: schemaDefinition,
      input: messyInput
  }).then(aiMsg => {
      const rawContent = Array.isArray(aiMsg.content)
          ? aiMsg.content.map(part => typeof part === "string" ? part : part?.text ?? "").join("")
          : String(aiMsg.content);

      try {
          const parsed = JSON.parse(rawContent);
          console.log("\nStructured JSON Output:\n", JSON.stringify(parsed, null, 2));
      } catch (parseError) {
          console.warn("\nReceived non-JSON output, displaying raw content:");
          console.log(rawContent);
      }
  }).catch(err => {
      console.error("Error:", err);
  });