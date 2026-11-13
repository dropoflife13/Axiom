// scripts/v3/generate-tasks-v3.mjs
// Deterministic generator for fixtures/task-v3/tasks.json
// Generates 120 fresh held-out test tasks (V3-H-001..V3-H-120) strictly balanced across 8 cohorts.
// Preserves train (T-001..T-040) and dev (D-001..D-040) verbatim from fixtures/task-v2/tasks.json.
// Zero LLM calls. Zero modification to v2 runs.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  startPostgresContainer,
  stopPostgresContainer,
  evaluateMigrationSqlInContainer,
} from '../oracle.js';

function stableTaskSeed(taskId) {
  return crypto.createHash('sha256').update(taskId).digest().readUInt32BE(0);
}

function selectBoundFacts(taskId, applicableFacts, candidateSet) {
  const candidates = applicableFacts.filter((id) => candidateSet.has(id)).sort();
  if (candidates.length <= 5) return candidates;
  const count = 3 + (stableTaskSeed(taskId) % 3);
  const start = stableTaskSeed(taskId) % candidates.length;
  return Array.from({ length: count }, (_, i) => candidates[(start + i) % candidates.length]).sort();
}

// 18 R2 candidate facts from out/proposed/R2/bound-facts-report.json
const R2_CANDIDATES = new Set([
  'F-03', 'F-05', 'F-10', 'F-15', 'F-16', 'F-17', 'F-18', 'F-19', 'F-20',
  'F-21', 'F-22', 'F-25', 'F-26', 'F-27', 'F-32', 'F-36', 'F-37', 'F-39'
]);

// Exact applicable facts per cohort from v2 protocol
const APPLICABLE_BY_COHORT = {
  C1_TTT: ['F-01','F-02','F-03','F-04','F-05','F-07','F-08','F-09','F-11','F-13','F-15','F-16','F-17','F-18','F-19','F-20','F-22','F-23','F-25','F-26','F-27','F-30','F-32','F-34','F-36','F-37'],
  C2_TTF: ['F-01','F-02','F-03','F-04','F-05','F-07','F-08','F-11','F-13','F-15','F-16','F-17','F-18','F-19','F-20','F-22','F-23','F-25','F-26','F-27','F-30','F-36','F-39'],
  C3_TFT: ['F-01','F-02','F-03','F-04','F-05','F-06','F-07','F-08','F-09','F-10','F-11','F-13','F-15','F-16','F-17','F-18','F-21','F-22','F-23','F-24','F-25','F-26','F-30','F-32','F-34','F-37'],
  C4_TFF: ['F-01','F-02','F-03','F-04','F-05','F-06','F-07','F-08','F-10','F-11','F-13','F-15','F-16','F-17','F-18','F-21','F-22','F-23','F-24','F-25','F-26','F-30'],
  C5_FTT: ['F-01','F-03','F-04','F-05','F-07','F-08','F-09','F-11','F-13','F-15','F-16','F-17','F-18','F-19','F-20','F-22','F-27','F-32','F-34','F-36','F-37'],
  C6_FTF: ['F-01','F-03','F-04','F-05','F-07','F-08','F-11','F-13','F-15','F-16','F-17','F-18','F-19','F-20','F-22','F-27','F-36'],
  C7_FFT: ['F-01','F-03','F-04','F-05','F-06','F-07','F-08','F-09','F-10','F-11','F-13','F-15','F-16','F-17','F-18','F-21','F-22','F-32','F-34','F-37'],
  C8_FFF: ['F-01','F-03','F-04','F-05','F-06','F-07','F-08','F-10','F-11','F-13','F-15','F-16','F-17','F-18','F-21','F-22'],
};

