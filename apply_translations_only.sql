-- Apply only the i18n translations without running full seed data
-- This script extracts just the translation UPDATE statements from seeds_data.sql

-- =====================================================
-- 999. TRANSLATIONS (EN & ES) - EXTRACTED
-- =====================================================

-- ref_code translations (contact, social, schedule, media)
WITH ref_code_translations(domain, code, name_en, name_es, description_en, description_es) AS (
  VALUES
    ('contact_kind','phone','Phone','Teléfono','Front desk landline number','Número de teléfono fijo de recepción'),
    ('contact_kind','mobile','Mobile','Móvil','Mobile number for contacting the property','Número de móvil para contactar el establecimiento'),
    ('contact_kind','fax','Fax','Fax','Reception fax number','Número de fax de recepción'),
    ('contact_kind','email','Email','Correo electrónico','Primary email address','Dirección de correo electrónico principal'),
    ('contact_kind','website','Website','Sitio web','Official website URL','URL del sitio oficial'),
    ('contact_kind','booking_engine','Booking engine','Motor de reservas','Link to an online booking engine','Enlace a un motor de reservas en línea'),
    ('contact_kind','whatsapp','WhatsApp','WhatsApp','WhatsApp Business contact','Contacto de WhatsApp Business'),
    ('contact_kind','messenger','Messenger','Messenger','Facebook Messenger link','Enlace de Facebook Messenger'),
    ('contact_kind','sms','SMS','SMS','Number dedicated to SMS','Número dedicado a SMS'),
    ('contact_kind','skype','Skype','Skype','Skype ID','Identificador de Skype'),
    ('contact_kind','wechat','WeChat','WeChat','WeChat ID for Asian clientele','Identificador de WeChat para la clientela asiática'),
    ('contact_kind','line','LINE','LINE','LINE ID','Identificador de LINE'),
    ('contact_kind','viber','Viber','Viber','Viber contact','Contacto de Viber'),
    ('contact_kind','telegram','Telegram','Telegram','Telegram account for notifications','Cuenta de Telegram para notificaciones'),
    ('social_network','facebook','Facebook','Facebook','Official Facebook page','Página oficial de Facebook'),
    ('social_network','instagram','Instagram','Instagram','Instagram profile','Perfil de Instagram'),
    ('social_network','youtube','YouTube','YouTube','Destination YouTube channel','Canal de YouTube del destino'),
    ('social_network','tiktok','TikTok','TikTok','TikTok account for short-form content','Cuenta de TikTok para contenidos cortos'),
    ('social_network','pinterest','Pinterest','Pinterest','Pinterest inspiration boards','Tableros de inspiración en Pinterest'),
    ('social_network','linkedin','LinkedIn','LinkedIn','Professional LinkedIn page','Página profesional de LinkedIn'),
    ('social_network','twitter','X (Twitter)','X (Twitter)','X / Twitter account','Cuenta de X / Twitter'),
    ('social_network','tripadvisor','Tripadvisor','Tripadvisor','Tripadvisor listing','Ficha de Tripadvisor'),
    ('social_network','booking','Booking.com','Booking.com','Booking.com profile','Perfil en Booking.com'),
    ('social_network','google_business','Google Business Profile','Google Business Profile','Google Business Profile listing','Ficha de Google Business Profile'),
    ('social_network','wechat','WeChat','WeChat','Messaging and social network','Mensajería y red social'),
    ('social_network','line','LINE','LINE','Messaging and social network','Mensajería y red social'),
    ('weekday','monday','Monday','Lunes',NULL,NULL),
    ('weekday','tuesday','Tuesday','Martes',NULL,NULL),
    ('weekday','wednesday','Wednesday','Miércoles',NULL,NULL),
    ('weekday','thursday','Thursday','Jueves',NULL,NULL),
    ('weekday','friday','Friday','Viernes',NULL,NULL),
    ('weekday','saturday','Saturday','Sábado',NULL,NULL),
    ('weekday','sunday','Sunday','Domingo',NULL,NULL),
    ('opening_schedule_type','regular','Regular','Regular','Standard recurring schedule','Horario recurrente estándar'),
    ('opening_schedule_type','seasonal','Seasonal','Estacional','Schedule for seasonal periods','Horario para períodos estacionales'),
    ('opening_schedule_type','exceptional','Exceptional','Excepcional','Exceptional or special opening schedule','Horario excepcional o especial'),
    ('opening_schedule_type','by_appointment','By appointment','Con cita previa','Open only by appointment','Apertura solo con cita previa'),
    ('opening_schedule_type','continuous_service','Continuous service','Servicio continuo','Open continuously without closing','Abierto de forma continua sin cierre'),
    ('media_type','photo','Photo','Foto','Official photographs','Fotografías oficiales'),
    ('media_type','video','Video','Vídeo','Presentation videos','Vídeos de presentación'),
    ('media_type','audio','Audio','Audio','Audio files and podcasts','Archivos de audio y pódcasts'),
    ('media_type','brochure_pdf','PDF brochure','Folleto PDF','Downloadable brochures','Folletos descargables'),
    ('media_type','brochure_print','Printed brochure','Folleto impreso','Digitised printed brochures','Folletos impresos digitalizados'),
    ('media_type','plan','Map','Plano','Static map or plan','Plano o mapa estático'),
    ('media_type','virtual_tour','Virtual tour','Visita virtual','360° or immersive virtual tours','Visitas virtuales 360° o inmersivas'),
    ('media_type','webcam','Webcam','Webcam','Live webcam feed','Transmisión en vivo de webcam'),
    ('media_type','logo','Logo','Logotipo','Official logos','Logotipos oficiales'),
    ('media_type','press_kit','Press kit','Dossier de prensa','Media kits and press releases','Dossiers de prensa y comunicados'),
    ('media_type','vector','Vector','Vectorial','Vector files (SVG, PDF)','Archivos vectoriales (SVG, PDF)')
)
UPDATE ref_code rc
SET name_i18n = COALESCE(rc.name_i18n, '{}'::jsonb) || jsonb_build_object('en', rct.name_en, 'es', rct.name_es),
    description_i18n = CASE
      WHEN rct.description_en IS NULL AND rct.description_es IS NULL THEN rc.description_i18n
      ELSE COALESCE(rc.description_i18n, '{}'::jsonb) || COALESCE(jsonb_strip_nulls(jsonb_build_object('en', rct.description_en, 'es', rct.description_es)), '{}'::jsonb)
    END
FROM ref_code_translations rct
WHERE rc.domain = rct.domain AND rc.code = rct.code;

-- Test query to verify translations
SELECT 
  'ref_code' as table_name,
  domain,
  code,
  name,
  name_i18n,
  api.i18n_pick(name_i18n, 'en', 'fr') as name_en
FROM ref_code 
WHERE name_i18n IS NOT NULL 
LIMIT 5;
