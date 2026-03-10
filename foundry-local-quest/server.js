import http from "http";
import fs from "fs";
import path from "path";
import { FoundryLocalManager } from "foundry-local-sdk";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";

const alias = "phi-3.5-mini";
let chain;

// Initialize on startup
(async () => {
  const foundryLocalManager = new FoundryLocalManager();
  const modelInfo = await foundryLocalManager.init(alias);
  console.log(`✓ Model: ${modelInfo.id} | Endpoint: ${foundryLocalManager.endpoint}`);

  const llm = new ChatOpenAI({
    model: modelInfo.id,
    configuration: { baseURL: foundryLocalManager.endpoint, apiKey: foundryLocalManager.apiKey },
    temperature: 0.6,
    streaming: false,
    maxTokens: 5000
  });

  const prompt = ChatPromptTemplate.fromMessages([
    {
      role: "system",
      content: "You are InsightMapper. Always answer with VALID JSON using double quotes. Never add commentary or markdown. If a field cannot be determined, use null."
    },
    {
      role: "user",
      content: "Document type: {document_type}\nTarget JSON schema:\n{json_schema}\n\nUnstructured text:\n{input}\n\nReturn ONLY the JSON formatted according to the schema."
    }
  ]);

  chain = prompt.pipe(llm);

  // Start combined server
  const PORT = 3000;
  const CLIENT_FILE = path.join(process.cwd(), "client.html");
  
  const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    // Serve static HTML file
    if ((req.url === "/" || req.url === "/client.html") && req.method === "GET") {
      fs.readFile(CLIENT_FILE, "utf8", (err, data) => {
        if (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Error loading client.html" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(data);
      });
      return;
    }

    // API endpoint
    res.setHeader("Content-Type", "application/json");

    if (req.method === "POST" && req.url === "/extract") {
      let body = "";
      req.on("data", chunk => body += chunk);
      req.on("end", async () => {
        try {
          console.log("Request body length:", body.length);
          const payload = JSON.parse(body);
          const { document_type, json_schema, input } = payload;
          if (!document_type || !json_schema || !input) {
            return res.writeHead(400).end(JSON.stringify({ error: "Missing fields: document_type, json_schema, input" }));
          }

          console.log("Invoking chain...");
          const aiMsg = await chain.invoke({ document_type, json_schema, input });
          let rawContent = Array.isArray(aiMsg.content)
            ? aiMsg.content.map(p => typeof p === "string" ? p : p?.text ?? "").join("")
            : String(aiMsg.content);

          rawContent = rawContent.trim();
          // Extract JSON: find opening { and closing }
          const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error("No JSON found in response");
          
          const jsonStr = jsonMatch[0];
          console.log("Extracted JSON:", jsonStr.substring(0, 150));
          const parsed = JSON.parse(jsonStr);
          res.writeHead(200).end(JSON.stringify(parsed));
        } catch (err) {
          console.error("Error:", err.message);
          res.writeHead(500).end(JSON.stringify({ error: err.message }));
        }
      });
    } else {
      res.writeHead(404).end(JSON.stringify({ error: "Not found. Use GET / or POST /extract" }));
    }
  });

  server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📄 UI:  http://localhost:${PORT}`);
    console.log(`🔌 API: POST http://localhost:${PORT}/extract`);
  });
})();
