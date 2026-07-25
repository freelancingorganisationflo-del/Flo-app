-- ============================================================================
-- OPTIONAL seed data — the 6 skill tracks already defined in the product.
-- Run after schema.sql. Safe to skip and enter these via the Admin panel
-- instead. Does NOT seed members, modules, or assignments — those are real
-- content the admin creates for real.
-- ============================================================================
insert into skills (slug, label, icon, tools, description, member_capacity, order_index) values
  ('video',    'AI Video Editing',  '🎬', 'CapCut AI, Runway',  'Editing reels and short-form video with AI-assisted tools.', 3, 1),
  ('design',   'Brand-Level Design','🎨', 'Canva Pro, Figma',   'Logo, brand kit, and social media design work.', 3, 2),
  ('writing',  'Content Writing',   '✍️', 'ChatGPT, Notion',    'Captions, blogs, and brand-voice writing.', 3, 3),
  ('smm',      'Social Media Mgmt', '📱', 'Buffer, Later',      'Content calendars, scheduling, and engagement strategy.', 3, 4),
  ('adcreate', 'Ad Creative Design','🖼️', 'Canva Pro, Figma',   'Paid ad banners and creative variants.', 3, 5),
  ('script',   'Script + Voiceover','🎙️', 'Notion, Audacity',   'Script writing and voiceover recording for video content.', 3, 6)
on conflict (slug) do nothing;