// 120 Curated domain table specifications (15 per cohort)
const TEST_SPECS = [
  // C1_TTT (Multi-tenant Append-only Ingestion)
  {
    table: 'pos_terminal_checkouts',
    prompt: 'Create a multi-tenant append-only ingestion table in PostgreSQL for point-of-sale checkout telemetry (pos terminal checkouts) that tracks terminal identifier, transaction status, client IP, idempotency key, and JSON payload.',
  },
  {
    table: 'order_fulfillment_dispatches',
    prompt: 'Create a multi-tenant append-only ingestion table in PostgreSQL for automated order dispatch events (order fulfillment dispatches) that tracks dispatch route, carrier reference, client IP, idempotency key, and JSON payload.',
  },
  {
    table: 'credit_card_authorizations',
    prompt: 'Create a multi-tenant append-only ingestion table in PostgreSQL for real-time credit card payment authorizations (credit card authorizations) that tracks auth token, network code, client IP, idempotency key, and JSON payload.',
  },
  {
    table: 'invoice_payment_reconciliations',
    prompt: 'Create a multi-tenant append-only ingestion table in PostgreSQL for enterprise payment reconciliation streams (invoice payment reconciliations) that tracks batch sequence, settlement code, client IP, idempotency key, and JSON payload.',
  },
  {
    table: 'freight_bill_manifests',
    prompt: 'Create a multi-tenant append-only ingestion table in PostgreSQL for logistics freight manifest webhooks (freight bill manifests) that tracks bill reference, customs status, client IP, idempotency key, and JSON payload.',
  },
  {
    table: 'wire_transfer_receipts',
    prompt: 'Create a multi-tenant append-only ingestion table in PostgreSQL for interbank wire transfer notifications (wire transfer receipts) that tracks swift reference, clearing status, client IP, idempotency key, and JSON payload.',
  },
  {
    table: 'inventory_pallet_scans',
    prompt: 'Create a multi-tenant append-only ingestion table in PostgreSQL for automated warehouse barcode scans (inventory pallet scans) that tracks scanner identifier, warehouse bay, client IP, idempotency key, and JSON payload.',
  },
  {
    table: 'clearinghouse_settlement_batches',
    prompt: 'Create a multi-tenant append-only ingestion table in PostgreSQL for multi-currency settlement webhooks (clearinghouse settlement batches) that tracks clearing cycle, liquidity pool, client IP, idempotency key, and JSON payload.',
  },
  {
    table: 'meter_telemetry_readings',
    prompt: 'Create a multi-tenant append-only ingestion table in PostgreSQL for smart industrial meter telemetries (meter telemetry readings) that tracks meter serial, phase state, client IP, idempotency key, and JSON payload.',
  },
  {
    table: 'rfid_gate_crossings',
    prompt: 'Create a multi-tenant append-only ingestion table in PostgreSQL for automated container portal crossings (rfid gate crossings) that tracks portal identifier, transponder code, client IP, idempotency key, and JSON payload.',
  },
  {
    table: 'escrow_disbursement_vouchers',
    prompt: 'Create a multi-tenant append-only ingestion table in PostgreSQL for escrow closing disbursement feeds (escrow disbursement vouchers) that tracks escrow reference, disbursement code, client IP, idempotency key, and JSON payload.',
  },
  {
    table: 'customs_duty_declarations',
    prompt: 'Create a multi-tenant append-only ingestion table in PostgreSQL for cross-border import duty notifications (customs duty declarations) that tracks entry number, tariff status, client IP, idempotency key, and JSON payload.',
  },
  {
    table: 'tollway_transponder_pings',
    prompt: 'Create a multi-tenant append-only ingestion table in PostgreSQL for automated highway transponder captures (tollway transponder pings) that tracks gantry identifier, axle class, client IP, idempotency key, and JSON payload.',
  },
  {
    table: 'intermodal_container_moves',
    prompt: 'Create a multi-tenant append-only ingestion table in PostgreSQL for port crane container movement events (intermodal container moves) that tracks crane identifier, container iso, client IP, idempotency key, and JSON payload.',
  },
  {
    table: 'automated_clearing_records',
    prompt: 'Create a multi-tenant append-only ingestion table in PostgreSQL for electronic ACH network intake events (automated clearing records) that tracks tracing number, origin routing, client IP, idempotency key, and JSON payload.',
  },

  // C2_TTF (Multi-tenant Append-only with Summary View)
  {
    table: 'general_ledger_postings',
    prompt: 'Create a multi-tenant append-only table in PostgreSQL for double-entry financial journal lines (general ledger postings) that tracks user reference, account code, entry direction, and a tenant summary view.',
  },
  {
    table: 'tax_withholding_adjustments',
    prompt: 'Create a multi-tenant append-only table in PostgreSQL for statutory tax withholding adjustments (tax withholding adjustments) that tracks user reference, jurisdiction code, tax amount, and a tenant summary view.',
  },
  {
    table: 'payroll_allocation_vouchers',
    prompt: 'Create a multi-tenant append-only table in PostgreSQL for employee payroll cost allocations (payroll allocation vouchers) that tracks user reference, department code, wage allocation, and a tenant summary view.',
  },
  {
    table: 'amortization_schedule_entries',
    prompt: 'Create a multi-tenant append-only table in PostgreSQL for loan amortization schedule adjustments (amortization schedule entries) that tracks user reference, schedule sequence, principal delta, and a tenant summary view.',
  },
  {
    table: 'depreciation_asset_journals',
    prompt: 'Create a multi-tenant append-only table in PostgreSQL for capital asset depreciation ledger lines (depreciation asset journals) that tracks user reference, asset category, book value adjustment, and a tenant summary view.',
  },
  {
    table: 'commission_payout_records',
    prompt: 'Create a multi-tenant append-only table in PostgreSQL for sales partner commission accruals (commission payout records) that tracks user reference, contract reference, commission tier, and a tenant summary view.',
  },
  {
    table: 'royalty_disbursement_ledgers',
    prompt: 'Create a multi-tenant append-only table in PostgreSQL for intellectual property royalty disbursements (royalty disbursement ledgers) that tracks user reference, license code, payout net, and a tenant summary view.',
  },
  {
    table: 'treasury_yield_accruals',
    prompt: 'Create a multi-tenant append-only table in PostgreSQL for institutional treasury yield daily accruals (treasury yield accruals) that tracks user reference, bond cusip, accrual rate, and a tenant summary view.',
  },
  {
    table: 'dividend_distribution_batches',
    prompt: 'Create a multi-tenant append-only table in PostgreSQL for corporate share dividend allocations (dividend distribution batches) that tracks user reference, share class, distribution per share, and a tenant summary view.',
  },
  {
    table: 'intercompany_settlement_journals',
    prompt: 'Create a multi-tenant append-only table in PostgreSQL for multi-subsidiary billing transfer ledgers (intercompany settlement journals) that tracks user reference, entity pair, transfer sum, and a tenant summary view.',
  },
  {
    table: 'retained_earnings_allocations',
    prompt: 'Create a multi-tenant append-only table in PostgreSQL for fiscal year-end retained earnings allocations (retained earnings allocations) that tracks user reference, fiscal period, closing balance, and a tenant summary view.',
  },
  {
    table: 'capital_expenditure_ledgers',
    prompt: 'Create a multi-tenant append-only table in PostgreSQL for audited capital expenditure project releases (capital expenditure ledgers) that tracks user reference, project code, authorized spend, and a tenant summary view.',
  },
  {
    table: 'bad_debt_writeoffs',
    prompt: 'Create a multi-tenant append-only table in PostgreSQL for uncollectible debt write-off authorization journals (bad debt writeoffs) that tracks user reference, debtor profile, written off balance, and a tenant summary view.',
  },
  {
    table: 'warranty_provision_adjustments',
    prompt: 'Create a multi-tenant append-only table in PostgreSQL for product warranty reserve liability adjustments (warranty provision adjustments) that tracks user reference, product family, reserve delta, and a tenant summary view.',
  },
  {
    table: 'revenue_recognition_journals',
    prompt: 'Create a multi-tenant append-only table in PostgreSQL for ASC-606 compliant revenue milestone recognitions (revenue recognition journals) that tracks user reference, performance obligation, recognized sum, and a tenant summary view.',
  },

  // C3_TFT (Multi-tenant Mutable Ingestion)
  {
    table: 'insurance_claim_intakes',
    prompt: 'Create a multi-tenant mutable ingestion table in PostgreSQL for insurance claim adjudication intakes (insurance claim intakes) that tracks claimant reference, policy code, received timestamp, and JSON payload.',
  },
  {
    table: 'loan_origination_packets',
    prompt: 'Create a multi-tenant mutable ingestion table in PostgreSQL for digital loan origination application intakes (loan origination packets) that tracks applicant reference, credit score, received timestamp, and JSON payload.',
  },
  {
    table: 'mortgage_underwriting_files',
    prompt: 'Create a multi-tenant mutable ingestion table in PostgreSQL for residential mortgage document packages (mortgage underwriting files) that tracks property identifier, appraisal value, received timestamp, and JSON payload.',
  },
  {
    table: 'patient_admission_tissues',
    prompt: 'Create a multi-tenant mutable ingestion table in PostgreSQL for hospital patient laboratory accession feeds (patient admission tissues) that tracks specimen barcode, clinical department, received timestamp, and JSON payload.',
  },
  {
    table: 'laboratory_specimen_manifests',
    prompt: 'Create a multi-tenant mutable ingestion table in PostgreSQL for pathology laboratory chain-of-custody manifests (laboratory specimen manifests) that tracks sample barcode, biohazard grade, received timestamp, and JSON payload.',
  },
  {
    table: 'telecom_call_detail_records',
    prompt: 'Create a multi-tenant mutable ingestion table in PostgreSQL for cellular network rating intakes (telecom call detail records) that tracks routing switch, call duration, received timestamp, and JSON payload.',
  },
  {
    table: 'utility_service_workorders',
    prompt: 'Create a multi-tenant mutable ingestion table in PostgreSQL for electrical utility field technician dispatches (utility service workorders) that tracks service premise, outage severity, received timestamp, and JSON payload.',
  },
  {
    table: 'fleet_vehicle_telematics',
    prompt: 'Create a multi-tenant mutable ingestion table in PostgreSQL for commercial trucking telematics streams (fleet vehicle telematics) that tracks vehicle vin, engine rpm, received timestamp, and JSON payload.',
  },
  {
    table: 'aircraft_flight_logs',
    prompt: 'Create a multi-tenant mutable ingestion table in PostgreSQL for commercial flight sector operational updates (aircraft flight logs) that tracks tail number, departure airport, received timestamp, and JSON payload.',
  },
  {
    table: 'railcar_switch_manifests',
    prompt: 'Create a multi-tenant mutable ingestion table in PostgreSQL for railroad marshalling yard switch manifests (railcar switch manifests) that tracks railcar initial, track destination, received timestamp, and JSON payload.',
  },
  {
    table: 'cargo_temperature_streams',
    prompt: 'Create a multi-tenant mutable ingestion table in PostgreSQL for cold-chain pharmaceutical cargo temperature readings (cargo temperature streams) that tracks sensor probe, temp reading, received timestamp, and JSON payload.',
  },
  {
    table: 'securities_trade_confirmations',
    prompt: 'Create a multi-tenant mutable ingestion table in PostgreSQL for institutional equity broker trade matching feeds (securities trade confirmations) that tracks exchange venue, exec price, received timestamp, and JSON payload.',
  },
  {
    table: 'derivative_contract_tickets',
    prompt: 'Create a multi-tenant mutable ingestion table in PostgreSQL for over-the-counter options ticket allocations (derivative contract tickets) that tracks isda counterparty, strike value, received timestamp, and JSON payload.',
  },
  {
    table: 'foreign_exchange_deals',
    prompt: 'Create a multi-tenant mutable ingestion table in PostgreSQL for currency spot deal settlement notices (foreign exchange deals) that tracks counterparty bank, base amount, received timestamp, and JSON payload.',
  },
  {
    table: 'commodity_assay_certificates',
    prompt: 'Create a multi-tenant mutable ingestion table in PostgreSQL for mineral ore concentration laboratory assays (commodity assay certificates) that tracks shipment lot, purity metric, received timestamp, and JSON payload.',
  },

  // C4_TFF (Multi-tenant Mutable)
  {
    table: 'tenant_workspace_profiles',
    prompt: 'Create a multi-tenant mutable table in PostgreSQL for customer enterprise workspace configurations (tenant workspace profiles) that tracks user reference, workspace slug, and quota limit.',
  },
  {
    table: 'subscription_pricing_plans',
    prompt: 'Create a multi-tenant mutable table in PostgreSQL for recurring billing tier definitions (subscription pricing plans) that tracks user reference, tier identifier, and monthly rate.',
  },
  {
    table: 'department_cost_centers',
    prompt: 'Create a multi-tenant mutable table in PostgreSQL for corporate accounting cost center registries (department cost centers) that tracks user reference, cost code, and fiscal budget.',
  },
  {
    table: 'employee_position_grades',
    prompt: 'Create a multi-tenant mutable table in PostgreSQL for human resources compensation salary bands (employee position grades) that tracks user reference, grade title, and base band.',
  },
  {
    table: 'vendor_procurement_contracts',
    prompt: 'Create a multi-tenant mutable table in PostgreSQL for supply chain vendor master agreements (vendor procurement contracts) that tracks user reference, vendor code, and agreement cap.',
  },
  {
    table: 'client_billing_profiles',
    prompt: 'Create a multi-tenant mutable table in PostgreSQL for recurring customer invoicing preferences (client billing profiles) that tracks user reference, billing currency, and credit days.',
  },
  {
    table: 'facility_lease_agreements',
    prompt: 'Create a multi-tenant mutable table in PostgreSQL for commercial real estate facility leases (facility lease agreements) that tracks user reference, building code, and square footage.',
  },
  {
    table: 'warehouse_bin_locations',
    prompt: 'Create a multi-tenant mutable table in PostgreSQL for fulfillment center physical storage slots (warehouse bin locations) that tracks user reference, aisle coordinate, and max capacity.',
  },
  {
    table: 'product_catalog_categories',
    prompt: 'Create a multi-tenant mutable table in PostgreSQL for e-commerce product taxonomy hierarchies (product catalog categories) that tracks user reference, category slug, and sort position.',
  },
  {
    table: 'shipping_courier_agreements',
    prompt: 'Create a multi-tenant mutable table in PostgreSQL for third-party logistics courier rate tariffs (shipping courier agreements) that tracks user reference, carrier code, and discount tier.',
  },
  {
    table: 'payment_gateway_terminals',
    prompt: 'Create a multi-tenant mutable table in PostgreSQL for electronic fund transfer payment gateways (payment gateway terminals) that tracks user reference, mid code, and daily ceiling.',
  },
  {
    table: 'crm_account_territories',
    prompt: 'Create a multi-tenant mutable table in PostgreSQL for sales distribution regional assignments (crm account territories) that tracks user reference, territory code, and quota quota.',
  },
  {
    table: 'asset_maintenance_schedules',
    prompt: 'Create a multi-tenant mutable table in PostgreSQL for heavy machinery preventative servicing plans (asset maintenance schedules) that tracks user reference, machine code, and interval hours.',
  },
  {
    table: 'tax_exemption_certificates',
    prompt: 'Create a multi-tenant mutable table in PostgreSQL for corporate sales tax waiver filings (tax exemption certificates) that tracks user reference, certificate id, and validity year.',
  },
  {
    table: 'project_milestone_deadlines',
    prompt: 'Create a multi-tenant mutable table in PostgreSQL for enterprise software delivery phase tracking (project milestone deadlines) that tracks user reference, milestone code, and estimated hours.',
  },

  // C5_FTT (Global Append-only Ingestion)
  {
    table: 'border_inspection_scans',
    prompt: 'Create a global append-only ingestion table in PostgreSQL for international border vehicle radioscopic scans (border inspection scans) that tracks checkpoint code, inspection status, received timestamp, and JSON payload.',
  },
  {
    table: 'tsa_baggage_screenings',
    prompt: 'Create a global append-only ingestion table in PostgreSQL for airport checked baggage tomography scan records (tsa baggage screenings) that tracks terminal code, resolution status, received timestamp, and JSON payload.',
  },
  {
    table: 'satellite_telemetry_frames',
    prompt: 'Create a global append-only ingestion table in PostgreSQL for low-earth orbit satellite health packet downlinks (satellite telemetry frames) that tracks spacecraft norad, bus voltage, received timestamp, and JSON payload.',
  },
  {
    table: 'weather_buoy_observations',
    prompt: 'Create a global append-only ingestion table in PostgreSQL for oceanic meteorological buoy weather observations (weather buoy observations) that tracks buoy station, wave height, received timestamp, and JSON payload.',
  },
  {
    table: 'seismic_sensor_telemetries',
    prompt: 'Create a global append-only ingestion table in PostgreSQL for global earthquake monitoring sensor telemetry packets (seismic sensor telemetries) that tracks station code, peak velocity, received timestamp, and JSON payload.',
  },
  {
    table: 'tsunami_early_warnings',
    prompt: 'Create a global append-only ingestion table in PostgreSQL for deep-ocean tsunami dart sensor pressure spikes (tsunami early warnings) that tracks pressure sensor, sea depth, received timestamp, and JSON payload.',
  },
  {
    table: 'oceanographic_sonar_pings',
    prompt: 'Create a global append-only ingestion table in PostgreSQL for maritime bathymetric seabed mapping pings (oceanographic sonar pings) that tracks vessel code, sounding depth, received timestamp, and JSON payload.',
  },
  {
    table: 'radiation_monitoring_samples',
    prompt: 'Create a global append-only ingestion table in PostgreSQL for environmental geiger radiation level monitoring readings (radiation monitoring samples) that tracks monitor code, microsievert rate, received timestamp, and JSON payload.',
  },
  {
    table: 'wildfire_thermal_detections',
    prompt: 'Create a global append-only ingestion table in PostgreSQL for satellite thermal infrared wildfire spot detections (wildfire thermal detections) that tracks sensor platform, brightness temp, received timestamp, and JSON payload.',
  },
  {
    table: 'atmospheric_ozone_soundings',
    prompt: 'Create a global append-only ingestion table in PostgreSQL for stratospheric weather balloon ozone soundings (atmospheric ozone soundings) that tracks radiosonde serial, pressure level, received timestamp, and JSON payload.',
  },
  {
    table: 'solar_flare_detections',
    prompt: 'Create a global append-only ingestion table in PostgreSQL for space weather observatory solar flare radiation spikes (solar flare detections) that tracks solar monitor, x-ray flux, received timestamp, and JSON payload.',
  },
  {
    table: 'deep_space_radio_bursts',
    prompt: 'Create a global append-only ingestion table in PostgreSQL for radio telescope fast radio burst candidate detections (deep space radio bursts) that tracks telescope array, dispersion measure, received timestamp, and JSON payload.',
  },
  {
    table: 'volcanic_ash_advisories',
    prompt: 'Create a global append-only ingestion table in PostgreSQL for civil aviation volcanic plume ash cloud advisories (volcanic ash advisories) that tracks volcano identifier, flight level, received timestamp, and JSON payload.',
  },
  {
    table: 'geomagnetic_storm_alerts',
    prompt: 'Create a global append-only ingestion table in PostgreSQL for planetary magnetosphere disturbance index telemetry (geomagnetic storm alerts) that tracks observatory code, kp index, received timestamp, and JSON payload.',
  },
  {
    table: 'polar_ice_core_readings',
    prompt: 'Create a global append-only ingestion table in PostgreSQL for antarctic ice sheet paleoclimatic sensor records (polar ice core readings) that tracks borehole station, core depth, received timestamp, and JSON payload.',
  },

  // C6_FTF (Global Append-only)
  {
    table: 'fips_cryptographic_certificates',
    prompt: 'Create a global append-only table in PostgreSQL for federal cryptographic module validation issuances (fips cryptographic certificates) that tracks user reference, module standard, security level, and validation date.',
  },
  {
    table: 'iana_protocol_registrations',
    prompt: 'Create a global append-only table in PostgreSQL for internet protocol number assignment ledgers (iana protocol registrations) that tracks user reference, protocol keyword, header value, and allocation status.',
  },
  {
    table: 'iso_currency_code_allocations',
    prompt: 'Create a global append-only table in PostgreSQL for ISO 4217 international currency code allocations (iso currency code allocations) that tracks user reference, currency alpha, numeric code, and entity name.',
  },
  {
    table: 'ieee_oui_hardware_registries',
    prompt: 'Create a global append-only table in PostgreSQL for MAC address organizationally unique identifier allocations (ieee oui hardware registries) that tracks user reference, prefix hex, manufacturer name, and assignment block.',
  },
  {
    table: 'iana_port_number_assignments',
    prompt: 'Create a global append-only table in PostgreSQL for TCP/UDP well-known transport port allocations (iana port number assignments) that tracks user reference, port number, transport proto, and service description.',
  },
  {
    table: 'nist_vulnerability_disclosures',
    prompt: 'Create a global append-only table in PostgreSQL for standardized common vulnerability reporting disclosures (nist vulnerability disclosures) that tracks user reference, cve identifier, cvss base score, and disclosure status.',
  },
  {
    table: 'cve_security_bulletins',
    prompt: 'Create a global append-only table in PostgreSQL for public vendor security advisory release entries (cve security bulletins) that tracks user reference, bulletin code, severity tier, and remediation status.',
  },
  {
    table: 'itu_country_calling_codes',
    prompt: 'Create a global append-only table in PostgreSQL for international telecommunication union telephone dialing prefixes (itu country calling codes) that tracks user reference, dialing prefix, country iso, and plan status.',
  },
  {
    table: 'un_locode_harbor_registries',
    prompt: 'Create a global append-only table in PostgreSQL for united nations maritime port geographic location codes (un locode harbor registries) that tracks user reference, location code, harbor name, and coordinate pair.',
  },
  {
    table: 'wmo_weather_station_indexes',
    prompt: 'Create a global append-only table in PostgreSQL for world meteorological organization synoptic station indexes (wmo weather station indexes) that tracks user reference, station number, elevation meters, and country code.',
  },
  {
    table: 'icao_airport_identifiers',
    prompt: 'Create a global append-only table in PostgreSQL for civil aviation navigation airport four-letter prefixes (icao airport identifiers) that tracks user reference, icao code, runway count, and elevation feet.',
  },
  {
    table: 'bic_routing_directories',
    prompt: 'Create a global append-only table in PostgreSQL for international bank identifier swift code directories (bic routing directories) that tracks user reference, bic swift, bank name, and branch code.',
  },
  {
    table: 'lei_legal_entity_identifiers',
    prompt: 'Create a global append-only table in PostgreSQL for global financial legal entity identifier registrations (lei legal entity identifiers) that tracks user reference, lei code, legal name, and jurisdiction iso.',
  },
  {
    table: 'isin_financial_instrument_codes',
    prompt: 'Create a global append-only table in PostgreSQL for international securities identification number issuances (isin financial instrument codes) that tracks user reference, isin string, issuer ticker, and security type.',
  },
  {
    table: 'dns_root_zone_anchors',
    prompt: 'Create a global append-only table in PostgreSQL for internet domain name root cryptographic trust anchors (dns root zone anchors) that tracks user reference, key tag, algorithm code, and digest hex.',
  },

  // C7_FFT (Global Mutable Ingestion)
  {
    table: 'global_fx_spot_ticks',
    prompt: 'Create a global mutable ingestion table in PostgreSQL for interbank foreign exchange currency price ticks (global fx spot ticks) that tracks currency pair, bid price, received timestamp, and JSON payload.',
  },
  {
    table: 'crypto_liquidity_depth_snapshots',
    prompt: 'Create a global mutable ingestion table in PostgreSQL for decentralized cryptocurrency exchange liquidity depth feeds (crypto liquidity depth snapshots) that tracks market pair, pool depth, received timestamp, and JSON payload.',
  },
  {
    table: 'treasury_bill_benchmarks',
    prompt: 'Create a global mutable ingestion table in PostgreSQL for government sovereign treasury yield curve daily fixes (treasury bill benchmarks) that tracks maturity month, yield decimal, received timestamp, and JSON payload.',
  },
  {
    table: 'crude_oil_pipeline_meters',
    prompt: 'Create a global mutable ingestion table in PostgreSQL for petroleum transmission pipeline automated flow meters (crude oil pipeline meters) that tracks pipeline segment, barrel count, received timestamp, and JSON payload.',
  },
  {
    table: 'natural_gas_hub_flows',
    prompt: 'Create a global mutable ingestion table in PostgreSQL for interstate natural gas compressor station flow monitors (natural gas hub flows) that tracks compressor hub, mmbtu volume, received timestamp, and JSON payload.',
  },
  {
    table: 'electric_grid_frequency_meters',
    prompt: 'Create a global mutable ingestion table in PostgreSQL for continental electric transmission grid frequency monitors (electric grid frequency meters) that tracks substation code, hertz reading, received timestamp, and JSON payload.',
  },
  {
    table: 'renewable_wind_farm_outputs',
    prompt: 'Create a global mutable ingestion table in PostgreSQL for utility-scale wind generation turbine telemetry feeds (renewable wind farm outputs) that tracks turbine cluster, megawatt output, received timestamp, and JSON payload.',
  },
  {
    table: 'hydroelectric_dam_discharges',
    prompt: 'Create a global mutable ingestion table in PostgreSQL for river reservoir water spillway automated discharge gauges (hydroelectric dam discharges) that tracks dam facility, cubic flow, received timestamp, and JSON payload.',
  },
  {
    table: 'nuclear_reactor_thermal_outputs',
    prompt: 'Create a global mutable ingestion table in PostgreSQL for nuclear power station core thermal power telemetry feeds (nuclear reactor thermal outputs) that tracks reactor unit, thermal megawatts, received timestamp, and JSON payload.',
  },
  {
    table: 'bulk_shipping_freight_indexes',
    prompt: 'Create a global mutable ingestion table in PostgreSQL for dry bulk ocean shipping route daily freight index valuations (bulk shipping freight indexes) that tracks route code, index points, received timestamp, and JSON payload.',
  },
  {
    table: 'container_freight_rate_quotes',
    prompt: 'Create a global mutable ingestion table in PostgreSQL for ocean shipping 40ft container spot rate market feeds (container freight rate quotes) that tracks port corridor, feu rate, received timestamp, and JSON payload.',
  },
  {
    table: 'wholesale_electricity_prices',
    prompt: 'Create a global mutable ingestion table in PostgreSQL for day-ahead wholesale electricity locational marginal pricing feeds (wholesale electricity prices) that tracks pricing node, lmp per mwh, received timestamp, and JSON payload.',
  },
  {
    table: 'carbon_credit_auction_clears',
    prompt: 'Create a global mutable ingestion table in PostgreSQL for compliance carbon emissions credit auction settlement feeds (carbon credit auction clears) that tracks auction vintage, clear price, received timestamp, and JSON payload.',
  },
  {
    table: 'precious_metals_spot_fixes',
    prompt: 'Create a global mutable ingestion table in PostgreSQL for physical gold and silver bullion benchmark daily price fixes (precious metals spot fixes) that tracks metal symbol, fixing price, received timestamp, and JSON payload.',
  },
  {
    table: 'agricultural_grain_futures',
    prompt: 'Create a global mutable ingestion table in PostgreSQL for agricultural commodity elevator spot delivery price feeds (agricultural grain futures) that tracks grain grade, bushel price, received timestamp, and JSON payload.',
  },

  // C8_FFF (Global Mutable)
  {
    table: 'global_compliance_standards',
    prompt: 'Create a global mutable table in PostgreSQL for international regulatory security framework benchmarks (global compliance standards) that tracks standard code, version tag, and audit status.',
  },
  {
    table: 'international_sanction_lists',
    prompt: 'Create a global mutable table in PostgreSQL for multinational trade embargo individual designation lists (international sanction lists) that tracks target reference, authority code, and designation tier.',
  },
  {
    table: 'maritime_shipping_corridors',
    prompt: 'Create a global mutable table in PostgreSQL for international maritime navigation sea lane passage definitions (maritime shipping corridors) that tracks corridor code, transit length, and traffic density.',
  },
  {
    table: 'sovereign_debt_ratings',
    prompt: 'Create a global mutable table in PostgreSQL for credit rating agency sovereign credit score registries (sovereign debt ratings) that tracks country code, agency code, and rating grade.',
  },
  {
    table: 'aviation_navigation_waypoints',
    prompt: 'Create a global mutable table in PostgreSQL for global airspace fix waypoint navigational coordinates (aviation navigation waypoints) that tracks waypoint fix, airspace sector, and altitude floor.',
  },
  {
    table: 'telecom_frequency_bands',
    prompt: 'Create a global mutable table in PostgreSQL for international radio spectrum band allocation registries (telecom frequency bands) that tracks band designation, frequency mhz, and service type.',
  },
  {
    table: 'satellite_orbital_slots',
    prompt: 'Create a global mutable table in PostgreSQL for geostationary equatorial orbital arc slot reservations (satellite orbital slots) that tracks slot longitude, orbital regime, and operator code.',
  },
  {
    table: 'cross_border_tariff_schedules',
    prompt: 'Create a global mutable table in PostgreSQL for preferential international trade agreement duty schedules (cross_border tariff schedules) that tracks agreement code, commodity heading, and tariff rate.',
  },
  {
    table: 'customs_harmonized_codes',
    prompt: 'Create a global mutable table in PostgreSQL for world customs organization 6-digit tariff product codes (customs harmonized codes) that tracks hs code, chapter title, and duty regime.',
  },
  {
    table: 'patent_classification_hierarchies',
    prompt: 'Create a global mutable table in PostgreSQL for cooperative patent classification technology group indexes (patent classification hierarchies) that tracks classification code, section letter, and group level.',
  },
  {
    table: 'un_standard_product_classifications',
    prompt: 'Create a global mutable table in PostgreSQL for global product and service taxonomy coding dictionaries (un standard product classifications) that tracks unspsc code, commodity title, and segment code.',
  },
  {
    table: 'global_time_zone_definitions',
    prompt: 'Create a global mutable table in PostgreSQL for IANA astronomical daylight saving time offset registries (global time zone definitions) that tracks timezone name, utc offset, and abbrev code.',
  },
  {
    table: 'treaty_jurisdiction_agreements',
    prompt: 'Create a global mutable table in PostgreSQL for multilateral legal dispute arbitration treaty agreements (treaty jurisdiction agreements) that tracks treaty code, depository nation, and member count.',
  },
  {
    table: 'central_bank_policy_targets',
    prompt: 'Create a global mutable table in PostgreSQL for monetary authority inflation and benchmark rate target guidelines (central bank policy targets) that tracks bank acronym, target rate, and review cycle.',
  },
  {
    table: 'diplomatic_mission_registries',
    prompt: 'Create a global mutable table in PostgreSQL for sovereign foreign embassy and consular mission accreditation registries (diplomatic mission registries) that tracks mission code, host country, and mission rank.',
  },
];

