"use client";

/** TanStack Query hooks for exam API. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getExam, listExams, retryExam, uploadExam } from "./client";

const EXAM_KEYS = {
  all: ["exams"] as const,
  list: (page: number) => [...EXAM_KEYS.all, "list", page] as const,
  detail: (id: string) => [...EXAM_KEYS.all, "detail", id] as const,
};

export function useExamList(page = 1) {
  return useQuery({
    queryKey: EXAM_KEYS.list(page),
    queryFn: () => listExams(page),
  });
}

export function useExamDetail(examId: string, options?: { enabled?: boolean; refetchInterval?: number | false }) {
  return useQuery({
    queryKey: EXAM_KEYS.detail(examId),
    queryFn: () => getExam(examId),
    enabled: options?.enabled,
    refetchInterval: options?.refetchInterval,
  });
}

export function useUploadExam() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ file, title }: { file: File; title?: string }) =>
      uploadExam(file, title),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EXAM_KEYS.all });
    },
  });
}

export function useRetryExam() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (examId: string) => retryExam(examId),
    onSuccess: (_data, examId) => {
      qc.invalidateQueries({ queryKey: EXAM_KEYS.detail(examId) });
      qc.invalidateQueries({ queryKey: EXAM_KEYS.all });
    },
  });
}
