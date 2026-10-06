-- =====================================================================
-- TeamNest · Demo seed (100% FICTIONAL data)
-- ---------------------------------------------------------------------
-- Every person, business, phone number, bank/ID number and address below
-- is made up. Dates are relative to the day the seed runs, so dashboards
-- always look "live". Deterministic: setseed() fixes the random stream.
--
-- Demo logins (password for all: TeamNest@2026)
--   aarav@teamnest.demo    Super Admin
--   kavya@teamnest.demo    HR Admin
--   rohan@teamnest.demo    Finance
--   meera@teamnest.demo    Area Manager (Hyderabad)
--   sanjana@teamnest.demo  Team Lead (Hyderabad Alpha)
--   priya@teamnest.demo    Executive (Hyderabad Alpha)  ← mobile demo user
-- =====================================================================

set search_path = public, extensions;
select setseed(0.4242);

-- ---------------------------------------------------------------------
-- Organization, roles, territories
-- ---------------------------------------------------------------------
insert into public.organizations (id, name, slug, legal_name, gstin, settings) values
  ('a0000000-0000-4000-8000-000000000001', 'Kestrel Demo Ventures', 'kestrel-demo',
   'Kestrel Demo Ventures Pvt Ltd (fictional)', '36AAAAA0000A1Z5',
   '{"brand":{"primary":"#2563EB","accent":"#14B8A6","highlight":"#F97316"},"fiscal_year_start_month":4}');

insert into public.roles (code, name, description, rank, requires_mfa, permissions) values
  ('executive',    'Sales Executive', 'Works own leads in the field; HR self-service.', 10, false,
   '{"app.mobile":true,"leads.own":true,"deals.create":true,"hr.self":true}'),
  ('team_lead',    'Team Lead',       'Runs a sales team; approves leave and discounts.', 20, false,
   '{"app.mobile":true,"app.web":true,"leads.team":true,"leads.assign":true,"approvals.team":true,"dashboards.team":true,"hr.self":true}'),
  ('area_manager', 'Area Manager',    'Owns a city/region and its teams.', 30, false,
   '{"app.mobile":true,"app.web":true,"leads.team":true,"leads.assign":true,"leads.import":true,"approvals.team":true,"dashboards.area":true,"hr.self":true}'),
  ('hr_admin',     'HR Admin',        'Employees, attendance, leave, payroll inputs, policies.', 40, true,
   '{"app.web":true,"hr.admin":true,"payroll.inputs":true,"policies.manage":true,"sensitive.read":true,"hr.self":true}'),
  ('finance',      'Finance',         'Payments, mandates, invoices, payouts, reimbursements.', 40, true,
   '{"app.web":true,"finance.admin":true,"incentives.approve":true,"sensitive.read":true,"hr.self":true}'),
  ('super_admin',  'Super Admin',     'Configuration, roles, queues, packages, targets.', 50, true,
   '{"app.web":true,"settings.all":true,"leads.all":true,"audit.read":true,"hr.self":true}')
on conflict (code) do update set name = excluded.name, description = excluded.description, rank = excluded.rank,
  requires_mfa = excluded.requires_mfa, permissions = excluded.permissions;

insert into public.territories (id, org_id, parent_id, kind, name, code, state, center_lat, center_lng, pincodes) values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', null, 'zone',   'South & West', 'SW',  null,          null,    null,    '{}'),
  ('b0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'city', 'Hyderabad', 'HYD', 'Telangana',   17.4300, 78.4300, '{500081,500072,500003,500034}'),
  ('b0000000-0000-4000-8000-000000000020', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'city', 'Bengaluru', 'BLR', 'Karnataka',   12.9600, 77.6400, '{560034,560066,560038,560041}'),
  ('b0000000-0000-4000-8000-000000000030', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'city', 'Pune',      'PNQ', 'Maharashtra', 18.5300, 73.8500, '{411045,411038,411014,411028}');

-- clusters (localities) per city
create temp table seed_localities (city_code text, locality text, pincode text, lat double precision, lng double precision);
insert into seed_localities values
  ('HYD','Madhapur','500081',17.4483,78.3915), ('HYD','Kukatpally','500072',17.4948,78.3996),
  ('HYD','Secunderabad','500003',17.4399,78.4983), ('HYD','Banjara Hills','500034',17.4156,78.4347),
  ('BLR','Koramangala','560034',12.9352,77.6245), ('BLR','Whitefield','560066',12.9698,77.7500),
  ('BLR','Indiranagar','560038',12.9784,77.6408), ('BLR','Jayanagar','560041',12.9250,77.5938),
  ('PNQ','Baner','411045',18.5590,73.7868), ('PNQ','Kothrud','411038',18.5074,73.8077),
  ('PNQ','Viman Nagar','411014',18.5679,73.9143), ('PNQ','Hadapsar','411028',18.5089,73.9260);

insert into public.territories (org_id, parent_id, kind, name, code, state, center_lat, center_lng, pincodes)
select 'a0000000-0000-4000-8000-000000000001', t.id, 'cluster', l.locality, l.city_code || '-' || upper(left(replace(l.locality,' ',''), 4)),
       t.state, l.lat, l.lng, array[l.pincode]
from seed_localities l join public.territories t on t.code = l.city_code;

-- ---------------------------------------------------------------------
-- People (auth.users → trigger creates public.users)
-- ---------------------------------------------------------------------
create temp table seed_people (n int, first text, last text, role public.app_role, city text, team text, mgr int, designation text, gender text);
insert into seed_people values
  ( 1,'Aarav','Menon','super_admin',  'HYD', null,     null,'Head of Sales Operations','male'),
  ( 2,'Kavya','Iyer','hr_admin',      'HYD', null,     1,   'HR Business Partner','female'),
  ( 3,'Rohan','Deshpande','finance',  'HYD', null,     1,   'Finance Controller','male'),
  ( 4,'Meera','Reddy','area_manager', 'HYD', null,     1,   'Area Sales Manager – Telangana','female'),
  ( 5,'Vikram','Shetty','area_manager','BLR',null,     1,   'Area Sales Manager – Karnataka & Pune','male'),
  ( 6,'Sanjana','Rao','team_lead',    'HYD', 'Hyderabad Alpha', 4,'Team Lead','female'),
  ( 7,'Arjun','Varma','team_lead',    'HYD', 'Hyderabad Beta',  4,'Team Lead','male'),
  ( 8,'Nisha','Kulkarni','team_lead', 'BLR', 'Bengaluru Gamma', 5,'Team Lead','female'),
  ( 9,'Farhan','Qureshi','team_lead', 'PNQ', 'Pune Delta',      5,'Team Lead','male'),
  (10,'Priya','Nair','executive',     'HYD', 'Hyderabad Alpha', 6,'Senior Sales Executive','female'),
  (11,'Karthik','Goud','executive',   'HYD', 'Hyderabad Alpha', 6,'Sales Executive','male'),
  (12,'Divya','Patel','executive',    'HYD', 'Hyderabad Alpha', 6,'Sales Executive','female'),
  (13,'Imran','Shaikh','executive',   'HYD', 'Hyderabad Alpha', 6,'Sales Executive','male'),
  (14,'Sneha','Joshi','executive',    'HYD', 'Hyderabad Beta',  7,'Sales Executive','female'),
  (15,'Rahul','Yadav','executive',    'HYD', 'Hyderabad Beta',  7,'Sales Executive','male'),
  (16,'Lakshmi','Prasad','executive', 'HYD', 'Hyderabad Beta',  7,'Senior Sales Executive','female'),
  (17,'Aditya','Bose','executive',    'HYD', 'Hyderabad Beta',  7,'Sales Executive','male'),
  (18,'Ananya','Hegde','executive',   'BLR', 'Bengaluru Gamma', 8,'Sales Executive','female'),
  (19,'Manoj','Gowda','executive',    'BLR', 'Bengaluru Gamma', 8,'Senior Sales Executive','male'),
  (20,'Pooja','Srinivas','executive', 'BLR', 'Bengaluru Gamma', 8,'Sales Executive','female'),
  (21,'Kiran','Murthy','executive',   'BLR', 'Bengaluru Gamma', 8,'Sales Executive','non_binary'),
  (22,'Siddharth','Pawar','executive','PNQ', 'Pune Delta',      9,'Sales Executive','male'),
  (23,'Riya','Kapoor','executive',    'PNQ', 'Pune Delta',      9,'Senior Sales Executive','female'),
  (24,'Omkar','Jadhav','executive',   'PNQ', 'Pune Delta',      9,'Sales Executive','male'),
  (25,'Tanvi','Bhosale','executive',  'PNQ', 'Pune Delta',      9,'Sales Executive','female');

create or replace function pg_temp.uid(n int) returns uuid language sql immutable as
$$ select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create or replace function pg_temp.org() returns uuid language sql immutable as
$$ select 'a0000000-0000-4000-8000-000000000001'::uuid $$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new)
select '00000000-0000-0000-0000-000000000000', pg_temp.uid(p.n), 'authenticated', 'authenticated',
       lower(p.first) || '@teamnest.demo', extensions.crypt('TeamNest@2026', extensions.gen_salt('bf')), now(),
       jsonb_build_object('provider','email','providers',array['email'],'org_id',pg_temp.org(),'role',p.role),
       jsonb_build_object('full_name', p.first || ' ' || p.last),
       now() - interval '400 days', now(), '', '', '', ''
