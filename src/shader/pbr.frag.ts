export default `
precision highp float;

in vec3 vNormalWS;

in vec3 vViewDirectionWS;

in vec4 vPositionWS;

// Fragment shader output
out vec4 outFragColor;

// Uniforms
struct Material
{
  vec3 albedo;
};
uniform Material uMaterial;

struct Light
{
  vec3 color;
  float intensity;
  vec3 position;
};
uniform Light uLights[10]; // 10 = max number of lights

uniform int NB_LIGHTS;

float PI = 3.141592654;
vec3 roughness = vec3(0.5);

// From three.js
vec4 sRGBToLinear( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}

// From three.js
vec4 LinearTosRGB( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}

vec3 FresnelSchlick(vec3 f0, vec3 w_i, vec3 w_o) {
  return f0 + (1.0 - f0) * pow(clamp(1.0 - dot(w_o, w_i), 0.0, 1.0), 5.0);
}

float norm(vec3 v) {
  return sqrt(pow(v.x + v.y + v.z, 2.0));
}

vec3 normal_distrib(vec3 w_o, vec3 w_i) {
  vec3 h = (w_i + w_o) / norm(w_i + w_o);
  vec3 num = pow(roughness, vec3(2.0));
  vec3 denom = PI * pow(pow(dot(vNormalWS, h), 2.0) * (num - 1.0) + 1.0, vec3(2.0));
  vec3 D = num / denom;
  return D;
}

vec3 GSchlick(vec3 w, vec3 k) {
  float num = dot(vNormalWS, w);
  vec3 denom = num * (1.0 - k) + k;
  return num / denom;
}

vec3 geometric(vec3 w_o, vec3 w_i) {
  vec3 k = pow((roughness + 1.0), vec3(2.0)) / 8.0;
  vec3 shadowing = GSchlick(w_i, k);
  vec3 obstruction = GSchlick(w_i, k);
  return shadowing * obstruction;
}

vec3 brdf_diffuse(vec3 albedo) {
  return albedo / 3.141592654;
}

vec3 brdf_specular(vec3 w_o, vec3 w_i) {
  vec3 D = normalize(normal_distrib(w_o, w_i));
  vec3 G = normalize(geometric(w_o, w_i));
  vec3 num = D;
  float denom = 4.0 * dot(w_o, vNormalWS) * dot(w_i, vNormalWS);
  return num / denom;
}

void main()
{
  // **DO NOT** forget to do all your computation in linear space.
  vec3 albedo = sRGBToLinear(vec4(uMaterial.albedo, 1.0)).rgb;

  vec3 irradiance = vec3(0.0);
  for (int i = 0; i < NB_LIGHTS; ++i) {
    // clean version (follows pseudo code)
    vec3 w_i = normalize(uLights[i].position - vPositionWS.xyz);
    vec3 w_o = normalize(w_i + vViewDirectionWS);
    // dielectrics: f0 = 0.4
    vec3 f0 = vec3(0.04);
    vec3 metallic = vec3(0.5);

    vec3 kS = FresnelSchlick(f0, w_i, w_o);
    vec3 kD = (1.0 - kS) * (1.0 - metallic);
    vec3 diffuseBRDFEval = kD * brdf_diffuse(albedo);
    vec3 specularBRDFEval = kS * brdf_specular(w_o, w_i);

    irradiance += 0.2 + (diffuseBRDFEval + specularBRDFEval) * uLights[i].color * uLights[i].intensity * max(dot(vNormalWS, w_i), 0.0);
    /*
    vec3 ray = uLights[i].position - vPositionWS.xyz;
    vec3 color = clamp(dot(vNormalWS, ray), 0.0, 1.0) * uLights[i].color;
    irradiance += color * uLights[i].intensity;
    */
  }
  // **DO NOT** forget to apply gamma correction as last step.
  outFragColor.rgba = LinearTosRGB(vec4(albedo * irradiance, 1.0));
  // Reinhard
  outFragColor.rgb = outFragColor.rgb / (1.0 + outFragColor.rgb);
}
`;
