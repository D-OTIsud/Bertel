# Document Request System - Complete

## Summary

The unified legal system has been enhanced with a comprehensive document request and delivery tracking system. This allows you to track when legal documents are requested, when they are delivered, and manage the entire document lifecycle.

## New Features Added

### **1. Enhanced `object_legal` Table**

**New Columns:**
- `status` - Now includes `'requested'` status
- `document_requested_at` - Timestamp when document was requested
- `document_delivered_at` - Timestamp when document was delivered

**New Constraints:**
- `chk_requested_status` - Ensures `requested` status requires `document_requested_at`
- `chk_document_delivery_date` - Ensures delivery date is not before request date

**New Indexes:**
- `idx_object_legal_requested` - For querying requested documents
- `idx_object_legal_document_dates` - For querying by document dates

### **2. Enhanced API Functions**

**Updated Functions:**
- `api.add_legal_record()` - Now supports document request parameters
- `api.update_legal_record()` - Now supports document date updates
- `api.get_object_legal_records()` - Now returns document dates
- `api.get_object_legal_data()` - Now includes document tracking in JSON

**New Functions:**
- `api.request_legal_document()` - Mark a document as requested
- `api.deliver_legal_document()` - Mark a document as delivered
- `api.get_pending_document_requests()` - Get all pending requests
- `api.get_pending_document_requests_api()` - Get pending requests in JSON format

### **3. Enhanced Views**

**Updated Views:**
- `v_active_legal_records` - Now includes document tracking fields
- `v_expiring_legal_records` - Now includes document tracking fields

## Document Status Workflow

### **1. Document Requested**
```sql
-- Create a legal record with requested status
SELECT api.add_legal_record(
  'HOT123',
  'siret',
  '{"siret": "12345678901234"}',
  NULL, -- no document yet
  '2024-01-01',
  NULL,
  'forever',
  'requested', -- status
  '2024-01-15 10:00:00+00', -- document_requested_at
  NULL, -- document_delivered_at
  'SIRET document requested from INSEE'
);
```

### **2. Document Delivered**
```sql
-- Mark document as delivered
SELECT api.deliver_legal_document(
  'legal-record-uuid',
  'document-uuid', -- document_id
  '2024-01-20 14:30:00+00', -- delivered_at
  'active' -- new status
);
```

### **3. Request Document Later**
```sql
-- Request document for existing record
SELECT api.request_legal_document(
  'legal-record-uuid',
  '2024-01-18 09:00:00+00' -- requested_at
);
```

## Query Examples

### **Get All Legal Records with Document Status**
```sql
SELECT 
  type_code,
  type_name,
  status,
  CASE 
    WHEN document_requested_at IS NOT NULL AND document_delivered_at IS NOT NULL THEN 'Delivered'
    WHEN document_requested_at IS NOT NULL AND document_delivered_at IS NULL THEN 'Pending Delivery'
    WHEN document_requested_at IS NULL AND document_delivered_at IS NULL THEN 'No Document Required'
    ELSE 'Unknown'
  END as document_status,
  document_requested_at,
  document_delivered_at
FROM api.get_object_legal_records('HOT123')
ORDER BY type_code;
```

### **Get Pending Document Requests**
```sql
SELECT 
  object_name,
  legal_type_name,
  document_requested_at,
  days_since_requested,
  CASE 
    WHEN days_since_requested > 30 THEN 'Overdue'
    WHEN days_since_requested > 14 THEN 'Urgent'
    WHEN days_since_requested > 7 THEN 'Attention'
    ELSE 'Normal'
  END as urgency_level
FROM api.get_pending_document_requests()
ORDER BY days_since_requested DESC;
```

### **Get Pending Requests in API Format**
```sql
SELECT api.get_pending_document_requests_api() as pending_requests;
```

## Status Values

### **Legal Record Status**
- `'active'` - Record is active and valid
- `'expired'` - Record has expired
- `'suspended'` - Record is temporarily suspended
- `'revoked'` - Record has been revoked
- `'requested'` - Document has been requested but not yet delivered

### **Document Status (derived)**
- `'Delivered'` - Document requested and delivered
- `'Pending Delivery'` - Document requested but not yet delivered
- `'No Document Required'` - No document needed for this record

## Data Integrity

### **Constraints**
1. **Requested Status**: If status is `'requested'`, `document_requested_at` must be NOT NULL
2. **Delivery Date**: `document_delivered_at` cannot be before `document_requested_at`
3. **Validity Modes**: Existing constraints for `forever`, `tacit_renewal`, `fixed_end_date`

### **Validation in API Functions**
- All API functions validate constraints before inserting/updating
- Clear error messages for constraint violations
- Automatic timestamp handling with `NOW()` defaults

## Performance

### **Indexes**
- `idx_object_legal_requested` - Fast queries for requested documents
- `idx_object_legal_document_dates` - Fast queries by document dates
- Existing indexes for object_id, type_id, status, etc.

### **Query Optimization**
- Efficient filtering by status and dates
- Optimized joins with object and ref_legal_type tables
- Proper ordering for pending requests

## Testing

### **Test Script**
- `test_document_request_system.sql` - Comprehensive test suite
- Tests all new functionality
- Validates constraints
- Demonstrates workflow scenarios

### **Test Scenarios**
1. Create records with different document states
2. Request documents for existing records
3. Mark documents as delivered
4. Query pending requests
5. Test constraint violations
6. Test API functions

## Benefits

### **1. Complete Document Lifecycle Tracking**
- Track when documents are requested
- Track when documents are delivered
- Monitor pending requests
- Identify overdue requests

### **2. Improved Compliance Management**
- Know which documents are missing
- Track document request timelines
- Monitor delivery status
- Generate compliance reports

### **3. Better Workflow Management**
- Clear status indicators
- Urgency levels for pending requests
- Automated timestamp tracking
- API integration for applications

### **4. Enhanced Reporting**
- Pending document reports
- Delivery timeline reports
- Compliance status reports
- Urgency-based alerts

## Usage Examples

### **For Concierge Agencies**
```sql
-- Track accommodation licenses
SELECT api.add_legal_record(
  'HOT123',
  'accommodation_license',
  '{"license_number": "AL2024001"}',
  NULL,
  '2024-01-01',
  '2026-12-31',
  'fixed_end_date',
  'requested',
  NOW(),
  NULL,
  'Accommodation license requested from prefecture'
);

-- Check pending requests
SELECT api.get_pending_document_requests_api();
```

### **For Business Compliance**
```sql
-- Track SIRET documents
SELECT api.add_legal_record(
  'ORG456',
  'siret',
  '{"siret": "12345678901234"}',
  NULL,
  '2024-01-01',
  NULL,
  'forever',
  'requested',
  NOW(),
  NULL,
  'SIRET certificate requested from INSEE'
);
```

## Next Steps

1. **Deploy** the updated schema and API functions
2. **Test** with the provided test script
3. **Integrate** with your applications
4. **Set up monitoring** for pending requests
5. **Create alerts** for overdue documents

The document request system is now fully integrated and ready for production use!
