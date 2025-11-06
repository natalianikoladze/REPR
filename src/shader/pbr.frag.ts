export default `
precision highp float;

in vec3 vNormalWS;

in vec3 vViewDirectionWS;

in vec4 vPositionWS;

in vec2 vUv;

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

uniform bool specular;
uniform bool ibl;

uniform sampler2D uTextureDiffuse;
uniform sampler2D uTextureSpecular;
uniform sampler2D uTexturePreInt;

uniform bool textured;
uniform sampler2D uTexBaseColor;
uniform sampler2D uTexMetallic;
uniform sampler2D uTexNormal;
uniform sampler2D uTexRoughness;
// when using a texture, we should use the provided normal, roughness and metallicness maps,
// but we keep the option to set them ourselves (because it looks better)
uniform bool useTextureParams;

struct Light
{
  vec3 color;
  float intensity;
  vec3 position;
};
uniform Light uLights[10]; // 10 = max number of lights

uniform bool oneLight;

uniform int NB_LIGHTS;

float PI = 3.141592654;

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

float normal_distrib(vec3 w_o, vec3 w_i, float roughness, vec3 normal) {
  vec3 h = normalize(w_i + w_o);
  float num = max(roughness, 0.01) * max(roughness, 0.01);
  float t1 = max(dot(vNormalWS, h), 0.0) * max(dot(normal, h), 0.0);
  float t2 = num - 1.0;
  float t = t1 * t2 + 1.0;
  float denom = PI * t * t;
  float D = num / denom;
  return D;
}

float GSchlick(vec3 w, float k, vec3 normal) {
  float num = max(dot(normal, w), 0.0);
  float denom = max(num * (1.0 - k) + k, 0.001);
  return num / denom;
}

float geometric(vec3 w_o, vec3 w_i, float roughness, vec3 normal) {
  float k = pow((max(roughness, 0.001) + 1.0), 2.0) / 8.0;
  float shadowing = GSchlick(w_i, k, normal);
  float obstruction = GSchlick(w_o, k, normal);
  return shadowing * obstruction;
}

vec3 brdf_diffuse(vec3 albedo) {
  return albedo / PI;
}

vec3 brdf_specular(vec3 f0, vec3 w_o, vec3 w_i, float roughness, vec3 normal) {
  vec3 F = FresnelSchlick(f0, w_o, w_i);
  float D = normal_distrib(w_o, w_i, roughness, normal);
  float G = geometric(w_o, w_i, roughness, normal);
  vec3 num = D * G * F;
  float denom = 4.0 * max(dot(w_o, normal), 0.0) * max(dot(w_i, normal), 0.0);
  return num / max(denom, 0.0001);
}

vec2 ToUV(vec3 coords) {
  vec2 spherical = cartesianToSpherical(coords);
  float u = ((spherical.x) / (PI * 2.0)) + 0.5;
  float v = ((spherical.y) / PI) + 0.5;
  return vec2(u, v);
}

vec2 ComputeUVFromRoughness(vec3 reflected, float lod) {
  vec2 uv = ToUV(reflected);
  uv.x = uv.x / (lod + 1.0);
  uv.y = (1.0 - uv.y) / (lod + 1.0);
  return uv;
}

void main()
{
  // **DO NOT** forget to do all your computation in linear space.
  vec3 albedo = sRGBToLinear(vec4(uMaterial.albedo, 1.0)).rgb;
  vec3 normal = normalize(vNormalWS);
  float metallic = uMaterial.metallic;
  float roughness = uMaterial.roughness;
  if (textured) {
    albedo = sRGBToLinear(texture(uTexBaseColor, vUv) * vec4(uMaterial.albedo, 1.0)).rgb;
    if (useTextureParams) {
      normal = normalize(texture(uTexNormal, vUv).rgb);
      metallic = clamp(texture(uTexMetallic, vUv).r, 0.0, 1.0);
      roughness = clamp(texture(uTexRoughness, vUv).r, 0.0, 1.0);
    }
  }
  // dielectrics: f0 = 0.04
  vec3 f0 = vec3(0.04);
  if (textured) {
    // iron: f0 = 0.55
    f0 = vec3(0.55);
  }
  f0 = mix(f0, albedo, metallic);

  vec3 irradiance = vec3(0.0);
  vec3 w_o = normalize(vViewDirectionWS);
  for (int i = 0; i < NB_LIGHTS; ++i) {
    // clean version (follows pseudo code)
    vec3 w_i = normalize(uLights[i].position - vPositionWS.xyz);

    vec3 kS = FresnelSchlick(f0, w_i, w_o);
    vec3 kD = (1.0 - kS) * (1.0 - metallic);
    vec3 diffuseBRDFEval = kD * brdf_diffuse(albedo);
    vec3 specularBRDFEval = brdf_specular(f0, w_o, w_i, roughness, normal);
    float dist = max(length(uLights[i].position - vPositionWS.xyz), 0.0001);
    vec3 in_radiance = (uLights[i].color * uLights[i].intensity * clamp(dot(normal, w_i), 0.0, 1.0)) / (dist * dist + 0.001);

    vec3 brdf = diffuseBRDFEval;
    if (specular) {
      brdf += specularBRDFEval;
    }
    irradiance += brdf * in_radiance;
    if (oneLight) {
      break;
    }
  }
  vec3 kS = FresnelSchlick(f0, normal, w_o);
  vec3 kD = (vec3(1.0) - kS) * (1.0 - metallic);
  vec3 diffuseIBL = kD * albedo * RGBMDecode(texture(uTextureDiffuse, ToUV(normal)));

  vec3 reflected = reflect(w_o, normal);
  float lod = roughness * 4.0;
  vec3 specularIBL = RGBMDecode(texture(uTextureSpecular, ComputeUVFromRoughness(reflected, lod)));

  vec2 brdf = texture(uTexturePreInt, vec2(clamp(dot(vNormalWS, w_o), 0.0, 1.0), roughness)).xy;
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
