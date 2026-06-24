# RLS policies (by table)

## `audit.audit_log`
- **INSERT** `Insertion via triggers` — roles ['postgres', 'service_role']
  - `true`
- **SELECT** `Lecture audit (admin/service_role)` — roles ['public']
  - `((auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`

## `audit.audit_log_2026_03`
- **INSERT** `Insertion via triggers` — roles ['postgres', 'service_role']
  - `true`
- **SELECT** `Lecture audit (admin/service_role)` — roles ['public']
  - `((auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`

## `audit.audit_log_2026_04`
- **INSERT** `Insertion via triggers` — roles ['postgres', 'service_role']
  - `true`
- **SELECT** `Lecture audit (admin/service_role)` — roles ['public']
  - `((auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`

## `audit.audit_log_2026_05`
- **INSERT** `Insertion via triggers` — roles ['postgres', 'service_role']
  - `true`
- **SELECT** `Lecture audit (admin/service_role)` — roles ['public']
  - `((auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`

## `audit.audit_log_2026_06`
- **INSERT** `Insertion via triggers` — roles ['postgres', 'service_role']
  - `true`
- **SELECT** `Lecture audit (admin/service_role)` — roles ['public']
  - `((auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`

## `audit.audit_log_2026_07`
- **INSERT** `Insertion via triggers` — roles ['postgres', 'service_role']
  - `true`
- **SELECT** `Lecture audit (admin/service_role)` — roles ['public']
  - `((auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`

## `audit.audit_log_default`
- **INSERT** `Insertion via triggers` — roles ['postgres', 'service_role']
  - `true`
- **SELECT** `Lecture audit (admin/service_role)` — roles ['public']
  - `((auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`

## `public.actor`
- **ALL** `admin_actor_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `ext_actor_read` — roles ['public']
  - `((( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text])) OR ( SELECT api.is_platform_superuser() AS is_platform_superuser) OR (id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM (actor_object_role aor
     JOIN object o ON ((o.id = aor.object_id)))
  WHERE ((aor.actor_id = actor.id) AND api.can_read_extended(o.id)))))`

## `public.actor_channel`
- **ALL** `admin_actor_channel_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `ext_actor_channel_read` — roles ['public']
  - `((auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])) OR (actor_id = auth.uid()))`

## `public.actor_consent`
- **ALL** `own_actor_consent_write` — roles ['public']
  - `(actor_id = auth.uid())`
- **SELECT** `own_actor_consent_read` — roles ['public']
  - `(actor_id = auth.uid())`

## `public.actor_object_role`
- **DELETE** `canonical_del_actor_object_role` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **INSERT** `canonical_ins_actor_object_role` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **SELECT** `ext_actor_object_role_read` — roles ['public']
  - `((( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text])) OR (actor_id = ( SELECT auth.uid() AS uid)) OR (object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids)))`
- **UPDATE** `canonical_upd_actor_object_role` — roles ['public']
  - `api.user_can_write_object_canonical(object_id) | api.user_can_write_object_canonical(object_id)`

## `public.app_branding_settings`
- **ALL** `branding_settings_write_platform_admin` — roles ['public']
  - `api.is_platform_admin() | api.is_platform_admin()`
- **SELECT** `branding_settings_read_authenticated` — roles ['public']
  - `(auth.role() = ANY (ARRAY['authenticated'::text, 'service_role'::text, 'admin'::text]))`

## `public.app_user_profile`
- **DELETE** `Administration des profils utilisateur` — roles ['public']
  - `api.is_platform_owner()`
- **INSERT** `Insertion de son profil utilisateur` — roles ['public']
  - `((id = auth.uid()) OR api.is_platform_owner())`
- **SELECT** `Lecture de son profil utilisateur` — roles ['public']
  - `((id = auth.uid()) OR api.is_platform_owner())`
- **UPDATE** `Mise à jour de son profil utilisateur` — roles ['public']
  - `((id = auth.uid()) OR api.is_platform_owner()) | ((id = auth.uid()) OR api.is_platform_owner())`

## `public.audit_criteria`
- **ALL** `admin_audit_criteria_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_audit_criteria_read` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM audit_template t
  WHERE ((t.id = audit_criteria.template_id) AND ((t.is_active = true) OR (auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))))))`

## `public.audit_result`
- **ALL** `admin_audit_result` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`

## `public.audit_session`
- **ALL** `admin_audit_session` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`

## `public.audit_template`
- **ALL** `admin_audit_template_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_audit_template_read` — roles ['public']
  - `((is_active = true) OR (auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])))`

## `public.contact_channel`
- **DELETE** `canonical_del_contact_channel` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **INSERT** `canonical_ins_contact_channel` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **SELECT** `read_contact_channel` — roles ['public']
  - `(((EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = contact_channel.object_id) AND (o.status = 'published'::object_status)))) AND (is_public IS TRUE)) OR (object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids)))`
- **UPDATE** `canonical_upd_contact_channel` — roles ['public']
  - `api.user_can_write_object_canonical(object_id) | api.user_can_write_object_canonical(object_id)`

## `public.crm_interaction`
- **DELETE** `admin_del_crm_interaction` — roles ['public']
  - `(( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **INSERT** `admin_ins_crm_interaction` — roles ['public']
  - `(( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `admin_read_crm_interaction` — roles ['public']
  - `(( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **UPDATE** `admin_upd_crm_interaction` — roles ['public']
  - `(( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text])) | (( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text]))`

## `public.crm_task`
- **DELETE** `admin_del_crm_task` — roles ['public']
  - `(( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **INSERT** `admin_ins_crm_task` — roles ['public']
  - `(( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `admin_read_crm_task` — roles ['public']
  - `(( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **UPDATE** `admin_upd_crm_task` — roles ['public']
  - `(( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text])) | (( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text]))`

## `public.gdpr_erasure_log`
- **SELECT** `gdpr_erasure_log_admin_read` — roles ['authenticated']
  - `( SELECT api.is_platform_superuser() AS is_platform_superuser)`

## `public.i18n_translation`
- **ALL** `Écriture admin des traductions` — roles ['public']
  - `((auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`
- **SELECT** `Lecture publique des traductions` — roles ['public']
  - `true`

## `public.incident_report`
- **ALL** `admin_incident_report` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`

## `public.media`
- **DELETE** `canonical_del_media` — roles ['public']
  - `(((object_id IS NOT NULL) AND api.user_can_write_object_canonical(object_id)) OR ((place_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM object_place p
  WHERE ((p.id = media.place_id) AND api.user_can_write_object_canonical(p.object_id))))))`
- **INSERT** `canonical_ins_media` — roles ['public']
  - `(((object_id IS NOT NULL) AND api.user_can_write_object_canonical(object_id)) OR ((place_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM object_place p
  WHERE ((p.id = media.place_id) AND api.user_can_write_object_canonical(p.object_id))))))`
- **SELECT** `read_media` — roles ['public']
  - `(((is_published IS TRUE) AND ((visibility IS NULL) OR (visibility = 'public'::text)) AND (((object_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = media.object_id) AND (o.status = 'published'::object_status))))) OR ((place_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (object_place p
     JOIN object o ON ((o.id = p.object_id)))
  WHERE ((p.id = media.place_id) AND (o.sta …[truncated — full text in catalog_extra.json or live pg_policies]`
- **UPDATE** `canonical_upd_media` — roles ['public']
  - `(((object_id IS NOT NULL) AND api.user_can_write_object_canonical(object_id)) OR ((place_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM object_place p
  WHERE ((p.id = media.place_id) AND api.user_can_write_object_canonical(p.object_id)))))) | (((object_id IS NOT NULL) AND api.user_can_write_object_canonical(object_id)) OR ((place_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM object_place p
  WHE …[truncated — full text in catalog_extra.json or live pg_policies]`

## `public.media_tag`
- **DELETE** `canonical_del_media_tag` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM media m
  WHERE ((m.id = media_tag.media_id) AND (((m.object_id IS NOT NULL) AND api.user_can_write_object_canonical(m.object_id)) OR ((m.place_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM object_place p
          WHERE ((p.id = m.place_id) AND api.user_can_write_object_canonical(p.object_id))))))))) OR (EXISTS ( SELECT 1
   FROM (media m
     JOIN object o ON …[truncated — full text in catalog_extra.json or live pg_policies]`
- **INSERT** `canonical_ins_media_tag` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM media m
  WHERE ((m.id = media_tag.media_id) AND (((m.object_id IS NOT NULL) AND api.user_can_write_object_canonical(m.object_id)) OR ((m.place_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM object_place p
          WHERE ((p.id = m.place_id) AND api.user_can_write_object_canonical(p.object_id))))))))) OR (EXISTS ( SELECT 1
   FROM (media m
     JOIN object o ON …[truncated — full text in catalog_extra.json or live pg_policies]`
- **SELECT** `read_media_tag` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM media m
  WHERE ((m.id = media_tag.media_id) AND ((m.is_published IS TRUE) OR api.can_read_extended(m.object_id)))))`
- **UPDATE** `canonical_upd_media_tag` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM media m
  WHERE ((m.id = media_tag.media_id) AND (((m.object_id IS NOT NULL) AND api.user_can_write_object_canonical(m.object_id)) OR ((m.place_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM object_place p
          WHERE ((p.id = m.place_id) AND api.user_can_write_object_canonical(p.object_id))))))))) OR (EXISTS ( SELECT 1
   FROM (media m
     JOIN object o ON …[truncated — full text in catalog_extra.json or live pg_policies]`

## `public.meeting_room_equipment`
- **DELETE** `canonical_del_meeting_room_equipment` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM object_meeting_room omr
  WHERE ((omr.id = meeting_room_equipment.room_id) AND api.user_can_write_object_canonical(omr.object_id))))`
- **INSERT** `canonical_ins_meeting_room_equipment` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM object_meeting_room omr
  WHERE ((omr.id = meeting_room_equipment.room_id) AND api.user_can_write_object_canonical(omr.object_id))))`
- **SELECT** `read_meeting_room_equipment` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM object_meeting_room omr
  WHERE ((omr.id = meeting_room_equipment.room_id) AND api.can_read_object(omr.object_id))))`
- **UPDATE** `canonical_upd_meeting_room_equipment` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM object_meeting_room omr
  WHERE ((omr.id = meeting_room_equipment.room_id) AND api.user_can_write_object_canonical(omr.object_id)))) | (EXISTS ( SELECT 1
   FROM object_meeting_room omr
  WHERE ((omr.id = meeting_room_equipment.room_id) AND api.user_can_write_object_canonical(omr.object_id))))`

