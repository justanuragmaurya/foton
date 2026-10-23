// Composites one layer over the backdrop. Colours are sRGB-encoded and premultiplied,
// and blending happens in that space, matching the behaviour users expect from 8-bit documents.
// Formulas follow the W3C Compositing and Blending Level 1 spec.

struct Layer {
    color: vec4<f32>,   // straight alpha
    bounds: vec4<f32>,  // x, y, width, height in document pixels
    opacity: f32,
    mode: u32,
}

@group(0) @binding(0) var backdrop: texture_2d<f32>;
@group(0) @binding(1) var<uniform> layer: Layer;

@vertex
fn vs_main(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let uv = vec2<f32>(f32((i << 1u) & 2u), f32(i & 2u));
    return vec4<f32>(uv * 2.0 - 1.0, 0.0, 1.0);
}

fn soft_light_d(cb: f32) -> f32 {
    if cb <= 0.25 {
        return ((16.0 * cb - 12.0) * cb + 4.0) * cb;
    }
    return sqrt(cb);
}

fn hard_light(cb: f32, cs: f32) -> f32 {
    if cs <= 0.5 {
        return cb * 2.0 * cs;
    }
    let s = 2.0 * cs - 1.0;
    return cb + s - cb * s;
}

fn blend_channel(cb: f32, cs: f32, mode: u32) -> f32 {
    switch mode {
        case 1u: { return cb * cs; }
        case 2u: { return cb + cs - cb * cs; }
        case 3u: { return hard_light(cs, cb); }
        case 4u: { return min(cb, cs); }
        case 5u: { return max(cb, cs); }
        case 6u: {
            if cb <= 0.0 { return 0.0; }
            if cs >= 1.0 { return 1.0; }
            return min(1.0, cb / (1.0 - cs));
        }
        case 7u: {
            if cb >= 1.0 { return 1.0; }
            if cs <= 0.0 { return 0.0; }
            return 1.0 - min(1.0, (1.0 - cb) / cs);
        }
        case 8u: { return hard_light(cb, cs); }
        case 9u: {
            if cs <= 0.5 {
                return cb - (1.0 - 2.0 * cs) * cb * (1.0 - cb);
            }
            return cb + (2.0 * cs - 1.0) * (soft_light_d(cb) - cb);
        }
        case 10u: { return abs(cb - cs); }
        case 11u: { return cb + cs - 2.0 * cb * cs; }
        default: { return cs; }
    }
}

@fragment
fn fs_main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let b = textureLoad(backdrop, vec2<i32>(pos.xy), 0);
    let lo = layer.bounds.xy;
    let hi = lo + layer.bounds.zw;
    let inside = all(pos.xy >= lo) && all(pos.xy < hi);
    let a_s = select(0.0, layer.color.a * layer.opacity, inside);
    if a_s <= 0.0 {
        return b;
    }

    let a_b = b.a;
    let cb = select(vec3<f32>(0.0), b.rgb / a_b, a_b > 0.0);
    let cs = layer.color.rgb;
    let blended = vec3<f32>(
        blend_channel(cb.r, cs.r, layer.mode),
        blend_channel(cb.g, cs.g, layer.mode),
        blend_channel(cb.b, cs.b, layer.mode),
    );
    let mixed = (1.0 - a_b) * cs + a_b * clamp(blended, vec3<f32>(0.0), vec3<f32>(1.0));
    return vec4<f32>(a_s * mixed + (1.0 - a_s) * b.rgb, a_s + a_b * (1.0 - a_s));
}
