//! Runs the real WGSL compositor on the host GPU and checks it against a CPU reference
//! of the W3C blend formulas. Skips when no adapter is available (e.g. GPU-less CI).

use foton_core::{BlendMode, Command, Editor, LayerContent, Rect};
use foton_render::{Compositor, wgpu};

const W: u32 = 64; // 64 px × 4 bytes = 256-byte rows, the copy alignment
const H: u32 = 4;
const TOLERANCE: f32 = 2.0 / 255.0;

fn gpu() -> Option<(wgpu::Device, wgpu::Queue)> {
    let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
        backends: wgpu::Backends::PRIMARY,
        ..wgpu::InstanceDescriptor::new_without_display_handle()
    });
    let adapter = pollster::block_on(instance.request_adapter(&Default::default())).ok()?;
    pollster::block_on(adapter.request_device(&Default::default())).ok()
}

fn read_back(compositor: &Compositor) -> Vec<[f32; 4]> {
    let device = compositor.device();
    let buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: None,
        size: (W * H * 4) as u64,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });
    let mut encoder = device.create_command_encoder(&Default::default());
    encoder.copy_texture_to_buffer(
        compositor.output_texture().as_image_copy(),
        wgpu::TexelCopyBufferInfo {
            buffer: &buffer,
            layout: wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(W * 4),
                rows_per_image: None,
            },
        },
        wgpu::Extent3d {
            width: W,
            height: H,
            depth_or_array_layers: 1,
        },
    );
    compositor.queue().submit([encoder.finish()]);
    buffer
        .slice(..)
        .map_async(wgpu::MapMode::Read, |r| r.unwrap());
    device.poll(wgpu::PollType::wait_indefinitely()).unwrap();
    let bytes = buffer.slice(..).get_mapped_range().unwrap();
    bytes
        .chunks(4)
        .map(|p| [p[0], p[1], p[2], p[3]].map(|c| c as f32 / 255.0))
        .collect()
}

fn reference(cb: f32, cs: f32, mode: BlendMode) -> f32 {
    let hard_light = |cb: f32, cs: f32| {
        if cs <= 0.5 {
            cb * 2.0 * cs
        } else {
            let s = 2.0 * cs - 1.0;
            cb + s - cb * s
        }
    };
    match mode {
        BlendMode::Normal => cs,
        BlendMode::Multiply => cb * cs,
        BlendMode::Screen => cb + cs - cb * cs,
        BlendMode::Overlay => hard_light(cs, cb),
        BlendMode::Darken => cb.min(cs),
        BlendMode::Lighten => cb.max(cs),
        BlendMode::ColorDodge => {
            if cb == 0.0 {
                0.0
            } else if cs >= 1.0 {
                1.0
            } else {
                (cb / (1.0 - cs)).min(1.0)
            }
        }
        BlendMode::ColorBurn => {
            if cb >= 1.0 {
                1.0
            } else if cs <= 0.0 {
                0.0
            } else {
                1.0 - ((1.0 - cb) / cs).min(1.0)
            }
        }
        BlendMode::HardLight => hard_light(cb, cs),
        BlendMode::SoftLight => {
            if cs <= 0.5 {
                cb - (1.0 - 2.0 * cs) * cb * (1.0 - cb)
            } else {
                let d = if cb <= 0.25 {
                    ((16.0 * cb - 12.0) * cb + 4.0) * cb
                } else {
                    cb.sqrt()
                };
                cb + (2.0 * cs - 1.0) * (d - cb)
            }
        }
        BlendMode::Difference => (cb - cs).abs(),
        BlendMode::Exclusion => cb + cs - 2.0 * cb * cs,
    }
}

fn assert_close(actual: [f32; 4], expected: [f32; 4], what: &str) {
    for c in 0..4 {
        assert!(
            (actual[c] - expected[c]).abs() <= TOLERANCE,
            "{what}: got {actual:?}, expected {expected:?}"
        );
    }
}