## `public.metric_snapshot`
- **SELECT** `metric_snapshot_read` — roles ['authenticated']
  - `true`

## `public.object`
- **ALL** `Accès admin/service_role (object)` — roles ['public']
  - `(( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **DELETE** `owner_delete_object` — roles ['public']
  - `((( SELECT auth.uid() AS uid) = created_by) OR api.user_can_write_object_canonical(id))`
- **INSERT** `insert_object_create_permission` — roles ['public']
  - `(api.user_can_create_object() AND (( SELECT auth.uid() AS uid) = created_by))`
- **SELECT** `extended_objects_org_actor` — roles ['public']
  - `(id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids))`
- **SELECT** `public_objects_published` — roles ['public']
  - `(status = 'published'::object_status)`
- **UPDATE** `owner_update_object` — roles ['public']
  - `((( SELECT auth.uid() AS uid) = created_by) OR api.user_can_write_object_canonical(id)) | ((( SELECT auth.uid() AS uid) = created_by) OR api.user_can_write_object_canonical(id))`

## `public.object_act`
- **DELETE** `canonical_del_object_act` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **INSERT** `canonical_ins_object_act` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **SELECT** `read_object_act` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_act.object_id) AND (o.status = 'published'::object_status)))) OR (object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids)))`
- **UPDATE** `canonical_upd_object_act` — roles ['public']
  - `api.user_can_write_object_canonical(object_id) | api.user_can_write_object_canonical(object_id)`

## `public.object_amenity`
- **DELETE** `canonical_del_object_amenity` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **INSERT** `canonical_ins_object_amenity` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **SELECT** `read_object_amenity` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_amenity.object_id) AND (o.status = 'published'::object_status)))) OR (object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids)))`
- **UPDATE** `canonical_upd_object_amenity` — roles ['public']
  - `api.user_can_write_object_canonical(object_id) | api.user_can_write_object_canonical(object_id)`

## `public.object_capacity`
- **DELETE** `canonical_del_object_capacity` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **INSERT** `canonical_ins_object_capacity` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **SELECT** `read_object_capacity` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_capacity.object_id) AND (o.status = 'published'::object_status)))) OR (object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids)))`
- **UPDATE** `canonical_upd_object_capacity` — roles ['public']
  - `api.user_can_write_object_canonical(object_id) | api.user_can_write_object_canonical(object_id)`

## `public.object_classification`
- **DELETE** `canonical_del_object_classification` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **INSERT** `canonical_ins_object_classification` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **SELECT** `read_object_classification` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_classification.object_id) AND (o.status = 'published'::object_status)))) OR (object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids)))`
- **UPDATE** `canonical_upd_object_classification` — roles ['public']
  - `api.user_can_write_object_canonical(object_id) | api.user_can_write_object_canonical(object_id)`

## `public.object_cuisine_type`
- **DELETE** `canonical_del_object_cuisine_type` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **INSERT** `canonical_ins_object_cuisine_type` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **SELECT** `read_object_cuisine_type` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_cuisine_type.object_id) AND (o.status = 'published'::object_status)))) OR (object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids)))`
- **UPDATE** `canonical_upd_object_cuisine_type` — roles ['public']
  - `api.user_can_write_object_canonical(object_id) | api.user_can_write_object_canonical(object_id)`

## `public.object_deletion_log`
- **SELECT** `object_deletion_log_admin_read` — roles ['public']
  - `( SELECT api.is_platform_superuser() AS is_platform_superuser)`

## `public.object_description`
- **DELETE** `canonical_del_object_description` — roles ['public']
  - `(api.is_object_owner(object_id) OR (api.user_can_write_canonical(object_id) AND (org_object_id IS NULL)))`
- **INSERT** `canonical_ins_object_description` — roles ['public']
  - `(api.is_object_owner(object_id) OR (api.user_can_write_canonical(object_id) AND (org_object_id IS NULL)))`
- **SELECT** `read_object_description` — roles ['public']
  - `(((EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_description.object_id) AND (o.status = 'published'::object_status)))) AND (visibility = 'public'::text)) OR (object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids)))`
- **UPDATE** `canonical_upd_object_description` — roles ['public']
  - `(api.is_object_owner(object_id) OR (api.user_can_write_canonical(object_id) AND (org_object_id IS NULL))) | (api.is_object_owner(object_id) OR (api.user_can_write_canonical(object_id) AND (org_object_id IS NULL)))`

## `public.object_discount`
- **DELETE** `canonical_del_object_discount` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **INSERT** `canonical_ins_object_discount` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **SELECT** `ext_discounts_org_actor` — roles ['public']
  - `api.can_read_extended(object_id)`
- **UPDATE** `canonical_upd_object_discount` — roles ['public']
  - `api.user_can_write_object_canonical(object_id) | api.user_can_write_object_canonical(object_id)`

## `public.object_document`
- **DELETE** `canonical_del_object_document` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **INSERT** `canonical_ins_object_document` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **SELECT** `read_object_document` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_document.object_id) AND (o.status = 'published'::object_status)))) OR (object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids)))`
- **UPDATE** `canonical_upd_object_document` — roles ['public']
  - `api.user_can_write_object_canonical(object_id) | api.user_can_write_object_canonical(object_id)`

## `public.object_environment_tag`
- **DELETE** `canonical_del_object_environment_tag` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **INSERT** `canonical_ins_object_environment_tag` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **SELECT** `read_object_environment_tag` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_environment_tag.object_id) AND (o.status = 'published'::object_status)))) OR (object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids)))`
- **UPDATE** `canonical_upd_object_environment_tag` — roles ['public']
  - `api.user_can_write_object_canonical(object_id) | api.user_can_write_object_canonical(object_id)`

## `public.object_external_id`
- **DELETE** `admin_del_object_external_id` — roles ['public']
  - `((( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`
- **INSERT** `admin_ins_object_external_id` — roles ['public']
  - `((( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`
- **SELECT** `Lecture restreinte identifiants externes` — roles ['public']
  - `(( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **UPDATE** `admin_upd_object_external_id` — roles ['public']
  - `((( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser()) | ((( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`

## `public.object_fma`
- **DELETE** `canonical_del_object_fma` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **INSERT** `canonical_ins_object_fma` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **SELECT** `ext_fma_org_actor` — roles ['public']
  - `api.can_read_extended(object_id)`
- **SELECT** `pub_fma_published` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_fma.object_id) AND (o.status = 'published'::object_status))))`
- **UPDATE** `canonical_upd_object_fma` — roles ['public']
  - `api.user_can_write_object_canonical(object_id) | api.user_can_write_object_canonical(object_id)`

## `public.object_fma_occurrence`
- **DELETE** `canonical_del_object_fma_occurrence` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **INSERT** `canonical_ins_object_fma_occurrence` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **SELECT** `read_object_fma_occurrence` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_fma_occurrence.object_id) AND (o.status = 'published'::object_status)))) OR (object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids)))`
- **UPDATE** `canonical_upd_object_fma_occurrence` — roles ['public']
  - `api.user_can_write_object_canonical(object_id) | api.user_can_write_object_canonical(object_id)`

## `public.object_group_policy`
- **DELETE** `canonical_del_object_group_policy` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **INSERT** `canonical_ins_object_group_policy` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **SELECT** `ext_group_policies_org_actor` — roles ['public']
  - `api.can_read_extended(object_id)`
- **UPDATE** `canonical_upd_object_group_policy` — roles ['public']
  - `api.user_can_write_object_canonical(object_id) | api.user_can_write_object_canonical(object_id)`

## `public.object_iti`
- **DELETE** `canonical_del_object_iti` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **INSERT** `canonical_ins_object_iti` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **SELECT** `ext_iti_org_actor` — roles ['public']
  - `api.can_read_extended(object_id)`
- **SELECT** `pub_iti_published` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_iti.object_id) AND (o.status = 'published'::object_status))))`
- **UPDATE** `canonical_upd_object_iti` — roles ['public']
  - `api.user_can_write_object_canonical(object_id) | api.user_can_write_object_canonical(object_id)`

