// ============================================================
// lib/search.ts
// Fuse.js 기반 퍼지 검색 모듈 — 6권 교재 통합 검색
// exports: SearchResult, BookInfo, searchBooks, getAllBooks, getBookByName
// ============================================================

import Fuse from 'fuse.js';

// ─── 타입 정의 ──────────────────────────────────────────────

export interface SearchResult {
  id: string;
  book: string;                   // 교재 이름
  bookFile: string;               // JSON 파일명
  chapter: string;                // 챕터 이름
  chapterNum: number;             // 챕터 번호
  section: string;                // 섹션 (예: "1.3")
  title: string;                  // 섹션 제목
  content: string;                // 본문 내용
  formulas: string[];             // 공식 목록
  pageRange: string;              // 페이지 범위 (예: "1-22")
}

export interface BookInfo {
  name: string;
  file: string;
  pdf: string;
  chapterCount: number;
}

// ─── 교재 정보 (books.json과 동기) ──────────────────────────

const BOOKS: BookInfo[] = [
  {
    name: '공학 열역학의 기초 (Fundamentals of Engineering Thermodynamics)',
    file: 'fundamentals_of_engineering_thermodynamics_9th_edition.json',
    pdf: 'Fundamentals of Engineering Thermodynamics, 9th edition (2018) ( etc.) (Z-Library)_ko.pdf',
    chapterCount: 15,
  },
  {
    name: '공학 역학: 동역학 (Engineering Mechanics: Dynamics)',
    file: 'meriams_engineering_mechanics_dynamics_9th_edition.json',
    pdf: 'Meriams Engineering Mechanics Dynamics, SI Version, 9ed, Global ed (J.L. Meriam, L.G. Kraige, J.N. Bolton) (Z-Library)_ko.pdf',
    chapterCount: 8,
  },
  {
    name: '엔지니어를 위한 벡터 역학: 정역학 및 동역학',
    file: 'vector_mechanics_engineers_statics_dynamics_12th_edition.json',
    pdf: 'Vector Mechanics for Engineers Statics  Dynamics, 12th edition (2019) ( etc.) (Z-Library)_ko.pdf',
    chapterCount: 19,
  },
  {
    name: '공학자를 위한 벡터 역학: 역학 (Vector Mechanics for Engineers: Dynamics)',
    file: 'vector_mechanics_for_engineers_dynamics_11th_edition.json',
    pdf: 'Vector Mechanics For Engineers Dynamics (Ferdinand P. Beer, E. Russel Johnston Jr. etc.) (Z-Library)_ko.pdf',
    chapterCount: 9,
  },
  {
    name: '재료역학 (Mechanics of Materials)',
    file: 'mechanics_of_materials_10th_edition.json',
    pdf: 'Mechanics of Materials, 10th Edition (R.C. Hibbeler) (Z-Library)_ko.pdf',
    chapterCount: 14,
  },
  {
    name: '기계공작법 (Manufacturing Processes for Engineering Materials)',
    file: 'manufacturing_processes_engineering_materials.json',
    pdf: 'Manufacturing Processes for Engineering Materials (Kalpakjian, Schmid) (Z-Library)_ko.pdf',
    chapterCount: 12,
  },
];

// ─── Fuse.js 옵션 ────────────────────────────────────────────

const FUSE_OPTIONS: Fuse.IFuseOptions<SearchResult> = {
  keys: [
    { name: 'title',   weight: 0.35 },
    { name: 'content', weight: 0.30 },
    { name: 'chapter', weight: 0.15 },
    { name: 'section', weight: 0.10 },
    { name: 'book',    weight: 0.10 },
  ],
  threshold: 0.4,
  location: 0,
  distance: 100,
  maxPatternLength: 32,
  minMatchCharLength: 2,
  includeScore: true,
  shouldSort: true,
};

// ─── 검색 인덱스 캐시 및 초기화 ──────────────────────────────

let indexCache: SearchResult[] | null = null;
let fuseInstance: Fuse<SearchResult> | null = null;
let loadPromise: Promise<void> | null = null;

/**
 * search-index.json을 비동기로 로드한다.
 * 한 번만 실행되고, 이후는 캐시를 사용한다.
 * 앱 초기화 시(예: layout.tsx, 루트 컴포넌트) 호출하여 미리 로드하면 좋음.
 */
export function initSearchIndex(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const response = await fetch('/data/search-index.json');
      if (!response.ok) {
        throw new Error(`search-index.json 로드 실패: ${response.status}`);
      }
      const data: SearchResult[] = await response.json();
      indexCache = data;
      fuseInstance = new Fuse(data, FUSE_OPTIONS);
    } catch (e) {
      console.error('검색 인덱스 로드 오류:', e);
      indexCache = [];
      fuseInstance = new Fuse<SearchResult>([], FUSE_OPTIONS);
    }
  })();

  return loadPromise;
}

// 앱 로드 시 자동 초기화 시도 (클라이언트에서만)
if (typeof window !== 'undefined') {
  initSearchIndex();
}

// ─── Fuse 인스턴스 가져오기 (동기) ──────────────────────────

function getFuse(): Fuse<SearchResult> {
  // 캐시가 이미 로드된 경우
  if (fuseInstance) return fuseInstance;
  // 아직 로드되지 않은 경우 빈 인스턴스 반환 (첫 검색 시 빈 결과)
  return new Fuse<SearchResult>([], FUSE_OPTIONS);
}

// ─── 검색 (동기) ─────────────────────────────────────────────

interface SearchOptions {
  books?: string[];               // 필터링할 교재 이름 목록 (빈 배열이면 전체)
  limit?: number;                 // 최대 결과 수 (기본 20)
}

/**
 * 퍼지 검색을 동기적으로 수행한다.
 * initSearchIndex()가 완료되어야 결과가 반환된다.
 * @param query 검색어
 * @param options 검색 옵션
 */
export function searchBooks(query: string, options?: SearchOptions): SearchResult[] {
  if (!query || !query.trim()) return [];

  const fuse = getFuse();
  const { books: bookFilter, limit = 20 } = options || {};

  // Fuse.js 검색 실행
  const fuseResults = fuse.search(query.trim());

  // 결과 정리
  let results: SearchResult[] = fuseResults.map((r) => r.item);

  // 교재 필터링
  if (bookFilter && bookFilter.length > 0) {
    results = results.filter((r) =>
      bookFilter.some((b) =>
        r.book.toLowerCase().includes(b.toLowerCase()) ||
        b.toLowerCase().includes(r.book.toLowerCase())
      )
    );
  }

  return results.slice(0, limit);
}

// ─── 교재 목록 조회 ─────────────────────────────────────────

/**
 * 모든 교재 정보를 반환한다.
 */
export function getAllBooks(): BookInfo[] {
  return BOOKS;
}

/**
 * 교재 이름으로 특정 교재 정보를 조회한다.
 * @param name 교재 이름 (부분 일치 가능)
 */
export function getBookByName(name: string): BookInfo | undefined {
  if (!name) return undefined;
  const lowerName = name.toLowerCase();
  return BOOKS.find(
    (b) =>
      b.name.toLowerCase().includes(lowerName) ||
      lowerName.includes(b.name.toLowerCase())
  );
}
