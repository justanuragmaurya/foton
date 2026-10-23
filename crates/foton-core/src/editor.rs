use serde::Serialize;
use thiserror::Error;

use crate::command::Command;
use crate::document::{Document, Layer, LayerContent, LayerId, Rect};

/// Matches the default "History States" preference of familiar editors.
const DEFAULT_MAX_STATES: usize = 50;

const NEW_LAYER_COLORS: [[f32; 4]; 6] = [
    [0.91, 0.30, 0.24, 1.0],
    [0.18, 0.55, 0.92, 1.0],
    [0.98, 0.76, 0.18, 1.0],
    [0.20, 0.74, 0.49, 1.0],
    [0.61, 0.35, 0.85, 1.0],
    [0.95, 0.52, 0.17, 1.0],
];

#[derive(Debug, Error, PartialEq)]
pub enum EditorError {
    #[error("layer {0} does not exist")]
    LayerNotFound(LayerId),
    #[error("a document must keep at least one layer")]
    LastLayer,
    #[error("opacity must be between 0 and 1, got {0}")]
    InvalidOpacity(f32),
}

#[derive(Clone, Debug, Serialize)]
pub struct HistoryEntry {
    pub label: &'static str,
    #[serde(skip)]
    command: Option<Command>,
    #[serde(skip)]
    document: Document,
}

/// What the UI needs to render panels: the document plus the history list.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot<'a> {
    pub document: &'a Document,
    pub history: &'a [HistoryEntry],
    pub history_index: usize,
}

/// Owns the document and its undo history. Each history state is a full document value;
/// layer pixel data will be shared copy-on-write tiles, so states stay cheap.
pub struct Editor {
    states: Vec<HistoryEntry>,
    cursor: usize,
    max_states: usize,
    gesture: Gesture,
}

/// A gesture (a drag, a brush stroke, scrubbing a slider) collapses every edit it makes
/// into the single history state created by its first edit.
#[derive(Clone, Copy, PartialEq)]
enum Gesture {
    Idle,
    Started,
    Recording,
}

impl Editor {
    pub fn new(width: u32, height: u32) -> Self {
        let document = Document::new(width, height);
        Self {
            states: vec![HistoryEntry {
                label: "New",
                command: None,
                document,
            }],
            cursor: 0,
            max_states: DEFAULT_MAX_STATES,
            gesture: Gesture::Idle,
        }
    }

    pub fn begin_gesture(&mut self) {
        self.gesture = Gesture::Started;
    }

    pub fn end_gesture(&mut self) {
        self.gesture = Gesture::Idle;
    }

    pub fn document(&self) -> &Document {
        &self.states[self.cursor].document
    }

    pub fn snapshot(&self) -> Snapshot<'_> {
        Snapshot {
            document: self.document(),
            history: &self.states,
            history_index: self.cursor,
        }
    }

    pub fn dispatch(&mut self, command: Command) -> Result<(), EditorError> {
        let Some(label) = command.history_label() else {
            return apply(&mut self.states[self.cursor].document, &command);
        };

        let mut next = self.document().clone();
        apply(&mut next, &command)?;

        if self.gesture == Gesture::Recording {
            let current = &mut self.states[self.cursor];
            current.document = next;
            current.command = Some(command);
            return Ok(());
        }
        if self.gesture == Gesture::Started {
            self.gesture = Gesture::Recording;
        }

        self.states.truncate(self.cursor + 1);
        self.states.push(HistoryEntry {
            label,
            command: Some(command),
            document: next,
        });
        if self.states.len() > self.max_states {
            self.states.remove(0);
        }
        self.cursor = self.states.len() - 1;
        Ok(())
    }

    pub fn undo(&mut self) -> bool {
        self.jump_to(self.cursor.wrapping_sub(1))
    }

    pub fn redo(&mut self) -> bool {
        self.jump_to(self.cursor + 1)
    }

    /// Moves to a history state, as clicking a row in the History panel does.
    pub fn jump_to(&mut self, index: usize) -> bool {
        if index >= self.states.len() || index == self.cursor {
            return false;
        }
        self.end_gesture();
        self.cursor = index;
        true
    }
}

