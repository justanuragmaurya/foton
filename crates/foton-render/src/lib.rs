//! GPU compositing for Foton documents.
//!
//! [`Compositor`] flattens a [`Document`] into a premultiplied RGBA texture by ping-ponging
//! between two targets, one pass per visible layer. [`Presenter`] draws that texture into a
//! surface with the current zoom and pan. Splitting them keeps compositing usable headless
//! (export, tests) and lets the view change without re-compositing.

use bytemuck::{Pod, Zeroable};
use foton_core::{Document, LayerContent};

pub use wgpu;

const TARGET_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;
/// Dynamic uniform offsets must be multiples of this on every backend we target.
const UNIFORM_STRIDE: u64 = 256;

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct LayerUniform {
    color: [f32; 4],
    bounds: [f32; 4],
    opacity: f32,
    mode: u32,
    _pad: [u32; 2],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct ViewUniform {
    doc_size: [f32; 2],
    origin: [f32; 2],
    zoom: f32,
    srgb_target: u32,
    _pad: [u32; 2],
}

/// Viewport state, in physical pixels.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct View {
    pub zoom: f32,
    pub origin_x: f32,
    pub origin_y: f32,
}

struct Target {
    texture: wgpu::Texture,
    view: wgpu::TextureView,
}

pub struct Compositor {
    device: wgpu::Device,
    queue: wgpu::Queue,
    pipeline: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    uniforms: wgpu::Buffer,
    uniform_capacity: u64,
    targets: [Target; 2],
    size: (u32, u32),
    /// Index into `targets` holding the latest result.
    front: usize,
}

impl Compositor {
    pub fn new(device: wgpu::Device, queue: wgpu::Queue, width: u32, height: u32) -> Self {
        let shader = device.create_shader_module(wgpu::include_wgsl!("composite.wgsl"));
        let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("composite"),
            entries: &[
                texture_entry(0),
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: true,
                        min_binding_size: wgpu::BufferSize::new(size_of::<LayerUniform>() as u64),
                    },
                    count: None,
                },
            ],
        });
        let pipeline = fullscreen_pipeline(&device, &shader, &layout, TARGET_FORMAT, "composite");
        let uniform_capacity = 16;
        let uniforms = create_uniform_buffer(&device, uniform_capacity);
        let targets = [
            create_target(&device, width, height),
            create_target(&device, width, height),
        ];
        Self {
            device,
            queue,
            pipeline,
            layout,
            uniforms,
            uniform_capacity,
            targets,
            size: (width, height),
            front: 0,
        }
    }

    pub fn device(&self) -> &wgpu::Device {
        &self.device
    }

    pub fn queue(&self) -> &wgpu::Queue {
        &self.queue
    }

    pub fn size(&self) -> (u32, u32) {
        self.size
    }

    /// The texture holding the most recent composite.
    pub fn output(&self) -> &wgpu::TextureView {
        &self.targets[self.front].view
    }

    pub fn output_texture(&self) -> &wgpu::Texture {
        &self.targets[self.front].texture
    }

    pub fn composite(&mut self, doc: &Document) {
        if self.size != (doc.width, doc.height) {
            self.size = (doc.width, doc.height);
            self.targets = [
                create_target(&self.device, doc.width, doc.height),
                create_target(&self.device, doc.width, doc.height),
            ];
        }

        let layers: Vec<LayerUniform> = doc
            .layers
            .iter()
            .filter(|l| l.visible && l.opacity > 0.0)
            .map(|l| match &l.content {
                LayerContent::Solid { color, bounds } => LayerUniform {
                    color: *color,
                    bounds: [
                        bounds.x as f32,
                        bounds.y as f32,
                        bounds.width as f32,
                        bounds.height as f32,
                    ],
                    opacity: l.opacity,
                    mode: l.blend_mode as u32,
                    _pad: [0; 2],
                },
            })
            .collect();

        if layers.len() as u64 > self.uniform_capacity {
            self.uniform_capacity = (layers.len() as u64).next_power_of_two();
            self.uniforms = create_uniform_buffer(&self.device, self.uniform_capacity);
        }
        let mut staging = vec![0u8; layers.len() * UNIFORM_STRIDE as usize];
        for (i, layer) in layers.iter().enumerate() {
            let at = i * UNIFORM_STRIDE as usize;
            staging[at..at + size_of::<LayerUniform>()].copy_from_slice(bytemuck::bytes_of(layer));
        }
        self.queue.write_buffer(&self.uniforms, 0, &staging);

        let bind_groups = [0, 1].map(|source| {
            self.device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("composite"),
                layout: &self.layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: wgpu::BindingResource::TextureView(&self.targets[source].view),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: wgpu::BindingResource::Buffer(wgpu::BufferBinding {
                            buffer: &self.uniforms,
                            offset: 0,
                            size: wgpu::BufferSize::new(size_of::<LayerUniform>() as u64),
                        }),
                    },
                ],
            })
        });

        let mut encoder = self.device.create_command_encoder(&Default::default());
        clear(&mut encoder, &self.targets[0].view);
        let mut front = 0;
        for i in 0..layers.len() {
            let back = 1 - front;
            let mut pass = begin_pass(&mut encoder, &self.targets[back].view, wgpu::LoadOp::Load);
            pass.set_pipeline(&self.pipeline);
            pass.set_bind_group(
                0,
                &bind_groups[front],
                &[(i as u64 * UNIFORM_STRIDE) as u32],
            );
            pass.draw(0..3, 0..1);
            drop(pass);
            front = back;
        }
        self.front = front;
        self.queue.submit([encoder.finish()]);
    }
}