from seed_people p;

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select pg_temp.uid(p.n), pg_temp.uid(p.n), pg_temp.uid(p.n)::text, 'email',
       jsonb_build_object('sub', pg_temp.uid(p.n)::text, 'email', lower(p.first) || '@teamnest.demo', 'email_verified', true),
       now(), now(), now()
from seed_people p;

-- teams (lead_user_id set below)
insert into public.teams (id, org_id, name, territory_id)
select ('c0000000-0000-4000-8000-00000000000' || row_number() over (order by t.team))::uuid, pg_temp.org(), t.team,
       (select id from public.territories where code = t.city)
from (select distinct team, city from seed_people where team is not null) t;

update public.teams t set lead_user_id = pg_temp.uid(p.n)
from seed_people p where p.team = t.name and p.role = 'team_lead';

update public.users u set
  manager_id   = case when p.mgr is not null then pg_temp.uid(p.mgr) end,
  team_id      = (select id from public.teams where name = p.team),
  territory_id = (select id from public.territories where code = p.city),
  phone        = '+91 90000 ' || lpad((10000 + p.n)::text, 5, '0'),
  locale       = case when p.n in (11, 15) then 'te-IN' when p.n in (13, 22) then 'hi-IN' else 'en-IN' end,
  mfa_enrolled = p.role in ('hr_admin','finance','super_admin'),
  last_seen_at = now() - (p.n || ' minutes')::interval
from seed_people p where u.id = pg_temp.uid(p.n);

-- ---------------------------------------------------------------------
-- HR configuration
-- ---------------------------------------------------------------------
insert into public.shifts (id, org_id, name, start_time, end_time, grace_minutes, working_days, is_default) values
  ('d0000000-0000-4000-8000-000000000001', pg_temp.org(), 'General (09:30–18:30)', '09:30', '18:30', 15, '{1,2,3,4,5,6}', true),
  ('d0000000-0000-4000-8000-000000000002', pg_temp.org(), 'Office (10:00–19:00)',  '10:00', '19:00', 15, '{1,2,3,4,5}',   false);

insert into public.geofences (org_id, territory_id, name, kind, lat, lng, radius_m) values
  (pg_temp.org(), (select id from public.territories where code='HYD'), 'Hyderabad Office · Madhapur', 'office', 17.4474, 78.3762, 250),
  (pg_temp.org(), (select id from public.territories where code='BLR'), 'Bengaluru Office · Koramangala', 'office', 12.9345, 77.6266, 250),
  (pg_temp.org(), (select id from public.territories where code='PNQ'), 'Pune Office · Baner', 'office', 18.5642, 73.7769, 250);

insert into public.employees (org_id, user_id, employee_code, designation, department, date_of_joining, date_of_birth, gender,
                              work_city, shift_id, personal_email, emergency_contact, address, blood_group, probation_end_date, onboarding)
select pg_temp.org(), pg_temp.uid(p.n), 'KDV' || lpad((1000 + p.n)::text, 5, '0'), p.designation,
       case when p.role = 'hr_admin' then 'Human Resources' when p.role = 'finance' then 'Finance' else 'Sales' end,
       current_date - ((200 + p.n * 37) || ' days')::interval,
       date '1990-01-01' + (p.n * 211 % 3650),
       p.gender,
       case p.city when 'HYD' then 'Hyderabad' when 'BLR' then 'Bengaluru' else 'Pune' end,
       case when p.role in ('hr_admin','finance','super_admin') then 'd0000000-0000-4000-8000-000000000002'::uuid
            else 'd0000000-0000-4000-8000-000000000001'::uuid end,
       lower(p.first) || '.' || lower(p.last) || '@example.com',
       jsonb_build_object('name', 'Guardian of ' || p.first, 'relation', (array['Parent','Spouse','Sibling'])[1 + p.n % 3],
                          'phone', '+91 90000 ' || lpad((50000 + p.n)::text, 5, '0')),
       jsonb_build_object('line1', (10 + p.n) || ', Demo Residency', 'city',
                          case p.city when 'HYD' then 'Hyderabad' when 'BLR' then 'Bengaluru' else 'Pune' end, 'pincode',
                          case p.city when 'HYD' then '500081' when 'BLR' then '560034' else '411045' end),
       (array['A+','B+','O+','AB+','O-'])[1 + p.n % 5],
       current_date - ((200 + p.n * 37) || ' days')::interval + interval '180 days',
       '[{"key":"offer","label":"Offer accepted","done":true},{"key":"docs","label":"Documents submitted","done":true},
         {"key":"bank","label":"Bank details verified","done":true},{"key":"induction","label":"Induction completed","done":true},
         {"key":"assets","label":"Phone & SIM issued","done":true}]'::jsonb
from seed_people p;

-- Sensitive fields are encrypted by the function (all values fictional).
select public.set_employee_sensitive(
  e.id,
  (array['Demo National Bank','Sample Co-op Bank','Example Federal Bank'])[1 + p.n % 3],
  'DEMO0' || lpad((p.n * 7)::text, 6, '0'),
  '0000' || lpad((p.n * 7919)::text, 8, '0'),
  'ABCDE' || lpad(p.n::text, 4, '0') || 'F',
  '0000 0000 ' || lpad((p.n * 13)::text, 4, '0'),
  '1000' || lpad((p.n * 31)::text, 8, '0'),
  case p.role when 'executive' then 360000 + p.n * 9000 when 'team_lead' then 720000 + p.n * 10000
              when 'area_manager' then 1400000 else 1100000 end,
  round((case p.role when 'executive' then 360000 + p.n * 9000 when 'team_lead' then 720000 + p.n * 10000
              when 'area_manager' then 1400000 else 1100000 end) / 12.0, 0)
)
from seed_people p join public.employees e on e.user_id = pg_temp.uid(p.n);

insert into public.leave_types (org_id, code, name, color, is_paid, annual_quota, accrual, carry_forward_max, encashable, min_notice_days, document_required_after_days, applicable_gender) values
  (pg_temp.org(), 'CL',  'Casual Leave',     'teal',   true,  12,  'monthly', 0,  false, 1, null, null),
  (pg_temp.org(), 'SL',  'Sick Leave',       'rose',   true,  12,  'monthly', 6,  false, 0, 2,    null),
  (pg_temp.org(), 'EL',  'Earned Leave',     'blue',   true,  18,  'monthly', 30, true,  7, null, null),
  (pg_temp.org(), 'CO',  'Compensatory Off', 'violet', true,  0,   'none',    0,  false, 0, null, null),
  (pg_temp.org(), 'LOP', 'Loss of Pay',      'slate',  false, 0,   'none',    0,  false, 0, null, null),
  (pg_temp.org(), 'ML',  'Maternity Leave',  'pink',   true,  182, 'none',    0,  false, 30, null, 'female'),
  (pg_temp.org(), 'PL',  'Paternity Leave',  'amber',  true,  5,   'none',    0,  false, 7, null, 'male');

insert into public.leave_balances (org_id, user_id, leave_type_id, year, opening, accrued, carried_forward)
select pg_temp.org(), pg_temp.uid(p.n), lt.id, extract(year from current_date)::smallint,
       0,
       case lt.code when 'CL' then extract(month from current_date) when 'SL' then extract(month from current_date)
                    when 'EL' then round(extract(month from current_date) * 1.5) when 'CO' then p.n % 3 else 0 end,
       case lt.code when 'EL' then (p.n % 7) + 2 when 'SL' then p.n % 4 else 0 end
from seed_people p cross join public.leave_types lt
where lt.code in ('CL','SL','EL','CO');

insert into public.holidays (org_id, day, name, city) values
  (pg_temp.org(), make_date(extract(year from current_date)::int, 1, 26),  'Republic Day', null),
  (pg_temp.org(), make_date(extract(year from current_date)::int, 3, 4),   'Holi', null),
  (pg_temp.org(), make_date(extract(year from current_date)::int, 3, 19),  'Ugadi', 'Hyderabad'),
  (pg_temp.org(), make_date(extract(year from current_date)::int, 3, 19),  'Ugadi', 'Bengaluru'),
  (pg_temp.org(), make_date(extract(year from current_date)::int, 5, 1),   'Maharashtra Day', 'Pune'),
  (pg_temp.org(), make_date(extract(year from current_date)::int, 6, 2),   'Telangana Formation Day', 'Hyderabad'),
  (pg_temp.org(), make_date(extract(year from current_date)::int, 8, 15),  'Independence Day', null),
  (pg_temp.org(), make_date(extract(year from current_date)::int, 9, 14),  'Ganesh Chaturthi', 'Hyderabad'),
  (pg_temp.org(), make_date(extract(year from current_date)::int, 9, 14),  'Ganesh Chaturthi', 'Pune'),
  (pg_temp.org(), make_date(extract(year from current_date)::int, 10, 2),  'Gandhi Jayanti', null),
  (pg_temp.org(), make_date(extract(year from current_date)::int, 10, 20), 'Dussehra', null),
  (pg_temp.org(), make_date(extract(year from current_date)::int, 11, 1),  'Karnataka Rajyotsava', 'Bengaluru'),
  (pg_temp.org(), make_date(extract(year from current_date)::int, 11, 8),  'Diwali', null),
  (pg_temp.org(), make_date(extract(year from current_date)::int, 12, 25), 'Christmas', null);