/// Background colour `cb` with one full-canvas layer of colour `cs` on top.
fn two_layer_editor(cb: [f32; 3], cs: [f32; 4]) -> (Editor, u32) {
    let mut editor = Editor::new(W, H);
    let background = editor.document().layers[0].id;
    editor
        .dispatch(Command::LayerRemove { id: background })
        .unwrap_err(); // last layer is protected
    editor
        .dispatch(Command::LayerAdd {
            name: None,
            color: Some(cs),
            bounds: Some(Rect {
                x: 0,
                y: 0,
                width: W,
                height: H,
            }),
        })
        .unwrap();
    let top = editor.document().active_layer.unwrap();
    // Recolour the background by replacing it with a fresh layer at the bottom.
    editor
        .dispatch(Command::LayerAdd {
            name: Some("bg".into()),
            color: Some([cb[0], cb[1], cb[2], 1.0]),
            bounds: Some(Rect {
                x: 0,
                y: 0,
                width: W,
                height: H,
            }),
        })
        .unwrap();
    let bg = editor.document().active_layer.unwrap();
    editor
        .dispatch(Command::LayerMove { id: bg, index: 0 })
        .unwrap();
    editor
        .dispatch(Command::LayerRemove { id: background })
        .unwrap();
    (editor, top)
}

#[test]
fn every_blend_mode_matches_the_reference() {
    let Some((device, queue)) = gpu() else {
        eprintln!("no GPU adapter; skipping");
        return;
    };
    let mut compositor = Compositor::new(device, queue, W, H);
    let cb = [0.2, 0.5, 0.8];
    let cs = [0.6, 0.3, 0.9, 1.0];
    let (mut editor, top) = two_layer_editor(cb, cs);

    let modes = [
        BlendMode::Normal,
        BlendMode::Multiply,
        BlendMode::Screen,
        BlendMode::Overlay,
        BlendMode::Darken,
        BlendMode::Lighten,
        BlendMode::ColorDodge,
        BlendMode::ColorBurn,
        BlendMode::HardLight,
        BlendMode::SoftLight,
        BlendMode::Difference,
        BlendMode::Exclusion,
    ];
    for mode in modes {
        editor
            .dispatch(Command::LayerSetBlendMode {
                id: top,
                blend_mode: mode,
            })
            .unwrap();
        compositor.composite(editor.document());
        let pixel = read_back(&compositor)[0];
        let expected = [0, 1, 2].map(|c| reference(cb[c], cs[c], mode));
        assert_close(
            pixel,
            [expected[0], expected[1], expected[2], 1.0],
            &format!("{mode:?}"),
        );
    }
}

#[test]
fn opacity_visibility_and_bounds() {
    let Some((device, queue)) = gpu() else {
        eprintln!("no GPU adapter; skipping");
        return;
    };
    let mut compositor = Compositor::new(device, queue, W, H);
    let (mut editor, top) = two_layer_editor([1.0, 1.0, 1.0], [0.0, 0.0, 0.0, 1.0]);

    editor
        .dispatch(Command::LayerSetOpacity {
            id: top,
            opacity: 0.5,
        })
        .unwrap();
    compositor.composite(editor.document());
    assert_close(
        read_back(&compositor)[0],
        [0.5, 0.5, 0.5, 1.0],
        "50% black over white",
    );

    editor
        .dispatch(Command::LayerSetVisible {
            id: top,
            visible: false,
        })
        .unwrap();
    compositor.composite(editor.document());
    assert_close(
        read_back(&compositor)[0],
        [1.0, 1.0, 1.0, 1.0],
        "hidden layer",
    );

    // A half-transparent layer over nothing stays premultiplied and partially transparent.
    let mut editor = Editor::new(W, H);
    let bg = editor.document().layers[0].id;
    editor
        .dispatch(Command::LayerSetVisible {
            id: bg,
            visible: false,
        })
        .unwrap();
    editor
        .dispatch(Command::LayerAdd {
            name: None,
            color: Some([1.0, 0.0, 0.0, 0.5]),
            bounds: Some(Rect {
                x: 0,
                y: 0,
                width: 8,
                height: H,
            }),
        })
        .unwrap();
    compositor.composite(editor.document());
    let pixels = read_back(&compositor);
    assert_close(pixels[0], [0.5, 0.0, 0.0, 0.5], "inside bounds");
    assert_close(pixels[8], [0.0, 0.0, 0.0, 0.0], "outside bounds");
    assert!(matches!(
        editor.document().layers[1].content,
        LayerContent::Solid { .. }
    ));
}
