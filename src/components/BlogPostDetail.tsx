import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  collection,
  deleteDoc,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";
import { db, storage } from "../firebase";

const SITE_URL = "https://ogitarot-73c9d.web.app";

function upsertMetaTag(
  selector: string,
  attrs: Record<string, string>,
  content: string,
) {
  let el = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    Object.entries(attrs).forEach(([key, value]) =>
      el?.setAttribute(key, value),
    );
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLinkTag(rel: string, href: string) {
  let el = document.head.querySelector(
    `link[rel="${rel}"]`,
  ) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

type BlogPost = {
  id: string;
  title: string;
  category?: string;
  preview?: string;
  content?: string;
  storagePath?: string;
  createdAt?: Date | null;
  likeCount?: number;
};

type BlogDetailProps = {
  title: string;
  category: "cards" | "spread" | "info";
  basePath: string;
  isAdmin?: boolean;
};

export default function BlogPostDetail({
  title,
  category,
  basePath,
  isAdmin,
}: BlogDetailProps) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [infoText, setInfoText] = useState<string | null>(null);
  const [likeCount, setLikeCount] = useState<number>(0);
  const [liked, setLiked] = useState<boolean>(false);

  useEffect(() => {
    if (!id) return;

    const unsubscribe = onSnapshot(
      doc(db, "posts", id),
      (snap) => {
        if (!snap.exists()) {
          setPost(null);
          return;
        }
        const data = snap.data() as {
          title?: string;
          category?: string;
          preview?: string;
          content?: string;
          storagePath?: string;
          createdAt?: { toDate?: () => Date } | null;
          likeCount?: number;
        };

        setPost({
          id: snap.id,
          title: data.title ?? "(제목 없음)",
          category: data.category ?? "",
          preview: data.preview ?? "",
          content: data.content ?? "",
          storagePath: data.storagePath ?? "",
          createdAt: data.createdAt?.toDate?.() ?? null,
          likeCount: data.likeCount ?? 0,
        });
        setLikeCount(data.likeCount ?? 0);
      },
      (e) => {
        const message = e instanceof Error ? e.message : "Unknown error";
        setErrorText(message);
      },
    );

    return () => unsubscribe();
  }, [id]);

  useEffect(() => {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const items: BlogPost[] = snap.docs.map((docItem) => {
          const data = docItem.data() as {
            title?: string;
            category?: string;
            preview?: string;
            content?: string;
            storagePath?: string;
            createdAt?: { toDate?: () => Date } | null;
            likeCount?: number;
          };

          return {
            id: docItem.id,
            title: data.title ?? "(제목 없음)",
            category: data.category ?? "",
            preview: data.preview ?? "",
            content: data.content ?? "",
            storagePath: data.storagePath ?? "",
            createdAt: data.createdAt?.toDate?.() ?? null,
            likeCount: data.likeCount ?? 0,
          };
        });

        setPosts(items);
      },
      (e) => {
        const message = e instanceof Error ? e.message : "Unknown error";
        setErrorText(message);
      },
    );

    return () => unsubscribe();
  }, []);

  const neighbors = useMemo(() => {
    if (!id || posts.length === 0) return { prev: null, next: null };
    const filtered = posts.filter((p) => {
      if (!p.category) return category === "info";
      return p.category === category;
    });
    const index = filtered.findIndex((p) => p.id === id);
    if (index === -1) return { prev: null, next: null };

    const next = index > 0 ? filtered[index - 1] : null; // newer
    const prev = index < filtered.length - 1 ? filtered[index + 1] : null; // older

    return { prev, next };
  }, [id, posts, category]);

  useEffect(() => {
    if (!post) return;
    const basePath =
      category === "cards"
        ? "/cards"
        : category === "spread"
          ? "/spreads"
          : "/info";
    const url = `${SITE_URL}${basePath}/${post.id}`;
    const titleText = `${post.title} | 오기타로`;
    const description = (post.preview || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);

    document.title = titleText;
    upsertMetaTag(
      "meta[name=description]",
      { name: "description" },
      description,
    );
    upsertMetaTag(
      "meta[property='og:title']",
      { property: "og:title" },
      titleText,
    );
    upsertMetaTag(
      "meta[property='og:description']",
      { property: "og:description" },
      description,
    );
    upsertMetaTag(
      "meta[property='og:type']",
      { property: "og:type" },
      "article",
    );
    upsertMetaTag("meta[property='og:url']", { property: "og:url" }, url);
    upsertLinkTag("canonical", url);
  }, [post, category]);

  useEffect(() => {
    if (!post?.id) return;
    const key = `post-like:${post.id}`;
    setLiked(window.localStorage.getItem(key) === "1");
  }, [post?.id]);

  useEffect(() => {
    if (!infoText) return;
    const timer = window.setTimeout(() => setInfoText(null), 2000);
    return () => window.clearTimeout(timer);
  }, [infoText]);

  useEffect(() => {
    if (!errorText) return;
    const timer = window.setTimeout(() => setErrorText(null), 3000);
    return () => window.clearTimeout(timer);
  }, [errorText]);

  const handleLike = async () => {
    if (!post) return;
    const key = `post-like:${post.id}`;
    const delta = liked ? -1 : 1;
    setLiked(!liked);
    setLikeCount((prev) => Math.max(0, prev + delta));
    setInfoText(null);

    try {
      await updateDoc(doc(db, "posts", post.id), {
        likeCount: increment(delta),
      });
      if (liked) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, "1");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setLiked(liked);
      setLikeCount((prev) => Math.max(0, prev - delta));
      setInfoText(null);
      setErrorText(`좋아요 실패: ${message}`);
    }
  };

  const handleShare = async () => {
    if (!post) return;
    const shareUrl = `${SITE_URL}${basePath}/${post.id}`;
    const shareText = (post.preview || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);

    try {
      if (navigator.share) {
        await navigator.share({
          title: post.title,
          text: shareText,
          url: shareUrl,
        });
        setInfoText("공유했어요.");
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setInfoText("링크를 복사했어요.");
        return;
      }
      window.prompt("아래 링크를 복사해 주세요.", shareUrl);
    } catch (e) {
      setInfoText(null);
    }
  };

  const handleDelete = async () => {
    if (!isAdmin || !post) return;
    const ok = window.confirm(
      "이 글을 삭제할까요? 삭제 후 복구할 수 없습니다.",
    );
    if (!ok) return;

    try {
      if (post.storagePath) {
        await deleteObject(ref(storage, post.storagePath));
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setErrorText(`스토리지 삭제 실패: ${message}`);
    }

    try {
      await deleteDoc(doc(db, "posts", post.id));
      navigate(basePath);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setErrorText(`문서 삭제 실패: ${message}`);
    }
  };

  return (
    <section style={{ marginTop: 24 }}>
      <div style={{ marginBottom: 10, fontSize: 13, opacity: 0.7 }}>
        <Link to={basePath} style={{ textDecoration: "none", color: "#111" }}>
          ← {title} 목록
        </Link>
      </div>

      {errorText && (
        <div
          style={{
            color: "#b00020",
            background: "#fff5f5",
            border: "1px solid #ffd7d7",
            borderRadius: 12,
            padding: 12,
            fontSize: 13,
            marginBottom: 10,
            animation: "toast-fade 3s ease-in-out forwards",
            willChange: "opacity, transform",
          }}
        >
          {errorText}
        </div>
      )}

      {infoText && (
        <div
          style={{
            color: "#0f5132",
            background: "#e7f6ed",
            border: "1px solid #c8eed6",
            borderRadius: 12,
            padding: 10,
            fontSize: 13,
            marginBottom: 10,
            animation: "toast-fade 2s ease-in-out forwards",
            willChange: "opacity, transform",
          }}
        >
          {infoText}
        </div>
      )}

      {!post ? (
        <div style={{ fontSize: 14, opacity: 0.7 }}>글을 찾을 수 없습니다.</div>
      ) : (
        <div
          style={{
            border: "1px solid #eee",
            borderRadius: 16,
            padding: 16,
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1 style={{ fontWeight: 900, fontSize: 20, flex: 1, margin: 0 }}>
              {post.title}
            </h1>
            {isAdmin && (
              <div style={{ display: "flex", gap: 6 }}>
                <Link
                  to={`/admin?edit=${post.id}`}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 8,
                    border: "1px solid #ddd",
                    textDecoration: "none",
                    fontSize: 12,
                    color: "#111",
                  }}
                >
                  수정
                </Link>
                <button
                  onClick={handleDelete}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 8,
                    border: "1px solid #ffd7d7",
                    background: "#fff5f5",
                    fontSize: 12,
                    color: "#b00020",
                    cursor: "pointer",
                  }}
                >
                  삭제
                </button>
              </div>
            )}
          </div>
          <div style={{ fontSize: 12, opacity: 0.6 }}>
            {post.createdAt
              ? post.createdAt.toLocaleString()
              : "작성 시간 확인 중"}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={handleLike}
              aria-pressed={liked}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: liked ? "1px solid #111" : "1px solid #ddd",
                background: liked ? "#111" : "#fff",
                color: liked ? "#fff" : "#111",
                fontSize: 12,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span style={{ display: "flex", alignItems: "center" }}>
                {liked ? (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 20 20"
                    fill="#e74c3c"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M10 17.5l-1.45-1.32C4.4 12.36 2 10.28 2 7.5 2 5.5 3.5 4 5.5 4c1.54 0 3.04 1.04 3.57 2.36h1.87C11.46 5.04 12.96 4 14.5 4 16.5 4 18 5.5 18 7.5c0 2.78-2.4 4.86-6.55 8.68L10 17.5z" />
                  </svg>
                ) : (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="#e74c3c"
                    strokeWidth="2"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M10 17.5l-1.45-1.32C4.4 12.36 2 10.28 2 7.5 2 5.5 3.5 4 5.5 4c1.54 0 3.04 1.04 3.57 2.36h1.87C11.46 5.04 12.96 4 14.5 4 16.5 4 18 5.5 18 7.5c0 2.78-2.4 4.86-6.55 8.68L10 17.5z" />
                  </svg>
                )}
              </span>
              좋아요 {likeCount}
            </button>
            <button
              onClick={handleShare}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid #ddd",
                background: "#fff",
                color: "#111",
                fontSize: 12,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span style={{ display: "flex", alignItems: "center" }}>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="#3498db"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle cx="15" cy="5" r="3" />
                  <circle cx="5" cy="10" r="3" />
                  <circle cx="15" cy="15" r="3" />
                  <line x1="7.5" y1="9" x2="12.5" y2="6" />
                  <line x1="7.5" y1="11" x2="12.5" y2="14" />
                </svg>
              </span>
              공유하기
            </button>
          </div>
          <div
            style={{ lineHeight: 1.7, textAlign: "left" }}
            dangerouslySetInnerHTML={{
              __html: post.content || post.preview || "내용이 없습니다.",
            }}
          />
        </div>
      )}

      <div
        style={{
          marginTop: 16,
          border: "1px solid #eee",
          borderRadius: 16,
          padding: 14,
          display: "grid",
          gap: 10,
        }}
      >
        <div style={{ display: "grid", gap: 8 }}>
          {neighbors.prev ? (
            <Link
              to={`${basePath}/${neighbors.prev.id}`}
              style={{ textDecoration: "none", color: "#111" }}
            >
              이전글: {neighbors.prev.title}
            </Link>
          ) : (
            <div style={{ fontSize: 13, opacity: 0.5 }}>이전글 없음</div>
          )}
          {neighbors.next ? (
            <Link
              to={`${basePath}/${neighbors.next.id}`}
              style={{ textDecoration: "none", color: "#111" }}
            >
              다음글: {neighbors.next.title}
            </Link>
          ) : (
            <div style={{ fontSize: 13, opacity: 0.5 }}>다음글 없음</div>
          )}
        </div>
      </div>
    </section>
  );
}