insert into public.holidays (org_id, day, name, city, is_optional) values
  (pg_temp.org(), make_date(extract(year from current_date)::int, 11, 24), 'Guru Nanak Jayanti', null, true);

insert into public.document_categories (org_id, code, name, context, is_sensitive, is_mandatory, sort_order) values
  (pg_temp.org(), 'education',        'Education certificates',       'employee', false, true,  1),
  (pg_temp.org(), 'id_proof',         'ID proof',                     'employee', true,  true,  2),
  (pg_temp.org(), 'address_proof',    'Address proof',                'employee', true,  true,  3),
  (pg_temp.org(), 'offer_letter',     'Offer letter',                 'employee', false, true,  4),
  (pg_temp.org(), 'appointment_letter','Appointment letter',          'employee', false, true,  5),
  (pg_temp.org(), 'pf_gratuity',      'PF / Gratuity forms',          'employee', true,  false, 6),
  (pg_temp.org(), 'investment_proof', 'Investment proofs',            'employee', true,  false, 7),
  (pg_temp.org(), 'kyc_pan',          'Business PAN',                 'kyc',      true,  true,  10),
  (pg_temp.org(), 'kyc_gst',          'GST certificate',              'kyc',      false, false, 11),
  (pg_temp.org(), 'kyc_address',      'Business address proof',       'kyc',      false, true,  12),
  (pg_temp.org(), 'kyc_cheque',       'Cancelled cheque (auto-pay)',  'kyc',      true,  false, 13),
  (pg_temp.org(), 'kyc_photo',        'Shop-front photo',             'kyc',      false, true,  14);

-- ---------------------------------------------------------------------
-- Platform configuration
-- ---------------------------------------------------------------------
insert into public.app_settings (org_id, key, value, description) values
  (pg_temp.org(), 'visit_geofence_radius_m', '300', 'Max distance (m) between a visit check-in and the lead location'),
  (pg_temp.org(), 'activity_points', '{"call":1,"connected_call":2,"talk_minute_per_point":5,"visit":5}', 'Points awarded for field activity'),
  (pg_temp.org(), 'incentive_slabs', '[{"from":0,"to":100000,"pct":3},{"from":100000,"to":300000,"pct":5},{"from":300000,"to":null,"pct":7}]', 'Monthly revenue slabs for deal incentives'),
  (pg_temp.org(), 'autopay_bonus_per_deal', '250', 'Flat bonus (INR) per auto-pay deal'),
  (pg_temp.org(), 'tracking_window', '{"before_shift_min":30,"after_shift_min":60}', 'Location tracking allowed only around shift hours'),
  (pg_temp.org(), 'privacy_notice_version', '"2026.1"', 'Current employee privacy notice version'),
  (pg_temp.org(), 'data_retention_days', '{"call_recordings":90,"location_pings":30,"audit_logs":2555,"visit_photos":365}', 'Retention per data type'),
  (pg_temp.org(), 'mfa_required_roles', '["hr_admin","finance","super_admin"]', 'Roles that must enrol MFA');

insert into public.approval_chains (org_id, type, name, conditions, steps, priority, sla_hours) values
  (pg_temp.org(), 'leave',          'Leave > 3 days', '{"min_value":3.5}', '[{"relation":"manager"},{"role":"hr_admin"}]', 10, 48),
  (pg_temp.org(), 'leave',          'Leave (default)', '{}', '[{"relation":"manager"}]', 100, 24),
  (pg_temp.org(), 'discount',       'Discount > 20%', '{"min_value":20}', '[{"relation":"manager"},{"relation":"skip_manager"}]', 10, 8),
  (pg_temp.org(), 'discount',       'Discount (default)', '{}', '[{"relation":"manager"}]', 100, 8),
  (pg_temp.org(), 'reimbursement',  'Reimbursement ≥ ₹5,000', '{"min_amount":5000}', '[{"relation":"manager"},{"role":"finance"}]', 10, 72),
  (pg_temp.org(), 'reimbursement',  'Reimbursement (default)', '{}', '[{"relation":"manager"}]', 100, 72),
  (pg_temp.org(), 'request',        'Requests', '{}', '[{"relation":"manager"},{"role":"hr_admin"}]', 100, 72),
  (pg_temp.org(), 'regularization', 'Punch correction', '{}', '[{"relation":"manager"}]', 100, 48),
  (pg_temp.org(), 'profile_change', 'Profile edit', '{}', '[{"role":"hr_admin"}]', 100, 72),
  (pg_temp.org(), 'incentive',      'Incentive payout', '{}', '[{"role":"finance"}]', 100, 96);

insert into public.notification_templates (org_id, code, channel, subject, body) values
  (pg_temp.org(), 'approval.requested', 'in_app',  null, '{{requester}} requested {{title}}'),
  (pg_temp.org(), 'approval.requested', 'push',    'Approval needed', '{{requester}} requested {{title}}'),
  (pg_temp.org(), 'approval.decided',   'push',    'Request update', 'Your {{title}} was {{decision}}'),
  (pg_temp.org(), 'follow_up.due',      'push',    'Follow-up due', 'Call {{business}} at {{time}}'),
  (pg_temp.org(), 'payslip.published',  'email',   'Your payslip for {{month}} is ready', 'Hi {{name}}, your payslip for {{month}} is now available in TeamNest.'),
  (pg_temp.org(), 'payment.link',       'whatsapp', null, 'Hello {{customer}}, here is your secure payment link for {{package}}: {{link}}'),
  (pg_temp.org(), 'mandate.bounced',    'in_app',  null, 'Auto-pay for {{business}} bounced: {{reason}}');

-- ---------------------------------------------------------------------
-- Sales configuration
-- ---------------------------------------------------------------------
insert into public.outcome_codes (org_id, code, label, color, sets_lead_status, requires_follow_up, requires_remarks, is_terminal, counts_as_contact, sort_order) values
  (pg_temp.org(), 'interested',     'Interested',     'green',  'interested',  true,  false, false, true,  1),
  (pg_temp.org(), 'call_back',      'Call Back',      'blue',   'contacted',   true,  false, false, true,  2),
  (pg_temp.org(), 'meeting_set',    'Meeting Set',    'violet', 'meeting_set', true,  false, false, true,  3),
  (pg_temp.org(), 'deal_closed',    'Deal Closed',    'teal',   'won',         false, false, true,  true,  4),
  (pg_temp.org(), 'not_interested', 'Not Interested', 'amber',  'lost',        false, true,  true,  true,  5),
  (pg_temp.org(), 'do_not_contact', 'Do Not Contact', 'red',    'dnc',         false, true,  true,  true,  6),
  (pg_temp.org(), 'wrong_number',   'Wrong Number',   'slate',  'invalid',     false, false, true,  false, 7),
  (pg_temp.org(), 'not_reachable',  'Not Reachable',  'slate',  null,          true,  false, false, false, 8);

insert into public.lead_queues (org_id, code, name, description, rules, priority, color, assignment_strategy) values
  (pg_temp.org(), 'main',         'Main',            'All open leads',                       '{"all":[{"field":"status","op":"not_in","value":["won","lost","dnc","invalid"]}]}', 900, 'blue', 'manual'),
  (pg_temp.org(), 'unassigned',   'Unassigned',      'Leads without an owner',               '{"all":[{"field":"owner_id","op":"is_null"},{"field":"status","op":"not_in","value":["won","lost","dnc","invalid"]}]}', 10, 'slate', 'territory'),
  (pg_temp.org(), 'wfh',          'Work-from-Home',  'Phone-only leads (no visit needed)',   '{"all":[{"field":"tag","op":"eq","value":"Phone Only"}]}', 300, 'teal', 'round_robin'),
  (pg_temp.org(), 'top_b2b',      'Top B2B',         'High-value business accounts',         '{"all":[{"field":"segment","op":"eq","value":"b2b"},{"field":"priority_score","op":"gte","value":80}]}', 20, 'violet', 'territory'),
  (pg_temp.org(), 'b2b',          'B2B',             'Business accounts',                    '{"all":[{"field":"segment","op":"eq","value":"b2b"}]}', 200, 'violet', 'territory'),
  (pg_temp.org(), 'top_b2c',      'Top B2C',         'High-intent consumer businesses',      '{"all":[{"field":"segment","op":"eq","value":"b2c"},{"field":"priority_score","op":"gte","value":80}]}', 30, 'orange', 'territory'),
  (pg_temp.org(), 'expired_paid', 'Expired Paid',    'Paid customers whose plan has lapsed', '{"all":[{"field":"expires_at","op":"older_than_days","value":0},{"field":"current_package_id","op":"not_null"}]}', 40, 'rose', 'territory'),
  (pg_temp.org(), 'priority',     'Priority',        'Priority score 70+',                   '{"all":[{"field":"priority_score","op":"gte","value":70},{"field":"status","op":"not_in","value":["won","lost","dnc","invalid"]}]}', 50, 'orange', 'manual'),
  (pg_temp.org(), 'renewals',     'Renewals',        'Plans expiring in the next 30 days',   '{"all":[{"field":"expires_at","op":"within_next_days","value":30}]}', 15, 'teal', 'territory'),
  (pg_temp.org(), 'failed_autopay','Failed Auto-pay','Auto-pay bounced — recover payment',  '{"all":[{"field":"tag","op":"eq","value":"Auto-pay Failed"}]}', 5, 'red', 'manual'),
  (pg_temp.org(), 'hot_today',    'Hot Today',       'Follow-ups due today',                 '{"all":[{"field":"next_follow_up_at","op":"today"}]}', 25, 'orange', 'manual'),
  (pg_temp.org(), 'hot_live',     'Hot Live',        'Interested in the last 48 hours',      '{"all":[{"field":"last_outcome_code","op":"in","value":["interested","meeting_set"]},{"field":"last_contacted_at","op":"within_last_days","value":2}]}', 26, 'orange', 'manual'),
  (pg_temp.org(), 'low_reach',    'Low Reach',       'Not contacted for 14+ days',           '{"any":[{"field":"last_contacted_at","op":"is_null"},{"field":"last_contacted_at","op":"older_than_days","value":14}]}', 400, 'slate', 'round_robin'),
  (pg_temp.org(), 'quick_wins',   'Quick Wins',      'Interested + rated 4★ and above',      '{"all":[{"field":"status","op":"in","value":["interested","meeting_set","negotiation"]},{"field":"rating","op":"gte","value":4}]}', 35, 'green', 'manual');

