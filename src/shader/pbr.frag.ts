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
  float roughness;
  float metallic;
};
uniform Material uMaterial;

uniform bool ibl;

uniform sampler2D uTextureDiffuse;
uniform sampler2D uTextureSpecular;
uniform sampler2D uTexturePreInt;

struct Light
{
  vec3 color;
  float intensity;
  vec3 position;
};
uniform Light uLights[10]; // 10 = max number of lights

uniform int NB_LIGHTS;

float PI = 3.141592654;
/*
float uMaterial.roughness = 0.5;
float uMaterial.metallic = 0.5;
*/
vec3 RGBMDecode(vec4 rgbm) {
  return 6.0 * rgbm.rgb * rgbm.a;
}

vec2 cartesianToSpherical(vec3 cartesian) {
    // Compute azimuthal angle, in [-PI, PI]
    float phi = atan(cartesian.z, cartesian.x);
    // Compute polar angle, in [-PI/2, PI/2]
    float theta = asin(cartesian.y);
    return vec2(phi, theta);
}

// From three.js
vec4 sRGBToLinear( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}

// From three.js
vec4 LinearTosRGB( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}

vec3 FresnelSchlick(vec3 f0, vec3 w_i, vec3 w_o) {
  vec3 h = normalize(w_i + w_o);
  return f0 + (1.0 - f0) * pow(1.0 - clamp(dot(w_o, h), 0.0, 1.0), 5.0);
}

float normal_distrib(vec3 w_o, vec3 w_i) {
  vec3 h = normalize(w_i + w_o);
  float num = pow(max(uMaterial.roughness, 0.01), 2.0);
  float denom = PI * pow(pow(clamp(dot(vNormalWS, h), 0.0, 1.0), 2.0) * (num - 1.0) + 1.0, 2.0);
  float D = num / denom;
  return D;
}

float GSchlick(vec3 w, float k) {
  float num = clamp(dot(vNormalWS, w), 0.0, 1.0);
  float denom = num * (1.0 - k) + k;
  return num / denom;
}

float geometric(vec3 w_o, vec3 w_i) {
  float k = pow((uMaterial.roughness + 1.0), 2.0) / 8.0;
  float shadowing = GSchlick(w_i, k);
  float obstruction = GSchlick(w_o, k);
  return shadowing * obstruction;
}

vec3 brdf_diffuse(vec3 albedo) {
  return albedo / PI;
}

float brdf_specular(vec3 w_o, vec3 w_i) {
  float D = normal_distrib(w_o, w_i);
  float G = geometric(w_o, w_i);
  float num = D * G;
  float denom = 4.0 * clamp(dot(w_o, vNormalWS), 0.0, 1.0) * clamp(dot(w_i, vNormalWS), 0.0, 1.0);
  if (denom == 0.0) {
    return denom = 0.0001;
  }
  return num / denom;
}

vec2 ToUV(vec3 coords) {
  vec2 spherical = cartesianToSpherical(coords);
  float u = ((spherical.x) / (PI * 2.0)) + 0.5;
  float v = ((spherical.y) / PI) + 0.5;
  return vec2(u, v);
}

vec2 ComputeUVFromRoughness(vec3 reflected) {
  float u = uMaterial.roughness;
  float v = dot(vNormalWS, reflected);
  return vec2(u, v);
}

void main()
{
  // **DO NOT** forget to do all your computation in linear space.
  vec3 albedo = sRGBToLinear(vec4(uMaterial.albedo, 1.0)).rgb;
  // dielectrics: f0 = 0.04
  vec3 f0 = vec3(0.04);
  f0 = mix(f0, albedo, uMaterial.metallic);

  vec3 irradiance = vec3(0.0);
  vec3 w_o = vViewDirectionWS;
  for (int i = 0; i < NB_LIGHTS; ++i) {
    // clean version (follows pseudo code)
    vec3 w_i = normalize(uLights[i].position - vPositionWS.xyz);

    vec3 kS = FresnelSchlick(f0, w_i, w_o);
    vec3 kD = (1.0 - kS) * (1.0 - uMaterial.metallic);
    vec3 diffuseBRDFEval = kD * brdf_diffuse(albedo);
    vec3 specularBRDFEval = kS * brdf_specular(w_o, w_i);
    vec3 in_radiance = uLights[i].color * uLights[i].intensity / (pow(length(uLights[i].position - vPositionWS.xyz), 2.0) + 0.001);

    irradiance += (diffuseBRDFEval + specularBRDFEval) * in_radiance * clamp(dot(vNormalWS, w_i), 0.0, 1.0);
  }
  vec3 kS = FresnelSchlick(f0, vNormalWS, w_o);
  vec3 kD = (1.0 - kS) * (1.0 - uMaterial.metallic);
  vec3 diffuseIBL = kD * albedo * RGBMDecode(texture(uTextureDiffuse, ToUV(vNormalWS)));

  vec3 reflected = reflect(w_o, vNormalWS);
  vec2 uv = ComputeUVFromRoughness(reflected);
  vec3 specularIBL = RGBMDecode(texture(uTextureSpecular, uv));

  vec2 brdf = texture(uTexturePreInt, vec2(dot(vNormalWS, w_o), uMaterial.roughness)).xy;
  vec3 specularBRDF = specularIBL * (kS * brdf.r + brdf.g);

  vec3 gi = diffuseIBL + specularBRDF;

  if (ibl) {
    irradiance = gi;
  }

  // **DO NOT** forget to apply gamma correction as last step.
  outFragColor.rgba = vec4(irradiance, 1.0);
  // Reinhard
  outFragColor.rgb = outFragColor.rgb / (vec3(1.0) + outFragColor.rgb);
  // gamma correction
  outFragColor.rgba = LinearTosRGB(outFragColor.rgba);
}
`;
