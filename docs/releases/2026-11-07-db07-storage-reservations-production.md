# DB07 — Registre privé de réservation Storage

Le 7 novembre 2026, une seule exécution approuvée a installé le registre DB07 et inscrit le reçu `20261107041336 private_storage_copy_reservations` dans la même transaction. Le client PostgreSQL a confirmé le COMMIT. Un contrôle distinct en lecture seule a retrouvé ce reçu, les 193 entrées précédentes intactes et 194 entrées au total.

| Élément | Identité vérifiée |
| --- | --- |
| [Corps exact du reçu](../../supabase/migrations/20261107041336_private_storage_copy_reservations.sql), 12 290 octets, une entrée dans le champ `statements` | SHA-256 `56a5d9565b5fb584a95ae624d0bdff909ef79da2bfda7f65bf12ba04e601d5de` |
| Contrôle en lecture seule après installation | SHA-256 `0dd2f0cf5c5e4f00ff99cf71bf273375bbf081e181066de7937e161460451273` |

Le contrôle a confirmé les postconditions du catalogue, dont les trois tables vides, les privilèges privés et le XID commun au reçu et aux trois tables. La migration versionne les octets du corps appliqué. Le manifeste d'installation neuve utilise le même fichier dans une transaction distincte, sans le garde lié au registre de production.

Aucune admission de copie n'a été créée. La copie physique et l'ouverture de l'opérateur restent des étapes distinctes. Sur un banc isolé équipé de Storage v1.41.8, hors production, les deux requêtes concurrentes create-only ont réussi aussi bien pour la copie que pour l’upload. Le registre contrôle la réservation côté PostgreSQL.
