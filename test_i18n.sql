-- Test query to check if i18n translations exist
SELECT 
  o.name,
  od.description,
  od.description_i18n,
  api.i18n_pick(od.description_i18n, 'en', 'fr') as description_en
FROM object o
JOIN object_description od ON od.object_id = o.id
WHERE o.region_code = 'TST'
LIMIT 3;
