import json
import os

from dbgraph.build import build_graph
from dbgraph.typemap import (write_function_access_md, write_object_types_md,
                             write_surface_coverage_md)

HERE = os.path.dirname(__file__)


def _fix(n):
    with open(os.path.join(HERE, "fixtures", n), encoding="utf-8") as f:
        return json.load(f)


def _g():
    return build_graph(_fix("schema_tbls.sample.json"), _fix("catalog_extra.sample.json"), sql_paths=[])


def _meta():
    with open(os.path.join(HERE, "object_type_meta.json"), encoding="utf-8") as f:
        return json.load(f)


def test_object_types_md_has_summary_and_per_type_sections():
    md = write_object_types_md(_g(), _meta())
    assert "# Object types" in md
    assert "## Summary" in md
    # every enum value gets a per-type section
    for code in ("RES", "ITI", "FMA", "ACT", "ORG", "HOT"):
        assert "### `%s`" % code in md


def test_object_types_md_surfaces_facet_applicability():
    # synthetic graph: object_type enum + facet tables + applies_to edges (the fixture's tbls sample
    # has no facet table nodes, so build_graph forms no applies_to edges there).
    nodes = [
        {"id": "public.object", "kind": "table", "label": "object", "schema": "public", "domain": "object-core", "doc": None, "props": {"columns": []}},
        {"id": "public.object_fma", "kind": "table", "label": "object_fma", "schema": "public", "domain": "object-facets", "doc": None, "props": {"columns": []}},
        {"id": "public.object_iti", "kind": "table", "label": "object_iti", "schema": "public", "domain": "object-facets", "doc": None, "props": {"columns": []}},
        {"id": "public.object_type", "kind": "enum", "label": "object_type", "schema": "public", "domain": None, "doc": None, "props": {"values": ["FMA", "ITI", "RES"]}},
    ]
    edges = [
        {"kind": "fk", "source": "public.object_fma", "target": "public.object", "props": {}},
        {"kind": "fk", "source": "public.object_iti", "target": "public.object", "props": {}},
        {"kind": "applies_to", "source": "public.object_type", "target": "public.object_fma", "props": {"object_type": "FMA"}},
        {"kind": "applies_to", "source": "public.object_type", "target": "public.object_iti", "props": {"object_type": "ITI"}},
    ]
    g = {"meta": {}, "nodes": nodes, "edges": edges, "partitions": {}}
    md = write_object_types_md(g, _meta())
    assert "object_fma" in md and "object_iti" in md
    # FMA's section names its facet; RES (no applicability here) says generic-only
    fma_block = md.split("### `FMA`", 1)[1].split("###", 1)[0]
    assert "object_fma" in fma_block


def test_object_types_md_marks_org_unsupported():
    md = write_object_types_md(_g(), _meta())
    org_block = md.split("### `ORG`", 1)[1].split("###", 1)[0]
    assert "unsupported" in org_block.lower()


def test_function_access_md_has_output_access_and_types():
    md = write_function_access_md(_g(), _meta())
    assert "**returns:**" in md
    assert "**access:**" in md
    assert "**object types served:**" in md
    # api functions are reachable via PostgREST rpc/
    assert "POST /rest/v1/rpc/" in md


def test_function_access_md_flags_trigger_functions():
    md = write_function_access_md(_g(), _meta())
    # assert_object_type_change_consistent returns trigger
    assert "trigger function" in md


def test_surface_coverage_rolls_up_partitions_and_separates_ledgers():
    # synthetic graph: object + an authorable child + a partitioned child + a system ledger
    nodes = [
        {"id": "public.object", "kind": "table", "label": "object", "schema": "public", "domain": "object-core", "doc": None, "props": {"columns": []}},
        {"id": "public.object_amenity", "kind": "table", "label": "object_amenity", "schema": "public", "domain": "object-core", "doc": None, "props": {"columns": []}},
        {"id": "public.object_version", "kind": "table", "label": "object_version", "schema": "public", "domain": "object-core", "doc": None, "props": {"columns": []}},
        {"id": "public.object_version_2026_03", "kind": "table", "label": "object_version_2026_03", "schema": "public", "domain": "object-core", "doc": None, "props": {"columns": []}},
        {"id": "public.promotion_usage", "kind": "table", "label": "promotion_usage", "schema": "public", "domain": "other", "doc": None, "props": {"columns": []}},
        {"id": "api.get_object_resource()", "kind": "function", "label": "get_object_resource", "schema": "api", "domain": "api", "doc": None, "props": {"signature": "get_object_resource()", "returns": "jsonb", "security_definer": True, "volatility": "s", "dynamic_sql": False}},
    ]
    edges = [
        {"kind": "fk", "source": "public.object_amenity", "target": "public.object", "props": {}},
        {"kind": "fk", "source": "public.object_version", "target": "public.object", "props": {}},
        {"kind": "fk", "source": "public.object_version_2026_03", "target": "public.object", "props": {}},
        {"kind": "fk", "source": "public.promotion_usage", "target": "public.object", "props": {}},
        {"kind": "reads", "source": "api.get_object_resource()", "target": "public.object_amenity", "props": {"inference": {"confidence": "high"}}},
        {"kind": "reads", "source": "api.get_object_resource()", "target": "public.object_version", "props": {"inference": {"confidence": "high"}}},
    ]
    g = {"meta": {}, "nodes": nodes, "edges": edges, "partitions": {"public.object_version_2026_03": "public.object_version"}}
    md = write_surface_coverage_md(g, _meta())
    # partition child is rolled up (not listed as its own authorable row), parent is covered
    assert "object_version_2026_03" not in md.split("## Covered")[0] or "rolled up" in md.lower()
    # the system ledger is reported separately, never as an authorable gap
    assert "promotion_usage" in md
    gaps_section = md.split("Candidate authorable gaps", 1)[1].split("## Covered", 1)[0]
    assert "promotion_usage" not in gaps_section
