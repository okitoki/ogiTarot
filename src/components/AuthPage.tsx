import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth";
import { auth, googleProvider } from "../firebase";

export default function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setIsLoggedIn(Boolean(user));
    });
    return () => unsub();
  }, []);

  const handleGoogleLogin = async () => {
    try {
      setError(null);
      setIsLoading(true);
      await signInWithPopup(auth, googleProvider);
      navigate("/me");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "로그인에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("이메일과 비밀번호를 입력해 주세요.");
      return;
    }

    try {
      setError(null);
      setIsLoading(true);

      if (mode === "signup") {
        const cred = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password,
        );
        if (displayName.trim()) {
          await updateProfile(cred.user, { displayName: displayName.trim() });
        }
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }

      navigate("/me");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "요청에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        maxWidth: 420,
        margin: "24px auto",
        padding: 20,
        border: "1px solid #eee",
        borderRadius: 16,
        background: "white",
        boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
      }}
    >
      <h1 style={{ margin: "0 0 12px", fontSize: 20 }}>로그인 / 회원가입</h1>

      {isLoggedIn && (
        <div
          style={{
            padding: 12,
            borderRadius: 12,
            background: "#f7f7f7",
            border: "1px solid #eee",
            marginBottom: 12,
            fontSize: 13,
          }}
        >
          이미 로그인되어 있습니다.{" "}
          <button
            onClick={() => navigate("/me")}
            style={{
              border: "none",
              background: "transparent",
              color: "#111",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            내 페이지로 이동
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          onClick={() => setMode("login")}
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: mode === "login" ? "#111" : "white",
            color: mode === "login" ? "white" : "#111",
            cursor: "pointer",
          }}
        >
          로그인
        </button>
        <button
          onClick={() => setMode("signup")}
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: mode === "signup" ? "#111" : "white",
            color: mode === "signup" ? "white" : "#111",
            cursor: "pointer",
          }}
        >
          회원가입
        </button>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10 }}>
        {mode === "signup" && (
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="닉네임 (선택)"
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #ddd",
              fontSize: 14,
            }}
          />
        )}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일"
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #ddd",
            fontSize: 14,
          }}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #ddd",
            fontSize: 14,
          }}
        />

        {error && (
          <div
            style={{
              color: "#b00020",
              background: "#fff5f5",
              border: "1px solid #ffd7d7",
              borderRadius: 10,
              padding: 10,
              fontSize: 12,
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid #111",
            background: "#111",
            color: "white",
            cursor: "pointer",
            fontSize: 14,
            opacity: isLoading ? 0.6 : 1,
          }}
        >
          {isLoading ? "처리 중…" : mode === "signup" ? "회원가입" : "로그인"}
        </button>
      </form>

      <div style={{ margin: "14px 0", textAlign: "center", fontSize: 12 }}>
        또는
      </div>

      <button
        onClick={handleGoogleLogin}
        disabled={isLoading}
        style={{
          width: "100%",
          padding: "12px 14px",
          borderRadius: 12,
          border: "1px solid #ddd",
          background: "white",
          cursor: "pointer",
          fontSize: 14,
          opacity: isLoading ? 0.6 : 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path
            fill="#EA4335"
            d="M24 9.5c3.54 0 6.72 1.22 9.22 3.22l6.9-6.9C35.96 2.2 30.31 0 24 0 14.7 0 6.64 5.38 2.74 13.22l8.05 6.25C12.67 13.1 17.88 9.5 24 9.5z"
          />
          <path
            fill="#4285F4"
            d="M46.5 24.5c0-1.55-.14-3.05-.4-4.5H24v9h12.7c-.55 2.95-2.2 5.45-4.7 7.15l7.2 5.6c4.2-3.9 6.3-9.65 6.3-17.25z"
          />
          <path
            fill="#FBBC05"
            d="M10.8 28.47c-1.05-3.1-1.05-6.37 0-9.47l-8.05-6.25C-1.02 18.1-1.02 29.9 2.75 37.25l8.05-6.25z"
          />
          <path
            fill="#34A853"
            d="M24 48c6.31 0 11.96-2.08 15.94-5.65l-7.2-5.6c-2 1.35-4.56 2.15-8.74 2.15-6.12 0-11.33-3.6-13.21-8.72l-8.05 6.25C6.64 42.62 14.7 48 24 48z"
          />
        </svg>
        Google로 계속하기
      </button>
    </div>
  );
}
