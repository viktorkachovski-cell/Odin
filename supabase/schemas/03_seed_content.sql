-- Reviewed template seed content, version v1. Titles are product copy, not user data.
-- Changing published seed text requires a new seed key version (v2:...), never an
-- in-place edit, so existing households keep what they were created with.

insert into private.seed_lists (seed_key, locale, title, subtitle, sort_order) values
  ('v1:weekly-cleaning', 'en', 'Weekly cleaning', 'Room by room, once a week', 1),
  ('v1:weekly-cleaning', 'bg', 'Седмично почистване', 'Стая по стая, веднъж седмично', 1),
  ('v1:grocery-run',     'en', 'Grocery run',     'The usual basket', 2),
  ('v1:grocery-run',     'bg', 'Пазаруване',       'Обичайната кошница', 2),
  ('v1:morning-routine', 'en', 'Morning routine', 'Before everyone leaves', 3),
  ('v1:morning-routine', 'bg', 'Сутрешна рутина',  'Преди всички да излязат', 3)
on conflict (seed_key, locale) do nothing;

insert into private.seed_tasks (seed_key, locale, task_key, title, sort_order) values
  ('v1:weekly-cleaning', 'en', 'kitchen',   'Kitchen surfaces and floor', 1),
  ('v1:weekly-cleaning', 'en', 'bathroom',  'Bathroom',                   2),
  ('v1:weekly-cleaning', 'en', 'vacuum',    'Vacuum the living areas',    3),
  ('v1:weekly-cleaning', 'en', 'bins',      'Empty the bins',             4),
  ('v1:weekly-cleaning', 'bg', 'kitchen',   'Кухненски плотове и под',    1),
  ('v1:weekly-cleaning', 'bg', 'bathroom',  'Баня',                        2),
  ('v1:weekly-cleaning', 'bg', 'vacuum',    'Прахосмукачка в общите стаи', 3),
  ('v1:weekly-cleaning', 'bg', 'bins',      'Изхвърляне на боклука',       4),
  ('v1:grocery-run',     'en', 'produce',   'Fruit and vegetables',        1),
  ('v1:grocery-run',     'en', 'dairy',     'Milk, yoghurt, cheese',       2),
  ('v1:grocery-run',     'en', 'bread',     'Bread',                       3),
  ('v1:grocery-run',     'en', 'household', 'Household supplies',          4),
  ('v1:grocery-run',     'bg', 'produce',   'Плодове и зеленчуци',         1),
  ('v1:grocery-run',     'bg', 'dairy',     'Мляко, кисело мляко, сирене', 2),
  ('v1:grocery-run',     'bg', 'bread',     'Хляб',                        3),
  ('v1:grocery-run',     'bg', 'household', 'Домакински консумативи',      4),
  ('v1:morning-routine', 'en', 'beds',      'Beds made',                   1),
  ('v1:morning-routine', 'en', 'breakfast', 'Breakfast and dishes',        2),
  ('v1:morning-routine', 'en', 'bags',      'School and work bags packed', 3),
  ('v1:morning-routine', 'bg', 'beds',      'Оправени легла',              1),
  ('v1:morning-routine', 'bg', 'breakfast', 'Закуска и чинии',             2),
  ('v1:morning-routine', 'bg', 'bags',      'Приготвени чанти за училище и работа', 3)
on conflict (seed_key, locale, task_key) do nothing;
