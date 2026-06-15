from dbgraph.reference_extract import extract_reference_values, live_reference_tables, merge_reference_extracts


def test_extract_reference_values_from_insert_and_cte(tmp_path):
    sql = tmp_path / "seeds.sql"
    sql.write_text(
        """
        INSERT INTO ref_code (domain, code, name, description) VALUES
          ('payment_method', 'cash', 'Especes', 'Paiement liquide'),
          ('payment_method', 'card', 'Carte', 'Paiement CB')
        ON CONFLICT DO NOTHING;

        WITH src(slug, name, description) AS (
          VALUES ('family', 'Famille', 'Adapté aux familles')
        )
        INSERT INTO ref_tag (slug, name, description)
        SELECT slug, name, description FROM src;
        """,
        encoding="utf-8",
    )

    result = extract_reference_values([str(sql)])
    keys = {(row["table"], row["values"].get("domain"), row["values"].get("code"), row["values"].get("slug")) for row in result["rows"]}

    assert ("public.ref_code", "payment_method", "cash", None) in keys
    assert ("public.ref_code", "payment_method", "card", None) in keys
    assert ("public.ref_tag", None, None, "family") in keys


def test_extract_reference_values_tracks_derived_ref_insert(tmp_path):
    sql = tmp_path / "seeds.sql"
    sql.write_text(
        """
        INSERT INTO ref_code (domain, code, name)
        SELECT 'taxonomy_hot', cv.code, cv.name
        FROM ref_classification_value cv;
        """,
        encoding="utf-8",
    )

    result = extract_reference_values([str(sql)])

    assert result["rows"] == []
    assert result["derived_sources"][0]["table"] == "public.ref_code"


def test_live_reference_tables_skip_ref_code_partitions():
    graph = {
        "nodes": [
            {"id": "public.ref_code", "kind": "table", "schema": "public", "label": "ref_code",
             "props": {"columns": [{"name": "domain"}, {"name": "code"}]}},
            {"id": "public.ref_code_payment_method", "kind": "table", "schema": "public", "label": "ref_code_payment_method",
             "props": {"columns": [{"name": "domain"}, {"name": "code"}]}},
            {"id": "public.ref_tag", "kind": "table", "schema": "public", "label": "ref_tag",
             "props": {"columns": [{"name": "slug"}, {"name": "name"}]}},
            {"id": "staging.ref_tag_temp", "kind": "table", "schema": "staging", "label": "ref_tag_temp",
             "props": {"columns": [{"name": "slug"}]}},
        ]
    }
    extra = {"partitions": [{"child": "public.ref_code_payment_method", "parent": "public.ref_code"}]}

    targets = live_reference_tables(graph, extra)

    assert [t["table"] for t in targets] == ["public.ref_code", "public.ref_tag"]


def test_merge_reference_extracts_prefers_queried_live_tables():
    seed = {
        "rows": [
            {"table": "public.ref_code", "values": {"domain": "payment_method", "code": "cash"}, "source": "seed.sql:1"},
            {"table": "public.ref_tag", "values": {"slug": "family"}, "source": "seed.sql:4"},
        ],
        "derived_sources": [{"table": "public.ref_code", "source": "seed.sql:8"}],
    }
    live = {
        "rows": [
            {"table": "public.ref_code", "values": {"domain": "payment_method", "code": "especes"}, "source": "live:public.ref_code"},
        ],
        "derived_sources": [],
        "live": {"status": "queried", "tables": ["public.ref_code"], "errors": [], "truncated": []},
    }

    merged = merge_reference_extracts(seed, live)
    keys = {(row["table"], row["values"].get("code"), row["values"].get("slug"), row["source"]) for row in merged["rows"]}

    assert ("public.ref_code", "especes", None, "live:public.ref_code") in keys
    assert ("public.ref_code", "cash", None, "seed.sql:1") not in keys
    assert ("public.ref_tag", None, "family", "seed.sql:4") in keys
    assert merged["seed"]["rows"] == 2
