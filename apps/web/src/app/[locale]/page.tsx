import { BarChart3, BookOpen, Brain, FileText } from "lucide-react";
import Link from "next/link";
import type { Locale } from "next-intl";
import { setRequestLocale } from "next-intl/server";

interface HomePageProps {
  params: Promise<{ locale: string }>;
}

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-24">
      {/* Hero */}
      <div className="text-center max-w-2xl">
        <h1 className="text-5xl font-bold tracking-tight">오답 연구소</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          시험지를 업로드하면 AI가 채점하고, 약점을 분석하고,
          <br className="hidden sm:block" />
          틀린 문제만 골라 유사 문제를 만들어 드립니다.
        </p>
        <Link
          href="/exams"
          className="mt-8 inline-flex items-center gap-2 rounded-lg bg-primary px-8 py-3 text-base font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
        >
          <FileText className="h-5 w-5" />
          시험 분석 시작하기
        </Link>
      </div>

      {/* Feature Cards */}
      <div className="mt-20 grid gap-6 sm:grid-cols-3 max-w-3xl w-full">
        <div className="rounded-xl border bg-card p-6 text-center">
          <Brain className="h-8 w-8 mx-auto text-primary" />
          <h3 className="mt-3 font-semibold">AI 자동 채점</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            객관식은 자동 매칭, 주관식은 의미 기반으로 채점합니다
          </p>
        </div>
        <div className="rounded-xl border bg-card p-6 text-center">
          <BarChart3 className="h-8 w-8 mx-auto text-primary" />
          <h3 className="mt-3 font-semibold">약점 분석</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            틀린 문제를 카테고리별로 분류하고 취약점을 시각화합니다
          </p>
        </div>
        <div className="rounded-xl border bg-card p-6 text-center">
          <BookOpen className="h-8 w-8 mx-auto text-primary" />
          <h3 className="mt-3 font-semibold">유사 문제 생성</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            틀린 유형만 골라 난이도별 연습 문제를 자동 생성합니다
          </p>
        </div>
      </div>
    </main>
  );
}
