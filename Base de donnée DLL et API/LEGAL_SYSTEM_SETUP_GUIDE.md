# Unified Legal System - Setup Guide

## Quick Start

Since your database is new and empty, you can directly use the clean version of the unified legal system without any migration concerns.

## Files to Use

### 1. `unified_legal_system_clean.sql`
**Core system without migrations:**
- Creates the `ref_legal_type` table with 15+ predefined legal types
- Creates the `object_legal` table with flexible JSONB storage
- Implements validity modes (forever, tacit_renewal, fixed_end_date)
- Includes all core functions and constraints
- No migration functions (since database is empty)

### 2. `test_unified_legal_clean.sql`
**Comprehensive testing:**
- 22 different test scenarios
- Data creation and validation
- Constraint testing
- Performance testing
- No migration tests

## Setup Steps

### Step 1: Deploy the Core System
```sql
-- Run the clean unified legal system
\i unified_legal_system_clean.sql
```

### Step 2: Verify Installation
```sql
-- Check that tables were created
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('ref_legal_type', 'object_legal');

-- Check that legal types were inserted
SELECT COUNT(*) FROM ref_legal_type;

-- Check that functions were created
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'api' 
  AND routine_name LIKE '%legal%';
```

### Step 3: Run Tests
```sql
-- Run comprehensive tests
\i test_unified_legal_clean.sql
```

## What You Get

### 1. Predefined Legal Types
The system comes with 15+ predefined legal types:

**Business:**
- `siret` - SIRET number (required)
- `siren` - SIREN number (required)
- `vat_number` - VAT number
- `business_license` - Commercial license

**Accommodation:**
- `tourist_tax` - Tourist tax authorization (required)
- `accommodation_license` - Accommodation license (required)
- `safety_certificate` - Safety certificate (required)
- `fire_safety` - Fire safety attestation (required)
- `accessibility` - Accessibility certificate

**Insurance:**
- `liability_insurance` - Professional liability insurance (required)
- `property_insurance` - Property insurance (required)
- `cyber_insurance` - Cyber insurance

**Environmental:**
- `environmental_permit` - Environmental permit
- `waste_management` - Waste management authorization

**Tourism:**
- `tourism_license` - Tourism license
- `guide_license` - Guide license

### 2. Core Functions
- `api.add_legal_record()` - Add legal records
- `api.update_legal_record()` - Update legal records
- `api.get_object_legal_records()` - Get all legal records for an object
- `api.get_expiring_legal_records()` - Find expiring records
- `api.check_object_legal_compliance()` - Check compliance status

### 3. Views
- `v_active_legal_records` - All active legal records
- `v_expiring_legal_records` - Records expiring in next 30 days

## Usage Examples

### Add Legal Records
```sql
-- Add SIRET (permanent)
SELECT api.add_legal_record(
  'HOT123',
  'siret',
  '{"siret": "12345678901234"}',
  NULL,
  '2024-01-01',
  NULL,
  'forever'
);

-- Add tourist tax (annual)
SELECT api.add_legal_record(
  'HOT123',
  'tourist_tax',
  '{"number": "TT2024001"}',
  'doc-uuid',
  '2024-01-01',
  '2024-12-31',
  'fixed_end_date'
);

-- Add accommodation license (tacit renewal)
SELECT api.add_legal_record(
  'HOT123',
  'accommodation_license',
  '{"number": "AL2024001"}',
  'doc-uuid',
  '2024-01-01',
  NULL,
  'tacit_renewal'
);
```

### Check Compliance
```sql
-- Check if hotel has all required legal records
SELECT * FROM api.check_object_legal_compliance('HOT123');

-- Get expiring records
SELECT * FROM api.get_expiring_legal_records(30);
```

### Query Legal Records
```sql
-- Get all legal records for an object
SELECT * FROM api.get_object_legal_records('HOT123');

-- View active records
SELECT * FROM v_active_legal_records WHERE object_id = 'HOT123';

-- View expiring records
SELECT * FROM v_expiring_legal_records;
```

## Validity Modes

### `forever`
- Permanent records (SIRET, SIREN)
- `valid_to` must be NULL
- Never expires

### `tacit_renewal`
- Auto-renewing records (licenses)
- `valid_to` can be NULL
- Considered valid unless revoked

### `fixed_end_date`
- Time-limited records (permits, insurance)
- `valid_to` must be NOT NULL
- Expires on specific date

## Data Structure

### Legal Record Value Examples
```json
// SIRET record
{"siret": "12345678901234"}

// Tourist tax record
{
  "number": "TT2024001",
  "issued_date": "2024-01-01"
}

// Insurance record
{
  "policy_number": "POL123456",
  "coverage_amount": "1000000",
  "insurer": "AXA"
}
```

## Benefits

1. **Unified Management** - Single table for all legal records
2. **Flexibility** - JSONB storage for any legal data structure
3. **Compliance Tracking** - Built-in compliance checking
4. **Expiry Management** - Automatic expiry detection
5. **Performance** - Optimized indexes and queries
6. **Scalability** - Works with any object type

## Next Steps

1. **Deploy the system** using the clean SQL file
2. **Run tests** to verify everything works
3. **Start adding legal records** for your objects
4. **Set up monitoring** for expiring records
5. **Integrate with your applications** using the API functions

The system is ready to use immediately and will grow with your needs!
