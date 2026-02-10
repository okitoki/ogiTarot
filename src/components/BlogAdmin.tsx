import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CKEditor } from "@ckeditor/ckeditor5-react";
import ClassicEditor from "@ckeditor/ckeditor5-build-classic";
import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import {
  getDownloadURL,
  ref,
  uploadBytes,
  uploadString,
} from "firebase/storage";
import { db, storage } from "../firebase.ts";
import { useSearchParams } from "react-router-dom";

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

type BlogAdminProps = {
  isAdmin?: boolean;
};

export default function BlogAdmin({ isAdmin }: BlogAdminProps) {
  const [searchParams] = useSearchParams();
  const editorRef = useRef<{
    editing: {
      view: {
        document: { getRoot: () => unknown };
        change: (
          cb: (writer: {
            setStyle: (key: string, value: string, el: unknown) => void;
          }) => void,
        ) => void;
      };
    };
    setData: (data: string) => void;
  } | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<"cards" | "spread" | "info">(
    "cards",
  );
  const [imageWidth, setImageWidth] = useState(640);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingEdit, setIsLoadingEdit] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);
  const pendingEditorDataRef = useRef<string | null>(null);
  const isSavingRef = useRef(false);
  const draftIdRef = useRef<string | null>(null);

  const canSave = title.trim().length > 0 && content.trim().length > 0;

  const previewText = useMemo(() => {
    const plain = content
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return plain.slice(0, 140);
  }, [content]);

  const applyImageSizing = useCallback(
    (html: string) => {
      if (!html) return html;
      const width = Math.max(240, Math.min(1200, imageWidth));
      const doc = new DOMParser().parseFromString(html, "text/html");
      doc.querySelectorAll("img").forEach((img) => {
        img.setAttribute(
          "style",
          `max-width:100%;width:${width}px;height:auto;`,
        );
      });
      return doc.body.innerHTML;
    },
    [imageWidth],
  );

  const syncEditorHeight = useCallback(() => {
    if (!editorRef.current) return;
    const height = Math.max(320, document.documentElement.clientHeight - 280);
    editorRef.current.editing.view.change((writer) => {
      const root = editorRef.current?.editing.view.document.getRoot();
      if (!root) return;
      writer.setStyle("min-height", `${height}px`, root);
    });
  }, []);

  useEffect(() => {
    syncEditorHeight();
    window.addEventListener("resize", syncEditorHeight);
    return () => window.removeEventListener("resize", syncEditorHeight);
  }, [syncEditorHeight]);

  useEffect(() => {
    if (!successText) return;
    const timer = window.setTimeout(() => setSuccessText(null), 1000);
    return () => window.clearTimeout(timer);
  }, [successText]);

  const optimizeImage = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return file;

    const bitmap = await createImageBitmap(file);
    const maxWidth = 1600;
    const scale = Math.min(1, maxWidth / bitmap.width);
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.8),
    );

    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
      type: "image/jpeg",
    });
  }, []);

  const uploadAdapterPlugin = useMemo(() => {
    function UploadAdapterPlugin(editor: {
      plugins: {
        get: (name: string) => {
          createUploadAdapter: (loader: unknown) => unknown;
        };
      };
    }) {
      editor.plugins.get("FileRepository").createUploadAdapter = (loader) => {
        return {
          upload: async () => {
            const file = await (loader as { file: Promise<File> }).file;
            const optimized = await optimizeImage(file);
            const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
            const storagePath = `blog/images/${Date.now()}-${safeName}`;
            const storageRef = ref(storage, storagePath);
            await uploadBytes(storageRef, optimized);
            const url = await getDownloadURL(storageRef);
            return { default: url };
          },
        };
      };
    }

    return UploadAdapterPlugin;
  }, [optimizeImage]);

  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId) {
      setEditingId(null);
      setErrorText(null);
      return;
    }

    let isActive = true;
    (async () => {
      try {
        setIsLoadingEdit(true);
        const snap = await getDoc(doc(db, "posts", editId));
        if (!snap.exists()) {
          if (isActive) {
            setErrorText("수정할 글을 찾을 수 없습니다.");
            setEditingId(null);
          }
          return;
        }
        const data = snap.data() as {
          title?: string;
          category?: "cards" | "spread" | "info";
          content?: string;
        };
        if (!isActive) return;
        setEditingId(editId);
        setTitle(data.title ?? "");
        setCategory(data.category ?? "cards");
        const nextContent = data.content ?? "";
        setContent(nextContent);
        if (editorRef.current) {
          editorRef.current.setData(nextContent);
        } else {
          pendingEditorDataRef.current = nextContent;
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Unknown error";
        if (isActive) setErrorText(message);
      } finally {
        if (isActive) setIsLoadingEdit(false);
      }
    })();

    return () => {
      isActive = false;
    };
  }, [searchParams]);

  const handleSave = async () => {
    if (!canSave || isSaving || isSavingRef.current) return;
    isSavingRef.current = true;
    setIsSaving(true);

    try {
      setIsSaving(true);
      setErrorText(null);
      setSuccessText(null);

      const trimmedTitle = title.trim();
      const trimmedContent = content.trim();
      const sizedContent = applyImageSizing(trimmedContent);
      const preview = previewText;

      let docId = editingId;
      let storagePath = "";

      if (editingId) {
        const docRef = doc(db, "posts", editingId);
        await updateDoc(docRef, {
          title: trimmedTitle,
          category,
          preview,
          content: sizedContent,
          updatedAt: serverTimestamp(),
        });
        docId = editingId;
      } else {
        const nextId = draftIdRef.current ?? doc(collection(db, "posts")).id;
        draftIdRef.current = nextId;
        const docRef = doc(db, "posts", nextId);
        await setDoc(
          docRef,
          {
            title: trimmedTitle,
            category,
            storagePath: "",
            preview,
            content: sizedContent,
            createdAt: serverTimestamp(),
          },
          { merge: true },
        );
        docId = nextId;
      }

      if (docId) {
        storagePath = `blog/posts/${docId}.txt`;
        const storageRef = ref(storage, storagePath);
        (async () => {
          try {
            await uploadString(storageRef, sizedContent, "raw");
            await updateDoc(doc(db, "posts", docId), { storagePath });
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : "Unknown error";
            setErrorText(`Storage 업로드 실패: ${message}`);
          }
        })();
      }

      if (!editingId) {
        draftIdRef.current = null;
      }
      setSuccessText(editingId ? "수정 완료" : "저장 완료");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setErrorText(message);
    } finally {
      setIsSaving(false);
      isSavingRef.current = false;
    }
  };

  const handleResetToNew = () => {
    setEditingId(null);
    setTitle("");
    setCategory("cards");
    setContent("");
    editorRef.current?.setData("");
  };

  if (!isAdmin) {
    return (
      <section style={{ marginTop: 24 }}>
        <h1 style={{ margin: "0 0 10px", fontSize: 20 }}>블로그 어드민</h1>
        <div
          style={{
            border: "1px solid #eee",
            borderRadius: 16,
            padding: 16,
            fontSize: 14,
          }}
        >
          관리자 로그인 후 이용할 수 있습니다.
        </div>
      </section>
    );
  }

  return (
    <section style={{ marginTop: 24 }}>
      <h1 style={{ margin: "0 0 10px", fontSize: 20 }}>블로그 어드민</h1>

      <div
        style={{
          border: "1px solid #eee",
          borderRadius: 16,
          padding: 14,
          display: "grid",
          gap: 10,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 900, opacity: 0.85 }}>
          {editingId ? "글 수정" : "새 글 작성"}
          {isLoadingEdit && (
            <span style={{ fontSize: 12, opacity: 0.6, marginLeft: 8 }}>
              불러오는 중…
            </span>
          )}
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="제목"
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #ddd",
            fontSize: 14,
          }}
        />
        <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 13, opacity: 0.7 }}>카테고리</span>
          <select
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as "cards" | "spread" | "info")
            }
            style={{
              padding: "6px 8px",
              borderRadius: 10,
              border: "1px solid #ddd",
              fontSize: 13,
            }}
          >
            <option value="cards">카드설명</option>
            <option value="spread">스프레드</option>
            <option value="info">타로정보</option>
          </select>
        </label>
        <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 13, opacity: 0.7 }}>이미지 기본 너비</span>
          <input
            type="number"
            min={240}
            max={1200}
            value={imageWidth}
            onChange={(e) => setImageWidth(Number(e.target.value || 0))}
            style={{
              width: 120,
              padding: "6px 8px",
              borderRadius: 10,
              border: "1px solid #ddd",
              fontSize: 13,
            }}
          />
          <span style={{ fontSize: 12, opacity: 0.6 }}>px</span>
        </label>
        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: 12,
            padding: 8,
          }}
        >
          <CKEditor
            editor={
              ClassicEditor as unknown as {
                create: (...args: never[]) => Promise<never>;
                EditorWatchdog: never;
                ContextWatchdog: never;
              }
            }
            config={{
              licenseKey: "GPL",
              extraPlugins: [uploadAdapterPlugin],
            }}
            onReady={(editor) => {
              editorRef.current = editor as typeof editorRef.current;
              syncEditorHeight();
              if (pendingEditorDataRef.current !== null) {
                editorRef.current?.setData(pendingEditorDataRef.current);
                pendingEditorDataRef.current = null;
              }
            }}
            onChange={(_, editor) => {
              const data = (
                editor as unknown as { getData: () => string }
              ).getData();
              setContent(data);
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={handleSave}
            style={uiBtn(true)}
            disabled={!canSave || isSaving}
          >
            {isSaving ? "저장 중…" : editingId ? "수정 저장" : "글 저장"}
          </button>
          {editingId && (
            <button onClick={handleResetToNew} style={uiBtn(false)}>
              새 글로 전환
            </button>
          )}
          <span style={{ fontSize: 12, opacity: 0.65 }}>
            Firebase Storage에 누적 저장됩니다.
          </span>
        </div>
        {successText && (
          <div
            style={{
              color: "#0c6",
              background: "#f4fff9",
              border: "1px solid #d2f4e6",
              borderRadius: 12,
              padding: 12,
              fontSize: 13,
            }}
          >
            {successText}
          </div>
        )}
        {errorText && (
          <div
            style={{
              color: "#b00020",
              background: "#fff5f5",
              border: "1px solid #ffd7d7",
              borderRadius: 12,
              padding: 12,
              fontSize: 13,
            }}
          >
            {errorText}
          </div>
        )}
      </div>
    </section>
  );
}
