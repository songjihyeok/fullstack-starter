/** API client functions for exam endpoints. */

import { apiClient } from "@/lib/api-client";
import type {
  ExamDetailResponse,
  ExamUploadResponse,
  PaginatedExams,
} from "./types";

const BASE = "/api/exams";

export async function uploadExam(file: File, title?: string): Promise<ExamUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const params = new URLSearchParams();
  if (title) params.set("title", title);

  const { data } = await apiClient.post<ExamUploadResponse>(
    `${BASE}/${params.toString() ? `?${params}` : ""}`,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return data;
}

export async function getExam(examId: string): Promise<ExamDetailResponse> {
  const { data } = await apiClient.get<ExamDetailResponse>(`${BASE}/${examId}`);
  return data;
}

export async function listExams(page = 1, limit = 20): Promise<PaginatedExams> {
  const { data } = await apiClient.get<PaginatedExams>(`${BASE}/`, {
    params: { page, limit },
  });
  return data;
}

export async function retryExam(examId: string): Promise<ExamUploadResponse> {
  const { data } = await apiClient.post<ExamUploadResponse>(`${BASE}/${examId}/retry`);
  return data;
}