fn apply(doc: &mut Document, command: &Command) -> Result<(), EditorError> {
    match command {
        Command::LayerAdd {
            name,
            color,
            bounds,
        } => {
            let id = doc.allocate_id();
            let n = doc.layers.len() as i32;
            let bounds = bounds.unwrap_or_else(|| {
                let (w, h) = (doc.width as i32, doc.height as i32);
                Rect {
                    x: w / 8 + (n * w / 16) % (w / 2),
                    y: h / 8 + (n * h / 16) % (h / 2),
                    width: doc.width / 2,
                    height: doc.height / 2,
                }
            });
            let color = color.unwrap_or(NEW_LAYER_COLORS[(id as usize) % NEW_LAYER_COLORS.len()]);
            let layer = Layer {
                id,
                name: name.clone().unwrap_or_else(|| format!("Layer {}", id - 1)),
                visible: true,
                opacity: 1.0,
                blend_mode: Default::default(),
                content: LayerContent::Solid { color, bounds },
            };
            let at = doc
                .active_layer
                .and_then(|a| doc.index_of(a))
                .map_or(doc.layers.len(), |i| i + 1);
            doc.layers.insert(at, layer);
            doc.active_layer = Some(id);
        }
        Command::LayerRemove { id } => {
            let index = doc.index_of(*id).ok_or(EditorError::LayerNotFound(*id))?;
            if doc.layers.len() == 1 {
                return Err(EditorError::LastLayer);
            }
            doc.layers.remove(index);
            if doc.active_layer == Some(*id) {
                doc.active_layer = Some(doc.layers[index.saturating_sub(1)].id);
            }
        }
        Command::LayerDuplicate { id } => {
            let index = doc.index_of(*id).ok_or(EditorError::LayerNotFound(*id))?;
            let mut copy = doc.layers[index].clone();
            copy.id = doc.allocate_id();
            copy.name = format!("{} copy", copy.name);
            doc.active_layer = Some(copy.id);
            doc.layers.insert(index + 1, copy);
        }
        Command::LayerRename { id, name } => {
            doc.layer_mut(*id)
                .ok_or(EditorError::LayerNotFound(*id))?
                .name = name.clone();
        }
        Command::LayerSetVisible { id, visible } => {
            doc.layer_mut(*id)
                .ok_or(EditorError::LayerNotFound(*id))?
                .visible = *visible;
        }
        Command::LayerSetOpacity { id, opacity } => {
            if !(0.0..=1.0).contains(opacity) {
                return Err(EditorError::InvalidOpacity(*opacity));
            }
            doc.layer_mut(*id)
                .ok_or(EditorError::LayerNotFound(*id))?
                .opacity = *opacity;
        }
        Command::LayerSetBlendMode { id, blend_mode } => {
            doc.layer_mut(*id)
                .ok_or(EditorError::LayerNotFound(*id))?
                .blend_mode = *blend_mode;
        }
        Command::LayerTranslate { id, dx, dy } => {
            let layer = doc.layer_mut(*id).ok_or(EditorError::LayerNotFound(*id))?;
            match &mut layer.content {
                LayerContent::Solid { bounds, .. } => {
                    bounds.x += dx;
                    bounds.y += dy;
                }
            }
        }
        Command::LayerMove { id, index } => {
            let from = doc.index_of(*id).ok_or(EditorError::LayerNotFound(*id))?;
            let layer = doc.layers.remove(from);
            doc.layers.insert((*index).min(doc.layers.len()), layer);
        }
        Command::LayerSelect { id } => {
            doc.index_of(*id).ok_or(EditorError::LayerNotFound(*id))?;
            doc.active_layer = Some(*id);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::BlendMode;

    fn add(editor: &mut Editor) -> LayerId {
        editor
            .dispatch(Command::LayerAdd {
                name: None,
                color: None,
                bounds: None,
            })
            .unwrap();
        editor.document().active_layer.unwrap()
    }

    #[test]
    fn new_layer_goes_above_active_and_is_named_sequentially() {
        let mut editor = Editor::new(800, 600);
        let first = add(&mut editor);
        let background = editor.document().layers[0].id;
        editor
            .dispatch(Command::LayerSelect { id: background })
            .unwrap();
        let second = add(&mut editor);

        let names: Vec<_> = editor
            .document()
            .layers
            .iter()
            .map(|l| l.name.as_str())
            .collect();
        assert_eq!(names, ["Background", "Layer 2", "Layer 1"]);
        assert_eq!(editor.document().layers[1].id, second);
        assert_eq!(editor.document().layers[2].id, first);
    }

    #[test]
    fn undo_redo_and_new_edit_truncates_redo() {
        let mut editor = Editor::new(100, 100);
        add(&mut editor);
        add(&mut editor);
        assert_eq!(editor.document().layers.len(), 3);

        assert!(editor.undo());
        assert_eq!(editor.document().layers.len(), 2);
        assert!(editor.redo());
        assert_eq!(editor.document().layers.len(), 3);

        editor.undo();
        let id = editor.document().layers[1].id;
        editor
            .dispatch(Command::LayerSetVisible { id, visible: false })
            .unwrap();
        assert!(!editor.redo(), "a new edit discards the redo branch");
        let labels: Vec<_> = editor.snapshot().history.iter().map(|h| h.label).collect();
        assert_eq!(labels, ["New", "New Layer", "Layer Visibility"]);
    }

    #[test]
    fn selection_is_not_a_history_state() {
        let mut editor = Editor::new(100, 100);
        add(&mut editor);
        let background = editor.document().layers[0].id;
        editor
            .dispatch(Command::LayerSelect { id: background })
            .unwrap();
        assert_eq!(editor.snapshot().history.len(), 2);
        assert_eq!(editor.document().active_layer, Some(background));
    }

    #[test]
    fn a_gesture_collapses_into_one_state() {
        let mut editor = Editor::new(100, 100);
        let id = add(&mut editor);
        let start = editor.document().layers[1].content.clone();

        editor.begin_gesture();
        for _ in 0..5 {
            editor
                .dispatch(Command::LayerTranslate { id, dx: 3, dy: -2 })
                .unwrap();
        }
        editor.end_gesture();
        let LayerContent::Solid { bounds, .. } = &editor.document().layers[1].content;
        let LayerContent::Solid { bounds: before, .. } = &start;
        assert_eq!((bounds.x - before.x, bounds.y - before.y), (15, -10));
        assert_eq!(editor.snapshot().history.len(), 3);

        // The next gesture starts a fresh state.
        editor.begin_gesture();
        editor
            .dispatch(Command::LayerSetOpacity { id, opacity: 0.4 })
            .unwrap();
        editor
            .dispatch(Command::LayerSetOpacity { id, opacity: 0.5 })
            .unwrap();
        editor.end_gesture();
        let labels: Vec<_> = editor.snapshot().history.iter().map(|h| h.label).collect();
        assert_eq!(labels, ["New", "New Layer", "Move", "Layer Opacity"]);

        editor.undo();
        assert_eq!(editor.document().layers[1].opacity, 1.0);
        editor.undo();
        assert_eq!(editor.document().layers[1].content, start);
    }

    #[test]
    fn edits_outside_a_gesture_are_separate_states() {
        let mut editor = Editor::new(100, 100);
        let id = add(&mut editor);
        editor
            .dispatch(Command::LayerSetOpacity { id, opacity: 0.4 })
            .unwrap();
        editor
            .dispatch(Command::LayerSetOpacity { id, opacity: 0.5 })
            .unwrap();
        assert_eq!(editor.snapshot().history.len(), 4);
    }

    #[test]
    fn cannot_remove_the_last_layer() {
        let mut editor = Editor::new(100, 100);
        let id = editor.document().layers[0].id;
        assert_eq!(
            editor.dispatch(Command::LayerRemove { id }),
            Err(EditorError::LastLayer)
        );
    }

    #[test]
    fn history_is_capped() {
        let mut editor = Editor::new(100, 100);
        let id = editor.document().layers[0].id;
        for i in 0..80 {
            editor
                .dispatch(Command::LayerSetVisible {
                    id,
                    visible: i % 2 == 0,
                })
                .unwrap();
        }
        assert_eq!(editor.snapshot().history.len(), DEFAULT_MAX_STATES);
    }

    #[test]
    fn commands_round_trip_through_json() {
        let json = r#"{"type":"layer.setBlendMode","id":3,"blendMode":"colorDodge"}"#;
        let cmd: Command = serde_json::from_str(json).unwrap();
        assert_eq!(
            cmd,
            Command::LayerSetBlendMode {
                id: 3,
                blend_mode: BlendMode::ColorDodge
            }
        );
        assert_eq!(serde_json::to_string(&cmd).unwrap(), json);
    }
}