## `public.object_iti_associated_object`
- **DELETE** `canonical_del_object_iti_associated_object` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **INSERT** `canonical_ins_object_iti_associated_object` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **SELECT** `read_object_iti_associated_object` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_iti_associated_object.object_id) AND (o.status = 'published'::object_status)))) OR (object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids)))`
- **UPDATE** `canonical_upd_object_iti_associated_object` — roles ['public']
  - `api.user_can_write_object_canonical(object_id) | api.user_can_write_object_canonical(object_id)`

## `public.object_iti_info`
- **DELETE** `canonical_del_object_iti_info` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **INSERT** `canonical_ins_object_iti_info` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **SELECT** `read_object_iti_info` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_iti_info.object_id) AND (o.status = 'published'::object_status)))) OR (object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids)))`
- **UPDATE** `canonical_upd_object_iti_info` — roles ['public']
  - `api.user_can_write_object_canonical(object_id) | api.user_can_write_object_canonical(object_id)`

## `public.object_iti_practice`
- **DELETE** `canonical_del_object_iti_practice` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **INSERT** `canonical_ins_object_iti_practice` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **SELECT** `read_object_iti_practice` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_iti_practice.object_id) AND (o.status = 'published'::object_status)))) OR (object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids)))`
- **UPDATE** `canonical_upd_object_iti_practice` — roles ['public']
  - `api.user_can_write_object_canonical(object_id) | api.user_can_write_object_canonical(object_id)`

## `public.object_iti_profile`
- **DELETE** `canonical_del_object_iti_profile` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **INSERT** `canonical_ins_object_iti_profile` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **SELECT** `read_object_iti_profile` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_iti_profile.object_id) AND (o.status = 'published'::object_status)))) OR (object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids)))`
- **UPDATE** `canonical_upd_object_iti_profile` — roles ['public']
  - `api.user_can_write_object_canonical(object_id) | api.user_can_write_object_canonical(object_id)`

## `public.object_iti_section`
- **DELETE** `canonical_del_object_iti_section` — roles ['public']
  - `api.user_can_write_object_canonical(parent_object_id)`
- **INSERT** `canonical_ins_object_iti_section` — roles ['public']
  - `api.user_can_write_object_canonical(parent_object_id)`
- **SELECT** `read_object_iti_section` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_iti_section.parent_object_id) AND (o.status = 'published'::object_status)))) OR (parent_object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids)))`
- **UPDATE** `canonical_upd_object_iti_section` — roles ['public']
  - `api.user_can_write_object_canonical(parent_object_id) | api.user_can_write_object_canonical(parent_object_id)`

## `public.object_iti_stage`
- **DELETE** `canonical_del_object_iti_stage` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **INSERT** `canonical_ins_object_iti_stage` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **SELECT** `read_object_iti_stage` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_iti_stage.object_id) AND (o.status = 'published'::object_status)))) OR (object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids)))`
- **UPDATE** `canonical_upd_object_iti_stage` — roles ['public']
  - `api.user_can_write_object_canonical(object_id) | api.user_can_write_object_canonical(object_id)`

## `public.object_iti_stage_media`
- **DELETE** `canonical_del_object_iti_stage_media` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM object_iti_stage ois
  WHERE ((ois.id = object_iti_stage_media.stage_id) AND api.user_can_write_object_canonical(ois.object_id))))`
- **INSERT** `canonical_ins_object_iti_stage_media` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM object_iti_stage ois
  WHERE ((ois.id = object_iti_stage_media.stage_id) AND api.user_can_write_object_canonical(ois.object_id))))`
- **SELECT** `read_object_iti_stage_media` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM object_iti_stage ois
  WHERE ((ois.id = object_iti_stage_media.stage_id) AND api.can_read_object(ois.object_id))))`
- **UPDATE** `canonical_upd_object_iti_stage_media` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM object_iti_stage ois
  WHERE ((ois.id = object_iti_stage_media.stage_id) AND api.user_can_write_object_canonical(ois.object_id)))) | (EXISTS ( SELECT 1
   FROM object_iti_stage ois
  WHERE ((ois.id = object_iti_stage_media.stage_id) AND api.user_can_write_object_canonical(ois.object_id))))`

## `public.object_language`
- **DELETE** `canonical_del_object_language` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **INSERT** `canonical_ins_object_language` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **SELECT** `read_object_language` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_language.object_id) AND (o.status = 'published'::object_status)))) OR (object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids)))`
- **UPDATE** `canonical_upd_object_language` — roles ['public']
  - `api.user_can_write_object_canonical(object_id) | api.user_can_write_object_canonical(object_id)`

## `public.object_legal`
- **DELETE** `canonical_del_object_legal` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **INSERT** `canonical_ins_object_legal` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **SELECT** `ext_legal_org_actor` — roles ['public']
  - `api.can_read_extended(object_id)`
- **UPDATE** `canonical_upd_object_legal` — roles ['public']
  - `api.user_can_write_object_canonical(object_id) | api.user_can_write_object_canonical(object_id)`

## `public.object_location`
- **DELETE** `canonical_del_object_location` — roles ['public']
  - `(((object_id IS NOT NULL) AND api.user_can_write_object_canonical(object_id)) OR ((place_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM object_place p
  WHERE ((p.id = object_location.place_id) AND api.user_can_write_object_canonical(p.object_id))))))`
- **INSERT** `canonical_ins_object_location` — roles ['public']
  - `(((object_id IS NOT NULL) AND api.user_can_write_object_canonical(object_id)) OR ((place_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM object_place p
  WHERE ((p.id = object_location.place_id) AND api.user_can_write_object_canonical(p.object_id))))))`
- **SELECT** `read_object_location` — roles ['public']
  - `api.can_read_object(COALESCE(object_id, ( SELECT op.object_id
   FROM object_place op
  WHERE (op.id = object_location.place_id))))`
- **UPDATE** `canonical_upd_object_location` — roles ['public']
  - `(((object_id IS NOT NULL) AND api.user_can_write_object_canonical(object_id)) OR ((place_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM object_place p
  WHERE ((p.id = object_location.place_id) AND api.user_can_write_object_canonical(p.object_id)))))) | (((object_id IS NOT NULL) AND api.user_can_write_object_canonical(object_id)) OR ((place_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM object_pla …[truncated — full text in catalog_extra.json or live pg_policies]`

## `public.object_meeting_room`
- **DELETE** `canonical_del_object_meeting_room` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **INSERT** `canonical_ins_object_meeting_room` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **SELECT** `read_object_meeting_room` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_meeting_room.object_id) AND (o.status = 'published'::object_status)))) OR (object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids)))`
- **UPDATE** `canonical_upd_object_meeting_room` — roles ['public']
  - `api.user_can_write_object_canonical(object_id) | api.user_can_write_object_canonical(object_id)`

## `public.object_membership`
- **DELETE** `canonical_del_object_membership` — roles ['public']
  - `((( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.user_can_write_object_canonical(COALESCE(object_id, org_object_id)))`
- **INSERT** `canonical_ins_object_membership` — roles ['public']
  - `((( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.user_can_write_object_canonical(COALESCE(object_id, org_object_id)))`
- **SELECT** `ext_object_membership_read` — roles ['public']
  - `((( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.can_read_extended(COALESCE(object_id, org_object_id)))`
- **SELECT** `pub_object_membership_read` — roles ['public']
  - `((object_id IS NOT NULL) AND (status = ANY (ARRAY['invoiced'::text, 'paid'::text])) AND ((starts_at IS NULL) OR (starts_at <= CURRENT_DATE)) AND ((ends_at IS NULL) OR (ends_at >= CURRENT_DATE)) AND (EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_membership.object_id) AND (o.status = 'published'::object_status)))))`
- **UPDATE** `canonical_upd_object_membership` — roles ['public']
  - `((( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.user_can_write_object_canonical(COALESCE(object_id, org_object_id))) | ((( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.user_can_write_object_canonical(COALESCE(object_id, org_object_id)))`

## `public.object_menu`
- **DELETE** `canonical_del_object_menu` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **INSERT** `canonical_ins_object_menu` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **SELECT** `read_object_menu` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_menu.object_id) AND (o.status = 'published'::object_status)))) OR (object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids)))`
- **UPDATE** `canonical_upd_object_menu` — roles ['public']
  - `api.user_can_write_object_canonical(object_id) | api.user_can_write_object_canonical(object_id)`

## `public.object_menu_item`
- **DELETE** `canonical_del_object_menu_item` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM object_menu om
  WHERE ((om.id = object_menu_item.menu_id) AND api.user_can_write_object_canonical(om.object_id))))`