pub struct Presenter {
    surface: wgpu::Surface<'static>,
    config: wgpu::SurfaceConfiguration,
    pipeline: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    uniform: wgpu::Buffer,
}

impl Presenter {
    pub fn new(
        compositor: &Compositor,
        adapter: &wgpu::Adapter,
        surface: wgpu::Surface<'static>,
        width: u32,
        height: u32,
    ) -> Self {
        let device = &compositor.device;
        let caps = surface.get_capabilities(adapter);
        let mut config = surface
            .get_default_config(adapter, width.max(1), height.max(1))
            .expect("surface is not supported by the adapter");
        // Prefer a non-sRGB format: composite values are already sRGB-encoded.
        if let Some(format) = caps.formats.iter().copied().find(|f| !f.is_srgb()) {
            config.format = format;
        }
        surface.configure(device, &config);

        let shader = device.create_shader_module(wgpu::include_wgsl!("present.wgsl"));
        let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("present"),
            entries: &[
                texture_entry(0),
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });
        let pipeline = fullscreen_pipeline(device, &shader, &layout, config.format, "present");
        let uniform = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("view"),
            size: size_of::<ViewUniform>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        Self {
            surface,
            config,
            pipeline,
            layout,
            uniform,
        }
    }

    pub fn resize(&mut self, device: &wgpu::Device, width: u32, height: u32) {
        self.config.width = width.max(1);
        self.config.height = height.max(1);
        self.surface.configure(device, &self.config);
    }

    pub fn present(&mut self, compositor: &Compositor, view: View) {
        let (w, h) = compositor.size();
        let uniform = ViewUniform {
            doc_size: [w as f32, h as f32],
            origin: [view.origin_x, view.origin_y],
            zoom: view.zoom,
            srgb_target: self.config.format.is_srgb() as u32,
            _pad: [0; 2],
        };
        compositor
            .queue
            .write_buffer(&self.uniform, 0, bytemuck::bytes_of(&uniform));

        let frame = match self.surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(frame)
            | wgpu::CurrentSurfaceTexture::Suboptimal(frame) => frame,
            wgpu::CurrentSurfaceTexture::Outdated | wgpu::CurrentSurfaceTexture::Lost => {
                self.surface.configure(&compositor.device, &self.config);
                return;
            }
            _ => return,
        };
        let target = frame.texture.create_view(&Default::default());
        let bind_group = compositor
            .device
            .create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("present"),
                layout: &self.layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: wgpu::BindingResource::TextureView(compositor.output()),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: self.uniform.as_entire_binding(),
                    },
                ],
            });
        let mut encoder = compositor
            .device
            .create_command_encoder(&Default::default());
        let mut pass = begin_pass(
            &mut encoder,
            &target,
            wgpu::LoadOp::Clear(wgpu::Color::BLACK),
        );
        pass.set_pipeline(&self.pipeline);
        pass.set_bind_group(0, &bind_group, &[]);
        pass.draw(0..3, 0..1);
        drop(pass);
        compositor.queue.submit([encoder.finish()]);
        compositor.queue.present(frame);
    }
}

fn texture_entry(binding: u32) -> wgpu::BindGroupLayoutEntry {
    wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Texture {
            sample_type: wgpu::TextureSampleType::Float { filterable: false },
            view_dimension: wgpu::TextureViewDimension::D2,
            multisampled: false,
        },
        count: None,
    }
}

fn fullscreen_pipeline(
    device: &wgpu::Device,
    shader: &wgpu::ShaderModule,
    layout: &wgpu::BindGroupLayout,
    format: wgpu::TextureFormat,
    label: &str,
) -> wgpu::RenderPipeline {
    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some(label),
        bind_group_layouts: &[Some(layout)],
        immediate_size: 0,
    });
    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some(label),
        layout: Some(&pipeline_layout),
        vertex: wgpu::VertexState {
            module: shader,
            entry_point: Some("vs_main"),
            compilation_options: Default::default(),
            buffers: &[],
        },
        primitive: Default::default(),
        depth_stencil: None,
        multisample: Default::default(),
        fragment: Some(wgpu::FragmentState {
            module: shader,
            entry_point: Some("fs_main"),
            compilation_options: Default::default(),
            targets: &[Some(format.into())],
        }),
        multiview_mask: None,
        cache: None,
    })
}

fn create_target(device: &wgpu::Device, width: u32, height: u32) -> Target {
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("composite"),
        size: wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: TARGET_FORMAT,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT
            | wgpu::TextureUsages::TEXTURE_BINDING
            | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    });
    let view = texture.create_view(&Default::default());
    Target { texture, view }
}

fn create_uniform_buffer(device: &wgpu::Device, layers: u64) -> wgpu::Buffer {
    device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("layer uniforms"),
        size: layers * UNIFORM_STRIDE,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    })
}

fn clear(encoder: &mut wgpu::CommandEncoder, view: &wgpu::TextureView) {
    drop(begin_pass(
        encoder,
        view,
        wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
    ));
}

fn begin_pass<'e>(
    encoder: &'e mut wgpu::CommandEncoder,
    view: &wgpu::TextureView,
    load: wgpu::LoadOp<wgpu::Color>,
) -> wgpu::RenderPass<'e> {
    encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: None,
        color_attachments: &[Some(wgpu::RenderPassColorAttachment {
            view,
            depth_slice: None,
            resolve_target: None,
            ops: wgpu::Operations {
                load,
                store: wgpu::StoreOp::Store,
            },
        })],
        depth_stencil_attachment: None,
        timestamp_writes: None,
        occlusion_query_set: None,
        multiview_mask: None,
    })
}
