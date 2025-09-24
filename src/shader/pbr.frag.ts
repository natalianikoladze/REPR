export default `
precision highp float;

in vec3 vNormalWS;

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

void main()
{
  vec3 irradiance = vec3(0.0);
  for (int i = 0; i < NB_LIGHTS; ++i) {
    // clean version (follows pseudo code)
    vec3 w_i = uLights[i].position - vPositionWS.xyz;
    vec3 w_o = normalize(w_i + vViewDirectionWS);
    // dielectrics: f0 = 0.4
    vec3 f0 = vec3(0.04);
    vec3 kS = FresnelSchlick(f0, w_i, w_o);

    vec3 ray = uLights[i].position - vPositionWS.xyz;
    vec3 color = clamp(dot(vNormalWS, ray), 0.0, 1.0) * uLights[i].color;
    irradiance += color * uLights[i].intensity;
  }
  // **DO NOT** forget to do all your computation in linear space.
  vec3 albedo = sRGBToLinear(vec4(uMaterial.albedo, 1.0)).rgb;

  // **DO NOT** forget to apply gamma correction as last step.
  outFragColor.rgba = LinearTosRGB(vec4(albedo * irradiance, 1.0));
  // Reinhard
  outFragColor.rgb = outFragColor.rgb / (1.0 + outFragColor.rgb);
}
`;
