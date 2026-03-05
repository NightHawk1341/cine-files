// ============================================================
// Content Block Types (Article Body)
// ============================================================

export type Block =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; level: 2 | 3 | 4; text: string }
  | { type: 'image'; url: string; alt: string; credit?: string; caption?: string }
  | { type: 'quote'; text: string; author?: string; source?: string }
  | { type: 'list'; style: 'ordered' | 'unordered'; items: string[] }
  | { type: 'embed'; provider: 'youtube' | 'vk_video' | 'rutube'; videoId: string }
  | { type: 'divider' }
  | { type: 'spoiler'; title: string; blocks: Block[] }
  | { type: 'infobox'; title: string; blocks: Block[] }
  | { type: 'tribute_products'; productIds: number[] }
  | { type: 'movie_card'; tmdbEntityId: number };

// ============================================================
// API Response Types
// ============================================================

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface ArticleSummary {
  id: number;
  slug: string;
  title: string;
  lead: string | null;
  coverImageUrl: string | null;
  publishedAt: string | null;
  viewCount: number;
  commentCount: number;
  category: {
    slug: string;
    nameRu: string;
  };
  author: {
    id: number;
    displayName: string | null;
    avatarUrl: string | null;
  };
  tags: Array<{
    tag: {
      slug: string;
      nameRu: string;
      tagType: string;
    };
    isPrimary: boolean;
  }>;
}

export interface TagSummary {
  id: number;
  slug: string;
  nameRu: string;
  nameEn: string | null;
  tagType: string;
  articleCount: number;
}

// ============================================================
// Auth Types
// ============================================================

export type UserRole = 'reader' | 'editor' | 'admin';

export type LoginMethod = 'yandex' | 'vk' | 'telegram';

export type ArticleStatus = 'draft' | 'review' | 'published' | 'archived';

export type TagType =
  | 'movie'
  | 'tv'
  | 'person'
  | 'genre'
  | 'franchise'
  | 'studio'
  | 'topic'
  | 'game'
  | 'anime';
