"use client";
import { useState } from "react";
import { Modal } from "./Modal";
import type { SpotlightTask } from "@/lib/types";

interface ExistingComment {
  id: string;
  authorRole: "EXECUTIVE" | "ADMIN" | "MANAGER" | "FULL_VIEWER";
  authorName: string;
  body: string;
  createdAt: string;
}

const roleStyle = {
  EXECUTIVE:   { label: "役員",     accent: "border-pink text-pink"  },
  ADMIN:       { label: "管理者",   accent: "border-amber text-amber" },
  MANAGER:     { label: "上長",     accent: "border-accent text-accent2" },
  FULL_VIEWER: { label: "全閲覧者", accent: "border-cyan text-cyan"  },
} as const;

const MOCK_COMMENTS: ExistingComment[] = [
  { id: "c1", authorRole: "EXECUTIVE", authorName: "田中 誠一", body: "期限を過ぎているのが気になります。優先度を上げて完了させてください。", createdAt: "2026/05/13" },
  { id: "c2", authorRole: "ADMIN",     authorName: "神吉 隆",   body: "素材は私が用意します。テキスト変更だけで先に進めてOKです。", createdAt: "2026/05/12" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  task: SpotlightTask | null;
}

export function TaskDetailModal({ open, onClose, task }: Props) {
  const [tab, setTab] = useState<"EXECUTIVE" | "ADMIN" | "MANAGER" | "FULL_VIEWER">("EXECUTIVE");
  const [newComment, setNewComment] = useState("");

  if (!task) return null;

  return (
    <Modal open={open} onClose={onClose}>
      <p className="page-title">TASK DETAIL</p>
      <h2 className="text-lg font-extrabold mb-1.5">{task.title}</h2>
      <p className="text-[11px] text-text3 font-mono mb-3.5">
        担当: {task.assigneeName} ／ {task.flag === "overdue" ? "期限切れ" : "高優先度"}
      </p>

      <p className="section-title">▸ 評価コメント（ロール別）</p>
      <nav className="flex gap-0.5 px-5 -mx-5 mb-3 border-b border-border2 overflow-x-auto">
        {(Object.keys(roleStyle) as Array<keyof typeof roleStyle>).map((r) => (
          <button
            key={r}
            onClick={() => setTab(r)}
            className={[
              "flex-shrink-0 px-3.5 py-2.5 text-[12px] font-semibold border-b-2 -mb-px",
              tab === r ? "text-text border-accent" : "text-text3 border-transparent",
            ].join(" ")}
          >
            {roleStyle[r].label}
          </button>
        ))}
      </nav>

      <div className="flex flex-col gap-2 mb-3">
        {MOCK_COMMENTS.filter((c) => c.authorRole === tab).map((c) => {
          const s = roleStyle[c.authorRole];
          return (
            <div key={c.id} className={`p-2.5 bg-bg3 rounded-lg border-l-[3px] ${s.accent.split(" ")[0]}`}>
              <div className="flex justify-between mb-1">
                <strong className={`text-[11px] ${s.accent.split(" ")[1]}`}>
                  ⌘ {s.label} {c.authorName}
                </strong>
                <span className="text-[10px] text-text3 font-mono">{c.createdAt}</span>
              </div>
              <p className="text-[11px] text-text2 leading-relaxed">{c.body}</p>
            </div>
          );
        })}
        {MOCK_COMMENTS.filter((c) => c.authorRole === tab).length === 0 && (
          <p className="text-[11px] text-text3 text-center py-3">このロールのコメントはまだありません</p>
        )}
      </div>

      <div className="p-2.5 bg-accent3 rounded-lg">
        <p className="text-[10px] text-accent2 font-mono mb-1.5">◇ コメントを追加（役員として）</p>
        <textarea
          className="textarea !min-h-[50px] mb-2"
          placeholder="このタスクへの評価コメント..."
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
        />
        <button
          className="btn"
          disabled={!newComment.trim()}
          onClick={() => {
            // TODO: POST /api/tasks/{id}/comments
            setNewComment("");
            onClose();
          }}
        >
          コメントを送信
        </button>
      </div>
    </Modal>
  );
}
