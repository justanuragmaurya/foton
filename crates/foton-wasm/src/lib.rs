//! WebAssembly entry point. The engine lives in a dedicated worker and draws into a
//! transferred `OffscreenCanvas`; the UI thread talks to it only through serialized commands.

#![cfg(target_arch = "wasm32")]

use foton_core::{Command, Editor};
use foton_render::{Compositor, Presenter, View, wgpu};
use serde::Serialize;
use wasm_bindgen::prelude::*;
use web_sys::OffscreenCanvas;

#[wasm_bindgen(start)]
fn start() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub struct Engine {
    editor: Editor,
    compositor: Compositor,
    presenter: Presenter,
    canvas: OffscreenCanvas,
    view: View,
    dirty: bool,
    backend: &'static str,
    max_texture_size: u32,
}

#[wasm_bindgen]
impl Engine {
    /// Picks WebGPU when the browser supports it and falls back to WebGL2 otherwise.
    pub async fn create(
        canvas: OffscreenCanvas,
        doc_width: u32,
        doc_height: u32,
    ) -> Result<Engine, JsError> {
        let instance = wgpu::util::new_instance_with_webgpu_detection(wgpu::InstanceDescriptor {
            backends: wgpu::Backends::BROWSER_WEBGPU | wgpu::Backends::GL,
            ..wgpu::InstanceDescriptor::new_without_display_handle()
        })
        .await;
        let surface =
            instance.create_surface(wgpu::SurfaceTarget::OffscreenCanvas(canvas.clone()))?;
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: Some(&surface),
                ..Default::default()
            })
            .await?;
        let limits = adapter.limits();
        let max_texture_size = limits.max_texture_dimension_2d;
        if doc_width > max_texture_size || doc_height > max_texture_size {
            return Err(JsError::new(&format!(
                "documents larger than {max_texture_size}px need tiled rendering"
            )));
        }
        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor {
                required_limits: limits,
                ..Default::default()
            })
            .await?;
        let backend = match adapter.get_info().backend {
            wgpu::Backend::BrowserWebGpu => "webgpu",
            wgpu::Backend::Gl => "webgl2",
            _ => "unknown",
        };

        let compositor = Compositor::new(device, queue, doc_width, doc_height);
        let presenter = Presenter::new(
            &compositor,
            &adapter,
            surface,
            canvas.width(),
            canvas.height(),
        );
        Ok(Engine {
            editor: Editor::new(doc_width, doc_height),
            compositor,
            presenter,
            canvas,
            view: View {
                zoom: 1.0,
                origin_x: 0.0,
                origin_y: 0.0,
            },
            dirty: true,
            backend,
            max_texture_size,
        })
    }

    #[wasm_bindgen(getter)]
    pub fn backend(&self) -> String {
        self.backend.into()
    }

    #[wasm_bindgen(getter, js_name = maxTextureSize)]
    pub fn max_texture_size(&self) -> u32 {
        self.max_texture_size
    }

    /// Applies a serialized [`Command`], e.g. `{ type: "layer.add" }`.
    pub fn dispatch(&mut self, command: JsValue) -> Result<(), JsError> {
        let command: Command = serde_wasm_bindgen::from_value(command)?;
        self.editor.dispatch(command)?;
        self.dirty = true;
        Ok(())
    }

    /// Edits until [`Engine::end_gesture`] collapse into one history state.
    #[wasm_bindgen(js_name = beginGesture)]
    pub fn begin_gesture(&mut self) {
        self.editor.begin_gesture();
    }

    #[wasm_bindgen(js_name = endGesture)]
    pub fn end_gesture(&mut self) {
        self.editor.end_gesture();
    }

    pub fn undo(&mut self) -> bool {
        let changed = self.editor.undo();
        self.dirty |= changed;
        changed
    }

    pub fn redo(&mut self) -> bool {
        let changed = self.editor.redo();
        self.dirty |= changed;
        changed
    }

    #[wasm_bindgen(js_name = jumpTo)]
    pub fn jump_to(&mut self, index: usize) -> bool {
        let changed = self.editor.jump_to(index);
        self.dirty |= changed;
        changed
    }

    /// The document and history, shaped for the UI's panels.
    pub fn snapshot(&self) -> Result<JsValue, JsError> {
        let serializer = serde_wasm_bindgen::Serializer::json_compatible();
        Ok(self.editor.snapshot().serialize(&serializer)?)
    }

    #[wasm_bindgen(js_name = setView)]
    pub fn set_view(&mut self, zoom: f32, origin_x: f32, origin_y: f32) {
        self.view = View {
            zoom,
            origin_x,
            origin_y,
        };
    }

    /// Resizes the drawing buffer, in physical pixels.
    pub fn resize(&mut self, width: u32, height: u32) {
        self.canvas.set_width(width.max(1));
        self.canvas.set_height(height.max(1));
        self.presenter
            .resize(self.compositor.device(), width, height);
    }

    /// Re-composites if the document changed, then draws the viewport.
    pub fn render(&mut self) {
        if self.dirty {
            self.compositor.composite(self.editor.document());
            self.dirty = false;
        }
        self.presenter.present(&self.compositor, self.view);
    }
}
