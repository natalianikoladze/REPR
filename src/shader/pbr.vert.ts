export default `

precision highp float;

// Attributes (vertex shader inputs)
in vec3 in_position;
in vec3 in_normal;
#ifdef USE_UV
  in vec2 in_uv;
#endif

// Varyings (vertex shader outputs)
out vec3 vNormalWS;
out vec3 vViewDirectionWS;
out vec4 vPositionWS;
#ifdef USE_UV
  out vec2 vUv;
#endif

// Uniforms
struct Camera
{
  mat4 WS_to_CS; // World-Space to Clip-Space (view * proj)
  vec3 position;
};
uniform Camera uCamera;

struct Model
{
  mat4 LS_to_WS; // Local-Space to World-Space
};
uniform Model uModel;

void main() {
  vNormalWS = normalize(in_normal);
  vec4 positionLocal = vec4(in_position, 1.0);
  vPositionWS = uCamera.WS_to_CS * uModel.LS_to_WS * positionLocal;
  gl_Position = uCamera.WS_to_CS * uModel.LS_to_WS * positionLocal;
  vViewDirectionWS = normalize(uCamera.WS_to_CS * uModel.LS_to_WS * vec4(uCamera.position, 1.0) - gl_Position).xyz;
}
`;
