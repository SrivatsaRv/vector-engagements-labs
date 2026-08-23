use std::collections::HashSet;

use serde::Serialize;

use crate::{Affiliation, EngineError, EntityKind, EntityLifecycle, Termination};

pub const SIMULATION_EVENT_SCHEMA: &str = "vector.simulation-event.v2";
pub const MAX_SIMULATION_EVENTS: usize = 100_000;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub enum SimulationEventPhase {
    #[serde(rename = "LIFECYCLE")]
    Lifecycle,
    #[serde(rename = "TERMINATION")]
    Termination,
}

impl SimulationEventPhase {
    fn rank(self) -> u8 {
        match self {
            Self::Lifecycle => 0,
            Self::Termination => 1,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub enum SimulationEventSubsystem {
    #[serde(rename = "RUN_COORDINATOR")]
    RunCoordinator,
    #[serde(rename = "ENTITY_LIFECYCLE")]
    EntityLifecycle,
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
    #[serde(rename = "SUBJECT")]
    Subject,
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

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind")]
pub enum SimulationEventPayload {
    #[serde(rename = "RUN_STARTED")]
    RunStarted {
        #[serde(rename = "scenarioId")]
        scenario_id: String,
        #[serde(rename = "scenarioVersion")]
        scenario_version: String,
    },
    #[serde(rename = "ENTITY_ENTERED_WORLD")]
    EntityEnteredWorld {
        #[serde(rename = "entityKind")]
        entity_kind: EntityKind,
        lifecycle: EntityLifecycle,
    },
    #[serde(rename = "ENTITY_LIFECYCLE_CHANGED")]
    EntityLifecycleChanged {
        #[serde(rename = "entityKind")]
        entity_kind: EntityKind,
        from: EntityLifecycle,
        to: EntityLifecycle,
    },
    #[serde(rename = "RUN_COMPLETED")]
    RunCompleted { termination: Termination },
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
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationEventV2 {
    pub schema_version: &'static str,
    pub id: String,
    pub sequence: usize,
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

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationEventDraft {
    pub tick: u64,
    pub model_time_seconds: f64,
    pub phase: SimulationEventPhase,
    pub producer: SimulationEventProducer,
    pub knowledge_scope: SimulationEventKnowledgeScope,
    pub participants: Vec<SimulationEventParticipant>,
    pub cause_event_ids: Vec<String>,
    pub payload: SimulationEventPayload,
    #[serde(skip)]
    pub local_ordinal: u32,
}

impl SimulationEventDraft {
    pub fn run_started(tick: u64, time: f64, scenario_id: &str, version: &str) -> Self {
        Self {
            tick,
            model_time_seconds: time,
            phase: SimulationEventPhase::Lifecycle,
            producer: SimulationEventProducer {
                subsystem: SimulationEventSubsystem::RunCoordinator,
                entity_id: None,
            },
            knowledge_scope: SimulationEventKnowledgeScope::World,
            participants: Vec::new(),
            cause_event_ids: Vec::new(),
            payload: SimulationEventPayload::RunStarted {
                scenario_id: scenario_id.to_string(),
                scenario_version: version.to_string(),
            },
            local_ordinal: 0,
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
            cause_event_ids: Vec::new(),
            payload: SimulationEventPayload::EntityEnteredWorld {
                entity_kind,
                lifecycle,
            },
            local_ordinal: 0,
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
            cause_event_ids: Vec::new(),
            payload: SimulationEventPayload::EntityLifecycleChanged {
                entity_kind,
                from,
                to,
            },
            local_ordinal: 0,
        }
    }

    pub fn run_completed(tick: u64, time: f64, termination: Termination) -> Self {
        Self {
            tick,
            model_time_seconds: time,
            phase: SimulationEventPhase::Termination,
            producer: SimulationEventProducer {
                subsystem: SimulationEventSubsystem::RunCoordinator,
                entity_id: None,
            },
            knowledge_scope: SimulationEventKnowledgeScope::World,
            participants: Vec::new(),
            cause_event_ids: Vec::new(),
            payload: SimulationEventPayload::RunCompleted { termination },
            local_ordinal: 0,
        }
    }
}

#[derive(Default)]
pub struct SimulationEventJournal {
    committed: Vec<SimulationEventV2>,
    committed_ids: HashSet<String>,
    pending: Vec<SimulationEventDraft>,
}

impl SimulationEventJournal {
    pub fn emit(&mut self, event: SimulationEventDraft) -> Result<(), EngineError> {
        if !event.model_time_seconds.is_finite() || event.model_time_seconds < 0.0 {
            return Err(EngineError::InvalidScenario(
                "simulation event model time must be finite and non-negative".to_string(),
            ));
        }
        if event.cause_event_ids.iter().collect::<HashSet<_>>().len() != event.cause_event_ids.len()
        {
            return Err(EngineError::InvalidScenario(
                "simulation event causal references must be unique".to_string(),
            ));
        }
        self.pending.push(event);
        Ok(())
    }

    pub fn has_pending(&self) -> bool {
        !self.pending.is_empty()
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
        let mut pending = std::mem::take(&mut self.pending);
        pending.sort_by(|left, right| {
            left.phase
                .rank()
                .cmp(&right.phase.rank())
                .then_with(|| left.payload.rank().cmp(&right.payload.rank()))
                .then_with(|| {
                    left.producer
                        .entity_id
                        .as_deref()
                        .unwrap_or("")
                        .cmp(right.producer.entity_id.as_deref().unwrap_or(""))
                })
                .then_with(|| {
                    let left_participant = left
                        .participants
                        .first()
                        .map(|participant| participant.entity_id.as_str())
                        .unwrap_or("");
                    let right_participant = right
                        .participants
                        .first()
                        .map(|participant| participant.entity_id.as_str())
                        .unwrap_or("");
                    left_participant.cmp(right_participant)
                })
                .then_with(|| left.local_ordinal.cmp(&right.local_ordinal))
        });
        let mut duplicate_keys = HashSet::new();
        for draft in pending {
            let duplicate_key = serde_json::to_string(&(
                draft.tick,
                &draft.producer,
                &draft.participants,
                &draft.payload,
            ))
            .map_err(|error| {
                EngineError::Serialization(format!(
                    "could not encode simulation event duplicate key: {error}"
                ))
            })?;
            if !duplicate_keys.insert(duplicate_key) {
                return Err(EngineError::InvalidScenario(
                    "simulation event stream contains a duplicate transition".to_string(),
                ));
            }
            if draft
                .cause_event_ids
                .iter()
                .any(|cause_id| !self.committed_ids.contains(cause_id))
            {
                return Err(EngineError::InvalidScenario(
                    "simulation event causal reference does not precede its response".to_string(),
                ));
            }
            let sequence = self.committed.len();
            let id = format!("event-{sequence:06}");
            self.committed_ids.insert(id.clone());
            self.committed.push(SimulationEventV2 {
                schema_version: SIMULATION_EVENT_SCHEMA,
                id,
                sequence,
                tick,
                model_time_seconds: time,
                frame_index,
                phase: draft.phase,
                producer: draft.producer,
                owner_affiliation: None,
                knowledge_scope: draft.knowledge_scope,
                participants: draft.participants,
                cause_event_ids: draft.cause_event_ids,
                correlation_id: None,
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
