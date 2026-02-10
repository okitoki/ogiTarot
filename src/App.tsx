import { useEffect, useState } from "react";
import {
  BrowserRouter,
  NavLink,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";

// ✅ 기존에 쓰던 것들 복구 필요 (예시)
import { auth } from "./firebase";
import {
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signOut,
  getIdToken,
  getIdTokenResult,
} from "firebase/auth";

import TarotSpread from "./components/TarotSpread";
import Blog from "./components/Blog";
import BlogPostDetail from "./components/BlogPostDetail";
import AuthPage from "./components/AuthPage";
import MyPage from "./components/MyPage";
import BlogAdmin from "./components/BlogAdmin";

function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSyncingAdmin, setIsSyncingAdmin] = useState(false);
  const location = useLocation();
  const adminSyncUrl = "/api/admin/sync";

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const loadAdminClaim = async () => {
    const user = auth.currentUser;
    if (!user) {
      setIsAdmin(false);
      return;
    }
    const result = await getIdTokenResult(user, true);
    setIsAdmin(Boolean(result.claims?.admin));
  };

  const refreshAdminClaimWithRetry = async () => {
    const user = auth.currentUser;
    if (!user) return;
    for (let i = 0; i < 3; i += 1) {
      const result = await getIdTokenResult(user, true);
      const admin = Boolean(result.claims?.admin);
      setIsAdmin(admin);
      if (admin) return;
      await new Promise((r) => setTimeout(r, 400));
    }
  };

  const syncAdminClaims = async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      setIsSyncingAdmin(true);
      const token = await getIdToken(user, true);
      const res = await fetch(adminSyncUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = (await res.json().catch(() => null)) as {
          admin?: boolean;
        } | null;
        if (typeof data?.admin === "boolean") setIsAdmin(data.admin);
      }
      await refreshAdminClaimWithRetry();
    } catch {
      setIsAdmin(false);
    } finally {
      setIsSyncingAdmin(false);
    }
  };

  useEffect(() => {
    let unsubscribe = () => {};

    (async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch {
        // ignore
      }

      unsubscribe = onAuthStateChanged(auth, async (user) => {
        const email = user?.email ?? null;
        setUserEmail(email);

        if (!user) {
          setIsAdmin(false);
          return;
        }

        await loadAdminClaim();
        await syncAdminClaims();
      });
    })();

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#fff",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <style>{`
        @media (max-width: 768px) {
          .main-container {
            flex-direction: column !important;
            gap: 0 !important;
          }
          .nav-menu {
            display: none !important;
          }
          .nav-menu.nav-menu-open {
            display: flex !important;
            flex-direction: column;
            position: absolute;
            top: 56px;
            left: 0;
            right: 0;
            background: white;
            box-shadow: 0 2px 12px 0 rgba(0,0,0,0.08);
            z-index: 100;
            padding: 16px;
          }
          .menu-toggle {
            display: block !important;
          }
          .pc-user-menu {
            display: none !important;
          }
        }
        @media (min-width: 769px) {
          .menu-toggle {
            display: none !important;
          }
          .pc-user-menu {
            display: flex !important;
          }
        }
      `}</style>
      {/* ✅ header는 하나만 남김 */}
      <header
        style={{
          background: "white",
          borderBottom: "1px solid #eee",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div
          className="main-container"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 32,
            padding: "12px 16px",
            maxWidth: "980px",
            margin: "0 auto",
            position: "relative",
          }}
        >
          {/* 왼쪽: 로고 + 메뉴 */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button
              className="menu-toggle"
              style={{
                marginRight: 8,
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: "white",
                cursor: "pointer",
                fontSize: 16,
                display: "none",
                alignItems: "center",
              }}
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="메뉴 열기"
            >
              ☰
            </button>
            <NavLink
              to="/"
              style={{
                fontWeight: 900,
                fontSize: 26,
                textDecoration: "none",
                color: "#111",
                letterSpacing: -1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: 220,
              }}
              onClick={() => setMenuOpen(false)}
            >
              오기타로
            </NavLink>
            <nav
              className={menuOpen ? "nav-menu nav-menu-open" : "nav-menu"}
              style={{ gap: 8 }}
              onClick={() => setMenuOpen(false)}
            >
              <NavLink
                to="/"
                end
                style={({ isActive }) => ({
                  padding: "6px 10px",
                  textDecoration: "none",
                  color: isActive ? "#858585" : "#111",
                })}
              >
                타로보기
              </NavLink>
              <NavLink
                to="/cards"
                style={({ isActive }) => ({
                  padding: "6px 10px",
                  textDecoration: "none",
                  color: isActive ? "#858585" : "#111",
                })}
              >
                카드설명
              </NavLink>
              <NavLink
                to="/spreads"
                style={({ isActive }) => ({
                  padding: "6px 10px",
                  textDecoration: "none",
                  color: isActive ? "#858585" : "#111",
                })}
              >
                스프레드
              </NavLink>
              <NavLink
                to="/info"
                style={({ isActive }) => ({
                  padding: "6px 10px",
                  textDecoration: "none",
                  color: isActive ? "#858585" : "#111",
                })}
              >
                타로정보
              </NavLink>
              {userEmail && (
                <NavLink
                  to="/me"
                  style={({ isActive }) => ({
                    padding: "6px 10px",
                    textDecoration: "none",
                    color: isActive ? "#858585" : "#111",
                  })}
                >
                  나의 페이지
                </NavLink>
              )}
              {menuOpen && (
                <div
                  className="mobile-user-menu"
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  {userEmail ? (
                    <>
                      <span style={{ fontSize: 12, opacity: 0.6 }}>
                        {userEmail}
                      </span>
                      {isAdmin ? (
                        <NavLink
                          to="/admin"
                          style={{
                            padding: "6px 10px",
                            borderRadius: 10,
                            border: "1px solid #111",
                            background: "#111",
                            color: "white",
                            textDecoration: "none",
                            fontSize: 12,
                          }}
                        >
                          글쓰기
                        </NavLink>
                      ) : (
                        <button
                          onClick={syncAdminClaims}
                          disabled={isSyncingAdmin}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 10,
                            border: "1px solid #ddd",
                            background: "white",
                            cursor: "pointer",
                            fontSize: 12,
                            opacity: isSyncingAdmin ? 0.6 : 1,
                          }}
                        >
                          {isSyncingAdmin ? "권한 확인 중…" : "권한 새로고침"}
                        </button>
                      )}
                      <button
                        onClick={handleLogout}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 10,
                          border: "1px solid #ddd",
                          background: "white",
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        로그아웃
                      </button>
                    </>
                  ) : (
                    <NavLink
                      to="/login"
                      style={{
                        padding: "6px 10px",
                        borderRadius: 10,
                        border: "1px solid #111",
                        background: "#111",
                        color: "white",
                        cursor: "pointer",
                        fontSize: 12,
                        textDecoration: "none",
                      }}
                    >
                      로그인 / 회원가입
                    </NavLink>
                  )}
                </div>
              )}
            </nav>
          </div>
          {/* PC: 오른쪽 유저 정보 및 버튼 (모바일에서는 숨김) */}
          <div
            className="pc-user-menu"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginLeft: "auto",
            }}
          >
            {userEmail ? (
              <>
                <span style={{ fontSize: 12, opacity: 0.6 }}>{userEmail}</span>
                {isAdmin ? (
                  <NavLink
                    to="/admin"
                    style={{
                      padding: "6px 10px",
                      borderRadius: 10,
                      border: "1px solid #111",
                      background: "#111",
                      color: "white",
                      textDecoration: "none",
                      fontSize: 12,
                    }}
                  >
                    글쓰기
                  </NavLink>
                ) : (
                  <button
                    onClick={syncAdminClaims}
                    disabled={isSyncingAdmin}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      background: "white",
                      cursor: "pointer",
                      fontSize: 12,
                      opacity: isSyncingAdmin ? 0.6 : 1,
                    }}
                  >
                    {isSyncingAdmin ? "권한 확인 중…" : "권한 새로고침"}
                  </button>
                )}
                <button
                  onClick={handleLogout}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    background: "white",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  로그아웃
                </button>
              </>
            ) : (
              <NavLink
                to="/login"
                style={{
                  padding: "6px 10px",
                  borderRadius: 10,
                  border: "1px solid #111",
                  background: "#111",
                  color: "white",
                  cursor: "pointer",
                  fontSize: 12,
                  textDecoration: "none",
                }}
              >
                로그인 / 회원가입
              </NavLink>
            )}
          </div>
        </div>
      </header>

      <main
        style={{
          flex: 1,
          maxWidth: "980px",
          margin: "0 auto",
          width: "100%",
        }}
      >
        <Routes>
          <Route
            path="/"
            element={
              <div className="main-container" style={{ padding: "20px" }}>
                <TarotSpread />
              </div>
            }
          />
          <Route
            path="/cards"
            element={
              <div className="main-container">
                <Blog
                  title="카드설명"
                  category="cards"
                  basePath="/cards"
                  isAdmin={isAdmin}
                />
              </div>
            }
          />
          <Route
            path="/cards/:id"
            element={
              <div className="main-container">
                <BlogPostDetail
                  title="카드설명"
                  category="cards"
                  basePath="/cards"
                  isAdmin={isAdmin}
                />
              </div>
            }
          />
          <Route
            path="/spreads"
            element={
              <div className="main-container">
                <Blog
                  title="스프레드"
                  category="spread"
                  basePath="/spreads"
                  isAdmin={isAdmin}
                />
              </div>
            }
          />
          <Route
            path="/spreads/:id"
            element={
              <div className="main-container">
                <BlogPostDetail
                  title="스프레드"
                  category="spread"
                  basePath="/spreads"
                  isAdmin={isAdmin}
                />
              </div>
            }
          />
          <Route
            path="/info"
            element={
              <div className="main-container">
                <Blog
                  title="타로정보"
                  category="info"
                  basePath="/info"
                  isAdmin={isAdmin}
                />
              </div>
            }
          />
          <Route
            path="/info/:id"
            element={
              <div className="main-container">
                <BlogPostDetail
                  title="타로정보"
                  category="info"
                  basePath="/info"
                  isAdmin={isAdmin}
                />
              </div>
            }
          />
          <Route
            path="/login"
            element={
              <div className="main-container">
                <AuthPage />
              </div>
            }
          />
          <Route
            path="/me"
            element={
              <div className="main-container">
                <MyPage />
              </div>
            }
          />
          <Route
            path="/admin"
            element={
              <div className="main-container">
                <BlogAdmin isAdmin={isAdmin} />
              </div>
            }
          />
        </Routes>
      </main>

      <footer
        style={{
          borderTop: "1px solid #eee",
          padding: 0,
          fontSize: 12,
          color: "#777",
          textAlign: "center",
          background: "white",
        }}
      >
        <div className="main-container">
          <div>
            본 콘텐츠는 타로 상징을 바탕으로 한 참고용 해석이며, 개인의 중요한
            결정(의료, 법률, 재정 등)을 대신하지 않습니다.
          </div>
          <div style={{ marginTop: 6 }}>
            © {new Date().getFullYear()} 오기타로. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