function buildGoldenSql(cohortId, table) {
  const t = table;
  if (cohortId === 'C1_TTT') {
    return `CREATE TABLE public.${t} (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  supersedes_id uuid NULL,
  idempotency_key text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  sample_count integer NOT NULL DEFAULT 0,
  item_code text NOT NULL,
  metric_value integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ${t}_pkey PRIMARY KEY (id),
  CONSTRAINT fk_${t}_tenant_id FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
  CONSTRAINT fk_${t}_supersedes_id FOREIGN KEY (supersedes_id) REFERENCES public.${t} (id) ON DELETE RESTRICT,
  CONSTRAINT chk_${t}_sample_count CHECK (sample_count >= 0),
  CONSTRAINT chk_${t}_metric_value CHECK (metric_value >= 0),
  CONSTRAINT uq_${t}_tenant_id_idempotency_key UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX idx_${t}_tenant_id_created_at ON public.${t} (tenant_id, created_at DESC);
CREATE INDEX idx_${t}_supersedes_id ON public.${t} (supersedes_id);

CREATE OR REPLACE FUNCTION public.fn_${t}_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Update/Delete operation rejected on audit log' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER trg_${t}_reject_mutation
BEFORE UPDATE OR DELETE ON public.${t}
FOR EACH ROW
EXECUTE FUNCTION public.fn_${t}_reject_mutation();

CREATE OR REPLACE FUNCTION public.fn_${t}_force_received_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.received_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_${t}_force_received_at
BEFORE INSERT ON public.${t}
FOR EACH ROW
EXECUTE FUNCTION public.fn_${t}_force_received_at();

ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.${t} FORCE ROW LEVEL SECURITY;

CREATE POLICY pol_${t}_tenant_select ON public.${t}
  FOR SELECT TO application, readonly_user
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_${t}_tenant_insert ON public.${t}
  FOR INSERT TO application
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

REVOKE ALL ON TABLE public.${t} FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT ON TABLE public.${t} TO application;
GRANT SELECT ON TABLE public.${t} TO readonly_user;`;
  }

  if (cohortId === 'C2_TTF') {
    return `CREATE TABLE public.${t} (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  supersedes_id uuid NULL,
  item_code text NOT NULL,
  metric_value integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ${t}_pkey PRIMARY KEY (id),
  CONSTRAINT fk_${t}_tenant_id FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
  CONSTRAINT fk_${t}_user_id FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_${t}_supersedes_id FOREIGN KEY (supersedes_id) REFERENCES public.${t} (id) ON DELETE RESTRICT,
  CONSTRAINT chk_${t}_metric_value CHECK (metric_value >= 0)
);
CREATE INDEX idx_${t}_tenant_id_created_at ON public.${t} (tenant_id, created_at DESC);
CREATE INDEX idx_${t}_user_id ON public.${t} (user_id);
CREATE INDEX idx_${t}_supersedes_id ON public.${t} (supersedes_id);

CREATE OR REPLACE FUNCTION public.fn_${t}_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Update/Delete operation rejected on audit log' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER trg_${t}_reject_mutation
BEFORE UPDATE OR DELETE ON public.${t}
FOR EACH ROW
EXECUTE FUNCTION public.fn_${t}_reject_mutation();

ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.${t} FORCE ROW LEVEL SECURITY;

CREATE POLICY pol_${t}_tenant_select ON public.${t}
  FOR SELECT TO application, readonly_user
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_${t}_tenant_insert ON public.${t}
  FOR INSERT TO application
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE VIEW public.v_${t}_summary WITH (security_invoker = true) AS
  SELECT id, tenant_id, created_at
  FROM public.${t};

GRANT SELECT ON public.v_${t}_summary TO application, readonly_user;
REVOKE ALL ON TABLE public.${t} FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT ON TABLE public.${t} TO application;
GRANT SELECT ON TABLE public.${t} TO readonly_user;`;
  }

  if (cohortId === 'C3_TFT') {
    return `CREATE TABLE public.${t} (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  sample_count integer NOT NULL DEFAULT 0,
  item_code text NOT NULL,
  metric_value integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT ${t}_pkey PRIMARY KEY (id),
  CONSTRAINT fk_${t}_tenant_id FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
  CONSTRAINT chk_${t}_sample_count CHECK (sample_count >= 0),
  CONSTRAINT chk_${t}_metric_value CHECK (metric_value >= 0),
  CONSTRAINT uq_${t}_tenant_id_idempotency_key UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX idx_${t}_tenant_id_created_at ON public.${t} (tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.fn_${t}_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_${t}_set_updated_at
BEFORE UPDATE ON public.${t}
FOR EACH ROW
EXECUTE FUNCTION public.fn_${t}_set_updated_at();

CREATE OR REPLACE FUNCTION public.fn_${t}_force_received_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.received_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_${t}_force_received_at
BEFORE INSERT ON public.${t}
FOR EACH ROW
EXECUTE FUNCTION public.fn_${t}_force_received_at();

ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.${t} FORCE ROW LEVEL SECURITY;

CREATE POLICY pol_${t}_tenant_select ON public.${t}
  FOR SELECT TO application, readonly_user
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_${t}_tenant_insert ON public.${t}
  FOR INSERT TO application
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_${t}_tenant_update ON public.${t}
  FOR UPDATE TO application
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  )
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_${t}_tenant_delete ON public.${t}
  FOR DELETE TO application
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

REVOKE ALL ON TABLE public.${t} FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.${t} TO application;
GRANT SELECT ON TABLE public.${t} TO readonly_user;`;
  }

  if (cohortId === 'C4_TFF') {
    return `CREATE TABLE public.${t} (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  item_code text NOT NULL,
  metric_value integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT ${t}_pkey PRIMARY KEY (id),
  CONSTRAINT fk_${t}_tenant_id FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
  CONSTRAINT fk_${t}_user_id FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE RESTRICT,
  CONSTRAINT chk_${t}_metric_value CHECK (metric_value >= 0)
);
CREATE INDEX idx_${t}_tenant_id_created_at ON public.${t} (tenant_id, created_at DESC);
CREATE INDEX idx_${t}_user_id ON public.${t} (user_id);

CREATE OR REPLACE FUNCTION public.fn_${t}_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_${t}_set_updated_at
BEFORE UPDATE ON public.${t}
FOR EACH ROW
EXECUTE FUNCTION public.fn_${t}_set_updated_at();

ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.${t} FORCE ROW LEVEL SECURITY;

CREATE POLICY pol_${t}_tenant_select ON public.${t}
  FOR SELECT TO application, readonly_user
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_${t}_tenant_insert ON public.${t}
  FOR INSERT TO application
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_${t}_tenant_update ON public.${t}
  FOR UPDATE TO application
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  )
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_${t}_tenant_delete ON public.${t}
  FOR DELETE TO application
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

REVOKE ALL ON TABLE public.${t} FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.${t} TO application;
GRANT SELECT ON TABLE public.${t} TO readonly_user;`;
  }

  if (cohortId === 'C5_FTT') {
    return `CREATE TABLE public.${t} (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  supersedes_id uuid NULL,
  idempotency_key text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  sample_count integer NOT NULL DEFAULT 0,
  item_code text NOT NULL,
  metric_value integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ${t}_pkey PRIMARY KEY (id),
  CONSTRAINT fk_${t}_supersedes_id FOREIGN KEY (supersedes_id) REFERENCES public.${t} (id) ON DELETE RESTRICT,
  CONSTRAINT chk_${t}_sample_count CHECK (sample_count >= 0),
  CONSTRAINT chk_${t}_metric_value CHECK (metric_value >= 0),
  CONSTRAINT uq_${t}_idempotency_key UNIQUE (idempotency_key)
);
CREATE INDEX idx_${t}_supersedes_id ON public.${t} (supersedes_id);

CREATE OR REPLACE FUNCTION public.fn_${t}_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Update/Delete operation rejected on audit log' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER trg_${t}_reject_mutation
BEFORE UPDATE OR DELETE ON public.${t}
FOR EACH ROW
EXECUTE FUNCTION public.fn_${t}_reject_mutation();

CREATE OR REPLACE FUNCTION public.fn_${t}_force_received_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.received_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_${t}_force_received_at
BEFORE INSERT ON public.${t}
FOR EACH ROW
EXECUTE FUNCTION public.fn_${t}_force_received_at();

REVOKE ALL ON TABLE public.${t} FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT ON TABLE public.${t} TO application;
GRANT SELECT ON TABLE public.${t} TO readonly_user;`;
  }

  if (cohortId === 'C6_FTF') {
    return `CREATE TABLE public.${t} (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  supersedes_id uuid NULL,
  item_code text NOT NULL,
  metric_value integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ${t}_pkey PRIMARY KEY (id),
  CONSTRAINT fk_${t}_user_id FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_${t}_supersedes_id FOREIGN KEY (supersedes_id) REFERENCES public.${t} (id) ON DELETE RESTRICT,
  CONSTRAINT chk_${t}_metric_value CHECK (metric_value >= 0)
);
CREATE INDEX idx_${t}_user_id ON public.${t} (user_id);
CREATE INDEX idx_${t}_supersedes_id ON public.${t} (supersedes_id);

CREATE OR REPLACE FUNCTION public.fn_${t}_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Update/Delete operation rejected on audit log' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER trg_${t}_reject_mutation
BEFORE UPDATE OR DELETE ON public.${t}
FOR EACH ROW
EXECUTE FUNCTION public.fn_${t}_reject_mutation();

REVOKE ALL ON TABLE public.${t} FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT ON TABLE public.${t} TO application;
GRANT SELECT ON TABLE public.${t} TO readonly_user;`;
  }

  if (cohortId === 'C7_FFT') {
    return `CREATE TABLE public.${t} (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  sample_count integer NOT NULL DEFAULT 0,
  item_code text NOT NULL,
  metric_value integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT ${t}_pkey PRIMARY KEY (id),
  CONSTRAINT chk_${t}_sample_count CHECK (sample_count >= 0),
  CONSTRAINT chk_${t}_metric_value CHECK (metric_value >= 0),
  CONSTRAINT uq_${t}_idempotency_key UNIQUE (idempotency_key)
);

CREATE OR REPLACE FUNCTION public.fn_${t}_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_${t}_set_updated_at
BEFORE UPDATE ON public.${t}
FOR EACH ROW
EXECUTE FUNCTION public.fn_${t}_set_updated_at();

CREATE OR REPLACE FUNCTION public.fn_${t}_force_received_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.received_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_${t}_force_received_at
BEFORE INSERT ON public.${t}
FOR EACH ROW
EXECUTE FUNCTION public.fn_${t}_force_received_at();

REVOKE ALL ON TABLE public.${t} FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.${t} TO application;
GRANT SELECT ON TABLE public.${t} TO readonly_user;`;
  }

  if (cohortId === 'C8_FFF') {
    return `CREATE TABLE public.${t} (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  item_code text NOT NULL,
  metric_value integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT ${t}_pkey PRIMARY KEY (id),
  CONSTRAINT chk_${t}_metric_value CHECK (metric_value >= 0)
);

CREATE OR REPLACE FUNCTION public.fn_${t}_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_${t}_set_updated_at
BEFORE UPDATE ON public.${t}
FOR EACH ROW
EXECUTE FUNCTION public.fn_${t}_set_updated_at();

REVOKE ALL ON TABLE public.${t} FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.${t} TO application;
GRANT SELECT ON TABLE public.${t} TO readonly_user;`;
  }

  throw new Error(`Unknown cohort: ${cohortId}`);
}