insert into public.packages (org_id, code, name, tier, description, tenure_months, list_price, max_discount_pct, hard_floor_discount_pct, features, sort_order) values
  (pg_temp.org(), 'STARTER-12', 'Starter Listing',    'starter',  'Get found: verified listing + basic leads',            12, 11999, 10, 20, '["Verified listing","5 photos","Basic lead alerts"]', 1),
  (pg_temp.org(), 'GROWTH-12',  'Growth Plus',        'standard', 'Priority placement in your locality',                   12, 24999, 10, 25, '["Everything in Starter","Priority placement","25 photos","Monthly insights"]', 2),
  (pg_temp.org(), 'PREMIUM-12', 'Premium Spotlight',  'premium',  'Top-of-search visibility + dedicated success manager',  12, 49999, 12, 30, '["Everything in Growth","Top-of-search","Video showcase","Success manager"]', 3),
  (pg_temp.org(), 'GROWTH-36',  'Growth Plus · 3 Yr', 'standard', 'Three-year Growth Plus at a locked-in price',           36, 59999, 15, 30, '["Growth Plus for 3 years","Price lock"]', 4),
  (pg_temp.org(), 'ELITE-36',   'Elite · 3 Yr',       'elite',    'Our most complete plan for multi-branch businesses',    36, 119999, 15, 30, '["Everything in Premium","Multi-branch","Quarterly review"]', 5),
  (pg_temp.org(), 'ADDON-ADS',  'Local Ads Booster',  'starter',  'Add-on: hyperlocal ad credits',                         3,  4999,  5,  10, '["₹4,000 ad credits","Locality targeting"]', 6);

-- ---------------------------------------------------------------------
-- Leads (2,000, fictional businesses)
-- ---------------------------------------------------------------------
create temp table seed_cats (i int, category text, noun text, segment public.lead_segment);
insert into seed_cats values
  (1,'Restaurant','Family Restaurant','b2c'), (2,'Clinic','Dental Clinic','b2c'), (3,'Salon','Unisex Salon','b2c'),
  (4,'Fitness','Fitness Studio','b2c'), (5,'Pharmacy','Medicals','b2c'), (6,'Education','Tutorials','b2c'),
  (7,'Retail','Supermart','b2c'), (8,'Bakery','Bakers','b2c'), (9,'Hardware','Hardware & Paints','b2b'),
  (10,'Electronics','Mobile Hub','b2c'), (11,'Real Estate','Realty','b2b'), (12,'Automobile','Car Care','b2c'),
  (13,'Travel','Tours & Travels','b2c'), (14,'Interiors','Interiors','b2b'), (15,'Boutique','Boutique','b2c'),
  (16,'Catering','Caterers','b2b'), (17,'Diagnostics','Diagnostics Lab','b2c'), (18,'Pet Care','Pet Clinic','b2c'),
  (19,'Optical','Opticals','b2c'), (20,'Events','Event Planners','b2b'), (21,'Logistics','Logistics','b2b'),
  (22,'Printing','Print Studio','b2b'), (23,'Coworking','Workspaces','b2b'), (24,'Packaging','Packaging Solutions','b2b');

create temp table seed_prefixes (i int, prefix text);
insert into seed_prefixes select row_number() over (), x from unnest(array[
  'Sunrise','Green Leaf','Blue Lotus','Urban Nest','Golden Oak','Silverline','Nova','Bright Path','Little Star','Maple',
  'Evergreen','Coral','Saffron','Indigo','Lakeview','Hilltop','Pearl','Orchid','Crescent','Harbor',
  'Amber','Tulsi','Riverstone','Peacock','Cedar','Monsoon','Bluebell','Lantern','Banyan','Kite']) x;

create temp table seed_teams as
select t.id as team_id, t.name as team, tr.code as city_code, tr.id as territory_id,
       array_agg(u.id order by u.id) filter (where u.role = 'executive') as execs
from public.teams t join public.territories tr on tr.id = t.territory_id
join public.users u on u.team_id = t.id
group by t.id, t.name, tr.code, tr.id;

insert into public.leads (org_id, lead_code, business_name, contact_name, phone, whatsapp, email, category, segment, tag, source,
                          rating, reviews_count, address_line, locality, city, state, pincode, lat, lng, territory_id, owner_id,
                          status, priority_score, expires_at, created_at)
select pg_temp.org(),
       'TN-' || st.city_code || '-' || lpad(g.i::text, 6, '0'),
       sp.prefix || ' ' || sc.noun,
       (array['Ramesh','Sunita','Abdul','Geeta','Venkat','Farida','Suresh','Anjali','Joseph','Harpreet','Naveen','Shalini'])[1 + (g.i * 7) % 12]
         || ' ' || (array['K.','M.','S.','R.','P.','T.'])[1 + g.i % 6],
       '+91 98' || lpad(g.i::text, 8, '0'),
       case when g.i % 4 <> 0 then '+91 98' || lpad(g.i::text, 8, '0') end,
       case when g.i % 3 = 0 then 'contact' || g.i || '@example.in' end,
       sc.category, sc.segment,
       case when g.i % 23 = 0 then 'Auto-pay Failed' when g.i % 17 = 0 then 'Renewal' when g.i % 11 = 0 then 'Phone Only'
            when g.i % 7 = 0 then 'Hot' when g.i % 5 = 0 then 'New' else null end,
       (array['import','web','referral','partner','manual','import'])[1 + g.i % 6],
       round((3 + random() * 2)::numeric, 1), (5 + random() * 400)::int,
       (g.i % 90 + 1) || ', ' || (array['Main Road','Cross Road','Market Street','Ring Road','Station Road'])[1 + g.i % 5],
       sl.locality, case st.city_code when 'HYD' then 'Hyderabad' when 'BLR' then 'Bengaluru' else 'Pune' end,
       case st.city_code when 'HYD' then 'Telangana' when 'BLR' then 'Karnataka' else 'Maharashtra' end,
       sl.pincode,
       case when g.i % 29 = 0 then null else sl.lat + (random() - 0.5) * 0.03 end,
       case when g.i % 29 = 0 then null else sl.lng + (random() - 0.5) * 0.03 end,
       st.territory_id,
       case when g.i % 13 = 0 then null else st.execs[1 + ((g.i / 4) % array_length(st.execs, 1))] end,
       'new',
       (20 + random() * 80)::int,
       case when g.i % 17 = 0 then now() + ((g.i % 40) - 10 || ' days')::interval end,
       now() - ((40 + g.i % 60) || ' days')::interval
from generate_series(1, 2000) g(i)
join lateral (select * from seed_teams order by team offset (g.i % 4) limit 1) st on true
join lateral (select * from seed_cats where i = 1 + (g.i * 5) % 24) sc on true
join lateral (select * from seed_prefixes where i = 1 + (g.i * 3 + g.i / 24) % 30) sp on true
join lateral (select * from seed_localities l where l.city_code = st.city_code order by l.locality offset (g.i / 4) % 4 limit 1) sl on true;

insert into public.number_sequences (org_id, kind, prefix, next_value)
values (pg_temp.org(), 'lead', 'TN-L-', 2001) on conflict (org_id, kind) do update set next_value = 2001;

insert into public.lead_assignments (org_id, lead_id, to_user_id, method, reason, assigned_by, assigned_at)
select org_id, id, owner_id, 'import', 'Initial territory allocation', pg_temp.uid(1), created_at
from public.leads where owner_id is not null;

-- ---------------------------------------------------------------------
-- Leave (before activity so executives on leave have no field activity)
-- Approvals go through the real engine: the manager decides in-app.
-- ---------------------------------------------------------------------
create or replace function pg_temp.act_as(p uuid) returns void language sql as
$$ select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true) $$;

