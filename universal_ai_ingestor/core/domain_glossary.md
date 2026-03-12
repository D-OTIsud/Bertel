# Bertel CRM Domain Glossary

This document outlines strict business logic definition for the Bertel system. The AI must adhere to these rules when mapping source data.

## Entity Types
1. **ORG (Organization/Prestataire)**: A business, group, partner, or entity providing services (e.g., a hotel, a tourism office, a restaurant).
2. **LOI (Location/Object of Interest)**: A physical location or distinct offering provided by an ORG (e.g., a specific hiking trail, a museum building, a hotel room). 
3. **MEDIA**: Links to photos, videos, or documents associated with an entity.
4. **JUNCTION**: Intermediate tables purely used to map many-to-many relationships (should rarely be the direct target of data rows, focus on the endpoints).

## Data Mapping Rules
- **external_id**: The unique identifier from the SOURCE system (not Bertel's internal ID). This is strictly required for deduplication.
- **Classification Schemes vs. Amenities**: 
  - **Classification Scheme / Value (`ref_classification_scheme_temp`)**: Hierarchical or rigidly categorized tags (e.g., "Star Rating -> 4 Stars", "Organization Type -> Hotel").
  - **Amenity (`object_amenity_temp`)**: Boolean or simple existence toggles for facilities (e.g., "Has Pool", "Allows Pets", "Wheelchair Accessible").
- **Payment Methods (`object_payment_method_temp`)**: Currencies or cards accepted (e.g., "Visa", "Cash", "Cheque Vacances").
- **Contact Channels (`contact_channel_temp`)**: Phone numbers, emails, websites, or social media links. Always standardize to lowercase for email/web.

## Transformation Guidelines
- Always use `split_gps` when latitude and longitude are combined in a single cell (e.g., "45.123, -1.456").
- Always use `lowercase` for emails and website URLs.
- ID columns (like `id_prestataire`) should use the `identity` transform but must map strictly to `external_id` or `source_org_object_id`.
