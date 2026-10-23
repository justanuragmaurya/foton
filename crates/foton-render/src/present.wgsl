// Draws the composited document into the viewport: pasteboard, transparency checkerboard,
// then the document pixels under the current zoom/pan.

struct View {
    doc_size: vec2<f32>,
    origin: vec2<f32>,  // screen position of the document's top-left, in physical pixels
    zoom: f32,
    srgb_target: u32,   // 1 when the surface encodes to sRGB itself
}

@group(0) @binding(0) var composite: texture_2d<f32>;
@group(0) @binding(1) var<uniform> view: View;

const PASTEBOARD = vec3<f32>(0.157, 0.157, 0.157);
const CHECKER_LIGHT = 1.0;
const CHECKER_DARK = 0.8;
const CHECKER_CELL = 8.0;

@vertex
fn vs_main(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let uv = vec2<f32>(f32((i << 1u) & 2u), f32(i & 2u));
    return vec4<f32>(uv * 2.0 - 1.0, 0.0, 1.0);
}

fn srgb_to_linear(c: vec3<f32>) -> vec3<f32> {
    let lo = c / 12.92;
    let hi = pow((c + 0.055) / 1.055, vec3<f32>(2.4));
    return select(hi, lo, c <= vec3<f32>(0.04045));
}

@fragment
fn fs_main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let doc = (pos.xy - view.origin) / view.zoom;
    var rgb = PASTEBOARD;
    if all(doc >= vec2<f32>(0.0)) && all(doc < view.doc_size) {
        let cell = floor((pos.xy - view.origin) / CHECKER_CELL);
        let checker = select(CHECKER_DARK, CHECKER_LIGHT, (i32(cell.x + cell.y) & 1) == 0);
        let c = textureLoad(composite, vec2<i32>(floor(doc)), 0);
        rgb = c.rgb + vec3<f32>(checker) * (1.0 - c.a);
    }
    if view.srgb_target == 1u {
        rgb = srgb_to_linear(rgb);
    }
    return vec4<f32>(rgb, 1.0);
}
