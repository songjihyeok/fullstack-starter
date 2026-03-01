"use client";

import { FileText, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ExamStatusBadge } from "@/components/exams/exam-status-badge";
import { FileUploadZone } from "@/components/exams/file-upload-zone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useExamList, useUploadExam } from "@/lib/api/exams/hooks";

export default function ExamsPage() {
  const [page] = useState(1);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");

  const { data: exams, isLoading } = useExamList(page);
  const upload = useUploadExam();

  const handleUpload = async () => {
    if (!selectedFile) return;
    try {
      const result = await upload.mutateAsync({
        file: selectedFile,
        title: title || undefined,
      });
      setShowUpload(false);
      setSelectedFile(null);
      setTitle("");
      // Navigate to the result page
      window.location.href = `/exams/${result.exam_id}`;
    } catch {
      // error is accessible via upload.error
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">시험 분석</h1>
          <p className="text-muted-foreground mt-1">
            시험지를 업로드하면 AI가 채점, 약점 분석, 유사 문제를 생성합니다
          </p>
        </div>
        <Button onClick={() => setShowUpload(!showUpload)}>
          <Plus className="h-4 w-4" />새 시험 분석
        </Button>
      </div>

      {/* Upload Section */}
      {!!showUpload && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>시험지 업로드</CardTitle>
            <CardDescription>시험지 이미지 또는 PDF를 업로드하세요</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label htmlFor="exam-title" className="text-sm font-medium mb-1.5 block">
                시험 제목 (선택)
              </label>
              <input
                id="exam-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 중간고사 영어"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            <FileUploadZone onFileSelect={setSelectedFile} disabled={upload.isPending} />

            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setShowUpload(false);
                  setSelectedFile(null);
                }}
              >
                취소
              </Button>
              <Button onClick={handleUpload} disabled={!selectedFile || upload.isPending}>
                {!!upload.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                분석 시작
              </Button>
            </div>

            {!!upload.isError && (
              <p className="text-sm text-destructive">
                업로드 실패:{" "}
                {upload.error instanceof Error ? upload.error.message : "알 수 없는 오류"}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Exam List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !exams?.data?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">아직 분석된 시험이 없습니다</p>
            <p className="text-sm text-muted-foreground mt-1">
              시험지를 업로드하여 AI 분석을 시작하세요
            </p>
            <Button className="mt-4" onClick={() => setShowUpload(true)}>
              <Plus className="h-4 w-4" />첫 시험 업로드
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {exams.data.map((exam) => (
            <Link key={exam.exam_id} href={`/exams/${exam.exam_id}`}>
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4">
                    <FileText className="h-8 w-8 text-muted-foreground shrink-0" />
                    <div>
                      <p className="font-medium">{exam.title || "제목 없는 시험"}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(exam.created_at).toLocaleDateString("ko-KR", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {exam.accuracy_rate !== null && exam.accuracy_rate !== undefined && (
                      <span className="text-lg font-bold">
                        {Math.round(exam.accuracy_rate * 100)}%
                      </span>
                    )}
                    <ExamStatusBadge status={exam.status} />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
