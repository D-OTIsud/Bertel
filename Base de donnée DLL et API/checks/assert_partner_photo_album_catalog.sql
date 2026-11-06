-- Exact catalog contract for the photo-only preparation (closed) or reviewed
-- activation (open). Pure catalog reads; the caller supplies a transaction.
-- Expected descriptors come from the declarative SQL on isolated PostgreSQL 17,
-- with canonical predecessor grants; no production catalog/identity is embedded.
SET LOCAL search_path=pg_catalog,public,api,internal;
DO $catalog_contract$
DECLARE v record; v_json jsonb; v_expected jsonb; v_active boolean;
 v_contract constant jsonb := $contract$
{
  "functions": [
    {
      "signature": "api.portal_message_upload_context(text)",
      "source_md5": "5639376fb2db3a9fa10b848a8c3f4662",
      "active_source_md5": "5639376fb2db3a9fa10b848a8c3f4662",
      "catalog": {
        "acl": [
          [
            "authenticated",
            "postgres",
            "EXECUTE",
            false
          ],
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public,api"
        ],
        "strict": false,
        "definer": true,
        "returns": "jsonb",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_object_id text",
        "leakproof": false,
        "volatility": "v"
      },
      "active_acl": [
        [
          "authenticated",
          "postgres",
          "EXECUTE",
          false
        ],
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "api.send_portal_message(text,text,text,jsonb,text,uuid)",
      "source_md5": "77fd5064a6370507403718f72c117cb8",
      "active_source_md5": "77fd5064a6370507403718f72c117cb8",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public,api"
        ],
        "strict": false,
        "definer": true,
        "returns": "uuid",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_object_id text, p_subject text, p_body text, p_attachments jsonb DEFAULT '[]'::jsonb, p_reply_to text DEFAULT NULL::text, p_client_id uuid DEFAULT NULL::uuid",
        "leakproof": false,
        "volatility": "v"
      },
      "active_acl": [
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "api.portal_message_document(uuid)",
      "source_md5": "0e199f9e33068be528d7a86a7c364040",
      "active_source_md5": "0e199f9e33068be528d7a86a7c364040",
      "catalog": {
        "acl": [
          [
            "authenticated",
            "postgres",
            "EXECUTE",
            false
          ],
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public,api"
        ],
        "strict": false,
        "definer": true,
        "returns": "jsonb",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_document_id uuid",
        "leakproof": false,
        "volatility": "s"
      },
      "active_acl": [
        [
          "authenticated",
          "postgres",
          "EXECUTE",
          false
        ],
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "api.list_portal_message_documents(uuid)",
      "source_md5": "6f6940df421ddb25985f4c0ce0887236",
      "active_source_md5": "6f6940df421ddb25985f4c0ce0887236",
      "catalog": {
        "acl": [
          [
            "authenticated",
            "postgres",
            "EXECUTE",
            false
          ],
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public,api"
        ],
        "strict": false,
        "definer": true,
        "returns": "jsonb",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_interaction_id uuid",
        "leakproof": false,
        "volatility": "s"
      },
      "active_acl": [
        [
          "authenticated",
          "postgres",
          "EXECUTE",
          false
        ],
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "api.list_my_portal_messages(text)",
      "source_md5": "c46248e3af50aded8c76e3c2d6918207",
      "active_source_md5": "c46248e3af50aded8c76e3c2d6918207",
      "catalog": {
        "acl": [
          [
            "authenticated",
            "postgres",
            "EXECUTE",
            false
          ],
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public,api"
        ],
        "strict": false,
        "definer": true,
        "returns": "jsonb",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_object_id text",
        "leakproof": false,
        "volatility": "s"
      },
      "active_acl": [
        [
          "authenticated",
          "postgres",
          "EXECUTE",
          false
        ],
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "internal.portal_photo_assert_actor(text)",
      "source_md5": "4b59c2493e616de1095e2e4b7990988c",
      "active_source_md5": "4b59c2493e616de1095e2e4b7990988c",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public,api"
        ],
        "strict": false,
        "definer": true,
        "returns": "uuid",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_object_id text",
        "leakproof": false,
        "volatility": "v"
      },
      "active_acl": [
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "internal.portal_photos_json(text)",
      "source_md5": "6f95c8a52b100151d9cd977c3de40489",
      "active_source_md5": "6f95c8a52b100151d9cd977c3de40489",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public"
        ],
        "strict": false,
        "definer": false,
        "returns": "jsonb",
        "language": "sql",
        "parallel": "u",
        "arguments": "p_object_id text",
        "leakproof": false,
        "volatility": "s"
      },
      "active_acl": [
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "api.portal_photo_upload_context(text)",
      "source_md5": "44fcac2ee880212547ded6afee6391db",
      "active_source_md5": "44fcac2ee880212547ded6afee6391db",
      "catalog": {
        "acl": [
          [
            "authenticated",
            "postgres",
            "EXECUTE",
            false
          ],
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public,api,internal"
        ],
        "strict": false,
        "definer": true,
        "returns": "jsonb",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_object_id text",
        "leakproof": false,
        "volatility": "v"
      },
      "active_acl": [
        [
          "authenticated",
          "postgres",
          "EXECUTE",
          false
        ],
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "api.list_my_portal_photos(text)",
      "source_md5": "25bd7f838f26f725556fca1c13b06536",
      "active_source_md5": "25bd7f838f26f725556fca1c13b06536",
      "catalog": {
        "acl": [
          [
            "authenticated",
            "postgres",
            "EXECUTE",
            false
          ],
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public,api,internal"
        ],
        "strict": false,
        "definer": true,
        "returns": "jsonb",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_object_id text",
        "leakproof": false,
        "volatility": "s"
      },
      "active_acl": [
        [
          "authenticated",
          "postgres",
          "EXECUTE",
          false
        ],
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "api.withdraw_portal_photo(text,uuid)",
      "source_md5": "a5bc065728bf99e755a77208f40d2eca",
      "active_source_md5": "a5bc065728bf99e755a77208f40d2eca",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public,api,internal"
        ],
        "strict": false,
        "definer": true,
        "returns": "jsonb",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_object_id text, p_media_id uuid",
        "leakproof": false,
        "volatility": "v"
      },
      "active_acl": [
        [
          "authenticated",
          "postgres",
          "EXECUTE",
          false
        ],
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "api.reorder_portal_photos(text,jsonb)",
      "source_md5": "0bc33055580e17653c9dccc5dfee4fad",
      "active_source_md5": "0bc33055580e17653c9dccc5dfee4fad",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public,api,internal"
        ],
        "strict": false,
        "definer": true,
        "returns": "jsonb",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_object_id text, p_media_ids jsonb",
        "leakproof": false,
        "volatility": "v"
      },
      "active_acl": [
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "internal.validate_portal_photo_additions(text,jsonb,uuid)",
      "source_md5": "a3fdd6bae9f521258c7481df06c4b7f5",
      "active_source_md5": "a3fdd6bae9f521258c7481df06c4b7f5",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public,api"
        ],
        "strict": false,
        "definer": true,
        "returns": "void",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_object_id text, p_payload jsonb, p_user_id uuid",
        "leakproof": false,
        "volatility": "v"
      },
      "active_acl": [
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "api.portal_photo_preview(uuid)",
      "source_md5": "6a616a0f060a8026ce6398c4159222ee",
      "active_source_md5": "6a616a0f060a8026ce6398c4159222ee",
      "catalog": {
        "acl": [
          [
            "authenticated",
            "postgres",
            "EXECUTE",
            false
          ],
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public,api"
        ],
        "strict": false,
        "definer": true,
        "returns": "jsonb",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_document_id uuid",
        "leakproof": false,
        "volatility": "s"
      },
      "active_acl": [
        [
          "authenticated",
          "postgres",
          "EXECUTE",
          false
        ],
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "api.prepare_portal_photo_approval(uuid,boolean,uuid)",
      "source_md5": "34b7086ba27afbf3e3b4249c8204cadd",
      "active_source_md5": "34b7086ba27afbf3e3b4249c8204cadd",
      "catalog": {
        "acl": [
          [
            "authenticated",
            "postgres",
            "EXECUTE",
            false
          ],
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public,api,internal"
        ],
        "strict": false,
        "definer": true,
        "returns": "jsonb",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_id uuid, p_batch boolean, p_claim_id uuid",
        "leakproof": false,
        "volatility": "v"
      },
      "active_acl": [
        [
          "authenticated",
          "postgres",
          "EXECUTE",
          false
        ],
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "api.get_portal_photo_review(uuid)",
      "source_md5": "c4c970611354739163cec5a1f97b0107",
      "active_source_md5": "c4c970611354739163cec5a1f97b0107",
      "catalog": {
        "acl": [
          [
            "authenticated",
            "postgres",
            "EXECUTE",
            false
          ],
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public,api"
        ],
        "strict": false,
        "definer": true,
        "returns": "jsonb",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_change_id uuid",
        "leakproof": false,
        "volatility": "s"
      },
      "active_acl": [
        [
          "authenticated",
          "postgres",
          "EXECUTE",
          false
        ],
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "api.publish_portal_photo_additions(text,jsonb)",
      "source_md5": "2cb3dff0a63010819e3a25dfc18fdaa0",
      "active_source_md5": "2cb3dff0a63010819e3a25dfc18fdaa0",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public,api,internal"
        ],
        "strict": false,
        "definer": true,
        "returns": "jsonb",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_object_id text, p_payload jsonb",
        "leakproof": false,
        "volatility": "v"
      },
      "active_acl": [
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "api.portal_photo_failed_approval(uuid)",
      "source_md5": "d6c59366cebc471b31e8cee046dfced8",
      "active_source_md5": "d6c59366cebc471b31e8cee046dfced8",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ],
          [
            "service_role",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public"
        ],
        "strict": false,
        "definer": true,
        "returns": "jsonb",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_claim_id uuid",
        "leakproof": false,
        "volatility": "v"
      },
      "active_acl": [
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ],
        [
          "service_role",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "api.actor_portal_floor_modules()",
      "source_md5": "665978299c69efd2c98f6eb05d3a1890",
      "active_source_md5": "665978299c69efd2c98f6eb05d3a1890",
      "catalog": {
        "acl": [
          [
            "authenticated",
            "postgres",
            "EXECUTE",
            false
          ],
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ],
          [
            "service_role",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [],
        "strict": false,
        "definer": false,
        "returns": "text[]",
        "language": "sql",
        "parallel": "u",
        "arguments": "",
        "leakproof": false,
        "volatility": "i"
      },
      "active_acl": [
        [
          "authenticated",
          "postgres",
          "EXECUTE",
          false
        ],
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ],
        [
          "service_role",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "api.submit_actor_fiche(text,jsonb,text)",
      "source_md5": "e0b91bc214a91cd7af76672adad363d6",
      "active_source_md5": "e0b91bc214a91cd7af76672adad363d6",
      "catalog": {
        "acl": [
          [
            "authenticated",
            "postgres",
            "EXECUTE",
            false
          ],
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ],
          [
            "service_role",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=public,api,auth,pg_temp"
        ],
        "strict": false,
        "definer": true,
        "returns": "jsonb",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_object_id text, p_changes jsonb, p_note text DEFAULT NULL::text",
        "leakproof": false,
        "volatility": "v"
      },
      "active_acl": [
        [
          "authenticated",
          "postgres",
          "EXECUTE",
          false
        ],
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ],
        [
          "service_role",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "api.approve_pending_change(uuid,text,boolean)",
      "source_md5": "6b397ae9bf5c169c2d84f923b331966e",
      "active_source_md5": "6b397ae9bf5c169c2d84f923b331966e",
      "catalog": {
        "acl": [
          [
            "authenticated",
            "postgres",
            "EXECUTE",
            false
          ],
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ],
          [
            "service_role",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "lock_timeout=5s",
          "search_path=public,api,auth,pg_temp"
        ],
        "strict": false,
        "definer": true,
        "returns": "jsonb",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_id uuid, p_review_note text DEFAULT NULL::text, p_applied_manually boolean DEFAULT false",
        "leakproof": false,
        "volatility": "v"
      },
      "active_acl": [
        [
          "authenticated",
          "postgres",
          "EXECUTE",
          false
        ],
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ],
        [
          "service_role",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "api.can_read_object_for_correction(text)",
      "source_md5": "5f3aad478764f2ac4f92a43a40853f8e",
      "active_source_md5": "5f3aad478764f2ac4f92a43a40853f8e",
      "catalog": {
        "acl": [
          [
            "authenticated",
            "postgres",
            "EXECUTE",
            false
          ],
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public,api,auth,pg_temp"
        ],
        "strict": false,
        "definer": true,
        "returns": "boolean",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_object_id text",
        "leakproof": false,
        "volatility": "s"
      },
      "active_acl": [
        [
          "authenticated",
          "postgres",
          "EXECUTE",
          false
        ],
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "internal.gallery_published_photo_count(text)",
      "source_md5": "ec22e1567cd1887c340e0321876c5c57",
      "active_source_md5": "ec22e1567cd1887c340e0321876c5c57",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public"
        ],
        "strict": false,
        "definer": false,
        "returns": "integer",
        "language": "sql",
        "parallel": "u",
        "arguments": "p_object_id text",
        "leakproof": false,
        "volatility": "s"
      },
      "active_acl": [
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "internal.gallery_photo_reservations(text)",
      "source_md5": "0fa0cc8c3ad8c7840043d2650642cdc6",
      "active_source_md5": "0fa0cc8c3ad8c7840043d2650642cdc6",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public"
        ],
        "strict": false,
        "definer": false,
        "returns": "TABLE(document_id uuid, replace_media_id uuid)",
        "language": "sql",
        "parallel": "u",
        "arguments": "p_object_id text",
        "leakproof": false,
        "volatility": "s"
      },
      "active_acl": [
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "internal.gallery_photo_usage(text)",
      "source_md5": "6471e4e8a4af9ad59d2cb0e4a7f29cf4",
      "active_source_md5": "6471e4e8a4af9ad59d2cb0e4a7f29cf4",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public,internal"
        ],
        "strict": false,
        "definer": false,
        "returns": "integer",
        "language": "sql",
        "parallel": "u",
        "arguments": "p_object_id text",
        "leakproof": false,
        "volatility": "s"
      },
      "active_acl": [
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "internal.gallery_assert_photo_capacity(text,integer,integer)",
      "source_md5": "e67cf51c1963d6b7c285f3515d515b66",
      "active_source_md5": "e67cf51c1963d6b7c285f3515d515b66",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public,internal"
        ],
        "strict": false,
        "definer": false,
        "returns": "void",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_object_id text, p_previous_usage integer, p_previous_published integer",
        "leakproof": false,
        "volatility": "v"
      },
      "active_acl": [
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "internal.gallery_arm_photo_reservation(text,uuid,uuid)",
      "source_md5": "098dfbf450b18668cb64e51f6aa58a09",
      "active_source_md5": "098dfbf450b18668cb64e51f6aa58a09",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public,internal"
        ],
        "strict": false,
        "definer": false,
        "returns": "void",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_object_id text, p_document_id uuid, p_replace_media_id uuid",
        "leakproof": false,
        "volatility": "v"
      },
      "active_acl": [
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "internal.gallery_bind_photo_proposal()",
      "source_md5": "0f97bc881ed306ae32fd225655bc719a",
      "active_source_md5": "0f97bc881ed306ae32fd225655bc719a",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public,internal,pg_temp"
        ],
        "strict": false,
        "definer": true,
        "returns": "trigger",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "",
        "leakproof": false,
        "volatility": "v"
      },
      "active_acl": [
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "api.reserve_portal_photo_upload(text,uuid,uuid)",
      "source_md5": "a5fce4c520cbde65eba79ad79606f1b8",
      "active_source_md5": "a5fce4c520cbde65eba79ad79606f1b8",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public,api,internal,auth,pg_temp"
        ],
        "strict": false,
        "definer": true,
        "returns": "jsonb",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_object_id text, p_upload_id uuid, p_replace_media_id uuid DEFAULT NULL::uuid",
        "leakproof": false,
        "volatility": "v"
      },
      "active_acl": [
        [
          "authenticated",
          "postgres",
          "EXECUTE",
          false
        ],
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "api.complete_portal_photo_upload(uuid,uuid,text,text,integer,integer)",
      "source_md5": "9547ed89070d14006643207c3b68ab91",
      "active_source_md5": "9547ed89070d14006643207c3b68ab91",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public,api,internal,auth,pg_temp"
        ],
        "strict": false,
        "definer": true,
        "returns": "jsonb",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_user_id uuid, p_document_id uuid, p_sha256 text, p_title text, p_width integer, p_height integer",
        "leakproof": false,
        "volatility": "v"
      },
      "active_acl": [
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ],
        [
          "service_role",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "api.cancel_portal_photo_upload(text,uuid)",
      "source_md5": "7e3c23242d2facfa131986db2c6908c7",
      "active_source_md5": "7e3c23242d2facfa131986db2c6908c7",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public,api,internal,auth,pg_temp"
        ],
        "strict": false,
        "definer": true,
        "returns": "jsonb",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_object_id text, p_document_id uuid",
        "leakproof": false,
        "volatility": "v"
      },
      "active_acl": [
        [
          "authenticated",
          "postgres",
          "EXECUTE",
          false
        ],
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "api.save_object_gallery(text,jsonb)",
      "source_md5": "408ea171ef9ec6c76e0afaaddbb23495",
      "active_source_md5": "408ea171ef9ec6c76e0afaaddbb23495",
      "catalog": {
        "acl": [
          [
            "authenticated",
            "postgres",
            "EXECUTE",
            false
          ],
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public,api,internal,auth,pg_temp"
        ],
        "strict": false,
        "definer": true,
        "returns": "jsonb",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_object_id text, p_payload jsonb",
        "leakproof": false,
        "volatility": "v"
      },
      "active_acl": [
        [
          "authenticated",
          "postgres",
          "EXECUTE",
          false
        ],
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "api.get_gallery_write_receipt(text,uuid)",
      "source_md5": "ee756718bb5d3f0ae342c6f0d47c6de0",
      "active_source_md5": "ee756718bb5d3f0ae342c6f0d47c6de0",
      "catalog": {
        "acl": [
          [
            "authenticated",
            "postgres",
            "EXECUTE",
            false
          ],
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public,api,internal,auth,pg_temp"
        ],
        "strict": false,
        "definer": true,
        "returns": "jsonb",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_object_id text, p_request_id uuid",
        "leakproof": false,
        "volatility": "s"
      },
      "active_acl": [
        [
          "authenticated",
          "postgres",
          "EXECUTE",
          false
        ],
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "internal.photo_analysis_local_day(timestamptz)",
      "source_md5": "38f1adbaaf626bd35e1294cb0393a43d",
      "active_source_md5": "38f1adbaaf626bd35e1294cb0393a43d",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog"
        ],
        "strict": false,
        "definer": false,
        "returns": "date",
        "language": "sql",
        "parallel": "u",
        "arguments": "p_at timestamp with time zone",
        "leakproof": false,
        "volatility": "i"
      },
      "active_acl": [
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "internal.photo_analysis_reset_at(date)",
      "source_md5": "c4bc45e6cc7999eea96bf7b6bff21c9c",
      "active_source_md5": "c4bc45e6cc7999eea96bf7b6bff21c9c",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog"
        ],
        "strict": false,
        "definer": false,
        "returns": "timestamp with time zone",
        "language": "sql",
        "parallel": "u",
        "arguments": "p_day date",
        "leakproof": false,
        "volatility": "i"
      },
      "active_acl": [
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "internal.photo_analysis_assert_owner(text,uuid)",
      "source_md5": "bd9444a8b10dcd937f4f50eb843a52a8",
      "active_source_md5": "bd9444a8b10dcd937f4f50eb843a52a8",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public,api,internal,auth,pg_temp"
        ],
        "strict": false,
        "definer": true,
        "returns": "uuid",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_object_id text, p_document_id uuid",
        "leakproof": false,
        "volatility": "s"
      },
      "active_acl": [
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "internal.photo_analysis_json(uuid)",
      "source_md5": "1743f873326cdba918b5211d2cdd1337",
      "active_source_md5": "1743f873326cdba918b5211d2cdd1337",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,internal"
        ],
        "strict": false,
        "definer": false,
        "returns": "jsonb",
        "language": "sql",
        "parallel": "u",
        "arguments": "p_id uuid",
        "leakproof": false,
        "volatility": "s"
      },
      "active_acl": [
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "internal.photo_analysis_envelope(uuid)",
      "source_md5": "faf46fc45060eb0a25af7e6bcb3d78a6",
      "active_source_md5": "faf46fc45060eb0a25af7e6bcb3d78a6",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public,internal"
        ],
        "strict": false,
        "definer": false,
        "returns": "jsonb",
        "language": "sql",
        "parallel": "u",
        "arguments": "p_id uuid",
        "leakproof": false,
        "volatility": "s"
      },
      "active_acl": [
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "internal.photo_assessment_valid(jsonb)",
      "source_md5": "731195a162c9fed769431901ebae7e47",
      "active_source_md5": "731195a162c9fed769431901ebae7e47",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog"
        ],
        "strict": false,
        "definer": false,
        "returns": "boolean",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_value jsonb",
        "leakproof": false,
        "volatility": "i"
      },
      "active_acl": [
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "api.reserve_portal_photo_analysis(text,uuid,uuid)",
      "source_md5": "e372c27fd334aaa0d6ed41f87ec264f4",
      "active_source_md5": "e372c27fd334aaa0d6ed41f87ec264f4",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "lock_timeout=5s",
          "search_path=pg_catalog,public,api,internal,auth,pg_temp"
        ],
        "strict": false,
        "definer": true,
        "returns": "jsonb",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_object_id text, p_document_id uuid, p_request_id uuid",
        "leakproof": false,
        "volatility": "v"
      },
      "active_acl": [
        [
          "authenticated",
          "postgres",
          "EXECUTE",
          false
        ],
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "api.get_portal_photo_analysis(uuid)",
      "source_md5": "aabe091cac52f851258f948e95ec652f",
      "active_source_md5": "aabe091cac52f851258f948e95ec652f",
      "catalog": {
        "acl": [
          [
            "authenticated",
            "postgres",
            "EXECUTE",
            false
          ],
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public,api,internal,auth,pg_temp"
        ],
        "strict": false,
        "definer": true,
        "returns": "jsonb",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_request_id uuid",
        "leakproof": false,
        "volatility": "s"
      },
      "active_acl": [
        [
          "authenticated",
          "postgres",
          "EXECUTE",
          false
        ],
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "api.start_portal_photo_analysis(uuid,uuid)",
      "source_md5": "6a115e697591fb28dac15a7ca7a8910b",
      "active_source_md5": "6a115e697591fb28dac15a7ca7a8910b",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "lock_timeout=5s",
          "search_path=pg_catalog,public,api,internal,auth,pg_temp"
        ],
        "strict": false,
        "definer": true,
        "returns": "jsonb",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_request_id uuid, p_claim_id uuid",
        "leakproof": false,
        "volatility": "v"
      },
      "active_acl": [
        [
          "authenticated",
          "postgres",
          "EXECUTE",
          false
        ],
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "api.finish_portal_photo_analysis(uuid,uuid,jsonb)",
      "source_md5": "b585a79d0ca486e5c1a62abea0e9b00c",
      "active_source_md5": "b585a79d0ca486e5c1a62abea0e9b00c",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ],
          [
            "service_role",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "lock_timeout=5s",
          "search_path=pg_catalog,public,api,internal,auth,pg_temp"
        ],
        "strict": false,
        "definer": true,
        "returns": "jsonb",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_request_id uuid, p_claim_id uuid, p_outcome jsonb",
        "leakproof": false,
        "volatility": "v"
      },
      "active_acl": [
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ],
        [
          "service_role",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "api.appeal_portal_photo_analysis(uuid,text,uuid)",
      "source_md5": "9d27522cdf3fb6dd1a54bdff2261ff80",
      "active_source_md5": "9d27522cdf3fb6dd1a54bdff2261ff80",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "lock_timeout=5s",
          "search_path=pg_catalog,public,api,internal,auth,pg_temp"
        ],
        "strict": false,
        "definer": true,
        "returns": "uuid",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_request_id uuid, p_body text, p_client_id uuid",
        "leakproof": false,
        "volatility": "v"
      },
      "active_acl": [
        [
          "authenticated",
          "postgres",
          "EXECUTE",
          false
        ],
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "internal.portal_photo_actor_writes_enabled()",
      "source_md5": "5edaa81d56c3ca4002303ab379e8e00a",
      "active_source_md5": "7a31866ed1030d580f46000be0a46a46",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog"
        ],
        "strict": false,
        "definer": false,
        "returns": "boolean",
        "language": "sql",
        "parallel": "u",
        "arguments": "",
        "leakproof": false,
        "volatility": "s"
      },
      "active_acl": [
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "internal.portal_photo_assert_writes_open()",
      "source_md5": "7248051e04fc047d0ef8dde443dbfc45",
      "active_source_md5": "7248051e04fc047d0ef8dde443dbfc45",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,internal"
        ],
        "strict": false,
        "definer": false,
        "returns": "void",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "",
        "leakproof": false,
        "volatility": "s"
      },
      "active_acl": [
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "internal.portal_photo_text_snapshot(text,text,jsonb,jsonb,text)",
      "source_md5": "b5ee1d7c5ca8575bb1ccf270f5cbe8c2",
      "active_source_md5": "b5ee1d7c5ca8575bb1ccf270f5cbe8c2",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog"
        ],
        "strict": false,
        "definer": false,
        "returns": "jsonb",
        "language": "sql",
        "parallel": "u",
        "arguments": "p_title text, p_description text, p_title_i18n jsonb, p_description_i18n jsonb, p_revision text",
        "leakproof": false,
        "volatility": "i"
      },
      "active_acl": [
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "internal.portal_photo_order_snapshot(text)",
      "source_md5": "6f21fd8308e7c3f69015258a36e2c00b",
      "active_source_md5": "6f21fd8308e7c3f69015258a36e2c00b",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public"
        ],
        "strict": false,
        "definer": false,
        "returns": "jsonb",
        "language": "sql",
        "parallel": "u",
        "arguments": "p_object_id text",
        "leakproof": false,
        "volatility": "s"
      },
      "active_acl": [
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "internal.portal_photo_workspace_json(text,uuid)",
      "source_md5": "8dfdc1baa12f0f1ce3160a1ff33a1302",
      "active_source_md5": "8dfdc1baa12f0f1ce3160a1ff33a1302",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public,api,internal,auth"
        ],
        "strict": false,
        "definer": false,
        "returns": "jsonb",
        "language": "sql",
        "parallel": "u",
        "arguments": "p_object_id text, p_actor_id uuid",
        "leakproof": false,
        "volatility": "s"
      },
      "active_acl": [
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "api.get_my_portal_photo_workspace(text)",
      "source_md5": "3c0ebe6838a87eb01ac48004d787d785",
      "active_source_md5": "3c0ebe6838a87eb01ac48004d787d785",
      "catalog": {
        "acl": [
          [
            "authenticated",
            "postgres",
            "EXECUTE",
            false
          ],
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public,api,internal,auth,pg_temp"
        ],
        "strict": false,
        "definer": true,
        "returns": "jsonb",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_object_id text",
        "leakproof": false,
        "volatility": "s"
      },
      "active_acl": [
        [
          "authenticated",
          "postgres",
          "EXECUTE",
          false
        ],
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "internal.update_portal_photo_texts(text,uuid,boolean,jsonb,text,text)",
      "source_md5": "38657a2ee2fb384ba845e56e62643f51",
      "active_source_md5": "38657a2ee2fb384ba845e56e62643f51",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public,api,internal,auth,pg_temp"
        ],
        "strict": false,
        "definer": false,
        "returns": "jsonb",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_object_id text, p_id uuid, p_private boolean, p_expected jsonb, p_title text, p_description text",
        "leakproof": false,
        "volatility": "v"
      },
      "active_acl": [
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "api.update_portal_photo_texts(text,uuid,jsonb,text,text)",
      "source_md5": "7e8199850c1fa78dd07b2f6b79158528",
      "active_source_md5": "7e8199850c1fa78dd07b2f6b79158528",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "lock_timeout=5s",
          "search_path=pg_catalog,public,api,internal,auth,pg_temp"
        ],
        "strict": false,
        "definer": true,
        "returns": "jsonb",
        "language": "sql",
        "parallel": "u",
        "arguments": "p_object_id text, p_media_id uuid, p_expected jsonb, p_title text, p_description text",
        "leakproof": false,
        "volatility": "v"
      },
      "active_acl": [
        [
          "authenticated",
          "postgres",
          "EXECUTE",
          false
        ],
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "api.update_portal_photo_proposal_texts(text,uuid,jsonb,text,text)",
      "source_md5": "3607ea1821107f8bb864a990e546cac6",
      "active_source_md5": "3607ea1821107f8bb864a990e546cac6",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "lock_timeout=5s",
          "search_path=pg_catalog,public,api,internal,auth,pg_temp"
        ],
        "strict": false,
        "definer": true,
        "returns": "jsonb",
        "language": "sql",
        "parallel": "u",
        "arguments": "p_object_id text, p_document_id uuid, p_expected jsonb, p_title text, p_description text",
        "leakproof": false,
        "volatility": "v"
      },
      "active_acl": [
        [
          "authenticated",
          "postgres",
          "EXECUTE",
          false
        ],
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "api.reconcile_portal_photo_order(text,jsonb,jsonb)",
      "source_md5": "5f56f93a5500abae1b0eee6ca5a081d8",
      "active_source_md5": "5f56f93a5500abae1b0eee6ca5a081d8",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "lock_timeout=5s",
          "search_path=pg_catalog,public,api,internal,auth,pg_temp"
        ],
        "strict": false,
        "definer": true,
        "returns": "jsonb",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_object_id text, p_expected jsonb, p_media_ids jsonb",
        "leakproof": false,
        "volatility": "v"
      },
      "active_acl": [
        [
          "authenticated",
          "postgres",
          "EXECUTE",
          false
        ],
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "api.appeal_portal_photo_review(text,uuid,uuid,text,uuid)",
      "source_md5": "afaeffe50e20a79ebf04532a4f4fad0f",
      "active_source_md5": "afaeffe50e20a79ebf04532a4f4fad0f",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "lock_timeout=5s",
          "search_path=pg_catalog,public,api,internal,auth,pg_temp"
        ],
        "strict": false,
        "definer": true,
        "returns": "uuid",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_object_id text, p_document_id uuid, p_change_id uuid, p_body text, p_client_id uuid",
        "leakproof": false,
        "volatility": "v"
      },
      "active_acl": [
        [
          "authenticated",
          "postgres",
          "EXECUTE",
          false
        ],
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "internal.gallery_capture_photo_proposal_usage()",
      "source_md5": "360ab28205c9a79e000292d0bec340d0",
      "active_source_md5": "360ab28205c9a79e000292d0bec340d0",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public,internal,pg_temp"
        ],
        "strict": false,
        "definer": true,
        "returns": "trigger",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "",
        "leakproof": false,
        "volatility": "v"
      },
      "active_acl": [
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "internal.portal_photo_appeal_document(uuid)",
      "source_md5": "07845634e2fc3240ae127f63adf39617",
      "active_source_md5": "07845634e2fc3240ae127f63adf39617",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "search_path=pg_catalog,public,api,internal"
        ],
        "strict": false,
        "definer": false,
        "returns": "jsonb",
        "language": "sql",
        "parallel": "u",
        "arguments": "p_interaction_id uuid",
        "leakproof": false,
        "volatility": "s"
      },
      "active_acl": [
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    },
    {
      "signature": "api.reject_pending_change(uuid,text)",
      "source_md5": "3326541c58555fc8c19b0463d50abc11",
      "active_source_md5": "3326541c58555fc8c19b0463d50abc11",
      "catalog": {
        "acl": [
          [
            "authenticated",
            "postgres",
            "EXECUTE",
            false
          ],
          [
            "postgres",
            "postgres",
            "EXECUTE",
            false
          ],
          [
            "service_role",
            "postgres",
            "EXECUTE",
            false
          ]
        ],
        "kind": "f",
        "owner": "postgres",
        "config": [
          "lock_timeout=5s",
          "search_path=public,api,auth"
        ],
        "strict": false,
        "definer": true,
        "returns": "jsonb",
        "language": "plpgsql",
        "parallel": "u",
        "arguments": "p_id uuid, p_review_note text",
        "leakproof": false,
        "volatility": "v"
      },
      "active_acl": [
        [
          "authenticated",
          "postgres",
          "EXECUTE",
          false
        ],
        [
          "postgres",
          "postgres",
          "EXECUTE",
          false
        ],
        [
          "service_role",
          "postgres",
          "EXECUTE",
          false
        ]
      ]
    }
  ],
  "tables": [
    {
      "signature": "internal.gallery_write_receipt",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "DELETE",
            false
          ],
          [
            "postgres",
            "postgres",
            "INSERT",
            false
          ],
          [
            "postgres",
            "postgres",
            "MAINTAIN",
            false
          ],
          [
            "postgres",
            "postgres",
            "REFERENCES",
            false
          ],
          [
            "postgres",
            "postgres",
            "SELECT",
            false
          ],
          [
            "postgres",
            "postgres",
            "TRIGGER",
            false
          ],
          [
            "postgres",
            "postgres",
            "TRUNCATE",
            false
          ],
          [
            "postgres",
            "postgres",
            "UPDATE",
            false
          ]
        ],
        "rls": true,
        "owner": "postgres",
        "columns": [
          [
            "object_id",
            "text",
            true,
            null,
            "",
            ""
          ],
          [
            "user_id",
            "uuid",
            true,
            null,
            "",
            ""
          ],
          [
            "request_id",
            "uuid",
            true,
            null,
            "",
            ""
          ],
          [
            "request",
            "jsonb",
            true,
            null,
            "",
            ""
          ],
          [
            "completed_at",
            "timestamp with time zone",
            true,
            "now()",
            "",
            ""
          ]
        ],
        "indexes": [
          [
            "gallery_write_receipt_pkey",
            "CREATE UNIQUE INDEX gallery_write_receipt_pkey ON internal.gallery_write_receipt USING btree (object_id, user_id, request_id)",
            true,
            true
          ]
        ],
        "policies": [],
        "force_rls": false,
        "constraints": [
          [
            "gallery_write_receipt_object_id_fkey",
            "f",
            "FOREIGN KEY (object_id) REFERENCES object(id) ON DELETE CASCADE",
            true,
            false,
            false
          ],
          [
            "gallery_write_receipt_pkey",
            "p",
            "PRIMARY KEY (object_id, user_id, request_id)",
            true,
            false,
            false
          ],
          [
            "gallery_write_receipt_user_id_fkey",
            "f",
            "FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE",
            true,
            false,
            false
          ]
        ]
      }
    },
    {
      "signature": "internal.portal_photo_analysis_settings",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "DELETE",
            false
          ],
          [
            "postgres",
            "postgres",
            "INSERT",
            false
          ],
          [
            "postgres",
            "postgres",
            "MAINTAIN",
            false
          ],
          [
            "postgres",
            "postgres",
            "REFERENCES",
            false
          ],
          [
            "postgres",
            "postgres",
            "SELECT",
            false
          ],
          [
            "postgres",
            "postgres",
            "TRIGGER",
            false
          ],
          [
            "postgres",
            "postgres",
            "TRUNCATE",
            false
          ],
          [
            "postgres",
            "postgres",
            "UPDATE",
            false
          ]
        ],
        "rls": true,
        "owner": "postgres",
        "columns": [
          [
            "singleton",
            "boolean",
            true,
            "true",
            "",
            ""
          ],
          [
            "enabled",
            "boolean",
            true,
            "false",
            "",
            ""
          ],
          [
            "daily_analysis_limit",
            "integer",
            false,
            null,
            "",
            ""
          ],
          [
            "provider_id",
            "uuid",
            false,
            null,
            "",
            ""
          ]
        ],
        "indexes": [
          [
            "portal_photo_analysis_settings_pkey",
            "CREATE UNIQUE INDEX portal_photo_analysis_settings_pkey ON internal.portal_photo_analysis_settings USING btree (singleton)",
            true,
            true
          ]
        ],
        "policies": [],
        "force_rls": false,
        "constraints": [
          [
            "portal_photo_analysis_settings_check",
            "c",
            "CHECK (((NOT enabled) OR ((daily_analysis_limit IS NOT NULL) AND (provider_id IS NOT NULL))))",
            true,
            false,
            false
          ],
          [
            "portal_photo_analysis_settings_daily_analysis_limit_check",
            "c",
            "CHECK ((daily_analysis_limit > 0))",
            true,
            false,
            false
          ],
          [
            "portal_photo_analysis_settings_pkey",
            "p",
            "PRIMARY KEY (singleton)",
            true,
            false,
            false
          ],
          [
            "portal_photo_analysis_settings_provider_id_fkey",
            "f",
            "FOREIGN KEY (provider_id) REFERENCES app_ai_provider_config(id)",
            true,
            false,
            false
          ],
          [
            "portal_photo_analysis_settings_singleton_check",
            "c",
            "CHECK (singleton)",
            true,
            false,
            false
          ]
        ]
      }
    },
    {
      "signature": "internal.portal_photo_analysis",
      "catalog": {
        "acl": [
          [
            "postgres",
            "postgres",
            "DELETE",
            false
          ],
          [
            "postgres",
            "postgres",
            "INSERT",
            false
          ],
          [
            "postgres",
            "postgres",
            "MAINTAIN",
            false
          ],
          [
            "postgres",
            "postgres",
            "REFERENCES",
            false
          ],
          [
            "postgres",
            "postgres",
            "SELECT",
            false
          ],
          [
            "postgres",
            "postgres",
            "TRIGGER",
            false
          ],
          [
            "postgres",
            "postgres",
            "TRUNCATE",
            false
          ],
          [
            "postgres",
            "postgres",
            "UPDATE",
            false
          ]
        ],
        "rls": true,
        "owner": "postgres",
        "columns": [
          [
            "id",
            "uuid",
            true,
            null,
            "",
            ""
          ],
          [
            "object_id",
            "text",
            true,
            null,
            "",
            ""
          ],
          [
            "document_id",
            "uuid",
            true,
            null,
            "",
            ""
          ],
          [
            "actor_id",
            "uuid",
            true,
            null,
            "",
            ""
          ],
          [
            "created_by",
            "uuid",
            true,
            null,
            "",
            ""
          ],
          [
            "source_sha256",
            "text",
            true,
            null,
            "",
            ""
          ],
          [
            "contract_version",
            "text",
            true,
            "'photo-quality-v1'::text",
            "",
            ""
          ],
          [
            "local_day",
            "date",
            true,
            null,
            "",
            ""
          ],
          [
            "provider_id",
            "uuid",
            false,
            null,
            "",
            ""
          ],
          [
            "provider_revision",
            "timestamp with time zone",
            true,
            null,
            "",
            ""
          ],
          [
            "state",
            "text",
            true,
            "'reserved'::text",
            "",
            ""
          ],
          [
            "claim_id",
            "uuid",
            false,
            null,
            "",
            ""
          ],
          [
            "started_at",
            "timestamp with time zone",
            false,
            null,
            "",
            ""
          ],
          [
            "finished_at",
            "timestamp with time zone",
            false,
            null,
            "",
            ""
          ],
          [
            "outcome",
            "jsonb",
            false,
            null,
            "",
            ""
          ],
          [
            "created_at",
            "timestamp with time zone",
            true,
            "now()",
            "",
            ""
          ],
          [
            "appeal_interaction_id",
            "uuid",
            false,
            null,
            "",
            ""
          ],
          [
            "appeal_client_id",
            "uuid",
            false,
            null,
            "",
            ""
          ],
          [
            "appeal_intent_hash",
            "text",
            false,
            null,
            "",
            ""
          ]
        ],
        "indexes": [
          [
            "portal_photo_analysis_actor_day",
            "CREATE INDEX portal_photo_analysis_actor_day ON internal.portal_photo_analysis USING btree (actor_id, local_day, state)",
            true,
            true
          ],
          [
            "portal_photo_analysis_appeal",
            "CREATE INDEX portal_photo_analysis_appeal ON internal.portal_photo_analysis USING btree (appeal_interaction_id)",
            true,
            true
          ],
          [
            "portal_photo_analysis_appeal_client_id_key",
            "CREATE UNIQUE INDEX portal_photo_analysis_appeal_client_id_key ON internal.portal_photo_analysis USING btree (appeal_client_id)",
            true,
            true
          ],
          [
            "portal_photo_analysis_creator",
            "CREATE INDEX portal_photo_analysis_creator ON internal.portal_photo_analysis USING btree (created_by)",
            true,
            true
          ],
          [
            "portal_photo_analysis_document",
            "CREATE INDEX portal_photo_analysis_document ON internal.portal_photo_analysis USING btree (document_id)",
            true,
            true
          ],
          [
            "portal_photo_analysis_object",
            "CREATE INDEX portal_photo_analysis_object ON internal.portal_photo_analysis USING btree (object_id)",
            true,
            true
          ],
          [
            "portal_photo_analysis_one_attempt",
            "CREATE UNIQUE INDEX portal_photo_analysis_one_attempt ON internal.portal_photo_analysis USING btree (created_by, document_id, source_sha256, contract_version) WHERE (state = ANY (ARRAY['reserved'::text, 'started'::text, 'assessed'::text, 'uncertain'::text]))",
            true,
            true
          ],
          [
            "portal_photo_analysis_pkey",
            "CREATE UNIQUE INDEX portal_photo_analysis_pkey ON internal.portal_photo_analysis USING btree (id)",
            true,
            true
          ],
          [
            "portal_photo_analysis_provider",
            "CREATE INDEX portal_photo_analysis_provider ON internal.portal_photo_analysis USING btree (provider_id)",
            true,
            true
          ]
        ],
        "policies": [],
        "force_rls": false,
        "constraints": [
          [
            "portal_photo_analysis_actor_id_fkey",
            "f",
            "FOREIGN KEY (actor_id) REFERENCES actor(id) ON DELETE CASCADE",
            true,
            false,
            false
          ],
          [
            "portal_photo_analysis_appeal_client_id_key",
            "u",
            "UNIQUE (appeal_client_id)",
            true,
            false,
            false
          ],
          [
            "portal_photo_analysis_appeal_intent_hash_check",
            "c",
            "CHECK (((appeal_intent_hash IS NULL) OR (appeal_intent_hash ~ '^[0-9a-f]{64}$'::text)))",
            true,
            false,
            false
          ],
          [
            "portal_photo_analysis_appeal_interaction_id_fkey",
            "f",
            "FOREIGN KEY (appeal_interaction_id) REFERENCES crm_interaction(id) ON DELETE SET NULL",
            true,
            false,
            false
          ],
          [
            "portal_photo_analysis_check",
            "c",
            "CHECK (((state = ANY (ARRAY['assessed'::text, 'unavailable'::text, 'uncertain'::text])) = (outcome IS NOT NULL)))",
            true,
            false,
            false
          ],
          [
            "portal_photo_analysis_contract_version_check",
            "c",
            "CHECK ((contract_version = 'photo-quality-v1'::text))",
            true,
            false,
            false
          ],
          [
            "portal_photo_analysis_created_by_fkey",
            "f",
            "FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE",
            true,
            false,
            false
          ],
          [
            "portal_photo_analysis_document_id_fkey",
            "f",
            "FOREIGN KEY (document_id) REFERENCES ref_document(id) ON DELETE CASCADE",
            true,
            false,
            false
          ],
          [
            "portal_photo_analysis_object_id_fkey",
            "f",
            "FOREIGN KEY (object_id) REFERENCES object(id) ON DELETE CASCADE",
            true,
            false,
            false
          ],
          [
            "portal_photo_analysis_pkey",
            "p",
            "PRIMARY KEY (id)",
            true,
            false,
            false
          ],
          [
            "portal_photo_analysis_provider_id_fkey",
            "f",
            "FOREIGN KEY (provider_id) REFERENCES app_ai_provider_config(id) ON DELETE SET NULL",
            true,
            false,
            false
          ],
          [
            "portal_photo_analysis_source_sha256_check",
            "c",
            "CHECK ((source_sha256 ~ '^[0-9a-f]{64}$'::text))",
            true,
            false,
            false
          ],
          [
            "portal_photo_analysis_state_check",
            "c",
            "CHECK ((state = ANY (ARRAY['reserved'::text, 'started'::text, 'assessed'::text, 'unavailable'::text, 'uncertain'::text])))",
            true,
            false,
            false
          ]
        ]
      }
    }
  ],
  "policies": [
    {
      "signature": "correction_read_root_gallery",
      "table_name": "public.media",
      "catalog": {
        "check": null,
        "roles": [
          "authenticated"
        ],
        "table": "media",
        "using": "((place_id IS NULL) AND can_read_object_for_correction(object_id))",
        "command": "r",
        "permissive": true
      }
    },
    {
      "signature": "gallery_photo_no_direct_insert",
      "table_name": "public.media",
      "catalog": {
        "check": "(NOT ((object_id IS NOT NULL) AND (place_id IS NULL) AND (media_type_id IN ( SELECT ref_code_media_type.id\n   FROM ref_code_media_type\n  WHERE (ref_code_media_type.code = 'photo'::text)))))",
        "roles": [
          "anon",
          "authenticated"
        ],
        "table": "media",
        "using": null,
        "command": "a",
        "permissive": false
      }
    },
    {
      "signature": "gallery_photo_no_direct_update",
      "table_name": "public.media",
      "catalog": {
        "check": "(NOT ((object_id IS NOT NULL) AND (place_id IS NULL) AND (media_type_id IN ( SELECT ref_code_media_type.id\n   FROM ref_code_media_type\n  WHERE (ref_code_media_type.code = 'photo'::text)))))",
        "roles": [
          "anon",
          "authenticated"
        ],
        "table": "media",
        "using": "(NOT ((object_id IS NOT NULL) AND (place_id IS NULL) AND (media_type_id IN ( SELECT ref_code_media_type.id\n   FROM ref_code_media_type\n  WHERE (ref_code_media_type.code = 'photo'::text)))))",
        "command": "w",
        "permissive": false
      }
    },
    {
      "signature": "gallery_photo_no_direct_delete",
      "table_name": "public.media",
      "catalog": {
        "check": null,
        "roles": [
          "anon",
          "authenticated"
        ],
        "table": "media",
        "using": "(NOT ((object_id IS NOT NULL) AND (place_id IS NULL) AND (media_type_id IN ( SELECT ref_code_media_type.id\n   FROM ref_code_media_type\n  WHERE (ref_code_media_type.code = 'photo'::text)))))",
        "command": "d",
        "permissive": false
      }
    },
    {
      "signature": "portal_photo_receipt_no_direct_insert",
      "table_name": "public.ref_document",
      "catalog": {
        "check": "(COALESCE((extra ->> 'source'::text), ''::text) <> 'portal_photo'::text)",
        "roles": [
          "anon",
          "authenticated"
        ],
        "table": "ref_document",
        "using": null,
        "command": "a",
        "permissive": false
      }
    },
    {
      "signature": "portal_photo_receipt_no_direct_update",
      "table_name": "public.ref_document",
      "catalog": {
        "check": "(COALESCE((extra ->> 'source'::text), ''::text) <> 'portal_photo'::text)",
        "roles": [
          "anon",
          "authenticated"
        ],
        "table": "ref_document",
        "using": "(COALESCE((extra ->> 'source'::text), ''::text) <> 'portal_photo'::text)",
        "command": "w",
        "permissive": false
      }
    },
    {
      "signature": "portal_photo_receipt_no_direct_delete",
      "table_name": "public.ref_document",
      "catalog": {
        "check": null,
        "roles": [
          "anon",
          "authenticated"
        ],
        "table": "ref_document",
        "using": "(COALESCE((extra ->> 'source'::text), ''::text) <> 'portal_photo'::text)",
        "command": "d",
        "permissive": false
      }
    }
  ],
  "triggers": [
    {
      "signature": "gallery_bind_photo_proposal",
      "catalog": {
        "enabled": "O",
        "definition": "CREATE TRIGGER gallery_bind_photo_proposal AFTER INSERT ON public.pending_change FOR EACH ROW EXECUTE FUNCTION gallery_bind_photo_proposal()"
      }
    },
    {
      "signature": "gallery_capture_photo_proposal_usage",
      "catalog": {
        "enabled": "O",
        "definition": "CREATE TRIGGER gallery_capture_photo_proposal_usage BEFORE INSERT ON public.pending_change FOR EACH ROW EXECUTE FUNCTION gallery_capture_photo_proposal_usage()"
      }
    }
  ],
  "indexes": [
    {
      "signature": "public.uq_crm_portal_client_message",
      "catalog": {
        "ready": true,
        "valid": true,
        "definition": "CREATE UNIQUE INDEX uq_crm_portal_client_message ON public.crm_interaction USING btree (actor_id, ((extra ->> 'portal_client_id'::text))) WHERE ((source = 'portal'::text) AND ((extra ->> 'portal_client_id'::text) IS NOT NULL))"
      }
    },
    {
      "signature": "public.idx_ref_document_portal_photo_object",
      "catalog": {
        "ready": true,
        "valid": true,
        "definition": "CREATE INDEX idx_ref_document_portal_photo_object ON public.ref_document USING btree (((extra ->> 'object_id'::text))) WHERE ((extra ->> 'source'::text) = 'portal_photo'::text)"
      }
    }
  ],
  "notification_constraint": {
    "validated": true,
    "definition": "CHECK ((kind = ANY (ARRAY['crm_task_assigned'::text, 'fiche_submission_reviewed'::text, 'list_feature_requested'::text, 'pending_change_submitted'::text, 'portal_message'::text])))"
  }
}
$contract$::jsonb;
BEGIN
 v_active:=internal.portal_photo_actor_writes_enabled();
 IF v_active IS NULL THEN RAISE EXCEPTION 'Photo flag is missing a boolean state'; END IF;
 IF jsonb_array_length(v_contract->'functions')<>57 THEN RAISE EXCEPTION 'Incomplete photo catalog oracle'; END IF;
 FOR v IN SELECT * FROM jsonb_to_recordset(v_contract->'functions')
  AS x(signature text,source_md5 text,active_source_md5 text,catalog jsonb,active_acl jsonb) LOOP
  SELECT jsonb_build_object('owner',pg_get_userbyid(p.proowner),'language',l.lanname,'returns',pg_get_function_result(p.oid),'arguments',pg_get_function_arguments(p.oid),'definer',p.prosecdef,'volatility',p.provolatile,'strict',p.proisstrict,'leakproof',p.proleakproof,'parallel',p.proparallel,'kind',p.prokind,'config',COALESCE((SELECT jsonb_agg(regexp_replace(x,'[[:space:]]','','g') ORDER BY regexp_replace(x,'[[:space:]]','','g')) FROM unnest(p.proconfig) x),'[]'::jsonb),'acl',(SELECT jsonb_agg(jsonb_build_array(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,pg_get_userbyid(a.grantor),a.privilege_type,a.is_grantable) ORDER BY a.grantee=0,pg_get_userbyid(a.grantee),a.privilege_type,a.is_grantable) FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a)) INTO v_json FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure(v.signature);
  v_expected:=v.catalog;
  IF v_active THEN v_expected:=jsonb_set(v_expected,'{acl}',v.active_acl); END IF;
  IF v_json IS DISTINCT FROM v_expected THEN
   RAISE EXCEPTION 'Photo function attributes/required ACL differ (%)',v.signature;
  END IF;
  IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid=to_regprocedure(v.signature))
    IS DISTINCT FROM (CASE WHEN v_active THEN v.active_source_md5 ELSE v.source_md5 END) THEN
   RAISE EXCEPTION 'Photo function source differs (%)',v.signature;
  END IF;
 END LOOP;
 FOR v IN SELECT * FROM jsonb_to_recordset(v_contract->'tables') AS x(signature text,catalog jsonb) LOOP
  SELECT jsonb_build_object('owner',pg_get_userbyid(p.relowner),'rls',p.relrowsecurity,'force_rls',p.relforcerowsecurity,'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid),a.attidentity,a.attgenerated) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=to_regclass(v.signature) AND a.attnum>0 AND NOT a.attisdropped),'constraints',(SELECT COALESCE(jsonb_agg(jsonb_build_array(c.conname,c.contype,pg_get_constraintdef(c.oid),c.convalidated,c.condeferrable,c.condeferred) ORDER BY c.conname),'[]'::jsonb) FROM pg_constraint c WHERE c.conrelid=to_regclass(v.signature)),'indexes',(SELECT COALESCE(jsonb_agg(jsonb_build_array(c.relname,pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready) ORDER BY c.relname),'[]'::jsonb) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid=to_regclass(v.signature)),'acl',(SELECT jsonb_agg(jsonb_build_array(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,pg_get_userbyid(a.grantor),a.privilege_type,a.is_grantable) ORDER BY a.grantee=0,pg_get_userbyid(a.grantee),a.privilege_type,a.is_grantable) FROM aclexplode(COALESCE(p.relacl,acldefault('r',p.relowner))) a),'policies',(SELECT COALESCE(jsonb_agg(jsonb_build_array(polname,polcmd,polpermissive)),'[]'::jsonb) FROM pg_policy WHERE polrelid=p.oid)) INTO v_json FROM pg_class p WHERE p.oid=to_regclass(v.signature);
  IF v_json IS DISTINCT FROM v.catalog THEN RAISE EXCEPTION 'Photo table structure/constraints/indexes/ACL differ (%)',v.signature; END IF;
 END LOOP;
 FOR v IN SELECT * FROM jsonb_to_recordset(v_contract->'policies') AS x(signature text,table_name text,catalog jsonb) LOOP
  SELECT jsonb_build_object('table',p.polrelid::regclass::text,'command',p.polcmd,'permissive',p.polpermissive,'roles',(SELECT jsonb_agg(CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END ORDER BY CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END) FROM unnest(p.polroles) r),'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) INTO v_json FROM pg_policy p WHERE p.polname=v.signature AND p.polrelid=to_regclass(v.table_name);
  IF v_json IS DISTINCT FROM v.catalog THEN RAISE EXCEPTION 'Photo policy command/roles/expressions differ (%)',v.signature; END IF;
 END LOOP;
 FOR v IN SELECT * FROM jsonb_to_recordset(v_contract->'triggers') AS x(signature text,catalog jsonb) LOOP
  SELECT jsonb_build_object('definition',pg_get_triggerdef(oid),'enabled',tgenabled) INTO v_json
   FROM pg_trigger WHERE tgrelid='public.pending_change'::regclass AND tgname=v.signature AND NOT tgisinternal;
  IF v_json IS DISTINCT FROM v.catalog THEN RAISE EXCEPTION 'Photo proposal trigger differs (%)',v.signature; END IF;
 END LOOP;
 FOR v IN SELECT * FROM jsonb_to_recordset(v_contract->'indexes') AS x(signature text,catalog jsonb) LOOP
  SELECT jsonb_build_object('definition',pg_get_indexdef(indexrelid),'valid',indisvalid,'ready',indisready) INTO v_json
   FROM pg_index WHERE indexrelid=to_regclass(v.signature);
  IF v_json IS DISTINCT FROM v.catalog THEN RAISE EXCEPTION 'Photo supporting index differs (%)',v.signature; END IF;
 END LOOP;
 SELECT jsonb_build_object('definition',pg_get_constraintdef(oid),'validated',convalidated) INTO v_json
  FROM pg_constraint WHERE conrelid='public.app_notification'::regclass AND conname='chk_app_notification_kind';
 IF v_json IS DISTINCT FROM v_contract->'notification_constraint' THEN RAISE EXCEPTION 'Photo notification kind constraint differs'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.media'::regclass AND attname='extra'
   AND atttypid='jsonb'::regtype AND NOT attnotnull AND NOT atthasdef AND NOT attisdropped) THEN
  RAISE EXCEPTION 'The nullable media.extra JSONB contract differs';
 END IF;
 IF (SELECT count(*) FROM internal.portal_photo_analysis_settings)<>1
  OR NOT EXISTS(SELECT 1 FROM internal.portal_photo_analysis_settings
    WHERE singleton AND NOT enabled AND daily_analysis_limit IS NULL AND provider_id IS NULL) THEN
  RAISE EXCEPTION 'Photo analysis must remain OFF and unconfigured';
 END IF;
END;
$catalog_contract$;
