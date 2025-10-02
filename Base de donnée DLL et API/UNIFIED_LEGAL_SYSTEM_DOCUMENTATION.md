# Unified Legal System Documentation

## Overview

The unified legal system replaces the separate `legal` and `accommodation_legal` tables with a single, flexible `object_legal` table that can handle legal records for any object type. This system provides comprehensive legal compliance tracking, expiry notifications, and audit capabilities.

## Architecture

### Core Tables

#### 1. `ref_legal_type`
Reference table defining different types of legal records.

**Columns:**
- `id` (UUID, PK): Unique identifier
- `code` (TEXT, UNIQUE): Short code (e.g., 'siret', 'tourist_tax')
- `name` (TEXT): Human-readable name
- `description` (TEXT): Detailed description
- `category` (TEXT): Category grouping (e.g., 'business', 'accommodation', 'insurance')
- `is_required` (BOOLEAN): Whether this type is mandatory
- `review_interval_days` (INTEGER): For tacit_renewal types, review frequency

#### 2. `object_legal`
Main table storing legal records for objects.

**Columns:**
- `id` (UUID, PK): Unique identifier
- `object_id` (TEXT, FK): Reference to object
- `type_id` (UUID, FK): Reference to legal type
- `value` (JSONB): Flexible storage for legal data
- `document_id` (UUID, FK): Supporting document
- `valid_from` (DATE): When the record becomes effective
- `valid_to` (DATE): When the record expires (nullable)
- `validity_mode` (ENUM): How validity is managed
- `status` (TEXT): Current status ('active', 'expired', 'suspended', 'revoked')
- `note` (TEXT): Additional notes

### Validity Modes

#### `forever`
- Open-ended validity
- `valid_to` must be NULL
- Used for permanent records (SIRET, SIREN)

#### `tacit_renewal`
- Considered valid unless revoked
- `valid_to` can be NULL
- Periodic reviews recommended
- Used for licenses that auto-renew

#### `fixed_end_date`
- Specific expiration date
- `valid_to` must be NOT NULL
- Used for time-limited permits

## Data Model Examples

### SIRET Record
```json
{
  "id": "uuid-1",
  "object_id": "HOT123",
  "type_id": "siret-type-uuid",
  "value": {"siret": "12345678901234"},
  "valid_from": "2024-01-01",
  "valid_to": null,
  "validity_mode": "forever",
  "status": "active"
}
```

### Tourist Tax Authorization
```json
{
  "id": "uuid-2",
  "object_id": "HOT123",
  "type_id": "tourist_tax-type-uuid",
  "value": {
    "number": "TT2024001",
    "issued_date": "2024-01-01"
  },
  "valid_from": "2024-01-01",
  "valid_to": "2024-12-31",
  "validity_mode": "fixed_end_date",
  "status": "active"
}
```

### Insurance Policy
```json
{
  "id": "uuid-3",
  "object_id": "HOT123",
  "type_id": "liability_insurance-type-uuid",
  "value": {
    "policy_number": "POL123456",
    "coverage_amount": "1000000",
    "insurer": "AXA"
  },
  "valid_from": "2024-01-01",
  "valid_to": "2024-12-31",
  "validity_mode": "fixed_end_date",
  "status": "active"
}
```

## API Functions

### Core Functions

#### `api.add_legal_record()`
Add a new legal record for an object.

**Parameters:**
- `p_object_id` (TEXT): Object identifier
- `p_type_code` (TEXT): Legal type code
- `p_value` (JSONB): Legal data
- `p_document_id` (UUID, optional): Supporting document
- `p_valid_from` (DATE, default: CURRENT_DATE): Start date
- `p_valid_to` (DATE, optional): End date
- `p_validity_mode` (ENUM, default: 'fixed_end_date'): Validity mode
- `p_note` (TEXT, optional): Additional notes

**Returns:** UUID of created record

#### `api.update_legal_record()`
Update an existing legal record.

**Parameters:**
- `p_legal_id` (UUID): Record identifier
- `p_value` (JSONB, optional): Updated data
- `p_document_id` (UUID, optional): Updated document
- `p_valid_from` (DATE, optional): Updated start date
- `p_valid_to` (DATE, optional): Updated end date
- `p_validity_mode` (ENUM, optional): Updated validity mode
- `p_status` (TEXT, optional): Updated status
- `p_note` (TEXT, optional): Updated notes

**Returns:** BOOLEAN (success)

### Query Functions

#### `api.get_object_legal_records(p_object_id)`
Get all legal records for an object.

**Returns:** Table with legal record details

#### `api.get_expiring_legal_records(p_days_ahead, p_object_id, p_type_codes)`
Get legal records expiring within specified days.

**Parameters:**
- `p_days_ahead` (INTEGER, default: 30): Days to look ahead
- `p_object_id` (TEXT, optional): Filter by object
- `p_type_codes` (TEXT[], optional): Filter by type codes

**Returns:** Table with expiring records

#### `api.check_object_legal_compliance(p_object_id)`
Check legal compliance for an object.

**Returns:** Table with compliance status for each required type

### API Format Functions

#### `api.get_object_legal_data(p_object_id)`
Get legal data in API JSON format.

**Returns:** JSONB array of legal records

#### `api.get_object_legal_compliance(p_object_id)`
Get compliance status in API JSON format.

**Returns:** JSON object with compliance summary and details

#### `api.get_expiring_legal_records_api(p_days_ahead, p_object_types, p_legal_types)`
Get expiring records in API JSON format.

**Returns:** JSON array of expiring records

