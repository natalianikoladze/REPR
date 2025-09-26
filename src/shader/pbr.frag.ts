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
float roughness = 0.1;

// From three.js
vec4 sRGBToLinear( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}

// From three.js
vec4 LinearTosRGB( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}

float FresnelSchlick(float f0, vec3 w_i, vec3 w_o) {
  return f0 + (1.0 - f0) * 1.0 - pow(1.0 - clamp(dot(w_o, w_i), 0.0, 1.0), 5.0);
}

float normal_distrib(vec3 w_o, vec3 w_i) {
  vec3 h = normalize((w_i + w_o) / length(w_i + w_o));
  float num = pow(roughness, 2.0);
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
  float k = pow((roughness + 1.0), 2.0) / 8.0;
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
    float f0 = 0.04;
    float metallic = 0.1;

    float kS = FresnelSchlick(f0, w_i, w_o);
    float kD = (1.0 - kS) * (1.0 - metallic);
    vec3 diffuseBRDFEval = kD * brdf_diffuse(albedo);
    float specularBRDFEval = kS * brdf_specular(w_o, w_i);

    irradiance += (diffuseBRDFEval + specularBRDFEval) * uLights[i].color * uLights[i].intensity * clamp(dot(vNormalWS, w_i), 0.0, 1.0);
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
