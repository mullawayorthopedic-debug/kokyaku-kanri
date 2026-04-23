-- 整体回数券・ダイエット回数券メニューを追加
-- 全クリニックに対して追加（既存の場合はスキップ）

-- 整体回数券（施術時間40分）
INSERT INTO cm_base_menus (clinic_id, name, price, duration_minutes, description, sort_order, is_active)
SELECT clinic_id, '整体回数券', 0, 40, '整体回数券施術（40分）',
  COALESCE((SELECT MAX(sort_order) FROM cm_base_menus bm WHERE bm.clinic_id = c.clinic_id), 0) + 1,
  true
FROM (SELECT DISTINCT clinic_id FROM cm_base_menus) c
WHERE NOT EXISTS (
  SELECT 1 FROM cm_base_menus WHERE clinic_id = c.clinic_id AND name = '整体回数券'
);

-- ダイエット回数券（施術時間50分）
INSERT INTO cm_base_menus (clinic_id, name, price, duration_minutes, description, sort_order, is_active)
SELECT clinic_id, 'ダイエット回数券', 0, 50, 'ダイエット回数券施術（50分）',
  COALESCE((SELECT MAX(sort_order) FROM cm_base_menus bm WHERE bm.clinic_id = c.clinic_id), 0) + 1,
  true
FROM (SELECT DISTINCT clinic_id FROM cm_base_menus) c
WHERE NOT EXISTS (
  SELECT 1 FROM cm_base_menus WHERE clinic_id = c.clinic_id AND name = 'ダイエット回数券'
);

-- 既存のダイエット回数券の施術時間を50分に更新（既に追加済みの場合）
UPDATE cm_base_menus SET duration_minutes = 50, description = 'ダイエット回数券施術（50分）'
WHERE name = 'ダイエット回数券';

-- 既存の整体回数券の施術時間を40分に確認更新
UPDATE cm_base_menus SET duration_minutes = 40, description = '整体回数券施術（40分）'
WHERE name = '整体回数券';