- **INSERT** `canonical_ins_object_menu_item` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM object_menu om
  WHERE ((om.id = object_menu_item.menu_id) AND api.user_can_write_object_canonical(om.object_id))))`
- **SELECT** `read_object_menu_item` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM object_menu om
  WHERE ((om.id = object_menu_item.menu_id) AND api.can_read_object(om.object_id))))`
- **UPDATE** `canonical_upd_object_menu_item` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM object_menu om
  WHERE ((om.id = object_menu_item.menu_id) AND api.user_can_write_object_canonical(om.object_id)))) | (EXISTS ( SELECT 1
   FROM object_menu om
  WHERE ((om.id = object_menu_item.menu_id) AND api.user_can_write_object_canonical(om.object_id))))`

## `public.object_menu_item_allergen`
- **DELETE** `canonical_del_object_menu_item_allergen` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM (object_menu_item omi
     JOIN object_menu om ON ((om.id = omi.menu_id)))
  WHERE ((omi.id = object_menu_item_allergen.menu_item_id) AND api.user_can_write_object_canonical(om.object_id))))`
- **INSERT** `canonical_ins_object_menu_item_allergen` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM (object_menu_item omi
     JOIN object_menu om ON ((om.id = omi.menu_id)))
  WHERE ((omi.id = object_menu_item_allergen.menu_item_id) AND api.user_can_write_object_canonical(om.object_id))))`
- **SELECT** `read_object_menu_item_allergen` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM (object_menu_item omi
     JOIN object_menu om ON ((om.id = omi.menu_id)))
  WHERE ((omi.id = object_menu_item_allergen.menu_item_id) AND api.can_read_object(om.object_id))))`
- **UPDATE** `canonical_upd_object_menu_item_allergen` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM (object_menu_item omi
     JOIN object_menu om ON ((om.id = omi.menu_id)))
  WHERE ((omi.id = object_menu_item_allergen.menu_item_id) AND api.user_can_write_object_canonical(om.object_id)))) | (EXISTS ( SELECT 1
   FROM (object_menu_item omi
     JOIN object_menu om ON ((om.id = omi.menu_id)))
  WHERE ((omi.id = object_menu_item_allergen.menu_item_id) AND api.user_can_wr …[truncated — full text in catalog_extra.json or live pg_policies]`

## `public.object_menu_item_cuisine_type`
- **DELETE** `canonical_del_object_menu_item_cuisine_type` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM (object_menu_item omi
     JOIN object_menu om ON ((om.id = omi.menu_id)))
  WHERE ((omi.id = object_menu_item_cuisine_type.menu_item_id) AND api.user_can_write_object_canonical(om.object_id))))`
- **INSERT** `canonical_ins_object_menu_item_cuisine_type` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM (object_menu_item omi
     JOIN object_menu om ON ((om.id = omi.menu_id)))
  WHERE ((omi.id = object_menu_item_cuisine_type.menu_item_id) AND api.user_can_write_object_canonical(om.object_id))))`
- **SELECT** `read_object_menu_item_cuisine_type` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM (object_menu_item omi
     JOIN object_menu om ON ((om.id = omi.menu_id)))
  WHERE ((omi.id = object_menu_item_cuisine_type.menu_item_id) AND api.can_read_object(om.object_id))))`
- **UPDATE** `canonical_upd_object_menu_item_cuisine_type` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM (object_menu_item omi
     JOIN object_menu om ON ((om.id = omi.menu_id)))
  WHERE ((omi.id = object_menu_item_cuisine_type.menu_item_id) AND api.user_can_write_object_canonical(om.object_id)))) | (EXISTS ( SELECT 1
   FROM (object_menu_item omi
     JOIN object_menu om ON ((om.id = omi.menu_id)))
  WHERE ((omi.id = object_menu_item_cuisine_type.menu_item_id) AND api.use …[truncated — full text in catalog_extra.json or live pg_policies]`

## `public.object_menu_item_dietary_tag`
- **DELETE** `canonical_del_object_menu_item_dietary_tag` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM (object_menu_item omi
     JOIN object_menu om ON ((om.id = omi.menu_id)))
  WHERE ((omi.id = object_menu_item_dietary_tag.menu_item_id) AND api.user_can_write_object_canonical(om.object_id))))`
- **INSERT** `canonical_ins_object_menu_item_dietary_tag` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM (object_menu_item omi
     JOIN object_menu om ON ((om.id = omi.menu_id)))
  WHERE ((omi.id = object_menu_item_dietary_tag.menu_item_id) AND api.user_can_write_object_canonical(om.object_id))))`
- **SELECT** `read_object_menu_item_dietary_tag` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM (object_menu_item omi
     JOIN object_menu om ON ((om.id = omi.menu_id)))
  WHERE ((omi.id = object_menu_item_dietary_tag.menu_item_id) AND api.can_read_object(om.object_id))))`
- **UPDATE** `canonical_upd_object_menu_item_dietary_tag` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM (object_menu_item omi
     JOIN object_menu om ON ((om.id = omi.menu_id)))
  WHERE ((omi.id = object_menu_item_dietary_tag.menu_item_id) AND api.user_can_write_object_canonical(om.object_id)))) | (EXISTS ( SELECT 1
   FROM (object_menu_item omi
     JOIN object_menu om ON ((om.id = omi.menu_id)))
  WHERE ((omi.id = object_menu_item_dietary_tag.menu_item_id) AND api.user_ …[truncated — full text in catalog_extra.json or live pg_policies]`

## `public.object_menu_item_media`
- **DELETE** `canonical_del_object_menu_item_media` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM (object_menu_item omi
     JOIN object_menu om ON ((om.id = omi.menu_id)))
  WHERE ((omi.id = object_menu_item_media.menu_item_id) AND api.user_can_write_object_canonical(om.object_id))))`
- **INSERT** `canonical_ins_object_menu_item_media` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM (object_menu_item omi
     JOIN object_menu om ON ((om.id = omi.menu_id)))
  WHERE ((omi.id = object_menu_item_media.menu_item_id) AND api.user_can_write_object_canonical(om.object_id))))`
- **SELECT** `read_object_menu_item_media` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM (object_menu_item omi
     JOIN object_menu om ON ((om.id = omi.menu_id)))
  WHERE ((omi.id = object_menu_item_media.menu_item_id) AND api.can_read_object(om.object_id))))`
- **UPDATE** `canonical_upd_object_menu_item_media` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM (object_menu_item omi
     JOIN object_menu om ON ((om.id = omi.menu_id)))
  WHERE ((omi.id = object_menu_item_media.menu_item_id) AND api.user_can_write_object_canonical(om.object_id)))) | (EXISTS ( SELECT 1
   FROM (object_menu_item omi
     JOIN object_menu om ON ((om.id = omi.menu_id)))
  WHERE ((omi.id = object_menu_item_media.menu_item_id) AND api.user_can_write_ob …[truncated — full text in catalog_extra.json or live pg_policies]`

## `public.object_org_link`
- **DELETE** `canonical_del_object_org_link` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **INSERT** `canonical_ins_object_org_link` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **SELECT** `read_object_org_link` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_org_link.object_id) AND (o.status = 'published'::object_status)))) OR (object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids)))`
- **UPDATE** `canonical_upd_object_org_link` — roles ['public']
  - `api.user_can_write_object_canonical(object_id) | api.user_can_write_object_canonical(object_id)`

## `public.object_origin`
- **DELETE** `admin_del_object_origin` — roles ['public']
  - `((( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`
- **INSERT** `admin_ins_object_origin` — roles ['public']
  - `((( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`
- **SELECT** `read_object_origin` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_origin.object_id) AND (o.status = 'published'::object_status)))) OR (object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids)))`
- **UPDATE** `admin_upd_object_origin` — roles ['public']
  - `((( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser()) | ((( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`

## `public.object_payment_method`
- **DELETE** `canonical_del_object_payment_method` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **INSERT** `canonical_ins_object_payment_method` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **SELECT** `read_object_payment_method` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_payment_method.object_id) AND (o.status = 'published'::object_status)))) OR (object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids)))`
- **UPDATE** `canonical_upd_object_payment_method` — roles ['public']
  - `api.user_can_write_object_canonical(object_id) | api.user_can_write_object_canonical(object_id)`

## `public.object_pet_policy`
- **DELETE** `canonical_del_object_pet_policy` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **INSERT** `canonical_ins_object_pet_policy` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **SELECT** `read_object_pet_policy` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_pet_policy.object_id) AND (o.status = 'published'::object_status)))) OR (object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids)))`
- **UPDATE** `canonical_upd_object_pet_policy` — roles ['public']
  - `api.user_can_write_object_canonical(object_id) | api.user_can_write_object_canonical(object_id)`

## `public.object_place`
- **DELETE** `canonical_del_object_place` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **INSERT** `canonical_ins_object_place` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **SELECT** `read_object_place` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_place.object_id) AND (o.status = 'published'::object_status)))) OR (object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids)))`
- **UPDATE** `canonical_upd_object_place` — roles ['public']
  - `api.user_can_write_object_canonical(object_id) | api.user_can_write_object_canonical(object_id)`

