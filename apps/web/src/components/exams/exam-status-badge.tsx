"use client";

import { Badge } from "@/components/ui/badge";
import type { ExamStatus } from "@/lib/api/exams/types";

const STATUS_CONFIG: Record<ExamStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" }> = {
  uploaded: { label: "업로드됨", variant: "secondary" },
  ocr_processing: { label: "텍스트 추출 중", variant: "warning" },
  parsing: { label: "문제 분석 중", variant: "warning" },
  grading: { label: "채점 중", variant: "warning" },
  analyzing: { label: "약점 분석 중", variant: "warning" },
  generating: { label: "유사문제 생성 중", variant: "warning" },
  completed: { label: "완료", variant: "success" },
  failed: { label: "실패", variant: "destructive" },
};

export function ExamStatusBadge({ status }: { status: ExamStatus }) {
  const config = STATUS_CONFIG[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
