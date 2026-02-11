import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";

type Suit = "Wands" | "Cups" | "Swords" | "Pentacles";
type Arcana = "Major" | "Minor";

type TarotCard = {
  id: string;
  arcana: Arcana;
  name: string;
  suit?: Suit;
  rank?: string;
};

type PickedCard = {
  card: TarotCard;
  reversed: boolean;
};

function buildTarotDeck78(): TarotCard[] {
  const majorNames = [
    "The Fool",
    "The Magician",
    "The High Priestess",
    "The Empress",
    "The Emperor",
    "The Hierophant",
    "The Lovers",
    "The Chariot",
    "Strength",
    "The Hermit",
    "Wheel of Fortune",
    "Justice",
    "The Hanged Man",
    "Death",
    "Temperance",
    "The Devil",
    "The Tower",
    "The Star",
    "The Moon",
    "The Sun",
    "Judgement",
    "The World",
  ];

  const majors: TarotCard[] = majorNames.map((name, i) => ({
    id: `M-${i}`,
    arcana: "Major",
    name,
  }));

  const suits: Suit[] = ["Wands", "Cups", "Swords", "Pentacles"];
  const minorRanks = [
    "Ace",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "Page",
    "Knight",
    "Queen",
    "King",
  ];

  const minors: TarotCard[] = suits.flatMap((suit) =>
    minorRanks.map((rank) => ({
      id: `m-${suit}-${rank}`,
      arcana: "Minor",
      suit,
      rank,
      name: `${rank} of ${suit}`,
    })),
  );

  return [...majors, ...minors];
}

/** ===== Seeded RNG (Mulberry32) ===== */
function xmur3(str: string) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSeededRng(seedStr: string) {
  const seedFn = xmur3(seedStr);
  const seed = seedFn();
  return mulberry32(seed);
}

function randomSeedString() {
  const buf = new Uint32Array(4);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((n) => n.toString(16).padStart(8, "0"))
    .join("-");
}

function shuffleSeeded<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function uiBtn(primary?: boolean): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #ddd",
    background: primary ? "#111" : "white",
    color: primary ? "white" : "#111",
    cursor: "pointer",
  };
}

function getCardImageUrl(card: TarotCard) {
  // ===== Major Arcana =====
  if (card.arcana === "Major") {
    // id: "M-0" ~ "M-21"
    const index = Number(card.id.split("-")[1] ?? 0);

    const majorNames = [
      "TheFool",
      "TheMagician",
      "TheHighPriestess",
      "TheEmpress",
      "TheEmperor",
      "TheHierophant",
      "TheLovers",
      "TheChariot",
      "Strength",
      "TheHermit",
      "WheelOfFortune",
      "Justice",
      "TheHangedMan",
      "Death",
      "Temperance",
      "TheDevil",
      "TheTower",
      "TheStar",
      "TheMoon",
      "TheSun",
      "Judgement",
      "TheWorld",
    ];

    const number = String(index).padStart(2, "0");
    const name = majorNames[index] ?? "Unknown";

    return `/cards/${number}-${name}.png`;
  }

  // ===== Minor Arcana =====
  // suit: Cups | Pentacles | Swords | Wands
  const suit = card.suit ?? "";

  const rankRaw = card.rank ?? "";

  // 숫자 카드
  if (/^\d+$/.test(rankRaw)) {
    const num = String(rankRaw).padStart(2, "0");
    return `/cards/${suit}${num}.png`;
  }

  // Court cards
  const courtMap: Record<string, string> = {
    Ace: "01", // ← Ace를 01로 쓰는 경우
    Page: "11",
    Knight: "12",
    Queen: "13",
    King: "14",
  };

  const mapped = courtMap[rankRaw];

  if (!mapped) {
    return ""; // fallback
  }

  // Ace는 Cups01 처럼 숫자 처리
  if (mapped === "01") {
    return `/cards/${suit}01.png`;
  }

  return `/cards/${suit}${mapped}.png`;
}