## `public.object_place_description`
- **DELETE** `canonical_del_object_place_description` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM object_place p
  WHERE ((p.id = object_place_description.place_id) AND api.user_can_write_object_canonical(p.object_id))))`
- **INSERT** `canonical_ins_object_place_description` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM object_place p
  WHERE ((p.id = object_place_description.place_id) AND api.user_can_write_object_canonical(p.object_id))))`
- **SELECT** `read_object_place_description` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM object_place p
  WHERE ((p.id = object_place_description.place_id) AND api.can_read_object(p.object_id))))`
- **UPDATE** `canonical_upd_object_place_description` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM object_place p
  WHERE ((p.id = object_place_description.place_id) AND api.user_can_write_object_canonical(p.object_id)))) | (EXISTS ( SELECT 1
   FROM object_place p
  WHERE ((p.id = object_place_description.place_id) AND api.user_can_write_object_canonical(p.object_id))))`

## `public.object_price`
- **DELETE** `canonical_del_object_price` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **INSERT** `canonical_ins_object_price` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **SELECT** `read_object_price` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_price.object_id) AND (o.status = 'published'::object_status)))) OR (object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids)))`
- **UPDATE** `canonical_upd_object_price` — roles ['public']
  - `api.user_can_write_object_canonical(object_id) | api.user_can_write_object_canonical(object_id)`

## `public.object_price_period`
- **DELETE** `canonical_del_object_price_period` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM object_price op
  WHERE ((op.id = object_price_period.price_id) AND api.user_can_write_object_canonical(op.object_id))))`
- **INSERT** `canonical_ins_object_price_period` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM object_price op
  WHERE ((op.id = object_price_period.price_id) AND api.user_can_write_object_canonical(op.object_id))))`
- **SELECT** `read_object_price_period` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM object_price op
  WHERE ((op.id = object_price_period.price_id) AND api.can_read_object(op.object_id))))`
- **UPDATE** `canonical_upd_object_price_period` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM object_price op
  WHERE ((op.id = object_price_period.price_id) AND api.user_can_write_object_canonical(op.object_id)))) | (EXISTS ( SELECT 1
   FROM object_price op
  WHERE ((op.id = object_price_period.price_id) AND api.user_can_write_object_canonical(op.object_id))))`

## `public.object_private_description`
- **DELETE** `manage_delete_private_description` — roles ['public']
  - `api.can_delete_object_private_note(id)`
- **INSERT** `org_insert_private_description` — roles ['public']
  - `(api.can_write_object_private_notes(object_id) AND (org_object_id = api.current_user_org_id()) AND (created_by_user_id = ( SELECT auth.uid() AS uid)) AND (audience = 'private'::text))`
- **SELECT** `ext_private_descriptions_org_actor` — roles ['public']
  - `(api.can_read_object_private_notes(object_id) AND (org_object_id = api.current_user_org_id()))`
- **UPDATE** `manage_update_private_description` — roles ['public']
  - `api.can_manage_object_private_note(id) | api.can_manage_object_private_note(id)`

## `public.object_relation`
- **DELETE** `canonical_del_object_relation` — roles ['public']
  - `api.user_can_write_object_canonical(source_object_id)`
- **INSERT** `canonical_ins_object_relation` — roles ['public']
  - `api.user_can_write_object_canonical(source_object_id)`
- **SELECT** `read_object_relation` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_relation.source_object_id) AND (o.status = 'published'::object_status)))) OR (source_object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids)))`
- **UPDATE** `canonical_upd_object_relation` — roles ['public']
  - `api.user_can_write_object_canonical(source_object_id) | api.user_can_write_object_canonical(source_object_id)`

## `public.object_review`
- **DELETE** `admin_del_object_review` — roles ['public']
  - `((( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`
- **INSERT** `admin_ins_object_review` — roles ['public']
  - `((( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`
- **SELECT** `read_object_review` — roles ['public']
  - `(((is_published IS TRUE) AND (EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_review.object_id) AND (o.status = 'published'::object_status))))) OR (object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids)))`
- **UPDATE** `admin_upd_object_review` — roles ['public']
  - `((( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser()) | ((( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`

## `public.object_room_type`
- **DELETE** `canonical_del_object_room_type` — roles ['public']
  - `(api.user_can_write_object_canonical(object_id) OR (EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_room_type.object_id) AND (o.created_by = ( SELECT auth.uid() AS uid))))))`
- **INSERT** `canonical_ins_object_room_type` — roles ['public']
  - `(api.user_can_write_object_canonical(object_id) OR (EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_room_type.object_id) AND (o.created_by = ( SELECT auth.uid() AS uid))))))`
- **SELECT** `read_object_room_type` — roles ['public']
  - `(((is_published IS TRUE) AND (EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_room_type.object_id) AND (o.status = 'published'::object_status))))) OR (object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids)))`
- **UPDATE** `canonical_upd_object_room_type` — roles ['public']
  - `(api.user_can_write_object_canonical(object_id) OR (EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_room_type.object_id) AND (o.created_by = ( SELECT auth.uid() AS uid)))))) | (api.user_can_write_object_canonical(object_id) OR (EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_room_type.object_id) AND (o.created_by = ( SELECT auth.uid() AS uid))))))`

## `public.object_room_type_amenity`
- **DELETE** `canonical_del_object_room_type_amenity` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object_room_type rt
  WHERE ((rt.id = object_room_type_amenity.room_type_id) AND api.user_can_write_object_canonical(rt.object_id)))) OR (EXISTS ( SELECT 1
   FROM (object_room_type rt
     JOIN object o ON ((o.id = rt.object_id)))
  WHERE ((rt.id = object_room_type_amenity.room_type_id) AND (o.created_by = ( SELECT auth.uid() AS uid))))))`
- **INSERT** `canonical_ins_object_room_type_amenity` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object_room_type rt
  WHERE ((rt.id = object_room_type_amenity.room_type_id) AND api.user_can_write_object_canonical(rt.object_id)))) OR (EXISTS ( SELECT 1
   FROM (object_room_type rt
     JOIN object o ON ((o.id = rt.object_id)))
  WHERE ((rt.id = object_room_type_amenity.room_type_id) AND (o.created_by = ( SELECT auth.uid() AS uid))))))`
- **SELECT** `read_object_room_type_amenity` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM (object_room_type rt
     JOIN object o ON ((o.id = rt.object_id)))
  WHERE ((rt.id = object_room_type_amenity.room_type_id) AND (rt.is_published IS TRUE) AND (o.status = 'published'::object_status)))) OR (room_type_id IN ( SELECT rt.id
   FROM object_room_type rt
  WHERE (rt.object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_id …[truncated — full text in catalog_extra.json or live pg_policies]`
- **UPDATE** `canonical_upd_object_room_type_amenity` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object_room_type rt
  WHERE ((rt.id = object_room_type_amenity.room_type_id) AND api.user_can_write_object_canonical(rt.object_id)))) OR (EXISTS ( SELECT 1
   FROM (object_room_type rt
     JOIN object o ON ((o.id = rt.object_id)))
  WHERE ((rt.id = object_room_type_amenity.room_type_id) AND (o.created_by = ( SELECT auth.uid() AS uid)))))) | ((EXISTS ( SELECT 1
   FROM  …[truncated — full text in catalog_extra.json or live pg_policies]`

## `public.object_room_type_bed`
- **DELETE** `canonical_del_object_room_type_bed` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object_room_type rt
  WHERE ((rt.id = object_room_type_bed.room_type_id) AND api.user_can_write_object_canonical(rt.object_id)))) OR (EXISTS ( SELECT 1
   FROM (object_room_type rt
     JOIN object o ON ((o.id = rt.object_id)))
  WHERE ((rt.id = object_room_type_bed.room_type_id) AND (o.created_by = ( SELECT auth.uid() AS uid))))))`
- **INSERT** `canonical_ins_object_room_type_bed` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object_room_type rt
  WHERE ((rt.id = object_room_type_bed.room_type_id) AND api.user_can_write_object_canonical(rt.object_id)))) OR (EXISTS ( SELECT 1
   FROM (object_room_type rt
     JOIN object o ON ((o.id = rt.object_id)))
  WHERE ((rt.id = object_room_type_bed.room_type_id) AND (o.created_by = ( SELECT auth.uid() AS uid))))))`
