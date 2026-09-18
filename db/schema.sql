CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  goods_no TEXT NOT NULL UNIQUE,
  name TEXT,
  url TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER,
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 기존 DB에도 안전하게 적용되도록 별도 ALTER (컬럼이 이미 있으면 무시됨)
ALTER TABLE products ADD COLUMN IF NOT EXISTS sort_order INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
UPDATE products SET sort_order = id WHERE sort_order IS NULL;

-- 매 체크 시점의 TOP10 스냅샷. 다음 체크 때 이전 스냅샷과 비교하는 기준이 된다.
CREATE TABLE IF NOT EXISTS review_snapshots (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  review_no BIGINT NOT NULL,
  rank INTEGER NOT NULL,
  nickname TEXT,
  grade TEXT,
  content TEXT,
  image_url TEXT,
  image_urls TEXT[],
  like_count INTEGER,
  review_posted_at TIMESTAMPTZ,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 기존 DB에도 안전하게 적용되도록 별도 ALTER (컬럼이 이미 있으면 무시됨)
ALTER TABLE review_snapshots ADD COLUMN IF NOT EXISTS like_count INTEGER;
ALTER TABLE review_snapshots ADD COLUMN IF NOT EXISTS review_posted_at TIMESTAMPTZ;
ALTER TABLE review_snapshots ADD COLUMN IF NOT EXISTS image_urls TEXT[];

CREATE INDEX IF NOT EXISTS idx_review_snapshots_product_captured
  ON review_snapshots (product_id, captured_at DESC);

-- TOP10 구성원 변경 이벤트 (알림 발송 이력 겸 대시보드 히스토리)
CREATE TABLE IF NOT EXISTS rank_changes (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  review_no BIGINT NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('entered', 'dropped')),
  old_rank INTEGER,
  new_rank INTEGER,
  nickname TEXT,
  grade TEXT,
  image_url TEXT,
  image_urls TEXT[],
  like_count INTEGER,
  review_posted_at TIMESTAMPTZ,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 기존 DB에도 안전하게 적용되도록 별도 ALTER (컬럼이 이미 있으면 무시됨)
ALTER TABLE rank_changes ADD COLUMN IF NOT EXISTS like_count INTEGER;
ALTER TABLE rank_changes ADD COLUMN IF NOT EXISTS image_urls TEXT[];
ALTER TABLE rank_changes ADD COLUMN IF NOT EXISTS review_posted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_rank_changes_product_detected
  ON rank_changes (product_id, detected_at DESC);

-- WORK 화면에서 "도움돼요 눌러야 할 리뷰"로 표시(빨간 테두리)한 기록. 기기 간 공유를 위해 DB에 저장.
-- "전체 보기"는 상품관리에 등록되지 않은(무신사 브랜드 페이지에서 실시간으로만 조회되는) 상품도
-- 포함하므로, product_id가 아니라 goods_no를 기준으로 저장한다.
CREATE TABLE IF NOT EXISTS review_flags (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  goods_no TEXT,
  review_no BIGINT NOT NULL,
  flagged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 기존 DB에도 안전하게 적용되도록 별도 마이그레이션 (이미 적용되어 있으면 무시됨)
ALTER TABLE review_flags ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE review_flags ADD COLUMN IF NOT EXISTS goods_no TEXT;
UPDATE review_flags rf SET goods_no = p.goods_no
  FROM products p WHERE rf.product_id = p.id AND rf.goods_no IS NULL;
DELETE FROM review_flags WHERE goods_no IS NULL;
ALTER TABLE review_flags ALTER COLUMN goods_no SET NOT NULL;
ALTER TABLE review_flags DROP CONSTRAINT IF EXISTS review_flags_product_id_review_no_key;
CREATE UNIQUE INDEX IF NOT EXISTS review_flags_goods_no_review_no_key ON review_flags (goods_no, review_no);