async function main() {
  console.log('[v3-tasks] Reading fixtures/task-v2/tasks.json...');
  const v2Tasks = JSON.parse(fs.readFileSync('fixtures/task-v2/tasks.json', 'utf8'));

  const cohorts = [
    { id: 'C1_TTT', tenant: true, append_only: true, ingestion: true, view: false },
    { id: 'C2_TTF', tenant: true, append_only: true, ingestion: false, view: true },
    { id: 'C3_TFT', tenant: true, append_only: false, ingestion: true, view: false },
    { id: 'C4_TFF', tenant: true, append_only: false, ingestion: false, view: false },
    { id: 'C5_FTT', tenant: false, append_only: true, ingestion: true, view: false },
    { id: 'C6_FTF', tenant: false, append_only: true, ingestion: false, view: false },
    { id: 'C7_FFT', tenant: false, append_only: false, ingestion: true, view: false },
    { id: 'C8_FFF', tenant: false, append_only: false, ingestion: false, view: false },
  ];

  const generatedTestTasks = [];
  let specIndex = 0;

  for (let cIdx = 0; cIdx < cohorts.length; cIdx++) {
    const cohort = cohorts[cIdx];
    const applicable = APPLICABLE_BY_COHORT[cohort.id];

    for (let taskIdx = 0; taskIdx < 15; taskIdx++) {
      const globalIdx = cIdx * 15 + taskIdx + 1;
      const taskId = `V3-H-${String(globalIdx).padStart(3, '0')}`;
      const spec = TEST_SPECS[specIndex++];
      const goldenSql = buildGoldenSql(cohort.id, spec.table);
      const boundFacts = selectBoundFacts(taskId, applicable, R2_CANDIDATES);

      generatedTestTasks.push({
        id: taskId,
        split: 'test',
        cohortId: cohort.id,
        table: spec.table,
        prompt: spec.prompt,
        features: {
          tenant: cohort.tenant,
          append_only: cohort.append_only,
          ingestion: cohort.ingestion,
          status: false,
          view: cohort.view,
          sec_definer: false,
          latest_per_key: false,
        },
        applicableFacts: applicable,
        goldenSql,
        boundFacts,
        invalidBoundFacts: [],
      });
    }
  }

  const v3Data = {
    train: v2Tasks.train,
    dev: v2Tasks.dev,
    test: generatedTestTasks,
  };

  const outPath = path.resolve('fixtures/task-v3/tasks.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(v3Data, null, 2) + '\n');
  console.log(`[v3-tasks] Wrote ${v3Data.train.length} train, ${v3Data.dev.length} dev, ${v3Data.test.length} test tasks to ${outPath}`);

  // Live PostgreSQL 16 Oracle validation against all 120 generated reference solutions
  console.log('[v3-tasks] Starting PostgreSQL 16 Oracle validation on 120 held-out golden reference solutions...');
  const containerName = `axiom-v3-tasks-gate-${Date.now()}`;
  startPostgresContainer(containerName);

  let passed = 0;
  let failed = 0;
  const failures = [];

  try {
    for (let i = 0; i < generatedTestTasks.length; i++) {
      const task = generatedTestTasks[i];
      const meta = {
        table: task.table,
        tenant: task.features.tenant,
        append_only: task.features.append_only,
        ingestion: task.features.ingestion,
        view: task.features.view,
        status: false,
        sec_definer: false,
        latest_per_key: false,
      };

      const report = evaluateMigrationSqlInContainer(containerName, task.goldenSql, meta, task.id);
      if (report.pass) {
        passed++;
        if ((i + 1) % 20 === 0 || i === generatedTestTasks.length - 1) {
          console.log(`[v3-tasks] Oracle progress: ${i + 1} / 120 tasks verified... (All PASS so far)`);
        }
      } else {
        failed++;
        failures.push({
          taskId: task.id,
          cohortId: task.cohortId,
          table: task.table,
          failedFacts: report.failedFacts,
          details: report.details,
        });
        console.error(`[v3-tasks] FAIL on ${task.id} (${task.table}):`, report.failedFacts);
      }
    }
  } finally {
    stopPostgresContainer(containerName);
  }

  console.log(`\n==================================================`);
  console.log(`ORACLE VALIDATION SUMMARY FOR 120 V3-H-* TEST TASKS`);
  console.log(`==================================================`);
  console.log(`Total Tasks Evaluated: 120`);
  console.log(`Passed:                ${passed} / 120 (${((passed / 120) * 100).toFixed(1)}%)`);
  console.log(`Failed:                ${failed}`);

  if (failed > 0) {
    console.error('Failure report:', JSON.stringify(failures, null, 2));
    process.exit(1);
  }

  console.log('STATUS: 120 / 120 PASS (100.0%) WITH ZERO FAILED FACTS!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
