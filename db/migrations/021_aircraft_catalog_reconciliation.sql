-- Forward-only reconciliation of the aircraft evidence catalog corrected by issue #133.
-- Fresh migration-only databases remain empty until the explicit seed job.
-- Migration 020 remains immutable and independently addressable.
DO $vector_aircraft_catalog_021$
BEGIN
  IF (
    (SELECT count(*) FROM sources WHERE id IN ('lockheed-paf-f16-2009','federal-register-paf-f16-2006','dsca-pakistan-15-80','crs-pakistan-f16-rl31675','us-congress-paf-amraam-2008')) = 0
    AND (SELECT count(*) FROM subsystems WHERE id IN ('al-31fp','su30-datalink','f100-pw-229','apg-68v9','alq-211v9','link-16')) = 0
    AND (SELECT count(*) FROM platform_variants WHERE id IN ('su-30mki','f-16c-block52-paf','f-16d-block52-paf','mirage-2000h')) = 0
    AND (SELECT count(*) FROM platform_weapon_compatibility WHERE platform_id IN ('su-30mki','f-16c-block52-paf','f-16d-block52-paf','mirage-2000h')) = 0
    AND (SELECT count(*) FROM source_assertions WHERE entity_type='PLATFORM' AND entity_id IN ('su-30mki','f-16c-block52-paf','f-16d-block52-paf','mirage-2000h')) = 0
  ) OR (
    (SELECT count(*) FROM sources WHERE id IN ('lockheed-paf-f16-2009','federal-register-paf-f16-2006','dsca-pakistan-15-80','crs-pakistan-f16-rl31675','us-congress-paf-amraam-2008')) = 5
    AND NOT EXISTS (
      SELECT 1 FROM (VALUES
      ('lockheed-paf-f16-2009','First new F-16 Block 52 for Pakistan','Lockheed Martin','https://news.lockheedmartin.com/2009-10-13-Lockheed-Martin-Unveils-First-New-F-16-for-Pakistan-in-Ceremony-Attended-by-Air-Force-Chiefs','2009-10-13T00:00:00Z'::timestamptz,'MANUFACTURER','Identifies Peace Drive I as 12 F-16C and 6 F-16D Block 52 aircraft and associates the programme with F100-PW-229 engines. It is categorical catalog context, not performance evidence.'),
      ('federal-register-paf-f16-2006','Pakistan F-16C/D Block 50/52 aircraft programme notice','United States Federal Register / Government Publishing Office','https://www.govinfo.gov/content/pkg/FR-2006-07-11/pdf/FR-2006-07-11.pdf','2006-07-11T00:00:00Z'::timestamptz,'OFFICIAL','Associates the requested programme with APG-68(V)9, Link 16, AIM-120C-5 and LAU-129/A. It does not prove final delivered fit or supply runtime authority.'),
      ('dsca-pakistan-15-80','Pakistan F-16 Block 52 aircraft package, Transmittal 15-80','Defense Security Cooperation Agency','https://www.dsca.mil/Press-Media/Major-Arms-Sales/Major-Arms-Sales-Library/igphoto/2003606313','2016-02-12T00:00:00Z'::timestamptz,'OFFICIAL','Separate 2016 proposed sale that expired without acceptance. It is quarantined and cannot establish delivered Peace Drive I fit or runtime authority.'),
      ('crs-pakistan-f16-rl31675','Pakistan-U.S. relations and F-16 transaction history','Congressional Research Service','https://www.congress.gov/crs_external_products/RL/HTML/RL31675.web.html',NULL::timestamptz,'OFFICIAL','Reviewed as the transaction-state basis for quarantining the 2016 proposal. The dynamic locator has no approved immutable artifact hash and cannot support runtime admission.'),
      ('us-congress-paf-amraam-2008','Pakistan F-16 program status and munitions package','United States Congress / U.S. Government Publishing Office','https://www.govinfo.gov/content/pkg/GOVPUB-Y4_F76_1-PURL-LPS106730/pdf/GOVPUB-Y4_F76_1-PURL-LPS106730.pdf','2008-09-16T00:00:00Z'::timestamptz,'OFFICIAL','Records the F-16C/D Block 52 programme and AIM-120C-5 association. It is categorical programme context, not station, loadout, guidance, or performance authority.')
    ) AS expected(id,title,publisher,url,published_at,source_class,notes)
      LEFT JOIN sources current ON current.id=expected.id
      WHERE current.id IS NULL
         OR current.id IS DISTINCT FROM expected.id
         OR current.title IS DISTINCT FROM expected.title
         OR current.publisher IS DISTINCT FROM expected.publisher
         OR current.url IS DISTINCT FROM expected.url
         OR current.published_at IS DISTINCT FROM expected.published_at
         OR current.source_class IS DISTINCT FROM expected.source_class
         OR current.notes IS DISTINCT FROM expected.notes
    )
  )
  AND (
    (SELECT count(*) FROM subsystems WHERE id IN ('al-31fp','su30-datalink','f100-pw-229','apg-68v9','alq-211v9','link-16')) = 5
    AND NOT EXISTS (
      SELECT 1 FROM (VALUES
      ('al-31fp','ENGINE','AL-31FP',NULL::text,'Twin-engine installation on the Su-30MKI.','["pib-su30-engine-2024"]'::jsonb,'CONTEXT_ONLY'),
      ('su30-datalink','DATALINK','Weapon-update data link',NULL::text,'Astra integration context does not establish an admitted aircraft data-link model.','["drdo-astra-2019"]'::jsonb,'CONTEXT_ONLY'),
      ('f100-pw-229','ENGINE','F100-PW-229','Pratt & Whitney','F100-PW-229 is associated categorically with the delivered Peace Drive I programme; no engine map or performance authority is admitted.','["lockheed-paf-f16-2009"]'::jsonb,'CONTEXT_ONLY'),
      ('apg-68v9','RADAR','AN/APG-68(V)9',NULL::text,'APG-68(V)9 appears in the 2006 requested programme context; final delivered fit and sensor performance are not established.','["federal-register-paf-f16-2006"]'::jsonb,'CONTEXT_ONLY'),
      ('link-16','DATALINK','Link 16',NULL::text,'Link 16 appears in the 2006 requested programme context; final delivered fit and data-link behavior are not established.','["federal-register-paf-f16-2006"]'::jsonb,'CONTEXT_ONLY')
    ) AS expected(id,kind,designation,manufacturer,description,source_ids,data_status)
      LEFT JOIN subsystems current ON current.id=expected.id
      WHERE current.id IS NULL
         OR current.id IS DISTINCT FROM expected.id
         OR current.kind IS DISTINCT FROM expected.kind
         OR current.designation IS DISTINCT FROM expected.designation
         OR current.manufacturer IS DISTINCT FROM expected.manufacturer
         OR current.description IS DISTINCT FROM expected.description
         OR current.source_ids IS DISTINCT FROM expected.source_ids
         OR current.data_status IS DISTINCT FROM expected.data_status
    )
  )
  AND (
    (SELECT count(*) FROM platform_variants WHERE id IN ('su-30mki','f-16c-block52-paf','f-16d-block52-paf','mirage-2000h')) = 4
    AND NOT EXISTS (
      SELECT 1 FROM (VALUES
      ('su-30mki','IAF','India','Su-30','MKI','Su-30MKI','Blue fighter / launch platform',2::integer,'["al-31fp","al-31fp"]'::jsonb,'bars-radar','su30-ew','su30-datalink',NULL::text,NULL::text,'["A2A","A2G"]'::jsonb,'[{"quantity":2,"status":"MODEL_ASSUMPTION","weaponId":"astra-mk1"}]'::jsonb,'["pib-astra-contract-2022","pib-su30-engine-2024"]'::jsonb,'PARTIAL'),
      ('f-16c-block52-paf','PAF','Pakistan','F-16','F-16C Block 52 Peace Drive I','F-16C Block 52','Red fighter / opposing track',1::integer,'["f100-pw-229"]'::jsonb,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,'["A2A","A2G","G2A"]'::jsonb,'[{"quantity":2,"status":"MODEL_ASSUMPTION","weaponId":"aim-120c5"}]'::jsonb,'["lockheed-paf-f16-2009","federal-register-paf-f16-2006","us-congress-paf-amraam-2008"]'::jsonb,'PARTIAL'),
      ('f-16d-block52-paf','PAF','Pakistan','F-16','F-16D Block 52 Peace Drive I','F-16D Block 52','Public-reference catalog only; not scenario-selectable',2::integer,'["f100-pw-229"]'::jsonb,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,'["A2A","A2G","G2A"]'::jsonb,'[]'::jsonb,'["lockheed-paf-f16-2009","federal-register-paf-f16-2006"]'::jsonb,'PARTIAL'),
      ('mirage-2000h','IAF','India','Mirage 2000','H','Mirage 2000H','Blue fighter',NULL::integer,'[]'::jsonb,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,'["A2A","A2G"]'::jsonb,'[{"quantity":2,"status":"MODEL_ASSUMPTION","weaponId":"mica-ir"}]'::jsonb,'[]'::jsonb,'UNKNOWN')
    ) AS expected(id,service,country,family,variant,display_name,role,crew,engine_ids,radar_id,ew_id,datalink_id,rwr_id,countermeasure_id,domains,default_loadout,source_ids,data_status)
      LEFT JOIN platform_variants current ON current.id=expected.id
      WHERE current.id IS NULL
         OR current.id IS DISTINCT FROM expected.id
         OR current.service IS DISTINCT FROM expected.service
         OR current.country IS DISTINCT FROM expected.country
         OR current.family IS DISTINCT FROM expected.family
         OR current.variant IS DISTINCT FROM expected.variant
         OR current.display_name IS DISTINCT FROM expected.display_name
         OR current.role IS DISTINCT FROM expected.role
         OR current.crew IS DISTINCT FROM expected.crew
         OR current.engine_ids IS DISTINCT FROM expected.engine_ids
         OR current.radar_id IS DISTINCT FROM expected.radar_id
         OR current.ew_id IS DISTINCT FROM expected.ew_id
         OR current.datalink_id IS DISTINCT FROM expected.datalink_id
         OR current.rwr_id IS DISTINCT FROM expected.rwr_id
         OR current.countermeasure_id IS DISTINCT FROM expected.countermeasure_id
         OR current.domains IS DISTINCT FROM expected.domains
         OR current.default_loadout IS DISTINCT FROM expected.default_loadout
         OR current.source_ids IS DISTINCT FROM expected.source_ids
         OR current.data_status IS DISTINCT FROM expected.data_status
    )
  )
  AND (
    (SELECT count(*) FROM platform_weapon_compatibility WHERE platform_id IN ('su-30mki','f-16c-block52-paf','f-16d-block52-paf','mirage-2000h')) = 3
    AND NOT EXISTS (
      SELECT 1 FROM (VALUES
      ('su-30mki','astra-mk1','CATALOGED_LOADOUT','["pib-astra-contract-2022","pib-su30-engine-2024"]'::jsonb,'UNVERIFIED'),
      ('f-16c-block52-paf','aim-120c5','CATALOGED_LOADOUT','["lockheed-paf-f16-2009","federal-register-paf-f16-2006","us-congress-paf-amraam-2008"]'::jsonb,'UNVERIFIED'),
      ('mirage-2000h','mica-ir','CATALOGED_LOADOUT','[]'::jsonb,'UNVERIFIED')
    ) AS expected(platform_id,weapon_id,station_group,source_ids,status)
      LEFT JOIN platform_weapon_compatibility current ON current.platform_id=expected.platform_id AND current.weapon_id=expected.weapon_id AND current.station_group=expected.station_group
      WHERE current.platform_id IS NULL
         OR current.platform_id IS DISTINCT FROM expected.platform_id
         OR current.weapon_id IS DISTINCT FROM expected.weapon_id
         OR current.station_group IS DISTINCT FROM expected.station_group
         OR current.source_ids IS DISTINCT FROM expected.source_ids
         OR current.status IS DISTINCT FROM expected.status
    )
  )
  AND (
    (SELECT count(*) FROM source_assertions WHERE entity_type='PLATFORM' AND entity_id IN ('su-30mki','f-16c-block52-paf','f-16d-block52-paf','mirage-2000h')) = 12
    AND NOT EXISTS (
      SELECT 1 FROM (VALUES
      ('su-30mki-fact-0-pib-astra-contract-2022','PLATFORM','su-30mki','publicFacts.0','Fully integrated on Su-30MKI',NULL::text,'Astra integration','pib-astra-contract-2022',0.65::double precision,'CONTEXT_ONLY'),
      ('su-30mki-fact-1-pib-su30-engine-2024','PLATFORM','su-30mki','publicFacts.1','2 × AL-31FP',NULL::text,'Engine installation','pib-su30-engine-2024',0.65::double precision,'CONTEXT_ONLY'),
      ('f-16c-block52-paf-fact-0-lockheed-paf-f16-2009','PLATFORM','f-16c-block52-paf','publicFacts.0','12 delivered single-seat aircraft',NULL::text,'Peace Drive I identity','lockheed-paf-f16-2009',0.95::double precision,'ACCEPTED'),
      ('f-16c-block52-paf-fact-1-lockheed-paf-f16-2009','PLATFORM','f-16c-block52-paf','publicFacts.1','F100-PW-229 programme association',NULL::text,'Engine','lockheed-paf-f16-2009',0.65::double precision,'CONTEXT_ONLY'),
      ('f-16c-block52-paf-fact-2-federal-register-paf-f16-2006','PLATFORM','f-16c-block52-paf','publicFacts.2','AN/APG-68(V)9 requested-programme association only',NULL::text,'Radar','federal-register-paf-f16-2006',0.65::double precision,'CONTEXT_ONLY'),
      ('f-16c-block52-paf-fact-3-federal-register-paf-f16-2006','PLATFORM','f-16c-block52-paf','publicFacts.3','Link 16 requested-programme association only',NULL::text,'Datalink','federal-register-paf-f16-2006',0.65::double precision,'CONTEXT_ONLY'),
      ('f-16c-block52-paf-fact-4-us-congress-paf-amraam-2008','PLATFORM','f-16c-block52-paf','publicFacts.4','Programme association only; station and loadout not admitted',NULL::text,'AIM-120C-5','us-congress-paf-amraam-2008',0.65::double precision,'CONTEXT_ONLY'),
      ('f-16c-block52-paf-fact-4-federal-register-paf-f16-2006','PLATFORM','f-16c-block52-paf','publicFacts.4','Programme association only; station and loadout not admitted',NULL::text,'AIM-120C-5','federal-register-paf-f16-2006',0.65::double precision,'CONTEXT_ONLY'),
      ('f-16d-block52-paf-fact-0-lockheed-paf-f16-2009','PLATFORM','f-16d-block52-paf','publicFacts.0','6 delivered two-seat aircraft',NULL::text,'Peace Drive I identity','lockheed-paf-f16-2009',0.95::double precision,'ACCEPTED'),
      ('f-16d-block52-paf-fact-1-lockheed-paf-f16-2009','PLATFORM','f-16d-block52-paf','publicFacts.1','F100-PW-229 programme association',NULL::text,'Engine','lockheed-paf-f16-2009',0.65::double precision,'CONTEXT_ONLY'),
      ('f-16d-block52-paf-fact-2-federal-register-paf-f16-2006','PLATFORM','f-16d-block52-paf','publicFacts.2','AN/APG-68(V)9 requested-programme association only',NULL::text,'Radar','federal-register-paf-f16-2006',0.65::double precision,'CONTEXT_ONLY'),
      ('f-16d-block52-paf-fact-3-federal-register-paf-f16-2006','PLATFORM','f-16d-block52-paf','publicFacts.3','Link 16 requested-programme association only',NULL::text,'Datalink','federal-register-paf-f16-2006',0.65::double precision,'CONTEXT_ONLY')
    ) AS expected(id,entity_type,entity_id,field_path,value_text,unit,condition_text,source_id,confidence,review_state)
      LEFT JOIN source_assertions current ON current.id=expected.id
      WHERE current.id IS NULL
         OR current.id IS DISTINCT FROM expected.id
         OR current.entity_type IS DISTINCT FROM expected.entity_type
         OR current.entity_id IS DISTINCT FROM expected.entity_id
         OR current.field_path IS DISTINCT FROM expected.field_path
         OR current.value_text IS DISTINCT FROM expected.value_text
         OR current.unit IS DISTINCT FROM expected.unit
         OR current.condition_text IS DISTINCT FROM expected.condition_text
         OR current.source_id IS DISTINCT FROM expected.source_id
         OR current.confidence IS DISTINCT FROM expected.confidence
         OR current.review_state IS DISTINCT FROM expected.review_state
    )
  ) THEN
    NULL;
  ELSIF (
    (SELECT count(*) FROM sources WHERE id IN ('lockheed-paf-f16-2009','federal-register-paf-f16-2006','dsca-pakistan-15-80','crs-pakistan-f16-rl31675','us-congress-paf-amraam-2008')) = 3
    AND NOT EXISTS (
      SELECT 1 FROM (VALUES
      ('lockheed-paf-f16-2009','First new F-16 Block 52 for Pakistan','Lockheed Martin','https://news.lockheedmartin.com/2009-10-13-Lockheed-Martin-Unveils-First-New-F-16-for-Pakistan-in-Ceremony-Attended-by-Air-Force-Chiefs','2009-10-13T00:00:00Z'::timestamptz,'MANUFACTURER','Confirms delivery context and the Pakistan Air Force F-16 Block 52 configuration.'),
      ('dsca-pakistan-15-80','Pakistan F-16 Block 52 aircraft package, Transmittal 15-80','Defense Security Cooperation Agency','https://www.dsca.mil/Press-Media/Major-Arms-Sales/Major-Arms-Sales-Library/igphoto/2003606313','2016-02-12T00:00:00Z'::timestamptz,'OFFICIAL','Identifies F100-PW-229 engines, AN/APG-68(V)9 radar, ALQ-211(V)9 AIDEWS, and Link 16 in the proposed configuration.'),
      ('us-congress-paf-amraam-2008','Pakistan F-16 program status and munitions package','United States Congress / U.S. Government Publishing Office','https://www.congress.gov/110/chrg/CHRG-110hhrg44526/CHRG-110hhrg44526.pdf','2008-04-16T00:00:00Z'::timestamptz,'OFFICIAL','Records the F-16C/D Block 52 program and the AIM-120C-5 AMRAAM quantity in the associated munitions package.')
    ) AS expected(id,title,publisher,url,published_at,source_class,notes)
      LEFT JOIN sources current ON current.id=expected.id
      WHERE current.id IS NULL
         OR current.id IS DISTINCT FROM expected.id
         OR current.title IS DISTINCT FROM expected.title
         OR current.publisher IS DISTINCT FROM expected.publisher
         OR current.url IS DISTINCT FROM expected.url
         OR current.published_at IS DISTINCT FROM expected.published_at
         OR current.source_class IS DISTINCT FROM expected.source_class
         OR current.notes IS DISTINCT FROM expected.notes
    )
  )
  AND (
    (SELECT count(*) FROM subsystems WHERE id IN ('al-31fp','su30-datalink','f100-pw-229','apg-68v9','alq-211v9','link-16')) = 6
    AND NOT EXISTS (
      SELECT 1 FROM (VALUES
      ('al-31fp','ENGINE','AL-31FP',NULL::text,'Twin-engine installation on the Su-30MKI.','["pib-su30-engine-2024"]'::jsonb,'SOURCED'),
      ('su30-datalink','DATALINK','Weapon-update data link',NULL::text,'Modeled as available when supporting Astra mid-course updates.','["drdo-astra-2019"]'::jsonb,'PARTIAL'),
      ('f100-pw-229','ENGINE','F100-PW-229','Pratt & Whitney','Engine identified for the proposed Pakistan F-16 Block 52 configuration.','["dsca-pakistan-15-80"]'::jsonb,'SOURCED'),
      ('apg-68v9','RADAR','AN/APG-68(V)9',NULL::text,'Multimode fire-control radar identified in the proposed Pakistan package.','["dsca-pakistan-15-80"]'::jsonb,'SOURCED'),
      ('alq-211v9','EW','AN/ALQ-211(V)9 AIDEWS',NULL::text,'Defensive electronic-warfare suite identified in the proposed Pakistan package.','["dsca-pakistan-15-80"]'::jsonb,'SOURCED'),
      ('link-16','DATALINK','Link 16',NULL::text,'Tactical data link identified in the proposed Pakistan package.','["dsca-pakistan-15-80"]'::jsonb,'SOURCED')
    ) AS expected(id,kind,designation,manufacturer,description,source_ids,data_status)
      LEFT JOIN subsystems current ON current.id=expected.id
      WHERE current.id IS NULL
         OR current.id IS DISTINCT FROM expected.id
         OR current.kind IS DISTINCT FROM expected.kind
         OR current.designation IS DISTINCT FROM expected.designation
         OR current.manufacturer IS DISTINCT FROM expected.manufacturer
         OR current.description IS DISTINCT FROM expected.description
         OR current.source_ids IS DISTINCT FROM expected.source_ids
         OR current.data_status IS DISTINCT FROM expected.data_status
    )
  )
  AND (
    (SELECT count(*) FROM platform_variants WHERE id IN ('su-30mki','f-16c-block52-paf','f-16d-block52-paf','mirage-2000h')) = 3
    AND NOT EXISTS (
      SELECT 1 FROM (VALUES
      ('su-30mki','IAF','India','Su-30','MKI','Su-30MKI','Blue fighter / launch platform',2::integer,'["al-31fp","al-31fp"]'::jsonb,'bars-radar','su30-ew','su30-datalink',NULL::text,NULL::text,'["A2A","A2G"]'::jsonb,'[{"quantity":2,"weaponId":"astra-mk1"}]'::jsonb,'["pib-astra-contract-2022","pib-su30-engine-2024"]'::jsonb,'PARTIAL'),
      ('f-16c-block52-paf','PAF','Pakistan','F-16','C Block 52','F-16C Block 52','Red fighter / opposing track',1::integer,'["f100-pw-229"]'::jsonb,'apg-68v9','alq-211v9','link-16',NULL::text,NULL::text,'["A2A","A2G","G2A"]'::jsonb,'[{"quantity":2,"weaponId":"aim-120c5"}]'::jsonb,'["lockheed-paf-f16-2009","dsca-pakistan-15-80","us-congress-paf-amraam-2008"]'::jsonb,'SOURCED'),
      ('mirage-2000h','IAF','India','Mirage 2000','H','Mirage 2000H','Blue fighter',NULL::integer,'[]'::jsonb,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,'["A2A","A2G"]'::jsonb,'[{"quantity":2,"weaponId":"mica-ir"}]'::jsonb,'[]'::jsonb,'UNKNOWN')
    ) AS expected(id,service,country,family,variant,display_name,role,crew,engine_ids,radar_id,ew_id,datalink_id,rwr_id,countermeasure_id,domains,default_loadout,source_ids,data_status)
      LEFT JOIN platform_variants current ON current.id=expected.id
      WHERE current.id IS NULL
         OR current.id IS DISTINCT FROM expected.id
         OR current.service IS DISTINCT FROM expected.service
         OR current.country IS DISTINCT FROM expected.country
         OR current.family IS DISTINCT FROM expected.family
         OR current.variant IS DISTINCT FROM expected.variant
         OR current.display_name IS DISTINCT FROM expected.display_name
         OR current.role IS DISTINCT FROM expected.role
         OR current.crew IS DISTINCT FROM expected.crew
         OR current.engine_ids IS DISTINCT FROM expected.engine_ids
         OR current.radar_id IS DISTINCT FROM expected.radar_id
         OR current.ew_id IS DISTINCT FROM expected.ew_id
         OR current.datalink_id IS DISTINCT FROM expected.datalink_id
         OR current.rwr_id IS DISTINCT FROM expected.rwr_id
         OR current.countermeasure_id IS DISTINCT FROM expected.countermeasure_id
         OR current.domains IS DISTINCT FROM expected.domains
         OR current.default_loadout IS DISTINCT FROM expected.default_loadout
         OR current.source_ids IS DISTINCT FROM expected.source_ids
         OR current.data_status IS DISTINCT FROM expected.data_status
    )
  )
  AND (
    (SELECT count(*) FROM platform_weapon_compatibility WHERE platform_id IN ('su-30mki','f-16c-block52-paf','f-16d-block52-paf','mirage-2000h')) = 3
    AND NOT EXISTS (
      SELECT 1 FROM (VALUES
      ('su-30mki','astra-mk1','CATALOGED_LOADOUT','["pib-astra-contract-2022","pib-su30-engine-2024"]'::jsonb,'CONFIRMED'),
      ('f-16c-block52-paf','aim-120c5','CATALOGED_LOADOUT','["lockheed-paf-f16-2009","dsca-pakistan-15-80","us-congress-paf-amraam-2008"]'::jsonb,'CONFIRMED'),
      ('mirage-2000h','mica-ir','CATALOGED_LOADOUT','[]'::jsonb,'UNVERIFIED')
    ) AS expected(platform_id,weapon_id,station_group,source_ids,status)
      LEFT JOIN platform_weapon_compatibility current ON current.platform_id=expected.platform_id AND current.weapon_id=expected.weapon_id AND current.station_group=expected.station_group
      WHERE current.platform_id IS NULL
         OR current.platform_id IS DISTINCT FROM expected.platform_id
         OR current.weapon_id IS DISTINCT FROM expected.weapon_id
         OR current.station_group IS DISTINCT FROM expected.station_group
         OR current.source_ids IS DISTINCT FROM expected.source_ids
         OR current.status IS DISTINCT FROM expected.status
    )
  )
  AND (
    (SELECT count(*) FROM source_assertions WHERE entity_type='PLATFORM' AND entity_id IN ('su-30mki','f-16c-block52-paf','f-16d-block52-paf','mirage-2000h')) = 8
    AND NOT EXISTS (
      SELECT 1 FROM (VALUES
      ('su-30mki-fact-0-pib-astra-contract-2022','PLATFORM','su-30mki','publicFacts.0','Fully integrated on Su-30MKI',NULL::text,'Astra integration','pib-astra-contract-2022',0.95::double precision,'ACCEPTED'),
      ('su-30mki-fact-1-pib-su30-engine-2024','PLATFORM','su-30mki','publicFacts.1','2 × AL-31FP',NULL::text,'Engine installation','pib-su30-engine-2024',0.95::double precision,'ACCEPTED'),
      ('f-16c-block52-paf-fact-0-lockheed-paf-f16-2009','PLATFORM','f-16c-block52-paf','publicFacts.0','F-16C/D Block 52 program',NULL::text,'PAF configuration','lockheed-paf-f16-2009',0.95::double precision,'ACCEPTED'),
      ('f-16c-block52-paf-fact-0-us-congress-paf-amraam-2008','PLATFORM','f-16c-block52-paf','publicFacts.0','F-16C/D Block 52 program',NULL::text,'PAF configuration','us-congress-paf-amraam-2008',0.95::double precision,'ACCEPTED'),
      ('f-16c-block52-paf-fact-1-dsca-pakistan-15-80','PLATFORM','f-16c-block52-paf','publicFacts.1','F100-PW-229',NULL::text,'Engine','dsca-pakistan-15-80',0.95::double precision,'ACCEPTED'),
      ('f-16c-block52-paf-fact-2-dsca-pakistan-15-80','PLATFORM','f-16c-block52-paf','publicFacts.2','AN/APG-68(V)9',NULL::text,'Radar','dsca-pakistan-15-80',0.95::double precision,'ACCEPTED'),
      ('f-16c-block52-paf-fact-3-dsca-pakistan-15-80','PLATFORM','f-16c-block52-paf','publicFacts.3','AN/ALQ-211(V)9 AIDEWS',NULL::text,'Defensive EW','dsca-pakistan-15-80',0.95::double precision,'ACCEPTED'),
      ('f-16c-block52-paf-fact-4-dsca-pakistan-15-80','PLATFORM','f-16c-block52-paf','publicFacts.4','Link 16',NULL::text,'Datalink','dsca-pakistan-15-80',0.95::double precision,'ACCEPTED')
    ) AS expected(id,entity_type,entity_id,field_path,value_text,unit,condition_text,source_id,confidence,review_state)
      LEFT JOIN source_assertions current ON current.id=expected.id
      WHERE current.id IS NULL
         OR current.id IS DISTINCT FROM expected.id
         OR current.entity_type IS DISTINCT FROM expected.entity_type
         OR current.entity_id IS DISTINCT FROM expected.entity_id
         OR current.field_path IS DISTINCT FROM expected.field_path
         OR current.value_text IS DISTINCT FROM expected.value_text
         OR current.unit IS DISTINCT FROM expected.unit
         OR current.condition_text IS DISTINCT FROM expected.condition_text
         OR current.source_id IS DISTINCT FROM expected.source_id
         OR current.confidence IS DISTINCT FROM expected.confidence
         OR current.review_state IS DISTINCT FROM expected.review_state
    )
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM platform_variants
      WHERE id NOT IN ('su-30mki','f-16c-block52-paf','f-16d-block52-paf','mirage-2000h')
        AND (
          engine_ids ? 'alq-211v9'
          OR radar_id='alq-211v9'
          OR ew_id='alq-211v9'
          OR datalink_id='alq-211v9'
          OR rwr_id='alq-211v9'
          OR countermeasure_id='alq-211v9'
        )
    ) OR EXISTS (
      SELECT 1
      FROM source_assertions
      WHERE NOT (entity_type='PLATFORM'
        AND entity_id IN ('su-30mki','f-16c-block52-paf','f-16d-block52-paf','mirage-2000h'))
        AND entity_id='alq-211v9'
    ) THEN
      RAISE EXCEPTION 'Aircraft catalog migration 021 cannot retire alq-211v9 while unrelated catalog rows reference it';
    END IF;

    INSERT INTO sources (id,title,publisher,url,published_at,source_class,notes)
    VALUES
      ('lockheed-paf-f16-2009','First new F-16 Block 52 for Pakistan','Lockheed Martin','https://news.lockheedmartin.com/2009-10-13-Lockheed-Martin-Unveils-First-New-F-16-for-Pakistan-in-Ceremony-Attended-by-Air-Force-Chiefs','2009-10-13T00:00:00Z'::timestamptz,'MANUFACTURER','Identifies Peace Drive I as 12 F-16C and 6 F-16D Block 52 aircraft and associates the programme with F100-PW-229 engines. It is categorical catalog context, not performance evidence.'),
      ('federal-register-paf-f16-2006','Pakistan F-16C/D Block 50/52 aircraft programme notice','United States Federal Register / Government Publishing Office','https://www.govinfo.gov/content/pkg/FR-2006-07-11/pdf/FR-2006-07-11.pdf','2006-07-11T00:00:00Z'::timestamptz,'OFFICIAL','Associates the requested programme with APG-68(V)9, Link 16, AIM-120C-5 and LAU-129/A. It does not prove final delivered fit or supply runtime authority.'),
      ('dsca-pakistan-15-80','Pakistan F-16 Block 52 aircraft package, Transmittal 15-80','Defense Security Cooperation Agency','https://www.dsca.mil/Press-Media/Major-Arms-Sales/Major-Arms-Sales-Library/igphoto/2003606313','2016-02-12T00:00:00Z'::timestamptz,'OFFICIAL','Separate 2016 proposed sale that expired without acceptance. It is quarantined and cannot establish delivered Peace Drive I fit or runtime authority.'),
      ('crs-pakistan-f16-rl31675','Pakistan-U.S. relations and F-16 transaction history','Congressional Research Service','https://www.congress.gov/crs_external_products/RL/HTML/RL31675.web.html',NULL::timestamptz,'OFFICIAL','Reviewed as the transaction-state basis for quarantining the 2016 proposal. The dynamic locator has no approved immutable artifact hash and cannot support runtime admission.'),
      ('us-congress-paf-amraam-2008','Pakistan F-16 program status and munitions package','United States Congress / U.S. Government Publishing Office','https://www.govinfo.gov/content/pkg/GOVPUB-Y4_F76_1-PURL-LPS106730/pdf/GOVPUB-Y4_F76_1-PURL-LPS106730.pdf','2008-09-16T00:00:00Z'::timestamptz,'OFFICIAL','Records the F-16C/D Block 52 programme and AIM-120C-5 association. It is categorical programme context, not station, loadout, guidance, or performance authority.')
    ON CONFLICT (id) DO UPDATE SET
      title=EXCLUDED.title,
      publisher=EXCLUDED.publisher,
      url=EXCLUDED.url,
      published_at=EXCLUDED.published_at,
      source_class=EXCLUDED.source_class,
      notes=EXCLUDED.notes;

    INSERT INTO subsystems (id,kind,designation,manufacturer,description,source_ids,data_status)
    VALUES
      ('al-31fp','ENGINE','AL-31FP',NULL::text,'Twin-engine installation on the Su-30MKI.','["pib-su30-engine-2024"]'::jsonb,'CONTEXT_ONLY'),
      ('su30-datalink','DATALINK','Weapon-update data link',NULL::text,'Astra integration context does not establish an admitted aircraft data-link model.','["drdo-astra-2019"]'::jsonb,'CONTEXT_ONLY'),
      ('f100-pw-229','ENGINE','F100-PW-229','Pratt & Whitney','F100-PW-229 is associated categorically with the delivered Peace Drive I programme; no engine map or performance authority is admitted.','["lockheed-paf-f16-2009"]'::jsonb,'CONTEXT_ONLY'),
      ('apg-68v9','RADAR','AN/APG-68(V)9',NULL::text,'APG-68(V)9 appears in the 2006 requested programme context; final delivered fit and sensor performance are not established.','["federal-register-paf-f16-2006"]'::jsonb,'CONTEXT_ONLY'),
      ('link-16','DATALINK','Link 16',NULL::text,'Link 16 appears in the 2006 requested programme context; final delivered fit and data-link behavior are not established.','["federal-register-paf-f16-2006"]'::jsonb,'CONTEXT_ONLY')
    ON CONFLICT (id) DO UPDATE SET
      kind=EXCLUDED.kind,
      designation=EXCLUDED.designation,
      manufacturer=EXCLUDED.manufacturer,
      description=EXCLUDED.description,
      source_ids=EXCLUDED.source_ids,
      data_status=EXCLUDED.data_status;

    INSERT INTO platform_variants
      (id,service,country,family,variant,display_name,role,crew,engine_ids,radar_id,ew_id,datalink_id,
       rwr_id,countermeasure_id,domains,default_loadout,source_ids,data_status)
    VALUES
      ('su-30mki','IAF','India','Su-30','MKI','Su-30MKI','Blue fighter / launch platform',2::integer,'["al-31fp","al-31fp"]'::jsonb,'bars-radar','su30-ew','su30-datalink',NULL::text,NULL::text,'["A2A","A2G"]'::jsonb,'[{"quantity":2,"status":"MODEL_ASSUMPTION","weaponId":"astra-mk1"}]'::jsonb,'["pib-astra-contract-2022","pib-su30-engine-2024"]'::jsonb,'PARTIAL'),
      ('f-16c-block52-paf','PAF','Pakistan','F-16','F-16C Block 52 Peace Drive I','F-16C Block 52','Red fighter / opposing track',1::integer,'["f100-pw-229"]'::jsonb,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,'["A2A","A2G","G2A"]'::jsonb,'[{"quantity":2,"status":"MODEL_ASSUMPTION","weaponId":"aim-120c5"}]'::jsonb,'["lockheed-paf-f16-2009","federal-register-paf-f16-2006","us-congress-paf-amraam-2008"]'::jsonb,'PARTIAL'),
      ('f-16d-block52-paf','PAF','Pakistan','F-16','F-16D Block 52 Peace Drive I','F-16D Block 52','Public-reference catalog only; not scenario-selectable',2::integer,'["f100-pw-229"]'::jsonb,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,'["A2A","A2G","G2A"]'::jsonb,'[]'::jsonb,'["lockheed-paf-f16-2009","federal-register-paf-f16-2006"]'::jsonb,'PARTIAL'),
      ('mirage-2000h','IAF','India','Mirage 2000','H','Mirage 2000H','Blue fighter',NULL::integer,'[]'::jsonb,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,'["A2A","A2G"]'::jsonb,'[{"quantity":2,"status":"MODEL_ASSUMPTION","weaponId":"mica-ir"}]'::jsonb,'[]'::jsonb,'UNKNOWN')
    ON CONFLICT (id) DO UPDATE SET
      service=EXCLUDED.service,
      country=EXCLUDED.country,
      family=EXCLUDED.family,
      variant=EXCLUDED.variant,
      display_name=EXCLUDED.display_name,
      role=EXCLUDED.role,
      crew=EXCLUDED.crew,
      engine_ids=EXCLUDED.engine_ids,
      radar_id=EXCLUDED.radar_id,
      ew_id=EXCLUDED.ew_id,
      datalink_id=EXCLUDED.datalink_id,
      rwr_id=EXCLUDED.rwr_id,
      countermeasure_id=EXCLUDED.countermeasure_id,
      domains=EXCLUDED.domains,
      default_loadout=EXCLUDED.default_loadout,
      source_ids=EXCLUDED.source_ids,
      data_status=EXCLUDED.data_status;

    DELETE FROM source_assertions
    WHERE entity_type='PLATFORM'
      AND entity_id IN ('su-30mki','f-16c-block52-paf','f-16d-block52-paf','mirage-2000h');
    INSERT INTO source_assertions
      (id,entity_type,entity_id,field_path,value_text,unit,condition_text,source_id,confidence,review_state)
    VALUES
      ('su-30mki-fact-0-pib-astra-contract-2022','PLATFORM','su-30mki','publicFacts.0','Fully integrated on Su-30MKI',NULL::text,'Astra integration','pib-astra-contract-2022',0.65::double precision,'CONTEXT_ONLY'),
      ('su-30mki-fact-1-pib-su30-engine-2024','PLATFORM','su-30mki','publicFacts.1','2 × AL-31FP',NULL::text,'Engine installation','pib-su30-engine-2024',0.65::double precision,'CONTEXT_ONLY'),
      ('f-16c-block52-paf-fact-0-lockheed-paf-f16-2009','PLATFORM','f-16c-block52-paf','publicFacts.0','12 delivered single-seat aircraft',NULL::text,'Peace Drive I identity','lockheed-paf-f16-2009',0.95::double precision,'ACCEPTED'),
      ('f-16c-block52-paf-fact-1-lockheed-paf-f16-2009','PLATFORM','f-16c-block52-paf','publicFacts.1','F100-PW-229 programme association',NULL::text,'Engine','lockheed-paf-f16-2009',0.65::double precision,'CONTEXT_ONLY'),
      ('f-16c-block52-paf-fact-2-federal-register-paf-f16-2006','PLATFORM','f-16c-block52-paf','publicFacts.2','AN/APG-68(V)9 requested-programme association only',NULL::text,'Radar','federal-register-paf-f16-2006',0.65::double precision,'CONTEXT_ONLY'),
      ('f-16c-block52-paf-fact-3-federal-register-paf-f16-2006','PLATFORM','f-16c-block52-paf','publicFacts.3','Link 16 requested-programme association only',NULL::text,'Datalink','federal-register-paf-f16-2006',0.65::double precision,'CONTEXT_ONLY'),
      ('f-16c-block52-paf-fact-4-us-congress-paf-amraam-2008','PLATFORM','f-16c-block52-paf','publicFacts.4','Programme association only; station and loadout not admitted',NULL::text,'AIM-120C-5','us-congress-paf-amraam-2008',0.65::double precision,'CONTEXT_ONLY'),
      ('f-16c-block52-paf-fact-4-federal-register-paf-f16-2006','PLATFORM','f-16c-block52-paf','publicFacts.4','Programme association only; station and loadout not admitted',NULL::text,'AIM-120C-5','federal-register-paf-f16-2006',0.65::double precision,'CONTEXT_ONLY'),
      ('f-16d-block52-paf-fact-0-lockheed-paf-f16-2009','PLATFORM','f-16d-block52-paf','publicFacts.0','6 delivered two-seat aircraft',NULL::text,'Peace Drive I identity','lockheed-paf-f16-2009',0.95::double precision,'ACCEPTED'),
      ('f-16d-block52-paf-fact-1-lockheed-paf-f16-2009','PLATFORM','f-16d-block52-paf','publicFacts.1','F100-PW-229 programme association',NULL::text,'Engine','lockheed-paf-f16-2009',0.65::double precision,'CONTEXT_ONLY'),
      ('f-16d-block52-paf-fact-2-federal-register-paf-f16-2006','PLATFORM','f-16d-block52-paf','publicFacts.2','AN/APG-68(V)9 requested-programme association only',NULL::text,'Radar','federal-register-paf-f16-2006',0.65::double precision,'CONTEXT_ONLY'),
      ('f-16d-block52-paf-fact-3-federal-register-paf-f16-2006','PLATFORM','f-16d-block52-paf','publicFacts.3','Link 16 requested-programme association only',NULL::text,'Datalink','federal-register-paf-f16-2006',0.65::double precision,'CONTEXT_ONLY');

    DELETE FROM platform_weapon_compatibility
    WHERE platform_id IN ('su-30mki','f-16c-block52-paf','f-16d-block52-paf','mirage-2000h');
    INSERT INTO platform_weapon_compatibility
      (platform_id,weapon_id,station_group,source_ids,status)
    VALUES
      ('su-30mki','astra-mk1','CATALOGED_LOADOUT','["pib-astra-contract-2022","pib-su30-engine-2024"]'::jsonb,'UNVERIFIED'),
      ('f-16c-block52-paf','aim-120c5','CATALOGED_LOADOUT','["lockheed-paf-f16-2009","federal-register-paf-f16-2006","us-congress-paf-amraam-2008"]'::jsonb,'UNVERIFIED'),
      ('mirage-2000h','mica-ir','CATALOGED_LOADOUT','[]'::jsonb,'UNVERIFIED');

    DELETE FROM subsystems WHERE id='alq-211v9';
  ELSE
    RAISE EXCEPTION 'Aircraft catalog migration 021 rejected an unrecognized or partial affected projection';
  END IF;

  IF NOT ((
    (SELECT count(*) FROM sources WHERE id IN ('lockheed-paf-f16-2009','federal-register-paf-f16-2006','dsca-pakistan-15-80','crs-pakistan-f16-rl31675','us-congress-paf-amraam-2008')) = 0
    AND (SELECT count(*) FROM subsystems WHERE id IN ('al-31fp','su30-datalink','f100-pw-229','apg-68v9','alq-211v9','link-16')) = 0
    AND (SELECT count(*) FROM platform_variants WHERE id IN ('su-30mki','f-16c-block52-paf','f-16d-block52-paf','mirage-2000h')) = 0
    AND (SELECT count(*) FROM platform_weapon_compatibility WHERE platform_id IN ('su-30mki','f-16c-block52-paf','f-16d-block52-paf','mirage-2000h')) = 0
    AND (SELECT count(*) FROM source_assertions WHERE entity_type='PLATFORM' AND entity_id IN ('su-30mki','f-16c-block52-paf','f-16d-block52-paf','mirage-2000h')) = 0
  ) OR (
    (SELECT count(*) FROM sources WHERE id IN ('lockheed-paf-f16-2009','federal-register-paf-f16-2006','dsca-pakistan-15-80','crs-pakistan-f16-rl31675','us-congress-paf-amraam-2008')) = 5
    AND NOT EXISTS (
      SELECT 1 FROM (VALUES
      ('lockheed-paf-f16-2009','First new F-16 Block 52 for Pakistan','Lockheed Martin','https://news.lockheedmartin.com/2009-10-13-Lockheed-Martin-Unveils-First-New-F-16-for-Pakistan-in-Ceremony-Attended-by-Air-Force-Chiefs','2009-10-13T00:00:00Z'::timestamptz,'MANUFACTURER','Identifies Peace Drive I as 12 F-16C and 6 F-16D Block 52 aircraft and associates the programme with F100-PW-229 engines. It is categorical catalog context, not performance evidence.'),
      ('federal-register-paf-f16-2006','Pakistan F-16C/D Block 50/52 aircraft programme notice','United States Federal Register / Government Publishing Office','https://www.govinfo.gov/content/pkg/FR-2006-07-11/pdf/FR-2006-07-11.pdf','2006-07-11T00:00:00Z'::timestamptz,'OFFICIAL','Associates the requested programme with APG-68(V)9, Link 16, AIM-120C-5 and LAU-129/A. It does not prove final delivered fit or supply runtime authority.'),
      ('dsca-pakistan-15-80','Pakistan F-16 Block 52 aircraft package, Transmittal 15-80','Defense Security Cooperation Agency','https://www.dsca.mil/Press-Media/Major-Arms-Sales/Major-Arms-Sales-Library/igphoto/2003606313','2016-02-12T00:00:00Z'::timestamptz,'OFFICIAL','Separate 2016 proposed sale that expired without acceptance. It is quarantined and cannot establish delivered Peace Drive I fit or runtime authority.'),
      ('crs-pakistan-f16-rl31675','Pakistan-U.S. relations and F-16 transaction history','Congressional Research Service','https://www.congress.gov/crs_external_products/RL/HTML/RL31675.web.html',NULL::timestamptz,'OFFICIAL','Reviewed as the transaction-state basis for quarantining the 2016 proposal. The dynamic locator has no approved immutable artifact hash and cannot support runtime admission.'),
      ('us-congress-paf-amraam-2008','Pakistan F-16 program status and munitions package','United States Congress / U.S. Government Publishing Office','https://www.govinfo.gov/content/pkg/GOVPUB-Y4_F76_1-PURL-LPS106730/pdf/GOVPUB-Y4_F76_1-PURL-LPS106730.pdf','2008-09-16T00:00:00Z'::timestamptz,'OFFICIAL','Records the F-16C/D Block 52 programme and AIM-120C-5 association. It is categorical programme context, not station, loadout, guidance, or performance authority.')
    ) AS expected(id,title,publisher,url,published_at,source_class,notes)
      LEFT JOIN sources current ON current.id=expected.id
      WHERE current.id IS NULL
         OR current.id IS DISTINCT FROM expected.id
         OR current.title IS DISTINCT FROM expected.title
         OR current.publisher IS DISTINCT FROM expected.publisher
         OR current.url IS DISTINCT FROM expected.url
         OR current.published_at IS DISTINCT FROM expected.published_at
         OR current.source_class IS DISTINCT FROM expected.source_class
         OR current.notes IS DISTINCT FROM expected.notes
    )
  )
  AND (
    (SELECT count(*) FROM subsystems WHERE id IN ('al-31fp','su30-datalink','f100-pw-229','apg-68v9','alq-211v9','link-16')) = 5
    AND NOT EXISTS (
      SELECT 1 FROM (VALUES
      ('al-31fp','ENGINE','AL-31FP',NULL::text,'Twin-engine installation on the Su-30MKI.','["pib-su30-engine-2024"]'::jsonb,'CONTEXT_ONLY'),
      ('su30-datalink','DATALINK','Weapon-update data link',NULL::text,'Astra integration context does not establish an admitted aircraft data-link model.','["drdo-astra-2019"]'::jsonb,'CONTEXT_ONLY'),
      ('f100-pw-229','ENGINE','F100-PW-229','Pratt & Whitney','F100-PW-229 is associated categorically with the delivered Peace Drive I programme; no engine map or performance authority is admitted.','["lockheed-paf-f16-2009"]'::jsonb,'CONTEXT_ONLY'),
      ('apg-68v9','RADAR','AN/APG-68(V)9',NULL::text,'APG-68(V)9 appears in the 2006 requested programme context; final delivered fit and sensor performance are not established.','["federal-register-paf-f16-2006"]'::jsonb,'CONTEXT_ONLY'),
      ('link-16','DATALINK','Link 16',NULL::text,'Link 16 appears in the 2006 requested programme context; final delivered fit and data-link behavior are not established.','["federal-register-paf-f16-2006"]'::jsonb,'CONTEXT_ONLY')
    ) AS expected(id,kind,designation,manufacturer,description,source_ids,data_status)
      LEFT JOIN subsystems current ON current.id=expected.id
      WHERE current.id IS NULL
         OR current.id IS DISTINCT FROM expected.id
         OR current.kind IS DISTINCT FROM expected.kind
         OR current.designation IS DISTINCT FROM expected.designation
         OR current.manufacturer IS DISTINCT FROM expected.manufacturer
         OR current.description IS DISTINCT FROM expected.description
         OR current.source_ids IS DISTINCT FROM expected.source_ids
         OR current.data_status IS DISTINCT FROM expected.data_status
    )
  )
  AND (
    (SELECT count(*) FROM platform_variants WHERE id IN ('su-30mki','f-16c-block52-paf','f-16d-block52-paf','mirage-2000h')) = 4
    AND NOT EXISTS (
      SELECT 1 FROM (VALUES
      ('su-30mki','IAF','India','Su-30','MKI','Su-30MKI','Blue fighter / launch platform',2::integer,'["al-31fp","al-31fp"]'::jsonb,'bars-radar','su30-ew','su30-datalink',NULL::text,NULL::text,'["A2A","A2G"]'::jsonb,'[{"quantity":2,"status":"MODEL_ASSUMPTION","weaponId":"astra-mk1"}]'::jsonb,'["pib-astra-contract-2022","pib-su30-engine-2024"]'::jsonb,'PARTIAL'),
      ('f-16c-block52-paf','PAF','Pakistan','F-16','F-16C Block 52 Peace Drive I','F-16C Block 52','Red fighter / opposing track',1::integer,'["f100-pw-229"]'::jsonb,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,'["A2A","A2G","G2A"]'::jsonb,'[{"quantity":2,"status":"MODEL_ASSUMPTION","weaponId":"aim-120c5"}]'::jsonb,'["lockheed-paf-f16-2009","federal-register-paf-f16-2006","us-congress-paf-amraam-2008"]'::jsonb,'PARTIAL'),
      ('f-16d-block52-paf','PAF','Pakistan','F-16','F-16D Block 52 Peace Drive I','F-16D Block 52','Public-reference catalog only; not scenario-selectable',2::integer,'["f100-pw-229"]'::jsonb,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,'["A2A","A2G","G2A"]'::jsonb,'[]'::jsonb,'["lockheed-paf-f16-2009","federal-register-paf-f16-2006"]'::jsonb,'PARTIAL'),
      ('mirage-2000h','IAF','India','Mirage 2000','H','Mirage 2000H','Blue fighter',NULL::integer,'[]'::jsonb,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,'["A2A","A2G"]'::jsonb,'[{"quantity":2,"status":"MODEL_ASSUMPTION","weaponId":"mica-ir"}]'::jsonb,'[]'::jsonb,'UNKNOWN')
    ) AS expected(id,service,country,family,variant,display_name,role,crew,engine_ids,radar_id,ew_id,datalink_id,rwr_id,countermeasure_id,domains,default_loadout,source_ids,data_status)
      LEFT JOIN platform_variants current ON current.id=expected.id
      WHERE current.id IS NULL
         OR current.id IS DISTINCT FROM expected.id
         OR current.service IS DISTINCT FROM expected.service
         OR current.country IS DISTINCT FROM expected.country
         OR current.family IS DISTINCT FROM expected.family
         OR current.variant IS DISTINCT FROM expected.variant
         OR current.display_name IS DISTINCT FROM expected.display_name
         OR current.role IS DISTINCT FROM expected.role
         OR current.crew IS DISTINCT FROM expected.crew
         OR current.engine_ids IS DISTINCT FROM expected.engine_ids
         OR current.radar_id IS DISTINCT FROM expected.radar_id
         OR current.ew_id IS DISTINCT FROM expected.ew_id
         OR current.datalink_id IS DISTINCT FROM expected.datalink_id
         OR current.rwr_id IS DISTINCT FROM expected.rwr_id
         OR current.countermeasure_id IS DISTINCT FROM expected.countermeasure_id
         OR current.domains IS DISTINCT FROM expected.domains
         OR current.default_loadout IS DISTINCT FROM expected.default_loadout
         OR current.source_ids IS DISTINCT FROM expected.source_ids
         OR current.data_status IS DISTINCT FROM expected.data_status
    )
  )
  AND (
    (SELECT count(*) FROM platform_weapon_compatibility WHERE platform_id IN ('su-30mki','f-16c-block52-paf','f-16d-block52-paf','mirage-2000h')) = 3
    AND NOT EXISTS (
      SELECT 1 FROM (VALUES
      ('su-30mki','astra-mk1','CATALOGED_LOADOUT','["pib-astra-contract-2022","pib-su30-engine-2024"]'::jsonb,'UNVERIFIED'),
      ('f-16c-block52-paf','aim-120c5','CATALOGED_LOADOUT','["lockheed-paf-f16-2009","federal-register-paf-f16-2006","us-congress-paf-amraam-2008"]'::jsonb,'UNVERIFIED'),
      ('mirage-2000h','mica-ir','CATALOGED_LOADOUT','[]'::jsonb,'UNVERIFIED')
    ) AS expected(platform_id,weapon_id,station_group,source_ids,status)
      LEFT JOIN platform_weapon_compatibility current ON current.platform_id=expected.platform_id AND current.weapon_id=expected.weapon_id AND current.station_group=expected.station_group
      WHERE current.platform_id IS NULL
         OR current.platform_id IS DISTINCT FROM expected.platform_id
         OR current.weapon_id IS DISTINCT FROM expected.weapon_id
         OR current.station_group IS DISTINCT FROM expected.station_group
         OR current.source_ids IS DISTINCT FROM expected.source_ids
         OR current.status IS DISTINCT FROM expected.status
    )
  )
  AND (
    (SELECT count(*) FROM source_assertions WHERE entity_type='PLATFORM' AND entity_id IN ('su-30mki','f-16c-block52-paf','f-16d-block52-paf','mirage-2000h')) = 12
    AND NOT EXISTS (
      SELECT 1 FROM (VALUES
      ('su-30mki-fact-0-pib-astra-contract-2022','PLATFORM','su-30mki','publicFacts.0','Fully integrated on Su-30MKI',NULL::text,'Astra integration','pib-astra-contract-2022',0.65::double precision,'CONTEXT_ONLY'),
      ('su-30mki-fact-1-pib-su30-engine-2024','PLATFORM','su-30mki','publicFacts.1','2 × AL-31FP',NULL::text,'Engine installation','pib-su30-engine-2024',0.65::double precision,'CONTEXT_ONLY'),
      ('f-16c-block52-paf-fact-0-lockheed-paf-f16-2009','PLATFORM','f-16c-block52-paf','publicFacts.0','12 delivered single-seat aircraft',NULL::text,'Peace Drive I identity','lockheed-paf-f16-2009',0.95::double precision,'ACCEPTED'),
      ('f-16c-block52-paf-fact-1-lockheed-paf-f16-2009','PLATFORM','f-16c-block52-paf','publicFacts.1','F100-PW-229 programme association',NULL::text,'Engine','lockheed-paf-f16-2009',0.65::double precision,'CONTEXT_ONLY'),
      ('f-16c-block52-paf-fact-2-federal-register-paf-f16-2006','PLATFORM','f-16c-block52-paf','publicFacts.2','AN/APG-68(V)9 requested-programme association only',NULL::text,'Radar','federal-register-paf-f16-2006',0.65::double precision,'CONTEXT_ONLY'),
      ('f-16c-block52-paf-fact-3-federal-register-paf-f16-2006','PLATFORM','f-16c-block52-paf','publicFacts.3','Link 16 requested-programme association only',NULL::text,'Datalink','federal-register-paf-f16-2006',0.65::double precision,'CONTEXT_ONLY'),
      ('f-16c-block52-paf-fact-4-us-congress-paf-amraam-2008','PLATFORM','f-16c-block52-paf','publicFacts.4','Programme association only; station and loadout not admitted',NULL::text,'AIM-120C-5','us-congress-paf-amraam-2008',0.65::double precision,'CONTEXT_ONLY'),
      ('f-16c-block52-paf-fact-4-federal-register-paf-f16-2006','PLATFORM','f-16c-block52-paf','publicFacts.4','Programme association only; station and loadout not admitted',NULL::text,'AIM-120C-5','federal-register-paf-f16-2006',0.65::double precision,'CONTEXT_ONLY'),
      ('f-16d-block52-paf-fact-0-lockheed-paf-f16-2009','PLATFORM','f-16d-block52-paf','publicFacts.0','6 delivered two-seat aircraft',NULL::text,'Peace Drive I identity','lockheed-paf-f16-2009',0.95::double precision,'ACCEPTED'),
      ('f-16d-block52-paf-fact-1-lockheed-paf-f16-2009','PLATFORM','f-16d-block52-paf','publicFacts.1','F100-PW-229 programme association',NULL::text,'Engine','lockheed-paf-f16-2009',0.65::double precision,'CONTEXT_ONLY'),
      ('f-16d-block52-paf-fact-2-federal-register-paf-f16-2006','PLATFORM','f-16d-block52-paf','publicFacts.2','AN/APG-68(V)9 requested-programme association only',NULL::text,'Radar','federal-register-paf-f16-2006',0.65::double precision,'CONTEXT_ONLY'),
      ('f-16d-block52-paf-fact-3-federal-register-paf-f16-2006','PLATFORM','f-16d-block52-paf','publicFacts.3','Link 16 requested-programme association only',NULL::text,'Datalink','federal-register-paf-f16-2006',0.65::double precision,'CONTEXT_ONLY')
    ) AS expected(id,entity_type,entity_id,field_path,value_text,unit,condition_text,source_id,confidence,review_state)
      LEFT JOIN source_assertions current ON current.id=expected.id
      WHERE current.id IS NULL
         OR current.id IS DISTINCT FROM expected.id
         OR current.entity_type IS DISTINCT FROM expected.entity_type
         OR current.entity_id IS DISTINCT FROM expected.entity_id
         OR current.field_path IS DISTINCT FROM expected.field_path
         OR current.value_text IS DISTINCT FROM expected.value_text
         OR current.unit IS DISTINCT FROM expected.unit
         OR current.condition_text IS DISTINCT FROM expected.condition_text
         OR current.source_id IS DISTINCT FROM expected.source_id
         OR current.confidence IS DISTINCT FROM expected.confidence
         OR current.review_state IS DISTINCT FROM expected.review_state
    )
  )) THEN
    RAISE EXCEPTION 'Aircraft catalog migration 021 exact current readback failed';
  END IF;
END
$vector_aircraft_catalog_021$;
