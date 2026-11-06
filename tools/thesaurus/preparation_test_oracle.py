"""Independent success assertions for the isolated preparation race harness."""
from __future__ import annotations

from psycopg2.extensions import TRANSACTION_STATUS_IDLE


CACHE_COLUMNS = (
    "cached_amenity_codes",
    "cached_payment_codes",
    "cached_environment_tags",
    "cached_language_codes",
    "cached_classification_codes",
    "cached_taxonomy_codes",
    "search_document",
    "search_document_text",
    "search_document_phonetic",
)
BUSINESS_EXCLUDED_COLUMNS = (*CACHE_COLUMNS, "updated_at")


def verify_success(connection, object_ids, before_business_rows, release_id, concept_id, expected_name):
    """Check a committed publication against the original single-object helper.

    ``before_business_rows`` must be captured after intentional concurrent edits
    commit and before the publisher is released. Its rows are (id, business hash),
    excluding exactly CACHE_COLUMNS and updated_at from to_jsonb(public.object).
    The canonical helper's writes are always contained in an explicit rollback;
    this function never commits object changes or repairs a failing publication.
    """
    assert connection.autocommit, "The oracle requires an idle autocommit connection"
    assert connection.get_transaction_status() == TRANSACTION_STATUS_IDLE, "The oracle must not roll back a caller transaction"
    assert release_id is not None and int(release_id) > 0, "A committed publication must identify its release"
    ids = list(object_ids)
    assert ids and len(ids) == len(set(ids)), "Supply a nonempty, distinct object set"
    expected_business = sorted(tuple(row) for row in before_business_rows)
    assert [row[0] for row in expected_business] == sorted(ids), "Business baseline does not cover the exact requested object set"

    def fetch_rows(query, params=()):
        with connection.cursor() as cursor:
            cursor.execute(query, params)
            return cursor.fetchall()

    def business_rows():
        return fetch_rows(
            "SELECT id,md5((to_jsonb(o)-%s::text[])::text) "
            "FROM public.object o WHERE id=ANY(%s) ORDER BY id",
            (list(BUSINESS_EXCLUDED_COLUMNS), ids),
        )

    # The identifiers below are a fixed source-controlled list, never caller SQL.
    cache_query = (
        "SELECT id,md5(jsonb_build_array("
        + ",".join("o." + column for column in CACHE_COLUMNS)
        + ")::text) FROM public.object o WHERE id=ANY(%s) ORDER BY id"
    )

    def cache_rows():
        return fetch_rows(cache_query, (ids,))

    pointer = fetch_rows("SELECT current_release_id FROM thesaurus.instance WHERE singleton")
    assert len(pointer) == 1 and str(pointer[0][0]) == str(release_id), ("Publication pointer mismatch", pointer, release_id)
    native = fetch_rows(
        "SELECT COALESCE(source.payload->>'name',source.payload->>'label',concept.code) "
        "FROM thesaurus.concept concept JOIN thesaurus.source_rows source "
        "ON (source.source_kind,source.source_id,source.domain)="
        "(concept.source_kind,concept.source_id,concept.domain) WHERE concept.concept_id=%s::uuid",
        (str(concept_id),),
    )
    assert native == [(expected_name,)], ("Native source was not published", native, expected_name)
    after_publication_business = business_rows()
    assert after_publication_business == expected_business, (
        "Publication changed object business/version/sync columns", expected_business, after_publication_business,
    )
    published_caches = cache_rows()
    assert [row[0] for row in published_caches] == sorted(ids), "Published object set differs from the expected set"

    with connection.cursor() as cursor:
        cursor.execute("BEGIN")
    try:
        for object_id in ids:
            with connection.cursor() as cursor:
                cursor.execute("SELECT api.refresh_object_filter_caches(%s)", (object_id,))
        canonical_caches = cache_rows()
        assert canonical_caches == published_caches, (
            "Published nine-column projection differs from the canonical helper", published_caches, canonical_caches,
        )
    finally:
        # Explicit SQL ROLLBACK also works for an autocommit connection, including
        # after a helper error has left the explicit transaction aborted.
        with connection.cursor() as cursor:
            cursor.execute("ROLLBACK")

    assert connection.get_transaction_status() == TRANSACTION_STATUS_IDLE
    assert cache_rows() == published_caches, "Canonical oracle writes escaped rollback"
    assert business_rows() == expected_business, "Canonical oracle changed committed business/version/sync columns"
    return {
        "current_release_matches": True,
        "native_source_matches": True,
        "object_business_version_sync_preserved": True,
        "canonical_nine_column_parity": True,
        "canonical_oracle_rolled_back": True,
        "verified_object_ids": sorted(ids),
        "published_nine_column_hashes": [list(row) for row in published_caches],
        "canonical_nine_column_hashes": [list(row) for row in canonical_caches],
    }
