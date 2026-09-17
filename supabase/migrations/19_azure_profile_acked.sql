-- Remember the Azure title / office / department last reviewed on a sync card.
-- Next sync only reopens that field when Azure itself changes, so an EMS
-- override does not keep coming back.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS azure_job_title_acked VARCHAR(255),
  ADD COLUMN IF NOT EXISTS azure_office_acked VARCHAR(255),
  ADD COLUMN IF NOT EXISTS azure_department_acked VARCHAR(255);
