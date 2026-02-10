const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { auth } = require("firebase-functions/v1");
const { defineSecret, defineString } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { VertexAI } = require("@google-cloud/vertexai");

admin.initializeApp();

const adminEmailsParam = defineString("ADMIN_EMAILS");
const githubRepoParam = defineString("GITHUB_REPO");
const githubWorkflowParam = defineString("GITHUB_WORKFLOW");
const githubBranchParam = defineString("GITHUB_BRANCH");
const githubTokenSecret = defineSecret("GITHUB_TOKEN");

const getAdminEmailList = () => {
  return (adminEmailsParam.value() || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
};

const isAdminEmail = (email) => {
  if (!email) return false;
  return getAdminEmailList().includes(String(email).toLowerCase());
};

exports.onUserCreatedSetAdmin = auth.user().onCreate(async (user) => {
  if (!user?.email) return;
  if (!isAdminEmail(user.email)) return;
  await admin.auth().setCustomUserClaims(user.uid, { admin: true });
});

exports.triggerDeployOnPostCreate = onDocumentCreated(
  {
    document: "posts/{postId}",
    secrets: [githubTokenSecret],
  },
  async () => {
    const repo = githubRepoParam.value();
    const workflow = githubWorkflowParam.value();
    const ref = githubBranchParam.value() || "main";
    const token = githubTokenSecret.value();

    if (!repo || !workflow || !token) return;

    const url = `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ ref }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`GitHub dispatch failed: ${res.status} ${text}`);
    }
  },
);

exports.syncAdminClaims = onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.set("Access-Control-Max-Age", "3600");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    res.status(401).json({ error: "Missing auth token" });
    return;
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const email = decoded.email || "";
    const shouldBeAdmin = isAdminEmail(email);

    await admin.auth().setCustomUserClaims(decoded.uid, {
      admin: shouldBeAdmin,
    });

    res.json({ admin: shouldBeAdmin });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(401).json({ error: message });
  }
});

exports.interpret = onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const project =
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT;
  const location = process.env.VERTEX_AI_LOCATION || "us-central1";

  if (!project) {
    res.status(500).json({ error: "GCP project is not set" });
    return;
  }

  try {
    const { prompt, provider } = req.body ?? {};

    if (!prompt || typeof prompt !== "string") {
      res.status(400).json({ error: "Invalid prompt" });
      return;
    }

    if (provider === "openai") {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        res.status(500).json({ error: "OPENAI_API_KEY is not set" });
        return;
      }

      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
          input: prompt,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        res
          .status(500)
          .json({ error: `OpenAI request failed: ${response.status} ${text}` });
        return;
      }

      const data = await response.json();
      const outputText =
        data?.output_text ??
        (Array.isArray(data?.output)
          ? data.output
              .flatMap((o) => o?.content ?? [])
              .filter((c) => c?.type === "output_text")
              .map((c) => c?.text ?? "")
              .join("\n")
          : "");

      if (!outputText) {
        res.status(500).json({ error: "No output_text in response" });
        return;
      }

      res.json({ text: outputText });
      return;
    }

    const vertexAI = new VertexAI({ project, location });
    const modelEnv = process.env.VERTEX_AI_MODEL || "";
    const modelCandidates = [
      ...modelEnv
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean),
      "gemini-1.5-flash-002",
      "gemini-1.5-flash-001",
      "gemini-2.0-flash",
    ];

    let outputText = "";
    let lastError = null;

    for (const modelName of modelCandidates) {
      try {
        const model = vertexAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
          },
        });

        const candidates = result?.response?.candidates ?? [];
        outputText = candidates
          .flatMap((c) => c?.content?.parts ?? [])
          .map((p) => p?.text ?? "")
          .join("")
          .trim();

        if (outputText) break;
      } catch (err) {
        lastError = err;
        const message = err instanceof Error ? err.message : String(err);
        if (!message.includes("404") && !message.includes("NOT_FOUND")) {
          throw err;
        }
      }
    }

    if (!outputText) {
      const message =
        lastError instanceof Error
          ? lastError.message
          : "No output_text in response";
      res.status(500).json({ error: message });
      return;
    }

    res.json({ text: outputText });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

exports.sitemap = onRequest(async (_req, res) => {
  try {
    const snap = await admin.firestore().collection("posts").get();
    const base = "https://ogitarot-73c9d.web.app";
    const staticUrls = ["/", "/cards", "/spreads", "/info"];

    const postUrls = snap.docs.map((doc) => {
      const data = doc.data() || {};
      const category = data.category || "info";
      const basePath =
        category === "cards"
          ? "/cards"
          : category === "spread"
            ? "/spreads"
            : "/info";
      return `${basePath}/${doc.id}`;
    });

    const urls = [...staticUrls, ...postUrls];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((path) => `  <url><loc>${base}${path}</loc></url>`).join("\n")}
</urlset>`;

    res.set("Content-Type", "application/xml; charset=utf-8");
    res.status(200).send(xml);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});