- **SELECT** `read_object_room_type_bed` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM (object_room_type rt
     JOIN object o ON ((o.id = rt.object_id)))
  WHERE ((rt.id = object_room_type_bed.room_type_id) AND (rt.is_published IS TRUE) AND (o.status = 'published'::object_status)))) OR (room_type_id IN ( SELECT rt.id
   FROM object_room_type rt
  WHERE (rt.object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids))) …[truncated — full text in catalog_extra.json or live pg_policies]`
- **UPDATE** `canonical_upd_object_room_type_bed` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object_room_type rt
  WHERE ((rt.id = object_room_type_bed.room_type_id) AND api.user_can_write_object_canonical(rt.object_id)))) OR (EXISTS ( SELECT 1
   FROM (object_room_type rt
     JOIN object o ON ((o.id = rt.object_id)))
  WHERE ((rt.id = object_room_type_bed.room_type_id) AND (o.created_by = ( SELECT auth.uid() AS uid)))))) | ((EXISTS ( SELECT 1
   FROM object_r …[truncated — full text in catalog_extra.json or live pg_policies]`

## `public.object_room_type_media`
- **DELETE** `canonical_del_object_room_type_media` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object_room_type rt
  WHERE ((rt.id = object_room_type_media.room_type_id) AND api.user_can_write_object_canonical(rt.object_id)))) OR (EXISTS ( SELECT 1
   FROM (object_room_type rt
     JOIN object o ON ((o.id = rt.object_id)))
  WHERE ((rt.id = object_room_type_media.room_type_id) AND (o.created_by = ( SELECT auth.uid() AS uid))))))`
- **INSERT** `canonical_ins_object_room_type_media` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object_room_type rt
  WHERE ((rt.id = object_room_type_media.room_type_id) AND api.user_can_write_object_canonical(rt.object_id)))) OR (EXISTS ( SELECT 1
   FROM (object_room_type rt
     JOIN object o ON ((o.id = rt.object_id)))
  WHERE ((rt.id = object_room_type_media.room_type_id) AND (o.created_by = ( SELECT auth.uid() AS uid))))))`
- **SELECT** `read_object_room_type_media` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM (object_room_type rt
     JOIN object o ON ((o.id = rt.object_id)))
  WHERE ((rt.id = object_room_type_media.room_type_id) AND (rt.is_published IS TRUE) AND (o.status = 'published'::object_status)))) OR (room_type_id IN ( SELECT rt.id
   FROM object_room_type rt
  WHERE (rt.object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids) …[truncated — full text in catalog_extra.json or live pg_policies]`
- **UPDATE** `canonical_upd_object_room_type_media` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object_room_type rt
  WHERE ((rt.id = object_room_type_media.room_type_id) AND api.user_can_write_object_canonical(rt.object_id)))) OR (EXISTS ( SELECT 1
   FROM (object_room_type rt
     JOIN object o ON ((o.id = rt.object_id)))
  WHERE ((rt.id = object_room_type_media.room_type_id) AND (o.created_by = ( SELECT auth.uid() AS uid)))))) | ((EXISTS ( SELECT 1
   FROM obje …[truncated — full text in catalog_extra.json or live pg_policies]`

## `public.object_stay_policy`
- **DELETE** `canonical_del_object_stay_policy` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **INSERT** `canonical_ins_object_stay_policy` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **SELECT** `read_object_stay_policy` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_stay_policy.object_id) AND (o.status = 'published'::object_status)))) OR (object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids)))`
- **UPDATE** `canonical_upd_object_stay_policy` — roles ['public']
  - `api.user_can_write_object_canonical(object_id) | api.user_can_write_object_canonical(object_id)`

## `public.object_sustainability_action`
- **DELETE** `canonical_del_object_sustainability_action` — roles ['public']
  - `(api.user_can_write_object_canonical(object_id) OR (( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`
- **INSERT** `canonical_ins_object_sustainability_action` — roles ['public']
  - `(api.user_can_write_object_canonical(object_id) OR (( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`
- **SELECT** `pub_object_sustainability_action_read` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM object o
  WHERE (o.id = object_sustainability_action.object_id)))`
- **UPDATE** `canonical_upd_object_sustainability_action` — roles ['public']
  - `(api.user_can_write_object_canonical(object_id) OR (( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser()) | (api.user_can_write_object_canonical(object_id) OR (( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`

## `public.object_sustainability_action_label`
- **DELETE** `canonical_del_object_sustainability_action_label` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object_sustainability_action osa
  WHERE ((osa.id = object_sustainability_action_label.object_sustainability_action_id) AND api.user_can_write_object_canonical(osa.object_id)))) OR (( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`
- **INSERT** `canonical_ins_object_sustainability_action_label` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object_sustainability_action osa
  WHERE ((osa.id = object_sustainability_action_label.object_sustainability_action_id) AND api.user_can_write_object_canonical(osa.object_id)))) OR (( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`
- **SELECT** `pub_object_sustainability_action_label_read` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM (object_sustainability_action osa
     JOIN object o ON ((o.id = osa.object_id)))
  WHERE (osa.id = object_sustainability_action_label.object_sustainability_action_id)))`
- **UPDATE** `canonical_upd_object_sustainability_action_label` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object_sustainability_action osa
  WHERE ((osa.id = object_sustainability_action_label.object_sustainability_action_id) AND api.user_can_write_object_canonical(osa.object_id)))) OR (( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser()) | ((EXISTS ( SELECT 1
   FROM object_sustainability_action osa
  WHERE ((osa …[truncated — full text in catalog_extra.json or live pg_policies]`

## `public.object_taxonomy`
- **DELETE** `canonical_del_object_taxonomy` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **INSERT** `canonical_ins_object_taxonomy` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **SELECT** `pub_object_taxonomy_read` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM object o
  WHERE (o.id = object_taxonomy.object_id)))`
- **UPDATE** `canonical_upd_object_taxonomy` — roles ['public']
  - `api.user_can_write_object_canonical(object_id) | api.user_can_write_object_canonical(object_id)`

## `public.object_version`
- **ALL** `admin_object_version` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`

## `public.object_version_2026_03`
- **ALL** `admin_object_version` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`

## `public.object_version_2026_04`
- **ALL** `admin_object_version` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`

## `public.object_version_2026_05`
- **ALL** `admin_object_version` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`

## `public.object_version_default`
- **ALL** `admin_object_version` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`

## `public.object_web_channel`
- **DELETE** `canonical_del_object_web_channel` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **INSERT** `canonical_ins_object_web_channel` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **SELECT** `read_object_web_channel` — roles ['public']
  - `(((EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_web_channel.object_id) AND (o.status = 'published'::object_status)))) AND (is_public IS TRUE)) OR (object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids)))`
- **UPDATE** `canonical_upd_object_web_channel` — roles ['public']
  - `api.user_can_write_object_canonical(object_id) | api.user_can_write_object_canonical(object_id)`

## `public.object_zone`
- **DELETE** `canonical_del_object_zone` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **INSERT** `canonical_ins_object_zone` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **SELECT** `read_object_zone` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = object_zone.object_id) AND (o.status = 'published'::object_status)))) OR (object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids)))`
- **UPDATE** `canonical_upd_object_zone` — roles ['public']
  - `api.user_can_write_object_canonical(object_id) | api.user_can_write_object_canonical(object_id)`

## `public.opening_period`
- **DELETE** `canonical_del_opening_period` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **INSERT** `canonical_ins_opening_period` — roles ['public']
  - `api.user_can_write_object_canonical(object_id)`
- **SELECT** `read_opening_period` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = opening_period.object_id) AND (o.status = 'published'::object_status)))) OR (object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids)))`
- **UPDATE** `canonical_upd_opening_period` — roles ['public']
  - `api.user_can_write_object_canonical(object_id) | api.user_can_write_object_canonical(object_id)`

## `public.opening_schedule`
- **DELETE** `canonical_del_opening_schedule` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM opening_period p
  WHERE ((p.id = opening_schedule.period_id) AND api.user_can_write_object_canonical(p.object_id))))`
- **INSERT** `canonical_ins_opening_schedule` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM opening_period p
  WHERE ((p.id = opening_schedule.period_id) AND api.user_can_write_object_canonical(p.object_id))))`
- **SELECT** `read_opening_schedule` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM opening_period p
  WHERE ((p.id = opening_schedule.period_id) AND api.can_read_object(p.object_id))))`
- **UPDATE** `canonical_upd_opening_schedule` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM opening_period p
  WHERE ((p.id = opening_schedule.period_id) AND api.user_can_write_object_canonical(p.object_id)))) | (EXISTS ( SELECT 1
   FROM opening_period p
  WHERE ((p.id = opening_schedule.period_id) AND api.user_can_write_object_canonical(p.object_id))))`

## `public.opening_time_frame`
- **DELETE** `canonical_del_opening_time_frame` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM ((opening_time_period tp
     JOIN opening_schedule s ON ((s.id = tp.schedule_id)))
     JOIN opening_period p ON ((p.id = s.period_id)))
  WHERE ((tp.id = opening_time_frame.time_period_id) AND api.user_can_write_object_canonical(p.object_id))))`
- **INSERT** `canonical_ins_opening_time_frame` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM ((opening_time_period tp
     JOIN opening_schedule s ON ((s.id = tp.schedule_id)))
     JOIN opening_period p ON ((p.id = s.period_id)))
  WHERE ((tp.id = opening_time_frame.time_period_id) AND api.user_can_write_object_canonical(p.object_id))))`
