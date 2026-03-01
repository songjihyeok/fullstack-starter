"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  BookOpen,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ExamStatusBadge } from "@/components/exams/exam-status-badge";
import { RadarChart } from "@/components/exams/radar-chart";
import { useExamDetail, useRetryExam } from "@/lib/api/exams/hooks";
import type { ExamStatus } from "@/lib/api/exams/types";

const PROCESSING_STATUSES: ExamStatus[] = [
  "uploaded",
  "ocr_processing",
  "parsing",
  "grading",
  "analyzing",
  "generating",
];

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ExamDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const isProcessing = (status: ExamStatus) => PROCESSING_STATUSES.includes(status);
  const [polling, setPolling] = useState(true);

  const { data: exam, isLoading } = useExamDetail(id, {
    refetchInterval: polling ? 2000 : false,
  });

  // Stop polling once completed or failed
  useEffect(() => {
    if (exam && !isProcessing(exam.status)) {
      setPolling(false);
    }
  }, [exam]);
  const retry = useRetryExam();

  if (isLoading) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </main>
    );
  }

  if (!exam) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <p className="text-center text-muted-foreground py-20">시험을 찾을 수 없습니다.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Link href="/exams" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="h-4 w-4" />
          시험 목록
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{exam.title || "제목 없는 시험"}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {new Date(exam.created_at).toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          <ExamStatusBadge status={exam.status} />
        </div>
      </div>

      {/* Processing State */}
      {isProcessing(exam.status) && (
        <Card className="mb-6">
          <CardContent className="flex flex-col items-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg font-medium">AI 분석 진행 중...</p>
            <p className="text-sm text-muted-foreground mt-1">
              {exam.status === "ocr_processing" && "시험지에서 텍스트를 추출하고 있습니다"}
              {exam.status === "parsing" && "문제와 답을 구조화하고 있습니다"}
              {exam.status === "grading" && "채점을 진행하고 있습니다"}
              {exam.status === "analyzing" && "약점을 분석하고 있습니다"}
              {exam.status === "generating" && "유사 문제를 생성하고 있습니다"}
              {exam.status === "uploaded" && "분석을 준비하고 있습니다"}
            </p>
            <div className="w-64 mt-4">
              <Progress
                value={
                  ["uploaded", "ocr_processing", "parsing", "grading", "analyzing", "generating"]
                    .indexOf(exam.status) * 20
                }
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Failed State */}
      {exam.status === "failed" && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>분석 실패</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>{exam.error_message || "알 수 없는 오류가 발생했습니다."}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => retry.mutate(id)}
              disabled={retry.isPending}
            >
              <RefreshCw className="h-4 w-4" />
              재시도
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Completed Results */}
      {exam.status === "completed" && (
        <>
          {/* Score Summary */}
          {exam.grading && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-primary">
                    {Math.round(exam.grading.accuracy_rate * 100)}%
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">정답률</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold">{exam.grading.total_questions}</p>
                  <p className="text-xs text-muted-foreground mt-1">전체 문항</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-green-600">{exam.grading.correct}</p>
                  <p className="text-xs text-muted-foreground mt-1">정답</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-destructive">{exam.grading.incorrect}</p>
                  <p className="text-xs text-muted-foreground mt-1">오답</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Tabbed Content */}
          <Tabs defaultValue="questions">
            <TabsList className="w-full justify-start flex-wrap h-auto gap-1">
              <TabsTrigger value="questions">문항 분석</TabsTrigger>
              <TabsTrigger value="weakness">약점 분석</TabsTrigger>
              <TabsTrigger value="statistics">통계</TabsTrigger>
              <TabsTrigger value="practice">유사 문제</TabsTrigger>
            </TabsList>

            {/* Questions Tab */}
            <TabsContent value="questions">
              <div className="space-y-3 mt-4">
                {exam.questions.map((q) => (
                  <Card key={q.number}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="shrink-0 mt-0.5">
                          {q.is_correct ? (
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                          ) : (
                            <XCircle className="h-5 w-5 text-destructive" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">Q{q.number}</span>
                            <Badge variant="outline" className="text-xs">
                              {q.type === "multiple_choice" ? "객관식" : "주관식"}
                            </Badge>
                            {q.similarity_score !== null && q.type === "subjective" && (
                              <Badge variant="secondary" className="text-xs">
                                유사도 {Math.round(q.similarity_score * 100)}%
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm mb-2">{q.question_text}</p>

                          {q.choices && (
                            <div className="text-sm text-muted-foreground mb-2 space-y-0.5">
                              {q.choices.map((c, i) => (
                                <p key={i}>{c}</p>
                              ))}
                            </div>
                          )}

                          <div className="flex gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">정답: </span>
                              <span className="font-medium text-green-700">{q.correct_answer}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">내 답: </span>
                              <span className={`font-medium ${q.is_correct ? "text-green-700" : "text-destructive"}`}>
                                {q.user_answer}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* Weakness Tab */}
            <TabsContent value="weakness">
              <div className="space-y-3 mt-4">
                {exam.weakness_analysis.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      모든 문제를 맞혀서 약점 분석이 필요 없습니다!
                    </CardContent>
                  </Card>
                ) : (
                  exam.weakness_analysis.map((w, i) => (
                    <Card key={i}>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="destructive">Q{w.question_number}</Badge>
                          <span className="font-medium">{w.category}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">세부 유형: </span>
                            {w.sub_category}
                          </div>
                          <div>
                            <span className="text-muted-foreground">오류 유형: </span>
                            {w.error_type}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>

            {/* Statistics Tab */}
            <TabsContent value="statistics">
              {exam.statistics && (
                <div className="space-y-6 mt-4">
                  {/* Performance Summary */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">종합 평가</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm leading-relaxed">{exam.statistics.performance_summary}</p>
                    </CardContent>
                  </Card>

                  <div className="grid md:grid-cols-2 gap-6">
                    {/* Radar Chart */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">능력 레이더</CardTitle>
                      </CardHeader>
                      <CardContent className="flex justify-center">
                        <RadarChart data={exam.statistics.radar_data} />
                      </CardContent>
                    </Card>

                    {/* Category Accuracy */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">카테고리별 정답률</CardTitle>
                        <CardDescription>
                          가장 빈번한 실수: {exam.statistics.most_frequent_mistake}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {exam.statistics.category_accuracy.map((cat, i) => (
                          <div key={i}>
                            <div className="flex items-center justify-between text-sm mb-1">
                              <span>{cat.category}</span>
                              <span className="font-medium">
                                {Math.round(cat.accuracy * 100)}% ({cat.correct}/{cat.total})
                              </span>
                            </div>
                            <Progress
                              value={cat.accuracy * 100}
                              indicatorClassName={
                                cat.accuracy >= 0.8
                                  ? "bg-green-500"
                                  : cat.accuracy >= 0.5
                                    ? "bg-yellow-500"
                                    : "bg-destructive"
                              }
                            />
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Practice Tab */}
            <TabsContent value="practice">
              <div className="space-y-6 mt-4">
                {exam.practice_sets.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      모든 문제를 맞혀서 유사 문제가 생성되지 않았습니다!
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    <div className="flex justify-end">
                      <Link href={`/exams/${exam.exam_id}/practice`}>
                        <Button>
                          <BookOpen className="h-4 w-4" />
                          풀기 모드로 시작
                        </Button>
                      </Link>
                    </div>

                    {exam.practice_sets.map((ps, i) => (
                      <Card key={i}>
                        <CardHeader>
                          <CardTitle className="text-base">{ps.category}</CardTitle>
                          <CardDescription>{ps.questions.length}문항</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {ps.questions.map((pq, j) => (
                            <div key={j} className="border-b last:border-0 pb-3 last:pb-0">
                              <p className="text-sm font-medium mb-1">
                                {j + 1}. {pq.question}
                              </p>
                              {pq.choices && (
                                <div className="text-sm text-muted-foreground space-y-0.5 ml-4">
                                  {pq.choices.map((c, k) => (
                                    <p key={k}>{c}</p>
                                  ))}
                                </div>
                              )}
                              <p className="text-xs text-muted-foreground mt-1 ml-4">
                                정답: <span className="font-medium text-green-700">{pq.answer}</span>
                              </p>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    ))}
                  </>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </main>
  );
}