do $$
declare r record; v_lr uuid; v_appr uuid; v_mgr uuid;
begin
  for r in
    select * from (values
      (12, 'CL', -20, -20, 'Family function',          'approve'),
      (14, 'SL', -15, -14, 'Fever',                    'approve'),
      (19, 'EL', -30, -26, 'Hometown visit',           'approve'),
      (23, 'CL', -8,  -8,  'Personal work',            'approve'),
      (17, 'EL',  0,   1,  'Sister''s wedding',        'approve'),   -- on leave today → gets no new leads
      (21, 'CL', -3,  -3,  'Bank work',                'reject'),
      (11, 'CL',  3,   3,  'Parent-teacher meeting',   'pending'),
      (15, 'EL',  9,  13,  'Vacation with family',     'pending'),
      (24, 'SL', -1,  -1,  'Migraine',                 'pending'),
      (10, 'CL', -35, -35, 'Personal errand',          'approve')
    ) as t(n, code, f, tt, reason, action)
  loop
    insert into public.leave_requests (org_id, user_id, leave_type_id, from_date, to_date, days, reason, created_at)
    values (pg_temp.org(), pg_temp.uid(r.n), (select id from public.leave_types where code = r.code),
            current_date + r.f, current_date + r.tt, (r.tt - r.f + 1), r.reason, now() - interval '2 days')
    returning id, approval_id into v_lr, v_appr;

    if r.action in ('approve', 'reject') then
      -- step through the chain as each approver would
      loop
        select coalesce(a.approver_id, (select u.id from public.users u where u.role = a.approver_role limit 1))
          into v_mgr from public.approvals a where a.id = v_appr and a.status = 'pending';
        exit when v_mgr is null;
        perform pg_temp.act_as(v_mgr);
        perform public.decide_approval(v_appr, r.action = 'approve',
                                       case when r.action = 'approve' then 'Approved. Enjoy!' else 'Month-end closing — please reschedule.' end);
      end loop;
      perform set_config('request.jwt.claims', '', true);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Field activity for the last 42 days (calls → outcomes → follow-ups,
-- meetings, visits, deals, payments). Triggers maintain daily_kpis,
-- attendance and lead state exactly as in production.
-- ---------------------------------------------------------------------
do $$
declare
  ex record; d date; i int; n_calls int; v_lead record; v_call uuid; v_at timestamptz; v_conn boolean; v_dur int;
  v_code text; v_next timestamptz; v_pkg record; v_disc numeric; v_deal uuid; v_mode public.payment_mode; v_quote uuid;
  v_pay uuid; v_visit_lat double precision; v_visit_lng double precision; v_city text; r float;
begin
  for ex in
    select u.id, u.org_id, e.work_city from public.users u join public.employees e on e.user_id = u.id
    where u.role = 'executive' order by u.id
  loop
    for d in select generate_series(current_date - 42, current_date - 1, interval '1 day')::date loop
      continue when extract(isodow from d) = 7;
      continue when public.is_on_leave(ex.id, d);
      continue when exists (select 1 from public.holidays h where h.day = d and not h.is_optional and (h.city is null or h.city = ex.work_city));
      continue when random() < 0.04;  -- occasional absence

      n_calls := 10 + (random() * 12)::int;
      for i in 1 .. n_calls loop
        select l.id, l.lat, l.lng, l.phone into v_lead from public.leads l
        where l.owner_id = ex.id and l.status not in ('won','lost','dnc','invalid') and not l.is_dnc
        order by random() limit 1;
        exit when v_lead.id is null;

        v_at := (d + time '10:00' + (random() * interval '8 hours')) at time zone 'Asia/Kolkata';
        v_conn := random() < 0.62;
        v_dur := case when v_conn then 25 + (random() * 380)::int else 0 end;
        insert into public.calls (org_id, lead_id, user_id, phone, started_at, ended_at, duration_sec, connected, recording_consent)
        values (ex.org_id, v_lead.id, ex.id, v_lead.phone, v_at, v_at + make_interval(secs => v_dur), v_dur, v_conn, v_conn and random() < 0.7)
        returning id into v_call;

        if not v_conn then
          if random() < 0.25 then
            insert into public.outcomes (org_id, lead_id, user_id, outcome_code, call_id, next_follow_up_at, created_at)
            values (ex.org_id, v_lead.id, ex.id, 'not_reachable', v_call, v_at + interval '1 day', v_at + interval '1 minute');
          end if;
          continue;
        end if;

        r := random();
        v_code := case when r < 0.30 then 'call_back' when r < 0.56 then 'interested' when r < 0.68 then 'meeting_set'
                       when r < 0.715 then 'deal_closed' when r < 0.85 then 'not_interested'
                       when r < 0.86 then 'do_not_contact' when r < 0.88 then 'wrong_number' else 'call_back' end;
        v_next := case when v_code in ('call_back','interested','meeting_set')
                       then date_trunc('hour', v_at + ((1 + (random() * 4)::int) || ' days')::interval) end;

        insert into public.outcomes (org_id, lead_id, user_id, outcome_code, remarks, call_id, next_follow_up_at, created_at)
        values (ex.org_id, v_lead.id, ex.id, v_code,
                case v_code when 'interested' then 'Wants pricing for the 12-month plan'
                            when 'call_back' then 'Owner busy, asked to call later'
                            when 'meeting_set' then 'Demo at the shop'
                            when 'not_interested' then (array['Budget constraints','Already using another service','Not the decision maker'])[1 + (random()*2)::int]
                            when 'do_not_contact' then 'Requested no further calls'
                            when 'deal_closed' then 'Closed on call, documents pending' end,
                v_call, v_next, v_at + make_interval(secs => v_dur + 30));

        if v_code = 'meeting_set' then
          insert into public.meetings (org_id, lead_id, user_id, scheduled_at, location, agenda, status, created_at)
          values (ex.org_id, v_lead.id, ex.id, v_next, 'At customer premises', 'Product demo & pricing',
                  case when v_next < now() then (case when random() < 0.8 then 'completed' else 'no_show' end)::public.meeting_status
                       else 'scheduled' end, v_at);
        end if;

        if v_code = 'deal_closed' then
          select * into v_pkg from public.packages where code <> 'ADDON-ADS' order by random() limit 1;
          v_disc := (array[0, 0, 5, 8, 10])[1 + (random() * 4)::int];
          insert into public.quotes (org_id, lead_id, package_id, created_by, list_price, discount_pct, gst_pct, status, valid_until, created_at)
          values (ex.org_id, v_lead.id, v_pkg.id, ex.id, v_pkg.list_price, v_disc, v_pkg.gst_pct, 'accepted', d + 15, v_at)
          returning id into v_quote;

          r := random();
          v_mode := case when r < 0.55 then 'autopay' when r < 0.85 then 'online' else 'cash' end;
          insert into public.deals (org_id, lead_id, quote_id, package_id, owner_id, team_id, contract_value, tenure_months,
                                    is_renewal, renewal_term, payment_mode, closed_at, start_date, end_date, created_at)
          values (ex.org_id, v_lead.id, v_quote, v_pkg.id, ex.id, (select team_id from public.users where id = ex.id),
                  round(v_pkg.list_price * (1 - v_disc / 100), 2), v_pkg.tenure_months,
                  random() < 0.2, case when v_pkg.tenure_months = 36 then '3y' else '1y' end,
                  v_mode, v_at, d + 1, d + 1 + (v_pkg.tenure_months || ' months')::interval, v_at)
          returning id into v_deal;

          insert into public.invoices (org_id, kind, deal_id, bill_to, subtotal, discount, cgst, sgst, total, issued_at, created_by)
          select ex.org_id, 'proforma', v_deal,
                 jsonb_build_object('name', l.business_name, 'address', l.address_line || ', ' || l.locality || ', ' || l.city || ' ' || l.pincode),
                 q.list_price, q.discount_amount, round(q.net_price * 0.09, 2), round(q.net_price * 0.09, 2), q.total_amount, v_at, ex.id
          from public.quotes q join public.leads l on l.id = q.lead_id where q.id = v_quote;

          if v_mode = 'autopay' then
            insert into public.mandates (org_id, deal_id, umrn, max_amount, frequency, start_date, status, bounce_count, rejection_reason, last_bounce_at)
            select ex.org_id, v_deal, 'DEMOUMRN' || lpad((random() * 1e8)::bigint::text, 10, '0'),
                   round(dd.contract_value * 1.18 / dd.tenure_months * 1.5, 0), 'monthly', d + 1,
                   m.st, case when m.st = 'active' and random() < 0.12 then 1 else 0 end,
                   case when m.st = 'rejected' then (array['Signature mismatch','Account details incorrect','Bank did not respond'])[1 + (random()*2)::int] end,
                   null
            from public.deals dd,
                 lateral (select (case when random() < 0.82 then 'active' when random() < 0.5 then 'rejected' else 'pending_bank' end)::public.mandate_status as st) m
            where dd.id = v_deal;
          end if;

          insert into public.payments (org_id, deal_id, mandate_id, amount, method, status, gateway_ref, collected_by, due_date, paid_at, failure_reason, created_at)
          select ex.org_id, v_deal, (select id from public.mandates where deal_id = v_deal limit 1),
                 case when v_mode = 'autopay' then round(dd.contract_value * 1.18 / dd.tenure_months, 2) else round(dd.contract_value * 1.18, 2) end,
                 case v_mode when 'autopay' then 'mandate'::public.payment_method when 'cash' then 'cash'::public.payment_method
                             else (array['upi','card','netbanking','upi'])[1 + (random() * 3)::int]::public.payment_method end,
                 p.st,
                 'DEMO-TXN-' || upper(substr(md5(random()::text), 1, 10)),
                 ex.id, d + 1,
                 case when p.st = 'success' then v_at + interval '2 hours' end,
                 case when p.st = 'failed' then (array['Insufficient funds','Mandate not yet active','Payment declined by bank'])[1 + (random()*2)::int] end,
                 v_at + interval '1 hour'
          from public.deals dd,
               lateral (select (case when random() < 0.86 then 'success' when random() < 0.6 then 'failed' else 'pending' end)::public.payment_status as st) p
          where dd.id = v_deal
          returning id into v_pay;

          -- receipts and tax invoices are issued by the payments_settled trigger
        end if;
      end loop;

      -- field visits (2–4 a day) near lead locations
      for i in 1 .. 2 + (random() * 2)::int loop
        select l.id, l.lat, l.lng into v_lead from public.leads l
        where l.owner_id = ex.id and l.lat is not null and l.status not in ('dnc','invalid') order by random() limit 1;
        exit when v_lead.id is null;
        v_at := (d + time '11:00' + (i - 1) * interval '2 hours' + random() * interval '40 minutes') at time zone 'Asia/Kolkata';
        v_visit_lat := v_lead.lat + (random() - 0.5) * case when random() < 0.85 then 0.003 else 0.02 end;
        v_visit_lng := v_lead.lng + (random() - 0.5) * case when random() < 0.85 then 0.003 else 0.02 end;
        insert into public.visits (org_id, lead_id, user_id, purpose, check_in_at, check_in_lat, check_in_lng, check_in_accuracy_m,
                                   check_out_at, check_out_lat, check_out_lng, travel_distance_km, notes)
        values (ex.org_id, v_lead.id, ex.id, (array['pitch','demo','documents','collection','follow_up'])[1 + (random() * 4)::int],
                v_at, v_visit_lat, v_visit_lng, 8 + random() * 20,
                v_at + (20 + random() * 40) * interval '1 minute', v_visit_lat, v_visit_lng,
                round((2 + random() * 12)::numeric, 2), 'Met the owner; shared brochure');
      end loop;
    end loop;
  end loop;
