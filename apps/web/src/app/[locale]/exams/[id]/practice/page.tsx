"use client";

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Trophy,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { use, useCallback, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useExamDetail } from "@/lib/api/exams/hooks";
import type { PracticeQuestion } from "@/lib/api/exams/types";
import { cn } from "@/lib/utils";

interface FlatQuestion extends PracticeQuestion {
  category: string;
  index: number;
}

type QuizState = "solving" | "result";

export default function PracticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: exam, isLoading } = useExamDetail(id);

  // Flatten all practice questions into a single list
  const flatQuestions = useMemo<FlatQuestion[]>(() => {
    if (!exam?.practice_sets) return [];
    let idx = 0;
    return exam.practice_sets.flatMap((ps) =>
      ps.questions.map((q) => ({
        ...q,
        category: ps.category,
        index: idx++,
      }))
    );
  }, [exam]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Map<number, string>>(new Map());
  const [showAnswer, setShowAnswer] = useState(false);
  const [quizState, setQuizState] = useState<QuizState>("solving");
  const [subjectiveInput, setSubjectiveInput] = useState("");

  const currentQ = flatQuestions[currentIndex];
  const totalQuestions = flatQuestions.length;
  const answeredCount = answers.size;

  const selectAnswer = useCallback(
    (answer: string) => {
      if (showAnswer) return;
      setAnswers((prev) => new Map(prev).set(currentIndex, answer));
      setShowAnswer(true);
    },
    [currentIndex, showAnswer]
  );

  const submitSubjective = useCallback(() => {
    if (!subjectiveInput.trim() || showAnswer) return;
    setAnswers((prev) => new Map(prev).set(currentIndex, subjectiveInput.trim()));
    setShowAnswer(true);
  }, [currentIndex, showAnswer, subjectiveInput]);

  const goNext = useCallback(() => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((i) => i + 1);
      setShowAnswer(false);
      setSubjectiveInput("");
    }
  }, [currentIndex, totalQuestions]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setShowAnswer(answers.has(currentIndex - 1));
      setSubjectiveInput("");
    }
  }, [currentIndex, answers]);

  const finishQuiz = useCallback(() => {
    setQuizState("result");
  }, []);

  const resetQuiz = useCallback(() => {
    setCurrentIndex(0);
    setAnswers(new Map());
    setShowAnswer(false);
    setSubjectiveInput("");
    setQuizState("solving");
  }, []);

  // Calculate results
  const results = useMemo(() => {
    let correct = 0;
    answers.forEach((ans, idx) => {
      const q = flatQuestions[idx];
      if (q && ans.trim().toUpperCase() === q.answer.trim().toUpperCase()) {
        correct++;
      }
    });
    return { correct, incorrect: answeredCount - correct, total: answeredCount };
  }, [answers, flatQuestions, answeredCount]);

  if (isLoading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </main>
    );
  }

  if (!exam || totalQuestions === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-center text-muted-foreground py-20">유사 문제가 없습니다.</p>
        <div className="text-center">
          <Link href={`/exams/${id}`}>
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              돌아가기
            </Button>
          </Link>
        </div>
      </main>
    );
  }

  // ── Result Screen ──
  if (quizState === "result") {
    const accuracy = results.total > 0 ? results.correct / results.total : 0;

    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Card>
          <CardContent className="py-12 text-center">
            <Trophy className="h-16 w-16 mx-auto mb-4 text-yellow-500" />
            <h2 className="text-2xl font-bold mb-2">연습 완료!</h2>

            <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto my-6">
              <div>
                <p className="text-3xl font-bold text-primary">{Math.round(accuracy * 100)}%</p>
                <p className="text-xs text-muted-foreground">정답률</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-green-600">{results.correct}</p>
                <p className="text-xs text-muted-foreground">정답</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-destructive">{results.incorrect}</p>
                <p className="text-xs text-muted-foreground">오답</p>
              </div>
            </div>

            {/* Per-question breakdown */}
            <div className="text-left space-y-2 mt-6 max-w-md mx-auto">
              {flatQuestions.map((q) => {
                const userAns = answers.get(q.index);
                const isCorrect = userAns?.trim().toUpperCase() === q.answer.trim().toUpperCase();
                return (
                  <div
                    key={`result-${q.index}-${q.question}`}
                    className="flex items-center gap-2 text-sm"
                  >
                    {isCorrect ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive shrink-0" />
                    )}
                    <span className="truncate flex-1">{q.question}</span>
                    {!isCorrect && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        정답: {q.answer}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3 justify-center mt-8">
              <Button variant="outline" onClick={resetQuiz}>
                <RotateCcw className="h-4 w-4" />
                다시 풀기
              </Button>
              <Link href={`/exams/${id}`}>
                <Button>
                  <ArrowLeft className="h-4 w-4" />
                  분석 결과로
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  // ── Solving Screen ──
  const isMultipleChoice = currentQ.choices && currentQ.choices.length > 0;
  const userAnswer = answers.get(currentIndex);
  const isCorrect = userAnswer?.trim().toUpperCase() === currentQ.answer.trim().toUpperCase();

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4">
        <Link
          href={`/exams/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          돌아가기
        </Link>
        <Badge variant="secondary">{currentQ.category}</Badge>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {currentIndex + 1} / {totalQuestions}
        </span>
        <Progress value={((currentIndex + 1) / totalQuestions) * 100} className="flex-1" />
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {answeredCount}문항 완료
        </span>
      </div>

      {/* Question Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg leading-relaxed">{currentQ.question}</CardTitle>
        </CardHeader>
        <CardContent>
          {isMultipleChoice ? (
            <div className="space-y-2">
              {currentQ.choices!.map((choice) => {
                const letter = choice.charAt(0).toUpperCase();
                const isSelected = userAnswer === letter || userAnswer === choice;
                const isCorrectChoice =
                  currentQ.answer.trim().toUpperCase() === letter ||
                  currentQ.answer.trim().toUpperCase() === choice.trim().toUpperCase();

                return (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => selectAnswer(letter)}
                    disabled={showAnswer}
                    className={cn(
                      "w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors",
                      !showAnswer && "hover:bg-muted cursor-pointer",
                      showAnswer &&
                        isCorrectChoice &&
                        "border-green-500 bg-green-50 text-green-800",
                      showAnswer &&
                        isSelected &&
                        !isCorrectChoice &&
                        "border-destructive bg-red-50 text-destructive",
                      !showAnswer && isSelected && "border-primary bg-primary/5"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span>{choice}</span>
                      {!!(showAnswer && isCorrectChoice) && (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      )}
                      {!!(showAnswer && isSelected && !isCorrectChoice) && (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              <input
                type="text"
                value={subjectiveInput}
                onChange={(e) => setSubjectiveInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitSubjective()}
                placeholder="답을 입력하세요..."
                disabled={showAnswer}
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              />
              {!showAnswer && (
                <Button onClick={submitSubjective} disabled={!subjectiveInput.trim()} size="sm">
                  제출
                </Button>
              )}
            </div>
          )}

          {/* Feedback */}
          {!!showAnswer && (
            <div
              className={cn(
                "mt-4 p-3 rounded-lg text-sm",
                isCorrect ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
              )}
            >
              {isCorrect ? (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  정답입니다!
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  <span>
                    오답입니다. 정답: <strong>{currentQ.answer}</strong>
                  </span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={goPrev} disabled={currentIndex === 0}>
          <ArrowLeft className="h-4 w-4" />
          이전
        </Button>

        {currentIndex === totalQuestions - 1 && answeredCount === totalQuestions ? (
          <Button onClick={finishQuiz}>
            <Trophy className="h-4 w-4" />
            결과 보기
          </Button>
        ) : (
          <Button onClick={goNext} disabled={currentIndex === totalQuestions - 1}>
            다음
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </main>
  );
}
