import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
} from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";
import { db, storage } from "../firebase";

type BlogPost = {
  id: string;
  title: string;
  storagePath: string;
  category?: string;
  preview?: string;
  createdAt?: Date | null;
  content?: string;
  viewCount?: number;
};

type BlogProps = {
  title: string;
  category: "cards" | "spread" | "info";
  basePath: string;
  isAdmin?: boolean;
};

export default function Blog({
  title,
  category,
  basePath,
  isAdmin,
}: BlogProps) {
  const [errorText, setErrorText] = useState<string | null>(null);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [sortMode, setSortMode] = useState<"recent" | "oldest" | "popular">(
    "recent",
  );
  const [lastDoc, setLastDoc] = useState<
    import("firebase/firestore").QueryDocumentSnapshot | null
  >(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const fetchMore = useCallback(async () => {
    if (isLoading || !hasMore) return;
    setIsLoading(true);
    try {
      const baseQuery = query(
        collection(db, "posts"),
        orderBy("createdAt", "desc"),
        limit(10),
      );
      const nextQuery = lastDoc
        ? query(baseQuery, startAfter(lastDoc))
        : baseQuery;
      const snap = await getDocs(nextQuery);
      const items: BlogPost[] = snap.docs.map((doc) => {
        const data = doc.data() as {
          title?: string;
          storagePath?: string;
          category?: string;
          preview?: string;
          content?: string;
          createdAt?: { toDate?: () => Date } | null;
        };

        return {
          id: doc.id,
          title: data.title ?? "(제목 없음)",
          storagePath: data.storagePath ?? "",
          category: data.category ?? "",
          preview: data.preview ?? "",
          content: data.content ?? "",
          createdAt: data.createdAt?.toDate?.() ?? null,
        };
      });

      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const next = [...prev];
        for (const item of items) {
          if (!seen.has(item.id)) {
            seen.add(item.id);
            next.push(item);
          }
        }
        return next;
      });
      const last = snap.docs[snap.docs.length - 1] ?? null;
      setLastDoc(last);
      if (snap.docs.length < 10) setHasMore(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setErrorText(message);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, hasMore, lastDoc]);

  useEffect(() => {
    void fetchMore();
  }, [fetchMore]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void fetchMore();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchMore]);

  const sortedPosts = useMemo(() => {
    const filtered = posts.filter((post) => {
      if (!post.category) return category === "info";
      return post.category === category;
    });
    const withDate = (post: BlogPost) => post.createdAt?.getTime?.() ?? 0;
    if (sortMode === "oldest") {
      return [...filtered].sort((a, b) => withDate(a) - withDate(b));
    }
    if (sortMode === "popular") {
      return [...filtered].sort(
        (a, b) =>
          (b.viewCount ?? 0) - (a.viewCount ?? 0) || withDate(b) - withDate(a),
      );
    }
    return [...filtered].sort((a, b) => withDate(b) - withDate(a));
  }, [posts, category, sortMode]);

  const descriptionMap: Record<BlogProps["category"], string> = {
    cards: "타로 카드별 의미와 해석을 확인하세요.",
    spread: "스프레드 종류와 활용 방법을 정리해두었습니다.",
    info: "타로 기본 지식과 활용 팁을 확인하세요.",
  };

  const handleDelete = async (post: BlogPost) => {
    if (!isAdmin) return;
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
      const code = (e as { code?: string })?.code;
      if (code !== "storage/object-not-found") {
        setErrorText(`스토리지 삭제 실패: ${message}`);
      }
    }

    try {
      await deleteDoc(doc(db, "posts", post.id));
      setPosts((prev) => prev.filter((item) => item.id !== post.id));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setErrorText(`문서 삭제 실패: ${message}`);
    }
  };

  return (
    <section style={{ marginTop: 24 }}>
      <h1 style={{ margin: "0 0 10px", fontSize: 20, textAlign: "left" }}>
        {title}
      </h1>
      <div
        style={{
          fontSize: 14,
          opacity: 0.7,
          marginBottom: 10,
          textAlign: "left",
        }}
      >
        {descriptionMap[category]}
      </div>

      <div style={{ marginTop: 16 }}>
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
            }}
          >
            {errorText}
          </div>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 8,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: 14, opacity: 0.8, display: "flex", gap: 8 }}>
            <span style={{ fontSize: 12, opacity: 0.6 }}>
              작성된 글 {sortedPosts.length}개
            </span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {(
              [
                { key: "recent", label: "최근글" },
                { key: "oldest", label: "오래된 글" },
                { key: "popular", label: "인기글" },
              ] as const
            ).map((item) => (
              <button
                key={item.key}
                onClick={() => setSortMode(item.key)}
                style={{
                  padding: "4px 8px",
                  borderRadius: 8,
                  border: "1px solid #ddd",
                  background: sortMode === item.key ? "#111" : "white",
                  color: sortMode === item.key ? "white" : "#111",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {sortedPosts.length === 0 && !isLoading && !hasMore ? (
          <div style={{ fontSize: 13, opacity: 0.6 }}>
            아직 작성된 글이 없습니다.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {sortedPosts.map((post) => (
              <div
                key={post.id}
                style={{
                  border: "1px solid #eee",
                  borderRadius: 16,
                  padding: 14,
                  display: "grid",
                  gap: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Link
                    to={`${basePath}/${post.id}`}
                    style={{
                      fontWeight: 900,
                      textDecoration: "none",
                      color: "#111",
                      flex: 1,
                      textAlign: "left",
                    }}
                  >
                    {post.title}
                  </Link>
                  <div style={{ fontSize: 12, opacity: 0.6 }}>
                    {post.createdAt
                      ? post.createdAt.toLocaleString()
                      : "작성 시간 확인 중"}
                  </div>
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
                        onClick={() => handleDelete(post)}
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
              </div>
            ))}
            <div ref={sentinelRef} style={{ height: 1 }} />
            {isLoading && (
              <div style={{ fontSize: 12, opacity: 0.6 }}>불러오는 중…</div>
            )}
            {/* {!hasMore && (
              <div style={{ fontSize: 12, opacity: 0.5 }}>
                더 이상 글이 없습니다.
              </div>
            )} */}
          </div>
        )}
      </div>
    </section>
  );
}
