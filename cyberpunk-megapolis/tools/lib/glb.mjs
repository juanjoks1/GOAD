/**
 * Minimal glTF 2.0 / GLB writer with KHR_draco_mesh_compression, skins and
 * animation support. Used only by the offline generators in tools/ -- the game
 * itself ships the produced .glb files and never needs this file.
 *
 * Geometry is written as a single binary chunk. Materials carry names only:
 * the runtime rebuilds real materials from data/materials.json so colour
 * spaces and Unity MetallicSmoothness packing stay under our control.
 */
import draco3d from 'draco3d';

const CT = { F32: 5126, U32: 5125, U16: 5123, U8: 5121 };
const TYPE_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

let encoderModule = null;
export async function initDraco() {
  if (!encoderModule) encoderModule = await draco3d.createEncoderModule({});
  return encoderModule;
}

function align4(n) { return (n + 3) & ~3; }

export class GLB {
  constructor({ generator = 'cyberpunk-megapolis asset generator' } = {}) {
    this.json = {
      asset: { version: '2.0', generator },
      scene: 0,
      scenes: [{ nodes: [] }],
      nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [],
      buffers: [], skins: [], animations: [],
    };
    this.chunks = [];      // {buf, offset}
    this.byteLength = 0;
    this.materialIndex = new Map();
    this.usesDraco = false;
  }

  /* ---------------------------------------------------------------- buffers */
  _pushBuffer(view) {
    const buf = Buffer.from(view.buffer, view.byteOffset, view.byteLength);
    const offset = this.byteLength;
    this.chunks.push({ buf, offset });
    this.byteLength = align4(offset + buf.length);
    return { offset, length: buf.length };
  }

  _bufferView(view, target) {
    const { offset, length } = this._pushBuffer(view);
    const bv = { buffer: 0, byteOffset: offset, byteLength: length };
    if (target) bv.target = target;
    this.json.bufferViews.push(bv);
    return this.json.bufferViews.length - 1;
  }

  _accessor(view, type, componentType, count, { min, max, normalized, target } = {}) {
    const acc = {
      bufferView: this._bufferView(view, target),
      componentType, count, type,
    };
    if (min) acc.min = min;
    if (max) acc.max = max;
    if (normalized) acc.normalized = true;
    this.json.accessors.push(acc);
    return this.json.accessors.length - 1;
  }

  /** accessor with no bufferView, used for Draco-compressed attributes */
  _virtualAccessor(type, componentType, count, { min, max, normalized } = {}) {
    const acc = { componentType, count, type };
    if (min) acc.min = min;
    if (max) acc.max = max;
    if (normalized) acc.normalized = true;
    this.json.accessors.push(acc);
    return this.json.accessors.length - 1;
  }