- **SELECT** `read_opening_time_frame` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM ((opening_time_period tp
     JOIN opening_schedule s ON ((s.id = tp.schedule_id)))
     JOIN opening_period p ON ((p.id = s.period_id)))
  WHERE ((tp.id = opening_time_frame.time_period_id) AND api.can_read_object(p.object_id))))`
- **UPDATE** `canonical_upd_opening_time_frame` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM ((opening_time_period tp
     JOIN opening_schedule s ON ((s.id = tp.schedule_id)))
     JOIN opening_period p ON ((p.id = s.period_id)))
  WHERE ((tp.id = opening_time_frame.time_period_id) AND api.user_can_write_object_canonical(p.object_id)))) | (EXISTS ( SELECT 1
   FROM ((opening_time_period tp
     JOIN opening_schedule s ON ((s.id = tp.schedule_id)))
     JOIN ope …[truncated — full text in catalog_extra.json or live pg_policies]`

## `public.opening_time_period`
- **DELETE** `canonical_del_opening_time_period` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM (opening_schedule s
     JOIN opening_period p ON ((p.id = s.period_id)))
  WHERE ((s.id = opening_time_period.schedule_id) AND api.user_can_write_object_canonical(p.object_id))))`
- **INSERT** `canonical_ins_opening_time_period` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM (opening_schedule s
     JOIN opening_period p ON ((p.id = s.period_id)))
  WHERE ((s.id = opening_time_period.schedule_id) AND api.user_can_write_object_canonical(p.object_id))))`
- **SELECT** `read_opening_time_period` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM (opening_schedule s
     JOIN opening_period p ON ((p.id = s.period_id)))
  WHERE ((s.id = opening_time_period.schedule_id) AND api.can_read_object(p.object_id))))`
- **UPDATE** `canonical_upd_opening_time_period` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM (opening_schedule s
     JOIN opening_period p ON ((p.id = s.period_id)))
  WHERE ((s.id = opening_time_period.schedule_id) AND api.user_can_write_object_canonical(p.object_id)))) | (EXISTS ( SELECT 1
   FROM (opening_schedule s
     JOIN opening_period p ON ((p.id = s.period_id)))
  WHERE ((s.id = opening_time_period.schedule_id) AND api.user_can_write_object_canonical( …[truncated — full text in catalog_extra.json or live pg_policies]`

## `public.opening_time_period_weekday`
- **DELETE** `canonical_del_opening_time_period_weekday` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM ((opening_time_period tp
     JOIN opening_schedule s ON ((s.id = tp.schedule_id)))
     JOIN opening_period p ON ((p.id = s.period_id)))
  WHERE ((tp.id = opening_time_period_weekday.time_period_id) AND api.user_can_write_object_canonical(p.object_id))))`
- **INSERT** `canonical_ins_opening_time_period_weekday` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM ((opening_time_period tp
     JOIN opening_schedule s ON ((s.id = tp.schedule_id)))
     JOIN opening_period p ON ((p.id = s.period_id)))
  WHERE ((tp.id = opening_time_period_weekday.time_period_id) AND api.user_can_write_object_canonical(p.object_id))))`
