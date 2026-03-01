"""Prompt templates for OpenAI calls in the exam analysis pipeline.

Each prompt is a function that accepts dynamic data and returns
the full system + user message pair. Keeping prompts in one module
makes them easy to version, test, and A/B swap.
"""


# ─── 1. Question Structure Parsing (OCR text → structured JSON) ─────────────

QUESTION_PARSE_SYSTEM = """\
You are an expert exam parser. You receive raw OCR text extracted from an exam \
sheet. Your job is to identify every question, its type, the answer choices \
(if multiple-choice), the correct answer, and the user's answer.

Rules:
- Detect question boundaries by numbering patterns (1., 2., Q1, #1, etc.).
- Classify each question as "multiple_choice" or "subjective".
- For multiple-choice, extract the list of choices exactly as written.
- If the correct answer and user answer are marked (e.g., circled, underlined, \
  or annotated), extract both. If only one is available, use best judgment.
- Preserve original text; do NOT rephrase questions.
- If you cannot determine a field, use an empty string — never omit the key.
- Return ONLY valid JSON matching the schema."""


def build_question_parse_prompt(ocr_text: str) -> str:
    return (
        "Parse the following exam OCR text into structured questions.\n\n"
        "--- BEGIN OCR TEXT ---\n"
        f"{ocr_text}\n"
        "--- END OCR TEXT ---"
    )


# ─── 2. Subjective Answer Grading ───────────────────────────────────────────

SUBJECTIVE_GRADING_SYSTEM = """\
You are a fair, expert exam grader. You will receive subjective questions with \
the correct (reference) answer and the user's answer. Evaluate semantic \
correctness, not surface-level string matching.

Rules:
- similarity_score: 0.0 = completely wrong, 1.0 = perfect match.
- is_correct: true if similarity_score >= 0.7.
- reasoning: one concise sentence explaining your judgment.
- Be lenient for minor spelling/grammar differences if the meaning is correct.
- Return ONLY valid JSON matching the schema."""


def build_subjective_grading_prompt(
    questions: list[dict],
) -> str:
    lines = []
    for q in questions:
        lines.append(
            f"Q{q['number']}: {q['question_text']}\n"
            f"  Correct answer: {q['correct_answer']}\n"
            f"  User answer: {q['user_answer']}"
        )
    return (
        "Grade the following subjective answers.\n\n"
        + "\n\n".join(lines)
    )


# ─── 3. Weakness Categorization ─────────────────────────────────────────────

WEAKNESS_ANALYSIS_SYSTEM = """\
You are an educational diagnostics expert. Given a list of questions that \
the student answered incorrectly, classify each into:

- category: the broad grammar/knowledge area (e.g., "Verb tenses", \
  "Objective pronoun", "Reading comprehension").
- sub_category: the specific concept within the category \
  (e.g., "past perfect vs. simple past", "me vs. I confusion").
- error_type: the nature of the mistake \
  (e.g., "form confusion", "misinterpretation", "careless error").

Rules:
- Be specific. Avoid vague categories like "Grammar" alone.
- Classify based on the question content AND why the user's answer is wrong.
- Return ONLY valid JSON matching the schema."""


def build_weakness_analysis_prompt(
    wrong_questions: list[dict],
) -> str:
    lines = []
    for q in wrong_questions:
        lines.append(
            f"Q{q['number']}: {q['question_text']}\n"
            f"  Correct answer: {q['correct_answer']}\n"
            f"  User answer: {q['user_answer']}"
        )
    return (
        "Analyze the following incorrectly answered questions.\n\n"
        + "\n\n".join(lines)
    )


# ─── 4. Statistics & Summary ────────────────────────────────────────────────

STATISTICS_SYSTEM = """\
You are an educational data analyst. Given a full exam result (questions, \
correctness, and weakness categories), produce:

1. category_accuracy: accuracy percentage per category.
2. most_frequent_mistake: the single most common error category.
3. radar_data: 5-8 skill axes with scores 0.0-1.0 for a radar chart.
4. performance_summary: a 2-3 sentence paragraph summarizing the student's \
   performance, strengths, and areas to improve.

Rules:
- Derive categories from the questions, not from external knowledge.
- radar_data axes should cover distinct skill areas found in this exam.
- Return ONLY valid JSON matching the schema."""


def build_statistics_prompt(
    questions: list[dict],
    weaknesses: list[dict],
) -> str:
    q_lines = []
    for q in questions:
        q_lines.append(
            f"Q{q['number']} [{q['type']}] correct={q['is_correct']} "
            f"| {q['question_text'][:120]}"
        )
    w_lines = []
    for w in weaknesses:
        w_lines.append(
            f"Q{w['question_number']}: {w['category']} / "
            f"{w['sub_category']} / {w['error_type']}"
        )

    return (
        "Generate statistics for this exam.\n\n"
        "== Questions ==\n" + "\n".join(q_lines) + "\n\n"
        "== Weaknesses ==\n" + "\n".join(w_lines)
    )


# ─── 5. Similar Question Generation ─────────────────────────────────────────

PRACTICE_GENERATION_SYSTEM = """\
You are an expert question writer for educational practice. Given a list of \
weakness categories with example questions the student got wrong, generate \
5 new practice questions PER category.

Rules:
- Each question must test the SAME concept as the original weakness.
- Vary surface details (names, numbers, sentence structure) so it is not a copy.
- For multiple-choice, provide exactly 4 choices (A-D).
- Adaptive difficulty: make 2 questions easier, 2 at the same level, and 1 harder.
- Include the correct answer for each question.
- Return ONLY valid JSON matching the schema."""


def build_practice_generation_prompt(
    weakness_groups: list[dict],
) -> str:
    """weakness_groups: [{"category": "...", "examples": [{"question_text": "...", ...}]}]"""
    lines = []
    for group in weakness_groups:
        lines.append(f"Category: {group['category']}")
        for ex in group["examples"]:
            lines.append(
                f"  Example wrong Q: {ex['question_text']}\n"
                f"    Correct: {ex['correct_answer']}  |  User wrote: {ex['user_answer']}"
            )
        lines.append("")
    return (
        "Generate practice questions for each weakness category below.\n\n"
        + "\n".join(lines)
    )
