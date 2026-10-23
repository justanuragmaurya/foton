use serde::{Deserialize, Serialize};

pub type LayerId = u32;

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// Separable and non-separable blend modes, numbered to match the WGSL compositor.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[repr(u32)]
pub enum BlendMode {
    #[default]
    Normal = 0,
    Multiply = 1,
    Screen = 2,
    Overlay = 3,
    Darken = 4,
    Lighten = 5,
    ColorDodge = 6,
    ColorBurn = 7,
    HardLight = 8,
    SoftLight = 9,
    Difference = 10,
    Exclusion = 11,
}

/// What a layer draws. Pixel layers backed by tiles arrive with the brush engine.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LayerContent {
    /// A solid colour (straight sRGB, 0–1) clipped to `bounds` in document pixels.
    Solid { color: [f32; 4], bounds: Rect },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Layer {
    pub id: LayerId,
    pub name: String,
    pub visible: bool,
    pub opacity: f32,
    pub blend_mode: BlendMode,
    pub content: LayerContent,
}

/// Layers are stored bottom → top, matching compositing order.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub width: u32,
    pub height: u32,
    pub layers: Vec<Layer>,
    pub active_layer: Option<LayerId>,
    pub(crate) next_id: LayerId,
}

impl Document {
    /// A new document with a white "Background" layer.
    pub fn new(width: u32, height: u32) -> Self {
        let mut doc = Self {
            width,
            height,
            layers: Vec::new(),
            active_layer: None,
            next_id: 1,
        };
        let bounds = Rect {
            x: 0,
            y: 0,
            width,
            height,
        };
        let id = doc.allocate_id();
        doc.layers.push(Layer {
            id,
            name: "Background".into(),
            visible: true,
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            content: LayerContent::Solid {
                color: [1.0, 1.0, 1.0, 1.0],
                bounds,
            },
        });
        doc.active_layer = Some(id);
        doc
    }

    pub(crate) fn allocate_id(&mut self) -> LayerId {
        let id = self.next_id;
        self.next_id += 1;
        id
    }

    pub fn index_of(&self, id: LayerId) -> Option<usize> {
        self.layers.iter().position(|l| l.id == id)
    }

    pub fn layer_mut(&mut self, id: LayerId) -> Option<&mut Layer> {
        self.layers.iter_mut().find(|l| l.id == id)
    }
}