function splitMarkdownSections(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const sections: { title: string; content: string }[] = [];
  let currentTitle = "";
  let buffer: string[] = [];

  const pushSection = () => {
    if (!currentTitle && buffer.length === 0) return;
    sections.push({
      title: currentTitle || "결과",
      content: buffer.join("\n").trim(),
    });
    buffer = [];
  };

  for (const line of lines) {
    const headingMatch = line.match(/^##+\s+(.*)$/);
    if (headingMatch) {
      pushSection();
      currentTitle = headingMatch[1]?.trim() || "결과";
      continue;
    }
    buffer.push(line);
  }

  pushSection();

  if (sections.length === 0) {
    return [{ title: "결과", content: markdown.trim() }];
  }

  return sections.map((section) => ({
    title: section.title,
    content: section.content || "(내용 없음)",
  }));
}

function Slot({ index, picked }: { index: number; picked?: PickedCard }) {
  const filled = !!picked;

  return (
    <div
      style={{
        width: 140,
        height: 200,
        border: "1px solid #e6e6e6",
        background: filled ? "transparent" : "#fafafa",
        position: "relative",
        overflow: "hidden",
      }}
      title={filled ? picked!.card.name : `Slot ${index + 1}`}
    >
      {!filled ? (
        <div
          style={{
            height: "100%",
            display: "grid",
            placeItems: "center",
            color: "#777",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Card</div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>#{index + 1}</div>
          </div>
        </div>
      ) : (
        <div
          style={{
            position: "absolute",
            inset: 0,
            transformStyle: "preserve-3d",
            transition: "transform 520ms cubic-bezier(0.2, 0.8, 0.2, 1)",
            transform: "rotateY(180deg)",
          }}
        >
          {/* back */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backfaceVisibility: "hidden",
              background: "#111",
              color: "white",
              padding: 12,
              display: "grid",
              alignContent: "space-between",
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.85 }}>TAROT</div>
            <div
              style={{
                height: 86,
                border: "1px solid rgba(255,255,255,0.18)",
                background:
                  "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.18) 0%, transparent 45%), radial-gradient(circle at 80% 30%, rgba(255,255,255,0.14) 0%, transparent 45%), radial-gradient(circle at 50% 80%, rgba(255,255,255,0.12) 0%, transparent 55%)",
              }}
            />
            <div style={{ fontSize: 12, opacity: 0.85 }}>Revealing…</div>
          </div>
          {/* front */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
              background: "white",
              color: "#111",
              overflow: "hidden",
            }}
          >
            {/* Card image */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                transform: picked!.reversed ? "rotate(180deg)" : "none",
                transformOrigin: "center",
              }}
            >
              <img
                src={getCardImageUrl(picked!.card)}
                alt={picked!.card.name}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
                onError={(e) => {
                  // 이미지 없을 때 fallback: 깨진 이미지 대신 숨기고 텍스트 모드로
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            </div>

            {/* Minimal overlay (optional) */}
            <div
              style={{
                position: "absolute",
                left: 10,
                right: 10,
                bottom: 10,
                padding: "8px 10px",
                borderRadius: 12,
                display: "grid",
                gap: 4,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 8,
                }}
              >
                {/* <div style={{ fontSize: 12, opacity: 0.7 }}>
                  {picked!.card.arcana === "Major"
                    ? "Major Arcana"
                    : "Minor Arcana"}
                </div> */}
                {picked!.reversed && (
                  <span
                    style={{
                      fontSize: 11,
                      padding: "2px 7px",
                      borderRadius: 999,
                      border: "1px solid rgba(0,0,0,0.12)",
                      background: "rgba(0,0,0,0.05)",
                    }}
                  >
                    {/* Reversed */}
                  </span>
                )}
              </div>

              <div style={{ fontWeight: 900, lineHeight: 1.1 }}>
                {picked!.card.name}
              </div>
              {/* {picked!.card.arcana === "Minor" ? (
                <div style={{ fontSize: 12, opacity: 0.75 }}>
                  {picked!.card.rank} • {picked!.card.suit}
                </div>
              ) : (
                <div style={{ fontSize: 12, opacity: 0.75 }}>—</div>
              )} */}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GridCard({
  selectedIndex,
  disabled,
  onPick,
}: {
  selectedIndex: number; // -1 if not selected
  disabled: boolean;
  onPick: () => void;
}) {
  const isSelected = selectedIndex >= 0;

  // 선택된 카드는 "사라진 것처럼" 보이게: 빈자리 유지
  if (isSelected) {
    return (
      <div
        aria-hidden="true"
        style={{
          height: 200,
          width: "100%",
          borderRadius: 16,
          border: "1px dashed rgba(0,0,0,0.08)",
          background: "transparent",
          opacity: 0,
          pointerEvents: "none",
        }}
      />
    );
  }

  return (
    <button
      onClick={onPick}
      disabled={disabled}
      style={{
        height: 200,
        width: "100%",
        display: "block",
        borderRadius: 16,
        border: "1px solid #e6e6e6",
        background: "#111",
        color: "white",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        position: "relative",
        overflow: "hidden",
        userSelect: "none",
        padding: 10,
        textAlign: "left",
      }}
      title="Tap to pick"
    >
      {/* Tarot back pattern */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 16,
          opacity: 0.55,
          background: [
            // 1) 얇은 다이아 라인 패턴
            "repeating-linear-gradient(45deg, rgba(255,255,255,0.06) 0 1px, transparent 1px 12px)",
            "repeating-linear-gradient(-45deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 12px)",

            // 2) 은은한 비네팅
            "radial-gradient(circle at 50% 45%, rgba(255,255,255,0.10) 0%, transparent 55%)",
            "radial-gradient(circle at 50% 50%, transparent 0%, rgba(0,0,0,0.35) 78%)",
          ].join(","),
        }}
      />

      {/* Inner frame */}
      <div
        style={{
          position: "absolute",
          inset: 10,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.18)",
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.25)",
          pointerEvents: "none",
        }}
      />

      {/* Center sigil */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "55%",
          transform: "translate(-50%, -50%)",
          width: 44,
          height: 44,
          borderRadius: 999,
          display: "grid",
          placeItems: "center",
          pointerEvents: "none",
        }}
      >
        <div style={{ fontSize: 16, opacity: 0.9, letterSpacing: 1 }}>✶</div>
      </div>

      {/* badge */}
      <span
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          fontSize: 11,
          padding: "3px 7px",
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.18)",
          background: "rgba(255,255,255,0.08)",
        }}
      >
        TAP
      </span>
    </button>
  );
}

