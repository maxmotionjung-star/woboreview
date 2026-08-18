CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  goods_no TEXT NOT NULL UNIQUE,
  name TEXT,
  url TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
  like_count INTEGER,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 기존 DB(이미 review_snapshots가 like_count 없이 생성된 경우)에도 안전하게 적용되도록 별도 ALTER
ALTER TABLE review_snapshots ADD COLUMN IF NOT EXISTS like_count INTEGER;

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
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rank_changes_product_detected
  ON rank_changes (product_id, detected_at DESC);
