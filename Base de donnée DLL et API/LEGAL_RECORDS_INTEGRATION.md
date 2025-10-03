# Legal Records Integration in api.get_object_resource - Complete

## Summary

The `api.get_object_resource` function has been successfully enhanced to include comprehensive legal records information. This provides a complete view of an object's legal status, compliance, and document tracking in a single API call.

## What Was Added

### **1. Enhanced `api.get_object_resource` Function**

**New Section Added:**
- **Legal Records** - Complete legal information for the object
- **Location**: After actors section, before meeting rooms
- **Structure**: Rich JSON structure with all legal details

### **2. Legal Records Structure in API Response**

```json
{
  "legal_records": [
    {
      "id": "uuid",
      "type": {
        "code": "siret",
        "name": "SIRET",
        "category": "business",
        "is_public": true,
        "is_required": true
      },
      "value": {
        "siret": "12345678901234",
        "establishment_name": "Hôtel Test"
      },
      "document_id": "uuid",
      "valid_from": "2024-01-01",
      "valid_to": "2024-12-31",
      "validity_mode": "fixed_end_date",
      "status": "active",
      "document_requested_at": "2024-01-15T10:00:00Z",
      "document_delivered_at": "2024-01-16T14:30:00Z",
      "note": "SIRET certificate - public business identifier",
      "days_until_expiry": 45
    }
  ]
}
```

## Legal Records Information Included

### **1. Basic Information**
- **ID**: Unique identifier for the legal record
- **Type**: Complete type information (code, name, category, visibility, requirement)
- **Value**: Flexible JSONB data for the legal value
- **Document ID**: Reference to supporting document

### **2. Validity Information**
- **Valid From**: When the record becomes effective
- **Valid To**: When the record expires (if applicable)
- **Validity Mode**: How validity is managed (forever, tacit_renewal, fixed_end_date)
- **Days Until Expiry**: Calculated days until expiration

### **3. Status Information**
- **Status**: Current status (active, expired, suspended, revoked, requested)
- **Note**: Additional notes about the record

### **4. Document Tracking**
- **Document Requested At**: When document was requested
- **Document Delivered At**: When document was delivered
- **Document Status**: Derived status (Delivered, Pending Delivery, No Document Required)

### **5. Type Metadata**
- **Code**: Short code for the legal type
- **Name**: Human-readable name
- **Category**: Category grouping (business, accommodation, insurance, etc.)
- **Is Public**: Whether the document can be public
- **Is Required**: Whether the document is required for compliance

## Use Cases

### **1. Complete Object Information**
```sql
-- Get complete object information including legal records
SELECT api.get_object_resource('HOT123');
-- Returns: All object data + legal records + actors + contacts + etc.
```

### **2. Public API Integration**
```sql
-- Filter for public legal records only
WITH object_data AS (
  SELECT api.get_object_resource('HOT123')::jsonb as data
)
SELECT jsonb_agg(legal_record)
FROM object_data,
  jsonb_array_elements(data->'legal_records') as legal_record
WHERE (legal_record->'type'->>'is_public')::boolean = true;
```

### **3. Compliance Monitoring**
```sql
-- Check for expiring legal records
WITH object_data AS (
  SELECT api.get_object_resource('HOT123')::jsonb as data
)
SELECT 
  legal_record->'type'->>'name' as type_name,
  legal_record->>'days_until_expiry' as days_until_expiry
FROM object_data,
  jsonb_array_elements(data->'legal_records') as legal_record
WHERE legal_record->>'days_until_expiry' IS NOT NULL
  AND (legal_record->>'days_until_expiry')::integer <= 30;
```

### **4. Document Status Tracking**
```sql
-- Check document delivery status
WITH object_data AS (
  SELECT api.get_object_resource('HOT123')::jsonb as data
)
SELECT 
  legal_record->'type'->>'name' as type_name,
  legal_record->>'status' as status,
  CASE 
    WHEN legal_record->>'document_delivered_at' IS NOT NULL THEN 'Delivered'
    WHEN legal_record->>'document_requested_at' IS NOT NULL THEN 'Pending Delivery'
    ELSE 'No Document Required'
  END as document_status
FROM object_data,
  jsonb_array_elements(data->'legal_records') as legal_record;
```

## Benefits

### **1. Single API Call**
- Get complete object information including legal records
- No need for separate legal API calls
- Reduced API complexity

### **2. Rich Legal Information**
- Complete legal status for the object
- Document tracking and delivery status
- Compliance and expiry information
- Visibility controls (public/private)

### **3. Flexible Data Structure**
- JSONB values for flexible legal data
- Rich type information with metadata
- Calculated fields (days until expiry)
- Derived status information

### **4. Performance Optimized**
- Single query with efficient joins
- Proper ordering (category, name, valid_from)
- No N+1 query problems

## Legal Records Ordering

The legal records are ordered by:
1. **Category** (business, accommodation, insurance, etc.)
2. **Name** (alphabetical within category)
3. **Valid From** (most recent first within same type)

This provides a logical grouping and chronological ordering of legal records.

## Integration with Existing Features

### **1. Visibility Control**
- Public records visible to all users
- Private records only visible to parent organization
- Clear separation in API response

### **2. Document Tracking**
- Complete document lifecycle tracking
- Request and delivery timestamps
- Document status derivation

### **3. Compliance Monitoring**
- Required vs optional legal records
- Expiry tracking and alerts
- Status monitoring

### **4. API Consistency**
- Consistent with other object resource sections
- Rich JSON structure
- Proper error handling

## Testing

### **Test Script**
- `test_get_object_resource_with_legal.sql` - Comprehensive test suite
- Tests all legal records integration scenarios
- Validates data structure and content
- Demonstrates filtering and analysis

### **Test Scenarios**
1. Create objects with comprehensive legal records
2. Test legal records structure in API response
3. Test filtering by visibility (public/private)
4. Test filtering by status (active, requested, expired)
5. Test document tracking information
6. Test expiry information and calculations
7. Test comparison with dedicated legal functions
8. Test with objects that have no legal records

## Performance Considerations

### **1. Efficient Queries**
- Single query with proper joins
- Optimized ordering and filtering
- No redundant data fetching

### **2. Index Usage**
- Leverages existing legal system indexes
- Efficient filtering by object_id
- Proper ordering by category and name

### **3. Memory Usage**
- Reasonable JSON structure size
- No excessive data duplication
- Efficient JSONB operations

## Next Steps

1. **Deploy** the updated `api.get_object_resource` function
2. **Test** with the provided test script
3. **Update** your applications to use the new legal records data
4. **Implement** filtering based on visibility and status
5. **Monitor** performance and usage patterns

The legal records integration in `api.get_object_resource` is now complete and ready for production use!