#### `api.get_legal_records_by_type(p_type_code, p_object_types, p_status)`
Get all records of a specific type.

**Returns:** JSON array of records

### Notification Functions

#### `api.generate_legal_expiry_notifications(p_days_ahead, p_object_types)`
Generate expiry notifications.

**Returns:** JSON array of notifications with priority levels

### Audit Functions

#### `api.audit_legal_compliance(p_object_types, p_include_expired)`
Audit legal compliance across all objects.

**Returns:** JSON object with comprehensive audit results

## Views

### `v_active_legal_records`
View of all active legal records with object and type information.

### `v_expiring_legal_records`
View of legal records expiring in the next 30 days.

## Migration

### From `legal` Table
The `migrate_legal_table_data()` function migrates:
- SIRET numbers → `siret` type with `forever` validity
- SIREN numbers → `siren` type with `forever` validity
- VAT numbers → `vat_number` type with `forever` validity

### From `accommodation_legal` Table
The `migrate_accommodation_legal_table_data()` function migrates:
- Tourist tax → `tourist_tax` type with appropriate validity mode
- Accommodation license → `accommodation_license` type with appropriate validity mode

## Constraints and Validation

### Check Constraints
1. **Forever validity**: `validity_mode = 'forever' AND valid_to IS NULL`
2. **Fixed end date**: `validity_mode = 'fixed_end_date' AND valid_to IS NOT NULL`
3. **Date range**: `valid_to IS NULL OR valid_to >= valid_from`

### Unique Constraints
- `(object_id, type_id, valid_from)`: Prevents duplicate records for same type and date

### Indexes
- `(object_id, type_id)`: Fast object-type queries
- `(valid_to)`: Fast expiry queries
- `(validity_mode)`: Fast mode-based queries
- `(valid_to, status)`: Fast expiring records queries

## Use Cases

### 1. Legal Compliance Monitoring
```sql
-- Check if hotel has all required legal records
SELECT * FROM api.check_object_legal_compliance('HOT123');
```

### 2. Expiry Notifications
```sql
-- Get records expiring in next 30 days
SELECT * FROM api.get_expiring_legal_records(30);
```

### 3. Audit Reporting
```sql
-- Audit all hotels for legal compliance
SELECT api.audit_legal_compliance(ARRAY['HOT']);
```

### 4. Adding New Legal Records
```sql
-- Add new insurance policy
SELECT api.add_legal_record(
  'HOT123',
  'liability_insurance',
  '{"policy_number": "POL123", "coverage": "1000000"}',
  'doc-uuid',
  '2024-01-01',
  '2024-12-31',
  'fixed_end_date',
  'Annual liability insurance'
);
```

### 5. Updating Legal Records
```sql
-- Extend license validity
SELECT api.update_legal_record(
  'legal-uuid',
  NULL, -- value
  NULL, -- document_id
  NULL, -- valid_from
  '2025-12-31', -- new valid_to
  NULL, -- validity_mode
  'active', -- status
  'Extended for another year'
);
```

## Performance Considerations

### Indexing Strategy
- Primary queries are by `object_id` and `type_id`
- Expiry queries use `valid_to` index
- Status filtering uses `status` index

### Query Optimization
- Use specific object IDs when possible
- Filter by object types for large datasets
- Use date ranges for expiry queries

### Maintenance
- Regular cleanup of expired records
- Archive old records before deletion
- Monitor index performance

## Security Considerations

### Access Control
- Legal records may contain sensitive information
- Implement proper RLS policies
- Audit access to legal data

### Data Privacy
- Some legal data may be subject to GDPR
- Implement data retention policies
- Secure document storage

## Monitoring and Alerts

### Key Metrics
- Number of expiring records
- Compliance rate by object type
- Missing required records

### Alert Thresholds
- High priority: 7 days until expiry
- Medium priority: 14 days until expiry
- Low priority: 30 days until expiry

### Reporting
- Daily expiry reports
- Weekly compliance summaries
- Monthly audit reports

## Troubleshooting

### Common Issues

#### Constraint Violations
- **Forever mode with valid_to**: Set `valid_to` to NULL
- **Fixed end date without valid_to**: Provide `valid_to` date
- **Invalid date range**: Ensure `valid_to >= valid_from`

#### Performance Issues
- Add missing indexes
- Optimize query filters
- Consider partitioning for large datasets

#### Data Integrity
- Validate foreign key references
- Check constraint compliance
- Verify JSONB data structure

### Debugging Queries
```sql
-- Find constraint violations
SELECT * FROM object_legal 
WHERE (validity_mode = 'forever' AND valid_to IS NOT NULL)
   OR (validity_mode = 'fixed_end_date' AND valid_to IS NULL)
   OR (valid_to IS NOT NULL AND valid_to < valid_from);

-- Check for orphaned records
SELECT ol.* FROM object_legal ol
LEFT JOIN object o ON o.id = ol.object_id
WHERE o.id IS NULL;
```

## Future Enhancements

### Planned Features
- Automated renewal workflows
- Integration with external legal databases
- Advanced reporting and analytics
- Mobile app notifications

### Potential Improvements
- Document versioning
- Legal record templates
- Bulk operations
- API rate limiting

## Conclusion

The unified legal system provides a comprehensive, flexible solution for managing legal records across all object types. It offers robust compliance tracking, expiry management, and audit capabilities while maintaining data integrity and performance.

The system is designed to be:
- **Flexible**: Handles any type of legal record
- **Scalable**: Efficient queries and indexing
- **Maintainable**: Clear structure and documentation
- **Auditable**: Comprehensive tracking and reporting
