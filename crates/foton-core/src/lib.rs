//! Foton's document model.
//!
//! Every mutation goes through a serializable [`Command`], so the same code path serves
//! the UI, undo/redo, recorded actions and the AI agent.

mod command;
mod document;
mod editor;

pub use command::Command;
pub use document::{BlendMode, Document, Layer, LayerContent, LayerId, Rect};
pub use editor::{Editor, EditorError, HistoryEntry, Snapshot};