end $$;

-- Old pending follow-ups become "missed"; keep a few overdue for the demo.
update public.follow_ups set status = 'missed'
where status = 'pending' and due_at < now() - interval '2 days' and random() < 0.85;

-- Today's agenda for every executive: follow-ups, callbacks and meetings.
insert into public.follow_ups (org_id, lead_id, user_id, kind, due_at, note)
select l.org_id, l.id, l.owner_id, (case when rn % 3 = 0 then 'callback' else 'follow_up' end)::public.follow_up_kind,
       (current_date + time '10:30' + rn * interval '45 minutes') at time zone 'Asia/Kolkata',
       (array['Share revised quote','Confirm documents','Check decision with partner','Send payment link'])[1 + rn % 4]
from (select l.*, row_number() over (partition by l.owner_id order by l.priority_score desc) rn
      from public.leads l join public.users u on u.id = l.owner_id
      where u.role = 'executive' and l.status in ('interested','contacted','meeting_set','new')) l
where rn <= 6;

update public.leads l set next_follow_up_at = f.due_at
from (select lead_id, min(due_at) due_at from public.follow_ups where status = 'pending' group by lead_id) f
where f.lead_id = l.id;

insert into public.meetings (org_id, lead_id, user_id, scheduled_at, location, agenda, status)
select l.org_id, l.id, l.owner_id, (current_date + time '12:00' + rn * interval '2 hours') at time zone 'Asia/Kolkata',
       l.address_line || ', ' || l.locality, 'Demo of ' || (array['Growth Plus','Premium Spotlight','Elite · 3 Yr'])[1 + rn % 3], 'scheduled'
from (select l.*, row_number() over (partition by l.owner_id order by l.rating desc) rn
      from public.leads l join public.users u on u.id = l.owner_id
      where u.role = 'executive' and l.status in ('interested','meeting_set') and l.lat is not null) l
where rn <= 2;

-- A few renewals coming up for paid customers, and some expired ones.
update public.leads set expires_at = now() + ((id::text ~ '^[0-7]')::int * 20 - 5 || ' days')::interval
where current_package_id is not null and random() < 0.3;

-- ---------------------------------------------------------------------
-- Attendance: punches on active days (+ HQ staff), absences, today.
-- ---------------------------------------------------------------------
update public.attendance a set
  punch_in_at  = (a.day + time '09:20' + random() * interval '45 minutes') at time zone 'Asia/Kolkata',
  punch_out_at = (a.day + time '18:15' + random() * interval '75 minutes') at time zone 'Asia/Kolkata',
  punch_in_lat = 17.4474 + (random() - 0.5) * 0.002, punch_in_lng = 78.3762 + (random() - 0.5) * 0.002,
  shift_id = 'd0000000-0000-4000-8000-000000000001',
  source = 'punch'
where a.status = 'present' and a.day < current_date and random() < 0.9;
update public.attendance set is_late = (punch_in_at at time zone 'Asia/Kolkata')::time > time '09:45' where punch_in_at is not null;

-- HQ staff and team leads (office shift)
insert into public.attendance (org_id, user_id, day, status, source, shift_id, punch_in_at, punch_out_at, punch_in_lat, punch_in_lng, is_late)
select pg_temp.org(), u.id, d::date, 'present', 'punch', e.shift_id,
       (d::date + time '09:40' + random() * interval '40 minutes') at time zone 'Asia/Kolkata',
       (d::date + time '18:40' + random() * interval '60 minutes') at time zone 'Asia/Kolkata',
       17.4474, 78.3762, random() < 0.1
from public.users u join public.employees e on e.user_id = u.id
cross join generate_series(current_date - 42, current_date - 1, interval '1 day') d
where u.role <> 'executive' and extract(isodow from d) < (case when u.role = 'team_lead' then 7 else 6 end)
  and not exists (select 1 from public.holidays h where h.day = d::date and not h.is_optional and (h.city is null or h.city = e.work_city))
on conflict (user_id, day) do nothing;

-- Mark missing working days as absent (executives)
insert into public.attendance (org_id, user_id, day, status, source)
select pg_temp.org(), u.id, d::date, 'absent', 'system'
from public.users u join public.employees e on e.user_id = u.id
cross join generate_series(current_date - 42, current_date - 1, interval '1 day') d
where u.role = 'executive' and extract(isodow from d) < 7
  and not exists (select 1 from public.holidays h where h.day = d::date and not h.is_optional and (h.city is null or h.city = e.work_city))
on conflict (user_id, day) do nothing;
-- holidays + week-offs
insert into public.attendance (org_id, user_id, day, status, source)
select pg_temp.org(), u.id, d::date,
       case when extract(isodow from d) = 7 then 'week_off' else 'holiday' end::public.attendance_status, 'system'
from public.users u cross join generate_series(current_date - 42, current_date - 1, interval '1 day') d
on conflict (user_id, day) do nothing;

-- Today: most people have punched in (not out yet)
insert into public.attendance (org_id, user_id, day, status, source, shift_id, punch_in_at, punch_in_lat, punch_in_lng, is_late)
select pg_temp.org(), u.id, current_date, 'present', 'punch', e.shift_id,
       (current_date + time '09:22' + (u.id::text ~ '[0-4]$')::int * interval '28 minutes') at time zone 'Asia/Kolkata',
       t.center_lat + 0.01, t.center_lng + 0.01, (u.id::text ~ '[0-4]$')
from public.users u join public.employees e on e.user_id = u.id
left join public.territories t on t.id = u.territory_id
where not public.is_on_leave(u.id, current_date) and u.id not in (pg_temp.uid(13), pg_temp.uid(25))
  and extract(isodow from current_date) < 7
on conflict (user_id, day) do nothing;

-- ---------------------------------------------------------------------
-- Targets (current + previous month), goals, appraisals, ratings
-- ---------------------------------------------------------------------
insert into public.targets (org_id, user_id, period_month, metric, target_value, weightage_pct, set_by)
select pg_temp.org(), u.id, m.month, t.metric, t.value * (case when e.designation like 'Senior%' then 1.25 else 1 end), t.w, u.manager_id
from public.users u join public.employees e on e.user_id = u.id
cross join (values (date_trunc('month', current_date)::date), ((date_trunc('month', current_date) - interval '1 month')::date)) m(month)
cross join (values ('revenue', 250000, 40), ('deals', 8, 20), ('collections', 200000, 15),
                   ('autopay_pct', 60, 10), ('talk_time_min', 1800, 10), ('visits', 60, 5)) t(metric, value, w)
where u.role = 'executive';

