# Native dictionary content review — 2026-11-10

## Scope and method

Independently reviewed the 148 new entries only: 58 public native dictionaries, 76 sustainability groups and 14 private role entries. Compared French labels and definitions with the supplied native dictionary or role context; checked English, Spanish and German for meaning consistency, label/definition distinction, scope drift and unsupported claims. Checked the public and private source identity sets against their context rows. This was a content review, not native-speaker certification or a legal review.

## Findings

- No source identity mismatch, missing locale, blank translated label or definition, label-equals-definition case, or material translation that changes the French meaning was found in the 148 reviewed entries.
- All 76 sustainability-group French labels and definitions match the supplied source text exactly. All 58 public rows and 14 private rows map to their expected source identities. The 148 entries are distinct from the completed prior corpus.
- No operational flags or source metadata are present in these content projections; the labels file adds localized display labels for the nine categories and does not change category membership.
- The nine translation nuances in the group authoring notes are credible owner-review questions, not demonstrated errors: carbon-reduction/low-carbon financing wording; ecological intent of coastal cleaning; scope of “réceptifs”; whether “accessibilité” means accessibility or reachability; and the intended breadth of “equivalent” renewable-electricity arrangements, among others. The existing translations generally preserve the French wording without adding a guarantee or legal threshold.
- Spanish “aforo” is a reasonable rendering of maximum venue capacity here because its definition specifies a maximum number of people. It should not be interpreted as independently verified legal capacity.
- French administrative document names and acronyms (Kbis, SIRENE, INPI and Cerfa) are retained and described neutrally. The translations do not assert that a document proves legal compliance or current status beyond the stated record.

## Validation and limits

The existing deterministic validator passes, but currently validates only 72 rows (58 public plus 14 private) and omits the 76 reviewed groups. A separate identity and locale check across all three files found 148 rows with exact context coverage and all four locales populated. The validator should be extended before it is treated as full-corpus validation. Linguistic nuance noted above remains appropriate for the group author/owner to resolve; no concrete content defect was established in this review.

Integration follow-up: the root extended the versioned validator to all 148 exact
source identities, including the 76 group records, their unchanged French source
text and the distinct public/private artifact formats. Its successful 148-row
result supersedes the 72-row tool limitation above; the semantic review remains
the independent review recorded here.

The default validator is portable: it checks all 134 public rows against the
versioned native source index. CI runs that check and the exhaustive 104-catalog
classification. `--include-private` additionally verifies the 14 private rows
against the local operator context; that content is kept out of the repository.
