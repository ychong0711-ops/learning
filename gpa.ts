// ============================================================
// lib/gpa.ts
// GPA 추적, 학점 계산, 학습 기록 분석 모듈
// exports:
//   GPATrackingData, CorrelationResult
//   loadGPAData, calculateSubjectGPA, calculateOverallGPA
//   calculateGoalProgress, setTargetGPA, setCurrentGrade
//   analyzeCorrelation, getWeeklyStudyTime, calculateStudyEfficiency
// ============================================================

// ─── 타입 정의 ──────────────────────────────────────────────

export interface SubjectGrade {
  id: string;                     // 과제/시험 고유 ID
  type: 'assignment' | 'exam';
  title: string;
  score: number;                  // 0~100
  weight: number;                 // 가중치 (예: 0.3 = 30%)
  date: string;                   // ISO 날짜
}

export interface Subject {
  id: string;
  name: string;
  credits: number;
  targetGPA: number;              // 목표 학점 (0~4.5)
  currentGrade: number | null;    // 현재 학점 (직접 설정 가능)
  semester: string;               // 예: "1-1", "2-2"
  assignments: SubjectGrade[];
  exams: SubjectGrade[];
}

export interface StudyRecord {
  id?: string;
  date: string;                   // ISO 날짜
  duration: number;               // 학습 시간 (분)
  subject?: string;               // 과목명 (선택)
  deckId?: string;                // 관련 덱 ID (선택)
  cardsStudied?: number;
  correctRate?: number;           // 정답율 (0~1)
}

export interface GPATrackingData {
  version: string;
  lastUpdated: string;
  subjects: Subject[];
  studyRecords: StudyRecord[];
  settings: {
    gpaScale: number;             // 최대 학점 (기본 4.5)
    weightType: 'credits' | 'equal';
    notifications: {
      goalReminder: boolean;
      progressUpdate: boolean;
      weaknessAlert: boolean;
    };
  };
}

export interface CorrelationResult {
  overallCorrelation: number;       // -1 ~ 1
  subjectCorrelations: SubjectCorrelation[];
  trend: 'positive' | 'neutral' | 'negative';
  summary: string;
}

interface SubjectCorrelation {
  subjectName: string;
  correlation: number;
  studyHours: number;
  averageScore: number;
}

// ─── localStorage 키 ────────────────────────────────────────

const GPA_DATA_KEY = 'gpa_tracking_data';

// ─── 기본 데이터 ─────────────────────────────────────────────

function getDefaultGPAData(): GPATrackingData {
  return {
    version: '1.0',
    lastUpdated: new Date().toISOString(),
    subjects: [],
    studyRecords: [],
    settings: {
      gpaScale: 4.5,
      weightType: 'credits',
      notifications: {
        goalReminder: true,
        progressUpdate: true,
        weaknessAlert: true,
      },
    },
  };
}

// ─── 저장·로드 ───────────────────────────────────────────────