insert into public.appraisal_cycles (id, org_id, name, period_start, period_end, self_review_due, manager_review_due, status) values
  ('e0000000-0000-4000-8000-000000000001', pg_temp.org(), 'H1 FY ' || to_char(current_date, 'YYYY') || '–' || to_char(current_date + interval '1 year', 'YY'),
   make_date(extract(year from current_date)::int, 4, 1), make_date(extract(year from current_date)::int, 9, 30),
   make_date(extract(year from current_date)::int, 10, 10), make_date(extract(year from current_date)::int, 10, 20), 'review'),
  ('e0000000-0000-4000-8000-000000000002', pg_temp.org(), 'H2 FY ' || to_char(current_date, 'YYYY') || '–' || to_char(current_date + interval '1 year', 'YY'),
   make_date(extract(year from current_date)::int, 10, 1), make_date(extract(year from current_date)::int + 1, 3, 31),
   make_date(extract(year from current_date)::int + 1, 4, 10), make_date(extract(year from current_date)::int + 1, 4, 20), 'active');

insert into public.goals (org_id, user_id, cycle_id, kra, title, metric_key, auto_source, target_value, weightage_pct)
select pg_temp.org(), u.id, c.id, g.kra, g.title, g.metric, g.auto, g.target * (case when c.status = 'review' then 6 else 6 end), g.w
from public.users u cross join public.appraisal_cycles c
cross join (values
  ('Revenue',       'New business revenue (₹)',        'revenue',       true,  250000::numeric, 35),
  ('Revenue',       'Deals closed',                    'deals',         true,  8,     15),
  ('Collections',   'Collections (₹)',                 'collections',   true,  200000, 15),
  ('Quality',       'Auto-pay share of deals (%)',     'autopay_pct',   true,  10,    10),
  ('Productivity',  'Talk time (minutes)',             'talk_time_min', true,  300,   10),
  ('Productivity',  'Field visits',                    'visits',        true,  10,    10),
  ('Customer',      'Customer satisfaction (avg ★)',   null,            false, 0.75,  5)
) g(kra, title, metric, auto, target, w)
where u.role = 'executive';
update public.goals set target_value = case metric_key when 'autopay_pct' then 60 when null then 4.5 else target_value end
where metric_key = 'autopay_pct' or metric_key is null;
update public.goals set target_value = 4.5 where metric_key is null;

-- Auto-populate achieved values from live sales data (same logic the app job runs).
update public.goals g set achieved_value = coalesce((
  select case g.metric_key
    when 'revenue'       then sum(dk.revenue)
    when 'deals'         then sum(dk.deals)
    when 'collections'   then sum(dk.collections)
    when 'talk_time_min' then round(sum(dk.talk_time_sec) / 60.0)
    when 'visits'        then sum(dk.visits)
    when 'autopay_pct'   then case when sum(dk.deals) > 0 then round(100.0 * sum(dk.autopay_deals) / sum(dk.deals), 1) else 0 end
  end
  from public.daily_kpis dk join public.appraisal_cycles c on c.id = g.cycle_id
  where dk.user_id = g.user_id and dk.day between c.period_start and c.period_end), 0)
where g.auto_source;
update public.goals set achieved_value = round((3.8 + random() * 1.1)::numeric, 1),
  strengths = 'Builds rapport quickly; strong follow-up discipline',
  improvements = 'Push auto-pay adoption at closing'
where metric_key is null;

insert into public.appraisals (org_id, cycle_id, user_id, reviewer_id, status, self_score, manager_score, final_score, strengths, improvements, submitted_at)
select pg_temp.org(), 'e0000000-0000-4000-8000-000000000001', u.id, u.manager_id,
       (array['self_review','manager_review','manager_review','closed'])[1 + (random() * 3)::int]::public.appraisal_status,
       round((3.4 + random() * 1.4)::numeric, 2), round((3.2 + random() * 1.5)::numeric, 2), null,
       'Consistent pipeline hygiene', 'Improve collections follow-through', now() - interval '3 days'
from public.users u where u.role in ('executive', 'team_lead');
update public.appraisals set final_score = manager_score, closed_at = now() - interval '1 day' where status = 'closed';

insert into public.ratings (org_id, subject_user_id, score, comment, source, period_month, given_by)
select pg_temp.org(), u.id, round((3.6 + random() * 1.3)::numeric, 1), 'Monthly performance rating', 'manager',
       (date_trunc('month', current_date) - interval '1 month')::date, u.manager_id
from public.users u where u.role = 'executive';

insert into public.ratings (org_id, lead_id, score, comment, source, reviewer_name)
select l.org_id, l.id, round((3 + random() * 2)::numeric, 1),
       (array['Quick service and friendly staff','Good value for money','Clean and well maintained','Helpful owner, will visit again','Average experience, slow on weekends'])[1 + (random()*4)::int],
       'customer', (array['A. Customer','R. Visitor','S. Patron','M. Guest'])[1 + (random()*3)::int]
from public.leads l cross join generate_series(1, 3) where random() < 0.5;

-- ---------------------------------------------------------------------
-- Incentives → payroll; payslips; reimbursements
-- ---------------------------------------------------------------------
insert into public.incentives (org_id, user_id, period_month, deal_id, basis, base_amount, rate_pct, amount, status, approved_by, approved_at, payroll_month)
select d.org_id, d.owner_id, date_trunc('month', d.closed_at at time zone 'Asia/Kolkata')::date, d.id, 'deal_slab',
       d.contract_value, 5, round(d.contract_value * 0.05, 2),
       case when date_trunc('month', d.closed_at) < date_trunc('month', now()) then 'approved' else 'calculated' end::public.incentive_status,
       case when date_trunc('month', d.closed_at) < date_trunc('month', now()) then pg_temp.uid(3) end,
       case when date_trunc('month', d.closed_at) < date_trunc('month', now()) then now() - interval '5 days' end,
       case when date_trunc('month', d.closed_at) < date_trunc('month', now()) then date_trunc('month', d.closed_at at time zone 'Asia/Kolkata')::date end
from public.deals d where d.status <> 'cancelled';

insert into public.incentives (org_id, user_id, period_month, deal_id, basis, base_amount, amount, status, notes)
select d.org_id, d.owner_id, date_trunc('month', d.closed_at at time zone 'Asia/Kolkata')::date, d.id, 'autopay_bonus', 0, 250, 'calculated', 'Auto-pay bonus'
from public.deals d where d.payment_mode = 'autopay' and exists (select 1 from public.mandates m where m.deal_id = d.id and m.status = 'active');

-- A few current-month incentives submitted for Finance approval (shows in inbox)
update public.incentives set status = 'pending_approval'
where id in (select id from public.incentives where status = 'calculated' and basis = 'deal_slab' order by amount desc limit 4);

insert into public.reimbursements (org_id, user_id, category, expense_date, amount, distance_km, description, status, created_at)
select pg_temp.org(), u.id, c.cat, current_date - (1 + (random() * 20)::int), c.amt + (random() * 400)::int,
       case when c.cat = 'fuel' then round((40 + random() * 120)::numeric, 1) end, c.descr, 'pending', now() - interval '1 day'
from public.users u
cross join (values ('fuel', 800, 'Fuel for field visits'), ('client_meeting', 600, 'Coffee with prospect'), ('phone', 499, 'Mobile data top-up')) c(cat, amt, descr)
where u.role = 'executive' and random() < 0.45;
insert into public.reimbursements (org_id, user_id, category, expense_date, amount, description, status)
values (pg_temp.org(), pg_temp.uid(16), 'travel', current_date - 4, 6450, 'Train tickets for Warangal cluster visit', 'pending');

-- Payslips for the last 3 months (published), incl. approved incentives.
insert into public.payslips (org_id, user_id, period_month, paid_days, lop_days, earnings, deductions, gross, total_deductions,
                             incentive_amount, status, published_at)
select pg_temp.org(), u.id, m.month, 30 - lop.days, lop.days,
       jsonb_build_array(
         jsonb_build_object('code','BASIC','label','Basic','amount', round(g.gross * 0.40)),
         jsonb_build_object('code','HRA','label','House Rent Allowance','amount', round(g.gross * 0.20)),
         jsonb_build_object('code','SPL','label','Special Allowance','amount', g.gross - round(g.gross * 0.40) - round(g.gross * 0.20)),
         jsonb_build_object('code','INC','label','Sales Incentive','amount', coalesce(inc.amount, 0))),
       jsonb_build_array(
         jsonb_build_object('code','PF','label','Provident Fund','amount', round(g.gross * 0.40 * 0.12)),
         jsonb_build_object('code','PT','label','Professional Tax','amount', 200),
         jsonb_build_object('code','TDS','label','Income Tax (TDS)','amount', round(g.gross * 0.04))),
       g.gross + coalesce(inc.amount, 0),
       round(g.gross * 0.40 * 0.12) + 200 + round(g.gross * 0.04),
       coalesce(inc.amount, 0), 'published', (m.month + interval '1 month' + interval '1 day')
from public.users u join public.employees e on e.user_id = u.id
cross join lateral (select (app.decrypt(s.monthly_gross_enc))::numeric as gross from public.employee_sensitive s where s.employee_id = e.id) g
cross join (select (date_trunc('month', current_date) - (k || ' month')::interval)::date as month from generate_series(1, 3) k) m
left join lateral (select sum(i.amount) amount from public.incentives i where i.user_id = u.id and i.payroll_month = m.month and i.status = 'approved') inc on true
cross join lateral (select (case when u.id = pg_temp.uid(21) and m.month = (date_trunc('month', current_date) - interval '1 month')::date then 1 else 0 end)::numeric as days) lop;

