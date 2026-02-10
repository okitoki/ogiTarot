import fs from "node:fs";
import path from "node:path";

const DIST_DIR = path.resolve("dist");
const INDEX_PATH = path.join(DIST_DIR, "index.html");
const BASE_URL = "https://ogitarot-73c9d.web.app";
const PROJECT_ID = "ogitarot-73c9d";

const routes = [
  {
    path: "/",
    title: "오기타로 | 타로보기",
    description:
      "오키타로의 78장 타로 리딩. 카드설명, 스프레드, 타로정보를 확인해보세요.",
  },
  {
    path: "/cards",
    title: "카드설명 | 오기타로",
    description: "타로 카드별 의미와 해석을 확인하세요.",
  },
  {
    path: "/spreads",
    title: "스프레드 | 오기타로",
    description: "타로 스프레드 종류와 활용 방법을 확인하세요.",
  },
  {
    path: "/info",
    title: "타로정보 | 오기타로",
    description: "타로 기본 지식과 활용 가이드를 제공합니다.",
  },
];

function stripHtml(html = "") {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function updateHtml(html, { title, description, url, ogType = "website" }) {
  let out = html;
  out = out.replace(/<title>.*?<\/title>/s, `<title>${title}</title>`);

  const upsertMeta = (nameOrProp, value, isProp = false) => {
    const attr = isProp ? "property" : "name";
    const regex = new RegExp(`<meta[^>]*${attr}="${nameOrProp}"[^>]*>`);
    const tag = `<meta ${attr}="${nameOrProp}" content="${value}" />`;
    if (regex.test(out)) {
      out = out.replace(regex, tag);
    } else {
      out = out.replace(/<head>/, `<head>\n    ${tag}`);
    }
  };

  upsertMeta("description", description);
  upsertMeta("og:title", title, true);
  upsertMeta("og:description", description, true);
  upsertMeta("og:type", ogType, true);
  upsertMeta("og:url", url, true);

  const canonicalTag = `<link rel="canonical" href="${url}" />`;
  if (out.includes('rel="canonical"')) {
    out = out.replace(/<link[^>]*rel="canonical"[^>]*>/, canonicalTag);
  } else {
    out = out.replace(/<head>/, `<head>\n    ${canonicalTag}`);
  }

  return out;
}

function writeHtmlForRoute(baseHtml, route) {
  const url = `${BASE_URL}${route.path}`;
  const html = updateHtml(baseHtml, {
    title: route.title,
    description: route.description,
    url,
    ogType: route.ogType || "website",
  });

  const outDir = path.join(DIST_DIR, route.path === "/" ? "" : route.path);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "index.html"), html, "utf-8");
}

async function fetchPosts() {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/posts`,
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.documents || []).map((doc) => {
    const fields = doc.fields || {};
    const getString = (key) => fields[key]?.stringValue || "";
    return {
      id: doc.name.split("/").pop(),
      title: getString("title") || "(제목 없음)",
      category: getString("category") || "info",
      preview: getString("preview") || "",
      content: getString("content") || "",
    };
  });
}

async function run() {
  if (!fs.existsSync(INDEX_PATH)) {
    console.error("dist/index.html not found. Run build first.");
    process.exit(1);
  }

  const baseHtml = fs.readFileSync(INDEX_PATH, "utf-8");

  routes.forEach((route) => writeHtmlForRoute(baseHtml, route));

  const posts = await fetchPosts();
  posts.forEach((post) => {
    const basePath =
      post.category === "cards"
        ? "/cards"
        : post.category === "spread"
          ? "/spreads"
          : "/info";
    const description = stripHtml(post.preview || post.content).slice(0, 160);
    writeHtmlForRoute(baseHtml, {
      path: `${basePath}/${post.id}`,
      title: `${post.title} | 오기타로`,
      description: description || "오키타로 타로 해석",
      ogType: "article",
    });
  });
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