function saveGPAData(data: GPATrackingData): void {
  if (typeof window === 'undefined') return;
  try {
    data.lastUpdated = new Date().toISOString();
    localStorage.setItem(GPA_DATA_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('GPA 데이터 저장 실패:', e);
  }
}

/**
 * localStorage에서 GPA 데이터를 로드한다.
 * 데이터가 없으면 기본값을 반환한다.
 */
export function loadGPAData(): GPATrackingData {
  if (typeof window === 'undefined') return getDefaultGPAData();
  try {
    const raw = localStorage.getItem(GPA_DATA_KEY);
    if (!raw) return getDefaultGPAData();
    const data = JSON.parse(raw) as GPATrackingData;
    // 필수 필드 검증
    if (!data.subjects) data.subjects = [];
    if (!data.studyRecords) data.studyRecords = [];
    if (!data.settings) data.settings = getDefaultGPAData().settings;
    return data;
  } catch (e) {
    console.error('GPA 데이터 로드 실패:', e);
    return getDefaultGPAData();
  }
}

// ─── 학점 계산 ───────────────────────────────────────────────

/**
 * 점수(0~100)를 GPA 스케일로 변환한다.
 * 기본 스케일: 4.5
 */
function scoreTtoGPA(score: number, scale: number = 4.5): number {
  if (score >= 95) return scale;           // A+
  if (score >= 90) return scale - 0.2;     // A
  if (score >= 85) return scale - 0.5;     // A-  (3.5 on 4.0)
  if (score >= 80) return scale - 1.0;     // B+
  if (score >= 75) return scale - 1.3;     // B
  if (score >= 70) return scale - 1.5;     // B-
  if (score >= 65) return scale - 2.0;     // C+
  if (score >= 60) return scale - 2.3;     // C
  if (score >= 55) return scale - 2.5;     // C-
  if (score >= 50) return scale - 3.0;     // D
  return 0;                                // F
}

/**
 * 단일 과목의 GPA를 계산한다.
 * currentGrade가 직접 설정되어 있으면 그것을 반환한다.
 * 그렇지 않으면 assignments + exams의 가중평균 점수를 GPA로 변환한다.
 */
export function calculateSubjectGPA(subject: Subject): number | null {
  if (subject.currentGrade !== null && subject.currentGrade !== undefined) {
    return subject.currentGrade;
  }

  const allGrades = [...(subject.assignments || []), ...(subject.exams || [])];
  if (allGrades.length === 0) return null;

  let totalWeightedScore = 0;
  let totalWeight = 0;

  allGrades.forEach((g) => {
    totalWeightedScore += g.score * g.weight;
    totalWeight += g.weight;
  });

  if (totalWeight === 0) return null;

  const averageScore = totalWeightedScore / totalWeight;
  return parseFloat(scoreTtoGPA(averageScore).toFixed(2));
}

/**
 * 전체 학점 평균(Overall GPA)을 학점 가중평균으로 계산한다.
 */
export function calculateOverallGPA(subjects: Subject[]): number {
  if (!subjects || subjects.length === 0) return 0;

  let totalWeightedGPA = 0;
  let totalCredits = 0;

  subjects.forEach((s) => {
    const gpa = calculateSubjectGPA(s);
    if (gpa !== null) {
      totalWeightedGPA += gpa * s.credits;
      totalCredits += s.credits;
    }
  });

  return totalCredits > 0 ? parseFloat((totalWeightedGPA / totalCredits).toFixed(2)) : 0;
}

// ─── 목표 관리 ───────────────────────────────────────────────

/**
 * 과목의 목표 달성도를 백분율로 반환한다. (0~100+)
 */
export function calculateGoalProgress(subject: Subject): number {
  const currentGPA = calculateSubjectGPA(subject);
  if (currentGPA === null) return 0;
  return parseFloat(((currentGPA / subject.targetGPA) * 100).toFixed(1));
}

/**
 * 과목의 목표 학점을 설정한다.
 */
export function setTargetGPA(subjectId: string, targetGPA: number): void {
  const data = loadGPAData();
  const subject = data.subjects.find((s) => s.id === subjectId);
  if (subject) {
    subject.targetGPA = targetGPA;
    saveGPAData(data);
  }
}

/**
 * 과목의 현재 학점을 직접 설정한다.
 */
export function setCurrentGrade(subjectId: string, grade: number | null): void {
  const data = loadGPAData();
  const subject = data.subjects.find((s) => s.id === subjectId);
  if (subject) {
    subject.currentGrade = grade;
    saveGPAData(data);
  }
}

// ─── 학습 기록 분석 ─────────────────────────────────────────

/**
 * 학습 기록과 과목 정보를 기반으로 상관관계를 분석한다.
 * 학습 시간과 점수 사이의 관계를 평가한다.
 */
export function analyzeCorrelation(studyRecords: StudyRecord[], subjects: Subject[]): CorrelationResult {
  const subjectCorrelations: SubjectCorrelation[] = [];

  subjects.forEach((s) => {
    // 해당 과목의 학습 기록 필터링
    const subjectRecords = studyRecords.filter(
      (r) => r.subject === s.name || r.subject === s.id
    );

    const studyHours = subjectRecords.reduce((sum, r) => sum + (r.duration || 0), 0) / 60;

    // 과목 점수 평균
    const allGrades = [...(s.assignments || []), ...(s.exams || [])];
    const averageScore = allGrades.length > 0
      ? allGrades.reduce((sum, g) => sum + g.score, 0) / allGrades.length
      : (s.currentGrade ? s.currentGrade * 25 : 0); // GPA를 대략적 점수로 역변환

    // 단순 선형 상관도 추정: 학습 시간이 높을수록 점수가 높으면 양의 상관
    // 단순히 학습 시간과 점수의 정규화된 비율로 계산
    let correlation = 0;
    if (studyHours > 0 && averageScore > 0) {
      const normalizedHours = Math.min(studyHours / 20, 1); // 20시간 기준 정규화
      const normalizedScore = Math.min(averageScore / 100, 1);
      correlation = parseFloat((normalizedHours * 0.5 + normalizedScore * 0.5).toFixed(2));
    }

    subjectCorrelations.push({
      subjectName: s.name,
      correlation,
      studyHours: parseFloat(studyHours.toFixed(1)),
      averageScore: parseFloat(averageScore.toFixed(1)),
    });
  });

  // 전체 상관도: 과목별 상관도의 평균
  const overallCorrelation = subjectCorrelations.length > 0
    ? subjectCorrelations.reduce((sum, sc) => sum + sc.correlation, 0) / subjectCorrelations.length
    : 0;

  const trend: 'positive' | 'neutral' | 'negative' =
    overallCorrelation >= 0.6 ? 'positive' : overallCorrelation >= 0.3 ? 'neutral' : 'negative';

  let summary = '';
  switch (trend) {
    case 'positive':
      summary = '학습 시간과 성적 사이에 양의 상관관계가 보입니다. 현재 학습 패턴이 효과적입니다.';
      break;
    case 'neutral':
      summary = '학습 시간과 성적의 관계가 불분명합니다. 학습 방법의 효율도를 검토해보세요.';
      break;
    case 'negative':
      summary = '학습 시간이 성적 향상과 연결되지 않는 경우가 있습니다. 학습 전략을 조정하세요.';
      break;
  }

  return {
    overallCorrelation: parseFloat(overallCorrelation.toFixed(2)),
    subjectCorrelations,
    trend,
    summary,
  };
}

/**
 * 지정된 기간 내의 주간 학습 시간을 반환한다.
 * @param studyRecords 학습 기록 배열
 * @param weeks 확인할 주간 수 (기본 4주)
 */
export function getWeeklyStudyTime(studyRecords: StudyRecord[], weeks: number = 4): Record<string, number> {
  const weeklyTime: Record<string, number> = {};
  const now = new Date();

  studyRecords.forEach((r) => {
    const recordDate = new Date(r.date);
    const diffDays = Math.floor((now.getTime() - recordDate.getTime()) / (1000 * 60 * 60 * 24));
    const weekNum = Math.floor(diffDays / 7);

    if (weekNum < weeks) {
      const weekLabel = weekNum === 0 ? '이번 주' : `${weekNum}주 전`;
      weeklyTime[weekLabel] = (weeklyTime[weekLabel] || 0) + (r.duration || 0);
    }
  });

  // 분을 시간으로 변환
  Object.keys(weeklyTime).forEach((key) => {
    weeklyTime[key] = parseFloat((weeklyTime[key] / 60).toFixed(1));
  });

  return weeklyTime;
}

/**
 * 학습 효율성을 계산한다: (정답율 × 학습 카드 수) / 학습 시간
 * @param studyRecords 학습 기록 배열
 */
export function calculateStudyEfficiency(studyRecords: StudyRecord[]): number {
  if (!studyRecords || studyRecords.length === 0) return 0;

  let totalEfficiency = 0;
  let validRecords = 0;

  studyRecords.forEach((r) => {
    if (r.duration && r.duration > 0 && r.cardsStudied && r.cardsStudied > 0) {
      const correctRate = r.correctRate || 0.5;
      const efficiency = (correctRate * r.cardsStudied) / (r.duration / 60); // 카드/시간
      totalEfficiency += efficiency;
      validRecords++;
    }
  });

  return validRecords > 0 ? parseFloat((totalEfficiency / validRecords).toFixed(2)) : 0;
}
