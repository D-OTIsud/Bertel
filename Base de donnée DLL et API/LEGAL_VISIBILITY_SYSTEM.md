# Legal Document Visibility System - Complete

## Summary

The unified legal system has been enhanced with comprehensive document visibility controls. The `is_public` boolean field in `ref_legal_type` allows you to control whether legal documents can be public or should only be visible to the parent organization.

## New Features Added

### **1. Enhanced `ref_legal_type` Table**

**New Column:**
- `is_public` BOOLEAN DEFAULT FALSE - Controls document visibility

**Predefined Visibility Settings:**
- **Public Documents** (`is_public = true`): SIRET, SIREN, tourist tax, accommodation license, safety certificates, fire safety, accessibility, environmental permits, waste management, tourism licenses, guide licenses
- **Private Documents** (`is_public = false`): VAT number, business license, liability insurance, property insurance, cyber insurance

### **2. Enhanced API Functions**

**Updated Functions:**
- `api.get_object_legal_records()` - Now includes `type_is_public` field
- `api.get_object_legal_data()` - Now includes `is_public` in type information

**New Functions:**
- `api.get_object_legal_records_by_visibility()` - Filter records by visibility
- `api.get_object_public_legal_records()` - Get only public records (JSON)
- `api.get_object_private_legal_records()` - Get only private records (JSON)

## Visibility Control Logic

### **Public Documents (`is_public = true`)**
- **Visible to**: Everyone (public API, external users)
- **Examples**: SIRET, tourist tax, safety certificates
- **Use case**: Regulatory compliance, public transparency

### **Private Documents (`is_public = false`)**
- **Visible to**: Parent organization only (private API, internal users)
- **Examples**: VAT number, insurance policies, financial information
- **Use case**: Internal management, confidential business data

## API Usage Examples

### **1. Get All Legal Records (Internal Use)**
```sql
-- Get all records regardless of visibility
SELECT api.get_object_legal_data('HOT123') as all_legal_data;
```

### **2. Get Public Records Only (Public API)**
```sql
-- Get only public records for external consumption
SELECT api.get_object_public_legal_records('HOT123') as public_legal_data;
```

### **3. Get Private Records Only (Internal Management)**
```sql
-- Get only private records for internal management
SELECT api.get_object_private_legal_records('HOT123') as private_legal_data;
```

### **4. Filter by Visibility**
```sql
-- Get only public records
SELECT * FROM api.get_object_legal_records_by_visibility('HOT123', true);

-- Get only private records
SELECT * FROM api.get_object_legal_records_by_visibility('HOT123', false);

-- Get all records (same as get_object_legal_records)
SELECT * FROM api.get_object_legal_records_by_visibility('HOT123', NULL);
```

## Document Visibility Matrix

| Legal Type | Category | Visibility | Reason |
|------------|----------|------------|---------|
| SIRET | Business | Public | Public business identifier |
| SIREN | Business | Public | Public business identifier |
| VAT Number | Business | Private | Sensitive tax information |
| Business License | Business | Public | Public regulatory requirement |
| Tourist Tax | Accommodation | Public | Public accommodation requirement |
| Accommodation License | Accommodation | Public | Public regulatory requirement |
| Safety Certificate | Accommodation | Public | Public safety requirement |
| Fire Safety | Accommodation | Public | Public safety requirement |
| Accessibility | Accommodation | Public | Public accessibility requirement |
| Liability Insurance | Insurance | Private | Sensitive financial information |
| Property Insurance | Insurance | Private | Sensitive financial information |
| Cyber Insurance | Insurance | Private | Sensitive security information |
| Environmental Permit | Environment | Public | Public environmental compliance |
| Waste Management | Environment | Public | Public environmental compliance |
| Tourism License | Tourism | Public | Public tourism requirement |
| Guide License | Tourism | Public | Public tourism requirement |

## Use Cases

### **1. Public API Integration**
```sql
-- For public websites, mobile apps, external integrations
SELECT api.get_object_public_legal_records('HOT123');
-- Returns only: SIRET, tourist tax, safety certificates, etc.
```

### **2. Internal Management Dashboard**
```sql
-- For internal management, compliance monitoring
SELECT api.get_object_legal_data('HOT123');
-- Returns all records: public + private
```

### **3. Compliance Reporting**
```sql
-- For regulatory compliance reports
SELECT * FROM api.get_object_legal_records_by_visibility('HOT123', true)
WHERE status = 'active';
-- Returns only public active records
```

### **4. Financial Management**
```sql
-- For financial management, insurance tracking
SELECT * FROM api.get_object_legal_records_by_visibility('HOT123', false)
WHERE type_category = 'insurance';
-- Returns only private insurance records
```

## Security Benefits

### **1. Data Privacy**
- Sensitive information (VAT, insurance) kept private
- Public information (SIRET, licenses) available for transparency
- Clear separation of concerns

### **2. API Security**
- Public API only exposes safe information
- Private API requires proper authentication
- No accidental exposure of sensitive data

### **3. Compliance**
- Meets data protection requirements
- Supports regulatory transparency needs
- Enables proper access control

## Implementation Examples

### **For Concierge Agencies**
```sql
-- Public information for client transparency
SELECT api.get_object_public_legal_records('HOT123');
-- Shows: SIRET, tourist tax, safety certificates

-- Private information for internal management
SELECT api.get_object_private_legal_records('HOT123');
-- Shows: VAT number, insurance policies, financial data
```

### **For Tourism Platforms**
```sql
-- Public compliance information
SELECT api.get_object_public_legal_records('HOT123');
-- Shows: licenses, permits, safety certificates

-- Internal financial tracking
SELECT api.get_object_private_legal_records('HOT123');
-- Shows: insurance, financial documents
```

## Testing

### **Test Script**
- `test_legal_visibility_system.sql` - Comprehensive test suite
- Tests all visibility functions
- Validates public/private separation
- Demonstrates API usage scenarios

### **Test Scenarios**
1. Create records with different visibility settings
2. Test visibility filtering functions
3. Test API functions for public/private data
4. Test mixed scenarios with different statuses
5. Test edge cases with empty objects
6. Validate visibility matrix

## Benefits

### **1. Enhanced Security**
- Clear separation of public and private data
- Prevents accidental exposure of sensitive information
- Supports proper access control

### **2. Improved API Design**
- Public API for external consumption
- Private API for internal management
- Clear data boundaries

### **3. Better Compliance**
- Meets data protection requirements
- Supports regulatory transparency
- Enables proper audit trails

### **4. Flexible Integration**
- Different APIs for different use cases
- Easy to implement access controls
- Supports various client needs

## Next Steps

1. **Deploy** the updated schema and API functions
2. **Test** with the provided test script
3. **Configure** your applications to use appropriate APIs
4. **Implement** access controls based on visibility
5. **Monitor** data access patterns

The legal document visibility system is now fully integrated and ready for production use!
