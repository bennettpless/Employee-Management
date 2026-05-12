# Phase 1: Database Setup

## Status: ✅ Complete

## Overview
Create the Supabase PostgreSQL schema for employees, devices, software, licenses, tickets, sync logs, and supporting tables. Enable RLS, indexes, and triggers.

## Planned Changes
- [x] Create table: `employees`
- [x] Create table: `devices`
- [x] Create table: `software`
- [x] Create table: `device_software`
- [x] Create table: `tickets`
- [x] Create table: `licenses`
- [x] Create table: `license_assignments`
- [x] Create table: `sync_logs`
- [x] Enable RLS on all tables with authenticated read policies
- [x] Create performance indexes on query columns
- [x] Create `updated_at` trigger function + apply to `employees`, `devices`, `licenses`
- [x] Migration: Add Excel-specific columns to `employees` and `devices`; create `employee_software_licenses`
- [x] Migration: Make `ninja_device_id` nullable; add `azure_device_id`, `is_in_ninja`
- [x] Migration: Create `device_assignments_history` table with RLS
- [ ] Consolidate migrations into `schema.sql` so a fresh deploy gets a complete schema

## Key Files
- `supabase/schema.sql` — base schema (8 tables)
- `supabase/migrations/add_excel_columns.sql` — Excel-oriented columns, `employee_software_licenses`
- `supabase/migrations/update_devices_schema.sql` — `azure_device_id`, `is_in_ninja`, nullable `ninja_device_id`
- `supabase/migrations/create_device_assignments_history.sql` — assignment history tracking

## Remaining Work
- Consolidate migrations into `schema.sql` for clean fresh deploys (currently `schema.sql` is missing columns added by migrations)

## Verification Checklist
- [x] Schema applies without errors
- [x] RLS policies in place
- [x] Indexes created
- [x] Triggers fire on update
- [ ] `schema.sql` is self-contained (includes all migration changes)

## Implementation Notes
- `entra_id` column was repurposed to hold the employee email for Excel-sourced records (no Entra sync in v1)
- Schema comments still reference "Azure Entra ID" in some places — cosmetic, not functional
- `tickets` table exists but has no corresponding API routes or UI