update public.incentives i set status = 'paid', payslip_id = p.id
from public.payslips p where p.user_id = i.user_id and p.period_month = i.payroll_month and i.status = 'approved';

-- ---------------------------------------------------------------------
-- Documents (employee vault + KYC with rejections)
-- ---------------------------------------------------------------------
insert into public.documents (org_id, category_id, owner_user_id, title, status, verified_by, verified_at, uploaded_by)
select pg_temp.org(), c.id, u.id, c.name, 'verified', pg_temp.uid(2), now() - interval '100 days', u.id
from public.users u cross join public.document_categories c
where c.context = 'employee' and c.code in ('education','id_proof','address_proof','offer_letter','appointment_letter');

insert into public.documents (org_id, category_id, owner_user_id, title, status, uploaded_by)
select pg_temp.org(), (select id from public.document_categories where code = 'investment_proof'), u.id,
       'Section 80C proof – FY ' || to_char(current_date, 'YYYY'), 'pending', u.id
from public.users u where u.role = 'executive' and random() < 0.5;

insert into public.documents (org_id, category_id, lead_id, deal_id, title, status, rejection_reason, verified_by, verified_at, uploaded_by)
select d.org_id, c.id, d.lead_id, d.id, c.name, s.st,
       case when s.st = 'rejected' then (array['Image is blurred — please re-upload','Name does not match the GST certificate','Document has expired'])[1 + (random()*2)::int] end,
       case when s.st <> 'pending' then pg_temp.uid(3) end, case when s.st <> 'pending' then now() - interval '1 day' end,
       d.owner_id
from public.deals d cross join public.document_categories c
cross join lateral (select (case when random() < 0.78 then 'verified' when random() < 0.6 then 'rejected' else 'pending' end)::public.document_status st) s
where c.context = 'kyc' and c.code in ('kyc_pan','kyc_address','kyc_photo');

-- ---------------------------------------------------------------------
-- Requests, policies, acknowledgements
-- ---------------------------------------------------------------------
insert into public.requests (org_id, type, user_id, subject, details, payload) values
  (pg_temp.org(), 'punch_correction', pg_temp.uid(10), 'Forgot to punch out on ' || to_char(current_date - 6, 'DD Mon'), 'Was at a client meeting till 7 PM',
   jsonb_build_object('day', current_date - 6, 'punch_out', '19:05')),
  (pg_temp.org(), 'business_card', pg_temp.uid(12), 'Business cards – 200 nos', null, '{"quantity":200}'),
  (pg_temp.org(), 'access', pg_temp.uid(16), 'Access to Renewals queue', 'Handling renewals for Secunderabad', '{"queue":"renewals"}'),
  (pg_temp.org(), 'travel', pg_temp.uid(19), 'Mysuru cluster visit', '2-day trip to onboard partner outlets', '{"from":"Bengaluru","to":"Mysuru","days":2,"estimate":4200}'),
  (pg_temp.org(), 'profile_change', pg_temp.uid(10), 'Update bank account', 'Moved salary account', '{"field":"bank_account","new_last4":"4821"}'),
  (pg_temp.org(), 'retention_bonus', pg_temp.uid(23), 'Retention bonus review', null, '{}');
insert into public.requests (org_id, type, user_id, is_anonymous, subject, details) values
  (pg_temp.org(), 'grievance', null, true, 'Unrealistic call targets on Saturdays', 'Shared anonymously via TeamNest');

insert into public.policies (org_id, title, category, body_md, requires_ack, published_at, created_by) values
  (pg_temp.org(), 'Employee Privacy Notice: Location & Call Recording', 'policy',
   E'## What we collect\n- **Location** only while you are punched in, and only during your shift window (30 min before to 60 min after).\n- **Call recordings** only when you switch recording on *and* the customer has been told.\n\n## Why\nTo verify field visits, calculate activity points and resolve customer disputes.\n\n## Your controls\nYou can withdraw consent anytime from **Profile → Privacy**. Recordings are deleted after 90 days; location history after 30 days.',
   true, now() - interval '60 days', pg_temp.uid(2)),
  (pg_temp.org(), 'Leave Policy ' || to_char(current_date, 'YYYY'), 'policy',
   E'Casual 12 · Sick 12 · Earned 18 days a year. Earned leave carries forward up to 30 days. Apply at least 1 day ahead for casual leave and 7 days ahead for earned leave.',
   true, now() - interval '120 days', pg_temp.uid(2)),
  (pg_temp.org(), 'Travel & Reimbursement Policy', 'policy',
   E'Fuel is reimbursed at ₹4/km for two-wheelers, based on visit distance logged in the app. Claims above ₹5,000 need Finance approval.',
   true, now() - interval '90 days', pg_temp.uid(3)),
  (pg_temp.org(), 'Code of Conduct', 'policy', E'Be honest with customers. Never promise features we don''t offer. Respect Do-Not-Contact requests immediately.',
   true, now() - interval '200 days', pg_temp.uid(2)),
  (pg_temp.org(), 'Festive season team offsite 🎉', 'announcement', E'Join us for the festive season offsite. RSVP in the Events tab by Friday.',
   false, now() - interval '2 days', pg_temp.uid(2)),
  (pg_temp.org(), 'Internal opening: Team Lead – Pune', 'job_posting', E'Lead a team of 5 executives in Pune. 18+ months tenure and 100% target achievement in 2 of the last 3 quarters required.',
   false, now() - interval '5 days', pg_temp.uid(2));

insert into public.policy_acknowledgements (policy_id, user_id, org_id, policy_version, acknowledged_at)
select p.id, u.id, pg_temp.org(), p.version, p.published_at + interval '2 days'
from public.policies p cross join public.users u
where p.requires_ack and (u.id <> pg_temp.uid(10) or p.title like 'Code%') and random() < 0.85;

-- ---------------------------------------------------------------------
-- Consents, live location (today), notifications
-- ---------------------------------------------------------------------
insert into public.consents (org_id, user_id, type, granted, notice_version, created_at)
select pg_temp.org(), u.id, t.type, case when t.type = 'call_recording' then u.id <> pg_temp.uid(15) else true end, '2026.1', now() - interval '50 days'
from public.users u cross join (values ('privacy_notice'::public.consent_type), ('location_tracking'), ('call_recording')) t(type)
where u.role in ('executive','team_lead');

insert into public.location_pings (org_id, user_id, lat, lng, accuracy_m, battery_pct, recorded_at)
select pg_temp.org(), u.id,
       t.center_lat + 0.01 + sin(k / 3.0 + n.x) * 0.015, t.center_lng + 0.01 + cos(k / 3.0 + n.x) * 0.015,
       10 + random() * 15, (95 - k * 3)::smallint,
       (current_date + time '10:00' + k * interval '20 minutes') at time zone 'Asia/Kolkata'
from public.users u join public.territories t on t.id = u.territory_id
cross join generate_series(0, 8) k
cross join lateral (select (abs(hashtext(u.id::text)) % 100) / 10.0 as x) n
where u.role = 'executive' and exists (select 1 from public.attendance a where a.user_id = u.id and a.day = current_date and a.punch_in_at is not null);

insert into public.notifications (org_id, user_id, category, title, body, data, read_at, created_at) values
  (pg_temp.org(), pg_temp.uid(10), 'leads',    '3 follow-ups due before noon', 'Start with Sunrise Dental Clinic', '{"route":"/home?tab=follow-ups"}', null, now() - interval '30 minutes'),
  (pg_temp.org(), pg_temp.uid(10), 'payments', 'Payment received ₹29,499', 'Online payment for Growth Plus', '{"route":"/deals"}', null, now() - interval '3 hours'),
  (pg_temp.org(), pg_temp.uid(10), 'hr',       'Payslip published', 'Your payslip for last month is ready', '{"route":"/work/payslips"}', now() - interval '2 days', now() - interval '5 days'),
  (pg_temp.org(), pg_temp.uid(10), 'hr',       'Please acknowledge: Privacy Notice', 'Read and acknowledge the updated notice', '{"route":"/work/policies"}', null, now() - interval '1 day'),
  (pg_temp.org(), pg_temp.uid(10), 'system',   'Offer: Festive bonus week', 'Extra ₹500 per auto-pay deal this week', '{"route":"/home"}', null, now() - interval '6 hours'),
  (pg_temp.org(), pg_temp.uid(6),  'approvals','Leave request from Karthik Goud', 'Casual Leave · 1 day', '{"route":"/approvals"}', null, now() - interval '2 days');

-- Keep audit log focused on real activity, not seed noise.
truncate public.audit_logs;
insert into public.audit_logs (org_id, actor_id, actor_role, action, table_name, record_id, new_data, created_at) values
  (pg_temp.org(), pg_temp.uid(1), 'super_admin', 'update', 'packages', null, '{"note":"Raised PREMIUM-12 max discount to 12%"}', now() - interval '3 days'),
  (pg_temp.org(), pg_temp.uid(2), 'hr_admin', 'view_sensitive', 'employee_sensitive', null, '{"employee":"KDV01010"}', now() - interval '1 day'),
  (pg_temp.org(), pg_temp.uid(4), 'area_manager', 'export', 'leads', null, '{"rows":148,"format":"xlsx"}', now() - interval '5 hours');

analyze;
