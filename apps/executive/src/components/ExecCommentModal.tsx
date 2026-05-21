"use client";
import { useState } from "react";
import { Modal } from "./Modal";

interface Props {
  open: boolean;
  onClose: () => void;
  subjectName: string;
  periodLabel: string;
  onSubmit?: (data: { overall: string; expectation: string; draft: boolean }) => void;
}

export function ExecCommentModal({ open, onClose, subjectName, periodLabel, onSubmit }: Props) {
  const [overall, setOverall] = useState("");
  const [expectation, setExpectation] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (draft: boolean) => {
    setSubmitting(true);
    try {
      // TODO: POST /api/evaluations/{id}/comments
      onSubmit?.({ overall, expectation, draft });
      onClose();
      setOverall(""); setExpectation("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <p className="page-title">EXECUTIVE COMMENT</p>
      <h2 className="text-lg font-extrabold mb-3.5">役員コメントを追加</h2>
      <p className="text-[11px] text-text3 font-mono mb-2.5">
        対象: {subjectName} ／ {periodLabel}
      </p>
      <label className="label">総合所感</label>
      <textarea
        className="textarea"
        placeholder="経営視点からのコメント..."
        value={overall}
        onChange={(e) => setOverall(e.target.value)}
      />
      <label className="label mt-2.5">次期への期待</label>
      <textarea
        className="textarea"
        placeholder="次期に期待する取り組み..."
        value={expectation}
        onChange={(e) => setExpectation(e.target.value)}
      />
      <div className="flex gap-2 mt-3">
        <button
          className="btn btn-outline btn-full"
          disabled={submitting}
          onClick={() => handleSubmit(true)}
        >
          下書き保存
        </button>
        <button
          className="btn btn-full"
          disabled={submitting || !overall.trim()}
          onClick={() => handleSubmit(false)}
        >
          コメントを送信
        </button>
      </div>
    </Modal>
  );
}