export default function TarotSpreadPick() {
  const [topic, setTopic] = useState("");
  const provider = "gemini";
  const [isInterpreting, setIsInterpreting] = useState(false);
  const [resultText, setResultText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isResultOpen, setIsResultOpen] = useState(false);
  const [isDeckVisible, setIsDeckVisible] = useState(false);
  const [isDeckAnimating, setIsDeckAnimating] = useState(false);
  const topicInputRef = useRef<HTMLInputElement | null>(null);

  // 카드 펼침 상태
  const [showInitialCards, setShowInitialCards] = useState(true);

  const baseDeck = useMemo(() => buildTarotDeck78(), []);
  const drawCount = 5; // 요청대로 5장
  const [seed, setSeed] = useState<string>(() => randomSeedString());
  const rng = useMemo(() => makeSeededRng(seed), [seed]);
  const deck = useMemo(() => shuffleSeeded(baseDeck, rng), [baseDeck, rng]);
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const pickedSet = useMemo(() => new Set(pickedIds), [pickedIds]);
  const isReversed = (cardId: string) => {
    const r = makeSeededRng(`${seed}::rev::${cardId}`)();
    return r < 0.5;
  };

  const pickedCards: PickedCard[] = useMemo(() => {
    const map = new Map(deck.map((c) => [c.id, c] as const));
    return pickedIds
      .map((id) => map.get(id))
      .filter(Boolean)
      .map((card) => ({ card: card!, reversed: isReversed(card!.id) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedIds, deck, seed]);

  const canPickMore = pickedIds.length < drawCount;

  function pick(cardId: string) {
    if (pickedSet.has(cardId)) return;
    if (!canPickMore) return;
    setPickedIds((prev) => [...prev, cardId]);
  }

  function newSeed() {
    const s = randomSeedString();
    setSeed(s);
    setPickedIds([]);
    setIsDeckVisible(true);
    setIsResultOpen(false);
    setResultText(null);
    setErrorText(null);
    setShowInitialCards(false);
  }

  useEffect(() => {
    if (!isDeckVisible) {
      setIsDeckAnimating(false);
      return;
    }
    setIsDeckAnimating(false);
    const id = requestAnimationFrame(() => setIsDeckAnimating(true));
    return () => cancelAnimationFrame(id);
  }, [isDeckVisible, seed]);

  useEffect(() => {
    const prefersReduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const delay = prefersReduced ? 0 : 2600;
    const id = window.setTimeout(() => {
      topicInputRef.current?.focus();
    }, delay);
    return () => window.clearTimeout(id);
  }, []);

  const canInterpret =
    topic.trim().length > 0 && pickedCards.length === drawCount;

  const escapeHtml = (text: string) =>
    text
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

  const handlePrint = () => {
    const win = window.open("", "_blank", "width=840,height=980");
    if (!win) return;

    const cardLines = pickedCards
      .map(
        (p, idx) =>
          `${idx + 1}. ${p.card.name}${p.reversed ? " (역위)" : " (정위)"}`,
      )
      .join("\n");

    const body = errorText
      ? escapeHtml(errorText)
      : escapeHtml(resultText || "결과를 준비 중입니다.");

    const html = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <title>타로 결과</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 24px; color: #111; }
      h1 { font-size: 20px; margin: 0 0 8px; text-align: left; }
      .meta { font-size: 12px; color: #666; margin-bottom: 14px; }
      .section { margin: 16px 0; }
      .box { border: 1px solid #e5e5e5; border-radius: 12px; padding: 12px; background: #fafafa; }
      pre { white-space: pre-wrap; line-height: 1.6; font-size: 14px; margin: 0; }
    </style>
  </head>
  <body>
    <h1>타로 결과</h1>
    <div class="meta">주제: ${escapeHtml(topic.trim() || "-")} · ${new Date().toLocaleString()}</div>
    <div class="section">
      <div class="box"><pre>${escapeHtml(cardLines)}</pre></div>
    </div>
    <div class="section">
      <div class="box"><pre>${body}</pre></div>
    </div>
  </body>
</html>`;

    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

  async function interpret() {
    if (topic.trim().length === 0) {
      window.alert("타로 주제를 입력해 주세요.");
      return;
    }
    if (!canInterpret) return;
    setIsResultOpen(false);

    const cardLines = pickedCards
      .map(
        (p, idx) =>
          `${idx + 1}. ${p.card.name}${p.reversed ? " (역위)" : " (정위)"}`,
      )
      .join("\n");

    const prompt = `당신은 전문 타로 리더입니다.\n\n주제: ${topic.trim()}\n스프레드: ${drawCount}장\n카드 목록:\n${cardLines}\n\n요청 사항:\n- 3~5개의 소제목으로 나눠 설명\n- 핵심 조언을 마지막에 3가지 bullet로 제시\n- 과장되거나 단정적인 표현은 피하고, 현실적인 톤 유지\n- 한국어로 답변`;

    try {
      setIsInterpreting(true);
      setErrorText(null);
      setResultText(null);

      const res = await fetch("/api/interpret", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt, provider }),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`AI 요청 실패: ${res.status} ${t}`);
      }

      const data = (await res.json()) as { text?: string; error?: string };
      const text = data.text ?? "";

      if (!text) {
        throw new Error(data.error ?? "응답 텍스트를 찾을 수 없습니다.");
      }

      setResultText(text.trim());
      setIsResultOpen(true);

      const user = auth.currentUser;
      if (user) {
        const cards = pickedCards.map((p) => ({
          name: p.card.name,
          reversed: p.reversed,
        }));
        void addDoc(collection(db, "users", user.uid, "reads"), {
          topic: topic.trim(),
          drawCount,
          provider,
          cards,
          resultText: text.trim(),
          createdAt: serverTimestamp(),
        });
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setErrorText(message);
      setIsResultOpen(true);
    } finally {
      setIsInterpreting(false);
    }
  }

  return (
    <div
      style={{
        padding: 0,
        marginTop: 24,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <style>{`
        @keyframes tarotCardReveal {
          from { opacity: 0; transform: translateY(6px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .tarot-card-reveal {
          opacity: 0;
          will-change: transform, opacity;
          transform: translateY(6px) scale(0.98);
        }
        .tarot-card-reveal.is-animating {
          animation: tarotCardReveal 360ms ease-out forwards;
          animation-fill-mode: both;
        }
        .tarot-markdown h1,
        .tarot-markdown h2,
        .tarot-markdown h3 {
          margin: 16px 0 8px;
          line-height: 1.3;
        }
        .tarot-markdown h1 { font-size: 20px; }
        .tarot-markdown h2 { font-size: 18px; }
        .tarot-markdown h3 { font-size: 16px; }
        .tarot-markdown p { margin: 8px 0; }
        .tarot-markdown ul,
        .tarot-markdown ol {
          margin: 8px 0 8px 20px;
          padding: 0;
        }
        .tarot-markdown li { margin: 4px 0; }
        .tarot-markdown hr { border: none; border-top: 1px solid #e5e5e5; margin: 16px 0; }
        .tarot-markdown blockquote {
          margin: 10px 0;
          padding: 8px 12px;
          border-left: 3px solid #e5e5e5;
          background: #f7f7f7;
          border-radius: 8px;
          color: #555;
        }
        .tarot-result-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 14px;
        }
        .tarot-result-card {
          border: 1px solid #eee;
          background: #fafafa;
          border-radius: 16px;
          padding: 14px;
        }
        .tarot-result-card h4 {
          margin: 0 0 8px;
          font-size: 15px;
          font-weight: 900;
        }
        .typing-text {
          display: inline-block;
          overflow: hidden;
          white-space: nowrap;
          border-right: 2px solid #111;
          animation:
            typing 2.6s steps(30, end) forwards,
            blink 0.8s step-end 3,
            caretHide 0s linear 2.6s forwards;
          max-width: 0;
        }
        @keyframes typing {
          from { max-width: 0; }
          to { max-width: 100%; }
        }
        @keyframes blink {
          0%, 100% { border-color: transparent; }
          50% { border-color: #111; }
        }
        @keyframes caretHide {
          to { border-color: transparent; }
        }
        @media (prefers-reduced-motion: reduce) {
          .tarot-card-reveal,
          .tarot-card-reveal.is-animating { animation: none; opacity: 1; transform: none; }
          .typing-text { animation: none; border-right: none; max-width: none; }
        }
      `}</style>
      <div className="tarot-main-container" style={{ flex: 1 }}>
        {/* Topic + Interpretation */}
        <div
          style={{
            marginBottom: 14,
            padding: 14,
            display: "grid",
            gap: 10,
          }}
        >
          <div
            style={{
              fontSize: 24,
              fontWeight: 500,
              textAlign: "center",
            }}
          >
            지금 고민을 한 줄로 적어주세요
          </div>
          <input
            ref={topicInputRef}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="예) 이직을 고민 중인데 계속 망설여져요. "
            style={{
              padding: "10px 12px 8px 12px",
              border: "none",
              borderBottom: "2.5px solid #ff4d00",
              outline: "none",
              fontSize: 16,
              background: "transparent",
              borderRadius: 0,
              transition: "border-color 0.2s",
              boxShadow: "none",
            }}
          />
          {/* 모델 선택 제거: Gemini만 사용 */}
        </div>
        {/* Controls */}
        {/* <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <button onClick={resetPicks} style={uiBtn(false)}>
            Reset picks
          </button>

          <div style={{ marginLeft: "auto", fontSize: 14, opacity: 0.8 }}>
            Picked: <b>{pickedIds.length}</b> / <b>{drawCount}</b>
          </div>
        </div> */}

        {/* Spread slots */}
        <div style={{ marginBottom: 14 }}>
          {/* 처음엔 카드 1장, 섞기 클릭 후 5개의 빈 슬롯 */}
          {showInitialCards ? (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                width: "100%",
              }}
            >
              <img
                src="/cards/card1.png"
                alt="카드 1"
                style={{ width: 220, height: 296 }}
              />
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "center",
                alignItems: "center",
                width: "100%",
              }}
            >
              {Array.from({ length: drawCount }).map((_, i) => (
                <Slot key={i} index={i} picked={pickedCards[i]} />
              ))}
            </div>
          )}
        </div>

        {/* Proof panel */}
        <div
          style={{
            marginBottom: 14,
            border: "0px solid #eee",
            borderRadius: 16,
            padding: 14,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              alignItems: "baseline",
            }}
          >
            {/* <div style={{ fontSize: 14, fontWeight: 900, opacity: 0.85 }}>
            Proof (Seeded Spread)
          </div>
          <div style={{ fontSize: 12, opacity: 0.65 }}>
            same seed ⇒ same spread order
          </div> */}
          </div>

          <div
            style={{
              marginTop: 10,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
            }}
          >
            {/* 카드섞기 버튼: 카드 선택 시작하면 숨김 */}
            {pickedIds.length === 0 && (
              <button
                onClick={newSeed}
                style={{
                  ...uiBtn(false),
                  padding: "14px 20px",
                  fontSize: 24,
                  backgroundColor: "rgb(255, 77, 0)",
                  borderRadius: 30,
                  color: "white",
                  fontWeight: "900",
                }}
              >
                카드 섞기
              </button>
            )}

            {isDeckVisible && canInterpret && (
              <button
                onClick={interpret}
                style={{
                  ...uiBtn(true),
                  padding: "14px 20px",
                  fontSize: 16,
                  borderRadius: 14,
                }}
                disabled={isInterpreting}
              >
                {isInterpreting ? "해석 중…" : "해석 보기"}
              </button>
            )}
            {/* <span style={{ fontSize: 12, opacity: 0.65 }}>
            주제 입력 후 {drawCount}장 선택 시 활성화
          </span> */}
          </div>

          {/* <div
          style={{
            marginTop: 10,
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: 12,
            background: "#fafafa",
            border: "1px solid #eee",
            borderRadius: 12,
            padding: 10,
            display: "grid",
            gap: 4,
          }}
        >
          <div>seed: {proof.seed}</div>
          <div>drawCount: {proof.drawCount}</div>
          <div>deckHash: {proof.deckHash}</div>
          <div>picksHash: {proof.picksHash}</div>
        </div> */}
        </div>

        {isDeckVisible && !isResultOpen && (
          <>
            {/* 78-card spread grid */}
            <div style={{ fontSize: 14, opacity: 0.8, marginBottom: 8 }}>
              78 cards spread (tap to pick){" "}
              <span style={{ opacity: 0.6 }}>
                (names are hidden until picked)
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                gap: 10,
              }}
            >
              {deck.map((card, index) => {
                const selectedIndex = pickedIds.indexOf(card.id); // -1 if not selected
                const disabled = !pickedSet.has(card.id) && !canPickMore;

                return (
                  <div
                    key={`${card.id}-${seed}`}
                    className={`tarot-card-reveal${isDeckAnimating ? " is-animating" : ""}`}
                    style={{ animationDelay: `${index * 15}ms`, width: "100%" }}
                  >
                    <GridCard
                      selectedIndex={selectedIndex}
                      disabled={disabled}
                      onPick={() => pick(card.id)}
                    />
                  </div>
                );
              })}
            </div>
          </>
        )}

        {isResultOpen && (
          <div
            style={{
              border: "1px solid #eee",
              borderRadius: 20,
              padding: 20,
              background:
                "linear-gradient(180deg, rgba(250,250,250,0.9) 0%, #ffffff 35%)",
              boxShadow: "0 12px 32px rgba(0,0,0,0.08)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    display: "grid",
                    placeItems: "center",
                    background: "#111",
                    color: "white",
                    fontWeight: 900,
                  }}
                >
                  ✶
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>
                    결과 페이지
                  </div>
                  <div style={{ fontSize: 13, opacity: 0.6 }}>
                    Tarot Reading Result
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handlePrint} style={uiBtn(false)}>
                  인쇄
                </button>
                <button
                  onClick={() => setIsResultOpen(false)}
                  style={uiBtn(false)}
                >
                  닫기
                </button>
                <button
                  onClick={() => {
                    // 모든 상태 리셋
                    setIsResultOpen(false);
                    setPickedIds([]);
                    setPickedSet(new Set());
                    setPickedCards([]);
                    setResultText("");
                    setErrorText("");
                    setTopic("");
                    setShowInitialCards(true);
                    setIsDeckVisible(false);
                    setIsInterpreting(false);
                    setCanInterpret(false);
                    setDrawCount(5);
                    setSeed(randomSeedString());
                  }}
                  style={uiBtn(false)}
                >
                  처음부터 다시 타로보기
                </button>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 14,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "1px solid #e5e5e5",
                  background: "#fafafa",
                }}
              >
                주제
              </span>
              <span style={{ fontSize: 14, opacity: 0.75 }}>
                {topic.trim() || "-"}
              </span>
            </div>

            {errorText ? (
              <div
                style={{
                  color: "#b00020",
                  background: "#fff5f5",
                  border: "1px solid #ffd7d7",
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                {errorText}
              </div>
            ) : (
              <div
                className="tarot-markdown"
                style={{
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.6,
                  fontSize: 16,
                  background: "#fafafa",
                  border: "1px solid #eee",
                  padding: 14,
                }}
              >
                {resultText ? (
                  <div className="tarot-result-grid">
                    {splitMarkdownSections(resultText).map((section, idx) => (
                      <div
                        key={`${section.title}-${idx}`}
                        className="tarot-result-card"
                      >
                        <h4>{section.title}</h4>
                        <ReactMarkdown>{section.content}</ReactMarkdown>
                      </div>
                    ))}
                  </div>
                ) : (
                  <ReactMarkdown>결과를 준비 중입니다.</ReactMarkdown>
                )}
              </div>
            )}
          </div>
        )}
        <div
          style={{
            marginTop: 14,
            fontSize: 13,
            opacity: 0.65,
            lineHeight: 1.5,
          }}
        ></div>
      </div>
    </div>
  );
}
