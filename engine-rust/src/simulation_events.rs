use std::collections::{HashMap, HashSet};

use serde::Serialize;

use crate::{Affiliation, EngineError, EntityKind, EntityLifecycle, Termination};

pub const SIMULATION_EVENT_SCHEMA: &str = "vector.simulation-event.v2";
pub const RUN_STARTED_PAYLOAD_SCHEMA: &str = "vector.simulation-event-payload.run-started.v1";
pub const ENTITY_ENTERED_PAYLOAD_SCHEMA: &str =
    "vector.simulation-event-payload.entity-entered-world.v1";
pub const LIFECYCLE_CHANGED_PAYLOAD_SCHEMA: &str =
    "vector.simulation-event-payload.entity-lifecycle-changed.v1";
pub const RUN_COMPLETED_PAYLOAD_SCHEMA: &str = "vector.simulation-event-payload.run-completed.v1";
pub const MAX_SIMULATION_EVENTS: usize = 100_000;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub enum SimulationEventPhase {
    #[serde(rename = "LIFECYCLE")]
    Lifecycle,
    #[serde(rename = "SENSING")]
    Sensing,
    #[serde(rename = "TRACKING")]
    Tracking,
    #[serde(rename = "MISSION")]
    Mission,
    #[serde(rename = "WEAPON")]
    Weapon,
    #[serde(rename = "TERMINATION")]
    Termination,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub enum SimulationEventSubsystem {
    #[serde(rename = "RUN_COORDINATOR")]
    RunCoordinator,
    #[serde(rename = "ENTITY_LIFECYCLE")]
    EntityLifecycle,
}

impl SimulationEventSubsystem {
    fn key(self) -> &'static str {
        match self {
            Self::RunCoordinator => "RUN_COORDINATOR",
            Self::EntityLifecycle => "ENTITY_LIFECYCLE",
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationEventProducer {
    pub subsystem: SimulationEventSubsystem,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub enum SimulationEventParticipantRole {
    #[serde(rename = "ACTOR")]
    Actor,
    #[serde(rename = "SUBJECT")]
    Subject,
    #[serde(rename = "LAUNCHER")]
    Launcher,
    #[serde(rename = "WEAPON")]
    Weapon,
    #[serde(rename = "SENSOR")]
    Sensor,
}

impl SimulationEventParticipantRole {
    fn key(self) -> &'static str {
        match self {
            Self::Actor => "ACTOR",
            Self::Subject => "SUBJECT",
            Self::Launcher => "LAUNCHER",
            Self::Weapon => "WEAPON",
            Self::Sensor => "SENSOR",
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationEventParticipant {
    pub entity_id: String,
    pub role: SimulationEventParticipantRole,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub enum SimulationEventKnowledgeScope {
    #[serde(rename = "WORLD")]
    World,
}

impl SimulationEventKnowledgeScope {
    fn key(self) -> &'static str {
        "WORLD"
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind")]
pub enum SimulationEventPayload {
    #[serde(rename = "RUN_STARTED")]
    RunStarted {
        #[serde(rename = "schemaVersion")]
        schema_version: &'static str,
        #[serde(rename = "scenarioId")]
        scenario_id: String,
        #[serde(rename = "scenarioVersion")]
        scenario_version: String,
    },
    #[serde(rename = "ENTITY_ENTERED_WORLD")]
    EntityEnteredWorld {
        #[serde(rename = "schemaVersion")]
        schema_version: &'static str,
        #[serde(rename = "entityKind")]
        entity_kind: EntityKind,
        lifecycle: EntityLifecycle,
    },
    #[serde(rename = "ENTITY_LIFECYCLE_CHANGED")]
    EntityLifecycleChanged {
        #[serde(rename = "schemaVersion")]
        schema_version: &'static str,
        #[serde(rename = "entityKind")]
        entity_kind: EntityKind,
        from: EntityLifecycle,
        to: EntityLifecycle,
    },
    #[serde(rename = "RUN_COMPLETED")]
    RunCompleted {
        #[serde(rename = "schemaVersion")]
        schema_version: &'static str,
        termination: Termination,
    },
}

fn entity_kind_key(value: EntityKind) -> &'static str {
    match value {
        EntityKind::Aircraft => "AIRCRAFT",
        EntityKind::GuidedWeapon => "GUIDED_WEAPON",
        EntityKind::AirDefenceSystem => "AIR_DEFENCE_SYSTEM",
        EntityKind::Radar => "RADAR",
        EntityKind::SurfaceLauncher => "SURFACE_LAUNCHER",
        EntityKind::Base => "BASE",
        EntityKind::FixedObjective => "FIXED_OBJECTIVE",
    }
}

fn lifecycle_key(value: EntityLifecycle) -> &'static str {
    match value {
        EntityLifecycle::Stowed => "STOWED",
        EntityLifecycle::Active => "ACTIVE",
        EntityLifecycle::Tracking => "TRACKING",
        EntityLifecycle::Engaging => "ENGAGING",
        EntityLifecycle::Terminated => "TERMINATED",
    }
}

fn termination_key(value: Termination) -> &'static str {
    match value {
        Termination::ThresholdReached => "threshold_reached",
        Termination::EnergyDepleted => "energy_depleted",
        Termination::TargetUnavailable => "target_unavailable",
        Termination::TimeLimit => "time_limit",
        Termination::InvalidScenario => "invalid_scenario",
    }
}

impl SimulationEventPayload {
    fn rank(&self) -> u8 {
        match self {
            Self::RunStarted { .. } => 0,
            Self::EntityEnteredWorld { .. } => 1,
            Self::EntityLifecycleChanged { .. } => 2,
            Self::RunCompleted { .. } => 3,
        }
    }

    fn sort_key(&self) -> Result<String, EngineError> {
        let values: Vec<&str> = match self {
            Self::RunStarted {
                schema_version,
                scenario_id,
                scenario_version,
            } => vec!["0", schema_version, scenario_id, scenario_version],
            Self::EntityEnteredWorld {
                schema_version,
                entity_kind,
                lifecycle,
            } => vec![
                "1",
                schema_version,
                entity_kind_key(*entity_kind),
                lifecycle_key(*lifecycle),
            ],
            Self::EntityLifecycleChanged {
                schema_version,
                entity_kind,
                from,
                to,
            } => vec![
                "2",
                schema_version,
                entity_kind_key(*entity_kind),
                lifecycle_key(*from),
                lifecycle_key(*to),
            ],
            Self::RunCompleted {
                schema_version,
                termination,
            } => vec!["3", schema_version, termination_key(*termination)],
        };
        serde_json::to_string(&values).map_err(|error| {
            EngineError::Serialization(format!(
                "could not encode simulation event payload key: {error}"
            ))
        })
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationEventV2 {
    pub schema_version: &'static str,
    pub id: String,
    pub sequence: usize,
    pub local_key: String,
    pub tick: u64,
    pub model_time_seconds: f64,
    pub frame_index: usize,
    pub phase: SimulationEventPhase,
    pub producer: SimulationEventProducer,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub owner_affiliation: Option<Affiliation>,
    pub knowledge_scope: SimulationEventKnowledgeScope,
    pub participants: Vec<SimulationEventParticipant>,
    pub cause_event_ids: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub correlation_id: Option<String>,
    pub payload: SimulationEventPayload,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationEventStream {
    pub state: &'static str,
    pub schema_version: &'static str,
    pub items: Vec<SimulationEventV2>,
}

impl SimulationEventStream {
    pub fn available(items: Vec<SimulationEventV2>) -> Self {
        Self {
            state: "AVAILABLE",
            schema_version: SIMULATION_EVENT_SCHEMA,
            items,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SimulationEventReceipt {
    pub tick: u64,
    pub local_key: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
// The delivered lifecycle producers have no causal edge yet. These variants
// are exercised by the journal contract tests and are consumed by #26/#28/#38.
#[allow(dead_code)]
pub enum SimulationEventCauseReference {
    EventReceipt(SimulationEventReceipt),
}

#[derive(Clone, Debug)]
pub struct SimulationEventDraft {
    pub local_key: String,
    pub tick: u64,
    pub model_time_seconds: f64,
    pub phase: SimulationEventPhase,
    pub producer: SimulationEventProducer,
    pub knowledge_scope: SimulationEventKnowledgeScope,
    pub participants: Vec<SimulationEventParticipant>,
    pub causes: Vec<SimulationEventCauseReference>,
    pub correlation_id: Option<String>,
    pub payload: SimulationEventPayload,
}

impl SimulationEventDraft {
    pub fn run_started(tick: u64, time: f64, scenario_id: &str, version: &str) -> Self {
        Self {
            local_key: "run-started".to_string(),
            tick,
            model_time_seconds: time,
            phase: SimulationEventPhase::Lifecycle,
            producer: SimulationEventProducer {
                subsystem: SimulationEventSubsystem::RunCoordinator,
                entity_id: None,
            },
            knowledge_scope: SimulationEventKnowledgeScope::World,
            participants: Vec::new(),
            causes: Vec::new(),
            correlation_id: None,
            payload: SimulationEventPayload::RunStarted {
                schema_version: RUN_STARTED_PAYLOAD_SCHEMA,
                scenario_id: scenario_id.to_string(),
                scenario_version: version.to_string(),
            },
        }
    }

    pub fn entity_entered(
        tick: u64,
        time: f64,
        entity_id: &str,
        entity_kind: EntityKind,
        lifecycle: EntityLifecycle,
    ) -> Self {
        Self {
            local_key: format!("entity-entered:{entity_id}"),
            tick,
            model_time_seconds: time,
            phase: SimulationEventPhase::Lifecycle,
            producer: SimulationEventProducer {
                subsystem: SimulationEventSubsystem::EntityLifecycle,
                entity_id: Some(entity_id.to_string()),
            },
            knowledge_scope: SimulationEventKnowledgeScope::World,
            participants: vec![SimulationEventParticipant {
                entity_id: entity_id.to_string(),
                role: SimulationEventParticipantRole::Subject,
            }],
            causes: Vec::new(),
            correlation_id: None,
            payload: SimulationEventPayload::EntityEnteredWorld {
                schema_version: ENTITY_ENTERED_PAYLOAD_SCHEMA,
                entity_kind,
                lifecycle,
            },
        }
    }

    pub fn lifecycle_changed(
        tick: u64,
        time: f64,
        entity_id: &str,
        entity_kind: EntityKind,
        from: EntityLifecycle,
        to: EntityLifecycle,
    ) -> Self {
        Self {
            local_key: format!(
                "entity-lifecycle:{entity_id}:{}:{}",
                lifecycle_key(from),
                lifecycle_key(to)
            ),
            tick,
            model_time_seconds: time,
            phase: if to == EntityLifecycle::Terminated {
                SimulationEventPhase::Termination
            } else {
                SimulationEventPhase::Lifecycle
            },
            producer: SimulationEventProducer {
                subsystem: SimulationEventSubsystem::EntityLifecycle,
                entity_id: Some(entity_id.to_string()),
            },
            knowledge_scope: SimulationEventKnowledgeScope::World,
            participants: vec![SimulationEventParticipant {
                entity_id: entity_id.to_string(),
                role: SimulationEventParticipantRole::Subject,
            }],
            causes: Vec::new(),
            correlation_id: None,
            payload: SimulationEventPayload::EntityLifecycleChanged {
                schema_version: LIFECYCLE_CHANGED_PAYLOAD_SCHEMA,
                entity_kind,
                from,
                to,
            },
        }
    }

    pub fn run_completed(tick: u64, time: f64, termination: Termination) -> Self {
        Self {
            local_key: "run-completed".to_string(),
            tick,
            model_time_seconds: time,
            phase: SimulationEventPhase::Termination,
            producer: SimulationEventProducer {
                subsystem: SimulationEventSubsystem::RunCoordinator,
                entity_id: None,
            },
            knowledge_scope: SimulationEventKnowledgeScope::World,
            participants: Vec::new(),
            causes: Vec::new(),
            correlation_id: None,
            payload: SimulationEventPayload::RunCompleted {
                schema_version: RUN_COMPLETED_PAYLOAD_SCHEMA,
                termination,
            },
        }
    }
}

fn normalize_participants(participants: &mut Vec<SimulationEventParticipant>) {
    participants.sort_by(|left, right| {
        left.entity_id
            .cmp(&right.entity_id)
            .then_with(|| left.role.key().cmp(right.role.key()))
    });
    participants
        .dedup_by(|left, right| left.entity_id == right.entity_id && left.role == right.role);
}

fn participants_key(participants: &[SimulationEventParticipant]) -> String {
    participants
        .iter()
        .map(|participant| format!("{}:{}", participant.entity_id, participant.role.key()))
        .collect::<Vec<_>>()
        .join("|")
}

fn causes_key(causes: &[SimulationEventCauseReference]) -> String {
    let mut values = causes
        .iter()
        .map(|cause| match cause {
            SimulationEventCauseReference::EventReceipt(receipt) => {
                format!("RECEIPT:{}:{}", receipt.tick, receipt.local_key)
            }
        })
        .collect::<Vec<_>>();
    values.sort();
    values.join("|")
}

fn draft_sort_key(draft: &SimulationEventDraft) -> Result<String, EngineError> {
    Ok([
        (draft.phase as u8).to_string(),
        draft.payload.rank().to_string(),
        draft.payload.sort_key()?,
        draft.producer.subsystem.key().to_string(),
        draft.producer.entity_id.clone().unwrap_or_default(),
        participants_key(&draft.participants),
        draft.knowledge_scope.key().to_string(),
        String::new(),
        draft.correlation_id.clone().unwrap_or_default(),
        draft.local_key.clone(),
        causes_key(&draft.causes),
    ]
    .join("\u{1}"))
}

#[derive(Default)]
pub struct SimulationEventJournal {
    committed: Vec<SimulationEventV2>,
    committed_sequence_by_receipt: HashMap<(u64, String), usize>,
    pending: Vec<SimulationEventDraft>,
}

impl SimulationEventJournal {
    pub fn emit(
        &mut self,
        mut event: SimulationEventDraft,
    ) -> Result<SimulationEventReceipt, EngineError> {
        if !event.model_time_seconds.is_finite()
            || event.model_time_seconds < 0.0
            || event.local_key.is_empty()
        {
            return Err(EngineError::InvalidScenario(
                "simulation event time and local key must be valid".to_string(),
            ));
        }
        normalize_participants(&mut event.participants);
        let mut unique_causes = HashSet::new();
        for cause in &event.causes {
            match cause {
                SimulationEventCauseReference::EventReceipt(receipt) => {
                    if receipt.local_key.trim().is_empty() {
                        return Err(EngineError::InvalidScenario(
                            "simulation event receipt local key must not be empty".to_string(),
                        ));
                    }
                    if !unique_causes.insert((receipt.tick, receipt.local_key.clone())) {
                        return Err(EngineError::InvalidScenario(
                            "simulation event causal references must be unique".to_string(),
                        ));
                    }
                }
            }
        }
        let receipt = SimulationEventReceipt {
            tick: event.tick,
            local_key: event.local_key.clone(),
        };
        self.pending.push(event);
        Ok(receipt)
    }

    pub fn has_pending(&self) -> bool {
        !self.pending.is_empty()
    }

    // Delivered producers are cause-free; #26/#28/#38 will consume this after
    // carrying the receipt across their committed subsystem boundaries.
    #[allow(dead_code)]
    pub fn resolve_receipt(&self, receipt: &SimulationEventReceipt) -> Result<String, EngineError> {
        let sequence = self
            .committed_sequence_by_receipt
            .get(&(receipt.tick, receipt.local_key.clone()))
            .ok_or_else(|| {
                EngineError::InvalidScenario("simulation event receipt is unresolved".to_string())
            })?;
        Ok(format!("event-{sequence:06}"))
    }

    pub fn commit_tick(
        &mut self,
        tick: u64,
        time: f64,
        frame_index: usize,
    ) -> Result<(), EngineError> {
        if self.committed.len() + self.pending.len() > MAX_SIMULATION_EVENTS {
            return Err(EngineError::InvalidScenario(format!(
                "simulation event stream exceeds {MAX_SIMULATION_EVENTS} events"
            )));
        }
        if self
            .pending
            .iter()
            .any(|event| event.tick != tick || event.model_time_seconds != time)
        {
            return Err(EngineError::InvalidScenario(
                "simulation event tick commit does not match its pending event time".to_string(),
            ));
        }
        let mut keyed = std::mem::take(&mut self.pending)
            .into_iter()
            .map(|event| {
                let key = draft_sort_key(&event)?;
                Ok((key, event))
            })
            .collect::<Result<Vec<_>, EngineError>>()?;
        keyed.sort_by(|left, right| left.0.cmp(&right.0));
        let mut local_index = HashMap::new();
        let mut duplicate_transitions = HashSet::new();
        for (index, (_, event)) in keyed.iter().enumerate() {
            if local_index.insert(event.local_key.clone(), index).is_some() {
                return Err(EngineError::InvalidScenario(format!(
                    "simulation event tick repeats local key {}",
                    event.local_key
                )));
            }
            let duplicate_key = serde_json::to_string(&(
                event.tick,
                &event.producer,
                &event.participants,
                &event.payload,
            ))
            .map_err(|error| {
                EngineError::Serialization(format!(
                    "could not encode simulation event duplicate key: {error}"
                ))
            })?;
            if !duplicate_transitions.insert(duplicate_key) {
                return Err(EngineError::InvalidScenario(
                    "simulation event stream contains a duplicate transition".to_string(),
                ));
            }
        }
        let committed_base = self.committed.len();
        for (index, (_, draft)) in keyed.into_iter().enumerate() {
            let mut cause_sequences = Vec::new();
            for cause in &draft.causes {
                let sequence = match cause {
                    SimulationEventCauseReference::EventReceipt(receipt) => {
                        if receipt.tick > tick {
                            return Err(EngineError::InvalidScenario(
                                "simulation event receipt is future or cyclic".to_string(),
                            ));
                        }
                        if receipt.tick < tick {
                            *self
                                .committed_sequence_by_receipt
                                .get(&(receipt.tick, receipt.local_key.clone()))
                                .ok_or_else(|| {
                                    EngineError::InvalidScenario(
                                        "simulation event receipt is unresolved".to_string(),
                                    )
                                })?
                        } else {
                            let cause_index =
                                *local_index.get(&receipt.local_key).ok_or_else(|| {
                                    EngineError::InvalidScenario(
                                        "simulation event receipt is unresolved".to_string(),
                                    )
                                })?;
                            if cause_index >= index {
                                return Err(EngineError::InvalidScenario(
                                    "simulation event receipt is future or cyclic".to_string(),
                                ));
                            }
                            committed_base + cause_index
                        }
                    }
                };
                cause_sequences.push(sequence);
            }
            cause_sequences.sort_unstable();
            cause_sequences.dedup();
            if cause_sequences.len() != draft.causes.len() {
                return Err(EngineError::InvalidScenario(
                    "simulation event causal references resolve to a duplicate event".to_string(),
                ));
            }
            let cause_event_ids = cause_sequences
                .iter()
                .map(|sequence| format!("event-{sequence:06}"))
                .collect();
            let sequence = self.committed.len();
            let id = format!("event-{sequence:06}");
            self.committed_sequence_by_receipt
                .insert((tick, draft.local_key.clone()), sequence);
            self.committed.push(SimulationEventV2 {
                schema_version: SIMULATION_EVENT_SCHEMA,
                id,
                sequence,
                local_key: draft.local_key,
                tick,
                model_time_seconds: time,
                frame_index,
                phase: draft.phase,
                producer: draft.producer,
                owner_affiliation: None,
                knowledge_scope: draft.knowledge_scope,
                participants: draft.participants,
                cause_event_ids,
                correlation_id: draft.correlation_id,
                payload: draft.payload,
            });
        }
        Ok(())
    }

    pub fn into_items(self) -> Result<Vec<SimulationEventV2>, EngineError> {
        if !self.pending.is_empty() {
            return Err(EngineError::InvalidScenario(
                "simulation event journal has uncommitted tick events".to_string(),
            ));
        }
        Ok(self.committed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn participants_are_canonical_and_same_tick_causes_resolve() -> Result<(), EngineError> {
        let mut journal = SimulationEventJournal::default();
        let mut start = SimulationEventDraft::run_started(0, 0.0, "scenario", "1");
        start.participants = vec![
            SimulationEventParticipant {
                entity_id: "z".to_string(),
                role: SimulationEventParticipantRole::Subject,
            },
            SimulationEventParticipant {
                entity_id: "z".to_string(),
                role: SimulationEventParticipantRole::Actor,
            },
            SimulationEventParticipant {
                entity_id: "a".to_string(),
                role: SimulationEventParticipantRole::Actor,
            },
            SimulationEventParticipant {
                entity_id: "z".to_string(),
                role: SimulationEventParticipantRole::Subject,
            },
        ];
        let reference = journal.emit(start)?;
        let mut completed = SimulationEventDraft::run_completed(0, 0.0, Termination::TimeLimit);
        completed
            .causes
            .push(SimulationEventCauseReference::EventReceipt(reference));
        journal.emit(completed)?;
        journal.commit_tick(0, 0.0, 0)?;
        let events = journal.into_items()?;
        assert_eq!(events[0].participants.len(), 3);
        assert_eq!(
            events[0].participants[1].role,
            SimulationEventParticipantRole::Actor
        );
        assert_eq!(
            events[0].participants[2].role,
            SimulationEventParticipantRole::Subject
        );
        assert_eq!(events[1].cause_event_ids, vec!["event-000000"]);
        Ok(())
    }

    #[test]
    fn future_and_cyclic_same_tick_causes_fail_closed() -> Result<(), EngineError> {
        let mut journal = SimulationEventJournal::default();
        let mut start = SimulationEventDraft::run_started(0, 0.0, "scenario", "1");
        start
            .causes
            .push(SimulationEventCauseReference::EventReceipt(
                SimulationEventReceipt {
                    tick: 0,
                    local_key: "run-completed".to_string(),
                },
            ));
        journal.emit(start)?;
        let mut completed = SimulationEventDraft::run_completed(0, 0.0, Termination::TimeLimit);
        completed
            .causes
            .push(SimulationEventCauseReference::EventReceipt(
                SimulationEventReceipt {
                    tick: 0,
                    local_key: "run-started".to_string(),
                },
            ));
        journal.emit(completed)?;
        assert!(journal.commit_tick(0, 0.0, 0).is_err());
        Ok(())
    }

    #[test]
    fn duplicate_causal_receipts_fail_closed_before_journal_admission() {
        let mut journal = SimulationEventJournal::default();
        let receipt = SimulationEventReceipt {
            tick: 0,
            local_key: "run-started".to_string(),
        };
        let mut completed = SimulationEventDraft::run_completed(0, 0.0, Termination::TimeLimit);
        completed
            .causes
            .push(SimulationEventCauseReference::EventReceipt(receipt.clone()));
        completed
            .causes
            .push(SimulationEventCauseReference::EventReceipt(receipt));

        assert!(matches!(
            journal.emit(completed),
            Err(EngineError::InvalidScenario(message))
                if message.contains("causal references must be unique")
        ));
    }

    #[test]
    fn empty_causal_receipt_local_keys_fail_closed_before_journal_admission() {
        let mut journal = SimulationEventJournal::default();
        let mut completed = SimulationEventDraft::run_completed(0, 0.0, Termination::TimeLimit);
        completed
            .causes
            .push(SimulationEventCauseReference::EventReceipt(
                SimulationEventReceipt {
                    tick: 0,
                    local_key: " ".to_string(),
                },
            ));

        assert!(matches!(
            journal.emit(completed),
            Err(EngineError::InvalidScenario(message))
                if message.contains("receipt local key must not be empty")
        ));
    }

    #[test]
    fn causal_receipts_from_a_future_tick_fail_closed_at_commit() -> Result<(), EngineError> {
        let mut journal = SimulationEventJournal::default();
        let mut start = SimulationEventDraft::run_started(0, 0.0, "scenario", "1");
        start
            .causes
            .push(SimulationEventCauseReference::EventReceipt(
                SimulationEventReceipt {
                    tick: 1,
                    local_key: "future-event".to_string(),
                },
            ));
        journal.emit(start)?;

        assert!(matches!(
            journal.commit_tick(0, 0.0, 0),
            Err(EngineError::InvalidScenario(message)) if message.contains("future or cyclic")
        ));
        Ok(())
    }

    #[test]
    fn receipt_resolves_across_ticks_and_unresolved_receipts_fail() -> Result<(), EngineError> {
        let mut journal = SimulationEventJournal::default();
        let receipt = journal.emit(SimulationEventDraft::run_started(0, 0.0, "scenario", "1"))?;
        assert!(journal.resolve_receipt(&receipt).is_err());
        journal.commit_tick(0, 0.0, 0)?;
        assert_eq!(journal.resolve_receipt(&receipt)?, "event-000000");
        let mut completed = SimulationEventDraft::run_completed(1, 0.05, Termination::TimeLimit);
        completed
            .causes
            .push(SimulationEventCauseReference::EventReceipt(receipt));
        journal.emit(completed)?;
        journal.commit_tick(1, 0.05, 1)?;
        assert_eq!(journal.committed[1].cause_event_ids, vec!["event-000000"]);

        let mut unresolved = SimulationEventJournal::default();
        unresolved.emit(SimulationEventDraft::run_started(0, 0.0, "scenario", "1"))?;
        unresolved.commit_tick(0, 0.0, 0)?;
        let mut response = SimulationEventDraft::run_completed(1, 0.05, Termination::TimeLimit);
        response
            .causes
            .push(SimulationEventCauseReference::EventReceipt(
                SimulationEventReceipt {
                    tick: 0,
                    local_key: "not-emitted".to_string(),
                },
            ));
        unresolved.emit(response)?;
        assert!(unresolved.commit_tick(1, 0.05, 1).is_err());
        Ok(())
    }
}