- **SELECT** `read_opening_time_period_weekday` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM ((opening_time_period tp
     JOIN opening_schedule s ON ((s.id = tp.schedule_id)))
     JOIN opening_period p ON ((p.id = s.period_id)))
  WHERE ((tp.id = opening_time_period_weekday.time_period_id) AND api.can_read_object(p.object_id))))`
- **UPDATE** `canonical_upd_opening_time_period_weekday` — roles ['public']
  - `(EXISTS ( SELECT 1
   FROM ((opening_time_period tp
     JOIN opening_schedule s ON ((s.id = tp.schedule_id)))
     JOIN opening_period p ON ((p.id = s.period_id)))
  WHERE ((tp.id = opening_time_period_weekday.time_period_id) AND api.user_can_write_object_canonical(p.object_id)))) | (EXISTS ( SELECT 1
   FROM ((opening_time_period tp
     JOIN opening_schedule s ON ((s.id = tp.schedule_id)))
     …[truncated — full text in catalog_extra.json or live pg_policies]`

## `public.org_config`
- **ALL** `superuser_org_config_write` — roles ['public']
  - `api.is_platform_superuser() | api.is_platform_superuser()`
- **SELECT** `member_org_config_read` — roles ['public']
  - `(api.is_platform_superuser() OR (EXISTS ( SELECT 1
   FROM user_org_membership m
  WHERE ((m.org_object_id = org_config.org_object_id) AND (m.user_id = auth.uid()) AND (m.is_active = true)))))`

## `public.org_permission`
- **ALL** `admin_org_permission_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])) | (auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `member_org_permission_read` — roles ['public']
  - `(api.is_platform_superuser() OR ((is_active = true) AND (EXISTS ( SELECT 1
   FROM user_org_membership m
  WHERE ((m.org_object_id = org_permission.org_object_id) AND (m.user_id = auth.uid()) AND (m.is_active = true))))))`

## `public.pending_change`
- **ALL** `admin_pending_change` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`

## `public.promotion`
- **ALL** `Écriture admin des promotions` — roles ['public']
  - `((auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`
- **SELECT** `Lecture publique des promotions` — roles ['public']
  - `((is_public = true) AND (is_active = true))`

## `public.promotion_object`
- **DELETE** `admin_del_promotion_object` — roles ['public']
  - `((( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`
- **INSERT** `admin_ins_promotion_object` — roles ['public']
  - `((( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`
- **SELECT** `read_promotion_object` — roles ['public']
  - `((EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = promotion_object.object_id) AND (o.status = 'published'::object_status)))) OR (object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids)))`
- **UPDATE** `admin_upd_promotion_object` — roles ['public']
  - `((( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser()) | ((( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`

## `public.promotion_usage`
- **ALL** `Écriture admin des usages promotions` — roles ['public']
  - `((auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`
- **SELECT** `Lecture admin des usages promotions` — roles ['public']
  - `((auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`

## `public.publication`
- **ALL** `admin_publication` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`

## `public.publication_object`
- **ALL** `admin_publication_object` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`

## `public.ref_actor_role`
- **ALL** `admin_actor_role_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_actor_role_read` — roles ['public']
  - `true`

## `public.ref_amenity`
- **ALL** `Écriture admin des équipements` — roles ['public']
  - `((auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`
- **SELECT** `Lecture publique des équipements` — roles ['public']
  - `true`

## `public.ref_capacity_applicability`
- **ALL** `Écriture admin des applicabilités de capacité` — roles ['public']
  - `((auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`
- **SELECT** `Lecture publique des applicabilités de capacité` — roles ['public']
  - `true`

## `public.ref_capacity_metric`
- **ALL** `Écriture admin des métriques de capacité` — roles ['public']
  - `((auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`
- **SELECT** `Lecture publique des métriques de capacité` — roles ['public']
  - `true`

## `public.ref_classification_equivalent_action`
- **ALL** `admin_write_ref_classification_equivalent_action` — roles ['public']
  - `((auth.role() = 'service_role'::text) OR (auth.role() = 'admin'::text) OR api.is_platform_superuser())`
- **SELECT** `pub_ref_classification_equivalent_action_read` — roles ['public']
  - `true`

## `public.ref_classification_equivalent_group`
- **ALL** `admin_write_ref_classification_equivalent_group` — roles ['public']
  - `((auth.role() = 'service_role'::text) OR (auth.role() = 'admin'::text) OR api.is_platform_superuser())`
- **SELECT** `pub_ref_classification_equivalent_group_read` — roles ['public']
  - `true`

## `public.ref_classification_scheme`
- **ALL** `Écriture admin des schémas de classification` — roles ['public']
  - `((auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`
- **SELECT** `Lecture publique des schémas de classification` — roles ['public']
  - `true`

## `public.ref_classification_value`
- **ALL** `Écriture admin des valeurs de classification` — roles ['public']
  - `((auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`
- **SELECT** `Lecture publique des valeurs de classification` — roles ['public']
  - `true`

## `public.ref_code`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_accommodation_type`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_activity_type`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_allergen`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_amenity_family`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_amenity_type`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_assistance_type`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_bed_type`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_booking_status`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_client_type`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_contact_kind`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_crm_sentiment`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_cuisine_type`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_demand_subtopic`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_demand_topic`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_destination_type`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_dietary_tag`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_document_type`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_domain_registry`
- **SELECT** `Lecture publique du registre ref_code` — roles ['public']
  - `true`

## `public.ref_code_environment_tag`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **ALL** `Écriture admin des tags d'environnement` — roles ['public']
  - `((auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`
- **SELECT** `Lecture publique des tags d'environnement` — roles ['public']
  - `true`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_event_type`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_feedback_type`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_incident_category`
- **ALL** `admin_incident_category_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_incident_category_read` — roles ['public']
  - `true`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_insurance_type`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_iti_difficulty`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_iti_open_status`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_iti_practice`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `Lecture publique des pratiques ITI` — roles ['public']
  - `true`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_iti_stage_kind`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_language_level`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_media_tag`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `Lecture publique des tags média` — roles ['public']
  - `true`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_media_type`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_meeting_equipment`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_membership_campaign`
- **ALL** `admin_membership_campaign_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_membership_campaign_read` — roles ['public']
  - `true`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_membership_tier`
- **ALL** `admin_membership_tier_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_membership_tier_read` — roles ['public']
  - `true`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_menu_category`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_mood`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_opening_period_type`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_opening_schedule_type`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_other`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_package_type`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_partnership_type`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_payment_method`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **ALL** `Écriture admin des moyens de paiement` — roles ['public']
  - `((auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`
- **SELECT** `Lecture publique des moyens de paiement` — roles ['public']
  - `true`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_price_kind`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_price_type`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_price_unit`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_promotion_type`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_room_type`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_season_type`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_service_type`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_social_network`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_taxonomy_closure`
- **SELECT** `Lecture publique de la clôture taxonomique` — roles ['public']
  - `true`

## `public.ref_code_tourism_type`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_transport_type`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_view_type`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **ALL** `Écriture admin des types de vue` — roles ['public']
  - `((auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`
- **SELECT** `Lecture publique des types de vue` — roles ['public']
  - `true`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_code_weekday`
- **ALL** `admin_ref_code_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_ref_code_read` — roles ['public']
  - `true`

## `public.ref_commune`
- **ALL** `admin_write_ref_commune` — roles ['public']
  - `((( SELECT auth.role() AS role) = 'service_role'::text) OR (( SELECT auth.role() AS role) = 'admin'::text) OR api.is_platform_superuser())`
- **SELECT** `pub_ref_commune_read` — roles ['public']
  - `true`

## `public.ref_contact_role`
- **ALL** `admin_contact_role_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_contact_role_read` — roles ['public']
  - `true`

## `public.ref_document`
- **ALL** `Écriture admin des documents de référence` — roles ['public']
  - `((auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`
- **SELECT** `Lecture publique des documents de référence` — roles ['public']
  - `true`

## `public.ref_facet_applicability`
- **ALL** `admin_write_ref_facet_applicability` — roles ['public']
  - `((( SELECT auth.role() AS role) = 'service_role'::text) OR (( SELECT auth.role() AS role) = 'admin'::text) OR api.is_platform_superuser())`
- **SELECT** `pub_ref_facet_applicability_read` — roles ['public']
  - `true`

## `public.ref_facet_registry`
- **ALL** `admin_write_ref_facet_registry` — roles ['public']
  - `((( SELECT auth.role() AS role) = 'service_role'::text) OR (( SELECT auth.role() AS role) = 'admin'::text) OR api.is_platform_superuser())`
- **SELECT** `pub_ref_facet_registry_read` — roles ['public']
  - `true`

## `public.ref_iti_assoc_role`
- **SELECT** `Lecture publique des rôles ITI` — roles ['public']
  - `true`

## `public.ref_language`
- **ALL** `Écriture admin des langues` — roles ['public']
  - `((auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`
- **SELECT** `Lecture publique des langues` — roles ['public']
  - `true`

## `public.ref_legal_type`
- **ALL** `admin_legal_type_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_legal_type_read` — roles ['public']
  - `true`

## `public.ref_object_relation_type`
- **ALL** `admin_object_relation_type_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_object_relation_type_read` — roles ['public']
  - `true`

## `public.ref_org_admin_role`
- **ALL** `admin_ref_org_admin_role_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])) | (auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `authed_ref_org_admin_role_read` — roles ['public']
  - `((auth.uid() IS NOT NULL) OR (auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])))`

## `public.ref_org_business_role`
- **ALL** `admin_ref_org_business_role_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])) | (auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `authed_ref_org_business_role_read` — roles ['public']
  - `((auth.uid() IS NOT NULL) OR (auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])))`

## `public.ref_org_role`
- **SELECT** `Lecture publique des rôles d'organisation` — roles ['public']
  - `true`

## `public.ref_permission`
- **ALL** `admin_ref_permission_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])) | (auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `authed_ref_permission_read` — roles ['public']
  - `((auth.uid() IS NOT NULL) OR (auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])))`

## `public.ref_review_source`
- **ALL** `Écriture admin des sources d'avis` — roles ['public']
  - `((auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`
- **SELECT** `Lecture publique des sources d'avis` — roles ['public']
  - `true`

## `public.ref_sustainability_action`
- **ALL** `Écriture admin des actions DD` — roles ['public']
  - `((auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`
- **SELECT** `Lecture publique des actions DD` — roles ['public']
  - `true`

## `public.ref_sustainability_action_category`
- **ALL** `Écriture admin des catégories DD` — roles ['public']
  - `((auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])) OR api.is_platform_superuser())`
- **SELECT** `Lecture publique des catégories DD` — roles ['public']
  - `true`

## `public.ref_sustainability_action_group`
- **ALL** `admin_write_ref_sustainability_action_group` — roles ['public']
  - `((auth.role() = 'service_role'::text) OR (auth.role() = 'admin'::text) OR api.is_platform_superuser())`
- **SELECT** `pub_ref_sustainability_action_group_read` — roles ['public']
  - `true`

## `public.ref_tag`
- **ALL** `admin_tag_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `pub_tag_read` — roles ['public']
  - `true`

## `public.tag_link`
- **DELETE** `canonical_del_tag_link` — roles ['public']
  - `(((target_table = 'object'::text) AND api.user_can_write_object_canonical(target_pk)) OR (( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text])))`
- **INSERT** `canonical_ins_tag_link` — roles ['public']
  - `(((target_table = 'object'::text) AND api.user_can_write_object_canonical(target_pk)) OR (( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text])))`
- **SELECT** `read_tag_link` — roles ['public']
  - `(((target_table = 'object'::text) AND api.can_read_object(target_pk)) OR (target_table <> 'object'::text))`
- **UPDATE** `canonical_upd_tag_link` — roles ['public']
  - `(((target_table = 'object'::text) AND api.user_can_write_object_canonical(target_pk)) OR (( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text]))) | (((target_table = 'object'::text) AND api.user_can_write_object_canonical(target_pk)) OR (( SELECT auth.role() AS role) = ANY (ARRAY['service_role'::text, 'admin'::text])))`

## `public.user_org_admin_role`
- **ALL** `admin_user_org_admin_role_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])) | (auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `member_user_org_admin_role_read` — roles ['public']
  - `(api.is_platform_superuser() OR ((is_active = true) AND (EXISTS ( SELECT 1
   FROM user_org_membership m
  WHERE ((m.id = user_org_admin_role.membership_id) AND (m.is_active = true) AND ((m.user_id = auth.uid()) OR (m.org_object_id = api.current_user_org_id())))))))`

## `public.user_org_business_role`
- **ALL** `admin_user_org_business_role_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])) | (auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `member_user_org_business_role_read` — roles ['public']
  - `(api.is_platform_superuser() OR ((is_active = true) AND (EXISTS ( SELECT 1
   FROM user_org_membership m
  WHERE ((m.id = user_org_business_role.membership_id) AND (m.is_active = true) AND ((m.user_id = auth.uid()) OR (m.org_object_id = api.current_user_org_id())))))))`

## `public.user_org_membership`
- **ALL** `admin_user_org_membership_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])) | (auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `member_user_org_membership_read` — roles ['public']
  - `(api.is_platform_superuser() OR ((is_active = true) AND ((user_id = auth.uid()) OR (org_object_id = api.current_user_org_id()))))`

## `public.user_permission`
- **ALL** `admin_user_permission_write` — roles ['public']
  - `(auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text])) | (auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]))`
- **SELECT** `member_user_permission_read` — roles ['public']
  - `(api.is_platform_superuser() OR ((is_active = true) AND (user_id = auth.uid())) OR ((is_active = true) AND (EXISTS ( SELECT 1
   FROM user_org_membership m_target
  WHERE ((m_target.user_id = user_permission.user_id) AND (m_target.is_active = true) AND (m_target.org_object_id = api.current_user_org_id())))) AND (EXISTS ( SELECT 1
   FROM (user_org_membership m_caller
     JOIN user_org_admin_role  …[truncated — full text in catalog_extra.json or live pg_policies]`

## `storage.objects`
- **ALL RESTRICTIVE** `documents_no_anon_write` — roles ['anon', 'authenticated']
  - `(bucket_id <> 'documents'::text) | (bucket_id <> 'documents'::text)`
- **ALL** `documents_service_role_write` — roles ['service_role']
  - `(bucket_id = 'documents'::text) | (bucket_id = 'documents'::text)`
- **ALL RESTRICTIVE** `media_no_anon_write` — roles ['anon', 'authenticated']
  - `(bucket_id <> 'media'::text) | (bucket_id <> 'media'::text)`
- **ALL** `media_service_role_write` — roles ['service_role']
  - `(bucket_id = 'media'::text) | (bucket_id = 'media'::text)`
- **SELECT** `documents_public_read` — roles ['public']
  - `(bucket_id = 'documents'::text)`
- **SELECT** `media_public_read` — roles ['public']
  - `(bucket_id = 'media'::text)`
