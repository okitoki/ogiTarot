import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import ReactMarkdown from "react-markdown";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  startAfter,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../firebase";

type ReadRecord = {
  id: string;
  topic: string;
  drawCount: number;
  provider: string;
  createdAt?: Timestamp | null;
  cards: { name: string; reversed: boolean }[];
  resultText?: string;
};

export default function MyPage() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [photoURL, setPhotoURL] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [records, setRecords] = useState<ReadRecord[]>([]);
  const [openResults, setOpenResults] = useState<Set<string>>(new Set());
  const [vow, setVow] = useState("");
  const [vowDraft, setVowDraft] = useState("");
  const [isEditingVow, setIsEditingVow] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<
    import("firebase/firestore").QueryDocumentSnapshot | null
  >(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const fetchMore = useCallback(async () => {
    if (!userId || isLoading || !hasMore) return;
    setIsLoading(true);
    try {
      const baseQuery = query(
        collection(db, "users", userId, "reads"),
        orderBy("createdAt", "desc"),
        limit(10),
      );
      const nextQuery = lastDoc
        ? query(baseQuery, startAfter(lastDoc))
        : baseQuery;
      const snap = await getDocs(nextQuery);
      const next: ReadRecord[] = snap.docs.map((doc) => {
        const data = doc.data() as Omit<ReadRecord, "id">;
        return { id: doc.id, ...data } as ReadRecord;
      });
      setRecords((prev) => [...prev, ...next]);
      const last = snap.docs[snap.docs.length - 1] ?? null;
      setLastDoc(last);
      if (snap.docs.length < 10) setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  }, [userId, isLoading, hasMore, lastDoc]);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setUserEmail(user?.email ?? null);
      setDisplayName(user?.displayName ?? null);
      setPhotoURL(user?.photoURL ?? null);
      setUserId(user?.uid ?? null);

      if (!user) {
        setRecords([]);
        setLastDoc(null);
        setHasMore(true);
        setOpenResults(new Set());
        setVow("");
        setVowDraft("");
        return;
      }
      setRecords([]);
      setLastDoc(null);
      setHasMore(true);
      setOpenResults(new Set());
    });

    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!userId) return;
    const unsub = onSnapshot(doc(db, "users", userId), (snap) => {
      const data = snap.data() as { vow?: string } | undefined;
      const nextVow = data?.vow ?? "";
      setVow(nextVow);
      setVowDraft(nextVow);
      setIsEditingVow(nextVow.length === 0);
    });
    return () => unsub();
  }, [userId]);

  useEffect(() => {
    if (userId) {
      void fetchMore();
    }
  }, [userId, fetchMore]);

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

  const handleDelete = async (recordId: string) => {
    if (!userId) return;
    const ok = window.confirm("이 기록을 삭제할까요?");
    if (!ok) return;
    await deleteDoc(doc(db, "users", userId, "reads", recordId));
  };

  const handleSaveVow = async () => {
    if (!userId) return;
    await setDoc(
      doc(db, "users", userId),
      { vow: vowDraft.trim() },
      { merge: true },
    );
    setIsEditingVow(false);
  };

  const toggleResult = (recordId: string) => {
    setOpenResults((prev) => {
      const next = new Set(prev);
      if (next.has(recordId)) {
        next.delete(recordId);
      } else {
        next.add(recordId);
      }
      return next;
    });
  };

  const profileInitials = useMemo(() => {
    const base = displayName || userEmail || "?";
    return base.slice(0, 2).toUpperCase();
  }, [displayName, userEmail]);

  if (!userEmail) {
    return (
      <div
        style={{
          maxWidth: 720,
          margin: "24px auto",
          padding: 20,
          border: "1px solid #eee",
          borderRadius: 16,
          background: "white",
        }}
      >
        <h1 style={{ margin: "0 0 8px", fontSize: 20 }}>나의 페이지</h1>
        <p style={{ margin: "0 0 12px", fontSize: 14, opacity: 0.7 }}>
          로그인이 필요합니다.
        </p>
        <NavLink
          to="/login"
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #111",
            background: "#111",
            color: "white",
            textDecoration: "none",
            fontSize: 14,
          }}
        >
          로그인 / 회원가입
        </NavLink>
      </div>
    );
  }

  return (
    <div style={{ margin: "24px auto" }}>
      <style>{`
        .my-result-markdown h1,
        .my-result-markdown h2,
        .my-result-markdown h3 {
          margin: 14px 0 8px;
          line-height: 1.3;
        }
        .my-result-markdown h1 { font-size: 18px; }
        .my-result-markdown h2 { font-size: 16px; }
        .my-result-markdown h3 { font-size: 14px; }
        .my-result-markdown p { margin: 6px 0; }
        .my-result-markdown ul,
        .my-result-markdown ol {
          margin: 6px 0 6px 18px;
          padding: 0;
        }
        .my-result-markdown li { margin: 4px 0; }
        .my-result-markdown hr { border: none; border-top: 1px solid #e5e5e5; margin: 12px 0; }
        .my-result-markdown blockquote {
          margin: 8px 0;
          padding: 8px 10px;
          border-left: 3px solid #e5e5e5;
          background: #f7f7f7;
          border-radius: 8px;
          color: #555;
        }
      `}</style>
      <h1 style={{ margin: "0 0 12px", fontSize: 20 }}>나의 페이지</h1>

      <div
        style={{
          display: "flex",
          gap: 16,
          alignItems: "center",
          padding: 16,
          borderRadius: 16,
          border: "1px solid #eee",
          background: "white",
          marginBottom: 16,
        }}
      >
        {photoURL ? (
          <img
            src={photoURL}
            alt="profile"
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: "#111",
              color: "white",
              display: "grid",
              placeItems: "center",
              fontWeight: 900,
            }}
          >
            {profileInitials}
          </div>
        )}
        <div>
          <div style={{ fontSize: 16, fontWeight: 900 }}>
            {displayName || "사용자"}
          </div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>{userEmail}</div>
        </div>
      </div>

      <div
        style={{
          border: "1px solid #eee",
          borderRadius: 16,
          padding: 16,
          background: "white",
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 8 }}>
          한줄 다짐
        </div>
        {!isEditingVow && vow && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{vow}</div>
            <button
              onClick={() => setIsEditingVow(true)}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: "white",
                cursor: "pointer",
                fontSize: 13,
              }}
              aria-label="다짐 수정"
            >
              ✏️
            </button>
          </div>
        )}
        {(isEditingVow || !vow) && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              value={vowDraft}
              onChange={(e) => setVowDraft(e.target.value)}
              placeholder="오늘의 다짐을 적어주세요"
              style={{
                flex: "1 1 240px",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #ddd",
                fontSize: 14,
              }}
            />
            <button
              onClick={handleSaveVow}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #111",
                background: "#111",
                color: "white",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              저장
            </button>
          </div>
        )}
      </div>

      <div
        style={{
          border: "1px solid #eee",
          borderRadius: 16,
          padding: 16,
          background: "white",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 12 }}>
          내가 뽑은 카드 기록
        </div>

        {records.length === 0 ? (
          <div style={{ fontSize: 14, opacity: 0.7 }}>
            아직 기록이 없습니다.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {records.map((record) => {
              const date = record.createdAt?.toDate?.()?.toLocaleString() ?? "";
              return (
                <div
                  key={record.id}
                  style={{
                    border: "1px solid #eee",
                    borderRadius: 14,
                    padding: 12,
                    background: "#fafafa",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700 }}>
                      {record.topic || "(주제 없음)"}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {record.resultText && (
                        <button
                          onClick={() => toggleResult(record.id)}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 10,
                            border: "1px solid #ddd",
                            background: "white",
                            cursor: "pointer",
                            fontSize: 12,
                          }}
                        >
                          {openResults.has(record.id)
                            ? "결과 닫기"
                            : "결과 보기"}
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(record.id)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 10,
                          border: "1px solid #ddd",
                          background: "white",
                          cursor: "pointer",
                          fontSize: 12,
                          color: "#b00020",
                        }}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
                    {date} · {record.drawCount}장 · {record.provider}
                  </div>
                  {record.resultText && openResults.has(record.id) && (
                    <div
                      className="my-result-markdown"
                      style={{
                        marginTop: 8,
                        fontSize: 14,
                        lineHeight: 1.6,
                        background:
                          "linear-gradient(180deg, rgba(250,250,250,0.9) 0%, #ffffff 35%)",
                        border: "1px solid #eee",
                        borderRadius: 14,
                        padding: 12,
                        boxShadow: "0 8px 20px rgba(0,0,0,0.06)",
                      }}
                    >
                      <ReactMarkdown>{record.resultText}</ReactMarkdown>
                    </div>
                  )}
                  <div
                    style={{
                      marginTop: 8,
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 6,
                      fontSize: 12,
                    }}
                  >
                    {record.cards.map((card, idx) => (
                      <span
                        key={`${record.id}-${idx}`}
                        style={{
                          padding: "4px 8px",
                          borderRadius: 999,
                          border: "1px solid #e5e5e5",
                          background: "white",
                        }}
                      >
                        {card.name}
                        {card.reversed ? " (역위)" : ""}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
            <div ref={sentinelRef} style={{ height: 1 }} />
            {isLoading && (
              <div style={{ fontSize: 12, opacity: 0.6 }}>불러오는 중…</div>
            )}
            {!hasMore && (
              <div style={{ fontSize: 12, opacity: 0.5 }}>
                더 이상 기록이 없습니다.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