  /* -------------------------------------------------------------- materials */
  material(name, extras) {
    if (this.materialIndex.has(name)) return this.materialIndex.get(name);
    const def = { name, pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 }, doubleSided: false };
    if (extras) def.extras = extras;
    this.json.materials.push(def);
    const i = this.json.materials.length - 1;
    this.materialIndex.set(name, i);
    return i;
  }

  /* ------------------------------------------------------------------ draco */
  _encodeDraco(prim) {
    const e = encoderModule;
    const numPointsIn = prim.position.length / 3;
    for (const [k, arr] of Object.entries(prim)) {
      if (!arr || !arr.length || typeof arr === 'string') continue;
      for (let i = 0; i < arr.length; i++) {
        if (!Number.isFinite(arr[i])) throw new Error(`non-finite value in ${k}[${i}] (material ${prim.material})`);
      }
    }
    for (let i = 0; i < prim.index.length; i++) {
      if (prim.index[i] >= numPointsIn) throw new Error(`index out of range in ${prim.material}: ${prim.index[i]} >= ${numPointsIn}`);
    }
    const builder = new e.MeshBuilder();
    const mesh = new e.Mesh();
    const numPoints = prim.position.length / 3;
    const attrIds = {};
    attrIds.POSITION = builder.AddFloatAttributeToMesh(mesh, e.POSITION, numPoints, 3, prim.position);
    if (prim.normal) attrIds.NORMAL = builder.AddFloatAttributeToMesh(mesh, e.NORMAL, numPoints, 3, prim.normal);
    if (prim.uv) attrIds.TEXCOORD_0 = builder.AddFloatAttributeToMesh(mesh, e.TEX_COORD, numPoints, 2, prim.uv);
    if (prim.joints) attrIds.JOINTS_0 = builder.AddUInt16Attribute(mesh, e.GENERIC, numPoints, 4, prim.joints);
    if (prim.weights) attrIds.WEIGHTS_0 = builder.AddFloatAttributeToMesh(mesh, e.GENERIC, numPoints, 4, prim.weights);
    builder.AddFacesToMesh(mesh, prim.index.length / 3, prim.index);

    const encoder = new e.Encoder();
    encoder.SetSpeedOptions(3, 3);
    encoder.SetAttributeQuantization(e.POSITION, prim.joints ? 16 : 14);
    encoder.SetAttributeQuantization(e.NORMAL, 10);
    encoder.SetAttributeQuantization(e.TEX_COORD, 16); // UVs are baked in metres, so they need the extra bits
    // joints must survive bit-exact; weights tolerate 16 bits
    if (prim.joints || prim.weights) encoder.SetAttributeQuantization(e.GENERIC, 16);
    encoder.SetTrackEncodedProperties(true);
    const out = new e.DracoInt8Array();
    const len = encoder.EncodeMeshToDracoBuffer(mesh, out);
    if (len <= 0) throw new Error('Draco encoding failed');
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = out.GetValue(i);
    const encodedPoints = encoder.GetNumberOfEncodedPoints();
    const encodedFaces = encoder.GetNumberOfEncodedFaces();
    e.destroy(out); e.destroy(encoder); e.destroy(mesh); e.destroy(builder);
    this.usesDraco = true;
    return { bytes, attrIds, encodedPoints, encodedFaces };
  }

  /* ------------------------------------------------------------------- mesh */
  /**
   * prims: [{ position:Float32Array, normal, uv, joints:Uint16Array,
   *           weights:Float32Array, index:Uint32Array, material:'name' }]
   */
  mesh(name, prims, { draco = false } = {}) {
    const primitives = prims.map((p) => {
      const numPoints = p.position.length / 3;
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < numPoints; i++) {
        for (let c = 0; c < 3; c++) {
          const v = p.position[i * 3 + c];
          if (v < min[c]) min[c] = v;
          if (v > max[c]) max[c] = v;
        }
      }
      const out = { attributes: {}, mode: 4 };
      if (p.material != null) out.material = this.material(p.material);

      if (draco) {
        const { bytes, attrIds, encodedPoints, encodedFaces } = this._encodeDraco(p);
        const n = encodedPoints || numPoints;
        out.attributes.POSITION = this._virtualAccessor('VEC3', CT.F32, n, { min, max });
        if (p.normal) out.attributes.NORMAL = this._virtualAccessor('VEC3', CT.F32, n);
        if (p.uv) out.attributes.TEXCOORD_0 = this._virtualAccessor('VEC2', CT.F32, n);
        if (p.joints) out.attributes.JOINTS_0 = this._virtualAccessor('VEC4', CT.U16, n);
        if (p.weights) out.attributes.WEIGHTS_0 = this._virtualAccessor('VEC4', CT.F32, n);
        out.indices = this._virtualAccessor('SCALAR', CT.U32, (encodedFaces || p.index.length / 3) * 3);
        out.extensions = {
          KHR_draco_mesh_compression: {
            bufferView: this._bufferView(bytes),
            attributes: attrIds,
          },
        };
      } else {
        out.attributes.POSITION = this._accessor(p.position, 'VEC3', CT.F32, numPoints, { min, max, target: 34962 });
        if (p.normal) out.attributes.NORMAL = this._accessor(p.normal, 'VEC3', CT.F32, numPoints, { target: 34962 });
        if (p.uv) out.attributes.TEXCOORD_0 = this._accessor(p.uv, 'VEC2', CT.F32, numPoints, { target: 34962 });
        if (p.joints) out.attributes.JOINTS_0 = this._accessor(p.joints, 'VEC4', CT.U16, numPoints, { target: 34962 });
        if (p.weights) out.attributes.WEIGHTS_0 = this._accessor(p.weights, 'VEC4', CT.F32, numPoints, { target: 34962 });
        out.indices = this._accessor(p.index, 'SCALAR', CT.U32, p.index.length, { target: 34963 });
      }
      return out;
    });
    this.json.meshes.push({ name, primitives });
    return this.json.meshes.length - 1;
  }

  /* ------------------------------------------------------------------- node */
  node({ name, mesh, skin, translation, rotation, scale, children }) {
    const n = {};
    if (name) n.name = name;
    if (mesh != null) n.mesh = mesh;
    if (skin != null) n.skin = skin;
    if (translation) n.translation = Array.from(translation);
    if (rotation) n.rotation = Array.from(rotation);
    if (scale) n.scale = Array.from(scale);
    if (children && children.length) n.children = children;
    this.json.nodes.push(n);
    return this.json.nodes.length - 1;
  }

  setNodeChildren(index, children) { this.json.nodes[index].children = children; }

  skin(joints, inverseBindMatrices, skeleton) {
    const acc = this._accessor(inverseBindMatrices, 'MAT4', CT.F32, joints.length);
    const s = { joints, inverseBindMatrices: acc };
    if (skeleton != null) s.skeleton = skeleton;
    this.json.skins.push(s);
    return this.json.skins.length - 1;
  }

  /**
   * channels: [{ node, path:'translation'|'rotation'|'scale',
   *              times:Float32Array, values:Float32Array }]
   */
  animation(name, channels) {
    const samplers = [], chans = [];
    for (const ch of channels) {
      const tAcc = this._accessor(ch.times, 'SCALAR', CT.F32, ch.times.length,
        { min: [ch.times[0]], max: [ch.times[ch.times.length - 1]] });
      const comps = ch.path === 'rotation' ? 4 : 3;
      const vAcc = this._accessor(ch.values, comps === 4 ? 'VEC4' : 'VEC3', CT.F32, ch.values.length / comps);
      samplers.push({ input: tAcc, output: vAcc, interpolation: 'LINEAR' });
      chans.push({ sampler: samplers.length - 1, target: { node: ch.node, path: ch.path } });
    }
    this.json.animations.push({ name, samplers, channels: chans });
    return this.json.animations.length - 1;
  }

  sceneNodes(nodes) { this.json.scenes[0].nodes = nodes; }

  /* ------------------------------------------------------------------ write */
  toBuffer() {
    const json = this.json;
    for (const key of ['skins', 'animations', 'materials']) if (!json[key].length) delete json[key];
    if (this.usesDraco) {
      json.extensionsRequired = ['KHR_draco_mesh_compression'];
      json.extensionsUsed = ['KHR_draco_mesh_compression'];
    }
    const bin = Buffer.alloc(this.byteLength);
    for (const c of this.chunks) c.buf.copy(bin, c.offset);
    json.buffers = [{ byteLength: bin.length }];

    let jsonText = JSON.stringify(json);
    while (jsonText.length % 4 !== 0) jsonText += ' ';
    const jsonBuf = Buffer.from(jsonText, 'utf8');

    const total = 12 + 8 + jsonBuf.length + (bin.length ? 8 + bin.length : 0);
    const glb = Buffer.alloc(total);
    let o = 0;
    glb.write('glTF', o, 'ascii'); o += 4;
    glb.writeUInt32LE(2, o); o += 4;
    glb.writeUInt32LE(total, o); o += 4;
    glb.writeUInt32LE(jsonBuf.length, o); o += 4;
    glb.write('JSON', o, 'ascii'); o += 4;
    jsonBuf.copy(glb, o); o += jsonBuf.length;
    if (bin.length) {
      glb.writeUInt32LE(bin.length, o); o += 4;
      glb.write('BIN\0', o, 'ascii'); o += 4;
      bin.copy(glb, o);
    }
    return glb;
  }
}
