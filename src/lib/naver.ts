/**
 * Accepts either a bare blog ID or a full blog.naver.com/m.blog.naver.com URL
 * (any path/query) and returns just the ID, so pasting a link works too.
 */
export function extractBlogId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  try {
    const withProtocol = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
    const u = new URL(withProtocol);
    if (/(^|\.)blog\.naver\.com$/.test(u.hostname)) {
      const first = u.pathname.split("/").filter(Boolean)[0];
      if (first) return first;
    }
  } catch {
    // not a URL — fall through and treat the raw input as the ID
  }
  return trimmed;
}

export interface NaverPost {
  logNo: string;
  title: string;
  addDate: string;
  categoryNo: string;
}

interface PostTitleListResponse {
  resultCode: string;
  resultMessage: string;
  postList: {
    logNo: string;
    title: string;
    addDate: string;
    categoryNo: string;
    isPostNotOpen: string;
  }[];
}

const LIST_ENDPOINT = "https://blog.naver.com/PostTitleListAsync.naver";
const COUNT_PER_PAGE = 30;

function decodeTitle(encoded: string): string {
  try {
    return decodeURIComponent(encoded.replace(/\+/g, " "));
  } catch {
    return encoded;
  }
}

/**
 * blog.naver.com's own post-list widget endpoint (used by the blog's UI itself
 * to paginate posts) — the only way to enumerate every post without an official API.
 */
export async function fetchAllNaverPosts(blogId: string): Promise<NaverPost[]> {
  const posts: NaverPost[] = [];
  let page = 1;

  while (true) {
    const url = `${LIST_ENDPOINT}?blogId=${encodeURIComponent(blogId)}&currentPage=${page}&categoryNo=0&parentCategoryNo=&countPerPage=${COUNT_PER_PAGE}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (indexkit-cli)" },
    });

    if (!res.ok) {
      throw new Error(`네이버 블로그 글 목록 요청 실패 (blogId=${blogId}, page=${page}, status=${res.status})`);
    }

    // Naver's response embeds an HTML fragment (pagingHtml) with unescaped
    // single quotes (`\'`), which is invalid JSON — sanitize before parsing.
    const raw = await res.text();
    const data = JSON.parse(raw.replace(/\\'/g, "'")) as PostTitleListResponse;

    if (data.resultCode !== "S") {
      throw new Error(`블로그를 찾을 수 없거나 비공개 상태입니다: ${data.resultMessage || blogId}`);
    }

    if (!data.postList || data.postList.length === 0) break;

    for (const p of data.postList) {
      if (p.isPostNotOpen === "1") continue;
      posts.push({
        logNo: p.logNo,
        title: decodeTitle(p.title),
        addDate: p.addDate,
        categoryNo: p.categoryNo,
      });
    }

    if (data.postList.length < COUNT_PER_PAGE) break;
    page += 1;

    if (page > 500) {
      throw new Error("페이지 수가 비정상적으로 많습니다 (500페이지 초과). 크롤링을 중단합니다.");
    }
  }

  return posts;
}

export function naverPostUrl(blogId: string, logNo: string): string {
  return `https://blog.naver.com/${blogId}/${logNo}`;
}
