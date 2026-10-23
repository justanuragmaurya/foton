use serde::{Deserialize, Serialize};

use crate::document::{BlendMode, LayerId, Rect};

/// A serializable edit. The `type` tag doubles as the tool name exposed to the AI agent.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Command {
    /// Adds a layer above the active one and makes it active.
    #[serde(rename = "layer.add")]
    LayerAdd {
        #[serde(default)]
        name: Option<String>,
        #[serde(default)]
        color: Option<[f32; 4]>,
        #[serde(default)]
        bounds: Option<Rect>,
    },
    #[serde(rename = "layer.remove")]
    LayerRemove { id: LayerId },
    #[serde(rename = "layer.duplicate")]
    LayerDuplicate { id: LayerId },
    #[serde(rename = "layer.rename")]
    LayerRename { id: LayerId, name: String },
    #[serde(rename = "layer.setVisible")]
    LayerSetVisible { id: LayerId, visible: bool },
    #[serde(rename = "layer.setOpacity")]
    LayerSetOpacity { id: LayerId, opacity: f32 },
    #[serde(rename = "layer.setBlendMode")]
    LayerSetBlendMode {
        id: LayerId,
        #[serde(rename = "blendMode")]
        blend_mode: BlendMode,
    },
    /// Offsets a layer's content by whole document pixels.
    #[serde(rename = "layer.translate")]
    LayerTranslate { id: LayerId, dx: i32, dy: i32 },
    /// Moves a layer to `index` in bottom → top order.
    #[serde(rename = "layer.move")]
    LayerMove { id: LayerId, index: usize },
    /// Changes the active layer. Not recorded in history.
    #[serde(rename = "layer.select")]
    LayerSelect { id: LayerId },
}

impl Command {
    /// The label shown in the History panel, or `None` for commands that are not undoable.
    pub fn history_label(&self) -> Option<&'static str> {
        Some(match self {
            Command::LayerAdd { .. } => "New Layer",
            Command::LayerRemove { .. } => "Delete Layer",
            Command::LayerDuplicate { .. } => "Duplicate Layer",
            Command::LayerRename { .. } => "Rename Layer",
            Command::LayerSetVisible { .. } => "Layer Visibility",
            Command::LayerSetOpacity { .. } => "Layer Opacity",
            Command::LayerSetBlendMode { .. } => "Blending Change",
            Command::LayerTranslate { .. } => "Move",
            Command::LayerMove { .. } => "Layer Order",
            Command::LayerSelect { .. } => return None,
        })
    }
}
